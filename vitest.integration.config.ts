import { defineConfig } from 'vitest/config';

import base from './vitest.config';

/**
 * Integration tests: run against a REAL local Supabase.
 *
 * Separate from the default suite because they need Docker. Keeping `pnpm test`
 * free of external dependencies is what makes it usable in CI, on a plane, and
 * as a pre-commit check.
 *
 *   npx supabase start
 *   pnpm test:integration
 *
 * With no stack running they skip rather than fail. A red suite that means
 * "Docker is not running" teaches people to ignore red suites.
 *
 * NOT `mergeConfig`: it CONCATENATES arrays, so `include` ended up holding both
 * suites and this config silently ran all 299 unit tests instead. Only the
 * resolver settings are reused, and they are reused explicitly.
 */
export default defineConfig({
  resolve: base.resolve,
  esbuild: base.esbuild,
  test: {
    environment: 'node',
    include: ['apps/web/tests/integration/**/*.test.ts'],
    exclude: ['**/node_modules/**'],
    // These share one database, so parallel files would delete each other's
    // fixtures mid-assertion.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
