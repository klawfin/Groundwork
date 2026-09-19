/**
 * Request a sign-in link (P1-01, decision 0001).
 *
 * Accepts the login form post, asks Supabase to send a magic link, and
 * redirects back to /login with a generic notice.
 *
 * THE RESPONSE IS IDENTICAL whatever happens: allowlisted or not, send
 * succeeded or failed, address exists or does not. A different message for a
 * known address turns this form into an address oracle, and the addresses in
 * question are the ones that can open every client's financials.
 *
 * The allowlist is still checked here - not to change the response, but so
 * that no email is dispatched to an address that could never sign in, and so
 * the attempt is recorded.
 */

import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { auditContextFromHeaders, writeAudit } from '@/lib/audit/log';
import { serverClient } from '@/lib/db/client';
import { isAllowedEmail, parseServerEnv } from '@/lib/config/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const env = parseServerEnv();
  const form = await request.formData();

  const email = String(form.get('email') ?? '')
    .trim()
    .toLowerCase();
  const next = sanitiseNext(String(form.get('next') ?? ''));

  const sent = new URL('/login', env.APP_URL);
  sent.searchParams.set('sent', '1');
  if (next) sent.searchParams.set('next', next);

  if (email.length === 0 || !email.includes('@')) {
    // Even a malformed address gets the generic response.
    return NextResponse.redirect(sent, { status: 303 });
  }

  const db = serverClient(await cookies());
  const requestHeaders = await headers();

  if (!isAllowedEmail(email, env)) {
    await writeAudit(db, {
      ...auditContextFromHeaders(requestHeaders, null),
      action: 'auth.denied',
      entityType: 'session',
      // Set after the spread: there is no actor here, and the refused address
      // is the only thing worth recording.
      actorEmail: email,
      metadata: { reason: 'not_on_allowlist', stage: 'magic_link_request' },
    }).catch(() => undefined);

    return NextResponse.redirect(sent, { status: 303 });
  }

  const callback = new URL('/auth/callback', env.APP_URL);
  if (next) callback.searchParams.set('next', next);

  await db.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: callback.toString(),
      // Signup is disabled in the dashboard and refused by the database
      // trigger. Saying so here as well means an unprovisioned address fails
      // before an email is sent rather than after.
      shouldCreateUser: false,
    },
  });

  return NextResponse.redirect(sent, { status: 303 });
}

/**
 * Only a same-site path may be used as a post-login destination.
 *
 * An unchecked `next` is an open redirect: a link that looks like the real
 * sign-in page and lands on someone else's.
 */
function sanitiseNext(value: string): string | null {
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  return value;
}
