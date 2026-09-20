import { cookies, headers } from 'next/headers';

import { ORG_NAME, PRODUCT_NAME } from '@klawfin/core';

import { canViewCosts, resolveActor } from '@/lib/auth/session';
import { serverClient } from '@/lib/db/client';

/**
 * Top navigation.
 *
 * INVERTED: Deep Navy ground, Soft White text at 14.18:1. The navy bar is the
 * single heaviest element on screen and it anchors the warm cream page beneath
 * it - without it the cream reads as washed out rather than deliberate.
 *
 * Server Component, so the cost link is decided on the server and never ships
 * to a browser that could not use it. Hiding a link is presentation, not
 * authorisation - `/admin/*` checks the role itself and the tables carry their
 * own policy.
 *
 * Renders nothing when there is no session, which keeps it off the sign-in
 * page without needing to know which route it is on.
 */
export async function Nav() {
  const db = serverClient(await cookies());
  const auth = await resolveActor(db, await headers());
  if (!auth.ok) return null;

  return (
    <nav className="bg-inverse text-on-inverse">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-7 gap-y-2 px-6 py-3.5">
        <a href="/" className="group flex items-baseline gap-2">
          <span className="font-serif text-[17px] font-semibold tracking-tight">
            {PRODUCT_NAME}
          </span>
          {/* Mint hairline: the accent appears once in the chrome, as a mark
              rather than as decoration. */}
          <span aria-hidden className="h-px w-5 bg-positive" />
          <span className="text-[11px] uppercase tracking-[0.14em] text-on-inverse-muted">
            {ORG_NAME}
          </span>
        </a>

        <div className="flex items-center gap-6 text-sm">
          <NavLink href="/">Overview</NavLink>
          <NavLink href="/clients">Clients</NavLink>
          {canViewCosts(auth.actor) && (
            <>
              <NavLink href="/admin/costs">Costs</NavLink>
              <NavLink href="/admin/retention">Retention</NavLink>
            </>
          )}
        </div>

        <span className="ml-auto text-xs text-on-inverse-muted">{auth.actor.email}</span>
      </div>
    </nav>
  );
}

/**
 * Underline on hover rather than a background change.
 *
 * A hover fill would need an eighth colour or a navy tint that reads as a
 * smudge against the bar. An underline costs nothing and stays inside the
 * palette.
 */
function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="text-on-inverse-muted underline-offset-[6px] transition-colors hover:text-on-inverse hover:underline"
    >
      {children}
    </a>
  );
}
