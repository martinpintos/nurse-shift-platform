import {
  type ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  HttpException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { AuthenticationError, JwtError } from "@nestjs/authentication";
import { AuthorizationError } from "@nestjs/authorization";
import { ERROR_MESSAGES, ErrorResponseSchema } from "@repo/shared";
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

  it("maps the authentication guard's missing-credentials 401", () => {
    const exception = new UnauthorizedException(undefined, {
      errorCode: "missing_credentials",
    });
    expect(toErrorResponse(exception)).toEqual({
      status: 401,
      body: { error: ERROR_MESSAGES.authRequired },
    });
  });

  it("maps a token that failed verification to Invalid or expired token", () => {
    const exception = new UnauthorizedException("token expired", {
      cause: new JwtError("token expired"),
    });
    expect(toErrorResponse(exception)).toEqual({
      status: 401,
      body: { error: ERROR_MESSAGES.invalidToken },
    });
    expect(
      toErrorResponse(new AuthenticationError("unknown subject")).body,
    ).toEqual({
      error: ERROR_MESSAGES.invalidToken,
    });
  });

  it("maps an authorization denial to the forbidden message", () => {
    const exception = new ForbiddenException(undefined, {
      cause: new AuthorizationError("forbidden", "RolePolicy", "hasRole"),
    });
    expect(toErrorResponse(exception)).toEqual({
      status: 403,
      body: { error: ERROR_MESSAGES.forbidden },
    });
  });

  it("keeps the app's own 401 and 403 messages", () => {
    expect(
      toErrorResponse(
        new UnauthorizedException(ERROR_MESSAGES.invalidCredentials),
      ).body,
    ).toEqual({ error: ERROR_MESSAGES.invalidCredentials });
    expect(
      toErrorResponse(new ForbiddenException(ERROR_MESSAGES.notYourAgency))
        .body,
    ).toEqual({
      error: ERROR_MESSAGES.notYourAgency,
    });
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
