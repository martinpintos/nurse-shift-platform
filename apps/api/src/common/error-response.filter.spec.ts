import {
  type ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  HttpException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ErrorResponseSchema } from "@repo/shared";
import {
  ErrorResponseFilter,
  toErrorResponse,
} from "./error-response.filter.js";

describe("toErrorResponse", () => {
  it("keeps the message and status of an HttpException", () => {
    expect(
      toErrorResponse(
        new ForbiddenException("Credential expired, cannot claim shift"),
      ),
    ).toEqual({
      status: 403,
      body: { error: "Credential expired, cannot claim shift" },
    });
  });

  it("flattens a list of validation messages into one string", () => {
    const { status, body } = toErrorResponse(
      new BadRequestException(["date is invalid", "role is invalid"]),
    );
    expect(status).toBe(400);
    expect(body).toEqual({ error: "date is invalid; role is invalid" });
  });

  it("handles a plain string response", () => {
    expect(toErrorResponse(new HttpException("Teapot", 418))).toEqual({
      status: 418,
      body: { error: "Teapot" },
    });
  });

  it("passes through intentional 5xx messages", () => {
    expect(
      toErrorResponse(new ServiceUnavailableException("Database unavailable"))
        .body,
    ).toEqual({
      error: "Database unavailable",
    });
  });

  it("hides the details of unknown errors behind a generic 500", () => {
    const { status, body } = toErrorResponse(
      new Error("connection string postgres://secret"),
    );
    expect(status).toBe(500);
    expect(body).toEqual({ error: "Internal server error" });
  });

  it("always produces a body that matches the contract", () => {
    for (const exception of [
      new NotFoundException(),
      new Error("x"),
      "thrown string",
      undefined,
    ]) {
      expect(
        ErrorResponseSchema.safeParse(toErrorResponse(exception).body).success,
      ).toBe(true);
    }
  });
});

describe("ErrorResponseFilter", () => {
  function hostWith(response: {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  }) {
    return {
      switchToHttp: () => ({ getResponse: () => response }),
    } as unknown as ArgumentsHost;
  }

  it("writes the status and { error } body to the response", () => {
    const response = { status: vi.fn(), json: vi.fn() };
    response.status.mockReturnValue(response);

    new ErrorResponseFilter().catch(
      new NotFoundException("Shift not found"),
      hostWith(response),
    );

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith({ error: "Shift not found" });
  });

  it("logs server errors but not client errors", () => {
    const logged = vi
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);
    const response = { status: vi.fn(), json: vi.fn() };
    response.status.mockReturnValue(response);
    const filter = new ErrorResponseFilter();

    filter.catch(new NotFoundException(), hostWith(response));
    expect(logged).not.toHaveBeenCalled();

    filter.catch(new Error("boom"), hostWith(response));
    expect(logged).toHaveBeenCalledOnce();
    logged.mockRestore();
  });
});
