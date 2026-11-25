import { sampleLicensePdf } from "./sample-license.js";

const license = {
  nurseId: "nurse-1",
  nurseName: "Maria Lopez",
  expiresOn: "2027-01-01",
};

describe("sampleLicensePdf", () => {
  it("starts with the PDF signature", () => {
    expect(
      Buffer.from(sampleLicensePdf(license)).subarray(0, 8).toString("latin1"),
    ).toBe("%PDF-1.4");
  });

  it("is deterministic", () => {
    expect(Buffer.from(sampleLicensePdf(license))).toEqual(
      Buffer.from(sampleLicensePdf({ ...license })),
    );
  });

  it("says it is fictional and names the nurse and expiry", () => {
    const text = Buffer.from(sampleLicensePdf(license)).toString("latin1");
    expect(text).toContain("(SAMPLE LICENSE - not a real document) Tj");
    expect(text).toContain("(Licensee: Maria Lopez \\(nurse-1\\)) Tj");
    expect(text).toContain("(Expires: 2027-01-01) Tj");
    expect(text.endsWith("%%EOF\n")).toBe(true);
  });

  it("has a cross-reference table that points at each object", () => {
    const text = Buffer.from(sampleLicensePdf(license)).toString("latin1");
    const startxref = Number(/startxref\n(\d+)\n/.exec(text)?.[1]);
    expect(text.slice(startxref, startxref + 4)).toBe("xref");
    const offsets = [
      ...text.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm),
    ].map((m) => Number(m[1]));
    expect(offsets).toHaveLength(5);
    offsets.forEach((offset, index) => {
      expect(text.slice(offset).startsWith(`${index + 1} 0 obj`)).toBe(true);
    });
    const length = Number(/\/Length (\d+)/.exec(text)?.[1]);
    const stream = text.slice(
      text.indexOf("stream\n") + 7,
      text.indexOf("\nendstream"),
    );
    expect(stream.length).toBe(length);
  });

  it("refuses text that isn't printable ASCII", () => {
    expect(() => sampleLicensePdf({ ...license, nurseName: "María" })).toThrow(
      /ASCII/,
    );
  });
});
