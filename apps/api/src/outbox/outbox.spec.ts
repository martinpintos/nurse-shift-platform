import { OutboxMessageSchema, type Shift } from "@repo/shared";
import { cancelledMessages, claimedMessages } from "./outbox.js";

const shift: Shift = {
  id: "shift-1",
  agencyId: "agency-a",
  agencyName: "Sunrise Health Staffing",
  role: "RN",
  date: "2026-10-02",
  startTime: "19:00",
  endTime: "07:00",
  status: "filled",
  claimedBy: "nurse-1",
};
const nurse = {
  id: "nurse-1",
  name: "Maria Lopez",
  email: "maria.lopez@example.com",
};
const agency = {
  id: "agency-a",
  name: "Sunrise Health Staffing",
  email: "admin@sunrisehealth.example",
};

function asMessage(draft: object) {
  return OutboxMessageSchema.parse({
    id: "msg",
    createdAt: "2026-11-24T12:00:00.000Z",
    ...draft,
  });
}

describe("claimedMessages", () => {
  it("tells the agency who claimed and confirms to the nurse", () => {
    const [toAgency, toNurse] = claimedMessages(shift, nurse, [agency]).map(
      asMessage,
    );
    expect(toAgency).toMatchObject({
      template: "shift.claimed",
      recipientId: "agency-a",
      recipientEmail: "admin@sunrisehealth.example",
      subject: "Shift shift-1 was claimed",
      body: "Maria Lopez (nurse-1) claimed RN shift shift-1 on 2026-10-02, 19:00 to 07:00.",
    });
    expect(toNurse).toMatchObject({
      recipientId: "nurse-1",
      recipientEmail: "maria.lopez@example.com",
      subject: "You claimed shift shift-1",
      body: "You are booked for RN shift shift-1 on 2026-10-02, 19:00 to 07:00 with Sunrise Health Staffing.",
    });
  });
});

describe("cancelledMessages", () => {
  it.each([
    ["no-show", "as a no-show"],
    ["advance", "in advance"],
  ] as const)(
    "explains a %s cancellation to the nurse and the agency",
    (reason, text) => {
      const reopened = { ...shift, status: "open" as const, claimedBy: null };
      const [toNurse, toAgency] = cancelledMessages(reopened, reason, nurse, [
        agency,
      ]).map(asMessage);
      expect(toNurse).toMatchObject({
        template: "shift.cancelled",
        recipientId: "nurse-1",
        subject: "Your claim on shift shift-1 was cancelled",
      });
      expect(toNurse?.body).toContain(text);
      expect(toAgency).toMatchObject({
        recipientId: "agency-a",
        subject: "Shift shift-1 is open again",
      });
      expect(toAgency?.body).toContain("Maria Lopez (nurse-1)");
      expect(toAgency?.body).toContain(text);
    },
  );
});
