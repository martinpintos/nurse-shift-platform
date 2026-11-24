const DEFAULT_API_URL = "http://localhost:3001";

/**
 * The web app and the API share one URL: /api/* is proxied to the NestJS API.
 * API_URL is read when the config loads (at build and at start), so set it for both.
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  async rewrites() {
    const apiUrl = (process.env.API_URL || DEFAULT_API_URL).replace(/\/+$/, "");
    return [{ source: "/api/:path*", destination: `${apiUrl}/api/:path*` }];
  },
};

export default nextConfig;
