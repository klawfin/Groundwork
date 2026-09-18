/**
 * A valid narrative response, for guardrail and schema tests.
 *
 * FABRICATED. The prose describes the fictional company in the `complete`
 * intake fixture. Nothing here is real client output.
 *
 * Deliberately written to be exactly the kind of prose the tool should
 * produce: specific, evidence-citing, no investment-merit language. If a
 * guardrail fires on this fixture, the guardrail is wrong.
 */

import { DIMENSION_IDS, type ScoreResult } from '@klawfin/rubric';
import { DATA_ROOM_ITEMS, type NarrativeResponse } from '../../src/schema.js';

/** ~180 words, inside the executive_summary band. */
function execSummary(composite: number, band: string): string {
  return `Your composite readiness score is ${composite} out of 100, placing you in the ${band} band. The assessment covered six dimensions against a fixed rubric, and the underlying intake was substantially complete, so these scores carry high confidence. Your strongest position is traction: twenty-three paying customers, all referenceable, with six consecutive months of month-on-month revenue growth and cohort retention data that exists and is good. That combination is unusual at this stage and it is the part of your story that will survive the most scrutiny. Your weakest positions are concentrated in areas that are documentation problems rather than business problems. The ESOP pool is sized at ten percent but only four percent is allocated, and the defensibility claim rests on eighteen months of accumulated rate data that you have measured but not yet packaged for an outside reader. Neither of those is a reason an investor declines. Both are reasons a process takes longer than it should. The remediation plan that follows orders the work by how much it moves the score against how long it takes, and the first thirty days are entirely documentation.`;
}

/** ~230 words, inside the overall_assessment band. */
const OVERALL = `The score reflects a company whose substance is ahead of its paperwork. Across the six dimensions, the ones that measure what you have built and sold score well, and the ones that measure how legible that is to an outsider score less well. That is a specific and fixable shape, and it is worth naming plainly rather than treating every gap as equivalent.

Traction carries the heaviest weight in this rubric at twenty-five percent, and it is where you are strongest. Six months of consistent growth is a trend rather than a good quarter, and referenceable customers are the difference between a claim and a check an investor can run themselves. Team and execution also score well, with both founders full-time and a documented record of shipping.

Where the score comes down is in the dimensions that reward preparation. Your market sizing is bottom-up and sourced, which most companies at this stage cannot say, but your defensibility evidence sits in an internal analysis rather than in a form you could hand over. Your data room is ninety-four percent complete and indexed, which is genuinely good, and the remaining six percent is the part a diligence process will ask for first.

None of this changes what the company is. It changes how long a raise takes and how much explaining you do during it.`;

function observed(dimensionId: string): string {
  const text: Record<string, string> = {
    D1: 'Both founders are full-time with no recorded outside commitments, and both have direct operating experience in freight forwarding. Fourteen dated production releases in the last twelve months are documented in a changelog, which is a record of shipping under constraint rather than an assertion of it. Two advisors engage monthly and have taken customer reference calls. The one open item is dispatch-algorithm knowledge, which sits with the CTO and one senior engineer.',
    D2: 'The ideal customer profile is stated narrowly enough to build a target list from: mid-market Indian freight forwarders running fifty to three hundred shipments a month on a TMS they already dislike. Market sizing is bottom-up, derived from a count of registered forwarders multiplied by observed contract value, with the sources named. The competitive set includes direct vendors, an indirect ERP alternative, and the status quo, and competitor pricing is known.',
    D3: 'Monthly recurring revenue stands at 820,000 with a stated recognition basis that defers implementation fees over twelve months. Six consecutive months of month-on-month growth are recorded with no down month. Twenty-three paying customers are all confirmed referenceable. Cohort retention data exists, churn is 1.8 percent, and net revenue retention is tracked at 118 percent. The pipeline carries stage breakdown, value and a measured forty-seven day sales cycle.',
    D4: 'The product is live and scaling with 640 users. The problem is stated in a customer quote rather than in founder language, and the solution maps to it directly. Unit economics are computed from actuals with the basis stated, covering CAC, LTV, gross margin and contribution margin. Pricing is tied to margin recovered per shipment and the discount policy is documented. The defensibility claim rests on accumulated carrier rate data with a measured accuracy gain.',
    D5: 'The entity is a private limited company incorporated in June 2023, appropriate for the intended instrument. The cap table reconciles to one hundred percent, founders hold seventy-five percent, and there is no dead equity. Standard four-year vesting with a one-year cliff is documented for both founders. IP assignment covers employees and contractors. Statutory filings are current and prior-round paperwork is complete. The data room is ninety-four percent complete and indexed.',
    D6: 'The ask of 60,000,000 against a monthly burn of 2,400,000 implies twenty-five months of runway against a stated twenty-four month target, so the number reconciles. Use of funds is allocated across four categories totalling one hundred percent with headcount stated for each. Two measurable, dated milestones are named and both map to stated Series A criteria. The valuation expectation is grounded in three named comparable rounds at matching stage and geography.',
  };
  return text[dimensionId] ?? 'Observed content for this dimension.';
}

/**
 * Build a valid response matching a given score.
 *
 * Priority gaps are generated from the score so the response is internally
 * consistent with the computed prioritisation, exactly as a real generation
 * would be.
 */
export function validResponse(score: ScoreResult): NarrativeResponse {
  return {
    executive_summary: execSummary(score.composite, score.band.label),
    overall_assessment: OVERALL,
    dimensions: DIMENSION_IDS.map((id) => {
      const dimension = score.dimensions.find((d) => d.id === id);
      return {
        dimension_id: id,
        what_we_observed: observed(id),
        gaps: [
          {
            gap: 'The defensibility evidence exists internally but is not packaged for an outside reader.',
            why_it_matters:
              'An investor cannot verify a data advantage from a summary sentence, and will discount what they cannot check.',
            evidence: 'moat_evidence records an accuracy gain but no shareable analysis is in the data room.',
          },
        ],
        recommendations: [
          {
            action: 'Package the rate-data accuracy analysis as a two-page memo and add it to the data room.',
            effort: 'low' as const,
            estimated_duration: '3-5 days',
            expected_effect:
              'Moves the defensibility claim from an assertion to something a diligence process can verify.',
          },
        ],
        confidence_note:
          dimension && dimension.confidence !== 'high'
            ? `Coverage for this dimension is ${Math.round(
                (dimension.coverage ?? 0) * 100,
              )}%, so this section is based on limited information.`
            : null,
      };
    }),
    priority_gaps: [
      {
        rank: 1,
        dimension_id: 'D4',
        gap: 'Defensibility evidence is not in a shareable form.',
        rationale:
          'This ranks first because it is low effort and sits in a dimension weighted at fifteen percent, so the score movement per day of work is the highest available.',
      },
      {
        rank: 2,
        dimension_id: 'D5',
        gap: 'The ESOP pool is allocated well below its size.',
        rationale:
          'Second because it is a documentation change rather than a negotiation, and an unallocated pool invites a question about hiring plans.',
      },
    ],
    remediation_plan: {
      days_0_30: [
        'Package the rate-data accuracy analysis as a two-page memo for the data room.',
        'Reconcile the ESOP grant register against the stated pool size.',
      ],
      days_31_60: ['Extend the cohort retention analysis to twenty-four months.'],
      days_61_90: ['Complete the remaining six percent of the data room index.'],
    },
    data_room_checklist: DATA_ROOM_ITEMS.map((item) => ({
      item,
      status: 'present' as const,
      note: 'Recorded as present in the intake.',
    })),
    questions_you_cannot_yet_answer: [
      'What is your net revenue retention excluding your three largest customers?',
      'What happens to gross margin if carrier API costs double?',
    ],
    generation_notes: null,
  };
}

/**
 * A baseline valid response with specific fields overridden, for guardrail
 * tests.
 *
 * The baseline's client-facing text is deliberately FREE of score-like
 * numbers, so a numeric-consistency test only ever exercises the string the
 * test itself supplies. A baseline carrying its own composite would fail
 * against whatever score the test passes in, which is a fixture bug wearing
 * the costume of a guardrail finding.
 */
export function responseWith(overrides: Partial<NarrativeResponse>): NarrativeResponse {
  const base = validResponse(BASELINE_SCORE);
  base.executive_summary = NUMERIC_FREE_SUMMARY;
  base.overall_assessment = OVERALL;
  return structuredClone({ ...base, ...overrides });
}

/** ~175 words, no score-like numbers. */
const NUMERIC_FREE_SUMMARY = `Your readiness assessment covered six dimensions against a fixed rubric, and the underlying intake was substantially complete, so these results carry high confidence. Your strongest position is traction: a referenceable paying customer base, consecutive months of month-on-month revenue growth, and cohort retention data that exists and is good. That combination is unusual at this stage and it is the part of your story that will survive the most scrutiny. Your weakest positions are concentrated in areas that are documentation problems rather than business problems. The option pool is sized sensibly but under-allocated against it, and the defensibility claim rests on accumulated operating data that you have measured but not yet packaged for an outside reader. Neither of those is a reason an investor declines. Both are reasons a process takes longer than it should, and both are addressable inside a month. The remediation plan that follows orders the work by how much it moves your position against how long it takes, and the first thirty days are entirely documentation.`;

/**
 * A minimal score stand-in for tests that only exercise text checks.
 *
 * Real scores come from the rubric; this exists so `responseWith` does not
 * need one injected for every call.
 */
const BASELINE_SCORE: ScoreResult = {
  composite: 82,
  compositeExact: 82,
  band: {
    id: 'raise_ready',
    label: 'Raise-ready',
    min: 75,
    max: 100,
    meaning: 'Prepared. Remaining work is refinement and process, not substance.',
  },
  overallCoverage: 0.9,
  overallConfidence: 'high',
  preRevenueMode: false,
  weightRedistributed: false,
  dimensions: DIMENSION_IDS.map((id) => ({
    id,
    name: id,
    weight: 1 / 6,
    definedWeight: 1 / 6,
    raw: 16,
    max: 20,
    pct: 80,
    weightedContribution: 80 / 6,
    coverage: 0.9,
    confidence: 'high' as const,
    lowConfidenceFromNa: false,
    entirelyNotApplicable: false,
    notAssessed: false,
    subCriteria: [],
  })),
  rubricVersion: '1.0.0',
};
