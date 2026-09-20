/**
 * Never discard a write error.
 *
 * Two production defects came from the same one-character habit:
 *
 *     const { data } = await db.from('llm_calls').insert(...)
 *                  ^ no `error`
 *
 * RLS rejects a write by RETURNING an error, not by throwing. An error nobody
 * binds is a write that looks like it worked. `llm_calls` was rejected for the
 * entire life of the project and the cost ledger simply stayed empty
 * (migration 20260920000100).
 *
 * This is deliberately not a wrapper around the query builder. A wrapper would
 * have to re-export supabase-js's whole fluent API and would be abandoned the
 * first time someone needed a method it did not cover. This is one function
 * that turns a discarded error into a loud one, at the call site, where the
 * decision about what to do next also lives.
 */

import 'server-only';

export interface WriteOutcome {
  error: { message: string } | null;
}

/**
 * Log a failed write with enough context to find it, and report whether it
 * succeeded so the caller can decide.
 *
 * `context` is a short operational string - never intake values, never
 * narrative text. This lands in server logs, which are not the audit table and
 * must not become a second copy of client financials.
 */
export function reportWrite(context: string, outcome: WriteOutcome): boolean {
  if (!outcome.error) return true;
  console.error(`[db] ${context} failed: ${outcome.error.message}`);
  return false;
}
