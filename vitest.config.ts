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
  test: {
    environment: 'node',
    include: ['packages/*/tests/**/*.test.ts', 'apps/web/tests/**/*.test.ts'],
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
