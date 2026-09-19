/**
 * The report document.
 *
 * Structure follows PRD 7.1 exactly, in order:
 *   1  Cover              2  Disclaimer (full)      3  Executive summary
 *   4  Composite + band   5  Dimension scorecard    6  Overall assessment
 *   7  Dimension detail   8  Top 5 priority gaps    9  30/60/90 plan
 *  10  Data room checklist  11  Questions you cannot yet answer
 *  12  Methodology        13  Footer on EVERY page
 *
 * THE FOOTER IS THE REASON THIS IS react-pdf AND NOT A PRINT STYLESHEET
 * (decision 0003). `fixed` on a <View> renders it on every page structurally.
 * A print stylesheet relies on paged-media `position: fixed`, which differs
 * between browsers and silently drops the footer across some page breaks. A
 * missing disclaimer on page four is a regulatory exposure, not a layout bug.
 *
 * Sections 3, 6, 7, 8, 9, 10 and 11 render EDITED narrative where Dhruv has
 * edited it. Sections 1, 2, 4, 5, 12 and 13 are template or computed and are
 * not editable by anyone (PRD 7.4).
 */

import { Document, Page, Text, View, type DocumentProps } from '@react-pdf/renderer';
import type { ReactElement } from 'react';

import {
  DISCLAIMER_FULL,
  DISCLAIMER_PENDING_MARKER,
  DISCLAIMER_SHORT,
  LABEL_PRELIMINARY,
  METHODOLOGY_TEXT,
  ORG_NAME,
  PRE_REVENUE_NOTICE,
  PRODUCT_FULL_NAME,
  REPORT_TITLE,
  WATERMARK_INCOMPLETE,
  WEIGHT_REDISTRIBUTED_NOTICE,
  confidentialityMarking,
  isDisclaimerApproved,
} from '@klawfin/core';
import { ANCHOR_LABELS, formatPct, type ScoreResult, type PriorityGap } from '@klawfin/rubric';
import type { NarrativeResponse } from '@klawfin/llm';

import { color, space, styles, type } from './theme';

export interface ReportProps {
  clientName: string;
  /** ISO date the report was generated. */
  generatedOn: string;
  reportVersion: number;
  score: ScoreResult;
  /**
   * Narrative, or null for the FALLBACK report (PRD 8.2): a valid PDF with
   * scores, the rubric, the data room checklist and the disclaimer, with every
   * narrative section blank and marked "Assessment narrative pending". It
   * exists so an API outage on the morning of a client session is an
   * inconvenience rather than a cancelled meeting.
   */
  narrative: NarrativeResponse | null;
  priorityGaps: readonly PriorityGap[];
  dataRoomItems: readonly string[];
  isPreliminary: boolean;
  hasIncompleteWatermark: boolean;
}

const NARRATIVE_PENDING = 'Assessment narrative pending.';

export function ReportDocument(props: ReportProps): ReactElement<DocumentProps> {
  const { clientName, generatedOn, reportVersion, score, narrative } = props;

  return (
    <Document
      title={`${REPORT_TITLE} — ${clientName}`}
      author={ORG_NAME}
      subject={REPORT_TITLE}
      creator={PRODUCT_FULL_NAME}
      producer={PRODUCT_FULL_NAME}
    >
      {/* 1 — Cover ------------------------------------------------------- */}
      <Page size="A4" style={styles.coverPage}>
        {props.hasIncompleteWatermark && (
          <Text style={styles.watermark} fixed>
            {WATERMARK_INCOMPLETE}
          </Text>
        )}
        <View>
          <Text style={styles.coverMark}>{ORG_NAME}</Text>
          <Text style={styles.coverProduct}>{PRODUCT_FULL_NAME}</Text>
        </View>

        <View>
          {!isDisclaimerApproved() && (
            <Text style={styles.pendingMarker}>{DISCLAIMER_PENDING_MARKER}</Text>
          )}
          <Text style={styles.coverTitle}>{REPORT_TITLE}</Text>
          <Text style={styles.coverClient}>{clientName}</Text>
          <Text style={styles.coverMeta}>
            {generatedOn} · Version {reportVersion}
            {props.isPreliminary ? ` · ${LABEL_PRELIMINARY}` : ''}
          </Text>
        </View>

        <View>
          <Text style={[styles.small, styles.bold]}>{confidentialityMarking(clientName)}</Text>
          <Text style={styles.micro}>{DISCLAIMER_SHORT}</Text>
        </View>
      </Page>

      {/* 2 — Disclaimer, in full ----------------------------------------- */}
      <Body {...props}>
        <Text style={styles.h2}>Important notice</Text>
        <Text style={styles.paragraph}>{DISCLAIMER_FULL}</Text>
        {!isDisclaimerApproved() && (
          <Text style={styles.pendingMarker}>{DISCLAIMER_PENDING_MARKER}</Text>
        )}
      </Body>

      {/* 3, 4, 5 — Summary, composite, scorecard ------------------------- */}
      <Body {...props}>
        <Text style={styles.h1}>Executive summary</Text>
        <Text style={styles.lead}>{narrative?.executive_summary ?? NARRATIVE_PENDING}</Text>

        <CompositeBlock score={score} />
        {score.preRevenueMode && <Text style={styles.paragraph}>{PRE_REVENUE_NOTICE}</Text>}
        {score.weightRedistributed && (
          <Text style={styles.paragraph}>{WEIGHT_REDISTRIBUTED_NOTICE}</Text>
        )}

        <Text style={styles.h2}>Dimension scorecard</Text>
        <Scorecard score={score} />
      </Body>

      {/* 6 — Overall assessment ------------------------------------------ */}
      <Body {...props}>
        <Text style={styles.h1}>Overall assessment</Text>
        <Text style={styles.paragraph}>{narrative?.overall_assessment ?? NARRATIVE_PENDING}</Text>
      </Body>

      {/* 7 — Dimension detail, one page each ----------------------------- */}
      {score.dimensions.map((dimension) => {
        const section = narrative?.dimensions.find((d) => d.dimension_id === dimension.id) ?? null;
        return (
          <Body key={dimension.id} {...props}>
            <DimensionDetail dimension={dimension} section={section} />
          </Body>
        );
      })}

      {/* 8, 9 — Priorities and remediation -------------------------------- */}
      <Body {...props}>
        <Text style={styles.h1}>Priority gaps</Text>
        <Text style={[styles.small, styles.paragraph]}>
          Ordered by how much closing each gap moves the composite score, against how long it takes.
          This ordering is computed, not editorial.
        </Text>
        <PriorityList gaps={props.priorityGaps} narrative={narrative} />

        <View style={styles.rule} />

        <Text style={styles.h2}>Remediation plan</Text>
        <Horizon label="Days 0–30" items={narrative?.remediation_plan.days_0_30 ?? []} />
        <Horizon label="Days 31–60" items={narrative?.remediation_plan.days_31_60 ?? []} />
        <Horizon label="Days 61–90" items={narrative?.remediation_plan.days_61_90 ?? []} />
      </Body>

      {/* 10, 11 — Data room and open questions ---------------------------- */}
      <Body {...props}>
        <Text style={styles.h1}>Data room checklist</Text>
        <DataRoom items={props.dataRoomItems} narrative={narrative} />

        <View style={styles.rule} />

        <Text style={styles.h2}>Questions you cannot yet answer</Text>
        <Text style={[styles.small, styles.paragraph]}>
          Investors will ask these. Not having an answer today is normal; not having noticed the
          question is not.
        </Text>
        {(narrative?.questions_you_cannot_yet_answer ?? []).map((q, i) => (
          <Bullet key={i} text={q} />
        ))}
        {!narrative && <Text style={styles.small}>{NARRATIVE_PENDING}</Text>}
      </Body>

      {/* 12 — Methodology ------------------------------------------------- */}
      <Body {...props}>
        <Text style={styles.h1}>Methodology</Text>
        {METHODOLOGY_TEXT.split('\n\n').map((para, i) => (
          <Text key={i} style={styles.paragraph}>
            {para}
          </Text>
        ))}
        <Text style={styles.small}>
          Rubric version {score.rubricVersion}. Scores are computed from recorded information by
          deterministic code, not generated by a language model.
        </Text>
      </Body>
    </Document>
  );
}

/* -------------------------------------------------------------------------- */
/* Page chrome                                                                */
/* -------------------------------------------------------------------------- */

/**
 * A body page, with the fixed footer and watermark attached.
 *
 * Every content page goes through here. That is the mechanism that makes "the
 * disclaimer appears on every page" structural rather than a convention
 * someone has to remember (PRD P1-08).
 *
 * ---------------------------------------------------------------------------
 * THE FOOTER ONCE RENDERED ON NO PAGE AT ALL. The cause is in theme.ts:
 *
 *   A unitless `lineHeight` on the PAGE style is inherited by this absolutely
 *   positioned `fixed` footer, and react-pdf then lays it outside the page
 *   box. It disappears from every page, silently - no error, no warning.
 *
 * Setting an explicit lineHeight on the footer does not override it; only
 * removing it from the Page does. See the comment on `styles.page`.
 *
 * Keeping the fixed elements inline here is a secondary precaution: it keeps
 * the footer and the page style visible in one place, so the next person
 * changing either can see both.
 *
 * This is the "layout subset is real" cost decision 0003 accepted. It would
 * have shipped a report with no disclaimer on any page - PRD P1-08's exact
 * regulatory exposure - if the export test had asserted on the React tree
 * instead of on text extracted from a rendered PDF.
 * ---------------------------------------------------------------------------
 */
function Body(props: ReportProps & { children: React.ReactNode }): ReactElement {
  return (
    <Page size="A4" style={styles.page} wrap>
      {props.hasIncompleteWatermark && (
        <Text style={styles.watermark} fixed>
          {WATERMARK_INCOMPLETE}
        </Text>
      )}

      {props.children}

      <View style={styles.footer} fixed>
        <Text style={styles.micro}>{DISCLAIMER_SHORT}</Text>
        <View style={styles.footerRow}>
          <Text style={styles.micro}>{confidentialityMarking(props.clientName)}</Text>
          <Text style={styles.micro}>{props.generatedOn}</Text>
          <Text
            style={styles.micro}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </View>
    </Page>
  );
}

/* -------------------------------------------------------------------------- */
/* Computed sections — never editable (PRD 7.4)                               */
/* -------------------------------------------------------------------------- */

function CompositeBlock({ score }: { score: ScoreResult }): ReactElement {
  return (
    <View style={styles.compositeBlock}>
      <Text style={styles.small}>Composite readiness score</Text>
      <Text style={styles.compositeNumber}>{score.composite}</Text>
      <Text style={styles.small}>out of 100</Text>
      <Text style={styles.compositeBand}>{score.band.label}</Text>
      <Text style={[styles.small, { marginTop: space.xs }]}>{score.band.meaning}</Text>
      <Text style={[styles.small, { marginTop: space.sm }]}>
        Assessed on {Math.round(score.overallCoverage * 100)}% intake coverage ·{' '}
        {score.overallConfidence} confidence
      </Text>
    </View>
  );
}

/**
 * The scorecard — "the visual centrepiece, what the client will photograph"
 * (PRD 7.2).
 *
 * A well-typeset table with a proportional bar, not a chart. react-pdf can
 * draw SVG, but a mediocre radar chart would be worse than a good table, and
 * the table survives greyscale printing without losing any information.
 */
function Scorecard({ score }: { score: ScoreResult }): ReactElement {
  return (
    <View>
      <View style={styles.tableHead}>
        <Text style={[styles.cellDimension, styles.bold, { fontSize: type.small }]}>Dimension</Text>
        <Text style={[styles.cellNumber, styles.bold, { fontSize: type.small }]}>Score</Text>
        <Text style={[styles.cellNumber, styles.bold, { fontSize: type.small }]}>Weight</Text>
        <Text style={[styles.cellNumber, styles.bold, { fontSize: type.small }]}>Contribution</Text>
        <View style={styles.cellBar} />
      </View>

      {score.dimensions.map((d) => (
        <View key={d.id} style={styles.tableRow} wrap={false}>
          <View style={styles.cellDimension}>
            <Text>{`${d.id} ${d.name}`}</Text>
            <Text style={styles.micro}>
              {d.entirelyNotApplicable
                ? 'Not applicable to this company'
                : d.notAssessed
                  ? 'Not assessed — insufficient information'
                  : `${Math.round(d.coverage * 100)}% coverage · ${d.confidence} confidence`}
            </Text>
          </View>
          <Text style={styles.cellNumber}>
            {d.entirelyNotApplicable ? '—' : formatPct(d.pct)}
          </Text>
          <Text style={styles.cellNumber}>{Math.round(d.weight * 100)}%</Text>
          <Text style={styles.cellNumber}>
            {d.entirelyNotApplicable ? '—' : formatPct(d.weightedContribution)}
          </Text>
          <View style={styles.cellBar}>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${Math.max(0, Math.min(100, d.pct))}%` }]} />
            </View>
          </View>
        </View>
      ))}

      <View style={[styles.tableRow, { borderBottomWidth: 0 }]}>
        <Text style={[styles.cellDimension, styles.bold]}>Composite</Text>
        <Text style={[styles.cellNumber, styles.bold]}>{score.composite}</Text>
        <Text style={styles.cellNumber}>100%</Text>
        <Text style={[styles.cellNumber, styles.bold]}>{score.composite}</Text>
        <View style={styles.cellBar} />
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Narrative sections — editable before export (PRD 7.4)                      */
/* -------------------------------------------------------------------------- */

function DimensionDetail({
  dimension,
  section,
}: {
  dimension: ScoreResult['dimensions'][number];
  section: NarrativeResponse['dimensions'][number] | null;
}): ReactElement {
  return (
    <View>
      <Text style={styles.h1}>{`${dimension.id} · ${dimension.name}`}</Text>

      <View style={[styles.tableRow, { borderBottomWidth: 0, marginBottom: space.md }]}>
        <Text style={styles.bold}>
          {dimension.entirelyNotApplicable ? 'Not applicable' : `${formatPct(dimension.pct)} / 100`}
        </Text>
        <Text style={[styles.small, { marginLeft: space.md }]}>
          Weight {Math.round(dimension.weight * 100)}% · {Math.round(dimension.coverage * 100)}%
          coverage · {dimension.confidence} confidence
        </Text>
      </View>

      {dimension.notAssessed ? (
        <Text style={styles.paragraph}>
          This dimension could not be assessed. Too little of the information the rubric requires
          was available, and an assessment written from what was provided would not be reliable
          enough to act on.
        </Text>
      ) : (
        <>
          <Text style={styles.h3}>What we observed</Text>
          <Text style={styles.paragraph}>{section?.what_we_observed ?? NARRATIVE_PENDING}</Text>

          {section?.confidence_note ? (
            <Text style={[styles.small, styles.paragraph]}>{section.confidence_note}</Text>
          ) : null}

          {(section?.gaps.length ?? 0) > 0 && <Text style={styles.h3}>Gaps</Text>}
          {section?.gaps.map((gap, i) => (
            <View key={i} style={styles.gapBlock} wrap={false}>
              <Text style={styles.bold}>{gap.gap}</Text>
              <Text>{gap.why_it_matters}</Text>
              <Text style={styles.micro}>Based on: {gap.evidence}</Text>
            </View>
          ))}

          {(section?.recommendations.length ?? 0) > 0 && (
            <Text style={styles.h3}>Recommendations</Text>
          )}
          {section?.recommendations.map((rec, i) => (
            <View key={i} style={styles.recBlock} wrap={false}>
              <Text style={styles.bold}>{rec.action}</Text>
              <Text style={styles.micro}>
                {rec.effort} effort · {rec.estimated_duration}
              </Text>
              <Text>{rec.expected_effect}</Text>
            </View>
          ))}
        </>
      )}

      <View style={styles.rule} />
      <Text style={styles.h3}>How this score was reached</Text>
      {dimension.subCriteria.map((sub) => (
        <View key={sub.id} style={styles.listItem} wrap={false}>
          <Text style={styles.bullet}>{sub.score === null ? '—' : `${sub.score}/4`}</Text>
          <View style={styles.listBody}>
            <Text>{sub.label}</Text>
            <Text style={styles.micro}>
              {sub.score === null
                ? `Not applicable — ${sub.naReason ?? ''}`
                : `${ANCHOR_LABELS[sub.score]}${sub.derivation ? ` — ${sub.derivation}` : ''}${
                    sub.scoredOnSubstitute ? ' (pre-revenue evidence)' : ''
                  }`}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function PriorityList({
  gaps,
  narrative,
}: {
  gaps: readonly PriorityGap[];
  narrative: NarrativeResponse | null;
}): ReactElement {
  if (gaps.length === 0) {
    return (
      <Text style={styles.paragraph}>
        No prioritised gaps were identified. Either every assessed sub-criterion is already at the
        top of its scale, or too little information was available to name gaps responsibly.
      </Text>
    );
  }

  return (
    <View>
      {gaps.map((gap) => {
        const rationale = narrative?.priority_gaps.find((p) => p.rank === gap.rank)?.rationale;
        return (
          <View key={gap.subCriterionId} style={styles.gapBlock} wrap={false}>
            <Text style={styles.bold}>
              {gap.rank}. {gap.label} ({gap.dimensionId})
            </Text>
            <Text style={styles.micro}>
              Currently {gap.score}/4 · {gap.effort} effort · closing it fully adds about{' '}
              {gap.compositePointsAvailable.toFixed(1)} points to the composite
            </Text>
            <Text style={{ marginTop: space.xs }}>{rationale ?? NARRATIVE_PENDING}</Text>
          </View>
        );
      })}
    </View>
  );
}

function Horizon({ label, items }: { label: string; items: readonly string[] }): ReactElement {
  return (
    <View style={{ marginBottom: space.md }} wrap={false}>
      <Text style={styles.h3}>{label}</Text>
      {items.length === 0 ? (
        <Text style={styles.small}>{NARRATIVE_PENDING}</Text>
      ) : (
        items.map((item, i) => <Bullet key={i} text={item} />)
      )}
    </View>
  );
}

function DataRoom({
  items,
  narrative,
}: {
  items: readonly string[];
  narrative: NarrativeResponse | null;
}): ReactElement {
  return (
    <View>
      {items.map((item) => {
        const assessed = narrative?.data_room_checklist.find((c) => c.item === item);
        return (
          <View key={item} style={styles.listItem} wrap={false}>
            <Text style={styles.bullet}>{statusMark(assessed?.status)}</Text>
            <View style={styles.listBody}>
              <Text>{item}</Text>
              {assessed?.note ? <Text style={styles.micro}>{assessed.note}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/**
 * Status marks are TEXT, not colour.
 *
 * The report has to survive being photocopied in greyscale (PRD 7.2), so a
 * green tick and a red cross would lose their distinction exactly where the
 * checklist matters most.
 */
function statusMark(status: string | undefined): string {
  switch (status) {
    case 'present':
      return '[x]';
    case 'partial':
      return '[~]';
    case 'missing':
      return '[ ]';
    default:
      return '[?]';
  }
}

function Bullet({ text }: { text: string }): ReactElement {
  return (
    <View style={styles.listItem} wrap={false}>
      <Text style={styles.bullet}>•</Text>
      <Text style={styles.listBody}>{text}</Text>
    </View>
  );
}
