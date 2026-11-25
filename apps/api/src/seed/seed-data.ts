import type {
  CredentialContentType,
  ShiftRole,
  ShiftStatus,
  UserRole,
} from "@repo/shared";

/** The sample data of docs/spec.md, exactly. */

export const SEED_PASSWORD = "Trial2026!";

export const SEED_AGENCIES = [
  { id: "agency-a", name: "Sunrise Health Staffing" },
  { id: "agency-b", name: "Metro Care Partners" },
] as const;

export interface SeedUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  agencyId: string | null;
}

/** Agency logins use their agencyId as their user id and the agency name as their name. */
export const SEED_USERS: readonly SeedUser[] = [
  {
    id: "nurse-1",
    name: "Maria Lopez",
    email: "maria.lopez@example.com",
    role: "nurse",
    agencyId: null,
  },
  {
    id: "nurse-2",
    name: "James Cook",
    email: "james.cook@example.com",
    role: "nurse",
    agencyId: null,
  },
  {
    id: "admin-1",
    name: "Alex Kim",
    email: "alex.kim@example.com",
    role: "admin",
    agencyId: null,
  },
  {
    id: "agency-a",
    name: "Sunrise Health Staffing",
    email: "admin@sunrisehealth.example",
    role: "agency",
    agencyId: "agency-a",
  },
  {
    id: "agency-b",
    name: "Metro Care Partners",
    email: "admin@metrocare.example",
    role: "agency",
    agencyId: "agency-b",
  },
];

export interface SeedCredential {
  id: string;
  nurseId: string;
  expiresOn: string;
  uploadedAt: string;
  contentType: CredentialContentType;
}

/** Fixed ids, so `ensure` recognises them. Nurse 1 is valid, nurse 2 expired on 2026-06-01. */
export const SEED_CREDENTIALS: readonly SeedCredential[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    nurseId: "nurse-1",
    expiresOn: "2027-01-01",
    uploadedAt: "2026-01-15T09:00:00.000Z",
    contentType: "application/pdf",
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    nurseId: "nurse-2",
    expiresOn: "2026-06-01",
    uploadedAt: "2025-06-01T09:00:00.000Z",
    contentType: "application/pdf",
  },
];

export interface SeedShift {
  id: string;
  agencyId: string;
  role: ShiftRole;
  date: string;
  startTime: string;
  endTime: string;
  status: ShiftStatus;
  claimedById: string | null;
}

export const SEED_SHIFTS: readonly SeedShift[] = [
  {
    id: "shift-1",
    agencyId: "agency-a",
    role: "RN",
    date: "2026-10-02",
    startTime: "19:00",
    endTime: "07:00",
    status: "open",
    claimedById: null,
  },
  {
    id: "shift-2",
    agencyId: "agency-a",
    role: "LPN",
    date: "2026-10-03",
    startTime: "07:00",
    endTime: "19:00",
    status: "filled",
    claimedById: "nurse-1",
  },
  {
    id: "shift-3",
    agencyId: "agency-b",
    role: "RN",
    date: "2026-10-04",
    startTime: "19:00",
    endTime: "07:00",
    status: "open",
    claimedById: null,
  },
];

/** The seed's highest shift number: new shifts start after it (shift-4). */
export const MIN_SHIFT_SEQUENCE = 3;
