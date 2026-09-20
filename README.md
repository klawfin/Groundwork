# Groundwork by Klawfin

Internal delivery tool for Klawfin's Fundraise-Readiness Sprint. It takes structured information about an early-stage startup, scores it against a fixed rubric, generates a written assessment with an LLM, and exports a branded PDF that Dhruv walks a paying client through.

One user. No public access. No payments. That is deliberate and it is the whole point of Phase 1.

**Priority order, and it settles every trade-off below: speed and credibility on paid work first, data second, public product later.** If a change makes the public self-serve version better but the paid delivery worse, it is the wrong change.

---

## Status

| | |
|---|---|
| Phase | 1 — internal tool, single user |
| Build state | Core engine complete and tested. Web app and PDF renderer not yet built — see [What exists](#what-exists-today) |
| Tests | 193 passing, 94% coverage on load-bearing modules |
| Client data | Yes — financials and cap tables. Read [Security](#security-non-negotiables) before writing code |
| Disclaimer | **PENDING LEGAL SIGN-OFF — no report may go to a client** ([0009](./docs/decisions/0009-disclaimer-wording.md)) |

---

## What exists today

```
packages/
├── core/           Intake schema (Zod), presence primitives, fixed legal text
├── rubric/         6 dimensions, 29 sub-criteria, anchors, scoring, prioritisation
├── validation/     16 contradiction checks, coverage gating
└── llm/            Prompts, response schema, guardrails, cost accounting, API client
apps/
└── web/            Next.js app — SCAFFOLDED, NOT BUILT
supabase/migrations/  Core tables, RLS, audit log, auth allowlist, retention
docs/decisions/     One record per resolved OPEN- item
```

**Built and tested:**

- The scoring engine — pure, deterministic, 29 sub-criteria with per-level anchor text
- N/A renormalisation, weight redistribution, coverage and confidence
- Pre-revenue substitute ladder (PRD §8.4)
- Deterministic impact × effort prioritisation and the 30/60/90 schedule
- 16 contradiction checks, both directions tested
- Post-generation guardrails: numeric consistency, prohibited language, placeholders, confidence notes, length
- Cost accounting with pre-flight hard abort
- Database schema with RLS on every table, append-only audit log, retention and deletion functions

**Not built yet, in the order it should be tackled:**

1. `@react-pdf/renderer` spike — **do this first**, it is the biggest unknown ([0003](./docs/decisions/0003-pdf-rendering.md))
2. Next.js app shell, auth middleware, route guards
3. Intake form
4. Score review screen with sub-criterion inspection
5. Generation route, narrative editing, report versioning
6. PDF template and export
7. Cost view

---

## Quickstart

```bash
pnpm install
pnpm test                          # 325 tests, no external services needed
pnpm typecheck                     # whole workspace
```

Requires Node 20+ and pnpm. The scoring engine, guardrails and PDF renderer are
all testable with no database and no API key.

### Running the app

Needs Docker Desktop running.

```bash
npx supabase start                 # applies every migration, seeds the allowlist
cp .env.example apps/web/.env      # then fill it in
pnpm --filter @klawfin/web dev
pnpm test:integration              # 23 tests against the real database
```

**`apps/web/.env`, not the repository root.** Next.js loads environment files
relative to its own project directory, so a `.env` at the monorepo root is
silently ignored and the app starts with no configuration at all. It presents
as `"database": "unreachable"` from `/api/health` with nothing else to go on.

`npx supabase start` prints the local URL, anon key and service-role key. They
are the same on every machine, are published in Supabase's own documentation,
and reach nothing but the container on your laptop — but never reuse them for a
hosted project.

| | |
|---|---|
| Studio | http://127.0.0.1:54323 |
| Mailpit — magic-link emails land here | http://127.0.0.1:54324 |
| Health check | http://localhost:3000/api/health |

To sign in, your address must be in **both** lists — the `auth_allowlist` table
and `AUTH_ALLOWED_EMAILS`. That redundancy is deliberate (decision 0001):

```bash
docker exec supabase_db_klawfin psql -U postgres -d postgres -c   "insert into auth_allowlist (email, full_name, role)
   values ('you@example.com', 'Your Name', 'owner');"
```

`supabase/seed.sql` provides `dev@groundwork.local` so a `db reset` never leaves
you locked out. Never commit a real address to it.

#### Demo and QA accounts

```bash
pnpm demo                          # 3 accounts (owner/analyst/viewer) + 2 fabricated clients
pnpm demo --open                   # one signed-in window per role
pnpm demo --link demo.owner@groundwork.local
```

`--open` gives you all three roles side by side. **Separate windows, not tabs** —
tabs share a cookie jar, so signing in as the viewer would evict the owner's
session and you would be comparing one role against itself. Each window gets its
own Chromium `--user-data-dir`, posts the sign-in form itself, and then opens its
own link; the browser has to be the thing that posts the form, because the link
is PKCE-bound to a cookie that response sets. Needs Chrome or Edge — set
`BROWSER` to override the path.

There is no demo password, deliberately — magic link with an allowlist was
chosen so that no single shared string signs anyone in. `pnpm demo` creates the
accounts through the auth admin API, which fires the same allowlist trigger a
real sign-in does, then seeds two invented companies:

| | |
|---|---|
| **Marrowfield** | revenue stage, 98% coverage, scores 88 — *Raise-ready*. The clean run to a PDF. |
| **Sundermere** | pre-revenue, 48% coverage, scores 46 — *Significant gaps*. Exercises the substitute ladder and carries one deliberate warning. |

The script **refuses to run against anything but a local stack**, because
against a hosted project it would be an account-creation backdoor.

**The magic link only works in the browser that submitted the sign-in form.**
The app uses PKCE: submitting the form sets a code-verifier cookie, and the
link is exchanged against it. Pasting a link into a different browser — or
using one minted by `admin/generate_link`, which returns the session in a URL
fragment the server never sees — lands on `/login?error=1` with no explanation,
by design. So: open `/login` in your browser, enter the address, then run
`pnpm demo --link <address>` and open the result in that same browser.

Two things to know when sign-in misbehaves:

- Supabase **silently drops** a magic link whose redirect is not in its allow
  list. Keep `additional_redirect_urls` in `supabase/config.toml` in step with
  `APP_URL`. The route logs the reason to the server console; the browser
  deliberately sees the same generic message either way.
- Two sends to the same address within a second: the second is dropped in
  silence (`max_frequency` in `supabase/config.toml`). The hourly `email_sent`
  limit in the same file does **not** apply locally — it needs a custom SMTP
  server, and local mail goes to Mailpit. Measured, not assumed.

Leave `DISABLE_LLM_GENERATION=true` for all UI work. The whole pipeline —
generation, guardrails, review screen, export, audit trail — runs offline at no
cost (decision 0014).

### Seed data

Fixtures live in `packages/core/tests/fixtures.ts` and are **fabricated**. They must never contain real client data.

> Never copy production client data into a development environment. If you need realistic data for testing, fabricate it. A real cap table on a laptop in a dev database is the kind of thing that ends an advisory practice.

---

## The one design decision that governs everything

**Deterministic code assigns every score. The LLM writes narrative about scores it is handed as facts.**

The source documents disagreed on this — the architecture document had the model assigning sub-criterion points and stated plainly that determinism could not be promised. The PRD, the readme and the sprint plan all specify the opposite. [Decision 0002](./docs/decisions/0002-deterministic-scoring.md) records the resolution and the reasoning in full.

Two kinds of sub-criterion, both deterministic:

- **derived** (18) — a rule reads structured values and returns a level. Cap-table arithmetic, month-series analysis, use-of-funds totals.
- **anchored** (11) — Dhruv reads the printed anchor text and selects the level. His selection is stored intake data, so the same intake yields the same score forever. He is the assessor; the tool is the instrument.

Neither involves the model. `@klawfin/rubric` has no dependency on `@klawfin/llm` and the package graph makes acquiring one a build error.

---

## Architecture

```
core ← rubric ← validation ← llm ← web
```

`@klawfin/rubric` is pure: no network, no database, no `Date.now()`, no randomness. Same input, same rubric version, same output, forever. It is the most heavily tested package here and the reason the tool can be defended line by line in a client meeting.

Packages export TypeScript source directly, so there is no build step to orchestrate. See [0012](./docs/decisions/0012-repo-layout.md).

### Structural rules

1. **`packages/rubric` is pure.** Determinism is asserted in tests, not assumed.
2. **The LLM never computes a score.** Any code path where model output influences a number is a bug.
3. **Prompts are files.** Not inline template literals, not database rows. Prompt changes are reviewed as code changes.
4. **`core/legal/disclaimers.ts` is fixed text.** Not generated, not editable through the UI, not conditionally omitted for any reason.
5. **Privileged operations are server-side.** `packages/llm/src/client.ts` opens with `import 'server-only'` so an accidental client import fails at build time rather than leaking a key.
6. **All audit writes go through one entry point**, so nothing gets forgotten.

---

## Scripts

```bash
pnpm dev          # Next.js dev server (once apps/web is built)
pnpm build        # production build — must pass before any deploy
pnpm typecheck    # tsc --noEmit across the workspace
pnpm test         # unit tests
pnpm test:coverage
pnpm verify       # lint + typecheck + test + palette — what the pre-push hook runs

pnpm demo         # demo/QA accounts and fabricated clients (local stack only)
pnpm db:seed      # apply supabase/seed.sql without a full reset
pnpm check:palette
```

### Where the tests are, and why there

| Module | Coverage | Why it matters |
|---|---|---|
| `rubric/score.ts` | 96% | A bug here puts a wrong number in a paying client's hand |
| `rubric/mapping.ts` | 87% | Every 0–4 derivation rule |
| `rubric/priority.ts` | 97% | Ordering must not depend on insertion order |
| `validation/contradictions.ts` | 96% | Every check, both directions |
| `validation/coverage.ts` | 100% | The generation gate |
| `llm/guardrails.ts` | 100% | Every prohibited pattern, matching and non-matching |
| `llm/cost.ts` | 100% | The ₹40 cap is the only thing between a bug and the prepaid credit |

Not tested, deliberately: component rendering, styling, field-by-field form behaviour. One engineer, two weeks. Put the tests where correctness is load-bearing.

---

## Cost discipline

Target: **under ~₹40 of Anthropic spend per report.**

| Control | State |
|---|---|
| Pre-flight hard abort over cap | Implemented — assumes full `max_tokens`, because a cap that only holds when the model is terse is not a cap |
| `max_tokens` capped at 8,000 | Implemented |
| Exactly one retry, never a loop | Implemented |
| Cost from actual usage, in paise | Implemented |
| Per-model pricing table | Implemented — switching models is an env change |
| Prompt caching | **Off**, deliberately — see [0010](./docs/decisions/0010-prompt-caching.md) |

Two corrections to the source documents, both recorded in [0006](./docs/decisions/0006-model-selection.md):

- The PRD budgets at **$3/$15 per MTok**, which is previous-generation pricing. Current rates make the mid-tier option *cheaper* than assumed.
- The architecture document advises pinning a **dated model snapshot**. Current model ids are complete as written; a date suffix produces a 404. A test enforces this.

Combined with deterministic scoring removing six calls per report, the ₹40 ceiling has far more headroom than either document projected.

---

## Security non-negotiables

1. **RLS on every client-data table, deny by default.** A table without a policy is a bug that ships client financials. Note the footgun: RLS enabled with *no* policy denies everything to `authenticated` and allows everything to `service_role`, so code using the admin client keeps working while the page silently shows nothing.
2. **Service-role key server-side only.** Never in a component that renders in the browser, never in a `NEXT_PUBLIC_` variable.
3. **Private storage bucket, signed URLs only**, short expiry, UUID-derived paths. No client name in a storage path — paths leak into logs and browser history.
4. **Never log client financial data**, request bodies containing intake, or any API key.
5. **Send the minimum to the model.** Structured intake fields only. No documents, no founder contact details, no ID or bank details — and those are not collected in the first place, which is the only reliable way not to send them.
6. **Client data is not used for model training.** Verify against the terms in force, record the date checked, re-check at renewal. **Do not put this claim in the engagement letter before it is verified.**
7. **Audit log every generation and every export.** Append-only, enforced in the database. Tamper-evident, not tamper-proof — do not oversell it.
8. **A working deletion path exists** and reaches storage objects, not only database rows.
9. **No real client data in dev, seeds, fixtures, screenshots or bug reports.** Fabricate it.

---

## Legal constraints on output

1. Every output carries a disclaimer: business assessment, **not investment advice, not a solicitation**. Klawfin holds no securities licence.
2. Reports go **to the startup, about itself**. There is no investor-facing surface in any phase. Do not build one, do not prototype one.
3. The score is an internal readiness diagnostic — not a rating, not a valuation, not a prediction, and never a signal to a third party.

The prohibited-language check in `packages/llm/src/guardrails.ts` is the backstop. **Never disable it, never bypass it for a demo, never ship with it stubbed.** A false positive costs thirty seconds; a false negative is a regulatory exposure for an unincorporated company with no compliance function.

---

## Before you commit

- [ ] **No secrets.** Read `git diff --staged` and actually look.
- [ ] **No real client data** in seeds, fixtures, tests, screenshots or comments.
- [ ] **No `.env*` staged** except `.env.example`, placeholders only.
- [ ] **Nothing secret in a `NEXT_PUBLIC_` variable.**
- [ ] **No client data in new log statements.**
- [ ] **Scoring change?** `RUBRIC_VERSION` bumped in this commit.
- [ ] **Prompt change?** `PROMPT_VERSION` bumped in this commit.
- [ ] **New table?** RLS enabled with a deny-by-default policy, same migration.
- [ ] **Guardrails and disclaimer intact.** Not stubbed, not commented out, not skipped "for now".
- [ ] `pnpm typecheck && pnpm test` pass.

If a secret or real client data has already been committed: **rotate the credential or notify Dhruv about the exposure first**, then deal with the history. Rewriting history does not un-leak anything.

---

## Open items that block delivery

| Item | Owner | Blocks |
|---|---|---|
| Disclaimer legal review ([0009](./docs/decisions/0009-disclaimer-wording.md)) | Dhruv + counsel | **The first client report** |
| Supabase region choice (`OPEN-10`) | Nikhil | Any real client data. Decide in the first hour — migrating later is painful |
| Anthropic commercial-terms verification | Nikhil | Any written claim about training use |
| Engagement letter | Dhruv | Any client data entering the system |
| Vercel Hobby commercial-use terms | Nikhil | First invoice. ~₹1,760/month against ₹6,100 cash is a real decision |

Full list in [docs/decisions/0000-index.md](./docs/decisions/0000-index.md).
