import {
  AdminShiftListResponseSchema,
  AgencyShiftListResponseSchema,
  AuditLogResponseSchema,
  CREDENTIAL_FILE_FIELD,
  CancelShiftResponseSchema,
  CredentialListResponseSchema,
  CredentialSchema,
  ErrorResponseSchema,
  LoginResponseSchema,
  MeResponseSchema,
  OutboxResponseSchema,
  ResetResponseSchema,
  ShiftListResponseSchema,
  ShiftSchema,
  TimesheetListResponseSchema,
  TimesheetSchema,
  routePath,
  type CancelReason,
  type CreateShiftRequest,
  type LoginRequest,
  type SubmitTimesheetRequest,
} from "@repo/shared";

/** Shown when an error response isn't the contract's `{ error }` shape. */
export const GENERIC_ERROR_MESSAGE = "Something went wrong, please try again";
/** Shown when the request never reached the API (offline, DNS, proxy down). */
export const NETWORK_ERROR_MESSAGE =
  "Could not reach ShiftPatch, check your connection";
/** Shown when a success body doesn't match its shared schema (contract drift). */
export const UNEXPECTED_RESPONSE_MESSAGE =
  "Unexpected response from the server";

/** Every failed call: the HTTP status (0 if there was no response) and a message to show. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** The message to put in the banner for anything a call threw. */
export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : GENERIC_ERROR_MESSAGE;
}

/** The part of a zod schema the client needs, so web doesn't depend on zod directly. */
interface ResponseSchema<T> {
  safeParse(
    data: unknown,
  ): { success: true; data: T } | { success: false; error: unknown };
}

export interface ApiClientOptions {
  /** The current session token, or null when signed out. */
  getToken: () => string | null;
  /** Called with the API's message when an authenticated call gets a 401. */
  onUnauthorized: (message: string) => void;
  fetch?: typeof fetch;
}

interface SendOptions {
  method: "GET" | "POST";
  json?: unknown;
  formData?: FormData;
  /** Defaults to true. Only login is public. */
  auth?: boolean;
  accept?: string;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const parsed = ErrorResponseSchema.safeParse(await response.json());
    if (parsed.success) return parsed.data.error;
  } catch {
    // Not JSON (a proxy error page, an empty body): fall through.
  }
  return GENERIC_ERROR_MESSAGE;
}

/**
 * Typed client for the ShiftPatch API. Same-origin (`/api/*` is rewritten to the API), paths
 * from `ROUTES`, and every success body parsed with its strict shared schema.
 */
export function createApiClient(options: ApiClientOptions) {
  const { getToken, onUnauthorized } = options;
  // Resolved per call, so a stubbed global fetch in tests is picked up.
  const doFetch: typeof fetch =
    options.fetch ?? ((input, init) => globalThis.fetch(input, init));

  async function send(path: string, opts: SendOptions): Promise<Response> {
    const auth = opts.auth ?? true;
    const headers = new Headers({ Accept: opts.accept ?? "application/json" });
    if (auth) {
      const token = getToken();
      if (token) headers.set("Authorization", `Bearer ${token}`);
    }
    let body: BodyInit | undefined;
    if (opts.json !== undefined) {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(opts.json);
    } else if (opts.formData) {
      // The browser sets the multipart boundary itself.
      body = opts.formData;
    }

    let response: Response;
    try {
      response = await doFetch(path, {
        method: opts.method,
        headers,
        body,
        cache: "no-store",
        credentials: "same-origin",
      });
    } catch {
      throw new ApiError(0, NETWORK_ERROR_MESSAGE);
    }

    if (!response.ok) {
      const message = await readErrorMessage(response);
      if (response.status === 401 && auth) onUnauthorized(message);
      throw new ApiError(response.status, message);
    }
    return response;
  }

  async function parse<T>(
    path: string,
    response: Response,
    schema: ResponseSchema<T>,
  ): Promise<T> {
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new ApiError(response.status, UNEXPECTED_RESPONSE_MESSAGE);
    }
    const result = schema.safeParse(data);
    if (!result.success) {
      console.error(
        `Response from ${path} does not match the contract`,
        result.error,
      );
      throw new ApiError(response.status, UNEXPECTED_RESPONSE_MESSAGE);
    }
    return result.data;
  }

  async function call<T>(
    path: string,
    schema: ResponseSchema<T>,
    opts: SendOptions,
  ): Promise<T> {
    return parse(path, await send(path, opts), schema);
  }

  const get = <T>(path: string, schema: ResponseSchema<T>) =>
    call(path, schema, { method: "GET" });
  const post = <T>(path: string, schema: ResponseSchema<T>, json?: unknown) =>
    call(path, schema, { method: "POST", json });

  return {
    login: (body: LoginRequest) =>
      call(routePath("/api/auth/login"), LoginResponseSchema, {
        method: "POST",
        json: body,
        auth: false,
      }),
    me: () => get(routePath("/api/auth/me"), MeResponseSchema),

    listShifts: () => get(routePath("/api/shifts"), ShiftListResponseSchema),
    postShift: (body: CreateShiftRequest) =>
      post(routePath("/api/shifts"), ShiftSchema, body),
    claimShift: (id: string) =>
      post(routePath("/api/shifts/:id/claim", { id }), ShiftSchema),
    cancelShift: (id: string, reason: CancelReason) =>
      post(
        routePath("/api/shifts/:id/cancel", { id }),
        CancelShiftResponseSchema,
        { reason },
      ),
    listAgencyShifts: (agencyId: string) =>
      get(
        routePath("/api/agencies/:agencyId/shifts", { agencyId }),
        AgencyShiftListResponseSchema,
      ),

    listCredentials: () =>
      get(routePath("/api/credentials"), CredentialListResponseSchema),
    uploadCredential: (file: File, expiresOn: string) => {
      const formData = new FormData();
      formData.append(CREDENTIAL_FILE_FIELD, file, file.name);
      formData.append("expiresOn", expiresOn);
      return call(routePath("/api/credentials"), CredentialSchema, {
        method: "POST",
        formData,
      });
    },
    /** The license document itself, for a download. */
    downloadCredential: async (id: string): Promise<Blob> => {
      const response = await send(
        routePath("/api/credentials/:id/file", { id }),
        { method: "GET", accept: "*/*" },
      );
      return response.blob();
    },
    /** Admin: the inspector's zip of every license document and compliance.csv. */
    exportLicenses: async (): Promise<{ blob: Blob; fileName: string }> => {
      const response = await send(routePath("/api/admin/exports/licenses"), {
        method: "GET",
        accept: "application/zip",
      });
      const disposition = response.headers.get("content-disposition") ?? "";
      const fileName =
        /filename="([^"]+)"/.exec(disposition)?.[1] ??
        "shiftpatch-licenses.zip";
      return { blob: await response.blob(), fileName };
    },

    listTimesheets: () =>
      get(routePath("/api/timesheets"), TimesheetListResponseSchema),
    submitTimesheet: (body: SubmitTimesheetRequest) =>
      post(routePath("/api/timesheets"), TimesheetSchema, body),
    approveTimesheet: (id: string) =>
      post(routePath("/api/timesheets/:id/approve", { id }), TimesheetSchema),

    adminShifts: () =>
      get(routePath("/api/admin/shifts"), AdminShiftListResponseSchema),
    auditLog: () =>
      get(routePath("/api/admin/audit-log"), AuditLogResponseSchema),
    outbox: () => get(routePath("/api/admin/outbox"), OutboxResponseSchema),
    resetDemoData: () =>
      post(routePath("/api/admin/reset"), ResetResponseSchema),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
