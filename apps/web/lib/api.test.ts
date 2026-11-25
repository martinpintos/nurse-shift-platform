import { CREDENTIAL_FILE_FIELD, ERROR_MESSAGES } from "@repo/shared";
import { describe, expect, it, vi } from "vitest";
import { errorResponse, jsonResponse, mockApi } from "../test/fetch-mock";
import { credential, seedShifts, shift1, shift2 } from "../test/fixtures";
import {
  ApiError,
  GENERIC_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  UNEXPECTED_RESPONSE_MESSAGE,
  createApiClient,
} from "./api";

function client(token: string | null = "token-123") {
  const onUnauthorized = vi.fn();
  const api = createApiClient({ getToken: () => token, onUnauthorized });
  return { api, onUnauthorized };
}

async function rejection(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => {
      throw new Error("expected the call to reject");
    },
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(ApiError);
  return error as ApiError;
}

describe("api client", () => {
  it("calls same-origin /api paths with the bearer token and parses the body", async () => {
    const mock = mockApi({ "GET /api/shifts": { shifts: seedShifts } });
    const { api } = client();

    await expect(api.listShifts()).resolves.toEqual({ shifts: seedShifts });

    const [call] = mock.calls;
    expect(call?.path).toBe("/api/shifts");
    expect(call?.headers.get("Authorization")).toBe("Bearer token-123");
  });

  it("fills route params from ROUTES and sends JSON bodies", async () => {
    const reopened = {
      ...shift2,
      status: "open",
      claimedBy: null,
      cancellation: { reason: "no-show", previousNurseId: "nurse-1" },
    };
    const mock = mockApi({ "POST /api/shifts/shift-2/cancel": reopened });
    const { api } = client();

    await expect(api.cancelShift("shift-2", "no-show")).resolves.toEqual(
      reopened,
    );
    expect(mock.calls[0]?.body).toEqual({ reason: "no-show" });
    expect(mock.calls[0]?.headers.get("Content-Type")).toBe("application/json");
  });

  it("rejects a success body that drifts from the contract (an extra field)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockApi({
      "GET /api/shifts": { shifts: [{ ...shift1, nurseName: "Maria Lopez" }] },
    });
    const { api } = client();

    const error = await rejection(api.listShifts());
    expect(error.status).toBe(200);
    expect(error.message).toBe(UNEXPECTED_RESPONSE_MESSAGE);
  });

  it("rejects a success body that isn't JSON", async () => {
    mockApi({
      "GET /api/shifts": () => new Response("<html>", { status: 200 }),
    });
    const { api } = client();

    expect((await rejection(api.listShifts())).message).toBe(
      UNEXPECTED_RESPONSE_MESSAGE,
    );
  });

  it("maps an { error } response into ApiError with the API's message verbatim", async () => {
    mockApi({
      "POST /api/shifts/shift-1/claim": () =>
        errorResponse(403, ERROR_MESSAGES.credentialExpired),
    });
    const { api, onUnauthorized } = client();

    const error = await rejection(api.claimShift("shift-1"));
    expect(error).toMatchObject({
      status: 403,
      message: "Credential expired, cannot claim shift",
    });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("falls back to a generic message when the error body isn't { error }", async () => {
    mockApi({
      "GET /api/shifts": () => new Response("Bad gateway", { status: 502 }),
      "GET /api/auth/me": () => jsonResponse({ message: "nope" }, 500),
    });
    const { api } = client();

    expect(await rejection(api.listShifts())).toMatchObject({
      status: 502,
      message: GENERIC_ERROR_MESSAGE,
    });
    expect(await rejection(api.me())).toMatchObject({
      status: 500,
      message: GENERIC_ERROR_MESSAGE,
    });
  });

  it("reports a network failure as status 0", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    const { api } = client();

    expect(await rejection(api.listShifts())).toMatchObject({
      status: 0,
      message: NETWORK_ERROR_MESSAGE,
    });
  });

  it("signals onUnauthorized on a 401 from an authenticated call", async () => {
    mockApi({
      "GET /api/shifts": () => errorResponse(401, ERROR_MESSAGES.invalidToken),
    });
    const { api, onUnauthorized } = client();

    expect((await rejection(api.listShifts())).status).toBe(401);
    expect(onUnauthorized).toHaveBeenCalledExactlyOnceWith(
      "Invalid or expired token",
    );
  });

  it("keeps login public: no token sent, and a 401 is just a failed login", async () => {
    const mock = mockApi({
      "POST /api/auth/login": () =>
        errorResponse(401, ERROR_MESSAGES.invalidCredentials),
    });
    const { api, onUnauthorized } = client();

    const error = await rejection(
      api.login({ email: "maria.lopez@example.com", password: "wrong" }),
    );
    expect(error.message).toBe("Invalid email or password");
    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(mock.calls[0]?.headers.has("Authorization")).toBe(false);
    expect(mock.calls[0]?.body).toEqual({
      email: "maria.lopez@example.com",
      password: "wrong",
    });
  });

  it("uploads a credential as multipart with the shared field name", async () => {
    const mock = mockApi({
      "POST /api/credentials": () => jsonResponse(credential, 201),
    });
    const { api } = client();
    const file = new File(["%PDF-1.7"], "rn-license.pdf", {
      type: "application/pdf",
    });

    await expect(api.uploadCredential(file, "2027-01-01")).resolves.toEqual(
      credential,
    );

    const body = mock.calls[0]?.body;
    expect(body).toBeInstanceOf(FormData);
    const form = body as FormData;
    expect((form.get(CREDENTIAL_FILE_FIELD) as File).name).toBe(
      "rn-license.pdf",
    );
    expect(form.get("expiresOn")).toBe("2027-01-01");
    // The browser must set the multipart boundary, so no explicit Content-Type.
    expect(mock.calls[0]?.headers.has("Content-Type")).toBe(false);
  });

  it("downloads the credential file as a Blob", async () => {
    mockApi({
      "GET /api/credentials/cred-1/file": () =>
        new Response("%PDF-1.7 sample", {
          status: 200,
          headers: { "Content-Type": "application/pdf" },
        }),
    });
    const { api } = client();

    const blob = await api.downloadCredential("cred-1");
    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBe("%PDF-1.7 sample".length);
  });

  it("URI-encodes path params", async () => {
    const mock = mockApi({});
    const { api } = client();

    await rejection(api.listAgencyShifts("agency a/../b"));
    expect(mock.calls[0]?.path).toBe(
      "/api/agencies/agency%20a%2F..%2Fb/shifts",
    );
  });
});
