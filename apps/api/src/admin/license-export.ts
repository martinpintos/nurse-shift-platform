import { strToU8, zipSync, type Zippable } from "fflate";

export interface ExportNurse {
  id: string;
  name: string;
}

export interface ExportCredential {
  id: string;
  nurseId: string;
  fileName: string;
  /** Postgres DATE, read in UTC. */
  expiresOn: Date;
  data: Uint8Array;
}

export interface LicenseExport {
  fileName: string;
  data: Uint8Array;
  documents: number;
  nurses: number;
}

/**
 * The inspector's export: every nurse's license documents as uploaded, a compliance CSV
 * and a short README. TB test results are not stored anywhere (ESCALATION.md), so there
 * is nothing of them to include.
 */
export function buildLicenseExport(input: {
  nurses: readonly ExportNurse[];
  credentials: readonly ExportCredential[];
  /** `YYYY-MM-DD`, UTC. Status is judged on this date. */
  today: string;
  exportedBy: string;
}): LicenseExport {
  const { nurses, credentials, today, exportedBy } = input;
  const files: Zippable = {
    "README.txt": strToU8(readme(today, exportedBy)),
    "compliance.csv": strToU8(complianceCsv(nurses, credentials, today)),
  };
  for (const credential of credentials) {
    // Ids and stored names are already limited to [A-Za-z0-9._-], so paths are safe.
    files[
      `licenses/${credential.nurseId}/${credential.id}-${credential.fileName}`
    ] = [
      credential.data,
      // PDFs and images are already compressed.
      { level: 0 },
    ];
  }
  return {
    fileName: `shiftpatch-licenses-${today}.zip`,
    data: zipSync(files, { mtime: new Date(`${today}T00:00:00Z`) }),
    documents: credentials.length,
    nurses: nurses.length,
  };
}

function readme(today: string, exportedBy: string): string {
  return [
    "ShiftPatch license export",
    `Exported on ${today} (UTC) by ${exportedBy}.`,
    "",
    "licenses/<nurse id>/ holds each nurse's license documents as uploaded.",
    "compliance.csv lists every nurse with their latest license expiry and",
    "whether it is valid on the export date.",
    "",
    "TB test results are not stored in ShiftPatch and are not part of this",
    "export (see ESCALATION.md).",
    "",
    "All agencies, nurses and documents in this demo are fictional.",
    "",
  ].join("\r\n");
}

const CSV_HEADER = [
  "nurse_id",
  "nurse_name",
  "license_documents",
  "latest_expiry",
  "status",
];

export function complianceCsv(
  nurses: readonly ExportNurse[],
  credentials: readonly ExportCredential[],
  today: string,
): string {
  const rows = nurses.map((nurse) => {
    const own = credentials.filter((c) => c.nurseId === nurse.id);
    const latest = own
      .map((c) => c.expiresOn.toISOString().slice(0, 10))
      .sort()
      .at(-1);
    const status = !latest ? "none" : latest >= today ? "valid" : "expired";
    return [nurse.id, nurse.name, String(own.length), latest ?? "", status];
  });
  return (
    [CSV_HEADER, ...rows]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n") + "\r\n"
  );
}

/**
 * One CSV cell. Quotes when needed, and neutralises spreadsheet formulas (a cell starting
 * with =, +, -, @, tab or carriage return) by prefixing an apostrophe (OWASP CSV injection).
 */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}
