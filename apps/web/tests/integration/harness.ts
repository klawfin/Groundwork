/**
 * Integration-test harness: a REAL local Supabase, not a mock.
 *
 * Every defect found on the first live run (decision 0015) lived in a seam
 * between the application and something on the other side of a boundary - a
 * trigger, an RLS policy, a third-party rule. A unit test cannot see those,
 * because it replaces the thing on the other side of the seam. These tests
 * exist to cover that class, and nothing else: there is no point re-testing
 * the scorer here, where it would run slower and prove less.
 *
 * They are NOT part of `pnpm test`. That suite must stay runnable with no
 * Docker, no network and no credentials. Run these with:
 *
 *   npx supabase start
 *   pnpm test:integration
 *
 * If the stack is not up, every test SKIPS rather than fails. A red suite that
 * means "Docker is not running" trains people to ignore red suites.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHmac } from 'node:crypto';

import type { Database } from '../../src/lib/db/types';

/**
 * The published local-development keys.
 *
 * Identical on every machine running `supabase start`, documented publicly by
 * Supabase, and able to reach nothing but the container on this laptop. They
 * are checked in on purpose so these tests need no setup; they must never be
 * reused for a hosted project.
 */
export const LOCAL = {
  url: 'http://127.0.0.1:54321',
  anonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
  serviceKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
  jwtSecret: 'super-secret-jwt-token-with-at-least-32-characters-long',
} as const;

/** Is a local stack listening? Decides skip-vs-run for the whole suite. */
export async function stackIsUp(): Promise<boolean> {
  try {
    const response = await fetch(`${LOCAL.url}/rest/v1/`, {
      headers: { apikey: LOCAL.anonKey },
      signal: AbortSignal.timeout(2000),
    });
    return response.status < 500;
  } catch {
    return false;
  }
}

export function serviceClient(): SupabaseClient<Database> {
  return createClient<Database>(LOCAL.url, LOCAL.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function anonClient(): SupabaseClient<Database> {
  return createClient<Database>(LOCAL.url, LOCAL.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * A client acting as a specific signed-in user, so RLS evaluates for real.
 *
 * The token is minted locally rather than obtained through the magic-link flow.
 * That flow is exercised by its own test; using it to set up every other test
 * would make each one depend on email delivery and per-address send throttling,
 * which is how a suite becomes flaky for reasons unrelated to what it asserts.
 */
export function userClient(userId: string, email: string): SupabaseClient<Database> {
  const token = mintAccessToken(userId, email);
  return createClient<Database>(LOCAL.url, LOCAL.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** HS256, signed with the local JWT secret. Shaped like a Supabase session token. */
export function mintAccessToken(userId: string, email: string): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({
      aud: 'authenticated',
      role: 'authenticated',
      sub: userId,
      email,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  );
  const signature = base64url(
    createHmac('sha256', LOCAL.jwtSecret).update(`${header}.${payload}`).digest(),
  );
  return `${header}.${payload}.${signature}`;
}

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

export interface TestUser {
  id: string;
  email: string;
  db: SupabaseClient<Database>;
}

/** Unique per run, so a failed run never collides with the next one. */
export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@groundwork.test`;
}

/**
 * Allowlist an address and create its auth identity, which fires the trigger
 * that creates `app_users`. Returns a client acting as that user.
 */
export async function createUser(role: 'owner' | 'analyst' | 'viewer'): Promise<TestUser> {
  const service = serviceClient();
  const email = uniqueEmail(role);

  const { error: allowError } = await service
    .from('auth_allowlist')
    .insert({ email, full_name: `Test ${role}`, role });
  if (allowError) throw new Error(`allowlist insert failed: ${allowError.message}`);

  const response = await fetch(`${LOCAL.url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: LOCAL.serviceKey,
      Authorization: `Bearer ${LOCAL.serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, email_confirm: true }),
  });
  const body = (await response.json()) as { id?: string; message?: string };
  if (!response.ok || !body.id) {
    throw new Error(`auth user creation failed: ${body.message ?? response.status}`);
  }

  return { id: body.id, email, db: userClient(body.id, email) };
}

/** Remove everything a test created. Auth deletion cascades to `app_users`. */
export async function deleteUser(user: TestUser): Promise<void> {
  await fetch(`${LOCAL.url}/auth/v1/admin/users/${user.id}`, {
    method: 'DELETE',
    headers: { apikey: LOCAL.serviceKey, Authorization: `Bearer ${LOCAL.serviceKey}` },
  }).catch(() => undefined);
  await serviceClient().from('auth_allowlist').delete().eq('email', user.email);
}

export async function createTestClient(owner: TestUser): Promise<string> {
  const { data, error } = await owner.db
    .from('clients')
    .insert({
      // Fabricated. Real client data never enters a test (readme.md).
      legal_name: `Fabricated Holdings ${Date.now()}`,
      primary_contact_name: 'A. Fabricated',
      primary_contact_email: 'contact@fabricated.invalid',
      engagement_type: 'paid',
      created_by: owner.id,
    })
    .select('id')
    .single();

  if (error || !data) throw new Error(`client insert failed: ${error?.message}`);
  return data.id;
}
