import { cookies, headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import { resolveActor } from '@/lib/auth/session';
import { serverClient } from '@/lib/db/client';
import { getClient } from '@/lib/db/queries';
import { StartAssessment } from './StartAssessment';

export default async function ClientPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;

  const db = serverClient(await cookies());
  const auth = await resolveActor(db, await headers());
  if (!auth.ok) redirect('/login');

  const client = await getClient(db, clientId);
  if (!client) notFound();

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-xl font-semibold">{client.legal_name}</h1>
      <p className="mt-1 text-sm text-stone-500">
        {client.primary_contact_name} · {client.sector ?? 'sector not recorded'}
      </p>
      <div className="mt-6">
        <StartAssessment clientId={client.id} />
      </div>
    </main>
  );
}
