// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import nextConfig, { CONTENT_SECURITY_POLICY } from "./next.config.js";

async function apiRewrites() {
  const rewrites = await nextConfig.rewrites?.();
  return Array.isArray(rewrites) ? rewrites : [];
}

async function headersFor(nodeEnv: string) {
  vi.stubEnv("NODE_ENV", nodeEnv);
  const rules = (await nextConfig.headers?.()) ?? [];
  expect(rules).toHaveLength(1);
  expect(rules[0]?.source).toBe("/:path*");
  return Object.fromEntries(
    (rules[0]?.headers ?? []).map(({ key, value }) => [key, value]),
  );
}

describe("/api rewrite", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("proxies /api/* to the local API by default", async () => {
    vi.stubEnv("API_URL", "");
    expect(await apiRewrites()).toEqual([
      {
        source: "/api/:path*",
        destination: "http://localhost:3001/api/:path*",
      },
    ]);
  });

  it("proxies /api/* to API_URL, keeping the /api prefix", async () => {
    vi.stubEnv("API_URL", "https://api.internal.example/");
    expect(await apiRewrites()).toEqual([
      {
        source: "/api/:path*",
        destination: "https://api.internal.example/api/:path*",
      },
    ]);
  });
});

describe("security headers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sends the baseline headers on every path in every environment", async () => {
    for (const env of ["development", "production"]) {
      expect(await headersFor(env)).toMatchObject({
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
        "X-Frame-Options": "DENY",
      });
    }
  });

  it("adds the CSP in production only", async () => {
    expect(await headersFor("development")).not.toHaveProperty(
      "Content-Security-Policy",
    );
    expect((await headersFor("production"))["Content-Security-Policy"]).toBe(
      CONTENT_SECURITY_POLICY,
    );
  });

  it("locks the CSP to same-origin with no framing, plugins or base hijacking", () => {
    const directives = Object.fromEntries(
      CONTENT_SECURITY_POLICY.split("; ").map((directive) => {
        const [name, ...values] = directive.split(" ");
        return [name, values.join(" ")];
      }),
    );
    expect(directives).toEqual({
      "default-src": "'self'",
      "script-src": "'self' 'unsafe-inline'",
      "style-src": "'self' 'unsafe-inline'",
      "img-src": "'self' data: blob:",
      "connect-src": "'self'",
      "frame-ancestors": "'none'",
      "base-uri": "'self'",
      "form-action": "'self'",
      "object-src": "'none'",
    });
  });

  it("does not advertise the framework", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});
