import type { Response } from "supertest";

/** A supertest parser that keeps a binary response body as a Buffer. */
export function binaryParser(
  res: Response,
  callback: (error: Error | null, body: Buffer) => void,
): void {
  const chunks: Buffer[] = [];
  res.on("data", (chunk: Buffer) => chunks.push(chunk));
  res.on("end", () => callback(null, Buffer.concat(chunks)));
}
