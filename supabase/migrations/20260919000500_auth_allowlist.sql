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
--   3. middleware.ts and resolveActor, which check every request resolves to
--      an active app_users row.
--
-- ---------------------------------------------------------------------------
-- WHY THE ALLOWLIST IS ITS OWN TABLE
--
-- An earlier version of this migration used `app_users` as both the allowlist
-- and the user record, and pre-provisioned a row with a random uuid that the
-- trigger would later rebind to the real auth identity.
--
-- That could never have worked, and the first run against a real database
-- proved it. Two locks facing each other:
--
--   * `app_users.id` references `auth.users(id)`, so a row CANNOT be inserted
--     before the person has an auth identity. Pre-provisioning was impossible.
--   * The trigger refuses to create the auth identity unless a pre-provisioned
--     row already exists. Signing up was impossible.
--
-- Nobody could ever have signed in. Dropping the foreign key would have traded
-- that for a worse problem: nine other tables reference `app_users.id` with no
-- ON UPDATE CASCADE, so the rebind would have been blocked the moment a user
-- had created anything.
--
-- Splitting the two concerns removes the mutation entirely. `auth_allowlist`
-- says who MAY sign in and carries no foreign key. `app_users` says who HAS
-- signed in, is created once by the trigger with the real auth id, and that id
-- is never rewritten.
-- ---------------------------------------------------------------------------

create table auth_allowlist (
  email      citext primary key,
  full_name  text,
  role       user_role not null default 'viewer',
  is_active  boolean not null default true,
  invited_by text,
  invited_at timestamptz not null default now()
);

alter table auth_allowlist enable row level security;

-- Readable by staff so the team can see who has access; writable only by the
-- service role, so granting yourself access is not something the application
-- can be talked into doing.
create policy auth_allowlist_staff_read on auth_allowlist
  for select to authenticated using (is_staff());

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  entry auth_allowlist;
begin
  select * into entry
  from auth_allowlist
  where email = new.email and is_active;

  if not found then
    -- A non-allowlisted address receives a generic failure and NO account is
    -- created (PRD P1-01).
    --
    -- NOTE ON AUDITING, learned by running it: an `insert into audit_log`
    -- here CANNOT WORK. `raise exception` aborts the transaction and takes the
    -- insert with it, so the row is written and immediately rolled back. An
    -- earlier version of this trigger did exactly that and silently recorded
    -- nothing.
    --
    -- Denials are audited by the APPLICATION instead, in
    -- apps/web/src/app/auth/magic-link/route.ts, which checks the allowlist
    -- before asking Supabase for a link and writes the audit row in its own
    -- committed transaction.
    --
    -- This `raise log` is the backstop for the one path the application does
    -- not see: a request made directly against the Supabase auth endpoint. It
    -- lands in the Postgres log, not the audit table, and that difference is
    -- why the application check is the primary record rather than a duplicate.
    raise log 'auth.denied: % is not on the allowlist', new.email;
    raise exception 'Not authorised';
  end if;

  -- Created ONCE, with the real auth id. Never rebound afterwards.
  insert into app_users (id, email, full_name, role, last_seen_at)
  values (new.id, new.email, entry.full_name, entry.role, now());

  insert into audit_log (action, entity_type, actor_user_id, actor_email)
  values ('auth.login', 'session', new.id, new.email);

  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Seeding operators.
--
-- Addresses are supplied at deploy time, NOT committed here. Run:
--
--   insert into auth_allowlist (email, full_name, role)
--   values ('someone@example.com', 'Name', 'owner');
--
-- and then have that person sign in. The trigger creates their `app_users`
-- row on first login, with the role recorded here.
--
-- The address must ALSO appear in AUTH_ALLOWED_EMAILS. That redundancy is
-- deliberate (docs/decisions/0001): a session must not be honoured for an
-- address that has since been removed from either list.
--
-- No real email address belongs in a migration file (readme.md: no real client
-- data in seeds).
-- ---------------------------------------------------------------------------
