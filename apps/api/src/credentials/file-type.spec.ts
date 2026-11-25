import { sampleLicensePdf } from "../seed/sample-license.js";
import {
  detectContentType,
  extensionFor,
  sanitizeFileName,
} from "./file-type.js";

const bytes = (...values: number[]) => Uint8Array.from(values);

describe("detectContentType", () => {
  it.each([
    ["PDF", Buffer.from("%PDF-1.7\n..."), "application/pdf"],
    [
      "the seed's sample license",
      sampleLicensePdf({
        nurseId: "nurse-1",
        nurseName: "Maria Lopez",
        expiresOn: "2027-01-01",
      }),
      "application/pdf",
    ],
    [
      "PNG",
      bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00),
      "image/png",
    ],
    ["JPEG", bytes(0xff, 0xd8, 0xff, 0xe0, 0x00), "image/jpeg"],
  ])("recognises %s by its magic bytes", (_, file, type) => {
    expect(detectContentType(file)).toBe(type);
  });

  it.each([
    ["plain text", Buffer.from("hello, I am a .png")],
    ["an empty file", bytes()],
    ["a truncated PNG signature", bytes(0x89, 0x50, 0x4e, 0x47)],
    ["a PDF signature without the dash", Buffer.from("%PDF1.7")],
    ["SVG", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')],
    ["HTML", Buffer.from("<!doctype html><script>alert(1)</script>")],
    ["GIF", Buffer.from("GIF89a")],
  ])("rejects %s", (_, file) => {
    expect(detectContentType(file)).toBeNull();
  });
});

describe("sanitizeFileName", () => {
  it.each([
    ["license.pdf", "application/pdf", "license.pdf"],
    ["RN License 2026.PDF", "application/pdf", "RN-License-2026.pdf"],
    ["../../etc/passwd", "application/pdf", "passwd.pdf"],
    ["C:\\Users\\maria\\scan.jpeg", "image/jpeg", "scan.jpg"],
    ['Lícense "final" (1).png', "application/pdf", "License-final-1.pdf"],
    ["photo.png", "image/jpeg", "photo.jpg"],
    ["....", "image/png", "license.png"],
    ["", "image/png", "license.png"],
    ["<script>.png", "image/png", "script.png"],
    ["résumé.tar.gz.pdf", "application/pdf", "resume.tar.gz.pdf"],
  ] as const)("%s as %s becomes %s", (original, type, expected) => {
    expect(sanitizeFileName(original, type)).toBe(expected);
  });

  it("caps the length", () => {
    const name = sanitizeFileName(`${"a".repeat(500)}.pdf`, "application/pdf");
    expect(name).toBe(`${"a".repeat(100)}.pdf`);
  });

  it("only ever produces safe characters", () => {
    for (const original of [
      'a"b',
      "a\r\nb",
      "a;b=c",
      "%00",
      "日本語.pdf",
      "a/../b",
    ]) {
      expect(sanitizeFileName(original, "application/pdf")).toMatch(
        /^[\w.-]+\.pdf$/,
      );
    }
  });
});

describe("extensionFor", () => {
  it("maps each accepted type", () => {
    expect(extensionFor("application/pdf")).toBe("pdf");
    expect(extensionFor("image/png")).toBe("png");
    expect(extensionFor("image/jpeg")).toBe("jpg");
  });
});
