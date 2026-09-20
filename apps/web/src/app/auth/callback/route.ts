/**
 * Magic-link callback (P1-01, decision 0001).
 *
 * Exchanges the one-time code for a session cookie and sends the user on.
 *
 * Public in middleware by necessity - there is no session yet, which is the
 * entire point of the request. The code itself is the credential, it is
 * single-use, and Supabase rejects it after expiry.
 *
 * Every failure lands on /login with a generic notice. A callback that
 * explained why it failed would report back on which addresses are
 * provisioned, which is what the sign-in form is careful not to do.
 */

import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { auditContextFromHeaders, writeAudit } from '@/lib/audit/log';
import { reportWrite } from '@/lib/db/writeGuard';
import { serverClient } from '@/lib/db/client';
import { isAllowedEmail, parseServerEnv } from '@/lib/config/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const env = parseServerEnv();
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = sanitiseNext(url.searchParams.get('next'));

  const failed = new URL('/login', env.APP_URL);
  failed.searchParams.set('error', '1');

  if (!code) return NextResponse.redirect(failed);

  const db = serverClient(await cookies());
  const { data, error } = await db.auth.exchangeCodeForSession(code);

  if (error || !data.session?.user.email) {
    return NextResponse.redirect(failed);
  }

  const email = data.session.user.email;

  // Belt and braces. The database trigger refuses an unprovisioned address at
  // signup, but a session issued before an address was removed from the
  // allowlist must not be honoured just because it was valid when issued.
  if (!isAllowedEmail(email, env)) {
    await db.auth.signOut();
    return NextResponse.redirect(failed);
  }

  // The database trigger also records auth.login, but only on the very first
  // sign-in, when the auth.users row is created. This covers every subsequent
  // one. First login therefore appears twice: once from the database and once
  // from here. That is preferable to the alternative, which is a gap for every
  // login after the first.
  await writeAudit(db, {
    ...auditContextFromHeaders(await headers(), { id: data.session.user.id, email }),
    action: 'auth.login',
    entityType: 'session',
    metadata: { method: 'magic_link' },
  }).catch(() => undefined);

  reportWrite(
    `app_users.last_seen_at for ${data.session.user.id}`,
    await db
      .from('app_users')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', data.session.user.id),
  );

  return NextResponse.redirect(new URL(next ?? '/clients', env.APP_URL));
}

/** Same-site paths only. An unchecked `next` is an open redirect. */
function sanitiseNext(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null;
  return value;
}
