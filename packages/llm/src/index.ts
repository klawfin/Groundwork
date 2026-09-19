/**
 * @klawfin/llm - Anthropic integration.
 *
 * The model writes narrative. It never produces a number that appears in a
 * report (PRD NG9, 6.1). Everything numeric arrives from @klawfin/rubric as a
 * computed fact.
 */

export * from './schema';
export * from './guardrails';
export * from './cost';
export * from './prompt';
export * from './client';
export * from './editMagnitude';
