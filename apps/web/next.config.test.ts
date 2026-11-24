import { afterEach, describe, expect, it, vi } from "vitest";
import nextConfig from "./next.config.js";

async function apiRewrites() {
  const rewrites = await nextConfig.rewrites?.();
  return Array.isArray(rewrites) ? rewrites : [];
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
