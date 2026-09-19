# Requirement traceability

## Why this file exists

`docs/AI_CODING_RULES.md` says:

> When AI and the spec disagree, the spec wins. ARCHITECTURE.md and PLAN.md are
> the source of truth.

**Those documents are not in this repository and never have been.** The PRD,
architecture document, plan, sprint plan and todo list were supplied during
development and exist only outside version control. Every `PRD §x.y` and
`architecture §x.y` citation in the codebase points at a document nobody
cloning this repo can read.

That is a problem worth fixing rather than working around, and it gets worse in
Month 2: Shashank and Purven leave after Month 1, and the three people doing QA
will have the code, these decision records, and nothing else.

**Action required (not something code can fix): commit the source documents to
`docs/spec/`.** Until that happens, this file is the closest thing to a
requirements index, and it is derived from the code rather than from the spec —
so it records what was *built*, not what was *asked for*. Those are not the
same claim, and where they differ only the missing documents can say so.

## Phase 1 requirements

Every row below was produced by searching the codebase for its requirement id.
The one-line descriptions are drawn from the code comments that cite them.

| ID | What it covers | Where it lives | Tests |
|---|---|---|---|
| **P1-01** | Magic-link sign-in, allowlist, server-side route guard | [middleware.ts](../apps/web/middleware.ts), [auth/magic-link](../apps/web/src/app/auth/magic-link/route.ts), [auth/callback](../apps/web/src/app/auth/callback/route.ts), [session.ts](../apps/web/src/lib/auth/session.ts), [auth_allowlist.sql](../supabase/migrations/20260919000500_auth_allowlist.sql) | `triggers.test.ts`, `rls.test.ts` |
| **P1-02** | Create a client, duplicate-name warning | [actions.ts](../apps/web/src/app/actions.ts), [NewClientForm.tsx](../apps/web/src/app/clients/NewClientForm.tsx), [queries.ts](../apps/web/src/lib/db/queries.ts) | — |
| **P1-03** | Sectioned intake, autosave, resumable | [IntakeForm.tsx](../apps/web/src/app/assessments/%5BassessmentId%5D/IntakeForm.tsx), [schema.ts](../packages/core/src/intake/schema.ts) | `score.test.ts` |
| **P1-04** | Live score before spending, every sub-criterion inspectable | [ScorePanel.tsx](../apps/web/src/app/assessments/%5BassessmentId%5D/ScorePanel.tsx), [score.ts](../packages/rubric/src/score.ts), [mapping.ts](../packages/rubric/src/mapping.ts) | `score.test.ts`, `priority.test.ts` |
| **P1-05** | Contradiction detection and dismissal with a reason | [contradictions.ts](../packages/validation/src/contradictions.ts), [ScorePanel.tsx](../apps/web/src/app/assessments/%5BassessmentId%5D/ScorePanel.tsx), `dismissContradictionAction` | `contradictions.test.ts` |
| **P1-06** | Narrative generation | [generate/route.ts](../apps/web/src/app/api/assessments/%5BassessmentId%5D/generate/route.ts), [run.ts](../apps/web/src/lib/generation/run.ts) | `stub.test.ts`, `pipeline.test.ts` |
| **P1-07** | Review and edit the narrative; edit magnitude (M4) | [NarrativePanel.tsx](../apps/web/src/app/assessments/%5BassessmentId%5D/NarrativePanel.tsx), [editMagnitude.ts](../packages/llm/src/editMagnitude.ts) | `editMagnitude.test.ts`, `pipeline.test.ts` |
| **P1-08** | Export a PDF; only route to a stored file | [report/route.ts](../apps/web/src/app/api/assessments/%5BassessmentId%5D/report/route.ts), [download/route.ts](../apps/web/src/app/api/reports/%5BreportId%5D/download/route.ts), [ReportDocument.tsx](../apps/web/src/lib/pdf/ReportDocument.tsx) | `pdf.test.ts`, `pipeline.test.ts` |
| **P1-09** | Regeneration creates a version, never overwrites | [report/route.ts](../apps/web/src/app/api/assessments/%5BassessmentId%5D/report/route.ts), [core_tables.sql](../supabase/migrations/20260919000200_core_tables.sql) | `triggers.test.ts` |
| **P1-10** | Cost per report | [admin/costs](../apps/web/src/app/admin/costs/page.tsx), [cost.ts](../packages/llm/src/cost.ts) | `cost.test.ts` |
| **P1-11** | Client deletion and retention purge, including storage | [deletion.ts](../apps/web/src/lib/db/deletion.ts), [retention.ts](../apps/web/src/lib/db/retention.ts), [ClientLifecycle.tsx](../apps/web/src/app/clients/%5BclientId%5D/ClientLifecycle.tsx), [admin/retention](../apps/web/src/app/admin/retention/page.tsx) | `deletion.test.ts`, `retention.test.ts` |

## Known gaps

These are stated rather than hidden, because a traceability table that implies
completeness it does not have is worse than none.

| Gap | Why it matters |
|---|---|
| **The spec is not in the repo** | Every `PRD §x.y` citation is unverifiable. This is the largest one. |
| **No live model call has completed** | The transport reaches OpenRouter and is correctly classified, but the account has no credit (HTTP 402), so no generation has returned real prose. The retry, repair and cost-ledger branches remain unexercised against a real response. |
| **P1-02 has no automated test** | Client creation is a thin wrapper over Supabase, but "thin" is an assumption nobody has checked. |
| **Retention purge is not scheduled** | It is now reachable and tested at `/admin/retention`, but nothing runs it unattended. That is deliberate for now: architecture 3.6 requires a month of reviewed dry-run output before anything is scheduled. |
| **Disclaimer wording is unapproved** | `DISCLAIMER_APPROVAL.status` is `pending_legal_review`, and every PDF carries a PENDING LEGAL SIGN-OFF marker until counsel clears it. That marker is intentional — do not remove it to make a demo look tidy. |

## Test suites

| Suite | Command | Needs |
|---|---|---|
| Unit and pipeline — **303 tests** | `pnpm test` | nothing |
| Integration — **19 tests** | `pnpm test:integration` | `npx supabase start` |

The integration suite exists because every defect on the first live run lived in
a seam between the application and something on the other side of a boundary — a
trigger, an RLS policy, a third-party rule. A unit test cannot see those, because
it replaces the thing on the other side of the seam. It covers the allowlist
trigger, report and narrative immutability, RLS for anonymous / viewer / owner,
the audit-write permission that denials depend on, the retention purge and
client deletion.

With no local stack running it **skips** rather than fails. A red suite meaning
"Docker is not running" teaches people to ignore red suites.

## Verified against a live database

The stack was run end to end on 2026-09-19 against a local Supabase instance:
all six migrations applied clean, magic-link sign-in completed, a fabricated
client and assessment were created through RLS, generation ran, a 14-page PDF
was rendered and uploaded to private storage, and it was retrieved through a
signed URL. The disclaimer appeared on every page and the audit trail recorded
every step.

That run found eight defects that every unit test had passed over. They are
listed in [decision 0015](./decisions/0015-first-live-run.md); the short version
is that **nobody could have signed in and no report could ever have been
downloaded.** Both are now fixed and verified.

## Metrics

| ID | Metric | Where it is computed |
|---|---|---|
| M4 | Median share of narrative characters edited | [editMagnitude.ts](../packages/llm/src/editMagnitude.ts), stored on `assessment_narratives.edit_magnitude` |
| M5 | Cost per report, median and p95 | [cost.ts](../packages/llm/src/cost.ts) `costStats`, shown at `/admin/costs` |

M4 is only measurable because `raw_response` is never modified — a database
trigger enforces it. Collapsing the raw and edited columns would silently
destroy the most important quality metric in the project.
