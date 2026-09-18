-- ---------------------------------------------------------------------------
-- Extensions and enums.
--
-- Klawfin Readiness Engine, Phase 1.
-- Forward-only migrations. Never edit schema through the Supabase dashboard:
-- a dashboard change is invisible to git and will be silently reverted by the
-- next migration (architecture 7.2).
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "citext";     -- case-insensitive email
create extension if not exists "pg_trgm";    -- client name search

-- Role exists now so Phase 2 does not require a migration on a live table
-- holding real client data (architecture 6.3).
create type user_role as enum ('owner', 'analyst', 'viewer');

-- 'self_serve' is unused until Phase 2. Same reasoning.
create type client_source as enum ('internal', 'self_serve');

create type assessment_status as enum (
  'draft',
  'intake_locked',
  'scored',
  'generating',
  'review',
  'delivered',
  'abandoned',
  'failed'
);

-- 'summary' is the Phase 2 public tier. Not built; the column exists so the
-- seam is visible (architecture ADR-010).
create type report_tier as enum ('summary', 'full');

create type llm_purpose as enum ('narrative', 'repair');

create type retention_policy as enum ('standard_24m', 'short_90d', 'legal_hold');

create type deletion_status as enum ('requested', 'approved', 'executed', 'rejected');

-- Generation outcome, for metric M3 (generation success rate without fallback).
create type generation_outcome as enum (
  'success',
  'success_after_retry',
  'fallback',
  'blocked_budget',
  'blocked_guardrail',
  'failed'
);
