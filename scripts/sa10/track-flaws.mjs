#!/usr/bin/env node
/**
 * SA-10(e): "Track security flaws and flaw resolution within the system ...
 * and report findings to [organization-defined personnel]."
 *
 * The replacement for Dependabot, which was removed because it opened a
 * branch and a pull request per update - eight of them in one week, every one
 * failing CI. SA-10 does not require automated upgrade PRs. It requires that
 * flaws are TRACKED, that their RESOLUTION is tracked, and that the right
 * people are TOLD. This does exactly that and nothing more:
 *
 *   findings appear      one issue is opened, assigned to the security
 *                        reviewers, labelled `security-flaw`
 *   findings change      the same issue is rewritten, with a comment saying so
 *   findings resolved    the issue is closed with a dated comment - which is
 *                        the resolution record
 *   findings return      the same issue is reopened, so the history stays in
 *                        one place
 *
 * One issue, never a branch, never a PR. The fix is a human decision.
 *
 * Usage (in CI, with GH_TOKEN set): node scripts/sa10/track-flaws.mjs audit.json
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FLAW_LABEL, SECURITY_REVIEWERS, flawReport, summariseAudit } from './config.mjs';

const TITLE = 'Security flaws in dependencies (SA-10(e))';

const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8' }).trim();

const auditPath = process.argv[2];
let audit;
try {
  audit = JSON.parse(readFileSync(auditPath, 'utf8'));
} catch (error) {
  // A scan that could not be read is NOT a clean scan. Failing here is what
  // stops a broken tracker from closing a real issue as "resolved".
  console.error(`Could not read audit output at ${auditPath}: ${error.message}`);
  process.exit(1);
}

// `pnpm audit` that cannot reach the registry still writes JSON - an error
// object, with no advisories in it. Summarised naively that is ZERO FINDINGS,
// and the branch below would close an open issue as "resolved" because the
// network was down. A real report always carries the severity counts.
if (!audit?.metadata?.vulnerabilities) {
  console.error(`${auditPath} is not an audit report (no metadata.vulnerabilities). Refusing to treat a failed scan as a clean one.`);
  console.error(JSON.stringify(audit).slice(0, 500));
  process.exit(1);
}

const summary = summariseAudit(audit);
const runUrl = process.env.GITHUB_RUN_ID
  ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
  : null;
const body = flawReport(summary, runUrl);
const bodyFile = join(tmpdir(), 'sa10-flaw-report.md');
writeFileSync(bodyFile, body);

gh('label', 'create', FLAW_LABEL, '--color', '1e1e21', '--description', 'Tracked security flaw (NIST SA-10(e))', '--force');

const existing = JSON.parse(
  gh('issue', 'list', '--label', FLAW_LABEL, '--state', 'all', '--search', `in:title "${TITLE}"`, '--json', 'number,state,body', '--limit', '1'),
)[0];

const open = summary.findings.length > 0;
const today = new Date().toISOString().slice(0, 10);

if (open && !existing) {
  gh('issue', 'create', '--title', TITLE, '--label', FLAW_LABEL, '--body-file', bodyFile, ...SECURITY_REVIEWERS.flatMap((r) => ['--assignee', r]));
  console.log(`Opened a flaw issue: ${summary.findings.length} finding(s).`);
} else if (open && existing) {
  if (existing.state === 'CLOSED') {
    gh('issue', 'reopen', String(existing.number), '--comment', `Reopened ${today}: ${summary.findings.length} finding(s) present again.`);
  }
  if (existing.body.trim() !== body.trim()) {
    gh('issue', 'edit', String(existing.number), '--body-file', bodyFile);
    gh('issue', 'comment', String(existing.number), '--body', `Findings changed on ${today}: ${summary.findings.length} open at moderate or above.`);
  }
  console.log(`Updated flaw issue #${existing.number}: ${summary.findings.length} finding(s).`);
} else if (!open && existing && existing.state === 'OPEN') {
  gh('issue', 'edit', String(existing.number), '--body-file', bodyFile);
  gh('issue', 'close', String(existing.number), '--comment', `Resolved ${today}: no findings at moderate or above.`);
  console.log(`Closed flaw issue #${existing.number}: all findings resolved.`);
} else {
  console.log('No findings at moderate or above, and nothing open to resolve.');
}
