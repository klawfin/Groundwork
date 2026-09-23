#!/usr/bin/env node
/**
 * Does the repository still implement SA-10? Fails loudly, naming the part.
 *
 * A control that exists only in a document decays on the first busy week: a
 * new workflow step goes in with `@v4`, somebody deletes the commit-msg hook
 * because it got in the way once, the flaw tracker loses its schedule. Each of
 * those is a one-line diff that looks harmless. This turns each one into a red
 * build that says which part of the control it broke.
 *
 * What it can NOT check, because it lives in repository settings rather than
 * in files: protection of main against force-push and deletion, the rule that
 * no other branch can be created, and the Dependabot toggles. Those are
 * applied by scripts/sa10/apply-repo-settings.sh, which needs an admin.
 *
 * Run: node scripts/sa10/check.mjs   (also part of `pnpm verify`)
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CONFIG_ITEMS, isPinned } from './config.mjs';

const DEPLOY_GATE_STEP = 'Only approved commits deploy';
const DEPLOY_VERSION_STEP = 'Deployed version is the approved commit';

const failures = [];
const fail = (control, message) => failures.push(`[${control}] ${message}`);
const read = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : null);

const workflowDir = '.github/workflows';
const workflows = readdirSync(workflowDir)
  .filter((f) => /\.ya?ml$/.test(f))
  .map((f) => ({ file: join(workflowDir, f).replace(/\\/g, '/'), text: readFileSync(join(workflowDir, f), 'utf8') }));
const workflow = (name) => workflows.find((w) => w.file.endsWith(`/${name}`));

/* SA-10(1): every third-party action is pinned to an immutable commit. ------- */
for (const { file, text } of workflows) {
  text.split('\n').forEach((line, i) => {
    const m = /^\s*-?\s*uses:\s*([^\s#]+)/.exec(line);
    if (m && !isPinned(m[1])) {
      fail('SA-10(1)', `${file}:${i + 1} uses '${m[1]}' - pin to a 40-character commit SHA, with the version in a comment.`);
    }
  });
}

/* SA-10(1): installs are exactly the reviewed lockfile, never a fresh resolve. */
for (const { file, text } of workflows) {
  text.split('\n').forEach((line, i) => {
    if (/\bpnpm install\b/.test(line) && !/--frozen-lockfile/.test(line)) {
      fail('SA-10(1)', `${file}:${i + 1} runs 'pnpm install' without --frozen-lockfile, so CI could install something no one reviewed.`);
    }
  });
}

/* SA-10(b): the configuration items are defined and actually exist. --------- */
for (const item of CONFIG_ITEMS) {
  if (!existsSync(item.replace(/\/$/, ''))) {
    fail('SA-10(b)', `configuration item '${item}' does not exist - it was moved or renamed, so changes to it are no longer controlled. Update scripts/sa10/config.mjs.`);
  }
}

/* SA-10(d): configuration-item commits carry a change record - refused locally, verified on push. */
const hooks = read('scripts/install-hooks.sh');
if (!hooks || !hooks.includes('commit-record.mjs --hook')) {
  fail('SA-10(d)', `scripts/install-hooks.sh must install the commit-msg hook that runs 'commit-record.mjs --hook'.`);
}
const sa10 = workflow('sa10.yml');
if (!sa10 || !sa10.text.includes('commit-record.mjs --range')) {
  fail('SA-10(d)', `${workflowDir}/sa10.yml must run 'commit-record.mjs --range' on every push to main.`);
}

/* SA-10(e): flaws are tracked on a schedule, not only when someone looks. ---- */
const tracker = workflow('security-flaws.yml');
if (!tracker) {
  fail('SA-10(e)', `${workflowDir}/security-flaws.yml is missing - nothing tracks dependency flaws since Dependabot was removed.`);
} else if (!/^\s*schedule:/m.test(tracker.text)) {
  fail('SA-10(e)', `${tracker.file} has no schedule - flaws would only be found when someone remembers to look.`);
}

/* SA-10(c), (5), (6): only verified commits on main ship, and the ship is checked. */
const deploy = workflow('deploy.yml');
if (!deploy) {
  fail('SA-10(c)', `${workflowDir}/deploy.yml is missing.`);
} else {
  const gate = deploy.text.includes(DEPLOY_GATE_STEP);
  if (!gate) {
    fail('SA-10(c)', `deploy.yml has no '${DEPLOY_GATE_STEP}' step - any ref could be deployed from the Actions tab.`);
  }
  if (gate && !deploy.text.includes('merge-base --is-ancestor')) {
    fail('SA-10(c)', `the deploy gate no longer checks the commit is on main.`);
  }
  for (const required of ['ci.yml', 'sa10.yml']) {
    if (gate && !new RegExp(`for workflow in[^\\n]*\\b${required.replace('.', '\\.')}\\b`).test(deploy.text)) {
      fail('SA-10(c)', `the deploy gate no longer requires ${required} to have passed for the commit.`);
    }
  }
  // `--linked` needs a prior `supabase link` in the same job: the link lives
  // in gitignored supabase/.temp/, so without it the migration step fails on
  // every fresh runner - and the schema half of a release never ships.
  // Commands only - comments explaining the rule mention `--linked` too.
  const runLines = deploy.text.split('\n').filter((line) => /^\s*run:/.test(line));
  const firstLinked = runLines.findIndex((line) => line.includes('--linked'));
  const linkStep = runLines.findIndex((line) => /\bsupabase link\b/.test(line));
  if (firstLinked !== -1 && (linkStep === -1 || linkStep > firstLinked)) {
    fail('SA-10(6)', `deploy.yml runs 'supabase ... --linked' without a 'supabase link' step before it - migrations cannot reach the production database.`);
  }
  if (!deploy.text.includes(DEPLOY_VERSION_STEP)) {
    fail('SA-10(5)', `deploy.yml has no '${DEPLOY_VERSION_STEP}' step - nothing proves the deployed build is the approved commit.`);
  }
}

/* -------------------------------------------------------------------------- */

if (failures.length > 0) {
  console.error(failures.join('\n'));
  console.error(`\nSA-10 check failed: ${failures.length} problem(s). See docs/decisions/0016-sa10-developer-configuration-management.md`);
  process.exit(1);
}

console.log(
  `SA-10 clean: ${workflows.length} workflows pinned and frozen, ${CONFIG_ITEMS.length} configuration items present, change records enforced, flaws tracked, deploys gated.`,
);
