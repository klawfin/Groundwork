import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const at = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

/**
 * Workspace test configuration.
 *
 * Packages export TypeScript source directly (see each package.json `exports`),
 * so there is no build step to orchestrate before tests run. Vitest resolves
 * @klawfin/* through these aliases; Next.js resolves them via
 * `transpilePackages` in apps/web/next.config.ts.
 *
 * The alias list is an ARRAY, not an object, because order matters: Vite
 * matches string aliases by prefix, so '@klawfin/core' would swallow
 * '@klawfin/core/tests/fixtures' if the general entry came first. Subpath
 * entries are listed above their package root for that reason.
 */
export default defineConfig({
  resolve: {
    alias: [
      /**
       * `server-only` throws on import by default, and ships its own no-op for
       * React's `react-server` condition. Vitest cannot select that condition
       * here because the package is SSR-externalised and therefore resolved by
       * Node rather than Vite, so it is pointed at the package's OWN empty
       * entry point instead of a hand-written stub.
       *
       * Without this, every module carrying the guard - the LLM client, the
       * PDF renderer, the admin Supabase client - is untestable. The guard
       * stays fully active in the Next build, which is where it has to work.
       */
      {
        find: /^server-only$/,
        replacement: at('./apps/web/node_modules/server-only/empty.js'),
      },
      // Subpaths first - see note above.
      { find: '@klawfin/core/tests/fixtures', replacement: at('./packages/core/tests/fixtures.ts') },
      { find: '@klawfin/core/legal', replacement: at('./packages/core/src/legal/disclaimers.ts') },
      { find: '@klawfin/core/intake', replacement: at('./packages/core/src/intake/schema.ts') },
      // Package roots.
      { find: '@klawfin/core', replacement: at('./packages/core/src/index.ts') },
      { find: '@klawfin/rubric', replacement: at('./packages/rubric/src/index.ts') },
      { find: '@klawfin/validation', replacement: at('./packages/validation/src/index.ts') },
      { find: '@klawfin/llm', replacement: at('./packages/llm/src/index.ts') },
    ],
  },
  /**
   * The root tsconfig sets `jsx: "preserve"` because Next.js does its own JSX
   * transform. Vitest is not Next, so it needs the automatic runtime declared
   * explicitly - otherwise the PDF document compiles to bare `React.createElement`
   * calls with no React in scope.
   */
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node',
    include: ['packages/*/tests/**/*.test.ts', 'apps/web/tests/**/*.test.{ts,tsx}'],
    /**
     * Integration tests need a running Supabase and are excluded here on
     * purpose. `pnpm test` must stay runnable with no Docker, no network and
     * no credentials - see vitest.integration.config.ts.
     */
    exclude: ['**/node_modules/**', '**/dist/**', 'apps/web/tests/integration/**'],
    coverage: {
      provider: 'v8',
      // readme.md: put the tests where correctness is load-bearing.
      include: [
        'packages/rubric/src/**',
        'packages/validation/src/**',
        'packages/core/src/**',
        'packages/llm/src/guardrails.ts',
        'packages/llm/src/cost.ts',
      ],
      thresholds: { lines: 85, functions: 85, branches: 80, statements: 85 },
    },
  },
});
