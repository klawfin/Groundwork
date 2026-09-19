import Link from 'next/link';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { PRODUCT_FULL_NAME } from '@klawfin/core';

import { resolveActor } from '@/lib/auth/session';
import { serverClient } from '@/lib/db/client';
import { listClients } from '@/lib/db/queries';
import { NewClientForm } from './NewClientForm';
import { Chip, PageHeader } from '../ui';

/** Client list (P1-02). Searchable ordering is by date; one user, few rows. */
export default async function ClientsPage() {
  const db = serverClient(await cookies());
  const auth = await resolveActor(db, await headers());
  if (!auth.ok) redirect('/login');

  const clients = await listClients(db);

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <PageHeader
        eyebrow={PRODUCT_FULL_NAME}
        title="Clients"
        meta={
          clients.length === 0
            ? 'No engagements yet.'
            : `${clients.length} engagement${clients.length === 1 ? '' : 's'}`
        }
      />

      <NewClientForm />

      {clients.length === 0 ? (
        <p className="mt-6 text-sm text-ink/55">No clients yet.</p>
      ) : (
        <ul className="mt-6 divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
          {clients.map((client) => (
            <li key={client.id}>
              {/* The whole row is the target. A 40px "Open" link beside a
                  200px row of dead space is a smaller target for no reason. */}
              <Link
                href={`/clients/${client.id}`}
                className="group flex items-center justify-between gap-4 px-4 py-3.5 transition-colors hover:bg-ground"
              >
                <div className="min-w-0">
                  <p className="truncate font-serif text-[15px] font-semibold text-ink-strong">
                    {client.legal_name}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-ink/60">
                    {client.sector ?? 'sector not recorded'} ·{' '}
                    {client.stage ?? 'stage not recorded'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2.5">
                  {client.archived_at && <Chip tone="neutral">Archived</Chip>}
                  <span
                    aria-hidden
                    className="text-ink/35 transition-transform group-hover:translate-x-0.5 group-hover:text-ink"
                  >
                    &rarr;
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
