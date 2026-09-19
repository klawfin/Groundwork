/**
 * Audit logging - THE single entry point for all audit writes.
 *
 * readme.md structural rule 6: "All audit writes go through lib/audit/log.ts.
 * One entry point, so nothing gets forgotten."
 *
 * PRD 10.7 requires an entry for every one of: sign-in success, sign-in
 * failure, client created, client deleted, intake submitted, generation
 * attempted, generation outcome, guardrail result, report exported, PDF
 * accessed via signed URL, contradiction dismissed, coverage override used.
 * The `AuditAction` union below is exhaustive over that list.
 *
 * WHAT MUST NEVER GO IN `metadata`: raw intake values, revenue figures, cap
 * tables, free-text notes, or anything that would let this table reconstruct
 * client financials. Metadata is model ids, versions, token counts, costs,
 * latencies, outcomes and reasons. `assertSafeMetadata` enforces the obvious
 * cases; judgement covers the rest.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../db/types';

/**
 * The audit vocabulary. Small and stable on purpose (architecture 3.4).
 *
 * Adding an action is fine; renaming one breaks historical queries, so treat
 * these as append-only too.
 */
export type AuditAction =
  // auth
  | 'auth.login'
  | 'auth.logout'
  | 'auth.denied'
  // clients
  | 'client.created'
  | 'client.viewed'
  | 'client.updated'
  | 'client.archived'
  | 'client.deleted'
  // intake
  | 'intake.saved'
  | 'intake.locked'
  | 'intake.truncated'
  // assessment
  | 'assessment.created'
  | 'assessment.viewed'
  | 'assessment.scored'
  | 'contradiction.dismissed'
  | 'coverage.overridden'
  // generation
  | 'generation.started'
  | 'generation.completed'
  | 'generation.failed'
  | 'guardrail.evaluated'
  // narrative
  | 'narrative.edited'
  | 'narrative.approved'
  | 'narrative.reverted'
  // reports
  | 'report.generated'
  | 'report.download_url_issued'
  | 'report.purged'
  // retention and deletion
  | 'retention.purge_executed'
  | 'deletion.requested'
  | 'deletion.approved'
  | 'deletion.executed';

export type EntityType =
  | 'session'
  | 'client'
  | 'assessment'
  | 'narrative'
  | 'report'
  | 'generation'
  /**
   * Not tied to one record. The retention purge is the only user of this: the
   * SQL function writes a per-entity row for each thing it touches, and the
   * application writes one summary row for the run itself.
   */
  | 'system';

export interface AuditEntry {
  action: AuditAction;
  entityType: EntityType;
  entityId?: string | null;
  clientId?: string | null;
  actorUserId?: string | null;
  actorEmail?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Metadata keys that would carry client financial data.
 *
 * Matching is on the KEY, not the value: a value-based scan would be both
 * slower and less reliable, and the realistic failure here is someone
 * spreading an intake object into metadata rather than deliberately logging a
 * revenue figure.
 */
const FORBIDDEN_METADATA_KEY =
  /intake|cap_table|capTable|financial|revenue|arr|mrr|holder|equity|valuation|churn|burn|contact|email|phone|founder/i;

/** Keys that look forbidden but are legitimately safe. */
const METADATA_KEY_ALLOWLIST = new Set([
  'actor_email',
  'requester_email',
  'email_domain',
  'founder_count',
  'holder_count',
]);

export class UnsafeAuditMetadataError extends Error {
  constructor(key: string) {
    super(
      `Refusing to write audit metadata key "${key}": it looks like client financial or personal data. The audit log records what happened, never what the data said (architecture 5.7).`,
    );
    this.name = 'UnsafeAuditMetadataError';
  }
}

/**
 * Reject metadata that would leak client data into the audit log.
 *
 * Throws rather than silently stripping. A silent strip would mean the caller
 * believes something is being recorded that is not, and would hide the bug
 * that put it there.
 */
export function assertSafeMetadata(metadata: Record<string, unknown>, path = ''): void {
  for (const [key, value] of Object.entries(metadata)) {
    const full = path ? `${path}.${key}` : key;
    if (!METADATA_KEY_ALLOWLIST.has(key) && FORBIDDEN_METADATA_KEY.test(key)) {
      throw new UnsafeAuditMetadataError(full);
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      assertSafeMetadata(value as Record<string, unknown>, full);
    }
  }
}

/**
 * Write one audit entry.
 *
 * Deliberately NOT transactional with the operation it records. An audit write
 * that fails must not roll back a successful report generation - the report is
 * the thing the client is waiting for. The failure is surfaced to the caller,
 * which logs it as an application error, rather than swallowed.
 */
export async function writeAudit(
  db: SupabaseClient<Database>,
  entry: AuditEntry,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const metadata = entry.metadata ?? {};
  assertSafeMetadata(metadata);

  const { error } = await db.from('audit_log').insert({
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId ?? null,
    client_id: entry.clientId ?? null,
    actor_user_id: entry.actorUserId ?? null,
    actor_email: entry.actorEmail ?? null,
    ip: entry.ip ?? null,
    user_agent: entry.userAgent ?? null,
    request_id: entry.requestId ?? null,
    metadata,
  });

  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Request context extracted once per handler and threaded through.
 *
 * Built from headers rather than read ad hoc at each call site, so an audit
 * entry never silently loses its actor because someone forgot to pass it.
 */
export interface AuditContext {
  actorUserId: string | null;
  actorEmail: string | null;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
}

export function auditContextFromHeaders(
  headers: Headers,
  actor: { id: string; email: string } | null,
): AuditContext {
  return {
    actorUserId: actor?.id ?? null,
    actorEmail: actor?.email ?? null,
    // Behind a proxy the left-most x-forwarded-for entry is the client.
    ip: headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: headers.get('user-agent'),
    requestId: headers.get('x-vercel-id') ?? headers.get('x-request-id'),
  };
}

