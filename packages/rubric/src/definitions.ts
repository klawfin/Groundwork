/**
 * Rubric v1.0 - dimensions, weights, sub-criteria and anchors.
 *
 * Source: PRD Section 5.1-5.3. Weights are the PRD's "defensible v1 baseline,
 * not a finding" (PRD 5.1) and are OPEN-13, Nikhil's to refine.
 *
 * ANY change to a weight, a sub-criterion, an anchor or a field mapping MUST
 * increment RUBRIC_VERSION in the same commit (readme.md, PRD 5.7). A commit
 * that changes scoring behaviour without a version bump silently breaks
 * historical comparability.
 *
 * Anchor text is why this file is long, and the length is the point. PRD G3
 * requires Dhruv to answer "why did I score 2 on cap table hygiene" from the
 * report alone. That is only possible if every level of every sub-criterion
 * has text written for it, rather than a generic 0-4 scale applied by feel.
 */

import type { Dimension, DimensionId, SubCriterion } from './types.js';

/**
 * Semantic version of this rubric. Stored on every report; reports are never
 * retroactively rescored (PRD 5.7).
 */
export const RUBRIC_VERSION = '1.0.0';

/** Helper keeps the definitions below readable. */
function sub(s: Omit<SubCriterion, 'weight'> & { weight?: number }): SubCriterion {
  return { weight: 1, ...s };
}

/* ========================================================================== */
/* D1 - Team & Execution Capability (20%)                                     */
/* ========================================================================== */

const D1_SUBS: readonly SubCriterion[] = [
  sub({
    id: 'D1.1',
    dimensionId: 'D1',
    label: 'Founder-market fit',
    inputs: ['founders[].background', 'founders[].years_in_sector', 'founder_market_fit_notes'],
    strongLooksLike:
      'A non-obvious, specific reason these founders see this problem before others do.',
    scoringKind: 'anchored',
    effortToClose: 'high',
    anchors: {
      0: 'No stated connection between the founders and this problem.',
      1: 'A connection is claimed ("we are passionate about this") with no specifics behind it.',
      2: 'Genuine adjacent experience, but the link to this specific problem is generic - anyone in the sector could say it.',
      3: 'Clear relevant experience that explains why they can build this, though the insight itself is not unusual.',
      4: 'A non-obvious, specific reason these founders see this problem before others do, evidenced by what they did before.',
    },
  }),
  sub({
    id: 'D1.2',
    dimensionId: 'D1',
    label: 'Team completeness',
    inputs: ['founders[].role', 'has_technical_cofounder', 'key_hires', 'open_critical_roles'],
    strongLooksLike:
      'Every function critical to the next 12 months is covered in-house, not by an agency or a promise.',
    scoringKind: 'anchored',
    effortToClose: 'high',
    anchors: {
      0: 'Critical functions are uncovered and unacknowledged.',
      1: 'Gaps are acknowledged but the plan to fill them is "we will hire".',
      2: 'Core functions covered, but at least one function critical to the next 12 months sits with an agency, a part-timer or an unsigned candidate.',
      3: 'All critical functions covered in-house; depth is thin in places.',
      4: 'Every function critical to the next 12 months is covered in-house by someone already delivering.',
    },
  }),
  sub({
    id: 'D1.3',
    dimensionId: 'D1',
    label: 'Commitment',
    inputs: ['founders[].full_time', 'founders[].other_commitments'],
    strongLooksLike: 'All founders full-time, no material outside commitments.',
    scoringKind: 'derived',
    effortToClose: 'medium',
    anchors: {
      0: 'No founder is full-time.',
      1: 'A minority of founders are full-time; the rest have material outside commitments.',
      2: 'About half the founding team is full-time, or full-time founders carry material outside commitments.',
      3: 'All founders full-time, with a disclosed but immaterial outside commitment.',
      4: 'All founders full-time with no material outside commitments.',
    },
  }),
  sub({
    id: 'D1.4',
    dimensionId: 'D1',
    label: 'Prior execution evidence',
    inputs: ['prior_ventures', 'shipping_history', 'notable_deliveries_last_12m'],
    strongLooksLike: 'A track record of shipping under constraint, documented, with dates.',
    scoringKind: 'anchored',
    effortToClose: 'high',
    anchors: {
      0: 'Nothing shipped, and no prior delivery history offered.',
      1: 'Delivery is claimed but undated and undocumented.',
      2: 'Some shipping history exists; it is partial, or predates the current team composition.',
      3: 'A documented record of delivery over the last 12 months.',
      4: 'A documented track record of shipping under real constraint, with dates, across the team.',
    },
  }),
  sub({
    id: 'D1.5',
    dimensionId: 'D1',
    label: 'Key-person risk and advisory bench',
    inputs: ['key_person_dependencies', 'advisors', 'advisor_engagement_depth'],
    strongLooksLike: 'No single point of failure, plus advisors who demonstrably do something.',
    scoringKind: 'anchored',
    effortToClose: 'medium',
    anchors: {
      0: 'Total dependence on one person, with no advisory bench.',
      1: 'Advisors are named for credibility only, with no stated engagement.',
      2: 'A real single point of failure exists, partially offset by advisors who engage occasionally.',
      3: 'Key-person risk is acknowledged and partly mitigated; advisors engage on a stated cadence.',
      4: 'No single point of failure, and advisors who demonstrably do something specific and recent.',
    },
  }),
];

/* ========================================================================== */
/* D2 - Market & Opportunity Sizing (15%)                                     */
/* ========================================================================== */

const D2_SUBS: readonly SubCriterion[] = [
  sub({
    id: 'D2.1',
    dimensionId: 'D2',
    label: 'ICP specificity',
    inputs: ['icp_description', 'icp_named_examples'],
    strongLooksLike:
      'The ideal customer is described narrowly enough that you could list twenty by name.',
    scoringKind: 'anchored',
    effortToClose: 'low',
    anchors: {
      0: 'No ideal customer profile stated.',
      1: 'A category rather than a customer ("SMEs", "millennials").',
      2: 'A segment with some qualifying attributes, but still too broad to build a target list from.',
      3: 'A specific segment with firmographic qualifiers; a target list could be assembled with work.',
      4: 'Narrow enough that twenty named target customers are already listed.',
    },
  }),
  sub({
    id: 'D2.2',
    dimensionId: 'D2',
    label: 'Sizing method and defensibility',
    inputs: ['tam', 'sam', 'som', 'sizing_method', 'sizing_sources'],
    strongLooksLike:
      'Bottom-up, from unit price x reachable count, with sources cited and assumptions stated.',
    scoringKind: 'derived',
    effortToClose: 'low',
    anchors: {
      0: 'No market sizing attempted.',
      1: 'A single top-down number from an industry report, with no derivation.',
      2: 'Top-down sizing with some segmentation, or a bottom-up attempt with unstated assumptions.',
      3: 'Bottom-up derivation present; sources or assumptions are partially stated.',
      4: 'Bottom-up from unit price x reachable count, with sources cited and every assumption stated.',
    },
  }),
  sub({
    id: 'D2.3',
    dimensionId: 'D2',
    label: 'Why now',
    inputs: ['why_now_narrative', 'market_shift_evidence'],
    strongLooksLike:
      'A specific, recent, external change that makes this possible now and not three years ago.',
    scoringKind: 'anchored',
    effortToClose: 'low',
    anchors: {
      0: 'No "why now" offered.',
      1: 'A generic trend is cited ("digital transformation", "AI is growing").',
      2: 'A real shift is named but is neither recent nor specific to this opportunity.',
      3: 'A specific recent change is named; the causal link to this business is asserted rather than evidenced.',
      4: 'A specific, recent, external change with evidence, that makes this possible now and not three years ago.',
    },
  }),
  sub({
    id: 'D2.4',
    dimensionId: 'D2',
    label: 'Competitive awareness and differentiation',
    inputs: ['competitors[]', 'differentiation_claim', 'competitor_pricing_known'],
    strongLooksLike:
      'Names real competitors including the non-obvious ones, and states a difference that is not "we are better".',
    scoringKind: 'derived',
    effortToClose: 'low',
    anchors: {
      0: 'Claims to have no competitors.',
      1: 'Names one or two obvious competitors; differentiation is "we are better" or "we are cheaper".',
      2: 'Names the obvious competitors with a stated difference, but misses substitutes and indirect alternatives.',
      3: 'A credible competitive set including non-obvious players, with a concrete stated difference.',
      4: 'Names direct, indirect and status-quo alternatives, knows their pricing, and states a structural difference.',
    },
  }),
];

/* ========================================================================== */
/* D3 - Traction & Validation (25%)                                           */
/* ========================================================================== */
/* Heaviest weight. Pre-revenue companies are scored against the substitute    */
/* evidence ladder (PRD 8.4), NOT marked N/A. A pre-revenue company with       */
/* twelve signed design partners is not a 0 on traction, and the report must   */
/* not say it is.                                                              */

const D3_SUBS: readonly SubCriterion[] = [
  sub({
    id: 'D3.1',
    dimensionId: 'D3',
    label: 'Revenue level',
    inputs: ['mrr_current', 'arr_current', 'revenue_currency', 'revenue_recognition_basis'],
    strongLooksLike:
      'Revenue meaningful for the stage and the sector, with a stated recognition basis.',
    scoringKind: 'derived',
    effortToClose: 'high',
    anchors: {
      0: 'No revenue.',
      1: 'Revenue claimed with no recognition basis stated, or non-recurring one-off amounts presented as recurring.',
      2: 'Real revenue, small for the stage, or recognition basis unclear.',
      3: 'Revenue meaningful for the stage with a stated recognition basis.',
      4: 'Revenue clearly meaningful for stage and sector, recognition basis stated and conservative.',
    },
    preRevenueSubstitute: {
      label: 'Committed demand in lieu of revenue',
      inputs: ['lois_signed', 'pilots_running', 'preorders_count', 'waitlist_with_payment_intent'],
      anchors: {
        0: 'No signed commitment of any kind.',
        1: 'Verbal interest only, nothing signed.',
        2: 'A small number of unpaid LOIs or free pilots.',
        3: 'Paid pilots or pre-orders from several organisations.',
        4: 'Multiple signed, paid commitments that convert to revenue on launch.',
      },
    },
  }),
  sub({
    id: 'D3.2',
    dimensionId: 'D3',
    label: 'Growth consistency',
    inputs: ['mrr_by_month[]', 'growth_rate_calc'],
    strongLooksLike:
      'Consistent month-on-month growth over at least six months, not one good month.',
    scoringKind: 'derived',
    effortToClose: 'high',
    anchors: {
      0: 'No month-by-month history available.',
      1: 'Fewer than three months of history, or a single good month presented as a trend.',
      2: 'Three to five months of history, or six months with material volatility and no explanation.',
      3: 'At least six months of history with positive but uneven growth.',
      4: 'At least six months of consistent month-on-month growth.',
    },
    preRevenueSubstitute: {
      label: 'Leading-indicator growth',
      inputs: ['leading_indicator_name', 'leading_indicator_by_month[]'],
      anchors: {
        0: 'No leading indicator tracked.',
        1: 'An indicator is named but not measured over time.',
        2: 'Fewer than three months of the leading indicator.',
        3: 'At least three months of growth in the leading indicator the company actually has.',
        4: 'Six or more months of consistent growth in a leading indicator that plausibly predicts revenue.',
      },
    },
  }),
  sub({
    id: 'D3.3',
    dimensionId: 'D3',
    label: 'Customer evidence',
    inputs: ['paying_customers_count', 'logos_referenceable', 'lois_signed', 'pilots_running'],
    strongLooksLike:
      'Named, referenceable, paying customers who will take a call from an investor.',
    scoringKind: 'derived',
    effortToClose: 'medium',
    anchors: {
      0: 'No customers and no documented customer contact.',
      1: 'Customers claimed but none nameable or referenceable.',
      2: 'A handful of paying customers; none confirmed willing to take a reference call.',
      3: 'Several paying customers, some referenceable.',
      4: 'Named, referenceable, paying customers who will take a call from an investor.',
    },
    preRevenueSubstitute: {
      label: 'Documented customer discovery',
      inputs: ['discovery_interviews_count', 'named_targets_engaged', 'design_partners_committed'],
      anchors: {
        0: 'No customer discovery done.',
        1: 'Informal conversations, undocumented and uncounted.',
        2: 'A documented but small interview count, with no committed design partners.',
        3: 'Substantial documented discovery plus at least one committed design partner.',
        4: 'Extensive documented discovery and several committed design partners who will speak to an investor.',
      },
    },
  }),
  sub({
    id: 'D3.4',
    dimensionId: 'D3',
    label: 'Retention and repeat',
    inputs: ['churn_rate', 'retention_cohorts_available', 'repeat_purchase_rate', 'nrr'],
    strongLooksLike: 'Cohort retention data exists and is good.',
    scoringKind: 'derived',
    effortToClose: 'medium',
    anchors: {
      0: 'Retention is not measured at all.',
      1: 'A churn number is asserted with no cohort basis.',
      2: 'Aggregate churn is tracked; no cohort view exists.',
      3: 'Cohort retention data exists and is adequate.',
      4: 'Cohort retention data exists and is strong, with net revenue retention tracked.',
    },
    preRevenueSubstitute: {
      label: 'Pilot or beta engagement depth',
      inputs: ['beta_repeat_usage_rate', 'pilot_engagement_notes'],
      anchors: {
        0: 'No usage measured in pilots or beta.',
        1: 'Sign-ups counted; nothing about repeat use.',
        2: 'Some repeat usage observed but not measured systematically.',
        3: 'Measured repeat usage across the beta cohort.',
        4: 'Strong, measured repeat engagement in pilots, with users returning to the core action.',
      },
    },
  }),
  sub({
    id: 'D3.5',
    dimensionId: 'D3',
    label: 'Pipeline quality',
    inputs: ['pipeline_value', 'pipeline_stage_breakdown', 'avg_sales_cycle_days'],
    strongLooksLike:
      'A pipeline with stage discipline and a known conversion rate, not a list of conversations.',
    scoringKind: 'derived',
    effortToClose: 'low',
    anchors: {
      0: 'No pipeline tracked.',
      1: 'A list of conversations described as a pipeline, with no stages or values.',
      2: 'Pipeline value stated without stage breakdown, or stages without values.',
      3: 'Pipeline with stage breakdown and a stated sales cycle.',
      4: 'Pipeline with stage discipline, values, a known conversion rate and a measured sales cycle.',
    },
    preRevenueSubstitute: {
      label: 'Named prospects with stated stage',
      inputs: ['named_prospects', 'prospect_stage_breakdown'],
      anchors: {
        0: 'No named prospects.',
        1: 'A list of intentions and target logos with no contact made.',
        2: 'Named prospects contacted, with no stage discipline.',
        3: 'Named prospects with a stated stage for each.',
        4: 'Named prospects with stages, decision-maker identified and next step dated.',
      },
    },
  }),
];

/* ========================================================================== */
/* D4 - Product & Business Model Clarity (15%)                                */
/* ========================================================================== */

const D4_SUBS: readonly SubCriterion[] = [
  sub({
    id: 'D4.1',
    dimensionId: 'D4',
    label: 'Product stage',
    inputs: ['product_stage', 'live_users_count'],
    strongLooksLike: 'Live, in production, with real users doing the core action repeatedly.',
    scoringKind: 'derived',
    effortToClose: 'high',
    anchors: {
      0: 'Idea only - nothing built.',
      1: 'Prototype or mockup, not usable by a real customer.',
      2: 'Beta, in the hands of a small number of users.',
      3: 'Live in production with real users.',
      4: 'Live and scaling, with real users doing the core action repeatedly.',
    },
  }),
  sub({
    id: 'D4.2',
    dimensionId: 'D4',
    label: 'Problem-solution articulation',
    inputs: ['problem_statement', 'solution_statement', 'customer_quote_evidence'],
    strongLooksLike:
      "The problem is stated in the customer's own words, and the solution maps to it one-to-one.",
    scoringKind: 'anchored',
    effortToClose: 'low',
    anchors: {
      0: 'Neither the problem nor the solution is clearly stated.',
      1: 'A solution in search of a problem - the product is described, the problem is assumed.',
      2: "Both stated, but in the founders' language, and the mapping between them is loose.",
      3: 'Clear problem and solution that map to each other; customer evidence is thin.',
      4: "The problem is stated in the customer's own words, with quotes, and the solution maps to it one-to-one.",
    },
  }),
  sub({
    id: 'D4.3',
    dimensionId: 'D4',
    label: 'Unit economics clarity',
    inputs: ['cac', 'ltv', 'gross_margin_pct', 'contribution_margin', 'unit_econ_basis'],
    strongLooksLike:
      'Unit economics computed from actuals, with the basis stated, not a spreadsheet aspiration.',
    scoringKind: 'derived',
    effortToClose: 'medium',
    anchors: {
      0: 'Unit economics not computed.',
      1: 'Figures asserted with no basis - target numbers presented as actuals.',
      2: 'Some components computed from actuals, others assumed, with the split unstated.',
      3: 'Unit economics computed from actuals with the basis stated; some components still modelled.',
      4: 'Fully computed from actuals, basis stated, including payback period and contribution margin.',
    },
  }),
  sub({
    id: 'D4.4',
    dimensionId: 'D4',
    label: 'Pricing coherence',
    inputs: ['pricing_model', 'price_points', 'pricing_rationale', 'discount_practice'],
    strongLooksLike: 'Pricing is deliberate, tied to value delivered, and consistently applied.',
    scoringKind: 'anchored',
    effortToClose: 'low',
    anchors: {
      0: 'No pricing set.',
      1: 'A price exists with no rationale, typically set by copying a competitor.',
      2: 'A stated model and price points, but discounting is ad hoc and undocumented.',
      3: 'Deliberate pricing tied to a value metric, applied fairly consistently.',
      4: 'Pricing tied to value delivered, consistently applied, with a documented discount policy.',
    },
  }),
  sub({
    id: 'D4.5',
    dimensionId: 'D4',
    label: 'Defensibility',
    inputs: ['moat_claim', 'moat_evidence', 'ip_filed'],
    strongLooksLike:
      'A defensibility claim with evidence behind it - data, network, contracts, regulatory position, filed IP.',
    scoringKind: 'anchored',
    effortToClose: 'high',
    anchors: {
      0: 'No defensibility claim.',
      1: 'Defensibility claimed as "first mover" or "execution speed" with nothing behind it.',
      2: 'A plausible moat thesis with no evidence yet that it is forming.',
      3: 'A defensibility claim with early evidence - some proprietary data, some switching cost.',
      4: 'A defensibility claim with hard evidence: data, network effects, exclusive contracts, regulatory position or filed IP.',
    },
  }),
];

/* ========================================================================== */
/* D5 - Cap Table & Legal Hygiene (15%)                                       */
/* ========================================================================== */
/* PRD: the dimension where Klawfin's remediation offer is most concrete. A    */
/* low D5 is not bad news for the client - it is the most fixable gap and the  */
/* clearest reason to buy the Sprint.                                          */
/*                                                                             */
/* PII note: third-party cap-table holders are stored as refs (F1, A1, ESOP),  */
/* never as names. See validation/schema.ts and docs/decisions/0006.           */

const D5_SUBS: readonly SubCriterion[] = [
  sub({
    id: 'D5.1',
    dimensionId: 'D5',
    label: 'Entity structure fit for the raise',
    inputs: ['entity_type', 'incorporation_date', 'jurisdiction', 'structure_matches_raise_intent'],
    strongLooksLike:
      'Structure is appropriate for the intended investor and instrument, with no restructuring required before close.',
    scoringKind: 'derived',
    effortToClose: 'high',
    anchors: {
      0: 'Not incorporated.',
      1: 'Incorporated in a form that cannot take the intended investment without restructuring.',
      2: 'Workable structure requiring material change before close (conversion, holdco, flip).',
      3: 'Appropriate structure with minor items to tidy.',
      4: 'Structure fits the intended investor and instrument with no restructuring required.',
    },
  }),
  sub({
    id: 'D5.2',
    dimensionId: 'D5',
    label: 'Cap table cleanliness',
    inputs: ['cap_table.holders[]', 'cap_table.esop_pool_bp', 'cap_table.dead_equity_flag'],
    strongLooksLike:
      'Founders hold a healthy majority, no dead equity, no oversized early angel block, ESOP pool sized sensibly.',
    scoringKind: 'derived',
    effortToClose: 'high',
    anchors: {
      0: 'No cap table available, or founders hold a minority with no explanation.',
      1: 'Cap table exists but does not reconcile to 100%, or has undisclosed holders.',
      2: 'Reconciles, but carries a material problem: dead equity, an oversized early angel block, or no ESOP pool.',
      3: 'Clean and reconciling, with a minor issue such as an under-sized ESOP pool.',
      4: 'Founders hold a healthy majority, no dead equity, no oversized early block, ESOP sized sensibly.',
    },
  }),
  sub({
    id: 'D5.3',
    dimensionId: 'D5',
    label: 'Founder vesting',
    inputs: ['founder_vesting_in_place', 'vesting_schedule', 'cliff'],
    strongLooksLike: 'Vesting with a cliff in place and documented for all founders.',
    scoringKind: 'derived',
    effortToClose: 'low',
    anchors: {
      0: 'No founder vesting of any kind.',
      1: 'Vesting agreed verbally, not documented.',
      2: 'Vesting documented for some founders but not all, or without a cliff.',
      3: 'Vesting with a cliff documented for all founders; schedule is non-standard.',
      4: 'Standard vesting with a cliff, documented and executed for every founder.',
    },
  }),
  sub({
    id: 'D5.4',
    dimensionId: 'D5',
    label: 'IP and employment hygiene',
    inputs: ['ip_assignment_signed', 'employment_agreements_in_place', 'contractor_ip_terms'],
    strongLooksLike: 'All IP assigned to the company from every contributor, contractors included.',
    scoringKind: 'derived',
    effortToClose: 'low',
    anchors: {
      0: 'No IP assignment and no employment agreements.',
      1: 'Employment agreements exist without IP assignment clauses.',
      2: 'Employees covered; contractors and freelancers are not.',
      3: 'All current contributors covered; historical contributors unverified.',
      4: 'IP assigned to the company from every contributor ever, contractors included, and verified.',
    },
  }),
  sub({
    id: 'D5.5',
    dimensionId: 'D5',
    label: 'Statutory compliance and prior-round paperwork',
    inputs: [
      'roc_filings_current',
      'gst_status',
      'tds_status',
      'prior_round_docs',
      'fema_fdi_compliance',
    ],
    strongLooksLike:
      'Filings current, prior-round paperwork complete and executed, FEMA/FDI clean where foreign capital is present.',
    scoringKind: 'derived',
    effortToClose: 'medium',
    anchors: {
      0: 'Filings materially overdue, or prior-round paperwork missing entirely.',
      1: 'Some filings lapsed; prior-round documents unsigned or unlocatable.',
      2: 'Minor lapses being remediated, or prior-round paperwork incomplete in a fixable way.',
      3: 'Filings current; a small number of items outstanding.',
      4: 'Filings current, prior-round paperwork complete and executed, FEMA/FDI clean where applicable.',
    },
  }),
  sub({
    id: 'D5.6',
    dimensionId: 'D5',
    label: 'Data room state',
    inputs: ['data_room_exists', 'data_room_completeness_pct', 'data_room_index_quality'],
    strongLooksLike:
      'An indexed, current, complete data room that can be shared the day a term sheet is discussed.',
    scoringKind: 'derived',
    effortToClose: 'low',
    anchors: {
      0: 'No data room.',
      1: 'A folder of unsorted documents.',
      2: 'A partial data room, un-indexed or materially out of date.',
      3: 'An indexed data room, largely complete and current.',
      4: 'Indexed, current and complete - shareable the day a term sheet is discussed.',
    },
  }),
];

/* ========================================================================== */
/* D6 - Ask Size & Use-of-Funds Clarity (10%)                                 */
/* ========================================================================== */

const D6_SUBS: readonly SubCriterion[] = [
  sub({
    id: 'D6.1',
    dimensionId: 'D6',
    label: 'Ask justified by runway math',
    inputs: ['ask_amount', 'current_burn_monthly', 'current_runway_months', 'target_runway_months'],
    strongLooksLike:
      'The ask falls out of a burn-and-milestone calculation and can be derived in front of an investor.',
    scoringKind: 'derived',
    effortToClose: 'low',
    anchors: {
      0: 'No ask stated, or no burn figure to test it against.',
      1: 'A round number with no derivation.',
      2: 'An ask that roughly reconciles with burn, with the target runway unstated.',
      3: 'The ask reconciles with burn and a stated target runway.',
      4: 'The ask falls out of a burn-and-milestone calculation and can be derived live in front of an investor.',
    },
  }),
  sub({
    id: 'D6.2',
    dimensionId: 'D6',
    label: 'Use-of-funds granularity',
    inputs: ['use_of_funds_breakdown[]'],
    strongLooksLike: 'Allocated by category with percentages that total 100 and headcount stated.',
    scoringKind: 'derived',
    effortToClose: 'low',
    anchors: {
      0: 'No use of funds stated.',
      1: 'One line: "growth" or "hiring and marketing".',
      2: 'Two or three broad categories without percentages, or percentages that do not total 100.',
      3: 'Categorised allocation totalling 100% without headcount detail.',
      4: 'Allocated by category, totalling 100%, with headcount by function stated.',
    },
  }),
  sub({
    id: 'D6.3',
    dimensionId: 'D6',
    label: 'Milestone linkage',
    inputs: ['milestones_this_round[]', 'next_round_criteria'],
    strongLooksLike:
      'This money buys specific milestones which are exactly what the next round requires.',
    scoringKind: 'anchored',
    effortToClose: 'low',
    anchors: {
      0: 'No milestones stated for this round.',
      1: 'Milestones stated as aspirations, unmeasurable and undated.',
      2: 'Measurable milestones, with no stated link to what the next round requires.',
      3: 'Measurable, dated milestones loosely aligned with next-round criteria.',
      4: 'This money buys specific, dated milestones that are exactly what the next round requires.',
    },
  }),
  sub({
    id: 'D6.4',
    dimensionId: 'D6',
    label: 'Valuation realism',
    inputs: ['valuation_expectation', 'instrument_type', 'comparable_basis'],
    strongLooksLike: 'A valuation expectation grounded in comparables the founder can name.',
    scoringKind: 'anchored',
    effortToClose: 'low',
    anchors: {
      0: 'No valuation expectation formed, or one with no basis whatsoever.',
      1: 'A number anchored on an unrelated headline raise.',
      2: 'An expectation with a rough basis, not tied to comparable stage, sector or geography.',
      3: 'Grounded in comparables the founder can name, with some stretch.',
      4: 'Grounded in named comparables at matching stage, sector and geography, with the instrument chosen deliberately.',
    },
  }),
];

/* ========================================================================== */
/* Assembled rubric                                                           */
/* ========================================================================== */

export const DIMENSIONS: readonly Dimension[] = [
  {
    id: 'D1',
    name: 'Team & Execution Capability',
    weight: 0.2,
    rationale: 'Earliest-stage investors underwrite the team above all else.',
    subCriteria: D1_SUBS,
  },
  {
    id: 'D2',
    name: 'Market & Opportunity Sizing',
    weight: 0.15,
    rationale: 'Most commonly hand-waved; cheap to fix and high-visibility.',
    subCriteria: D2_SUBS,
  },
  {
    id: 'D3',
    name: 'Traction & Validation',
    weight: 0.25,
    rationale: 'Heaviest weight - the single strongest predictor of a raise.',
    subCriteria: D3_SUBS,
  },
  {
    id: 'D4',
    name: 'Product & Business Model Clarity',
    weight: 0.15,
    rationale: 'Where "what exactly do you sell" falls apart.',
    subCriteria: D4_SUBS,
  },
  {
    id: 'D5',
    name: 'Cap Table & Legal Hygiene',
    weight: 0.15,
    rationale: "Where deals die in diligence, and where Klawfin's fix is most concrete.",
    subCriteria: D5_SUBS,
  },
  {
    id: 'D6',
    name: 'Ask Size & Use-of-Funds Clarity',
    weight: 0.1,
    rationale: 'Lowest weight, highest fix-to-effort ratio.',
    subCriteria: D6_SUBS,
  },
] as const;

/* -------------------------------------------------------------------------- */
/* Lookups and integrity                                                      */
/* -------------------------------------------------------------------------- */

export const DIMENSION_BY_ID: Readonly<Record<DimensionId, Dimension>> = Object.freeze(
  Object.fromEntries(DIMENSIONS.map((d) => [d.id, d])) as Record<DimensionId, Dimension>,
);

export const ALL_SUB_CRITERIA: readonly SubCriterion[] = DIMENSIONS.flatMap((d) => d.subCriteria);

export const SUB_CRITERION_BY_ID: ReadonlyMap<string, SubCriterion> = new Map(
  ALL_SUB_CRITERIA.map((s) => [s.id, s]),
);

/**
 * Structural invariants, asserted at module load.
 *
 * The weights-sum-to-1 check mirrors the database constraint in
 * supabase/migrations (weights stored in basis points must total 10000).
 * Catching it here means a bad rubric edit fails the unit tests, rather than
 * producing a quietly wrong composite in front of a paying client.
 */
export function assertRubricIntegrity(): void {
  const weightSum = DIMENSIONS.reduce((acc, d) => acc + d.weight, 0);
  // Floating point: 0.2 + 0.15 + 0.25 + 0.15 + 0.15 + 0.1 does not land on 1.0 exactly.
  if (Math.abs(weightSum - 1) > 1e-9) {
    throw new Error(`Rubric weights must sum to 1.0; got ${weightSum}`);
  }
  if (DIMENSIONS.length !== 6) {
    throw new Error(`Rubric must have exactly 6 dimensions; got ${DIMENSIONS.length}`);
  }
  if (ALL_SUB_CRITERIA.length !== 29) {
    throw new Error(`Rubric v1 defines 29 sub-criteria; got ${ALL_SUB_CRITERIA.length}`);
  }
  const seen = new Set<string>();
  for (const s of ALL_SUB_CRITERIA) {
    if (seen.has(s.id)) throw new Error(`Duplicate sub-criterion id: ${s.id}`);
    seen.add(s.id);
    if (!s.id.startsWith(`${s.dimensionId}.`)) {
      throw new Error(`Sub-criterion ${s.id} does not belong to its dimension ${s.dimensionId}`);
    }
    if (s.inputs.length === 0) {
      throw new Error(
        `Sub-criterion ${s.id} has no intake inputs; every field must map (PRD P1-03)`,
      );
    }
  }
}

assertRubricIntegrity();
