const DEFAULT_API_URL = "http://localhost:3001";

/**
 * Production-only Content Security Policy. Next.js inlines its bootstrap scripts and styles,
 * hence 'unsafe-inline'; everything else, including /api, is same-origin. Development is
 * left without a CSP because React's dev tooling needs eval.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

/** Sent on every response, in every environment. */
export const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  { key: "X-Frame-Options", value: "DENY" },
];

/** @param {boolean} production */
export function securityHeaders(production) {
  return production
    ? [
        ...SECURITY_HEADERS,
        { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
      ]
    : SECURITY_HEADERS;
}

/**
 * The web app and the API share one URL: /api/* is proxied to the NestJS API.
 * API_URL is read when the config loads (at build and at start), so set it for both.
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        // Next sets NODE_ENV itself (production for build and start), so it isn't a
        // turbo input. Headers are resolved at build time into the routes manifest.
        // eslint-disable-next-line turbo/no-undeclared-env-vars
        headers: securityHeaders(process.env.NODE_ENV === "production"),
      },
    ];
  },
  async rewrites() {
    const apiUrl = (process.env.API_URL || DEFAULT_API_URL).replace(/\/+$/, "");
    return [{ source: "/api/:path*", destination: `${apiUrl}/api/:path*` }];
  },
};

export default nextConfig;
