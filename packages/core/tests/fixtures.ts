/**
 * Test fixtures - FABRICATED STARTUPS ONLY.
 *
 * Nothing in this file may resemble a real client. No real startup names, no
 * real revenue figures, no real cap tables, no real founder details, no real
 * email addresses (readme.md: "Before you commit").
 *
 * A real cap table in a test fixture is the kind of thing that ends an
 * advisory practice. Everything here is invented.
 *
 * The readme requires fixtures covering: complete, sparse, contradictory,
 * pre-revenue and edge values. All five are below.
 */

import type { Intake } from '@klawfin/core';
import { intakeSchema } from '@klawfin/core';

/** Deep-merge helper so fixtures can express only what differs. */
type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

export function makeIntake(overrides: DeepPartial<Intake> = {}): Intake {
  return intakeSchema.parse(overrides);
}

/* -------------------------------------------------------------------------- */
/* 1. COMPLETE - a well-prepared, revenue-stage company                       */
/* -------------------------------------------------------------------------- */
/* Fictional: "Havenlock Logistics", a B2B freight-ops SaaS. Scores high      */
/* across the board. Used to assert the top of every scale is reachable.      */

export const completeIntake: Intake = makeIntake({
  team: {
    founders: [
      {
        name: 'A. Fictional',
        role: 'CEO',
        background: 'Eight years running regional freight desks before founding this.',
        years_in_sector: 8,
        full_time: true,
      },
      {
        name: 'B. Invented',
        role: 'CTO',
        background: 'Built dispatch systems at two logistics companies.',
        years_in_sector: 6,
        full_time: true,
      },
    ],
    founder_market_fit_notes:
      'Both founders ran the manual version of this process for years and know which steps break.',
    has_technical_cofounder: true,
    key_hires: 'Head of Customer Success hired Q2; two implementation engineers.',
    open_critical_roles: [],
    prior_ventures: 'One prior venture, acquired for a small sum in 2022.',
    shipping_history: 'Fourteen production releases in the last twelve months, all dated in the changelog.',
    notable_deliveries_last_12m: 'Shipped multi-carrier rate comparison in nine weeks under a customer deadline.',
    key_person_dependencies: 'Dispatch algorithm knowledge is shared between CTO and one senior engineer.',
    advisors: 'Two advisors: a former logistics COO and a supply-chain finance specialist.',
    advisor_engagement_depth: 'Monthly calls, both took customer reference calls in the last quarter.',
  },
  market: {
    icp_description:
      'Mid-market Indian freight forwarders, 50-300 shipments a month, already using a TMS they dislike.',
    icp_named_examples: ['Fictional Forwarders A', 'Fictional Forwarders B', 'Invented Freight C'],
    tam: 48_000_000_000,
    sam: 9_000_000_000,
    som: 900_000_000,
    sizing_method: 'bottom_up',
    sizing_sources:
      'Derived from 4,100 registered forwarders x average annual contract value of 220,000, cross-checked against two published industry registers.',
    why_now_narrative:
      'Mandatory e-invoicing thresholds dropped in 2025, forcing this segment onto digital documentation for the first time.',
    market_shift_evidence: 'Regulatory notification dated March 2025, plus three customers citing it as the trigger.',
    competitors: [
      { name: 'Fictional TMS Co', kind: 'direct', note: 'Enterprise-priced, 9-month implementations.' },
      { name: 'Invented Logistics Cloud', kind: 'direct', note: 'Strong in ocean, weak in road.' },
      { name: 'Spreadsheets and WhatsApp', kind: 'status_quo', note: 'The actual competitor in 70% of deals.' },
      { name: 'Generic ERP module', kind: 'indirect', note: 'Bundled, rarely used.' },
    ],
    differentiation_claim:
      'Two-week implementation against a nine-month enterprise norm, because we do not require a data migration.',
    competitor_pricing_known: true,
  },
  traction: {
    mrr_current: 820_000,
    arr_current: 9_840_000,
    revenue_currency: 'INR',
    revenue_recognition_basis: 'Recognised monthly on subscription; implementation fees deferred over 12 months.',
    mrr_by_month: [
      { month: '2026-03', value: 480_000 },
      { month: '2026-04', value: 545_000 },
      { month: '2026-05', value: 602_000 },
      { month: '2026-06', value: 664_000 },
      { month: '2026-07', value: 731_000 },
      { month: '2026-08', value: 820_000 },
    ],
    growth_rate_calc: 'Compounding at roughly 11% month on month over six months.',
    paying_customers_count: 23,
    logos_referenceable: 23,
    lois_signed: 4,
    pilots_running: 2,
    churn_rate: 1.8,
    retention_cohorts_available: true,
    repeat_purchase_rate: 96,
    nrr: 118,
    pipeline_value: 14_000_000,
    pipeline_stage_breakdown: 'Qualified 40%, demo 30%, pilot 20%, contracting 10%.',
    avg_sales_cycle_days: 47,
  },
  product: {
    product_stage: 'scaling',
    live_users_count: 640,
    problem_statement:
      'Forwarders lose margin because rate comparison happens in a spreadsheet after the quote has gone out.',
    solution_statement: 'Rates are compared at quote time, inside the quoting screen.',
    customer_quote_evidence:
      '"We were quoting from last month\'s rate card because checking took twenty minutes." - operations head, fictional customer.',
    cac: 68_000,
    ltv: 410_000,
    gross_margin_pct: 78,
    contribution_margin: 61,
    unit_econ_basis:
      'CAC from actual sales and marketing spend over closed-won in the trailing two quarters; LTV from observed 34-month average tenure.',
    pricing_model: 'Per-shipment tiered subscription',
    price_points: 'Starter 18,000/mo, Growth 42,000/mo, Scale 95,000/mo',
    pricing_rationale: 'Priced against margin recovered per shipment, roughly 12% of the value delivered.',
    discount_practice: 'Maximum 15% for annual prepay, documented in the sales playbook.',
    moat_claim: 'Accumulated carrier rate history across customers improves comparisons for everyone.',
    moat_evidence: 'Eighteen months of rate data across 23 customers; comparison accuracy up 14% year on year.',
    ip_filed: true,
  },
  cap_table_legal: {
    entity_type: 'private_limited',
    incorporation_date: '2023-06-12',
    jurisdiction: 'IN',
    structure_matches_raise_intent: 'yes',
    cap_table: {
      as_of: '2026-08-31',
      fully_diluted: true,
      holders: [
        { ref: 'F1', category: 'founder', equity_bp: 4200, vesting: '4y_1y_cliff', is_operational: true },
        { ref: 'F2', category: 'founder', equity_bp: 3300, vesting: '4y_1y_cliff', is_operational: true },
        { ref: 'A1', category: 'angel', equity_bp: 900, instrument: 'ccps' },
        { ref: 'A2', category: 'angel', equity_bp: 600, instrument: 'ccps' },
        { ref: 'ESOP', category: 'esop_pool', equity_bp: 1000, allocated_bp: 400 },
      ],
      esop_pool_bp: 1000,
      dead_equity_flag: false,
      related_party_terms: 'none_declared',
    },
    founder_vesting_in_place: 'yes',
    vesting_schedule: '4 years',
    cliff: '1 year',
    ip_assignment_signed: 'yes',
    employment_agreements_in_place: 'yes',
    contractor_ip_terms: 'yes',
    roc_filings_current: 'current',
    gst_status: 'current',
    tds_status: 'current',
    prior_round_docs: 'complete',
    fema_fdi_compliance: 'not_applicable',
    data_room_exists: true,
    data_room_completeness_pct: 94,
    data_room_index_quality: 'indexed_current',
  },
  ask: {
    ask_amount: 60_000_000,
    ask_currency: 'INR',
    current_burn_monthly: 2_400_000,
    current_runway_months: 9,
    target_runway_months: 24,
    use_of_funds_breakdown: [
      { category: 'Engineering', pct: 40, headcount: 6 },
      { category: 'Sales and marketing', pct: 35, headcount: 5 },
      { category: 'Customer success', pct: 15, headcount: 3 },
      { category: 'General and administrative', pct: 10, headcount: 1 },
    ],
    milestones_this_round: [
      { description: 'Reach 3,000,000 MRR', target_date: '2027-09-30', measurable: true },
      { description: 'Ship carrier API integrations for the top eight carriers', target_date: '2027-03-31', measurable: true },
    ],
    next_round_criteria: 'Series A investors in this segment look for 3,000,000 MRR and net retention above 110%.',
    valuation_expectation: 400_000_000,
    instrument_type: 'Priced equity round, CCPS',
    comparable_basis: 'Three named comparable seed rounds in Indian logistics SaaS at 10-14x forward ARR.',
  },
  judgments: {
    'D1.1': { anchor: 4, evidence_note: 'Both founders ran the manual process being automated.' },
    'D1.2': { anchor: 4, evidence_note: 'No open critical roles; all functions in-house.' },
    'D1.4': { anchor: 4, evidence_note: 'Fourteen dated production releases in twelve months.' },
    'D1.5': { anchor: 3, evidence_note: 'Advisors engaged monthly; some key-person risk on the algorithm remains.' },
    'D2.1': { anchor: 4, evidence_note: 'ICP narrow enough that named targets are already listed.' },
    'D2.3': { anchor: 4, evidence_note: 'Specific dated regulatory change, corroborated by customers.' },
    'D4.2': { anchor: 4, evidence_note: "Problem stated in the customer's own words, with a quote." },
    'D4.4': { anchor: 4, evidence_note: 'Pricing tied to margin recovered, documented discount policy.' },
    'D4.5': { anchor: 3, evidence_note: 'Data moat forming with measurable accuracy gains; still early.' },
    'D6.3': { anchor: 4, evidence_note: 'Milestones are exactly the stated Series A criteria.' },
    'D6.4': { anchor: 4, evidence_note: 'Three named comparables at matching stage and geography.' },
  },
});

/* -------------------------------------------------------------------------- */
/* 2. SPARSE - almost nothing filled in                                       */
/* -------------------------------------------------------------------------- */
/* Exercises the low-coverage path: generation blocked, dimensions reported   */
/* as not assessed, the model forbidden from inferring a narrative.           */

export const sparseIntake: Intake = makeIntake({
  team: {
    founders: [{ name: 'C. Placeholder', role: 'Founder', full_time: true }],
  },
  product: { product_stage: 'beta' },
});

/* -------------------------------------------------------------------------- */
/* 3. PRE-REVENUE - strong evidence, no revenue                               */
/* -------------------------------------------------------------------------- */
/* PRD 8.4's worked example: twelve signed design partners and six months of  */
/* documented discovery. This company must NOT score 0 on traction.           */

export const preRevenueIntake: Intake = makeIntake({
  team: {
    founders: [
      { name: 'D. Fabricated', role: 'CEO', background: 'Six years in clinical operations.', years_in_sector: 6, full_time: true },
      { name: 'E. Notional', role: 'CTO', background: 'Health data engineering.', years_in_sector: 5, full_time: true },
    ],
    founder_market_fit_notes: 'Ran the workflow being replaced, in three hospitals.',
    has_technical_cofounder: true,
  },
  market: {
    icp_description: 'Private multi-speciality hospitals, 100-400 beds, in tier-2 Indian cities.',
    icp_named_examples: ['Fictional Hospital A', 'Invented Medical Centre B'],
    tam: 12_000_000_000,
    sam: 3_000_000_000,
    som: 200_000_000,
    sizing_method: 'bottom_up',
    sizing_sources: 'From a published count of 1,900 qualifying hospitals x observed willingness to pay.',
    why_now_narrative: 'Digital health record mandates took effect in 2026.',
    competitors: [
      { name: 'Fictional HIS Vendor', kind: 'direct' },
      { name: 'Paper and phone calls', kind: 'status_quo' },
    ],
    differentiation_claim: 'Works alongside the existing HIS rather than replacing it.',
  },
  traction: {
    // No revenue at all - the substitute ladder must carry D3.
    mrr_current: 0,
    paying_customers_count: 0,
    lois_signed: 7,
    pilots_running: 5,
    preorders_count: 0,
    waitlist_with_payment_intent: 40,
    leading_indicator_name: 'Active beta clinicians',
    leading_indicator_by_month: [
      { month: '2026-03', value: 12 },
      { month: '2026-04', value: 26 },
      { month: '2026-05', value: 41 },
      { month: '2026-06', value: 58 },
      { month: '2026-07', value: 77 },
      { month: '2026-08', value: 102 },
    ],
    discovery_interviews_count: 64,
    named_targets_engaged: 22,
    design_partners_committed: 12,
    beta_repeat_usage_rate: 61,
    pilot_engagement_notes: 'Clinicians in four pilot sites use the handover screen every shift.',
    named_prospects: 18,
    prospect_stage_breakdown: 'Six in procurement, eight in clinical evaluation, four in first contact.',
  },
  product: {
    product_stage: 'prototype',
    problem_statement: 'Shift handover is verbal and nothing is auditable afterwards.',
    solution_statement: 'A structured handover record that takes less time than the verbal one.',
    customer_quote_evidence: '"If it takes longer than the current handover, nobody will use it."',
  },
  cap_table_legal: {
    entity_type: 'private_limited',
    incorporation_date: '2025-11-03',
    jurisdiction: 'IN',
    structure_matches_raise_intent: 'yes',
    cap_table: {
      holders: [
        { ref: 'F1', category: 'founder', equity_bp: 4750, vesting: '4y_1y_cliff', is_operational: true },
        { ref: 'F2', category: 'founder', equity_bp: 4750, vesting: '4y_1y_cliff', is_operational: true },
        { ref: 'ESOP', category: 'esop_pool', equity_bp: 500, allocated_bp: 0 },
      ],
      esop_pool_bp: 500,
      dead_equity_flag: false,
    },
    founder_vesting_in_place: 'yes',
    vesting_schedule: '4 years',
    cliff: '1 year',
    ip_assignment_signed: 'yes',
    employment_agreements_in_place: 'yes',
    contractor_ip_terms: 'partial',
    roc_filings_current: 'current',
    gst_status: 'current',
    tds_status: 'current',
    prior_round_docs: 'no_prior_round',
    fema_fdi_compliance: 'not_applicable',
    data_room_exists: true,
    data_room_completeness_pct: 55,
    data_room_index_quality: 'indexed_current',
  },
  ask: {
    ask_amount: 25_000_000,
    current_burn_monthly: 900_000,
    current_runway_months: 6,
    target_runway_months: 24,
    use_of_funds_breakdown: [
      { category: 'Engineering', pct: 55, headcount: 4 },
      { category: 'Clinical partnerships', pct: 30, headcount: 2 },
      { category: 'General and administrative', pct: 15 },
    ],
    milestones_this_round: [{ description: 'Convert eight design partners to paid', target_date: '2027-06-30', measurable: true }],
    next_round_criteria: 'Seed investors want ten paying hospitals.',
    valuation_expectation: 120_000_000,
    instrument_type: 'CCPS',
    comparable_basis: 'Two named Indian health-SaaS pre-seed rounds.',
  },
  judgments: {
    'D1.1': { anchor: 4 },
    'D1.2': { anchor: 3 },
    'D1.4': { anchor: 2 },
    'D1.5': { anchor: 2 },
    'D2.1': { anchor: 3 },
    'D2.3': { anchor: 3 },
    'D4.2': { anchor: 4 },
    'D4.4': { anchor: 1 },
    'D4.5': { anchor: 2 },
    'D6.3': { anchor: 3 },
    'D6.4': { anchor: 3 },
  },
});

/* -------------------------------------------------------------------------- */
/* 4. CONTRADICTORY - trips several checks at once                            */
/* -------------------------------------------------------------------------- */
/* Every blocking class in PRD 8.3 fires on this fixture. It exists so the    */
/* contradiction module is tested against something that genuinely conflicts. */

export const contradictoryIntake: Intake = makeIntake({
  team: { founders: [{ name: 'F. Imaginary', role: 'Founder', full_time: true }] },
  market: {
    // som > sam > tam - inverted, blocking.
    tam: 1_000_000,
    sam: 50_000_000,
    som: 900_000_000,
    sizing_method: 'top_down',
  },
  traction: {
    // Revenue with zero paying customers - blocking.
    mrr_current: 250_000,
    // ARR nowhere near MRR x 12 - warning.
    arr_current: 800_000,
    paying_customers_count: 0,
    // Impossible percentage - blocking.
    churn_rate: 140,
    mrr_by_month: [
      { month: '2026-06', value: 100_000 },
      { month: '2026-04', value: 90_000 },
    ],
  },
  product: {
    // Idea stage with live users - blocking.
    product_stage: 'idea',
    live_users_count: 4_000,
    cac: 90_000,
    ltv: 20_000, // LTV below CAC with no acknowledgement - warning.
    unit_econ_basis: null,
  },
  cap_table_legal: {
    entity_type: 'private_limited',
    // Incorporated in the future - warning.
    incorporation_date: '2027-01-01',
    cap_table: {
      // Totals 8500bp, not 10000 - blocking.
      holders: [
        { ref: 'F1', category: 'founder', equity_bp: 6000 },
        { ref: 'A1', category: 'angel', equity_bp: 2500 },
      ],
      esop_pool_bp: 0,
    },
  },
  ask: {
    ask_amount: 50_000_000,
    current_burn_monthly: 500_000,
    target_runway_months: 12,
    // Totals 120%, not 100% - blocking.
    use_of_funds_breakdown: [
      { category: 'Engineering', pct: 70 },
      { category: 'Marketing', pct: 50 },
    ],
  },
});

/* -------------------------------------------------------------------------- */
/* 5. EDGE VALUES - boundaries, N/A handling, an entirely N/A dimension       */
/* -------------------------------------------------------------------------- */
/* Exercises: every sub-criterion of D6 marked N/A (weight redistribution),   */
/* exact band boundaries, and zero-valued-but-answered fields.                */

export const edgeIntake: Intake = makeIntake({
  team: {
    founders: [
      { name: 'G. Edge', role: 'Founder', full_time: true, background: 'x', years_in_sector: 0 },
      { name: 'H. Case', role: 'Founder', full_time: false, other_commitments: 'Full-time employed elsewhere.' },
    ],
    founder_market_fit_notes: 'Some notes.',
    has_technical_cofounder: false,
    key_hires: 'None.',
  },
  market: {
    icp_description: 'Broad.',
    tam: 0,
    sam: 0,
    som: 0,
    sizing_method: 'none',
    competitors: [],
  },
  traction: {
    mrr_current: 0,
    paying_customers_count: 3,
    logos_referenceable: 0,
    churn_rate: 0,
    retention_cohorts_available: false,
    mrr_by_month: [],
  },
  product: { product_stage: 'live', live_users_count: 0 },
  cap_table_legal: {
    entity_type: 'not_incorporated',
    cap_table: { holders: [] },
  },
  ask: {},
  judgments: {
    // Whole of D6 marked N/A: the company is not raising yet. Its 10% weight
    // must be redistributed proportionally across D1-D5 (PRD 5.5).
    'D6.1': { na_reason: 'Not raising this year; no ask formed.' },
    'D6.2': { na_reason: 'Not raising this year; no ask formed.' },
    'D6.3': { na_reason: 'Not raising this year; no ask formed.' },
    'D6.4': { na_reason: 'Not raising this year; no ask formed.' },
  },
});

/** Every fixture, for tests that sweep all of them. */
export const ALL_FIXTURES: ReadonlyArray<{ name: string; intake: Intake }> = [
  { name: 'complete', intake: completeIntake },
  { name: 'sparse', intake: sparseIntake },
  { name: 'preRevenue', intake: preRevenueIntake },
  { name: 'contradictory', intake: contradictoryIntake },
  { name: 'edge', intake: edgeIntake },
];
