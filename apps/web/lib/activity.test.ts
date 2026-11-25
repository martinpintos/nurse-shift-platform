import type { AuditLogEntry } from "@repo/shared";
import { describe, expect, it } from "vitest";
import { refs } from "../test/fixtures";
import { describeActivity } from "./activity";
import { createLookup } from "./lookup";

const lookup = createLookup({ refs });
const bare = createLookup({});

function entry(overrides: Partial<AuditLogEntry>): AuditLogEntry {
  return {
    id: "audit-1",
    at: "2026-11-25T12:00:00.000Z",
    actorId: "nurse-1",
    actorRole: "nurse",
    action: "shift.claimed",
    entityType: "shift",
    entityId: "shift-2",
    details: { agencyId: "agency-a" },
    ...overrides,
  };
}

describe("describeActivity", () => {
  it("names the nurse, the shift, its role and agency", () => {
    expect(describeActivity(entry({}), lookup)).toEqual({
      title: "Shift claimed",
      sentence: "Maria Lopez claimed shift-2, LPN at Sunrise Health Staffing",
    });
  });

  it("falls back to ids when no names are known", () => {
    expect(describeActivity(entry({}), bare).sentence).toBe(
      "nurse-1 claimed shift-2",
    );
  });

  it("tells a no-show from a cancellation in advance", () => {
    const noShow = entry({
      action: "shift.cancelled",
      actorId: "agency-a",
      actorRole: "agency",
      details: {
        agencyId: "agency-a",
        reason: "no-show",
        previousNurseId: "nurse-1",
      },
    });
    expect(describeActivity(noShow, lookup).sentence).toBe(
      "Sunrise Health Staffing reported Maria Lopez as a no-show on shift-2, LPN at Sunrise Health Staffing",
    );
    const own = entry({
      action: "shift.cancelled",
      details: {
        agencyId: "agency-a",
        reason: "advance",
        previousNurseId: "nurse-1",
      },
    });
    expect(describeActivity(own, lookup).sentence).toBe(
      "Maria Lopez cancelled shift-2, LPN at Sunrise Health Staffing in advance",
    );
  });

  it.each([
    [
      entry({
        action: "shift.posted",
        actorId: "agency-a",
        entityId: "shift-1",
      }),
      "Sunrise Health Staffing posted shift-1, RN on Fri, Oct 2",
    ],
    [
      entry({
        action: "credential.uploaded",
        entityType: "credential",
        entityId: "cred-1",
        details: { contentType: "application/pdf", status: "valid" },
      }),
      "Maria Lopez uploaded a license document",
    ],
    [
      entry({
        action: "timesheet.submitted",
        entityType: "timesheet",
        entityId: "ts-1",
        details: { shiftId: "shift-2", agencyId: "agency-a" },
      }),
      "Maria Lopez submitted hours for shift-2, LPN at Sunrise Health Staffing",
    ],
    [
      entry({
        action: "timesheet.approved",
        actorId: "agency-a",
        entityType: "timesheet",
        entityId: "ts-1",
        details: { shiftId: "shift-2", nurseId: "nurse-1" },
      }),
      "Sunrise Health Staffing approved Maria Lopez’s hours for shift-2, LPN at Sunrise Health Staffing",
    ],
    [
      entry({
        action: "admin.reset",
        actorId: "admin-1",
        entityType: "system",
        entityId: null,
        details: {},
      }),
      "Alex Kim reset the demo data",
    ],
    [
      entry({
        action: "licenses.exported",
        actorId: "admin-1",
        entityType: "system",
        entityId: null,
        details: { documents: 2, nurses: 1 },
      }),
      "Alex Kim exported 2 license documents for 1 nurse",
    ],
  ])("%#: %s", (input, sentence) => {
    expect(describeActivity(input, lookup).sentence).toBe(sentence);
  });
});
