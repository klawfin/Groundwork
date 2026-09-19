/**
 * Offline stub narrative.
 *
 * `DISABLE_LLM_GENERATION=true` runs the entire generation pipeline - prompt
 * assembly, guardrails, persistence, the review screen, the audit trail -
 * without calling Anthropic and without spending anything.
 *
 * Every sentence below is assembled from the COMPUTED score. Nothing is
 * invented about the company, because the purpose of the stub is to exercise
 * the pipeline, not to imitate the model's judgement. That constraint is also
 * what makes it safe: a stub cannot state a fact about a client that the
 * deterministic scorer did not already produce.
 *
 * It is persisted with `is_fallback = true`, and the report route refuses to
 * embed a fallback narrative in a PDF. A stub therefore cannot reach a client
 * however many buttons are pressed.
 *
 * Pure. No I/O, no randomness, no clock - the same score always produces the
 * same text, which is what makes it usable as a test fixture.
 */

import { formatPct, remediationSchedule, SUB_CRITERION_BY_ID, topPriorityGaps } from '@klawfin/rubric';
import type { DimensionResult, PriorityGap, SubCriterionResult } from '@klawfin/rubric';

import type { PromptFacts } from './prompt';
import { DATA_ROOM_ITEMS } from './schema';
import type { DimensionNarrative, NarrativeResponse } from './schema';

/** Marks the text as machine-assembled wherever a reader might mistake it. */
export const STUB_MARKER = 'Generated offline without a language model';

export function stubNarrative(facts: PromptFacts): NarrativeResponse {
  const { score } = facts;
  const assessed = score.dimensions.filter((d) => !d.entirelyNotApplicable && !d.notAssessed);

  return {
    executive_summary: executiveSummary(facts),
    overall_assessment: overallAssessment(facts),
    dimensions: score.dimensions.map(dimensionNarrative),
    priority_gaps: topPriorityGaps(score).map((gap) => ({
      rank: gap.rank,
      dimension_id: gap.dimensionId,
      gap: `${gap.label} sits at ${gap.score} of 4 (${gap.currentAnchor}).`,
      rationale: priorityRationale(gap),
    })),
    remediation_plan: remediationPlan(score),
    data_room_checklist: DATA_ROOM_ITEMS.map((item) => ({
      item,
      status: 'unknown' as const,
      note: 'Not reviewed. The offline run does not inspect documents; this item needs a human check.',
    })),
    questions_you_cannot_yet_answer: unansweredQuestions(score.dimensions),
    generation_notes: `${STUB_MARKER}. This narrative was assembled from the computed rubric output alone, so it contains no judgement and no observation beyond the scores. It is stored as a fallback and cannot be embedded in a client report. Assessed dimensions: ${assessed.length} of ${score.dimensions.length}.`,
  };
}

/* -------------------------------------------------------------------------- */
/* Sections                                                                   */
/* -------------------------------------------------------------------------- */

function executiveSummary(facts: PromptFacts): string {
  const { score } = facts;
  const lines: string[] = [];

  lines.push(
    `${facts.clientName} scores ${score.composite}/100 against the Groundwork rubric, placing it in the ${score.band.label} band: ${score.band.meaning}`,
  );
  lines.push(
    `Intake coverage is ${Math.round(score.overallCoverage * 100)}%, giving ${score.overallConfidence} confidence in this result overall.`,
  );

  if (score.preRevenueMode) {
    lines.push(
      'This company has no revenue, so traction was assessed against substitute evidence - signed commitments, documented discovery and design partners - rather than against revenue. The traction figure is not comparable to that of a revenue-stage company.',
    );
  }
  if (score.weightRedistributed) {
    lines.push(
      'One or more dimensions did not apply to this company and their weight was redistributed across the remainder, so the composite reflects only what could be assessed.',
    );
  }
  if (facts.preliminary) {
    lines.push(
      'This assessment is preliminary. Intake coverage is below the threshold for a full assessment, and the result should be expected to move once the outstanding information is supplied.',
    );
  }

  const ranked = [...score.dimensions]
    .filter((d) => !d.entirelyNotApplicable && !d.notAssessed)
    .sort((a, b) => b.pct - a.pct);
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];
  if (best && worst && best.id !== worst.id) {
    lines.push(
      `The strongest area is ${best.name} at ${formatPct(best.pct)}/100; the weakest is ${worst.name} at ${formatPct(worst.pct)}/100, which is where the available points are concentrated.`,
    );
  }

  const gaps = topPriorityGaps(facts.score);
  if (gaps.length > 0) {
    lines.push(
      `The prioritised remediation list begins with ${gaps
        .slice(0, 3)
        .map((g) => g.label)
        .join(', ')}.`,
    );
  }

  lines.push(
    `${STUB_MARKER}: the sections below restate the computed rubric output and carry no additional analysis. A generated narrative replaces them.`,
  );

  return lines.join(' ');
}

function overallAssessment(facts: PromptFacts): string {
  const { score } = facts;
  const lines: string[] = [];

  lines.push(
    `Across the six dimensions the composite is ${score.composite}/100. Each dimension below contributes in proportion to its weight, and the contribution figure is what determines where effort is worth spending.`,
  );

  for (const d of score.dimensions) {
    if (d.entirelyNotApplicable) {
      lines.push(`${d.name} does not apply to this company and was excluded from scoring.`);
      continue;
    }
    if (d.notAssessed) {
      lines.push(
        `${d.name} could not be assessed: coverage is ${Math.round(d.coverage * 100)}% and too little was supplied to form a view.`,
      );
      continue;
    }
    lines.push(
      `${d.name} scores ${formatPct(d.pct)}/100 at ${Math.round(d.weight * 100)}% weight, contributing ${formatPct(d.weightedContribution)} points, on ${Math.round(d.coverage * 100)}% coverage.`,
    );
  }

  if (facts.contradictions.length > 0) {
    lines.push(
      `Deterministic checks found ${facts.contradictions.length} internal inconsistency or inconsistencies in the intake. These need resolving before the figures above can be relied on.`,
    );
  }

  lines.push(
    'What to do with this document: treat the dimension scores as the agenda and the priority list as the running order. Each recommendation names the work, the rough duration and what closing it changes.',
  );

  return lines.join(' ');
}

function dimensionNarrative(dimension: DimensionResult): DimensionNarrative {
  const id = dimension.id;

  if (dimension.entirelyNotApplicable || dimension.notAssessed) {
    return {
      dimension_id: id,
      what_we_observed: notAssessedText(dimension),
      gaps: [],
      recommendations: [],
      confidence_note: `Coverage for ${dimension.name} is ${Math.round(
        dimension.coverage * 100,
      )}%. ${
        dimension.entirelyNotApplicable
          ? 'Every sub-criterion was not applicable to this company, so the dimension was excluded and its weight redistributed.'
          : 'Too little was supplied to assess this dimension, so no assessment of it appears here.'
      }`,
    };
  }

  const weak = dimension.subCriteria
    .filter((s): s is SubCriterionResult & { score: number } => s.score !== null && s.score < 3)
    .slice(0, 8);

  return {
    dimension_id: id,
    what_we_observed: observedText(dimension),
    gaps: weak.map((sub) => ({
      gap: `${sub.label} is at ${sub.score} of 4: ${anchorLabelOf(sub)}.`,
      why_it_matters: `This sub-criterion carries weight inside ${dimension.name}, which itself carries ${Math.round(
        dimension.weight * 100,
      )}% of the composite. At its current level it will be visible to a reader working through the same evidence.`,
      evidence: evidenceText(sub),
    })),
    recommendations: weak.map((sub) => ({
      action: `Raise ${sub.label} towards the level described as: ${truncate(targetAnchorOf(sub), 300)}`,
      effort: 'medium' as const,
      estimated_duration: '2-4 weeks',
      expected_effect: `Moving ${sub.label} up the scale raises the ${dimension.name} score and, through it, the composite.`,
    })),
    confidence_note:
      dimension.confidence === 'high'
        ? null
        : `Coverage for ${dimension.name} is ${Math.round(dimension.coverage * 100)}%, giving ${
            dimension.confidence
          } confidence.${
            dimension.lowConfidenceFromNa
              ? ' Several sub-criteria were not applicable, so the score rests on a narrower base than usual.'
              : ' The unanswered inputs are listed against the individual sub-criteria above.'
          }`,
  };
}

function notAssessedText(dimension: DimensionResult): string {
  const missing = dimension.subCriteria.flatMap((s) => s.missingInputs).slice(0, 10);
  return [
    `${dimension.name} could not be assessed.`,
    dimension.entirelyNotApplicable
      ? 'Every sub-criterion in it was not applicable to this company, so it was excluded from scoring and its weight was redistributed across the dimensions that do apply.'
      : `Coverage is ${Math.round(dimension.coverage * 100)}%, below the threshold at which a view can responsibly be formed.`,
    missing.length > 0
      ? `To assess it, the following are needed: ${missing.join(', ')}.`
      : 'Completing the corresponding intake section is what unblocks it.',
    'No assessment of this dimension appears in this report, and the absence is deliberate rather than an oversight.',
  ].join(' ');
}

function observedText(dimension: DimensionResult): string {
  const scored = dimension.subCriteria.filter((s) => s.score !== null);
  const na = dimension.subCriteria.filter((s) => s.score === null);

  const parts: string[] = [
    `${dimension.name} scores ${formatPct(dimension.pct)}/100 on ${Math.round(
      dimension.coverage * 100,
    )}% coverage, contributing ${formatPct(dimension.weightedContribution)} points to the composite at ${Math.round(
      dimension.weight * 100,
    )}% weight.`,
  ];

  const detail = scored
    .slice(0, 6)
    .map((s) => `${s.label} ${s.score} of 4 (${anchorLabelOf(s)})`)
    .join('; ');
  if (detail.length > 0) parts.push(`Sub-criteria: ${detail}.`);

  if (na.length > 0) {
    parts.push(
      `${na.length} sub-criteri${na.length === 1 ? 'on was' : 'a were'} not applicable and ${
        na.length === 1 ? 'was' : 'were'
      } excluded rather than scored as zero.`,
    );
  }

  const substitutes = scored.filter((s) => s.scoredOnSubstitute);
  if (substitutes.length > 0) {
    parts.push(
      `${substitutes.length} sub-criteri${
        substitutes.length === 1 ? 'on was' : 'a were'
      } scored against the pre-revenue substitute ladder rather than against revenue.`,
    );
  }

  return parts.join(' ');
}

function evidenceText(sub: SubCriterionResult): string {
  if (sub.derivation && sub.derivation.trim().length > 0) {
    return `Derived from the intake: ${truncate(sub.derivation, 400)}`;
  }
  if (sub.missingInputs.length > 0) {
    return `The intake did not supply: ${truncate(sub.missingInputs.join(', '), 400)}`;
  }
  return `Recorded at ${sub.score} of 4 against the anchor "${truncate(anchorLabelOf(sub), 300)}" during intake.`;
}

function priorityRationale(gap: PriorityGap): string {
  return `This ranks ${gap.rank} because closing it fully would add approximately ${gap.compositePointsAvailable.toFixed(
    1,
  )} points to the composite, and the effort to close it is assessed as ${gap.effort}. The ordering weighs those two together, so a smaller gain that is quick to secure can outrank a larger one that is not. It sits within ${gap.dimensionName}.`;
}

function remediationPlan(score: PromptFacts['score']): NarrativeResponse['remediation_plan'] {
  const schedule = remediationSchedule(score);
  const render = (gaps: readonly PriorityGap[]): string[] =>
    gaps.map(
      (g) =>
        `${g.label} (${g.dimensionName}): move from ${g.score} of 4 towards ${truncate(
          g.targetAnchor,
          260,
        )}`,
    );

  return {
    days_0_30: render(schedule.days_0_30),
    days_31_60: render(schedule.days_31_60),
    days_61_90: render(schedule.days_61_90),
  };
}

function unansweredQuestions(dimensions: readonly DimensionResult[]): string[] {
  const questions: string[] = [];
  for (const d of dimensions) {
    if (d.entirelyNotApplicable) continue;
    const missing = d.subCriteria.flatMap((s) => s.missingInputs);
    if (missing.length === 0) continue;
    questions.push(
      `${d.name}: what is the position on ${truncate(missing.slice(0, 4).join(', '), 300)}?`,
    );
  }
  return questions.slice(0, 20);
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The anchor text for a sub-criterion's current level.
 *
 * `anchorLabel` is typed nullable because it is null for an N/A sub-criterion.
 * Callers here have already filtered those out, but the fallback keeps the
 * string non-empty either way - an empty string would trip the placeholder
 * guardrail rather than surfacing the real problem.
 */
function anchorLabelOf(sub: SubCriterionResult): string {
  return sub.anchorLabel ?? 'no anchor recorded';
}

/** What level 4 looks like for this sub-criterion, from the rubric itself. */
function targetAnchorOf(sub: SubCriterionResult): string {
  return SUB_CRITERION_BY_ID.get(sub.id)?.anchors[4] ?? 'the top of the scale for this sub-criterion';
}

function truncate(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1).trimEnd()}...`;
}
