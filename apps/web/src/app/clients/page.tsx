import Link from 'next/link';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { PRODUCT_FULL_NAME } from '@klawfin/core';

import { resolveActor } from '@/lib/auth/session';
import { serverClient } from '@/lib/db/client';
import { listClients } from '@/lib/db/queries';
import { NewClientForm } from './NewClientForm';

/** Client list (P1-02). Searchable ordering is by date; one user, few rows. */
export default async function ClientsPage() {
  const db = serverClient(await cookies());
  const auth = await resolveActor(db, await headers());
  if (!auth.ok) redirect('/login');

  const clients = await listClients(db);

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-6 flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Clients</h1>
        <span className="text-xs text-stone-500">{PRODUCT_FULL_NAME}</span>
      </header>

      <NewClientForm />

      {clients.length === 0 ? (
        <p className="mt-6 text-sm text-stone-500">No clients yet.</p>
      ) : (
        <ul className="mt-6 divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
          {clients.map((client) => (
            <li key={client.id} className="flex items-baseline justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium">{client.legal_name}</p>
                <p className="text-xs text-stone-500">
                  {client.sector ?? 'sector not recorded'} · {client.stage ?? 'stage not recorded'}
                </p>
              </div>
              <Link
                href={`/clients/${client.id}`}
                className="text-sm text-slate-700 underline underline-offset-2"
              >
                Open
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
