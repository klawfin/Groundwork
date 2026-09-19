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
import { admin } from '@/lib/db/admin';
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
    // ADMIN CLIENT, and it has to be.
    //
    // `audit_log` grants INSERT to `authenticated` only. A refused sign-in is
    // by definition unauthenticated, so this write through the anon client was
    // silently rejected by RLS and swallowed by the catch below - meaning the
    // one event most worth recording, somebody probing the sign-in form, was
    // never recorded at all. The first live run is what surfaced it.
    //
    // This is a fourth legitimate use of the service-role client, alongside
    // signed URLs, the retention purge and deletion execution: an audit write
    // on behalf of someone who has no identity to write as.
    await writeAudit(admin(), {
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

  const { error } = await db.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: callback.toString(),
      // MUST stay true, and the first live run is what proved it.
      //
      // `false` looked like defence in depth - refuse to create a user, let
      // the allowlist do the rest. It actually breaks sign-in completely: a
      // first-time user has no `auth.users` row yet, so Supabase silently
      // declines to send them a link and nobody can ever get in.
      //
      // The database trigger is the real control. It refuses a non-allowlisted
      // address with 'Not authorised' and no account is created, so allowing
      // creation here costs nothing and is the only way first login works.
      shouldCreateUser: true,
    },
  });

  // The RESPONSE stays generic; the LOG must not.
  //
  // This swallowed its errors until the first live run, and the failure was
  // invisible: Supabase rejects a magic link whose redirect URL is not on its
  // allowlist, returns an error, and sends nothing. The user saw "check your
  // email" forever and no operator had any way to find out why.
  //
  // A generic reply to the browser is the security requirement. A generic
  // server log is just a missing diagnostic.
  if (error) {
    console.error(
      `[auth] magic link not sent for ${email}: ${error.message}. ` +
        'If this mentions a redirect URL, add APP_URL/auth/callback to the ' +
        'allowed redirect list (supabase/config.toml locally, Auth settings when hosted).',
    );
  }

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
