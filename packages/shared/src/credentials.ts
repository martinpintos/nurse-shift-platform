import { z } from "zod";
import { IdSchema, IsoDateSchema } from "./primitives.js";

/** Upload limit. Kept well under Vercel's proxied request body limit. */
export const MAX_CREDENTIAL_BYTES = 2 * 1024 * 1024;

/** The multipart field that carries the file in POST /api/credentials. */
export const CREDENTIAL_FILE_FIELD = "file";

/** Accepted types. The API checks the file's magic bytes, not the client's MIME type. */
export const CREDENTIAL_CONTENT_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
] as const;
export const CredentialContentTypeSchema = z.enum(CREDENTIAL_CONTENT_TYPES);
export type CredentialContentType = z.infer<typeof CredentialContentTypeSchema>;

/** `valid` while expiresOn is today or later; claims compare against the shift date. */
export const CredentialStatusSchema = z.enum(["valid", "expired"]);
export type CredentialStatus = z.infer<typeof CredentialStatusSchema>;

/** POST /api/credentials text fields (multipart, alongside the `file` field). */
export const CredentialUploadFieldsSchema = z.object({
  expiresOn: IsoDateSchema,
});
export type CredentialUploadFields = z.infer<
  typeof CredentialUploadFieldsSchema
>;

/** A nurse's license document. The file itself is served by GET /api/credentials/:id/file. */
export const CredentialSchema = z.strictObject({
  id: IdSchema,
  nurseId: IdSchema,
  fileName: z.string().min(1).max(255),
  contentType: CredentialContentTypeSchema,
  sizeBytes: z.number().int().positive().max(MAX_CREDENTIAL_BYTES),
  expiresOn: IsoDateSchema,
  uploadedAt: z.iso.datetime(),
  status: CredentialStatusSchema,
});
export type Credential = z.infer<typeof CredentialSchema>;

/** GET /api/credentials 200 response: own for a nurse, everyone's for the admin. */
export const CredentialListResponseSchema = z.strictObject({
  credentials: z.array(CredentialSchema),
});
export type CredentialListResponse = z.infer<
  typeof CredentialListResponseSchema
>;
