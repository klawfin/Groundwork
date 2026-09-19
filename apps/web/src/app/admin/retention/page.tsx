/**
 * Retention purge (PRD 10.6, architecture 3.6).
 *
 * `pg_cron` availability on the current plan is unverified, so the purge is
 * driven from here rather than scheduled. That is the right order anyway: the
 * dry-run output has to be read by a person for a month before anything is
 * scheduled to run unattended.
 *
 * Owner-only. The purge crosses every client and nulls fields RLS exists to
 * protect, so it is not something an analyst account should be able to start.
 */

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { canViewCosts, resolveActor } from '@/lib/auth/session';
import { serverClient } from '@/lib/db/client';
import { RetentionPanel } from './RetentionPanel';

export const dynamic = 'force-dynamic';

export default async function RetentionPage() {
  const db = serverClient(await cookies());
  const auth = await resolveActor(db, await headers());
  if (!auth.ok) redirect('/login');

  if (!canViewCosts(auth.actor)) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-xl font-semibold">Retention</h1>
        <p className="mt-3 text-sm text-ink/70">
          This view is restricted to the account owner.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-wide text-ink/55">Admin</p>
        <h1 className="text-xl font-semibold">Retention</h1>
        <p className="mt-2 text-sm text-ink/70">
          Purging is field-level, never row-level. A report&apos;s PDF is destroyed; the row
          recording that it was delivered, and its sha256, survive — Klawfin needs that for its
          own defence.
        </p>
        <p className="mt-2 text-xs text-ink/55">
          LLM request and response bodies purge at 90 days; everything else at 24 months. Those
          periods are proposed and still need confirming by counsel (PRD OPEN-08). A client on
          legal hold is never purged.
        </p>
      </header>

      <RetentionPanel />
    </main>
  );
}
