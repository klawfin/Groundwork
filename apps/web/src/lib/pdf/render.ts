/**
 * PDF rendering.
 *
 * Node runtime only - react-pdf will not work on Edge. Route handlers that
 * call this must declare `export const runtime = 'nodejs'`.
 *
 * Returns the bytes plus a SHA-256 so the `reports` row can record exactly
 * what the client was shown. That hash is tamper-evidence on the delivered
 * artifact, and it is why regeneration producing a byte-different PDF is not a
 * problem: the hash records which bytes were actually handed over.
 */

import 'server-only';

import { createHash } from 'node:crypto';
import { renderToBuffer } from '@react-pdf/renderer';

import { DATA_ROOM_ITEMS, type NarrativeResponse } from '@klawfin/llm';
import { topPriorityGaps, type ScoreResult } from '@klawfin/rubric';

import { ReportDocument, type ReportProps } from './ReportDocument.js';

export interface RenderInput {
  clientName: string;
  score: ScoreResult;
  /** null renders the fallback report (PRD 8.2). */
  narrative: NarrativeResponse | null;
  reportVersion: number;
  generatedOn: string;
  isPreliminary: boolean;
  hasIncompleteWatermark: boolean;
}

export interface RenderedReport {
  bytes: Buffer;
  sha256: string;
  byteSize: number;
}

export function buildReportProps(input: RenderInput): ReportProps {
  return {
    clientName: input.clientName,
    generatedOn: input.generatedOn,
    reportVersion: input.reportVersion,
    score: input.score,
    narrative: input.narrative,
    // Prioritisation is computed, never taken from the model (PRD 6.1).
    priorityGaps: topPriorityGaps(input.score),
    dataRoomItems: DATA_ROOM_ITEMS,
    isPreliminary: input.isPreliminary,
    hasIncompleteWatermark: input.hasIncompleteWatermark,
  };
}

export async function renderReport(input: RenderInput): Promise<RenderedReport> {
  const props = buildReportProps(input);
  const bytes = await renderToBuffer(ReportDocument(props));

  return {
    bytes,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    byteSize: bytes.byteLength,
  };
}

/**
 * Storage object key.
 *
 * UUIDs only - NO client name. Storage paths leak into logs, error traces and
 * browser history, and a path should not disclose that Klawfin is assessing a
 * particular company (architecture 5.3). The human-readable filename is
 * applied at download time via Content-Disposition instead.
 */
export function storagePath(
  clientId: string,
  assessmentId: string,
  reportId: string,
  version: number,
): string {
  return `${clientId}/${assessmentId}/${reportId}-v${version}.pdf`;
}
