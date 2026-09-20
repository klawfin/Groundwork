-- ---------------------------------------------------------------------------
-- Local development and demo seed. Runs automatically on `supabase db reset`.
--
-- FABRICATED DATA ONLY. This file is committed, so it must never contain a
-- real address, a real client, or a real number (readme.md: no real client
-- data in seeds, fixtures, tests or screenshots).
--
-- This file seeds the ALLOWLIST ONLY - who may sign in. It cannot seed the
-- accounts themselves, and the reason is structural rather than an oversight:
-- `app_users.id` references `auth.users(id)`, so a user row cannot exist
-- before the person has an auth identity, and that identity is created by the
-- auth service, not by SQL. The same lock is what broke sign-in entirely once
-- before (see the migration that splits `auth_allowlist` from `app_users`).
--
-- `pnpm demo` does the rest: it creates the auth identities through the admin
-- API, which fires the trigger that writes `app_users`, then seeds fabricated
-- clients and prints a sign-in link for each account.
--
-- To sign in as yourself locally, add your own address WITHOUT committing it:
--
--   docker exec supabase_db_klawfin psql -U postgres -d postgres -c \
--     "insert into auth_allowlist (email, full_name, role)
--      values ('you@example.com', 'Your Name', 'owner');"
--
-- and add the same address to AUTH_ALLOWED_EMAILS in .env. Both lists are
-- checked, deliberately (docs/decisions/0001).
-- ---------------------------------------------------------------------------

insert into auth_allowlist (email, full_name, role, invited_by)
values ('dev@groundwork.local', 'Local Developer', 'owner', 'seed.sql')
on conflict (email) do nothing;

-- ---------------------------------------------------------------------------
-- Demo accounts - ONE PER ROLE.
--
-- Three rather than one because the role is not cosmetic: `can_write()` gates
-- every write policy in the database on `role in ('owner','analyst')`, and a
-- demo that only ever signs in as an owner never shows that. A viewer who can
-- open a report and cannot change it is the single most reassuring thing to
-- show a client, and the hardest thing to claim credibly without showing it.
--
-- The addresses are on `.local`, which is unroutable by design (RFC 6762).
-- Mail to them cannot leave the machine even if a real SMTP server is ever
-- configured by mistake, and they cannot collide with a real person's inbox.
--
-- These rows are harmless on their own. An allowlist entry grants nothing
-- until an auth identity exists for the same address, and `pnpm demo` refuses
-- to create one against anything but a local stack.
-- ---------------------------------------------------------------------------

insert into auth_allowlist (email, full_name, role, invited_by)
values
  ('demo.owner@groundwork.local',   'Demo Owner',   'owner',   'seed.sql'),
  ('demo.analyst@groundwork.local', 'Demo Analyst', 'analyst', 'seed.sql'),
  ('demo.viewer@groundwork.local',  'Demo Viewer',  'viewer',  'seed.sql')
on conflict (email) do nothing;
