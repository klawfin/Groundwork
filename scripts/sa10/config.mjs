/**
 * NIST SP 800-53 SA-10, Developer Configuration Management - the definitions.
 *
 * SA-10 is written with assignment parameters - "[Assignment: organization-
 * defined configuration items]", "[Assignment: organization-defined
 * personnel]". This file is where Groundwork fills them in. Everything else in
 * scripts/sa10/ and the workflows reads from here, so the definition and its
 * enforcement cannot drift apart: the commit-record check uses it to decide
 * which commits need an impact statement, and the flaw tracker assigns
 * findings to the people named here.
 *
 * THIS REPOSITORY COMMITS STRAIGHT TO MAIN. There are no branches and no pull
 * requests, so nothing here depends on either: the change record lives in the
 * commit message, and approval means "recorded, verified by CI, and on main".
 *
 * Decision record: docs/decisions/0016-sa10-developer-configuration-management.md
 */

/* -------------------------------------------------------------------------- */
/* SA-10(b): organization-defined configuration items                          */
/* -------------------------------------------------------------------------- */

/**
 * The paths whose change can alter who reads client data, what leaves the
 * system, or what gets built and shipped. A trailing slash means everything
 * beneath it.
 *
 * Deliberately NOT everything. If every file were a configuration item, every
 * PR would need a security impact statement, the statements would become
 * boilerplate within a week, and the one that mattered would read like the
 * rest. The list is the part of the system where a one-line diff can be a
 * breach.
 */
export const CONFIG_ITEMS = [
  // The authorisation boundary (ADR-007). A migration can drop a policy.
  'supabase/migrations/',
  'supabase/config.toml',
  'supabase/seed.sql',
  'scripts/assert-write-policies.sql',

  // Authentication and the route guard.
  'apps/web/middleware.ts',
  'apps/web/src/app/auth/',
  'apps/web/src/lib/auth/',

  // Database access, including the service-role client that bypasses RLS.
  'apps/web/src/lib/db/',

  // Secrets handling and security headers.
  'apps/web/src/lib/config/',
  'apps/web/next.config.ts',
  '.env.example',
  '.gitignore',

  // Every route that can return client data or spend money.
  'apps/web/src/app/api/',

  // What is sent to the model and what is allowed back out of it.
  'packages/llm/src/',

  // Fixed legal text. Not generated, not editable (structural rule 4).
  'packages/core/src/legal/',

  // Supply chain: what gets installed.
  'package.json',
  'apps/web/package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',

  // How it is built, verified and shipped - including this control itself.
  '.github/',
  'scripts/',
];

export function isConfigItem(path) {
  const normalised = path.replace(/\\/g, '/').replace(/^\.\//, '');
  return CONFIG_ITEMS.some((item) =>
    item.endsWith('/') ? normalised.startsWith(item) : normalised === item,
  );
}

/* -------------------------------------------------------------------------- */
/* SA-10(e): organization-defined personnel                                    */
/* -------------------------------------------------------------------------- */

/**
 * Who receives security flaw reports: the flaw tracker assigns its issue to
 * these accounts, which is how SA-10(e)'s "report findings to [personnel]" is
 * met without anyone having to remember to look.
 *
 * ASSUMPTION, recorded so it can be corrected: the repository owner account and
 * the engineer who maintains it. Both must have access to the repository, or
 * GitHub rejects the assignment and the tracker fails loudly.
 */
export const SECURITY_REVIEWERS = ['klawfin', 'NikzRN01'];

/* -------------------------------------------------------------------------- */
/* SA-10(d): documenting approved changes and their security impact            */
/* -------------------------------------------------------------------------- */

/**
 * The change record is a git trailer on the commit itself:
 *
 *   Tighten RLS on reports
 *
 *   Security-Impact: viewers can no longer list purged reports; no change to
 *     who can read live ones. Covered by rls.test.ts.
 *
 * WHY THE COMMIT MESSAGE. With no branches and no pull requests there is no PR
 * description to hold a change record, and a separate document is the kind
 * nobody opens. A trailer is permanent, travels with the exact change it
 * describes, survives any hosting move, and is searchable:
 *
 *   git log --grep '^Security-Impact:'
 *
 * is the full history of security-relevant change and its assessed impact.
 */
export const IMPACT_TRAILER = 'Security-Impact';

/**
 * Shorter than this is not an assessment. "N/A" and "none" are what a
 * template collects when nobody thought about it; "None - this only renames a
 * CSS class used by one component" is an assessment, and it is longer than 20.
 */
export const MIN_IMPACT_CHARS = 20;

/**
 * The Security-Impact statement in a commit message, continuation lines
 * joined. Empty string when there is none.
 *
 * Lines starting with `#` are dropped first: the commit-msg hook can see git's
 * own editor comments, and "# Please enter the commit message" must never
 * count as somebody's security assessment.
 */
export function impactStatement(message) {
  const lines = String(message ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((line) => !line.startsWith('#'));

  const key = new RegExp(`^${IMPACT_TRAILER}\\s*:`, 'i');
  const start = lines.findIndex((line) => key.test(line));
  if (start < 0) return '';

  const parts = [lines[start].replace(key, '').trim()];
  // Indented lines continue the trailer, as git itself treats them.
  for (const line of lines.slice(start + 1)) {
    if (/^\s+\S/.test(line)) parts.push(line.trim());
    else break;
  }
  return parts.join(' ').trim();
}

/* -------------------------------------------------------------------------- */
/* SA-10(1): software integrity verification                                   */
/* -------------------------------------------------------------------------- */

/**
 * Is a workflow `uses:` reference immutable?
 *
 * A tag is not. `actions/checkout@v7` resolves to whatever the tag points at
 * on the day the job runs, and a tag can be moved - which is exactly how the
 * tj-actions/changed-files compromise in March 2025 reached thousands of
 * repositories that had "pinned" to a version. A full 40-character commit SHA
 * cannot be moved. Local actions (`./...`) are part of this repository and
 * covered by its own review.
 */
export function isPinned(ref) {
  const value = String(ref).trim();
  if (value.startsWith('./')) return true;
  return /@[0-9a-f]{40}$/.test(value);
}

/* -------------------------------------------------------------------------- */
/* SA-10(e): tracking security flaws                                           */
/* -------------------------------------------------------------------------- */

export const FLAW_LABEL = 'security-flaw';

const SEVERITY_ORDER = ['info', 'low', 'moderate', 'high', 'critical'];

/** Moderate and above are tracked; CI separately BLOCKS on high in production deps. */
export const TRACK_FROM = 'moderate';

/**
 * Reduce `pnpm audit --json` to what a person needs to act on.
 *
 * Defensive about shape: the audit format has changed between package manager
 * versions, and a tracker that throws on an unexpected field reports nothing -
 * which reads exactly like "no vulnerabilities".
 */
export function summariseAudit(audit, from = TRACK_FROM) {
  const floor = SEVERITY_ORDER.indexOf(from);
  const advisories = Object.values(audit?.advisories ?? {});

  const findings = advisories
    .filter((a) => SEVERITY_ORDER.indexOf(a?.severity) >= floor)
    .map((a) => ({
      id: String(a.id ?? a.github_advisory_id ?? a.url ?? a.title),
      module: a.module_name ?? 'unknown',
      severity: a.severity,
      title: a.title ?? '(no title)',
      url: a.url ?? null,
      vulnerable: a.vulnerable_versions ?? '?',
      patched: a.patched_versions ?? 'no fix published',
      paths: [...new Set((a.findings ?? []).flatMap((f) => f.paths ?? []))].slice(0, 5),
    }))
    .sort(
      (x, y) =>
        SEVERITY_ORDER.indexOf(y.severity) - SEVERITY_ORDER.indexOf(x.severity) ||
        x.module.localeCompare(y.module),
    );

  const counts = Object.fromEntries(
    SEVERITY_ORDER.map((s) => [s, Number(audit?.metadata?.vulnerabilities?.[s] ?? 0)]),
  );

  return { findings, counts };
}

/** The issue body. Rows stay stable between runs so an unchanged state is an unchanged issue. */
export function flawReport({ findings, counts }, runUrl) {
  const lines = [
    `Tracked under NIST SP 800-53 **SA-10(e)**: security flaws in this system and their resolution.`,
    '',
    `| critical | high | moderate | low |`,
    `|---|---|---|---|`,
    `| ${counts.critical} | ${counts.high} | ${counts.moderate} | ${counts.low} |`,
    '',
  ];

  if (findings.length === 0) {
    lines.push('No open findings at moderate or above.');
  } else {
    lines.push('| Severity | Package | Advisory | Affected | Fixed in | Via |', '|---|---|---|---|---|---|');
    for (const f of findings) {
      const title = f.url ? `[${f.title}](${f.url})` : f.title;
      const via = f.paths.length ? f.paths.map((p) => `\`${p}\``).join('<br>') : '-';
      lines.push(`| ${f.severity} | \`${f.module}\` | ${title} | \`${f.vulnerable}\` | \`${f.patched}\` | ${via} |`);
    }
  }

  lines.push(
    '',
    'This issue is opened, updated and closed by `.github/workflows/security-flaws.yml`. ' +
      'Closing it by hand does not resolve anything: the next scan reopens it while a finding remains.',
  );
  if (runUrl) lines.push('', `Last scan: ${runUrl}`);
  return lines.join('\n');
}
