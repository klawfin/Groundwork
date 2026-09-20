import type { NextConfig } from 'next';

/**
 * Security headers (architecture 5.5).
 *
 * The CSP ships in REPORT-ONLY first. A strict CSP shipped blind will break
 * the app on a Friday, and this tool has exactly one user who cannot debug it.
 */
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy-Report-Only',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Do not announce the framework and version. It is free reconnaissance for
  // anyone matching a CVE against a banner, and it buys nothing.
  poweredByHeader: false,
  // Workspace packages ship TypeScript source; Next compiles them (see 0012).
  transpilePackages: ['@klawfin/core', '@klawfin/rubric', '@klawfin/validation', '@klawfin/llm'],
  // react-pdf must run in the Node runtime, never Edge. (Renamed out of
  // `experimental` in Next 15.)
  serverExternalPackages: ['@react-pdf/renderer'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  // The tool is unlisted and must not be indexed.
  async redirects() {
    return [];
  },
};

export default nextConfig;
