import { z } from "zod";

/** Every error response, on every route: `{ "error": "<message>" }`. */
export const ErrorResponseSchema = z.strictObject({
  error: z.string().min(1),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

/** Error messages the spec fixes word for word. */
export const ERROR_MESSAGES = {
  invalidCredentials: "Invalid email or password",
  credentialExpired: "Credential expired, cannot claim shift",
} as const;
