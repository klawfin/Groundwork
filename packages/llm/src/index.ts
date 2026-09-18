/**
 * @klawfin/llm - Anthropic integration.
 *
 * The model writes narrative. It never produces a number that appears in a
 * report (PRD NG9, 6.1). Everything numeric arrives from @klawfin/rubric as a
 * computed fact.
 */

export * from './schema.js';
export * from './guardrails.js';
export * from './cost.js';
export * from './prompt.js';
export * from './client.js';
