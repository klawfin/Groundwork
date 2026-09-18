/**
 * Product and organisation naming.
 *
 * Fixed text that appears on the report cover and in every page footer. Lives
 * here rather than in the PDF renderer so there is exactly one spelling of the
 * product name in the system, and so a rename is one edit rather than a search.
 *
 * NAMING CONSTRAINT, and it is a legal one rather than a stylistic one:
 *
 * PRD 11.1 requires that the score is never framed as a rating, a credit
 * assessment, an investability grade, or a signal to a third party. That rules
 * out an entire category of otherwise-obvious product naming - anything built
 * from Score, Grade, Rank, Rating, Index or Verdict would undermine the
 * position the guardrails and the disclaimer exist to protect.
 *
 * "Groundwork" was chosen against that constraint: it names the preparation,
 * not a judgement of the company.
 */

/** The tool. Appears on the report cover under the organisation name. */
export const PRODUCT_NAME = 'Groundwork';

/** The firm. */
export const ORG_NAME = 'Klawfin';

/** Full form, for a cover page or a first mention. */
export const PRODUCT_FULL_NAME = `${PRODUCT_NAME} by ${ORG_NAME}`;

/**
 * The report's own title (PRD 7.1, section 1).
 *
 * Deliberately NOT the product name. The founder receives a "Fundraise
 * Readiness Assessment"; the product is the instrument that produced it. That
 * is how professional-services methodologies normally read, and it keeps the
 * deliverable's name descriptive rather than branded.
 */
export const REPORT_TITLE = 'Fundraise Readiness Assessment';

/** Byline for the report cover. */
export function reportByline(): string {
  return `Prepared by ${ORG_NAME} using ${PRODUCT_NAME}`;
}

/**
 * Report filename (PRD P1-08).
 *
 * Fixed convention: `Klawfin_Readiness_{ClientName}_{YYYY-MM-DD}_v{n}.pdf`
 *
 * The client name is sanitised because this string becomes a filename on
 * Dhruv's machine and in the founder's inbox. Note that this is the DOWNLOAD
 * name only - the storage object key is UUID-derived and never contains a
 * client name, because storage paths leak into logs and browser history
 * (architecture 5.3).
 */
export function reportFilename(clientName: string, isoDate: string, version: number): string {
  const safe = clientName
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 60);
  return `Klawfin_Readiness_${safe || 'Client'}_${isoDate}_v${version}.pdf`;
}
