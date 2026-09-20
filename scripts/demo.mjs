#!/usr/bin/env node
/**
 * Demo and QA accounts, plus fabricated data to look at once you are in.
 *
 * ---------------------------------------------------------------------------
 * THERE IS NO SUCH THING AS A DEMO PASSWORD HERE
 *
 * Authentication is magic link with a hard allowlist (decision 0001), and that
 * was chosen precisely so there is no shared string that signs anyone in. A
 * demo password would be that string. So "demo credentials" here means an
 * account that exists, is on both allowlists, and owns something worth looking
 * at - which is what this script creates.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS DOES NOT MINT SIGN-IN LINKS, WHICH IS THE OBVIOUS THING TO DO
 *
 * The admin API will happily generate one - `POST /auth/v1/admin/generate_link`
 * returns an `action_link` - and it CANNOT WORK against this app. It was
 * written, tested, and removed after watching it fail:
 *
 *   the generated link redirects to
 *     /auth/callback#access_token=...&refresh_token=...
 *   and the app's callback reads
 *     /auth/callback?code=...
 *
 * Those are two different flows. An admin-generated link uses the implicit
 * flow, which returns the session in the URL FRAGMENT - and a fragment is
 * never sent to the server, so a Server Route physically cannot read it. The
 * app uses PKCE, where the sign-in form's response sets a code-verifier cookie
 * and the link comes back with a `code` that is exchanged against it. A link
 * minted out of band has no verifier to exchange against.
 *
 * The practical consequence, and the thing worth knowing before losing an
 * afternoon to it: THE MAGIC LINK ONLY WORKS IN THE BROWSER THAT SUBMITTED THE
 * SIGN-IN FORM. Pasting it into a different browser, or into curl, lands on
 * /login?error=1 with no explanation - by design, because the callback refuses
 * to report why a sign-in failed.
 *
 * So the sign-in path stays the real one, and this script only removes the
 * tedious part: `--link` pulls the newest link for an address out of Mailpit,
 * which is where local mail goes.
 *
 * ---------------------------------------------------------------------------
 * LOCAL ONLY, ENFORCED
 *
 * This creates accounts. Pointed at a hosted project it would be an
 * account-creation backdoor with no audit trail. It therefore refuses to run
 * against anything whose host is not loopback, and the check is on the
 * RESOLVED URL rather than on a flag somebody could forget to pass.
 *
 * Usage:
 *   node scripts/demo.mjs                 accounts + fabricated clients
 *   node scripts/demo.mjs --accounts      accounts only, no data
 *   node scripts/demo.mjs --reset         delete the fabricated clients, then reseed
 *   node scripts/demo.mjs --link <email>  newest sign-in link from Mailpit
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEMO_ACCOUNTS, DEMO_CLIENTS } from './demo-data.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);
const args = new Set(argv);
const ACCOUNTS_ONLY = args.has('--accounts');
const RESET = args.has('--reset');
const LINK_FOR = args.has('--link') ? argv[argv.indexOf('--link') + 1] : null;

/** Where `supabase start` puts local mail. Never a real inbox. */
const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';

/* -------------------------------------------------------------------------- */
/* Configuration                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Read apps/web/.env.
 *
 * That file, not the repo root - Next.js loads environment files relative to
 * its own project directory, and a .env at the monorepo root is silently
 * ignored. Using the same file the app uses means the script cannot be
 * pointed somewhere the app is not.
 */
function loadEnv() {
  const path = join(ROOT, 'apps', 'web', '.env');
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    fail(
      `No environment file at apps/web/.env.\n` +
        `Copy .env.example to apps/web/.env and fill in the values from \`npx supabase status\`.`,
    );
  }

  const env = {};
  for (const line of text.split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

/**
 * Refuse anything that is not the local stack.
 *
 * Checked against the URL actually loaded, so there is no flag to forget and
 * no way to opt out. If this ever needs to run against a hosted project, the
 * right answer is a different script with an audit trail, not an escape hatch
 * bolted onto this one.
 */
function assertLocal(url) {
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    fail(`NEXT_PUBLIC_SUPABASE_URL is not a URL: ${url}`);
  }

  const loopback = host === '127.0.0.1' || host === 'localhost' || host === '::1';
  if (!loopback) {
    fail(
      `Refusing to run against ${host}.\n\n` +
        `This script creates accounts and mints sign-in links. Against a hosted\n` +
        `project that is an account-creation backdoor with no audit trail.\n` +
        `Demo accounts on a real environment are provisioned the same way real\n` +
        `ones are: an allowlist row, and the person signs in themselves.`,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Transport                                                                  */
/* -------------------------------------------------------------------------- */

let BASE = '';
let KEY = '';

/** PostgREST. Returns parsed JSON, or throws with the database's own message. */
async function rest(path, init = {}) {
  const response = await fetch(`${BASE}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${init.method ?? 'GET'} ${path} -> ${response.status} ${text}`);
  }
  return text.length > 0 ? JSON.parse(text) : null;
}

/** GoTrue admin API. */
async function auth(path, init = {}) {
  const response = await fetch(`${BASE}/auth/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, body };
}

/* -------------------------------------------------------------------------- */
/* Versions                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Read the version constants from source rather than restating them.
 *
 * Every assessment is stamped with both so a historical score stays
 * interpretable after the rubric moves (PRD 5.7). A copy here would drift, and
 * a demo assessment stamped with the wrong rubric version is a lie about which
 * rubric produced its score.
 */
function readConstant(relativePath, name) {
  const source = readFileSync(join(ROOT, relativePath), 'utf8');
  const match = new RegExp(`export const ${name} = '([^']+)'`).exec(source);
  if (!match) {
    fail(`Could not find ${name} in ${relativePath}. It was renamed or moved.`);
  }
  return match[1];
}

/* -------------------------------------------------------------------------- */
/* Steps                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Put the demo addresses on the allowlist.
 *
 * Idempotent, and it must run before the identities are created: the trigger
 * refuses to create an account for an address that is not allowlisted, which
 * is the behaviour being relied on rather than worked around.
 */
async function ensureAllowlist() {
  await rest('auth_allowlist', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(
      DEMO_ACCOUNTS.map((a) => ({
        email: a.email,
        full_name: a.name,
        role: a.role,
        invited_by: 'scripts/demo.mjs',
      })),
    ),
  });
}

/** Create the auth identity if it does not exist. Returns the app_users id. */
async function ensureAccount(account) {
  const created = await auth('admin/users', {
    method: 'POST',
    // Confirmed on creation: there is no inbox to click through, and the
    // allowlist - not email ownership - is the control that matters here.
    body: JSON.stringify({ email: account.email, email_confirm: true }),
  });

  if (created.ok && created.body.id) return { id: created.body.id, fresh: true };

  // Already registered is the normal case on a second run. Anything else is
  // worth showing, because the most likely cause is the allowlist trigger
  // refusing the address - which is the trigger working.
  const existing = await rest(
    `app_users?email=eq.${encodeURIComponent(account.email)}&select=id&limit=1`,
  );
  if (existing?.length) return { id: existing[0].id, fresh: false };

  throw new Error(
    `Could not create or find ${account.email}: ${created.status} ${JSON.stringify(created.body)}`,
  );
}

/**
 * The newest sign-in link sent to an address, read out of Mailpit.
 *
 * Read rather than minted - see the header. This is the same link the person
 * would click in the mail client, so following it exercises the real flow
 * including the PKCE exchange, which a generated link does not.
 */
async function newestLink(email) {
  let list;
  try {
    const response = await fetch(`${MAILPIT}/api/v1/messages?limit=50`, {
      signal: AbortSignal.timeout(3000),
    });
    list = await response.json();
  } catch {
    fail(`No Mailpit at ${MAILPIT}. Run \`npx supabase start\`.`);
  }

  // Newest first, which is what the list already returns.
  const message = (list.messages ?? []).find((m) =>
    (m.To ?? []).some((to) => to.Address?.toLowerCase() === email.toLowerCase()),
  );
  if (!message) {
    fail(
      `No sign-in email for ${email}.\n\n` +
        `Open ${new URL('/login', 'http://localhost:3000')} in your browser, enter that\n` +
        `address, then run this again. The form must be submitted from the browser\n` +
        `you intend to sign in with - the link is bound to a cookie it sets.`,
    );
  }

  const body = await fetch(`${MAILPIT}/api/v1/message/${message.ID}`).then((r) => r.json());
  const found = /https?:\/\/[^\s"'<>]+verify[^\s"'<>]*/.exec(body.Text ?? body.HTML ?? '');
  if (!found) fail(`Found the email for ${email} but no link inside it.`);

  return found[0].replace(/&amp;/g, '&');
}

/** Fabricated clients, each with one draft assessment holding a filled intake. */
async function seedClients(ownerId) {
  const rubricVersion = readConstant('packages/rubric/src/definitions.ts', 'RUBRIC_VERSION');
  const intakeVersion = readConstant('packages/core/src/intake/schema.ts', 'INTAKE_SCHEMA_VERSION');

  const seeded = [];

  for (const { client, intake } of DEMO_CLIENTS) {
    const existing = await rest(
      `clients?legal_name=eq.${encodeURIComponent(client.legal_name)}&select=id&limit=1`,
    );
    if (existing?.length) {
      seeded.push({ name: client.brand_name, status: 'already present' });
      continue;
    }

    const [row] = await rest('clients', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ ...client, created_by: ownerId }),
    });

    await rest('assessments', {
      method: 'POST',
      body: JSON.stringify({
        client_id: row.id,
        created_by: ownerId,
        status: 'draft',
        rubric_version: rubricVersion,
        intake_schema_version: intakeVersion,
        // Left as a DRAFT with the intake filled in, deliberately. Locking it
        // here would skip the one moment worth showing: scoring is
        // deterministic, so the score appears the instant you press the
        // button, with no model involved and nothing to wait for.
        intake_data: { schema_version: intakeVersion, ...intake },
      }),
    });

    seeded.push({ name: client.brand_name, status: 'created' });
  }

  return seeded;
}

/**
 * Remove the fabricated clients. The ACCOUNTS DELIBERATELY STAY.
 *
 * An earlier version of this deleted the accounts too, and could not: once an
 * account has signed in it has `audit_log` rows, and `audit_log.actor_user_id`
 * references `app_users` with no cascade. Postgres refuses the delete with
 *
 *   update or delete on table "app_users" violates foreign key constraint
 *   "audit_log_actor_user_id_fkey"
 *
 * That constraint is not an oversight to route around - it is the point. Audit
 * entries outlive the data they describe, so "who did this" cannot be erased
 * by deleting the who. A demo script is not the place to make an exception,
 * and the first version of this function hid the refusal by never checking the
 * response, which is the exact failure mode the rest of this codebase spent a
 * round removing.
 *
 * Re-seeding an existing account is a no-op anyway, so nothing is lost.
 */
async function reset() {
  for (const { client } of DEMO_CLIENTS) {
    // Cascades to assessments, scores, narratives and reports.
    await rest(`clients?legal_name=eq.${encodeURIComponent(client.legal_name)}`, {
      method: 'DELETE',
    });
  }
}

/* -------------------------------------------------------------------------- */

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

async function main() {
  const env = loadEnv();

  BASE = env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  KEY = env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const appUrl = env.APP_URL ?? 'http://localhost:3000';

  if (!BASE || !KEY) {
    fail('apps/web/.env needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  assertLocal(BASE);

  try {
    const probe = await fetch(`${BASE}/rest/v1/`, {
      headers: { apikey: KEY },
      signal: AbortSignal.timeout(3000),
    });
    if (probe.status >= 500) throw new Error(String(probe.status));
  } catch {
    fail(`No local stack at ${BASE}. Run \`npx supabase start\` first.`);
  }

  // `--link` is a lookup, not a provisioning run. Nothing is created.
  if (LINK_FOR) {
    console.log(`\n${await newestLink(LINK_FOR)}\n`);
    console.log('Paste this into THE SAME BROWSER that submitted the sign-in form.\n');
    return;
  }

  if (RESET) {
    console.log('Removing the fabricated clients (accounts stay - the audit log pins them)...');
    await reset();
  }

  await ensureAllowlist();

  const accounts = [];
  for (const account of DEMO_ACCOUNTS) {
    const { id, fresh } = await ensureAccount(account);
    accounts.push({ ...account, id, fresh });
  }

  let seeded = [];
  if (!ACCOUNTS_ONLY) {
    const owner = accounts.find((a) => a.role === 'owner');
    seeded = await seedClients(owner.id);
  }

  /* ---------------------------------------------------------------------- */

  console.log(`\nDemo accounts on ${BASE}\n`);
  for (const account of accounts) {
    const note = account.fresh ? '(created)' : '(already present)';
    console.log(`  ${account.role.padEnd(8)} ${account.email.padEnd(32)} ${note}`);
  }

  if (seeded.length > 0) {
    console.log('\nFabricated clients');
    for (const s of seeded) console.log(`  ${s.name.padEnd(12)} ${s.status}`);
  }

  console.log(`\nTo sign in:`);
  console.log(`  1. open ${appUrl}/login and enter one of the addresses above`);
  console.log(`  2. pnpm demo --link <address>        (or open ${MAILPIT})`);
  console.log(`  3. open that link in the SAME browser you used for step 1`);

  /*
   * BOTH LISTS ARE CHECKED, deliberately (decision 0001): the database trigger
   * admits the address, and `isAllowedEmail` admits the session. An address on
   * one list and not the other fails at the second check with a 403 and no
   * obvious cause, so say so here rather than let it be discovered.
   */
  const allowed = (env.AUTH_ALLOWED_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const missing = DEMO_ACCOUNTS.filter((a) => !allowed.includes(a.email)).map((a) => a.email);

  if (missing.length > 0) {
    console.log('ONE STEP LEFT. These addresses are on the database allowlist but not the');
    console.log('application one, so a session for them would be refused with a 403.');
    console.log('Add them to AUTH_ALLOWED_EMAILS in apps/web/.env and restart the dev server:\n');
    console.log(`  AUTH_ALLOWED_EMAILS=${[...allowed, ...missing].join(',')}\n`);
  } else {
    console.log('');
  }
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
