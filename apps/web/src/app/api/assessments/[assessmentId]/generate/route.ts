/**
 * Narrative generation (PRD P1-06).
 *
 * Node runtime: the Anthropic client and the cost ledger both need it.
 *
 * Thin by design - authorise, delegate, translate the result into a response.
 * The sequence itself lives in lib/generation/run.ts so it can be read and
 * tested without a request.
 */

import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { canWrite, resolveActor } from '@/lib/auth/session';
import { serverClient } from '@/lib/db/client';
import { runGeneration } from '@/lib/generation/run';

export const runtime = 'nodejs';
/** Generation plus one retry, comfortably inside the client's own timeout. */
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ assessmentId: string }> },
) {
  const { assessmentId } = await params;

  const db = serverClient(await cookies());
  const auth = await resolveActor(db, await headers());
  if (!auth.ok) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: auth.status });
  }
  if (!canWrite(auth.actor)) {
    return NextResponse.json({ error: 'This account has read-only access.' }, { status: 403 });
  }

  const result = await runGeneration(db, {
    assessmentId,
    actor: auth.actor,
    audit: auth.audit,
  });

  const { status, ...body } = result;
  return NextResponse.json(body, { status });
}
