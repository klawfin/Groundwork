-- ---------------------------------------------------------------------------
-- Local development seed. Runs automatically on `supabase db reset`.
--
-- FABRICATED DATA ONLY. This file is committed, so it must never contain a
-- real address, a real client, or a real number (readme.md: no real client
-- data in seeds, fixtures, tests or screenshots).
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
