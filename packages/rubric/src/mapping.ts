/**
 * Intake field -> sub-criterion mapping, and the derivation rules.
 *
 * This is the executable half of the rubric. `definitions.ts` carries the
 * human-readable field names and anchor text that appear in the report;
 * this file carries the accessors and the rules that turn intake values into
 * 0-4 anchor scores.
 *
 * TWO KINDS OF SUB-CRITERION, both deterministic (PRD G2, NG9):
 *
 *   derived  - a rule here reads structured intake values and returns a level.
 *              No human judgment, no model. Re-runnable forever.
 *   anchored - Dhruv selects the level against the printed anchor text. His
 *              selection is stored intake data, so the same intake yields the
 *              same score. He is the assessor; this tool is the instrument.
 *
 * Neither kind involves the LLM. The model receives the finished scores as
 * facts and writes narrative about them (readme.md structural rule 2).
 *
 * WHY A RULE RETURNS WHAT IT RETURNS is commented at each threshold. The
 * rubric is one of the two places a future reader most needs the reasoning
 * (readme.md coding conventions), and every one of these numbers will be
 * argued about after the first three real clients.
 */

import type { AnchorScore, DimensionId, SubCriterion } from './types';
import { ALL_SUB_CRITERIA } from './definitions';
import type { Intake } from '@klawfin/core';
import { isAnswered, numOrZero as n, presentCount } from '@klawfin/core';

/* -------------------------------------------------------------------------- */
/* Tunable thresholds - named, never inline (readme.md: no magic numbers)      */
/* -------------------------------------------------------------------------- */

/**
 * Revenue levels that read as "meaningful for the stage" in the Indian
 * pre-seed/seed market this practice serves. Monthly recurring, in INR.
 *
 * These are the most contestable numbers in the file. They are a v1 baseline
 * to be revised after three real clients (PRD OPEN-13 sits next to this).
 * Sector-specific thresholds are deliberately NOT modelled in v1 - one weight
 * set, one threshold set, revisited with evidence.
 */
export const REVENUE_THRESHOLDS_INR = {
  /** Below this, revenue exists but is small for the stage. */
  meaningful: 100_000,
  /** At or above this, revenue is clearly meaningful for pre-seed/seed. */
  strong: 500_000,
} as const;

/** Months of history required for the growth sub-criteria (PRD 5.3, D3.2). */
export const GROWTH_MONTHS = { minimum: 3, ideal: 6 } as const;

/** Cap-table structural thresholds, in basis points. 10000 = 100%. */
export const CAP_TABLE_BP = {
  /** Cap table must reconcile to 100% within this tolerance. */
  reconciliationTolerance: 50,
  /** Founders below this hold an unhealthy minority for the stage. */
  founderHealthyMajority: 5_000,
  /** Founders below this is a severe structural problem, not a minor one. */
  founderSevere: 4_000,
  /** A single early angel block above this is an oversized block. */
  oversizedAngelBlock: 2_500,
  /** An ESOP pool below this is under-sized for a company about to raise. */
  esopUndersized: 500,
  /** An inactive holder above this much equity is material dead equity. */
  deadEquityMaterial: 500,
} as const;

/** Data room completeness percentages. */
export const DATA_ROOM_PCT = { adequate: 60, complete: 90 } as const;

/** Tolerance on "use of funds percentages total 100". */
export const USE_OF_FUNDS_TOLERANCE_PCT = 0.5;

/** How closely the implied runway must match the stated target to score a 4. */
export const RUNWAY_MATCH_TOLERANCE = 0.25;

/** Customer-evidence counts for the pre-revenue substitute ladder. */
export const DISCOVERY_THRESHOLDS = { interviews: 10, interviewsStrong: 20, partnersStrong: 3 } as const;

/** Committed-demand counts for the pre-revenue substitute ladder (D3.1). */
export const COMMITMENT_THRESHOLDS = { several: 3, strong: 5 } as const;

/** Beta repeat-usage rate that reads as strong engagement (percent). */
export const BETA_REPEAT_STRONG_PCT = 40;

/* -------------------------------------------------------------------------- */
/* Presence                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Presence lives in @klawfin/core because the validation package needs it
 * too, and importing it from here would make rubric and validation mutually
 * dependent. Re-exported so callers of the rubric need only one import.
 */
export { isAnswered } from '@klawfin/core';

export interface InputAccessor {
  /** Human-readable field name, as it appears in the PRD and the report. */
  label: string;
  get: (intake: Intake) => unknown;
}

const f = (label: string, get: (intake: Intake) => unknown): InputAccessor => ({ label, get });

/* -------------------------------------------------------------------------- */
/* Scoring mode                                                               */
/* -------------------------------------------------------------------------- */

/**
 * PRD 8.4: a company at `idea`/`prototype` stage, or with no paying customers,
 * is assessed in pre-revenue mode. D3 is then scored against the substitute
 * evidence ladder rather than marked N/A, so twelve signed design partners
 * score as traction rather than as an absence of revenue.
 */
export function isPreRevenue(intake: Intake): boolean {
  const stage = intake.product.product_stage;
  const payingCustomers = intake.traction.paying_customers_count;
  const mrr = intake.traction.mrr_current;
  const arr = intake.traction.arr_current;

  // Recorded revenue overrides everything, including a stage of "idea".
  //
  // Such an intake is contradictory and generation is blocked until it is
  // resolved (validation/contradictions.ts). But scoring must still behave
  // sensibly if it is reached, and the safe direction is to keep the revenue:
  // running the substitute ladder on a company with real revenue would ignore
  // its strongest evidence and understate D3.
  if ((isAnswered(mrr) && (mrr as number) > 0) || (isAnswered(arr) && (arr as number) > 0)) {
    return false;
  }

  if (stage === 'idea' || stage === 'prototype') return true;

  // "No paying customers" only counts as pre-revenue when we actually know it.
  // An unanswered customer count is missing data, not evidence of pre-revenue -
  // otherwise every blank intake would be assessed on the substitute ladder.
  if (isAnswered(payingCustomers) && (payingCustomers as number) === 0) return true;

  return false;
}

export interface DerivationResult {
  score: AnchorScore;
  /** Plain-English statement of how the score was reached. Shown in the UI (P1-04). */
  derivation: string;
}

export interface ScoringRule {
  id: string;
  /** Accessors used for coverage and for evidence, in normal mode. */
  inputs: readonly InputAccessor[];
  /** Accessors used when the assessment is in pre-revenue mode (PRD 8.4). */
  preRevenueInputs?: readonly InputAccessor[];
  /** Present only for `derived` sub-criteria. */
  derive?: (intake: Intake) => DerivationResult;
  /** Present only for `derived` sub-criteria with a substitute ladder. */
  derivePreRevenue?: (intake: Intake) => DerivationResult;
}

const r = (score: AnchorScore, derivation: string): DerivationResult => ({ score, derivation });

/* ========================================================================== */
/* D1 - Team & Execution Capability                                           */
/* ========================================================================== */

const D1_RULES: ScoringRule[] = [
  {
    id: 'D1.1',
    inputs: [
      f('founders[].background', (i) => i.team.founders.map((x) => x.background).filter(isAnswered)),
      f('founders[].years_in_sector', (i) =>
        i.team.founders.map((x) => x.years_in_sector).filter(isAnswered),
      ),
      f('founder_market_fit_notes', (i) => i.team.founder_market_fit_notes),
    ],
  },
  {
    id: 'D1.2',
    inputs: [
      f('founders[].role', (i) => i.team.founders.map((x) => x.role).filter(isAnswered)),
      f('has_technical_cofounder', (i) => i.team.has_technical_cofounder),
      f('key_hires', (i) => i.team.key_hires),
      f('open_critical_roles', (i) => i.team.open_critical_roles),
    ],
  },
  {
    id: 'D1.3',
    inputs: [
      f('founders[].full_time', (i) => i.team.founders.map((x) => x.full_time).filter(isAnswered)),
      f('founders[].other_commitments', (i) =>
        i.team.founders.map((x) => x.other_commitments).filter(isAnswered),
      ),
    ],
    derive: (i) => {
      const founders = i.team.founders;
      if (founders.length === 0) return r(0, 'No founders recorded.');

      const fullTime = founders.filter((x) => x.full_time === true).length;
      const ratio = fullTime / founders.length;
      // Only a full-time founder's outside commitment is material to this
      // sub-criterion; a part-time founder's commitments are already captured
      // by the ratio and should not be counted twice.
      const committedElsewhere = founders.filter(
        (x) => x.full_time === true && isAnswered(x.other_commitments),
      ).length;

      const summary = `${fullTime} of ${founders.length} founders full-time`;

      if (ratio === 0) return r(0, `${summary}.`);
      if (ratio === 1 && committedElsewhere === 0) {
        return r(4, `${summary}, none with recorded outside commitments.`);
      }
      if (ratio === 1) {
        return r(3, `${summary}, ${committedElsewhere} with a disclosed outside commitment.`);
      }
      if (ratio >= 0.5) return r(2, `${summary}.`);
      return r(1, `${summary} - a minority.`);
    },
  },
  {
    id: 'D1.4',
    inputs: [
      f('prior_ventures', (i) => i.team.prior_ventures),
      f('shipping_history', (i) => i.team.shipping_history),
      f('notable_deliveries_last_12m', (i) => i.team.notable_deliveries_last_12m),
    ],
  },
  {
    id: 'D1.5',
    inputs: [
      f('key_person_dependencies', (i) => i.team.key_person_dependencies),
      f('advisors', (i) => i.team.advisors),
      f('advisor_engagement_depth', (i) => i.team.advisor_engagement_depth),
    ],
  },
];

/* ========================================================================== */
/* D2 - Market & Opportunity Sizing                                           */
/* ========================================================================== */

const D2_RULES: ScoringRule[] = [
  {
    id: 'D2.1',
    inputs: [
      f('icp_description', (i) => i.market.icp_description),
      f('icp_named_examples', (i) => i.market.icp_named_examples),
    ],
  },
  {
    id: 'D2.2',
    inputs: [
      f('tam', (i) => i.market.tam),
      f('sam', (i) => i.market.sam),
      f('som', (i) => i.market.som),
      f('sizing_method', (i) => i.market.sizing_method),
      f('sizing_sources', (i) => i.market.sizing_sources),
    ],
    derive: (i) => {
      const { tam, sam, som, sizing_method, sizing_sources } = i.market;
      const anyFigure = presentCount(tam, sam, som) > 0;
      const hasSources = isAnswered(sizing_sources);
      const method = sizing_method ?? 'none';

      if (!anyFigure && (method === 'none' || !isAnswered(sizing_method))) {
        return r(0, 'No market sizing figures and no stated method.');
      }
      // The distinction the rubric actually cares about is derivation, not the
      // size of the number. A large top-down TAM with no derivation is worth
      // less than a small bottom-up SOM that can be defended.
      if (method === 'bottom_up') {
        return hasSources
          ? r(4, 'Bottom-up sizing with sources cited.')
          : r(3, 'Bottom-up sizing, but sources or assumptions are not stated.');
      }
      if (method === 'mixed') {
        return r(2, 'Mixed top-down and bottom-up sizing.');
      }
      if (method === 'top_down') {
        return hasSources
          ? r(2, 'Top-down sizing with sources cited, but no bottom-up derivation.')
          : r(1, 'Top-down sizing with no sources and no derivation.');
      }
      return r(1, 'Sizing figures present with no stated method.');
    },
  },
  {
    id: 'D2.3',
    inputs: [
      f('why_now_narrative', (i) => i.market.why_now_narrative),
      f('market_shift_evidence', (i) => i.market.market_shift_evidence),
    ],
  },
  {
    id: 'D2.4',
    inputs: [
      f('competitors[]', (i) => i.market.competitors),
      f('differentiation_claim', (i) => i.market.differentiation_claim),
      f('competitor_pricing_known', (i) => i.market.competitor_pricing_known),
    ],
    derive: (i) => {
      const competitors = i.market.competitors;
      const hasDifferentiation = isAnswered(i.market.differentiation_claim);
      const pricingKnown = i.market.competitor_pricing_known === true;

      if (competitors.length === 0) {
        return r(0, 'No competitors named.');
      }
      // Naming only direct competitors is the common failure. Investors test
      // for awareness of substitutes and of the status quo ("they do nothing,
      // in a spreadsheet"), which is where most founders have no answer.
      const kinds = new Set(competitors.map((c) => c.kind).filter(isAnswered));
      const beyondDirect = kinds.has('indirect') || kinds.has('status_quo');

      if (!hasDifferentiation) {
        return r(1, `${competitors.length} competitor(s) named with no stated differentiation.`);
      }
      if (!beyondDirect) {
        return r(2, `${competitors.length} direct competitor(s) named; no substitutes or status quo.`);
      }
      if (!pricingKnown) {
        return r(3, 'Direct and indirect alternatives named, with a stated difference; pricing not known.');
      }
      return r(4, 'Direct, indirect and status-quo alternatives named, with pricing known.');
    },
  },
];

/* ========================================================================== */
/* D3 - Traction & Validation                                                 */
/* ========================================================================== */
/* Every D3 rule has a pre-revenue counterpart (PRD 8.4). The substitute is    */
/* scored on the same 0-4 scale; the report states which ladder was used, so   */
/* the score is not misread as comparable to a revenue-stage company's.        */

/** Are the monthly points contiguous and in chronological order? */
function monthSeriesQuality(series: readonly { month: string; value: number }[]): {
  months: number;
  consistent: boolean;
  grew: boolean;
} {
  const sorted = [...series].sort((a, b) => a.month.localeCompare(b.month));
  const months = sorted.length;
  if (months < 2) return { months, consistent: false, grew: false };

  let consistent = true;
  for (let idx = 1; idx < sorted.length; idx += 1) {
    const prev = sorted[idx - 1]!;
    const cur = sorted[idx]!;
    // A single down month breaks "consistent month-on-month growth". That is
    // strict on purpose: the rubric distinguishes a trend from one good month.
    if (cur.value < prev.value) consistent = false;
  }
  const grew = sorted[sorted.length - 1]!.value > sorted[0]!.value;
  return { months, consistent, grew };
}

const D3_RULES: ScoringRule[] = [
  {
    id: 'D3.1',
    inputs: [
      f('mrr_current', (i) => i.traction.mrr_current),
      f('arr_current', (i) => i.traction.arr_current),
      f('revenue_currency', (i) => i.traction.revenue_currency),
      f('revenue_recognition_basis', (i) => i.traction.revenue_recognition_basis),
    ],
    preRevenueInputs: [
      f('lois_signed', (i) => i.traction.lois_signed),
      f('pilots_running', (i) => i.traction.pilots_running),
      f('preorders_count', (i) => i.traction.preorders_count),
      f('waitlist_with_payment_intent', (i) => i.traction.waitlist_with_payment_intent),
    ],
    derive: (i) => {
      const mrr = i.traction.mrr_current;
      const arr = i.traction.arr_current;
      const hasBasis = isAnswered(i.traction.revenue_recognition_basis);
      // Fall back to ARR/12 when only ARR was captured.
      const monthly = isAnswered(mrr) ? (mrr as number) : isAnswered(arr) ? (arr as number) / 12 : 0;

      if (monthly <= 0) return r(0, 'No revenue recorded.');
      if (!hasBasis) {
        return r(1, 'Revenue recorded with no stated recognition basis.');
      }
      if (monthly < REVENUE_THRESHOLDS_INR.meaningful) {
        return r(2, `Monthly revenue below the ${REVENUE_THRESHOLDS_INR.meaningful} threshold for the stage.`);
      }
      if (monthly < REVENUE_THRESHOLDS_INR.strong) {
        return r(3, 'Revenue meaningful for the stage, with a stated recognition basis.');
      }
      return r(4, 'Revenue clearly meaningful for stage and sector, recognition basis stated.');
    },
    derivePreRevenue: (i) => {
      const committed =
        n(i.traction.lois_signed) + n(i.traction.pilots_running) + n(i.traction.preorders_count);
      const waitlist = n(i.traction.waitlist_with_payment_intent);

      if (committed === 0 && waitlist === 0) {
        return r(0, 'No signed commitments, pre-orders or waitlist with payment intent.');
      }
      if (committed === 0) {
        return r(1, `Waitlist of ${waitlist} with payment intent, but nothing signed.`);
      }
      if (committed < COMMITMENT_THRESHOLDS.several) {
        return r(2, `${committed} signed commitment(s) - LOIs, pilots or pre-orders.`);
      }
      if (committed < COMMITMENT_THRESHOLDS.strong) {
        return r(3, `${committed} signed commitments across LOIs, pilots and pre-orders.`);
      }
      return r(4, `${committed} signed commitments that convert to revenue on launch.`);
    },
  },
  {
    id: 'D3.2',
    inputs: [
      f('mrr_by_month[]', (i) => i.traction.mrr_by_month),
      f('growth_rate_calc', (i) => i.traction.growth_rate_calc),
    ],
    preRevenueInputs: [
      f('leading_indicator_name', (i) => i.traction.leading_indicator_name),
      f('leading_indicator_by_month[]', (i) => i.traction.leading_indicator_by_month),
    ],
    derive: (i) => {
      const { months, consistent, grew } = monthSeriesQuality(i.traction.mrr_by_month);
      if (months === 0) return r(0, 'No month-by-month revenue history.');
      if (months < GROWTH_MONTHS.minimum) {
        return r(1, `Only ${months} month(s) of history - not yet a trend.`);
      }
      if (months < GROWTH_MONTHS.ideal) {
        return r(2, `${months} months of history; the rubric looks for ${GROWTH_MONTHS.ideal}.`);
      }
      if (consistent && grew) {
        return r(4, `${months} months of consistent month-on-month growth.`);
      }
      return r(3, `${months} months of history with uneven or flat growth.`);
    },
    derivePreRevenue: (i) => {
      const named = isAnswered(i.traction.leading_indicator_name);
      const { months, consistent, grew } = monthSeriesQuality(i.traction.leading_indicator_by_month);

      if (!named && months === 0) return r(0, 'No leading indicator tracked.');
      if (months === 0) return r(1, 'A leading indicator is named but not measured over time.');
      if (months < GROWTH_MONTHS.minimum) {
        return r(2, `Only ${months} month(s) of the leading indicator.`);
      }
      if (months >= GROWTH_MONTHS.ideal && consistent && grew) {
        return r(4, `${months} months of consistent growth in ${i.traction.leading_indicator_name}.`);
      }
      return r(3, `${months} months of leading-indicator history.`);
    },
  },
  {
    id: 'D3.3',
    inputs: [
      f('paying_customers_count', (i) => i.traction.paying_customers_count),
      f('logos_referenceable', (i) => i.traction.logos_referenceable),
      f('lois_signed', (i) => i.traction.lois_signed),
      f('pilots_running', (i) => i.traction.pilots_running),
    ],
    preRevenueInputs: [
      f('discovery_interviews_count', (i) => i.traction.discovery_interviews_count),
      f('named_targets_engaged', (i) => i.traction.named_targets_engaged),
      f('design_partners_committed', (i) => i.traction.design_partners_committed),
    ],
    derive: (i) => {
      const paying = n(i.traction.paying_customers_count);
      const referenceable = n(i.traction.logos_referenceable);
      const softEvidence = n(i.traction.lois_signed) + n(i.traction.pilots_running);

      if (paying === 0 && softEvidence === 0) {
        return r(0, 'No paying customers and no signed LOIs or pilots.');
      }
      if (paying === 0) {
        return r(1, `No paying customers; ${softEvidence} LOI(s) or pilot(s).`);
      }
      // The question an investor actually asks is not "how many customers"
      // but "which of them will take my call". That is what separates 2 from 4.
      if (referenceable === 0) {
        return r(2, `${paying} paying customer(s), none confirmed referenceable.`);
      }
      if (referenceable < paying) {
        return r(3, `${paying} paying customer(s), ${referenceable} referenceable.`);
      }
      return r(4, `${paying} paying customer(s), all referenceable to an investor.`);
    },
    derivePreRevenue: (i) => {
      const interviews = n(i.traction.discovery_interviews_count);
      const targets = n(i.traction.named_targets_engaged);
      const partners = n(i.traction.design_partners_committed);

      if (interviews === 0 && targets === 0 && partners === 0) {
        return r(0, 'No documented customer discovery.');
      }
      if (partners === 0 && interviews < DISCOVERY_THRESHOLDS.interviews) {
        return r(1, `${interviews} discovery interview(s) documented, no committed design partners.`);
      }
      if (partners === 0) {
        return r(2, `${interviews} discovery interviews documented, but no committed design partners.`);
      }
      if (interviews >= DISCOVERY_THRESHOLDS.interviewsStrong && partners >= DISCOVERY_THRESHOLDS.partnersStrong) {
        return r(4, `${interviews} interviews and ${partners} committed design partners.`);
      }
      return r(3, `${interviews} interviews and ${partners} committed design partner(s).`);
    },
  },
  {
    id: 'D3.4',
    inputs: [
      f('churn_rate', (i) => i.traction.churn_rate),
      f('retention_cohorts_available', (i) => i.traction.retention_cohorts_available),
      f('repeat_purchase_rate', (i) => i.traction.repeat_purchase_rate),
      f('nrr', (i) => i.traction.nrr),
    ],
    preRevenueInputs: [
      f('beta_repeat_usage_rate', (i) => i.traction.beta_repeat_usage_rate),
      f('pilot_engagement_notes', (i) => i.traction.pilot_engagement_notes),
    ],
    derive: (i) => {
      const cohorts = i.traction.retention_cohorts_available === true;
      const hasChurn = isAnswered(i.traction.churn_rate);
      const hasRepeat = isAnswered(i.traction.repeat_purchase_rate);
      const hasNrr = isAnswered(i.traction.nrr);

      if (!cohorts && !hasChurn && !hasRepeat && !hasNrr) {
        return r(0, 'Retention is not measured.');
      }
      if (cohorts) {
        return hasNrr
          ? r(4, 'Cohort retention data available, with net revenue retention tracked.')
          : r(3, 'Cohort retention data available.');
      }
      // Aggregate churn without a cohort view is the standard early-stage
      // position. It is not nothing, but it cannot answer "does month 6 look
      // like month 1", which is the question that matters.
      return hasRepeat
        ? r(2, 'Aggregate churn and repeat purchase tracked; no cohort view.')
        : r(1, 'A churn figure is stated with no cohort basis.');
    },
    derivePreRevenue: (i) => {
      const rate = i.traction.beta_repeat_usage_rate;
      const notes = isAnswered(i.traction.pilot_engagement_notes);

      if (!isAnswered(rate) && !notes) return r(0, 'No pilot or beta usage measured.');
      if (!isAnswered(rate)) return r(1, 'Pilot engagement described but repeat usage not measured.');
      const value = rate as number;
      if (value >= BETA_REPEAT_STRONG_PCT) {
        return r(4, `${value}% repeat usage measured across the beta cohort.`);
      }
      if (value > 0) return r(3, `${value}% repeat usage measured across the beta cohort.`);
      return r(2, 'Repeat usage measured at zero.');
    },
  },
  {
    id: 'D3.5',
    inputs: [
      f('pipeline_value', (i) => i.traction.pipeline_value),
      f('pipeline_stage_breakdown', (i) => i.traction.pipeline_stage_breakdown),
      f('avg_sales_cycle_days', (i) => i.traction.avg_sales_cycle_days),
    ],
    preRevenueInputs: [
      f('named_prospects', (i) => i.traction.named_prospects),
      f('prospect_stage_breakdown', (i) => i.traction.prospect_stage_breakdown),
    ],
    derive: (i) => {
      const hasValue = isAnswered(i.traction.pipeline_value);
      const hasStages = isAnswered(i.traction.pipeline_stage_breakdown);
      const hasCycle = isAnswered(i.traction.avg_sales_cycle_days);

      if (!hasValue && !hasStages) return r(0, 'No pipeline tracked.');
      if (hasValue && !hasStages) {
        return r(1, 'A pipeline value with no stage breakdown - a list of conversations.');
      }
      if (!hasValue) return r(2, 'Pipeline stages recorded without values.');
      if (!hasCycle) return r(3, 'Pipeline with value and stage breakdown; sales cycle not measured.');
      return r(4, 'Pipeline with stage discipline, values and a measured sales cycle.');
    },
    derivePreRevenue: (i) => {
      const prospects = n(i.traction.named_prospects);
      const hasStages = isAnswered(i.traction.prospect_stage_breakdown);

      if (prospects === 0 && !hasStages) return r(0, 'No named prospects.');
      if (!hasStages) {
        return prospects < COMMITMENT_THRESHOLDS.several
          ? r(1, `${prospects} named prospect(s), no stage discipline.`)
          : r(2, `${prospects} named prospects contacted, with no stage discipline.`);
      }
      return prospects >= COMMITMENT_THRESHOLDS.strong
        ? r(4, `${prospects} named prospects with stages recorded.`)
        : r(3, `${prospects} named prospect(s) with a stated stage.`);
    },
  },
];

/* ========================================================================== */
/* D4 - Product & Business Model Clarity                                      */
/* ========================================================================== */

const PRODUCT_STAGE_SCORE: Record<string, AnchorScore> = {
  idea: 0,
  prototype: 1,
  beta: 2,
  live: 3,
  scaling: 4,
};

const D4_RULES: ScoringRule[] = [
  {
    id: 'D4.1',
    inputs: [
      f('product_stage', (i) => i.product.product_stage),
      f('live_users_count', (i) => i.product.live_users_count),
    ],
    derive: (i) => {
      const stage = i.product.product_stage;
      if (!isAnswered(stage)) return r(0, 'Product stage not recorded.');
      const base = PRODUCT_STAGE_SCORE[stage as string] ?? 0;
      const users = i.product.live_users_count;

      // A claim of "live" with a recorded zero users does not support a 3.
      // The contradiction module flags the inverse (idea + users > 0); this
      // caps the optimistic direction rather than taking the claim at face value.
      if (base >= 3 && isAnswered(users) && (users as number) === 0) {
        return r(2, `Stage recorded as "${stage}" but live users recorded as zero.`);
      }
      return r(base, `Product stage recorded as "${stage}".`);
    },
  },
  {
    id: 'D4.2',
    inputs: [
      f('problem_statement', (i) => i.product.problem_statement),
      f('solution_statement', (i) => i.product.solution_statement),
      f('customer_quote_evidence', (i) => i.product.customer_quote_evidence),
    ],
  },
  {
    id: 'D4.3',
    inputs: [
      f('cac', (i) => i.product.cac),
      f('ltv', (i) => i.product.ltv),
      f('gross_margin_pct', (i) => i.product.gross_margin_pct),
      f('contribution_margin', (i) => i.product.contribution_margin),
      f('unit_econ_basis', (i) => i.product.unit_econ_basis),
    ],
    derive: (i) => {
      const { cac, ltv, gross_margin_pct, contribution_margin, unit_econ_basis } = i.product;
      const core = presentCount(cac, ltv, gross_margin_pct);
      const hasBasis = isAnswered(unit_econ_basis);

      if (core === 0 && !isAnswered(contribution_margin)) {
        return r(0, 'Unit economics not computed.');
      }
      // The basis is the whole sub-criterion. CAC and LTV without a stated
      // derivation are a spreadsheet aspiration, and an investor will find
      // that out in one question.
      if (!hasBasis) {
        return r(1, `${core} of 3 core unit-economics figures present, with no stated basis.`);
      }
      if (core < 3) {
        return r(2, `${core} of 3 core figures computed; the rest are absent or assumed.`);
      }
      return isAnswered(contribution_margin)
        ? r(4, 'CAC, LTV, gross margin and contribution margin all computed, with the basis stated.')
        : r(3, 'CAC, LTV and gross margin computed with the basis stated; contribution margin absent.');
    },
  },
  {
    id: 'D4.4',
    inputs: [
      f('pricing_model', (i) => i.product.pricing_model),
      f('price_points', (i) => i.product.price_points),
      f('pricing_rationale', (i) => i.product.pricing_rationale),
      f('discount_practice', (i) => i.product.discount_practice),
    ],
  },
  {
    id: 'D4.5',
    inputs: [
      f('moat_claim', (i) => i.product.moat_claim),
      f('moat_evidence', (i) => i.product.moat_evidence),
      f('ip_filed', (i) => i.product.ip_filed),
    ],
  },
];

/* ========================================================================== */
/* D5 - Cap Table & Legal Hygiene                                             */
/* ========================================================================== */

const ENTITY_BASE_SCORE: Record<string, AnchorScore> = {
  not_incorporated: 0,
  // A proprietorship or partnership cannot take equity investment at all
  // without converting first - that is a restructuring, not a tidy-up.
  sole_proprietorship: 1,
  partnership: 1,
  llp: 2,
  private_limited: 4,
  c_corp: 4,
  other: 2,
};

const D5_RULES: ScoringRule[] = [
  {
    id: 'D5.1',
    inputs: [
      f('entity_type', (i) => i.cap_table_legal.entity_type),
      f('incorporation_date', (i) => i.cap_table_legal.incorporation_date),
      f('jurisdiction', (i) => i.cap_table_legal.jurisdiction),
      f('structure_matches_raise_intent', (i) => i.cap_table_legal.structure_matches_raise_intent),
    ],
    derive: (i) => {
      const entity = i.cap_table_legal.entity_type;
      if (!isAnswered(entity)) return r(0, 'Entity type not recorded.');
      const base = ENTITY_BASE_SCORE[entity as string] ?? 2;
      if (base <= 2) {
        return r(base, `Entity type "${entity}" requires restructuring before an equity raise.`);
      }

      const match = i.cap_table_legal.structure_matches_raise_intent;
      if (match === 'no') return r(2, `Entity is "${entity}" but the structure does not match the raise intent.`);
      if (match === 'partial') return r(3, `Entity is "${entity}" with structural items to resolve before close.`);
      if (match === 'yes') return r(4, `Entity is "${entity}" and fits the intended investor and instrument.`);
      return r(3, `Entity is "${entity}"; fit with the raise intent not confirmed.`);
    },
  },
  {
    id: 'D5.2',
    inputs: [
      f('cap_table.holders[]', (i) => i.cap_table_legal.cap_table.holders),
      f('cap_table.esop_pool_bp', (i) => i.cap_table_legal.cap_table.esop_pool_bp),
      f('cap_table.dead_equity_flag', (i) => i.cap_table_legal.cap_table.dead_equity_flag),
    ],
    derive: (i) => {
      const ct = i.cap_table_legal.cap_table;
      const holders = ct.holders;
      if (holders.length === 0) return r(0, 'No cap table recorded.');

      const total = holders.reduce((acc, h) => acc + h.equity_bp, 0);
      const founderBp = holders
        .filter((h) => h.category === 'founder')
        .reduce((acc, h) => acc + h.equity_bp, 0);
      const esopBp = isAnswered(ct.esop_pool_bp)
        ? (ct.esop_pool_bp as number)
        : holders.filter((h) => h.category === 'esop_pool').reduce((acc, h) => acc + h.equity_bp, 0);
      const largestAngel = Math.max(
        0,
        ...holders.filter((h) => h.category === 'angel').map((h) => h.equity_bp),
      );
      const deadEquity =
        ct.dead_equity_flag === true ||
        holders.some(
          (h) =>
            (h.category === 'inactive_founder' || h.is_operational === false) &&
            h.equity_bp >= CAP_TABLE_BP.deadEquityMaterial,
        );

      const pct = (bp: number) => (bp / 100).toFixed(1);

      // Checked worst-first: a cap table that does not reconcile cannot be
      // assessed for anything else, and dead equity outranks a thin ESOP pool.
      if (Math.abs(total - 10_000) > CAP_TABLE_BP.reconciliationTolerance) {
        return r(1, `Cap table totals ${pct(total)}%, not 100% - it does not reconcile.`);
      }
      if (founderBp < CAP_TABLE_BP.founderSevere) {
        return r(0, `Founders hold ${pct(founderBp)}% - a minority, with no stated explanation.`);
      }
      if (deadEquity) {
        return r(2, 'Dead equity present - a non-operational holder with a material stake.');
      }
      if (founderBp < CAP_TABLE_BP.founderHealthyMajority) {
        return r(2, `Founders hold ${pct(founderBp)}%, below a healthy majority for the stage.`);
      }
      if (largestAngel > CAP_TABLE_BP.oversizedAngelBlock) {
        return r(2, `A single early angel block of ${pct(largestAngel)}% is oversized.`);
      }
      if (esopBp === 0) {
        return r(2, 'No ESOP pool - investors will require one created before close, diluting founders.');
      }
      if (esopBp < CAP_TABLE_BP.esopUndersized) {
        return r(3, `ESOP pool of ${pct(esopBp)}% is under-sized for a company about to raise.`);
      }
      return r(4, `Founders hold ${pct(founderBp)}%, ESOP ${pct(esopBp)}%, no dead equity.`);
    },
  },
  {
    id: 'D5.3',
    inputs: [
      f('founder_vesting_in_place', (i) => i.cap_table_legal.founder_vesting_in_place),
      f('vesting_schedule', (i) => i.cap_table_legal.vesting_schedule),
      f('cliff', (i) => i.cap_table_legal.cliff),
    ],
    derive: (i) => {
      const inPlace = i.cap_table_legal.founder_vesting_in_place;
      const schedule = isAnswered(i.cap_table_legal.vesting_schedule);
      const cliff = isAnswered(i.cap_table_legal.cliff);

      if (!isAnswered(inPlace) || inPlace === 'no') return r(0, 'No founder vesting in place.');
      if (inPlace === 'partial') {
        return r(2, 'Vesting documented for some founders but not all.');
      }
      if (!schedule) return r(1, 'Vesting stated to be in place but no schedule is documented.');
      if (!cliff) return r(2, 'Vesting documented without a cliff.');

      // A standard 4-year schedule with a 1-year cliff is what an investor
      // expects to see. Anything non-standard invites negotiation, so it is
      // solid rather than strong.
      const founders = i.cap_table_legal.cap_table.holders.filter((h) => h.category === 'founder');
      const allStandard =
        founders.length > 0 && founders.every((h) => h.vesting === '4y_1y_cliff');
      return allStandard
        ? r(4, 'Standard four-year vesting with a one-year cliff, documented for every founder.')
        : r(3, 'Vesting with a cliff documented for all founders; schedule is non-standard.');
    },
  },
  {
    id: 'D5.4',
    inputs: [
      f('ip_assignment_signed', (i) => i.cap_table_legal.ip_assignment_signed),
      f('employment_agreements_in_place', (i) => i.cap_table_legal.employment_agreements_in_place),
      f('contractor_ip_terms', (i) => i.cap_table_legal.contractor_ip_terms),
    ],
    derive: (i) => {
      const ip = i.cap_table_legal.ip_assignment_signed;
      const employment = i.cap_table_legal.employment_agreements_in_place;
      const contractor = i.cap_table_legal.contractor_ip_terms;

      const none = !isAnswered(ip) && !isAnswered(employment) && !isAnswered(contractor);
      if (none || (ip === 'no' && employment === 'no')) {
        return r(0, 'No IP assignment and no employment agreements.');
      }
      // Contractors are the classic diligence failure: the logo, the landing
      // page and sometimes the first version of the product were built by
      // someone who never assigned the IP.
      if (ip === 'no') return r(1, 'Employment agreements exist without IP assignment.');
      if (contractor === 'no') return r(2, 'Employees covered; contractors have no IP terms.');
      if (ip === 'partial' || employment === 'partial' || contractor === 'partial') {
        return r(3, 'IP assignment in place, with some contributors still to be covered.');
      }
      if (ip === 'yes' && employment === 'yes' && contractor === 'yes') {
        return r(4, 'IP assigned from every contributor, contractors included.');
      }
      return r(3, 'IP assignment in place; coverage of all contributors not confirmed.');
    },
  },
  {
    id: 'D5.5',
    inputs: [
      f('roc_filings_current', (i) => i.cap_table_legal.roc_filings_current),
      f('gst_status', (i) => i.cap_table_legal.gst_status),
      f('tds_status', (i) => i.cap_table_legal.tds_status),
      f('prior_round_docs', (i) => i.cap_table_legal.prior_round_docs),
      f('fema_fdi_compliance', (i) => i.cap_table_legal.fema_fdi_compliance),
    ],
    derive: (i) => {
      const l = i.cap_table_legal;
      const states = [l.roc_filings_current, l.gst_status, l.tds_status].filter(isAnswered) as string[];
      if (states.length === 0 && !isAnswered(l.prior_round_docs)) {
        return r(0, 'No statutory compliance position recorded.');
      }

      const material = states.filter((s) => s === 'material_lapses').length;
      const minor = states.filter((s) => s === 'minor_lapses').length;
      const unknown = states.filter((s) => s === 'unknown').length;
      const docs = l.prior_round_docs;
      const fema = l.fema_fdi_compliance;

      if (material >= 2 || docs === 'missing') {
        return r(0, 'Filings materially overdue, or prior-round paperwork missing.');
      }
      if (material === 1 || docs === 'partial') {
        return r(1, 'A material filing lapse, or prior-round documents incomplete.');
      }
      if (minor > 0 || fema === 'issues') {
        return r(2, 'Minor lapses or FEMA/FDI issues under remediation.');
      }
      if (unknown > 0 || !isAnswered(docs)) {
        return r(3, 'Filings current; some items not yet confirmed.');
      }
      return r(4, 'Filings current, prior-round paperwork complete, FEMA/FDI position clean.');
    },
  },
  {
    id: 'D5.6',
    inputs: [
      f('data_room_exists', (i) => i.cap_table_legal.data_room_exists),
      f('data_room_completeness_pct', (i) => i.cap_table_legal.data_room_completeness_pct),
      f('data_room_index_quality', (i) => i.cap_table_legal.data_room_index_quality),
    ],
    derive: (i) => {
      const l = i.cap_table_legal;
      if (l.data_room_exists !== true) return r(0, 'No data room.');

      const index = l.data_room_index_quality;
      const pct = isAnswered(l.data_room_completeness_pct) ? (l.data_room_completeness_pct as number) : 0;

      if (index === 'none' || !isAnswered(index)) {
        return r(1, 'Documents exist but are not indexed.');
      }
      if (index === 'unindexed' || index === 'indexed_stale' || pct < DATA_ROOM_PCT.adequate) {
        return r(2, `Data room ${pct}% complete, index quality "${index}".`);
      }
      return pct >= DATA_ROOM_PCT.complete
        ? r(4, `Data room ${pct}% complete and indexed - shareable immediately.`)
        : r(3, `Data room ${pct}% complete and indexed.`);
    },
  },
];

/* ========================================================================== */
/* D6 - Ask Size & Use-of-Funds Clarity                                       */
/* ========================================================================== */

const D6_RULES: ScoringRule[] = [
  {
    id: 'D6.1',
    inputs: [
      f('ask_amount', (i) => i.ask.ask_amount),
      f('current_burn_monthly', (i) => i.ask.current_burn_monthly),
      f('current_runway_months', (i) => i.ask.current_runway_months),
      f('target_runway_months', (i) => i.ask.target_runway_months),
    ],
    derive: (i) => {
      const { ask_amount, current_burn_monthly, target_runway_months } = i.ask;
      if (!isAnswered(ask_amount)) return r(0, 'No ask amount stated.');
      if (!isAnswered(current_burn_monthly) || (current_burn_monthly as number) <= 0) {
        return r(1, 'An ask with no burn figure to derive it from.');
      }
      if (!isAnswered(target_runway_months)) {
        return r(2, 'Ask and burn recorded, but no target runway stated.');
      }

      const implied = (ask_amount as number) / (current_burn_monthly as number);
      const target = target_runway_months as number;
      const drift = target > 0 ? Math.abs(implied - target) / target : 1;
      const hasMilestones = i.ask.milestones_this_round.length > 0;

      if (drift > RUNWAY_MATCH_TOLERANCE) {
        return r(
          3,
          `Ask implies ${implied.toFixed(1)} months of runway against a ${target}-month target.`,
        );
      }
      return hasMilestones
        ? r(4, `Ask implies ${implied.toFixed(1)} months, matching the ${target}-month target, tied to milestones.`)
        : r(3, `Ask implies ${implied.toFixed(1)} months, matching the target, but no milestones are stated.`);
    },
  },
  {
    id: 'D6.2',
    inputs: [f('use_of_funds_breakdown[]', (i) => i.ask.use_of_funds_breakdown)],
    derive: (i) => {
      const lines = i.ask.use_of_funds_breakdown;
      if (lines.length === 0) return r(0, 'No use of funds stated.');
      if (lines.length === 1) return r(1, 'Use of funds stated as a single line.');

      const total = lines.reduce((acc, l) => acc + l.pct, 0);
      if (Math.abs(total - 100) > USE_OF_FUNDS_TOLERANCE_PCT) {
        return r(2, `${lines.length} categories, totalling ${total.toFixed(1)}% rather than 100%.`);
      }
      const withHeadcount = lines.filter((l) => isAnswered(l.headcount)).length;
      return withHeadcount > 0
        ? r(4, `${lines.length} categories totalling 100%, with headcount stated.`)
        : r(3, `${lines.length} categories totalling 100%, without headcount detail.`);
    },
  },
  {
    id: 'D6.3',
    inputs: [
      f('milestones_this_round[]', (i) => i.ask.milestones_this_round),
      f('next_round_criteria', (i) => i.ask.next_round_criteria),
    ],
  },
  {
    id: 'D6.4',
    inputs: [
      f('valuation_expectation', (i) => i.ask.valuation_expectation),
      f('instrument_type', (i) => i.ask.instrument_type),
      f('comparable_basis', (i) => i.ask.comparable_basis),
    ],
  },
];

/* ========================================================================== */
/* Assembled mapping                                                          */
/* ========================================================================== */

export const SCORING_RULES: readonly ScoringRule[] = [
  ...D1_RULES,
  ...D2_RULES,
  ...D3_RULES,
  ...D4_RULES,
  ...D5_RULES,
  ...D6_RULES,
];

export const RULE_BY_ID: ReadonlyMap<string, ScoringRule> = new Map(
  SCORING_RULES.map((rule) => [rule.id, rule]),
);

/** Which accessors apply, given the scoring mode (PRD 8.4). */
export function inputsFor(rule: ScoringRule, preRevenue: boolean): readonly InputAccessor[] {
  return preRevenue && rule.preRevenueInputs ? rule.preRevenueInputs : rule.inputs;
}

/**
 * Integrity check: every sub-criterion has a rule, every `derived`
 * sub-criterion has a derivation function, and every rule has a sub-criterion.
 *
 * Without this, a sub-criterion added to `definitions.ts` and forgotten here
 * would silently score 0 on every client. Asserted at module load so it fails
 * a unit test rather than a client meeting.
 */
export function assertMappingIntegrity(): void {
  for (const s of ALL_SUB_CRITERIA) {
    const rule = RULE_BY_ID.get(s.id);
    if (!rule) throw new Error(`Sub-criterion ${s.id} has no scoring rule in mapping.ts`);
    if (s.scoringKind === 'derived' && !rule.derive) {
      throw new Error(`Sub-criterion ${s.id} is 'derived' but has no derive() rule`);
    }
    if (s.scoringKind === 'anchored' && rule.derive) {
      throw new Error(`Sub-criterion ${s.id} is 'anchored' but mapping.ts supplies a derive() rule`);
    }
    if (s.preRevenueSubstitute && !rule.derivePreRevenue) {
      throw new Error(`Sub-criterion ${s.id} declares a pre-revenue substitute but has no rule for it`);
    }
    if (rule.derivePreRevenue && !s.preRevenueSubstitute) {
      throw new Error(`Rule ${s.id} has a pre-revenue rule but no substitute ladder is defined`);
    }
  }
  for (const rule of SCORING_RULES) {
    if (!ALL_SUB_CRITERIA.some((s) => s.id === rule.id)) {
      throw new Error(`mapping.ts defines a rule for unknown sub-criterion ${rule.id}`);
    }
  }
}

assertMappingIntegrity();

/** Convenience for the intake UI: which dimension a rule belongs to. */
export function dimensionOf(subCriterion: SubCriterion): DimensionId {
  return subCriterion.dimensionId;
}
