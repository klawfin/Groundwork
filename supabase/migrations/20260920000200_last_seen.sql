-- ---------------------------------------------------------------------------
-- Let a user record their own sign-in.
--
-- THE BUG THIS FIXES, found by signing in as all three roles at once:
--
-- `app_users` carries exactly two policies. `app_users_self_read` lets you see
-- yourself; `app_users_owner_write` is FOR ALL and requires `owner`. So the
-- callback's `last_seen_at` stamp worked for the owner and did nothing at all
-- for an analyst or a viewer.
--
-- IT FAILED WITHOUT AN ERROR, which is why nothing caught it. On UPDATE, an
-- RLS `USING` clause is a ROW FILTER, not a permission check: the row is
-- simply not visible, so Postgres reports `UPDATE 0` and PostgREST returns
-- success. `lib/db/writeGuard.ts` inspects `error`, and there is no error -
-- so even the guard written specifically to catch discarded write failures
-- cannot see this class. Only a WITH CHECK violation raises.
--
-- Consequence: `last_seen_at` was frozen at first login for every non-owner,
-- since `handle_new_user` sets it once as SECURITY DEFINER and nothing could
-- ever update it again. The monthly access review (docs/PRODUCTION.md) reads
-- that column to decide who still needs access, and it would have been stale
-- for precisely the accounts most likely to be revoked.
--
-- ---------------------------------------------------------------------------
-- WHY A FUNCTION RATHER THAN A SELF-UPDATE POLICY
--
-- The obvious fix is a policy like
--
--   create policy app_users_self_touch on app_users
--     for update using (id = auth.uid()) with check (id = auth.uid());
--
-- and it is a privilege escalation. RLS grants or refuses a ROW; it cannot
-- restrict which COLUMNS an update touches. That policy would let any viewer
-- run `update app_users set role = 'owner' where id = auth.uid()` and hand
-- themselves write access to every client record in the system.
--
-- A SECURITY DEFINER function grants exactly one operation instead: stamp my
-- own presence. There is no argument, so there is nothing to point at another
-- row, and the column list is fixed in the body.
-- ---------------------------------------------------------------------------

create or replace function touch_last_seen()
returns void
language sql
security definer
set search_path = public
as $$
  -- `auth.uid()` only, never a parameter. An id argument would make this a
  -- function for writing to other people's rows.
  update app_users
  set last_seen_at = now()
  where id = auth.uid()
    and is_active;
$$;

-- Not callable by anon. An unauthenticated caller has no `auth.uid()`, so the
-- update would match nothing, but refusing the grant says so explicitly rather
-- than relying on that.
revoke all on function touch_last_seen() from public, anon;
grant execute on function touch_last_seen() to authenticated;
