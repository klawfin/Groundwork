/**
 * Session resolution and the `withAuth` wrapper.
 *
 * architecture 5.5: "Every /api handler starts with the same three lines:
 * resolve session, resolve app_users, write the audit row. Extract this to
 * withAuth() on day one - the alternative is discovering in month three that
 * one handler forgot."
 *
 * This is that. Route handlers do not resolve sessions themselves.
 *
 * PRD P1-01: "All application routes except the sign-in route reject
 * unauthenticated requests SERVER-SIDE, not merely by hiding UI."
 */

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { isAllowedEmail, parseServerEnv } from '../config/env.js';
import { auditContextFromHeaders, writeAudit, type AuditContext } from '../audit/log.js';
import type { AppUserRow, Database } from '../db/types.js';

export interface Actor {
  id: string;
  email: string;
  role: AppUserRow['role'];
  fullName: string | null;
}

export type AuthResult =
  | { ok: true; actor: Actor; audit: AuditContext }
  | { ok: false; reason: 'no_session' | 'not_allowlisted' | 'inactive'; status: 401 | 403 };

/**
 * Resolve the signed-in user, or fail.
 *
 * Checks BOTH the session and the allowlist. The allowlist check is redundant
 * with the database trigger by design (see docs/decisions/0001): a session
 * that somehow exists for a de-allowlisted address must not be honoured just
 * because it was valid when it was issued.
 */
export async function resolveActor(
  db: SupabaseClient<Database>,
  headers: Headers,
): Promise<AuthResult> {
  const {
    data: { user },
  } = await db.auth.getUser();

  if (!user?.email) {
    return { ok: false, reason: 'no_session', status: 401 };
  }

  const env = parseServerEnv();
  if (!isAllowedEmail(user.email, env)) {
    // Record the attempt; a session for a non-allowlisted address is worth
    // knowing about, not just refusing.
    await writeAudit(db, {
      ...auditContextFromHeaders(headers, null),
      action: 'auth.denied',
      entityType: 'session',
      // Set AFTER the spread: the context has no actor by definition here, and
      // the address that was refused is the only useful thing to record.
      actorEmail: user.email,
      metadata: { reason: 'not_on_allowlist' },
    }).catch(() => undefined);
    return { ok: false, reason: 'not_allowlisted', status: 403 };
  }

  const { data: row } = await db
    .from('app_users')
    .select('id, email, role, full_name, is_active')
    .eq('id', user.id)
    .maybeSingle();

  if (!row || !row.is_active) {
    return { ok: false, reason: 'inactive', status: 403 };
  }

  const actor: Actor = {
    id: row.id,
    email: row.email,
    role: row.role,
    fullName: row.full_name,
  };

  return { ok: true, actor, audit: auditContextFromHeaders(headers, actor) };
}

/** Roles permitted to write. `viewer` may read but not modify (RLS agrees). */
export function canWrite(actor: Actor): boolean {
  return actor.role === 'owner' || actor.role === 'analyst';
}

/** Cost and audit data is owner-only, matching the RLS policies. */
export function canViewCosts(actor: Actor): boolean {
  return actor.role === 'owner';
}

/**
 * Wrap a route handler so authentication cannot be forgotten.
 *
 * Errors are values at the boundary (readme conventions): a failure returns a
 * typed JSON response the UI can render, never a stack trace and never a
 * message that leaks database structure.
 */
export async function withAuth<T>(
  db: SupabaseClient<Database>,
  headers: Headers,
  handler: (ctx: { actor: Actor; audit: AuditContext }) => Promise<T>,
): Promise<T | Response> {
  const auth = await resolveActor(db, headers);
  if (!auth.ok) {
    return Response.json(
      {
        error:
          auth.reason === 'no_session'
            ? 'Not signed in.'
            : 'This account is not permitted to use this application.',
      },
      { status: auth.status },
    );
  }
  return handler({ actor: auth.actor, audit: auth.audit });
}
