/**
 * Deterministic contradiction checks (PRD 8.3).
 *
 * These run before generation is permitted. `blocking` contradictions must be
 * resolved or explicitly dismissed with a recorded reason; `warning`
 * contradictions are shown, passed to the model as context, and may
 * legitimately become findings in the report.
 *
 * "Adding contradiction checks is cheap and high-value. Expect this list to
 * grow after every real engagement. Keep it in one module so it is easy to
 * extend." - PRD 8.3. This is that module. Add a check by appending to CHECKS.
 *
 * Pure: no I/O, no clock. `asOf` is passed in so date-relative checks stay
 * deterministic and testable.
 */

import type { Intake } from '@klawfin/core';
import { isAnswered, num } from '@klawfin/core';

export type ContradictionClass = 'blocking' | 'warning';

export interface Contradiction {
  /** Stable id. Used in the audit log and in dismissal records. */
  code: string;
  class: ContradictionClass;
  /** What is wrong, in plain English (PRD P1-05). */
  message: string;
  /**
   * Intake field paths implicated. The UI links directly to these (PRD P1-05),
   * so they must match the paths the form uses.
   */
  fields: readonly string[];
}

export interface ContradictionCheck {
  code: string;
  class: ContradictionClass;
  fields: readonly string[];
  /** Returns a message when the check fires, or null when it stays silent. */
  run: (intake: Intake, asOf: Date) => string | null;
}

/** Tolerance on ARR vs MRR x 12 before the mismatch is worth flagging. */
export const ARR_MRR_TOLERANCE = 0.1;

/** Tolerance on cap-table and use-of-funds totals. */
export const PERCENT_TOTAL_TOLERANCE = 0.5;
export const CAP_TABLE_BP_TOLERANCE = 50;

/** How far the implied runway may drift from the target before warning. */
export const RUNWAY_DRIFT_WARNING = 0.5;

/* -------------------------------------------------------------------------- */
/* The checks                                                                 */
/* -------------------------------------------------------------------------- */

export const CHECKS: readonly ContradictionCheck[] = [
  {
    code: 'REVENUE_WITHOUT_CUSTOMERS',
    class: 'blocking',
    fields: ['traction.paying_customers_count', 'traction.mrr_current'],
    run: (i) => {
      const customers = num(i.traction.paying_customers_count);
      const mrr = num(i.traction.mrr_current);
      if (customers === 0 && mrr !== null && mrr > 0) {
        return `Monthly revenue of ${mrr} is recorded but the paying customer count is zero. One of the two is wrong, and an investor will ask.`;
      }
      return null;
    },
  },
  {
    code: 'ARR_MRR_MISMATCH',
    class: 'warning',
    fields: ['traction.arr_current', 'traction.mrr_current', 'traction.revenue_recognition_basis'],
    run: (i) => {
      const mrr = num(i.traction.mrr_current);
      const arr = num(i.traction.arr_current);
      if (mrr === null || arr === null || mrr <= 0) return null;
      const expected = mrr * 12;
      const drift = Math.abs(arr - expected) / expected;
      if (drift <= ARR_MRR_TOLERANCE) return null;
      // A legitimate explanation exists - non-recurring revenue, a recent
      // step change - so this warns rather than blocks when a basis is stated.
      if (isAnswered(i.traction.revenue_recognition_basis)) {
        return `ARR of ${arr} differs from MRR x 12 (${expected}) by ${(drift * 100).toFixed(0)}%. The stated recognition basis may explain it; confirm before it reaches the report.`;
      }
      return `ARR of ${arr} differs from MRR x 12 (${expected}) by ${(drift * 100).toFixed(0)}%, with no recognition basis stated to explain the difference.`;
    },
  },
  {
    code: 'MARKET_SIZE_INVERTED',
    class: 'blocking',
    fields: ['market.tam', 'market.sam', 'market.som'],
    run: (i) => {
      const { tam, sam, som } = i.market;
      const t = num(tam);
      const s = num(sam);
      const o = num(som);
      const problems: string[] = [];
      if (s !== null && t !== null && s > t) problems.push(`SAM (${s}) exceeds TAM (${t})`);
      if (o !== null && s !== null && o > s) problems.push(`SOM (${o}) exceeds SAM (${s})`);
      if (o !== null && t !== null && s === null && o > t) problems.push(`SOM (${o}) exceeds TAM (${t})`);
      return problems.length > 0
        ? `Market sizing is inverted: ${problems.join('; ')}. TAM must contain SAM, which must contain SOM.`
        : null;
    },
  },
  {
    code: 'CAP_TABLE_DOES_NOT_TOTAL_100',
    class: 'blocking',
    fields: ['cap_table_legal.cap_table.holders'],
    run: (i) => {
      const holders = i.cap_table_legal.cap_table.holders;
      if (holders.length === 0) return null;
      const total = holders.reduce((acc, h) => acc + h.equity_bp, 0);
      if (Math.abs(total - 10_000) <= CAP_TABLE_BP_TOLERANCE) return null;
      return `Cap table holdings total ${(total / 100).toFixed(2)}%, not 100%. A cap table that does not reconcile cannot be assessed and will stop a diligence process.`;
    },
  },
  {
    code: 'USE_OF_FUNDS_DOES_NOT_TOTAL_100',
    class: 'blocking',
    fields: ['ask.use_of_funds_breakdown'],
    run: (i) => {
      const lines = i.ask.use_of_funds_breakdown;
      if (lines.length === 0) return null;
      const total = lines.reduce((acc, l) => acc + l.pct, 0);
      if (Math.abs(total - 100) <= PERCENT_TOTAL_TOLERANCE) return null;
      return `Use-of-funds percentages total ${total.toFixed(1)}%, not 100%.`;
    },
  },
  {
    code: 'IDEA_STAGE_WITH_LIVE_USERS',
    class: 'blocking',
    fields: ['product.product_stage', 'product.live_users_count'],
    run: (i) => {
      const stage = i.product.product_stage;
      const users = num(i.product.live_users_count);
      if (stage === 'idea' && users !== null && users > 0) {
        return `Product stage is "idea" but ${users} live users are recorded. The stage or the user count is wrong.`;
      }
      return null;
    },
  },
  {
    code: 'IDEA_STAGE_WITH_REVENUE',
    class: 'blocking',
    fields: ['product.product_stage', 'traction.mrr_current'],
    run: (i) => {
      const stage = i.product.product_stage;
      const mrr = num(i.traction.mrr_current);
      if ((stage === 'idea' || stage === 'prototype') && mrr !== null && mrr > 0) {
        return `Product stage is "${stage}" but monthly revenue of ${mrr} is recorded. This also changes how traction is scored, so it must be resolved before generation.`;
      }
      return null;
    },
  },
  {
    code: 'INCORPORATION_DATE_IN_FUTURE',
    class: 'warning',
    fields: ['cap_table_legal.incorporation_date'],
    run: (i, asOf) => {
      const raw = i.cap_table_legal.incorporation_date;
      if (!isAnswered(raw)) return null;
      const date = new Date(`${raw}T00:00:00Z`);
      if (Number.isNaN(date.getTime())) return `Incorporation date "${raw}" is not a valid date.`;
      if (date.getTime() > asOf.getTime()) {
        return `Incorporation date ${raw} is in the future. If incorporation is planned rather than done, record the entity as not incorporated.`;
      }
      return null;
    },
  },
  {
    code: 'REVENUE_BEFORE_INCORPORATION',
    class: 'warning',
    fields: ['cap_table_legal.incorporation_date', 'traction.mrr_by_month'],
    run: (i) => {
      const raw = i.cap_table_legal.incorporation_date;
      const series = i.traction.mrr_by_month;
      if (!isAnswered(raw) || series.length === 0) return null;
      const incorporationMonth = (raw as string).slice(0, 7);
      const earliest = [...series].sort((a, b) => a.month.localeCompare(b.month))[0]!;
      if (earliest.month < incorporationMonth) {
        return `Revenue is recorded from ${earliest.month}, before the incorporation date of ${raw}. Pre-incorporation revenue raises a question about which entity earned it.`;
      }
      return null;
    },
  },
  {
    code: 'PERCENTAGE_OUT_OF_RANGE',
    class: 'blocking',
    fields: [
      'traction.churn_rate',
      'traction.repeat_purchase_rate',
      'product.gross_margin_pct',
      'product.contribution_margin',
      'cap_table_legal.data_room_completeness_pct',
    ],
    run: (i) => {
      // NRR is deliberately excluded: net revenue retention above 100% is the
      // point of measuring it (PRD 8.3).
      const candidates: Array<[string, number | null | undefined]> = [
        ['churn_rate', i.traction.churn_rate],
        ['repeat_purchase_rate', i.traction.repeat_purchase_rate],
        ['gross_margin_pct', i.product.gross_margin_pct],
        ['contribution_margin', i.product.contribution_margin],
        ['data_room_completeness_pct', i.cap_table_legal.data_room_completeness_pct],
      ];
      const bad = candidates
        .filter(([, v]) => {
          const value = num(v);
          return value !== null && (value < 0 || value > 100);
        })
        .map(([name, v]) => `${name} = ${v}`);
      return bad.length > 0
        ? `Percentage field(s) outside the possible range 0-100: ${bad.join(', ')}. These are impossible values rather than unusual ones.`
        : null;
    },
  },
  {
    code: 'MONTH_SERIES_DISORDERED',
    class: 'warning',
    fields: ['traction.mrr_by_month'],
    run: (i) => {
      const series = i.traction.mrr_by_month;
      if (series.length < 2) return null;

      const months = series.map((p) => p.month);
      const outOfOrder = months.some((m, idx) => idx > 0 && m < months[idx - 1]!);
      const duplicates = months.length !== new Set(months).size;

      // A gap in the series changes what "six months of growth" means, so it
      // is worth surfacing even though it is not an error.
      const sorted = [...months].sort();
      let gaps = 0;
      for (let idx = 1; idx < sorted.length; idx += 1) {
        if (monthsBetween(sorted[idx - 1]!, sorted[idx]!) !== 1) gaps += 1;
      }

      const problems: string[] = [];
      if (outOfOrder) problems.push('entries are not in chronological order');
      if (duplicates) problems.push('the same month appears more than once');
      if (gaps > 0) problems.push(`${gaps} gap(s) in the month sequence`);

      return problems.length > 0
        ? `Monthly revenue series has a problem: ${problems.join('; ')}. Growth consistency is scored from this series.`
        : null;
    },
  },
  {
    code: 'LTV_BELOW_CAC',
    class: 'warning',
    fields: ['product.ltv', 'product.cac', 'product.unit_econ_basis'],
    run: (i) => {
      const ltv = num(i.product.ltv);
      const cac = num(i.product.cac);
      if (ltv === null || cac === null || cac <= 0) return null;
      if (ltv >= cac) return null;
      // This is a finding, not necessarily an error (PRD 8.3). If the company
      // has acknowledged it, the report can treat it as a known position.
      if (isAnswered(i.product.unit_econ_basis)) {
        return `LTV (${ltv}) is below CAC (${cac}). The unit economics basis is stated, so confirm whether this is acknowledged or an input error.`;
      }
      return `LTV (${ltv}) is below CAC (${cac}), with no acknowledgement in the unit economics basis. Each customer currently costs more to acquire than they return.`;
    },
  },
  {
    code: 'ASK_INCONSISTENT_WITH_BURN',
    class: 'warning',
    fields: ['ask.ask_amount', 'ask.current_burn_monthly', 'ask.target_runway_months'],
    run: (i) => {
      const ask = num(i.ask.ask_amount);
      const burn = num(i.ask.current_burn_monthly);
      const target = num(i.ask.target_runway_months);
      if (ask === null || burn === null || target === null || burn <= 0 || target <= 0) return null;
      const implied = ask / burn;
      const drift = Math.abs(implied - target) / target;
      if (drift <= RUNWAY_DRIFT_WARNING) return null;
      return `The ask of ${ask} against a burn of ${burn}/month implies ${implied.toFixed(1)} months of runway, but the target runway is ${target} months. An investor will do this division in the meeting.`;
    },
  },
  {
    code: 'ESOP_POOL_MISMATCH',
    class: 'warning',
    fields: ['cap_table_legal.cap_table.esop_pool_bp', 'cap_table_legal.cap_table.holders'],
    run: (i) => {
      const ct = i.cap_table_legal.cap_table;
      const stated = num(ct.esop_pool_bp);
      if (stated === null) return null;
      const fromHolders = ct.holders
        .filter((h) => h.category === 'esop_pool')
        .reduce((acc, h) => acc + h.equity_bp, 0);
      if (ct.holders.every((h) => h.category !== 'esop_pool')) return null;
      if (Math.abs(stated - fromHolders) <= CAP_TABLE_BP_TOLERANCE) return null;
      return `The stated ESOP pool (${(stated / 100).toFixed(2)}%) does not match the ESOP row in the cap table (${(fromHolders / 100).toFixed(2)}%).`;
    },
  },
  {
    code: 'ESOP_OVER_ALLOCATED',
    class: 'blocking',
    fields: ['cap_table_legal.cap_table.holders'],
    run: (i) => {
      const over = i.cap_table_legal.cap_table.holders.filter(
        (h) => h.category === 'esop_pool' && isAnswered(h.allocated_bp) && (h.allocated_bp as number) > h.equity_bp,
      );
      return over.length > 0
        ? `ESOP allocated exceeds the pool size for holder ref "${over[0]!.ref}". More options are granted than exist.`
        : null;
    },
  },
  {
    code: 'NOT_INCORPORATED_WITH_CAP_TABLE',
    class: 'warning',
    fields: ['cap_table_legal.entity_type', 'cap_table_legal.cap_table.holders'],
    run: (i) => {
      if (i.cap_table_legal.entity_type !== 'not_incorporated') return null;
      if (i.cap_table_legal.cap_table.holders.length === 0) return null;
      return 'The entity is recorded as not incorporated, but a cap table with holders is present. Shareholdings cannot exist without an entity - confirm whether this is an intended allocation rather than an issued cap table.';
    },
  },
];

/* -------------------------------------------------------------------------- */
/* Runner                                                                     */
/* -------------------------------------------------------------------------- */

export interface ContradictionReport {
  contradictions: readonly Contradiction[];
  blocking: readonly Contradiction[];
  warnings: readonly Contradiction[];
  /** True when nothing blocking fired - generation may proceed on this axis. */
  canGenerate: boolean;
}

/**
 * Run every contradiction check.
 *
 * @param asOf Reference date for date-relative checks. Passed in rather than
 *             read from the clock so scoring and validation stay pure and the
 *             same intake validates identically in a test and in production.
 */
export function checkContradictions(intake: Intake, asOf: Date = new Date(0)): ContradictionReport {
  const contradictions: Contradiction[] = [];

  for (const check of CHECKS) {
    const message = check.run(intake, asOf);
    if (message !== null) {
      contradictions.push({
        code: check.code,
        class: check.class,
        message,
        fields: check.fields,
      });
    }
  }

  const blocking = contradictions.filter((c) => c.class === 'blocking');
  const warnings = contradictions.filter((c) => c.class === 'warning');

  return { contradictions, blocking, warnings, canGenerate: blocking.length === 0 };
}

/** Whole months between two 'YYYY-MM' strings. */
function monthsBetween(a: string, b: string): number {
  const [ay, am] = a.split('-').map(Number) as [number, number];
  const [by, bm] = b.split('-').map(Number) as [number, number];
  return (by - ay) * 12 + (bm - am);
}

/**
 * A recorded dismissal of a blocking contradiction (PRD P1-05).
 *
 * Every dismissal is written to the audit log with Dhruv's reason text. This
 * type is the payload.
 */
export interface ContradictionDismissal {
  code: string;
  reason: string;
  dismissedBy: string;
  dismissedAt: string;
}

/**
 * Which blocking contradictions remain after dismissals are applied.
 *
 * A dismissal must carry a non-empty reason; a blank reason does not dismiss
 * anything, because the reason is the entire audit value of the mechanism.
 */
export function unresolvedBlocking(
  report: ContradictionReport,
  dismissals: readonly ContradictionDismissal[],
): readonly Contradiction[] {
  const dismissed = new Set(
    dismissals.filter((d) => d.reason.trim().length > 0).map((d) => d.code),
  );
  return report.blocking.filter((c) => !dismissed.has(c.code));
}
