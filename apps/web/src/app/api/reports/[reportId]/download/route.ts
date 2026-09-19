/**
 * Report download (PRD P1-08, architecture 5.3).
 *
 * The ONLY path to a stored PDF. The bucket is private and has no storage
 * policies at all, so nothing reads it directly.
 *
 * Order matters and is deliberate:
 *   1. Verify the session
 *   2. Verify via RLS that this user can see this report row
 *   3. WRITE THE AUDIT ENTRY - before the URL exists, not after
 *   4. Mint a short-lived signed URL with the admin client
 *   5. Redirect
 *
 * Auditing before issuing means a crash between the two leaves a record of an
 * access that may have happened, rather than an access with no record.
 *
 * Residual risk, stated plainly: a signed URL is a bearer token for its
 * lifetime. In Phase 1 Dhruv hands the PDF over in a meeting, so that is
 * acceptable. If reports are ever emailed, the answer is a per-recipient
 * tokenised link with its own row and audit trail, not a longer expiry.
 */

import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { reportFilename } from '@klawfin/core';

import { resolveActor } from '@/lib/auth/session';
import { admin } from '@/lib/db/admin';
import { serverClient } from '@/lib/db/client';
import { writeAudit } from '@/lib/audit/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Signed-URL lifetime. Short on purpose - it is a bearer token. */
const SIGNED_URL_TTL_SECONDS = 300;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ reportId: string }> },
) {
  const { reportId } = await params;

  const db = serverClient(await cookies());
  const auth = await resolveActor(db, await headers());
  if (!auth.ok) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: auth.status });
  }

  // RLS decides whether this user may see this report. There is no
  // application-side ownership check here on purpose - the database is the
  // authorisation boundary (architecture ADR-007).
  const { data: report } = await db
    .from('reports')
    .select('id, assessment_id, storage_bucket, storage_path, version, purged_at, generated_at')
    .eq('id', reportId)
    .maybeSingle();

  if (!report) {
    return NextResponse.json({ error: 'Report not found.' }, { status: 404 });
  }
  if (report.purged_at) {
    return NextResponse.json(
      { error: 'This report has been purged under the retention policy.' },
      { status: 410 },
    );
  }

  const { data: assessment } = await db
    .from('assessments')
    .select('client_id')
    .eq('id', report.assessment_id)
    .maybeSingle();

  const { data: client } = assessment
    ? await db.from('clients').select('legal_name').eq('id', assessment.client_id).maybeSingle()
    : { data: null };

  await writeAudit(db, {
    ...auth.audit,
    action: 'report.download_url_issued',
    entityType: 'report',
    entityId: report.id,
    clientId: assessment?.client_id ?? null,
    metadata: { version: report.version, ttl_seconds: SIGNED_URL_TTL_SECONDS },
  });

  // Admin client: minting a signed URL is one of the three operations RLS
  // cannot express.
  const { data: signed, error } = await admin()
    .storage.from(report.storage_bucket)
    .createSignedUrl(report.storage_path, SIGNED_URL_TTL_SECONDS, {
      download: reportFilename(
        client?.legal_name ?? 'Client',
        report.generated_at.slice(0, 10),
        report.version,
      ),
    });

  if (error || !signed) {
    return NextResponse.json({ error: 'Could not prepare the download.' }, { status: 502 });
  }

  await db
    .from('reports')
    .update({ download_count: 1, last_downloaded_at: new Date().toISOString() })
    .eq('id', report.id);

  return NextResponse.redirect(signed.signedUrl);
}
