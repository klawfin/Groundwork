/**
 * Service-role Supabase client - the guarded entry point.
 *
 * `import 'server-only'` makes an import from a Client Component a BUILD-TIME
 * failure rather than a runtime key leak. That is the single highest-value
 * twenty seconds of work in the security model (architecture 5.4, threat 1).
 *
 * This client BYPASSES RLS ENTIRELY. It exists for the three operations RLS
 * cannot express:
 *
 *   1. Minting short-lived signed URLs for private storage objects
 *   2. Running the retention purge
 *   3. Executing an approved deletion request
 *
 * If you are reaching for it to make a query return rows, you almost certainly
 * have a missing RLS policy instead. Read the footgun note in
 * supabase/migrations/20260919000300_rls.sql before adding a fourth use.
 */

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient } from './client.js';
import { parseServerEnv } from '../config/env.js';
import type { Database } from './types.js';

let cached: SupabaseClient<Database> | null = null;

export function admin(): SupabaseClient<Database> {
  if (!cached) {
    cached = adminClient(parseServerEnv().SUPABASE_SERVICE_ROLE_KEY);
  }
  return cached;
}
