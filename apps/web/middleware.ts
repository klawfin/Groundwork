/**
 * Route guard and session refresh.
 *
 * Two jobs:
 *   1. Refresh the Supabase session cookie on every request (the SSR pattern;
 *      Server Components cannot set cookies, so it must happen here).
 *   2. Reject unauthenticated requests to every route except sign-in and
 *      health - SERVER-SIDE, not by hiding UI (PRD P1-01).
 *
 * The allowlist itself is enforced in `resolveActor` and in the database
 * trigger. This layer only establishes that a session exists, because
 * middleware runs on the Edge runtime where a database round-trip per request
 * is the wrong trade.
 */

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/** Routes reachable without a session. Everything else is guarded. */
const PUBLIC_PATHS = ['/login', '/auth/callback', '/api/health'];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => request.cookies.get(name)?.value,
        set: (name, value, options) => {
          response = NextResponse.next({ request });
          response.cookies.set({ name, value, ...options });
        },
        remove: (name, options) => {
          response = NextResponse.next({ request });
          response.cookies.set({ name, value: '', ...options, maxAge: 0 });
        },
      },
    },
  );

  // Refreshes the session as a side effect. Must run before the guard.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    // Return the user where they were headed after sign-in.
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  // A signed-in user landing on /login goes to the client list instead.
  if (user && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/clients';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except static assets and the favicon.
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)',
  ],
};
