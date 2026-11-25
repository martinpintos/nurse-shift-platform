export interface SampleLicense {
  nurseId: string;
  nurseName: string;
  expiresOn: string;
}

/** PDF string literals escape `\`, `(` and `)`; the text is kept to printable ASCII. */
function pdfText(text: string): string {
  if (!/^[\x20-\x7e]*$/.test(text)) {
    throw new Error("Sample license text must be printable ASCII");
  }
  return text.replace(/[\\()]/g, (char) => `\\${char}`);
}

/**
 * A one-page, clearly fictional license document for the seed, built byte for byte so
 * it is deterministic and needs no assets: the same input always gives the same bytes.
 * Helvetica is one of the PDF standard fonts, so nothing is embedded.
 */
export function sampleLicensePdf(
  license: SampleLicense,
): Uint8Array<ArrayBuffer> {
  const lines = [
    { size: 20, text: "SAMPLE LICENSE - not a real document" },
    {
      size: 12,
      text: "Fictional demo data for ShiftPatch. Not valid for any purpose.",
    },
    { size: 12, text: `Licensee: ${license.nurseName} (${license.nurseId})` },
    {
      size: 12,
      text: `License number: SAMPLE-${license.nurseId.toUpperCase()}`,
    },
    { size: 12, text: `Expires: ${license.expiresOn}` },
  ];
  const content = [
    "BT",
    "50 340 Td",
    ...lines.flatMap(({ size, text }, index) => [
      `/F1 ${size} Tf`,
      ...(index === 0 ? [] : ["0 -28 Td"]),
      `(${pdfText(text)}) Tj`,
    ]),
    "ET",
  ].join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 396] " +
      "/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(pdf, "latin1"));
}
