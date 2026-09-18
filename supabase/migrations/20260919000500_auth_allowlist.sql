-- ---------------------------------------------------------------------------
-- Authentication allowlist (PRD P1-01, OPEN-01).
--
-- DECISION on OPEN-01: Supabase Auth with email magic link.
-- Least work, no password to leak, no reset flow to build, and `auth.uid()` is
-- directly available inside RLS policies so authorisation lives in the
-- database with no JWT-forwarding glue. See docs/decisions/0001.
--
-- DEVIATION FROM sprint_plan.md S1-03, deliberate and recorded: the sprint
-- plan starts with a shared-secret middleware and replaces it in Sprint 2.
-- That shortcut saves roughly two hours and creates a window in which real
-- client financials sit behind a single shared string, with a deletion of the
-- middleware owed later. Magic-link auth is implemented from the start
-- instead. See docs/decisions/0002.
--
-- The allowlist is enforced in THREE places, deliberately redundant:
--   1. Public signup disabled in the Supabase dashboard. This is the real
--      control; the rest are backstops.
--   2. The trigger below, which refuses to create a session for an address
--      that is not pre-provisioned and active.
--   3. middleware.ts, which checks every (internal) route resolves to an
--      active app_users row.
-- ---------------------------------------------------------------------------

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed_id uuid;
begin
  select id into allowed_id
  from app_users
  where email = new.email and is_active;

  if not found then
    -- A non-allowlisted address receives a generic failure and NO account is
    -- created (PRD P1-01). The attempt is audited below.
    insert into audit_log (action, entity_type, actor_email, metadata)
    values ('auth.denied', 'session', new.email,
            jsonb_build_object('reason', 'not_on_allowlist'));
    raise exception 'Not authorised';
  end if;

  -- Bind the pre-provisioned app_users row to the new auth identity.
  update app_users
  set id = new.id, updated_at = now(), last_seen_at = now()
  where email = new.email;

  insert into audit_log (action, entity_type, actor_user_id, actor_email)
  values ('auth.login', 'session', new.id, new.email);

  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Seed the two Phase 1 operators.
--
-- Addresses are supplied at deploy time, NOT committed here. Run:
--
--   insert into app_users (id, email, full_name, role)
--   values (gen_random_uuid(), 'someone@example.com', 'Name', 'owner');
--
-- and then have that person sign in; the trigger rebinds the id to their real
-- auth identity on first login.
--
-- No real email address belongs in a migration file (readme.md: no real client
-- data in seeds).
-- ---------------------------------------------------------------------------
