/**
 * The demo dataset has to stay true, and nothing else would notice if it did not.
 *
 * `scripts/demo-data.mjs` is plain JSON-shaped JavaScript written by hand, and
 * it is inserted straight into `assessments.intake_data` as JSONB. Two things
 * can go wrong there and neither raises:
 *
 *   1. A KEY TYPO. Zod strips unknown keys silently, so `paying_customers`
 *      instead of `paying_customers_count` does not fail - it disappears. The
 *      effect is a lower coverage number and a dimension quietly reported as
 *      not assessed, during a demo, for a reason nobody in the room can see.
 *
 *   2. REAL DATA. The dataset is fabricated and must stay fabricated
 *      (readme.md). A real company name arriving here by copy-paste is a
 *      data-protection incident, not a typo.
 *
 * These tests are the only thing standing between either and a client meeting.
 */

import { describe, expect, it } from 'vitest';

import { intakeSchema } from '@klawfin/core';
import { scoreIntake } from '@klawfin/rubric';
import { checkContradictions } from '@klawfin/validation';

// @ts-expect-error - plain .mjs data module, deliberately not TypeScript: it is
// also imported by scripts/demo.mjs, which runs under bare node with no build.
import { DEMO_ACCOUNTS, DEMO_CLIENTS } from '../../../scripts/demo-data.mjs';

interface DemoClient {
  client: Record<string, unknown>;
  intake: Record<string, unknown>;
}

const clients = DEMO_CLIENTS as DemoClient[];
const accounts = DEMO_ACCOUNTS as { email: string; name: string; role: string }[];

/**
 * Every leaf path present in `source`, as dotted strings.
 *
 * Used to prove nothing was dropped in the round trip. Comparing whole objects
 * would not work - the schema ADDS defaults, so the parsed object is legitimately
 * larger. What must never happen is the reverse.
 */
function leafPaths(node: unknown, prefix = ''): string[] {
  if (node === null || node === undefined) return [];
  if (Array.isArray(node)) {
    return node.flatMap((item, index) => leafPaths(item, `${prefix}[${index}]`));
  }
  if (typeof node === 'object') {
    return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
      leafPaths(value, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [prefix];
}

function valueAt(node: unknown, path: string): unknown {
  return path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .reduce<unknown>(
      (acc, key) => (acc == null ? undefined : (acc as Record<string, unknown>)[key]),
      node,
    );
}

describe.each(clients.map((c) => [c.client.brand_name as string, c] as const))(
  'demo client %s',
  (_name, entry) => {
    it('parses against the real intake schema', () => {
      expect(() => intakeSchema.parse(entry.intake)).not.toThrow();
    });

    it('loses no field to a key typo', () => {
      const parsed = intakeSchema.parse(entry.intake);

      const dropped = leafPaths(entry.intake).filter(
        (path) => valueAt(parsed, path) !== valueAt(entry.intake, path),
      );

      // Naming them matters: "one field was dropped" is not actionable, and the
      // whole point is that the mistake is invisible without the path.
      expect(dropped, `fields stripped by the schema: ${dropped.join(', ')}`).toEqual([]);
    });

    it('scores without throwing', () => {
      const score = scoreIntake(intakeSchema.parse(entry.intake));
      expect(score.composite).toBeGreaterThanOrEqual(0);
      expect(score.composite).toBeLessThanOrEqual(100);
    });

    it('has nothing blocking, so the demo can be locked without a detour', () => {
      // A blocking contradiction is not a bug in the product - it is the
      // product - but it has to be dismissed with a written reason before the
      // intake will lock, and neither demo company is here to show that.
      const report = checkContradictions(intakeSchema.parse(entry.intake), new Date());
      expect(report.blocking.map((c) => c.code)).toEqual([]);
      expect(report.canGenerate).toBe(true);
    });

    it('is fabricated: no deliverable contact address', () => {
      const email = String(entry.client.primary_contact_email);
      expect(email).toMatch(/\.(invalid|test|example|local)$/);
    });
  },
);

describe('the two demo companies cover different paths', () => {
  const [marrowfield, sundermere] = clients.map((c) => intakeSchema.parse(c.intake));

  it('puts the pre-revenue company into pre-revenue mode and the other not', () => {
    // The substitute ladder (PRD 8.4) is the single hardest part of the rubric
    // to explain and the easiest to demonstrate. A demo dataset where no
    // company reaches it cannot show it at all.
    expect(scoreIntake(sundermere).preRevenueMode).toBe(true);
    expect(scoreIntake(marrowfield).preRevenueMode).toBe(false);
  });

  it('separates them on coverage, which is what the gate acts on', () => {
    expect(scoreIntake(marrowfield).overallCoverage).toBeGreaterThan(
      scoreIntake(sundermere).overallCoverage,
    );
  });

  it('keeps the deliberate ask-versus-burn warning in the pre-revenue company', () => {
    // Documented in scripts/demo-data.mjs and deliberately not "fixed": the ask
    // implies about 42 months of runway against a stated target of 18, which is
    // the arithmetic an investor does in the meeting. If this ever stops firing
    // the demo has quietly lost the one thing it shows the validation layer for.
    const report = checkContradictions(sundermere, new Date());
    expect(report.warnings.map((c) => c.code)).toContain('ASK_INCONSISTENT_WITH_BURN');
  });
});

describe('demo accounts', () => {
  it('covers every role, because can_write() gates on it', () => {
    expect(accounts.map((a) => a.role).sort()).toEqual(['analyst', 'owner', 'viewer']);
  });

  it('uses only unroutable addresses', () => {
    for (const account of accounts) {
      expect(account.email).toMatch(/@groundwork\.local$/);
    }
  });
});
