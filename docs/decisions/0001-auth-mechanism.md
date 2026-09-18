# 0001 — Auth mechanism: Supabase magic link with a hard allowlist

**Date:** 2026-09-19 · **Status:** Decided · **Resolves:** PRD `OPEN-01`

## Decision

Supabase Auth, email magic link, hard allowlist of pre-provisioned addresses.

## Reasoning

- Least work of the three options the PRD names, and the PRD says so.
- No password to leak, no reset flow to build, no OAuth app to register — and Google OAuth restricted to the Klawfin domain is not available anyway, because Klawfin is unincorporated and the domain does not exist.
- `auth.uid()` is directly available inside RLS policies, so authorisation lives in the database with no JWT-forwarding glue. That is what makes RLS-as-the-boundary cheap rather than duplicative.

## Enforcement — three places, deliberately redundant

1. Public signup **disabled in the Supabase dashboard**. This is the real control; the rest are backstops.
2. A database trigger refusing to bind a session to an address not already active in `app_users`, auditing the refusal as `auth.denied`.
3. `middleware.ts` checking that every `(internal)` route resolves to an active `app_users` row.

## Deviation from sprint_plan.md, recorded

S1-03 plans a shared-secret middleware for Sprint 1, replaced by real auth in Sprint 2 (S2-01). **Not implemented.** Magic-link auth is in from the start.

The shortcut saves roughly two hours. Against that: it creates a window in which real client cap tables sit behind a single shared string; it owes a deletion later that is easy to forget; the sprint plan's own note concedes "it is not acceptable beyond" two weeks; and PRD P1-01 requires failed sign-in attempts in the audit log, which a shared secret cannot produce. The two hours are not worth it.

## UNVERIFIED

Whether Supabase Auth's built-in email is reliable at this volume — historically its rate limits are intended for development. **Configure Resend as custom SMTP on day one.** A magic link that does not arrive is a locked-out CEO on the morning of a client meeting.
