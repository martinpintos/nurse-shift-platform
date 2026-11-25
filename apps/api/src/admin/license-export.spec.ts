import { strFromU8, unzipSync } from "fflate";
import {
  buildLicenseExport,
  complianceCsv,
  csvCell,
  type ExportCredential,
} from "./license-export.js";

const nurses = [
  { id: "nurse-1", name: "Maria Lopez" },
  { id: "nurse-2", name: "James Cook" },
  { id: "nurse-3", name: "New Nurse" },
];

const pdf = (text: string) => new TextEncoder().encode(`%PDF-1.4 ${text}`);

const credentials: ExportCredential[] = [
  {
    id: "cred-a",
    nurseId: "nurse-1",
    fileName: "license.pdf",
    expiresOn: new Date("2027-01-01T00:00:00Z"),
    data: pdf("a"),
  },
  {
    id: "cred-b",
    nurseId: "nurse-2",
    fileName: "license.pdf",
    expiresOn: new Date("2026-06-01T00:00:00Z"),
    data: pdf("b"),
  },
];

describe("buildLicenseExport", () => {
  const result = buildLicenseExport({
    nurses,
    credentials,
    today: "2026-11-24",
    exportedBy: "admin-1",
  });
  const files = unzipSync(result.data);

  it("names the file by date and counts documents and nurses", () => {
    expect(result).toMatchObject({
      fileName: "shiftpatch-licenses-2026-11-24.zip",
      documents: 2,
      nurses: 3,
    });
  });

  it("holds every document byte for byte, under the nurse's folder", () => {
    expect(Object.keys(files).sort()).toEqual([
      "README.txt",
      "compliance.csv",
      "licenses/nurse-1/cred-a-license.pdf",
      "licenses/nurse-2/cred-b-license.pdf",
    ]);
    expect(files["licenses/nurse-1/cred-a-license.pdf"]).toEqual(pdf("a"));
  });

  it("judges status on the export date, including nurses with no document", () => {
    expect(strFromU8(files["compliance.csv"]!).split("\r\n")).toEqual([
      "nurse_id,nurse_name,license_documents,latest_expiry,status",
      "nurse-1,Maria Lopez,1,2027-01-01,valid",
      "nurse-2,James Cook,1,2026-06-01,expired",
      "nurse-3,New Nurse,0,,none",
      "",
    ]);
  });

  it("says TB results are not included", () => {
    expect(strFromU8(files["README.txt"]!)).toMatch(
      /TB test results are not stored/,
    );
  });
});

describe("complianceCsv", () => {
  it("uses the latest of several documents", () => {
    const csv = complianceCsv(
      [nurses[0]!],
      [
        { ...credentials[0]!, expiresOn: new Date("2025-01-01T00:00:00Z") },
        {
          ...credentials[0]!,
          id: "cred-c",
          expiresOn: new Date("2028-03-01T00:00:00Z"),
        },
      ],
      "2026-11-24",
    );
    expect(csv).toContain("nurse-1,Maria Lopez,2,2028-03-01,valid");
  });
});

describe("csvCell", () => {
  it.each([
    ['=HYPERLINK("x")', '"\'=HYPERLINK(""x"")"'],
    ["+1", "'+1"],
    ["-2", "'-2"],
    ["@SUM(A1)", "'@SUM(A1)"],
    ["Lopez, Maria", '"Lopez, Maria"'],
    ['say "hi"', '"say ""hi"""'],
    ["plain", "plain"],
  ])("%s becomes %s", (input, output) => {
    expect(csvCell(input)).toBe(output);
  });
});
