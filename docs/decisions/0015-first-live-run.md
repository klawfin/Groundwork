# 0015 — What the first live run found

**Status:** accepted
**Date:** 2026-09-19

## Context

Until today the database layer had never executed. Migrations had never been
applied, RLS had never been evaluated, no magic link had been sent, no PDF had
been uploaded. 299 unit tests passed and the build was green.

The stack was brought up locally (`supabase start`, all six migrations, private
`reports` bucket) and driven end to end with a fabricated client: sign in,
create client, create assessment, lock intake, generate, export, download.

**Eight defects surfaced. Not one was visible to the test suite.** Two of them
made the product completely unusable.

## The two that mattered

### Nobody could have signed in

`app_users.id` referenced `auth.users(id)`, so a row could not be inserted
before the person had an auth identity. The signup trigger refused to create
that identity unless a pre-provisioned `app_users` row already existed.

Two locks facing each other. Pre-provisioning was impossible, signing up was
impossible, and the seeding instructions committed in the migration described a
procedure that could never have run.

Dropping the foreign key would have traded it for something worse: nine tables
reference `app_users.id` with no `ON UPDATE CASCADE`, so the trigger's id-rebind
would have been blocked the moment a user created anything.

Fixed by splitting the concerns. `auth_allowlist` says who **may** sign in and
carries no foreign key; `app_users` says who **has** signed in and is written
once with the real auth id, never rewritten.

### No report could ever have been downloaded

The export route inserted the report row with `storage_path: 'pending'`,
uploaded the PDF, then updated the path.

`reports_protect_immutability` — a trigger in this same repository — forbids
changing `storage_path` after insert. The update was rejected every time. Its
error was not checked, so the route returned **200 with a download URL**, and
the row pointed at `'pending'` permanently. The PDF sat in the bucket,
unreachable, and the download endpoint returned 502 forever.

Fixed by generating the report id in the application, so the final path is known
before anything is written and the row is correct on first insert. Upload now
happens **before** the insert: a failed upload leaves no row, rather than a row
promising a file that does not exist.

## The other six

| # | Defect | Consequence |
|---|---|---|
| 3 | The trigger's `auth.denied` insert sat before a `raise exception` | The exception rolls back the insert. Denied attempts recorded nothing, ever. |
| 4 | `auth.denied` from the app used the anon client | `audit_log` grants INSERT to `authenticated` only, so RLS rejected it and a `.catch()` swallowed the rejection. The one event most worth recording — somebody probing the sign-in form — was silently dropped. Now written with the service-role client. |
| 5 | `shouldCreateUser: false` on the magic-link request | Looked like defence in depth. A first-time user has no `auth.users` row, so Supabase declined to send a link at all. First login was impossible. |
| 6 | `emailRedirectTo` was not in Supabase's redirect allow list | Supabase drops such a link **silently**. No email, and the route discarded the error, so there was nothing to find. |
| 7 | The magic-link route swallowed every error | A generic reply to the browser is the security requirement. A generic server log is just a missing diagnostic. The reason is now logged server-side. |
| 8 | `download_count` was assigned `1` rather than incremented | The counter stopped at one however many times a report was downloaded, making it useless as the "was this actually delivered" signal it exists to be. |

## What this says about the test suite

The tests are not weak. They are thorough about everything they cover, and they
caught real bugs while the code was being written. But every one of these eight
defects lives in a seam:

- between the application and a database constraint (2, 3, 8)
- between the application and an RLS policy (4)
- between the application and a third-party service's rules (5, 6)
- between an error being returned and anybody looking at it (2, 4, 6, 7)

Seams are invisible to unit tests by construction, because a unit test replaces
the thing on the other side of the seam. Four of the eight were **silent
failures**: the code did the wrong thing and reported success.

Two conclusions, both acted on:

1. **Check the error.** Every one of the silent failures had an error value
   available and discarded. `await db.from(...).update(...)` returns an error
   and ignoring it is how a 200 gets returned for work that did not happen.
2. **Run it against the real thing before believing it works.** A green suite
   and a green build established nothing about whether a person could sign in.

## Consequences

- `supabase/seed.sql` seeds a fabricated local operator, so `db reset` never
  leaves a developer locked out. No real address may be committed to it.
- `supabase/config.toml` is now part of the repository, and its
  `additional_redirect_urls` must be kept in step with `APP_URL`.
- The environment file lives at `apps/web/.env`, not the repository root. Next.js
  loads env relative to its own project directory; a root `.env` is silently
  ignored and presents as `"database": "unreachable"` with no other clue.
- The README quickstart now describes this setup, including the two failure
  modes most likely to waste an afternoon: silent redirect-allowlist rejection
  and per-address send throttling.

## Related

- [[0001-auth-mechanism]] — the allowlist design this run corrected.
- [[0014-offline-generation]] — the offline stub, which is what let the whole
  run happen at zero cost.
