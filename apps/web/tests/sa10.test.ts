/**
 * The pure logic behind the SA-10 controls (scripts/sa10/config.mjs).
 *
 * These decide, without a human looking, whether a commit needs a
 * security impact statement, whether a workflow step is pinned, and whether
 * a dependency scan found anything. Each one fails in the quiet direction if
 * it is wrong: a missed configuration item waves a migration through with no
 * statement, a lenient pin check accepts a movable tag, and a scan misread as
 * empty closes a real flaw as resolved.
 */

import { describe, expect, it } from 'vitest';

import {
  CONFIG_ITEMS,
  IMPACT_TRAILER,
  MIN_IMPACT_CHARS,
  flawReport,
  impactStatement,
  isConfigItem,
  isPinned,
  summariseAudit,
} from '../../../scripts/sa10/config.mjs';

describe('configuration items (SA-10(b))', () => {
  it.each([
    'supabase/migrations/20260920000200_last_seen.sql',
    'apps/web/src/lib/db/admin.ts',
    'apps/web/middleware.ts',
    '.github/workflows/deploy.yml',
    'pnpm-lock.yaml',
    'packages/llm/src/prompts/narrative.ts',
  ])('treats %s as a configuration item', (path) => {
    expect(isConfigItem(path)).toBe(true);
  });

  it.each([
    'apps/web/src/app/ui.tsx',
    'apps/web/src/app/clients/page.tsx',
    'packages/rubric/src/score.ts',
    'README.md',
    // A prefix match must stop at the boundary: this is not `package.json`.
    'apps/web/src/package.json.bak',
  ])('does not treat %s as one', (path) => {
    expect(isConfigItem(path)).toBe(false);
  });

  it('normalises Windows separators, because this repo is edited on Windows', () => {
    expect(isConfigItem('supabase\\migrations\\x.sql')).toBe(true);
  });

  it('has no duplicate entries', () => {
    expect(new Set(CONFIG_ITEMS).size).toBe(CONFIG_ITEMS.length);
  });
});

describe('Security-Impact trailer (SA-10(d))', () => {
  const commit = (trailer: string) => `Tighten RLS on reports\n\nLonger explanation here.\n\n${trailer}`;

  it('reads a one-line trailer', () => {
    expect(impactStatement(commit(`${IMPACT_TRAILER}: viewers can no longer list purged reports.`))).toBe(
      'viewers can no longer list purged reports.',
    );
  });

  it('joins indented continuation lines, as git treats them', () => {
    expect(impactStatement(commit(`${IMPACT_TRAILER}: first part,\n  second part.`))).toBe(
      'first part, second part.',
    );
  });

  it('is case-insensitive on the key, because people type it by hand', () => {
    expect(impactStatement(commit('security-impact: lower case still counts'))).toBe('lower case still counts');
  });

  it('is empty when there is no trailer', () => {
    expect(impactStatement('fix: something\n\nNo trailer here.')).toBe('');
  });

  it("never counts git's own editor comments as an assessment", () => {
    // The commit-msg hook can see these lines; one of them contains the key.
    const message = `fix: thing\n\n# ${IMPACT_TRAILER}: this line is a git comment, not a statement`;
    expect(impactStatement(message)).toBe('');
  });

  it('copes with CRLF messages, which Windows editors write', () => {
    expect(impactStatement(commit(`${IMPACT_TRAILER}: a real answer here.`).replace(/\n/g, '\r\n'))).toBe(
      'a real answer here.',
    );
  });

  it('rejects "N/A" by length, and accepts a reasoned "none"', () => {
    expect(impactStatement(commit(`${IMPACT_TRAILER}: N/A`)).length).toBeLessThan(MIN_IMPACT_CHARS);
    expect(
      impactStatement(commit(`${IMPACT_TRAILER}: None - renames an internal helper, no behaviour change.`)).length,
    ).toBeGreaterThanOrEqual(MIN_IMPACT_CHARS);
  });
});

describe('action pinning (SA-10(1))', () => {
  it('accepts a full commit SHA', () => {
    expect(isPinned('actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1')).toBe(true);
  });

  it.each([
    'actions/checkout@v7',
    'actions/checkout@v7.0.1',
    'actions/checkout@main',
    // Short SHAs are resolvable but ambiguous - and can collide.
    'actions/checkout@3d3c42e',
  ])('rejects the movable reference %s', (ref) => {
    expect(isPinned(ref)).toBe(false);
  });

  it('accepts a local action, which is reviewed as part of this repository', () => {
    expect(isPinned('./.github/actions/setup')).toBe(true);
  });
});

describe('flaw tracking (SA-10(e))', () => {
  // Fabricated advisories. Shape matches `pnpm audit --json`.
  const audit = {
    advisories: {
      '1': {
        id: 1,
        module_name: 'left-pad-ish',
        severity: 'moderate',
        title: 'Prototype pollution',
        url: 'https://example.invalid/1',
        vulnerable_versions: '<1.2.0',
        patched_versions: '>=1.2.0',
        findings: [{ version: '1.1.0', paths: ['apps__web>left-pad-ish'] }],
      },
      '2': {
        id: 2,
        module_name: 'fake-parser',
        severity: 'critical',
        title: 'Remote code execution',
        url: 'https://example.invalid/2',
        vulnerable_versions: '<3.0.0',
        patched_versions: '>=3.0.0',
        findings: [{ version: '2.9.0', paths: ['.>fake-parser'] }],
      },
      '3': { id: 3, module_name: 'noise', severity: 'low', title: 'Minor', findings: [] },
    },
    metadata: { vulnerabilities: { info: 0, low: 1, moderate: 1, high: 0, critical: 1 } },
  };

  it('tracks moderate and above, most severe first', () => {
    const { findings } = summariseAudit(audit);
    expect(findings.map((f) => f.module)).toEqual(['fake-parser', 'left-pad-ish']);
  });

  it('carries the counts through, low included, so the issue shows the full picture', () => {
    expect(summariseAudit(audit).counts).toMatchObject({ critical: 1, moderate: 1, low: 1 });
  });

  it('reports nothing for a clean scan', () => {
    const clean = { advisories: {}, metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 } } };
    expect(summariseAudit(clean).findings).toEqual([]);
  });

  it('does not throw on a malformed report - the tracker refuses it separately', () => {
    // track-flaws.mjs rejects anything without metadata.vulnerabilities BEFORE
    // summarising, so a network error can never be read as "resolved". The
    // summariser itself must still not crash on it.
    expect(() => summariseAudit({ error: 'ECONNRESET' })).not.toThrow();
  });

  it('writes an issue body that names the package, the fix and the path', () => {
    const body = flawReport(summariseAudit(audit), 'https://example.invalid/run/1');
    expect(body).toContain('SA-10(e)');
    expect(body).toContain('`fake-parser`');
    expect(body).toContain('`>=3.0.0`');
    expect(body).toContain('`.>fake-parser`');
    expect(body).toContain('https://example.invalid/run/1');
  });

  it('is byte-identical for an unchanged scan, so an unchanged state is not re-announced', () => {
    expect(flawReport(summariseAudit(audit), null)).toBe(flawReport(summariseAudit(audit), null));
  });
});
