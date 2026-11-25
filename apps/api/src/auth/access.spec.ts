import { Access, RolePolicy, type RouteKey } from "./access.js";

describe("RolePolicy.hasRole", () => {
  const policy = new RolePolicy();

  it("allows a listed role only", () => {
    const agency = {
      id: "agency-a",
      role: "agency",
      agencyId: "agency-a",
    } as const;
    expect(policy.hasRole(agency, ["agency", "admin"])).toBe(true);
    expect(policy.hasRole(agency, ["nurse"])).toBe(false);
    expect(policy.hasRole(agency, [])).toBe(false);
  });

  it("denies a guest", () => {
    expect(policy.hasRole(null, ["nurse", "agency", "admin"])).toBe(false);
  });
});

describe("Access", () => {
  it("fails loudly for a route that isn't in ROUTES", () => {
    expect(() => Access("GET /api/nowhere" as RouteKey)).toThrow(
      /not in ROUTES/,
    );
  });

  it("returns a decorator for public and protected routes", () => {
    expect(typeof Access("POST /api/auth/login")).toBe("function");
    expect(typeof Access("POST /api/shifts")).toBe("function");
  });
});
