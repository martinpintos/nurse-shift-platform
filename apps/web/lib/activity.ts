import type { AuditLogEntry } from "@repo/shared";
import { AUDIT_ACTION_LABEL, formatDay } from "./format";
import type { Lookup } from "./lookup";

type ActivityText = string | { emphasis: string };

export interface ActivityLine {
  /** What happened, e.g. "Shift claimed". */
  title: string;
  /** Sentence parts keep names and shift details available for visual emphasis. */
  sentence: ActivityText[];
}

function emphasize(emphasis: string): ActivityText {
  return { emphasis };
}

function text(details: AuditLogEntry["details"], key: string): string | null {
  const value = details[key];
  return value === undefined || value === null ? null : String(value);
}

/** "shift-2, LPN at Sunrise Health Staffing", or the id alone when the shift is unknown. */
function shiftPhrase(lookup: Lookup, shiftId: string | null): ActivityText[] {
  if (!shiftId) return ["a shift"];
  const shift = lookup.shift(shiftId);
  return shift
    ? [
        shiftId,
        ", ",
        emphasize(shift.role),
        " at ",
        emphasize(shift.agencyName),
      ]
    : [shiftId];
}

/**
 * An audit entry as a sentence people can read: "Maria Lopez claimed shift-2, LPN at
 * Sunrise Health Staffing". Names come from the lookup; ids stay where a name is unknown.
 */
export function describeActivity(
  entry: AuditLogEntry,
  lookup: Lookup,
): ActivityLine {
  const actor = emphasize(lookup.name(entry.actorId));
  const title = AUDIT_ACTION_LABEL[entry.action];
  const { details } = entry;

  switch (entry.action) {
    case "shift.posted": {
      const shift = entry.entityId ? lookup.shift(entry.entityId) : undefined;
      const when = shift
        ? [", ", emphasize(shift.role), ` on ${formatDay(shift.date)}`]
        : [];
      return {
        title,
        sentence: [actor, " posted ", entry.entityId ?? "a shift", ...when],
      };
    }
    case "shift.claimed":
      return {
        title,
        sentence: [actor, " claimed ", ...shiftPhrase(lookup, entry.entityId)],
      };
    case "shift.cancelled": {
      const nurseId = text(details, "previousNurseId");
      const nurse = nurseId ? emphasize(lookup.name(nurseId)) : "the nurse";
      const shift = shiftPhrase(lookup, entry.entityId);
      if (text(details, "reason") === "no-show") {
        return {
          title,
          sentence: [actor, " reported ", nurse, " as a no-show on ", ...shift],
        };
      }
      return {
        title,
        sentence:
          nurseId === entry.actorId
            ? [actor, " cancelled ", ...shift, " in advance"]
            : [
                actor,
                " cancelled ",
                nurse,
                "’s claim on ",
                ...shift,
                " in advance",
              ],
      };
    }
    case "credential.uploaded": {
      const status = text(details, "status");
      return {
        title,
        sentence: [
          actor,
          status === "expired"
            ? " uploaded a license document, already expired"
            : " uploaded a license document",
        ],
      };
    }
    case "timesheet.submitted":
      return {
        title,
        sentence: [
          actor,
          " submitted hours for ",
          ...shiftPhrase(lookup, text(details, "shiftId")),
        ],
      };
    case "timesheet.approved": {
      const nurseId = text(details, "nurseId");
      const nurse = nurseId ? [emphasize(lookup.name(nurseId)), "’s"] : ["the"];
      return {
        title,
        sentence: [
          actor,
          " approved ",
          ...nurse,
          " hours for ",
          ...shiftPhrase(lookup, text(details, "shiftId")),
        ],
      };
    }
    case "admin.reset":
      return { title, sentence: [actor, " reset the demo data"] };
    case "licenses.exported": {
      const documents = Number(details["documents"] ?? 0);
      const nurses = Number(details["nurses"] ?? 0);
      return {
        title,
        sentence: [
          actor,
          ` exported ${documents} license ${documents === 1 ? "document" : "documents"} for ${nurses} ${nurses === 1 ? "nurse" : "nurses"}`,
        ],
      };
    }
  }
}
