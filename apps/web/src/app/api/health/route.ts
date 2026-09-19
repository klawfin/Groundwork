/**
 * Health check.
 *
 * Returns a Postgres round-trip and the git SHA. Used by the keepalive cron
 * (architecture 7.6) and by Nikhil during an incident.
 *
 * The keepalive is NOT optional: free-tier Supabase projects pause after a
 * period of inactivity, and "used once a fortnight" is exactly the usage
 * pattern that triggers it. The failure mode is Dhruv opening the app on the
 * morning of a client meeting to find the database paused.
 *
 * Deliberately reveals nothing beyond liveness and a build identifier.
 */

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const startedAt = Date.now();

  let database: 'ok' | 'unreachable' = 'unreachable';
  try {
    const { getPublicEnv } = await import('@/lib/config/env');
    const env = getPublicEnv();
    const { createClient } = await import('@supabase/supabase-js');
    const probe = createClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { auth: { persistSession: false } },
    );
    // Cheapest possible round-trip that still wakes a paused project.
    const { error } = await probe.from('model_pricing').select('pricing_version').limit(1);
    if (!error) database = 'ok';
  } catch {
    database = 'unreachable';
  }

  return NextResponse.json(
    {
      status: database === 'ok' ? 'ok' : 'degraded',
      database,
      version: process.env.VERCEL_GIT_COMMIT_SHA ?? 'local',
      latencyMs: Date.now() - startedAt,
    },
    { status: database === 'ok' ? 200 : 503 },
  );
}
