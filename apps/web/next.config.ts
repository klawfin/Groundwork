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
  /**
   * The commit this build was made from, fixed at BUILD time (NIST SA-10(5)).
   *
   * `VERCEL_GIT_COMMIT_SHA` alone is not enough: Vercel sets it for
   * git-triggered deploys, but this project deploys from GitHub Actions with
   * `vercel build` + `deploy --prebuilt`, where it is not reliably present -
   * and a build that answers "local" cannot be matched against anything.
   * `GITHUB_SHA` is set in every Actions job, so the artifact carries the
   * exact commit that passed the deploy gate, and the post-deploy smoke test
   * compares the two. Not a secret: a commit hash identifies code, it does not
   * grant access to it.
   */
  env: {
    BUILD_COMMIT_SHA: process.env.GITHUB_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? 'local',
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  // The tool is unlisted and must not be indexed.
  async redirects() {
    return [];
  },
};

export default nextConfig;
