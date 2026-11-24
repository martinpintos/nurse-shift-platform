import { ShiftSchema } from "@repo/shared";
import type { Agency, Shift as ShiftRow } from "../generated/prisma/client.js";
import { toShiftDto } from "./shift.mapper.js";

// What Prisma returns for shift-1: @db.Date comes back as a Date at UTC midnight.
const row: ShiftRow & { agency: Agency } = {
  id: "shift-1",
  agencyId: "agency-a",
  agency: { id: "agency-a", name: "Sunrise Health Staffing" },
  role: "RN",
  date: new Date("2026-10-02T00:00:00.000Z"),
  startTime: "19:00",
  endTime: "07:00",
  status: "open",
  claimedById: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("toShiftDto", () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it("maps a row to the spec's Shift shape", () => {
    const dto = toShiftDto(row);
    expect(dto).toEqual({
      id: "shift-1",
      agencyId: "agency-a",
      agencyName: "Sunrise Health Staffing",
      role: "RN",
      date: "2026-10-02",
      startTime: "19:00",
      endTime: "07:00",
      status: "open",
      claimedBy: null,
    });
    expect(ShiftSchema.parse(dto)).toEqual(dto);
  });

  it.each([
    "UTC",
    "America/New_York",
    "America/Los_Angeles",
    "Pacific/Honolulu",
    "Asia/Tokyo",
  ])("round-trips 2026-10-02 unchanged with TZ=%s", (tz) => {
    process.env.TZ = tz;
    expect(toShiftDto(row).date).toBe("2026-10-02");
  });

  it("is a meaningful check: local-time getters would read 2026-10-01 west of UTC", () => {
    process.env.TZ = "America/Los_Angeles";
    expect(row.date.getDate()).toBe(1);
  });

  it("maps claimedById to claimedBy", () => {
    const filled = {
      ...row,
      status: "filled" as const,
      claimedById: "nurse-1",
    };
    expect(toShiftDto(filled)).toMatchObject({
      status: "filled",
      claimedBy: "nurse-1",
    });
  });
});
