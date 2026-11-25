import { describe, expect, it } from "vitest";
import {
  formatDay,
  formatHours,
  formatRelative,
  formatShiftDate,
  shiftEndDate,
} from "./format";

describe("formatRelative", () => {
  const now = new Date("2026-11-25T12:00:00.000Z");
  it.each([
    ["2026-11-25T11:59:40.000Z", "just now"],
    ["2026-11-25T11:55:00.000Z", "5 minutes ago"],
    ["2026-11-25T09:00:00.000Z", "3 hours ago"],
    ["2026-11-24T12:00:00.000Z", "yesterday"],
    ["2026-11-04T12:00:00.000Z", "3 weeks ago"],
    ["2026-11-25T12:10:00.000Z", "in 10 minutes"],
  ])("%s reads %s", (at, expected) => {
    expect(formatRelative(at, now)).toBe(expected);
  });
});

describe("shift times", () => {
  it("marks overnight hours and the next-day end", () => {
    expect(formatHours("19:00", "07:00")).toBe("19:00 to 07:00 (next day)");
    expect(formatHours("07:00", "19:00")).toBe("07:00 to 19:00");
    expect(shiftEndDate("2026-10-02", "19:00", "07:00")).toBe("2026-10-03");
    expect(shiftEndDate("2026-12-31", "19:00", "07:00")).toBe("2027-01-01");
    expect(shiftEndDate("2026-10-03", "07:00", "19:00")).toBe("2026-10-03");
  });

  it("formats a calendar day without the year, in UTC", () => {
    expect(formatDay("2026-10-02")).toBe("Fri, Oct 2");
    expect(formatShiftDate("2026-10-02")).toBe("Friday, October 2");
  });
});
