import { cookies, headers } from 'next/headers';

import { PRODUCT_NAME } from '@klawfin/core';

import { canViewCosts, resolveActor } from '@/lib/auth/session';
import { serverClient } from '@/lib/db/client';

/**
 * Top navigation.
 *
 * Server Component, so the cost link is decided on the server and never ships
 * to a browser that could not use it. Hiding a link is presentation, not
 * authorisation - `/admin/costs` checks the role itself, and the underlying
 * tables carry their own policy.
 *
 * Renders nothing when there is no session, which is what keeps it off the
 * sign-in page without needing to know which route it is on.
 */
export async function Nav() {
  const db = serverClient(await cookies());
  const auth = await resolveActor(db, await headers());
  if (!auth.ok) return null;

  return (
    <nav className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-3 text-sm">
        <a href="/clients" className="font-semibold">
          {PRODUCT_NAME}
        </a>
        <a href="/clients" className="text-stone-600 hover:text-stone-900">
          Clients
        </a>
        {canViewCosts(auth.actor) && (
          <a href="/admin/costs" className="text-stone-600 hover:text-stone-900">
            Costs
          </a>
        )}
        <span className="ml-auto text-xs text-stone-500">{auth.actor.email}</span>
      </div>
    </nav>
  );
}
