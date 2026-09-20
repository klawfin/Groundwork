/**
 * The demo dataset. FABRICATED COMPANIES ONLY.
 *
 * Nothing in this file may resemble a real client. No real startup names, no
 * real revenue, no real cap tables, no real founders, no deliverable email
 * addresses (readme.md: "no real client data in dev, seeds, fixtures,
 * screenshots or bug reports - fabricate it").
 *
 * A real cap table in a demo database is the kind of thing that ends an
 * advisory practice. Both companies below are invented, both contact
 * addresses are on `.invalid`, and both registration numbers are all zeros so
 * they cannot collide with a real filing.
 *
 * ---------------------------------------------------------------------------
 * WHY TWO COMPANIES AND NOT ONE
 *
 * One company can only demonstrate one path, and the two paths behave very
 * differently:
 *
 *   Marrowfield  revenue-stage, well prepared. Dense intake, high coverage,
 *                no contradictions. This is the clean run: lock the intake,
 *                score, generate, approve, export a PDF.
 *
 *   Sundermere   pre-revenue, thin. Triggers the pre-revenue substitute
 *                ladder (PRD 8.4), leaves dimensions below the coverage gate
 *                so they are reported as not assessed, and carries one
 *                deliberate warning-class contradiction.
 *
 * A demo that only shows Marrowfield claims the tool works on well-prepared
 * companies, which is the easy half and not the half anyone doubts.
 *
 * ---------------------------------------------------------------------------
 * THE CONTRADICTION IN SUNDERMERE IS DELIBERATE. DO NOT "FIX" IT.
 *
 * Its ask divided by its stated burn implies roughly 42 months of runway
 * against a stated target of 18. `ASK_INCONSISTENT_WITH_BURN` fires as a
 * WARNING, which is the correct class: it does not block the lock, it appears
 * on screen, and it is exactly the arithmetic an investor does in the meeting.
 * Removing it would make the demo quieter and the product look like it has
 * nothing to say.
 *
 * ---------------------------------------------------------------------------
 * KEYS ARE CHECKED, NOT TRUSTED
 *
 * Zod strips unknown keys silently, so a typo here would not raise - it would
 * vanish, quietly lower coverage, and make the demo look broken for a reason
 * nobody could see. `apps/web/tests/demoData.test.ts` parses both intakes
 * against the real `intakeSchema` and fails on any key that does not survive.
 */

/** Matches supabase/seed.sql. One account per role; the role is the point. */
export const DEMO_ACCOUNTS = [
  { email: 'demo.owner@groundwork.local', name: 'Demo Owner', role: 'owner' },
  { email: 'demo.analyst@groundwork.local', name: 'Demo Analyst', role: 'analyst' },
  { email: 'demo.viewer@groundwork.local', name: 'Demo Viewer', role: 'viewer' },
];

/* -------------------------------------------------------------------------- */
/* 1. Marrowfield - revenue stage, well prepared. The clean run.              */
/* -------------------------------------------------------------------------- */

const marrowfieldIntake = {
  team: {
    founders: [
      {
        name: 'R. Marrowfield',
        role: 'CEO',
        background:
          'Nine years running regional freight desks before founding this. Owned the P&L on a 40-truck network.',
        years_in_sector: 9,
        full_time: true,
      },
      {
        name: 'S. Okonjo',
        role: 'CTO',
        background:
          'Built dispatch and rating systems at two logistics companies, most recently as principal engineer.',
        years_in_sector: 6,
        full_time: true,
      },
    ],
    founder_market_fit_notes:
      'Both founders ran the manual version of this process for years. They can name the three steps where a booking falls over, and the product addresses two of them.',
    has_technical_cofounder: true,
    key_hires:
      'Head of Customer Success joined Q2 2026. Two implementation engineers, both from carrier-side operations.',
    open_critical_roles: ['VP Sales', 'Finance lead'],
    prior_ventures:
      'One prior venture by the CEO, wound down in 2021 after failing to find distribution. Documented in the data room.',
    shipping_history:
      'Fourteen production releases in the last twelve months, each dated in a public changelog.',
    notable_deliveries_last_12m:
      'Shipped multi-carrier rate comparison in nine weeks against a customer deadline, and migrated the largest account onto it without downtime.',
    key_person_dependencies:
      'The rating engine is understood by the CTO and one senior engineer. Documented, but not yet exercised by a third person.',
    advisors: 'Two advisors: a former logistics COO and a supply-chain finance specialist.',
    advisor_engagement_depth:
      'Monthly calls. Both took customer reference calls in the last quarter.',
  },
  market: {
    icp_description:
      'Mid-market Indian 3PLs running 25-150 vehicles, with at least two carrier relationships and a dispatcher who still reconciles rates in a spreadsheet.',
    icp_named_examples: [
      'Regional 3PL, Pune',
      'Cold-chain operator, Nashik',
      'Contract logistics arm of an FMCG distributor',
    ],
    tam: 41000000000,
    sam: 6800000000,
    som: 540000000,
    market_currency: 'INR',
    sizing_method: 'bottom_up',
    sizing_sources:
      'Built from the registered 3PL count in four states, filtered to the fleet-size band, priced at the observed contract value of the current book. Assumptions listed in the data room model.',
    why_now_narrative:
      'E-way bill and FASTag data made per-trip cost visible for the first time, so rate comparison became a calculation rather than an argument.',
    market_shift_evidence:
      'Three of the last five customers cited a new internal cost-per-trip reporting requirement as the reason they started looking.',
    competitors: [
      {
        name: 'Incumbent TMS vendor',
        kind: 'direct',
        note: 'Strong in enterprise, twelve-week implementation, priced out of this band.',
      },
      {
        name: 'Carrier-provided portals',
        kind: 'indirect',
        note: 'Free, single-carrier, which is why rate comparison never happens in them.',
      },
      {
        name: 'Spreadsheet and WhatsApp',
        kind: 'status_quo',
        note: 'The real competitor. Wins on zero switching cost and loses on reconciliation.',
      },
    ],
    differentiation_claim:
      'The only tool in this band that compares live rates across carriers the customer already contracts with, rather than a marketplace the customer must join.',
    competitor_pricing_known: true,
  },
  traction: {
    mrr_current: 1840000,
    arr_current: 22080000,
    revenue_currency: 'INR',
    revenue_recognition_basis:
      'Monthly subscription recognised in the month of service. Annual prepayments deferred and released monthly.',
    mrr_by_month: [
      { month: '2025-09', value: 740000 },
      { month: '2025-10', value: 812000 },
      { month: '2025-11', value: 905000 },
      { month: '2025-12', value: 968000 },
      { month: '2026-01', value: 1090000 },
      { month: '2026-02', value: 1174000 },
      { month: '2026-03', value: 1288000 },
      { month: '2026-04', value: 1401000 },
      { month: '2026-05', value: 1502000 },
      { month: '2026-06', value: 1633000 },
      { month: '2026-07', value: 1729000 },
      { month: '2026-08', value: 1840000 },
    ],
    growth_rate_calc:
      'Month-on-month on committed subscription revenue, excluding one-off implementation fees. Averages 8.5% over the last six months.',
    paying_customers_count: 34,
    logos_referenceable: 6,
    lois_signed: 2,
    pilots_running: 4,
    churn_rate: 1.8,
    retention_cohorts_available: true,
    nrr: 112,
    pipeline_value: 28500000,
    pipeline_stage_breakdown:
      'Nine in contracting, fourteen in pilot, twenty-two qualified. Stage definitions written down and used consistently since January.',
    avg_sales_cycle_days: 63,
  },
  product: {
    product_stage: 'live',
    live_users_count: 410,
    problem_statement:
      'A dispatcher booking a load across three contracted carriers has no single view of live rates, so the booking is made on habit and reconciled weeks later against an invoice nobody can check.',
    solution_statement:
      'One screen that pulls contracted rates from each carrier, ranks them per load, and writes the chosen rate into the booking record so the invoice can be checked against it automatically.',
    customer_quote_evidence:
      'Three customers stated in writing that invoice reconciliation time fell from two days a month to under three hours. Quotes held in the data room with permission to use.',
    cac: 48000,
    ltv: 310000,
    gross_margin_pct: 71,
    contribution_margin: 58,
    unit_econ_basis:
      'CAC from actual sales and marketing spend over closed-won in the last two quarters. LTV from observed 22-month median tenure at current ARPU, not a modelled assumption.',
    pricing_model: 'Per active vehicle per month, with a floor',
    price_points:
      'Rs 1,100 per vehicle per month above 40 vehicles; Rs 1,450 below. Floor of Rs 38,000 per month.',
    pricing_rationale:
      'Priced against the dispatcher hours displaced, which customers can measure. The floor exists because implementation cost does not scale down.',
    discount_practice:
      'Two discounts given, both for annual prepayment, both recorded with the approving founder named.',
    moat_claim:
      'Carrier rate integrations are slow to build and each one is individually negotiated.',
    moat_evidence:
      'Eleven carrier integrations live, the last four taking under three weeks each because the ingestion layer was generalised. No competitor in this band has more than two.',
    ip_filed: false,
  },
  cap_table_legal: {
    entity_type: 'private_limited',
    incorporation_date: '2023-02-14',
    jurisdiction: 'IN',
    structure_matches_raise_intent: 'yes',
    cap_table: {
      as_of: '2026-08-31',
      fully_diluted: true,
      holders: [
        {
          ref: 'F1',
          category: 'founder',
          equity_bp: 3800,
          vesting: '4y_1y_cliff',
          instrument: 'Equity',
          is_operational: true,
        },
        {
          ref: 'F2',
          category: 'founder',
          equity_bp: 3000,
          vesting: '4y_1y_cliff',
          instrument: 'Equity',
          is_operational: true,
        },
        { ref: 'A1', category: 'angel', equity_bp: 700, instrument: 'CCPS', is_operational: false },
        {
          ref: 'INST1',
          category: 'institutional',
          equity_bp: 1200,
          instrument: 'CCPS',
          is_operational: false,
        },
        {
          ref: 'ESOP',
          category: 'esop_pool',
          equity_bp: 1300,
          allocated_bp: 620,
          instrument: 'Options',
        },
      ],
      esop_pool_bp: 1300,
      dead_equity_flag: false,
      related_party_terms: 'None. No founder loans, no related-party contracts.',
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
    prior_round_docs: 'complete',
    fema_fdi_compliance: 'not_applicable',
    data_room_exists: true,
    data_room_completeness_pct: 84,
    data_room_index_quality: 'indexed_current',
    legal_notes:
      'Two contractor agreements from 2023 predate the standard IP assignment clause and are being re-papered.',
  },
  ask: {
    ask_amount: 60000000,
    ask_currency: 'INR',
    current_burn_monthly: 3200000,
    current_runway_months: 9,
    target_runway_months: 18,
    use_of_funds_breakdown: [
      {
        category: 'Sales and marketing',
        pct: 45,
        headcount: 6,
        note: 'Two AEs, two SDRs, one marketer, one sales ops.',
      },
      {
        category: 'Engineering',
        pct: 20,
        headcount: 4,
        note: 'Carrier integrations and the reconciliation engine.',
      },
      { category: 'Customer success and implementation', pct: 15, headcount: 3 },
      { category: 'Infrastructure and tooling', pct: 12 },
      { category: 'General and administrative', pct: 8 },
    ],
    milestones_this_round: [
      {
        description: 'Reach Rs 55,00,000 MRR on committed subscriptions',
        target_date: '2027-09-30',
        measurable: true,
      },
      {
        description: 'Twenty-five live carrier integrations',
        target_date: '2027-06-30',
        measurable: true,
      },
      {
        description: 'Net revenue retention above 115% across two consecutive quarters',
        target_date: '2027-12-31',
        measurable: true,
      },
    ],
    next_round_criteria:
      'Series A at Rs 55,00,000+ MRR with NRR above 115% and a repeatable outbound motion producing at least eight qualified opportunities a month.',
    valuation_expectation: 340000000,
    instrument_type: 'Priced equity round',
    comparable_basis:
      'Three disclosed Indian logistics-SaaS rounds in the last eighteen months at 12-16x ARR. This ask is at 15.4x current ARR and the deck states that explicitly.',
  },
  /*
   * The eleven anchored sub-criteria. These are the assessor's own calls
   * against the printed anchor text - stored intake, never model output.
   */
  judgments: {
    'D1.1': {
      anchor: 4,
      evidence_note:
        'Both founders ran the manual process at operator scale. Not adjacent experience - the same job.',
    },
    'D1.2': {
      anchor: 3,
      evidence_note:
        'Technical and commercial covered. No finance lead and no VP Sales, both named as open.',
    },
    'D1.4': {
      anchor: 3,
      evidence_note:
        'Dated changelog, fourteen releases, one delivery under an external deadline. Prior venture wound down and disclosed.',
    },
    'D1.5': {
      anchor: 2,
      evidence_note:
        'Rating engine sits with two people. Documented but never handed to a third, so the documentation is untested.',
    },
    'D2.1': {
      anchor: 4,
      evidence_note:
        'Fleet band, carrier count and the specific workflow that breaks. Three named example accounts.',
    },
    'D2.3': {
      anchor: 3,
      evidence_note:
        'Regulatory data availability is a real shift, and three customers named it unprompted. Evidence is customer-reported rather than measured.',
    },
    'D4.2': {
      anchor: 4,
      evidence_note:
        'Problem stated as an observable failure with a cost attached; solution maps to it step for step.',
    },
    'D4.4': {
      anchor: 3,
      evidence_note:
        'Priced against measurable displaced hours. Floor justified. Two discounts, both recorded with an approver.',
    },
    'D4.5': {
      anchor: 3,
      evidence_note:
        'Eleven integrations is a real lead, but it is accumulated work rather than a structural barrier.',
    },
    'D6.3': {
      anchor: 4,
      evidence_note:
        'All three milestones measurable and dated, and each maps to a use-of-funds line.',
    },
    'D6.4': {
      anchor: 3,
      evidence_note:
        'Multiple named comparables and the multiple stated in the deck. Comparables are disclosed rounds, not audited.',
    },
  },
};

/* -------------------------------------------------------------------------- */
/* 2. Sundermere - pre-revenue, thin. The gates and the substitute ladder.    */
/* -------------------------------------------------------------------------- */

const sundermereIntake = {
  team: {
    founders: [
      {
        name: 'K. Sundermere',
        role: 'CEO',
        background:
          'Ten years in clinical laboratory operations, latterly running the assay validation group at a diagnostics chain.',
        years_in_sector: 10,
        full_time: true,
      },
      {
        name: 'P. Raghunath',
        role: 'Head of Assay Development',
        background:
          'Postdoctoral work in point-of-care immunoassays. Currently part time while finishing a fellowship.',
        years_in_sector: 4,
        full_time: false,
        other_commitments:
          'Fellowship runs until June 2027. Three days a week on the company until then.',
      },
    ],
    founder_market_fit_notes:
      'The CEO has run the workflow the product replaces. No commercial or regulatory affairs experience on the founding team.',
    has_technical_cofounder: false,
    open_critical_roles: ['Regulatory affairs lead', 'Commercial lead', 'Software engineer'],
    key_person_dependencies:
      'The assay protocol exists only in the Head of Assay Development notebooks and is not written up.',
  },
  market: {
    icp_description:
      'Standalone diagnostic laboratories in tier-2 cities running 200-600 samples a day without an on-site pathologist.',
    tam: 18000000000,
    market_currency: 'INR',
    sizing_method: 'top_down',
    why_now_narrative:
      'Reagent cost has fallen far enough that a decentralised panel is plausible at the price point these labs can bear.',
    competitors: [
      {
        name: 'Central reference laboratories',
        kind: 'status_quo',
        note: 'Sample is couriered out. Two-day turnaround is accepted because nothing else exists.',
      },
      {
        name: 'Imported point-of-care analysers',
        kind: 'direct',
        note: 'Capable, but the per-test consumable price is roughly four times what this segment pays.',
      },
    ],
  },
  traction: {
    revenue_currency: 'INR',
    /*
     * No revenue at all. These are the pre-revenue substitutes (PRD 8.4) -
     * the ladder exists so a company like this is scored on what it does
     * have rather than penalised for a zero it cannot yet avoid.
     */
    discovery_interviews_count: 41,
    named_targets_engaged: 9,
    design_partners_committed: 3,
    leading_indicator_name: 'Validation runs completed in partner labs',
    leading_indicator_by_month: [
      { month: '2026-03', value: 6 },
      { month: '2026-04', value: 11 },
      { month: '2026-05', value: 18 },
      { month: '2026-06', value: 24 },
      { month: '2026-07', value: 37 },
      { month: '2026-08', value: 52 },
    ],
    pilot_engagement_notes:
      'Three labs are running the prototype against their existing send-out workflow and returning discordance data weekly. None is paying.',
    named_prospects: 9,
  },
  product: {
    product_stage: 'prototype',
    problem_statement:
      'A lab without an on-site pathologist couriers samples to a reference lab, so a result that changes treatment arrives two days after the patient has left.',
    solution_statement:
      'A bench analyser and a four-marker panel that a technician can run in under twenty minutes without interpretation.',
    ip_filed: true,
  },
  cap_table_legal: {
    entity_type: 'private_limited',
    incorporation_date: '2025-06-09',
    jurisdiction: 'IN',
    cap_table: {
      as_of: '2026-08-31',
      fully_diluted: true,
      holders: [
        {
          ref: 'F1',
          category: 'founder',
          equity_bp: 5200,
          vesting: 'none',
          instrument: 'Equity',
          is_operational: true,
        },
        {
          ref: 'F2',
          category: 'founder',
          equity_bp: 3800,
          vesting: 'none',
          instrument: 'Equity',
          is_operational: true,
        },
        {
          ref: 'ESOP',
          category: 'esop_pool',
          equity_bp: 1000,
          allocated_bp: 0,
          instrument: 'Options',
        },
      ],
      esop_pool_bp: 1000,
    },
    founder_vesting_in_place: 'no',
    ip_assignment_signed: 'partial',
    roc_filings_current: 'minor_lapses',
    gst_status: 'unknown',
    prior_round_docs: 'no_prior_round',
    data_room_exists: false,
    legal_notes:
      'No founder vesting at all, on a two-person team where one founder is part time until mid-2027.',
  },
  ask: {
    /*
     * DELIBERATE CONTRADICTION - see the header. Rs 2.5 Cr against a stated
     * burn of Rs 6,00,000 a month implies about 42 months, not the 18 asked
     * for. ASK_INCONSISTENT_WITH_BURN fires as a warning.
     */
    ask_amount: 25000000,
    ask_currency: 'INR',
    current_burn_monthly: 600000,
    current_runway_months: 7,
    target_runway_months: 18,
    use_of_funds_breakdown: [
      { category: 'Assay development and validation', pct: 50, headcount: 3 },
      { category: 'Regulatory and clinical', pct: 25, headcount: 1 },
      { category: 'Instrument tooling', pct: 15 },
      { category: 'General and administrative', pct: 10 },
    ],
    milestones_this_round: [
      {
        description: 'Complete validation and begin the regulatory submission',
        measurable: false,
      },
    ],
  },
  judgments: {
    'D1.1': {
      anchor: 3,
      evidence_note:
        'CEO has run the workflow. No regulatory or commercial experience anywhere on the team, in a regulated category.',
    },
    'D1.2': {
      anchor: 1,
      evidence_note:
        'Two founders, one part time. Regulatory, commercial and software all named as open.',
    },
    'D1.4': {
      anchor: 1,
      evidence_note:
        'A working prototype and validation runs. No prior shipped product from either founder.',
    },
    'D1.5': {
      anchor: 0,
      evidence_note:
        'The assay protocol is in one set of notebooks, and their author is part time until June 2027.',
    },
    'D2.1': {
      anchor: 2,
      evidence_note:
        'Segment named by size and staffing. No named example accounts and no buying-process detail.',
    },
    'D2.3': {
      anchor: 2,
      evidence_note:
        'Reagent cost trend is a plausible shift, asserted without a source or a measured price series.',
    },
    'D4.2': {
      anchor: 3,
      evidence_note:
        'Problem is concrete and clinically framed. Solution states the claim without evidence it holds at that turnaround.',
    },
    'D4.4': {
      na_reason: 'Pre-revenue with no price set, so there is no pricing to assess.',
    },
    'D4.5': {
      anchor: 2,
      evidence_note:
        'A filed application is real but unexamined, and no freedom-to-operate work has been done.',
    },
    'D6.3': {
      anchor: 1,
      evidence_note:
        'A single milestone with no target date and no measure. An intention rather than a plan.',
    },
    'D6.4': {
      na_reason: 'No valuation expectation stated, so there is nothing to test for realism.',
    },
  },
};

/* -------------------------------------------------------------------------- */

export const DEMO_CLIENTS = [
  {
    client: {
      legal_name: 'Marrowfield Logistics Private Limited',
      brand_name: 'Marrowfield',
      website_url: 'https://marrowfield.invalid',
      sector: 'Logistics SaaS',
      stage: 'Seed',
      incorporation_country: 'IN',
      cin_or_reg_no: 'U00000KA0000PTC000000',
      primary_contact_name: 'R. Marrowfield',
      primary_contact_email: 'founders@marrowfield.invalid',
      engagement_type: 'sprint',
      engagement_start_date: '2026-09-01',
      notes: 'DEMO DATA - fabricated. Engagement letter v1.0 (demo).',
    },
    intake: marrowfieldIntake,
  },
  {
    client: {
      legal_name: 'Sundermere Diagnostics Private Limited',
      brand_name: 'Sundermere',
      website_url: 'https://sundermere.invalid',
      sector: 'Diagnostics',
      stage: 'Pre-seed',
      incorporation_country: 'IN',
      cin_or_reg_no: 'U00000MH0000PTC000000',
      primary_contact_name: 'K. Sundermere',
      primary_contact_email: 'founders@sundermere.invalid',
      engagement_type: 'sprint',
      engagement_start_date: '2026-09-15',
      notes:
        'DEMO DATA - fabricated. Pre-revenue; exercises the substitute ladder and the coverage gate.',
    },
    intake: sundermereIntake,
  },
];
