import { describe, expect, it } from "vitest";
import {
  CancelShiftRequestSchema,
  CancelShiftResponseSchema,
  CreateShiftRequestSchema,
  ErrorResponseSchema,
  IsoDateSchema,
  ShiftSchema,
  Time24hSchema,
  type Shift,
} from "./index.js";

const openShift: Shift = {
  id: "shift-1",
  agencyId: "agency-a",
  agencyName: "Sunrise Health Staffing",
  role: "RN",
  date: "2026-10-02",
  startTime: "19:00",
  endTime: "07:00",
  status: "open",
  claimedBy: null,
};

describe("IsoDateSchema", () => {
  it.each(["2026-10-02", "2024-02-29", "2020-01-01"])("accepts %s", (value) => {
    expect(IsoDateSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    "2026-02-30",
    "2025-02-29",
    "2026-13-01",
    "2026-1-2",
    "02/10/2026",
    "",
  ])("rejects %j", (value) => {
    expect(IsoDateSchema.safeParse(value).success).toBe(false);
  });
});

describe("Time24hSchema", () => {
  it.each(["00:00", "07:00", "19:00", "23:59"])("accepts %s", (value) => {
    expect(Time24hSchema.safeParse(value).success).toBe(true);
  });

  it.each(["24:00", "7:00", "07:60", "7pm", "07:00:00"])(
    "rejects %j",
    (value) => {
      expect(Time24hSchema.safeParse(value).success).toBe(false);
    },
  );
});

describe("CreateShiftRequestSchema", () => {
  it("accepts an overnight shift on a past date", () => {
    const body = {
      role: "RN",
      date: "2020-01-01",
      startTime: "19:00",
      endTime: "07:00",
    };
    expect(CreateShiftRequestSchema.parse(body)).toEqual(body);
  });

  it("strips a body agencyId, since the agency comes from the token", () => {
    const parsed = CreateShiftRequestSchema.parse({
      role: "LPN",
      date: "2026-10-05",
      startTime: "07:00",
      endTime: "19:00",
      agencyId: "agency-b",
    });
    expect(parsed).not.toHaveProperty("agencyId");
  });

  it("rejects an unknown shift role", () => {
    const body = {
      role: "Surgeon",
      date: "2026-10-05",
      startTime: "07:00",
      endTime: "19:00",
    };
    expect(CreateShiftRequestSchema.safeParse(body).success).toBe(false);
  });
});

describe("CancelShiftRequestSchema", () => {
  it.each(["no-show", "advance"])("accepts %s", (reason) => {
    expect(CancelShiftRequestSchema.safeParse({ reason }).success).toBe(true);
  });

  it.each([{ reason: "other" }, {}, { reason: "" }])("rejects %j", (body) => {
    expect(CancelShiftRequestSchema.safeParse(body).success).toBe(false);
  });
});

describe("response schemas are strict", () => {
  it("rejects a shift with an extra field", () => {
    expect(ShiftSchema.safeParse({ ...openShift, notes: "x" }).success).toBe(
      false,
    );
  });

  it("rejects a shift missing claimedBy", () => {
    const withoutClaimedBy: Partial<Shift> = { ...openShift };
    delete withoutClaimedBy.claimedBy;
    expect(ShiftSchema.safeParse(withoutClaimedBy).success).toBe(false);
  });

  it("keeps strictness on the cancel response", () => {
    const response = {
      ...openShift,
      cancellation: { reason: "advance", previousNurseId: "nurse-1" },
    };
    expect(CancelShiftResponseSchema.safeParse(response).success).toBe(true);
    expect(
      CancelShiftResponseSchema.safeParse({ ...response, extra: 1 }).success,
    ).toBe(false);
  });

  it("rejects an empty or extended error body", () => {
    expect(ErrorResponseSchema.safeParse({ error: "" }).success).toBe(false);
    expect(
      ErrorResponseSchema.safeParse({ error: "x", statusCode: 400 }).success,
    ).toBe(false);
  });
});
