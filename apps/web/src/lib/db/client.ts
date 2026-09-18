/**
 * Supabase clients, separated by privilege.
 *
 * THREE clients, and the distinction is the security story (architecture 1.2):
 *
 *   browserClient()  anon key, RLS-bound. Safe in a Client Component.
 *   serverClient()   anon key + the user's session cookie. RLS applies AS THAT
 *                    USER. This is the default for anything reading client data.
 *   adminClient()    service-role key. BYPASSES RLS ENTIRELY. Server-only,
 *                    import-guarded, and used for exactly three things.
 *
 * The admin client exists for operations RLS cannot express: minting signed
 * storage URLs, running the retention purge, and executing a deletion request.
 * Reaching for it to "make a query work" is almost always a missing RLS policy
 * instead - see the footgun note in the RLS migration.
 */

import { createBrowserClient, createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { getPublicEnv } from '../config/env.js';
import type { Database } from './types.js';

/* -------------------------------------------------------------------------- */
/* Browser                                                                    */
/* -------------------------------------------------------------------------- */

/** Anon key only. Its privileges are whatever RLS allows. */
export function browserClient(): SupabaseClient<Database> {
  const env = getPublicEnv();
  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/* -------------------------------------------------------------------------- */
/* Server (RLS-bound, acting as the signed-in user)                           */
/* -------------------------------------------------------------------------- */

export interface CookieStore {
  get(name: string): { value: string } | undefined;
  set(name: string, value: string, options?: CookieOptions): void;
}

/**
 * Server client bound to the request's session.
 *
 * Every read of client data should go through this, NOT the admin client, so
 * that RLS is doing the authorisation rather than a remembered `if` in a route
 * handler.
 *
 * The cookie store is injected rather than imported from `next/headers` so
 * this module stays testable and usable from both Server Components and route
 * handlers, which hand it in differently.
 */
export function serverClient(cookies: CookieStore): SupabaseClient<Database> {
  const env = getPublicEnv();
  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get: (name) => cookies.get(name)?.value,
        set: (name, value, options) => {
          try {
            cookies.set(name, value, options);
          } catch {
            // Server Components cannot set cookies. Session refresh happens in
            // middleware, so swallowing here is correct rather than lossy.
          }
        },
        remove: (name, options) => {
          try {
            cookies.set(name, '', { ...options, maxAge: 0 });
          } catch {
            /* as above */
          }
        },
      },
    },
  );
}

/* -------------------------------------------------------------------------- */
/* Admin (service role - bypasses RLS)                                        */
/* -------------------------------------------------------------------------- */

/**
 * Service-role client.
 *
 * Callers must pass the key explicitly rather than have this module read it
 * from the environment. That makes every admin-client call site greppable, and
 * it keeps this file importable from a test without a real key present.
 *
 * The `server-only` guard lives in `./admin.ts`, which is the module route
 * handlers actually import. Splitting it that way means this file stays
 * testable while the guarded entry point is the convenient one.
 */
export function adminClient(serviceRoleKey: string): SupabaseClient<Database> {
  if (!serviceRoleKey) {
    throw new Error('adminClient requires the service-role key. Never call it with a fallback.');
  }
  return createClient<Database>(getPublicEnv().NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
