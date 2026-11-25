import type { UserRole } from "@repo/shared";

/** Where each role lands after sign-in, and where a wrong-role page sends them. */
export const ROLE_HOME = {
  nurse: "/nurse",
  agency: "/agency",
  admin: "/admin",
} as const satisfies Record<UserRole, string>;

export const ROLE_LABEL = {
  nurse: "Nurse",
  agency: "Agency",
  admin: "Admin",
} as const satisfies Record<UserRole, string>;

export const LOGIN_PATH = "/login";
