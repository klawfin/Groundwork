/**
 * @klawfin/core - the base of the dependency graph.
 *
 * core <- rubric <- validation <- llm <- web
 *
 * Nothing here imports another Klawfin package. Keep it that way: this is
 * what stops the rubric and the validation layer becoming mutually dependent.
 */

export * from './intake/schema.js';
export * from './intake/presence.js';
export * from './legal/disclaimers.js';
export * from './legal/branding.js';
