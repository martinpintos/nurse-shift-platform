import type { CredentialContentType } from "@repo/shared";

const SIGNATURES: readonly {
  type: CredentialContentType;
  extension: string;
  magic: readonly number[];
}[] = [
  // "%PDF-"
  {
    type: "application/pdf",
    extension: "pdf",
    magic: [0x25, 0x50, 0x44, 0x46, 0x2d],
  },
  // \x89 P N G \r \n \x1a \n
  {
    type: "image/png",
    extension: "png",
    magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
  { type: "image/jpeg", extension: "jpg", magic: [0xff, 0xd8, 0xff] },
];

/**
 * The file's type from its first bytes, or `null` for anything but PDF, PNG and JPEG.
 * The client's file name and MIME type are never trusted.
 */
export function detectContentType(
  bytes: Uint8Array,
): CredentialContentType | null {
  const match = SIGNATURES.find(({ magic }) =>
    magic.every((byte, index) => bytes[index] === byte),
  );
  return match?.type ?? null;
}

export function extensionFor(type: CredentialContentType): string {
  return (
    SIGNATURES.find((signature) => signature.type === type)?.extension ?? "bin"
  );
}

const MAX_STEM_LENGTH = 100;

/**
 * A safe file name to store and send back in `Content-Disposition`: the last path segment
 * of the client's name, accents dropped, anything but letters, digits, `.`, `_` and `-`
 * replaced, and the extension set to the detected type's (a PDF named `.png` becomes
 * `.pdf`). Falls back to `license`.
 */
export function sanitizeFileName(
  original: string,
  type: CredentialContentType,
): string {
  const lastSegment = original.split(/[\\/]/).pop() ?? "";
  const stem = lastSegment
    .replace(/\.[^.]*$/, "")
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, MAX_STEM_LENGTH)
    .replace(/[.-]+$/, "");
  return `${stem || "license"}.${extensionFor(type)}`;
}
