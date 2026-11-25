import { principalFromClaims } from "./principal.js";

describe("principalFromClaims", () => {
  it.each([
    [
      { sub: "nurse-1", role: "nurse", agencyId: null },
      { id: "nurse-1", role: "nurse", agencyId: null },
    ],
    [
      {
        sub: "agency-a",
        role: "agency",
        agencyId: "agency-a",
        iss: "x",
        exp: 1,
      },
      { id: "agency-a", role: "agency", agencyId: "agency-a" },
    ],
    [
      { sub: "admin-1", role: "admin", agencyId: null },
      { id: "admin-1", role: "admin", agencyId: null },
    ],
  ])("maps %o", (claims, principal) => {
    expect(principalFromClaims(claims)).toEqual(principal);
  });

  it.each([
    ["no subject", { role: "nurse", agencyId: null }],
    ["an empty subject", { sub: "", role: "nurse", agencyId: null }],
    ["an unknown role", { sub: "x", role: "owner", agencyId: null }],
    [
      "an agency login without an agency",
      { sub: "agency-a", role: "agency", agencyId: null },
    ],
    [
      "a nurse with an agency",
      { sub: "nurse-1", role: "nurse", agencyId: "agency-a" },
    ],
    ["no agencyId claim", { sub: "nurse-1", role: "nurse" }],
    ["not an object", "nurse-1"],
  ])("rejects %s", (_, claims) => {
    expect(principalFromClaims(claims)).toBeNull();
  });
});
