import type {
  CancelReason,
  OutboxMessage,
  OutboxTemplate,
  Shift,
} from "@repo/shared";
import type { OutboxMessage as OutboxRow } from "../generated/prisma/client.js";
import type { Tx } from "../prisma/db.js";

/** Someone a notification goes to. */
export interface Recipient {
  id: string;
  name: string;
  email: string;
}

export interface OutboxDraft {
  template: OutboxTemplate;
  shiftId: string;
  recipientId: string;
  recipientEmail: string;
  subject: string;
  body: string;
}

function schedule(shift: Shift): string {
  return `${shift.role} shift ${shift.id} on ${shift.date}, ${shift.startTime} to ${shift.endTime}`;
}

function draft(
  template: OutboxTemplate,
  shift: Shift,
  to: Recipient,
  subject: string,
  body: string,
): OutboxDraft {
  return {
    template,
    shiftId: shift.id,
    recipientId: to.id,
    recipientEmail: to.email,
    subject,
    body,
  };
}

/** A claim notifies the shift's agency logins and confirms to the nurse. */
export function claimedMessages(
  shift: Shift,
  nurse: Recipient,
  agencyLogins: readonly Recipient[],
): OutboxDraft[] {
  return [
    ...agencyLogins.map((agency) =>
      draft(
        "shift.claimed",
        shift,
        agency,
        `Shift ${shift.id} was claimed`,
        `${nurse.name} (${nurse.id}) claimed ${schedule(shift)}.`,
      ),
    ),
    draft(
      "shift.claimed",
      shift,
      nurse,
      `You claimed shift ${shift.id}`,
      `You are booked for ${schedule(shift)} with ${shift.agencyName}.`,
    ),
  ];
}

const REASON_TEXT: Record<CancelReason, string> = {
  "no-show": "as a no-show",
  advance: "in advance",
};

/** A cancellation tells the nurse who lost the claim and the shift's agency logins. */
export function cancelledMessages(
  shift: Shift,
  reason: CancelReason,
  previousNurse: Recipient,
  agencyLogins: readonly Recipient[],
): OutboxDraft[] {
  return [
    draft(
      "shift.cancelled",
      shift,
      previousNurse,
      `Your claim on shift ${shift.id} was cancelled`,
      `Your claim on ${schedule(shift)} was cancelled ${REASON_TEXT[reason]}. The shift is open again.`,
    ),
    ...agencyLogins.map((agency) =>
      draft(
        "shift.cancelled",
        shift,
        agency,
        `Shift ${shift.id} is open again`,
        `The claim by ${previousNurse.name} (${previousNurse.id}) on ${schedule(shift)} was cancelled ${REASON_TEXT[reason]}. The shift is open again.`,
      ),
    ),
  ];
}

/** Stores the drafts in the demo outbox, inside the transaction of the change they announce. */
export async function queueOutbox(
  tx: Tx,
  drafts: readonly OutboxDraft[],
): Promise<void> {
  if (drafts.length === 0) return;
  await tx.outboxMessage.createMany({ data: [...drafts] });
}

/** The agency logins that hear about an agency's shifts. */
export async function agencyRecipients(
  tx: Tx,
  agencyId: string,
): Promise<Recipient[]> {
  return tx.user.findMany({
    where: { agencyId, role: "agency" },
    select: { id: true, name: true, email: true },
    orderBy: { id: "asc" },
  });
}

/** The admin outbox shape. Rows are only written by `queueOutbox`, so the cast holds. */
export function toOutboxMessageDto(row: OutboxRow): OutboxMessage {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    template: row.template as OutboxTemplate,
    shiftId: row.shiftId,
    recipientId: row.recipientId,
    recipientEmail: row.recipientEmail,
    subject: row.subject,
    body: row.body,
  };
}
