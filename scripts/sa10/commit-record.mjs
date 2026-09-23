#!/usr/bin/env node
/**
 * SA-10(d): "Document approved changes ... and the potential security and
 * privacy impacts of such changes."
 *
 * A commit that changes a configuration item (see config.mjs) must carry a
 * `Security-Impact:` trailer with a real assessment. A commit that touches
 * nothing security-relevant needs nothing - most commits are not a security
 * event and should not be made to pretend they are.
 *
 * TWO MODES, ONE RULE.
 *
 *   --hook <message-file>     The commit-msg git hook (scripts/install-hooks.sh).
 *                             Checks the STAGED files against the message being
 *                             written, and refuses the commit before it exists.
 *                             This is the real control: in a repository that
 *                             commits straight to main, a commit cannot be
 *                             amended once it is pushed.
 *
 *   --range <before> <after>  CI, on every push to main. Checks each pushed
 *                             commit. The backstop for a skipped hook
 *                             (`--no-verify`, a fresh clone, a web edit): it
 *                             cannot undo the commit, but it turns the run red,
 *                             and the deploy gate refuses to ship a commit
 *                             whose SA-10 run did not pass.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { IMPACT_TRAILER, MIN_IMPACT_CHARS, impactStatement, isConfigItem } from './config.mjs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
const lines = (text) => text.split('\n').map((l) => l.trim()).filter(Boolean);

const GUIDANCE =
  `Add a trailer to the commit message:\n\n` +
  `  ${IMPACT_TRAILER}: <does this change who can read or write client data, what is\n` +
  `    logged or sent to a third party, or how the code is built and shipped?\n` +
  `    If none of those, say so and why.>\n\n` +
  `At least ${MIN_IMPACT_CHARS} characters. "N/A" is not an assessment.`;

/** Returns a problem string, or null when the commit is fine. */
function problem(files, message) {
  const touched = files.filter(isConfigItem);
  if (touched.length === 0) return null;
  if (impactStatement(message).length >= MIN_IMPACT_CHARS) return null;

  const shown = touched.slice(0, 15).map((f) => `    ${f}`).join('\n');
  const more = touched.length > 15 ? `\n    ...and ${touched.length - 15} more` : '';
  return `changes ${touched.length} configuration item(s) with no ${IMPACT_TRAILER} statement:\n${shown}${more}`;
}

const [mode, a, b] = process.argv.slice(2);

if (mode === '--hook') {
  const message = readFileSync(a, 'utf8');
  const staged = lines(git('diff', '--cached', '--name-only'));
  const found = problem(staged, message);
  if (found) {
    console.error(`\nCommit refused (NIST SA-10(d)): this commit ${found}\n\n${GUIDANCE}\n`);
    process.exit(1);
  }
  process.exit(0);
}

if (mode === '--range') {
  const after = b;
  // A push that creates the branch reports `before` as forty zeros, and a
  // force push can leave `before` unreachable. In both cases check only the
  // tip - the one commit certainly being introduced.
  const exists = (spec) => {
    try {
      execFileSync('git', ['cat-file', '-e', spec], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  };
  const reachable = Boolean(a) && !/^0+$/.test(a) && exists(`${a}^{commit}`);
  const pushed = reachable ? lines(git('rev-list', '--no-merges', `${a}..${after}`)) : [after];

  // A commit is held to this rule only if the rule existed when it was made:
  // its own tree contains this script. Without that, the first push after
  // adopting SA-10 - which carries the commits written before it - would fail
  // on history nobody could have known to annotate, and the deploy gate would
  // refuse that push forever.
  const shas = pushed.filter((sha) => exists(`${sha}:scripts/sa10/commit-record.mjs`));
  const predating = pushed.length - shas.length;
  if (predating > 0) console.log(`${predating} commit(s) predate SA-10 and are not checked.`);

  const failures = [];
  for (const sha of shas) {
    const files = lines(git('diff-tree', '--no-commit-id', '--name-only', '-r', '--root', sha));
    const message = git('log', '-1', '--format=%B', sha);
    const found = problem(files, message);
    if (found) failures.push(`${sha.slice(0, 7)} ${git('log', '-1', '--format=%s', sha).trim()}\n  ${found}`);
  }

  if (failures.length > 0) {
    console.error(`${failures.length} of ${shas.length} commit(s) lack a change record (NIST SA-10(d)):\n`);
    console.error(failures.join('\n\n'));
    console.error(
      `\nThese commits are already on main and cannot be amended. The deploy gate will\n` +
        `refuse them. Record the assessment in the next commit's ${IMPACT_TRAILER} trailer,\n` +
        `naming the commit it covers, and run: sh scripts/install-hooks.sh\n` +
        `so the hook stops this before it is pushed.`,
    );
    process.exit(1);
  }

  console.log(`Change records present: ${shas.length} commit(s) checked.`);
  process.exit(0);
}

console.error('Usage: commit-record.mjs --hook <message-file> | --range <before> <after>');
process.exit(2);
