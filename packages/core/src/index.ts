/**
 * @klawfin/core - the base of the dependency graph.
 *
 * core <- rubric <- validation <- llm <- web
 *
 * Nothing here imports another Klawfin package. Keep it that way: this is
 * what stops the rubric and the validation layer becoming mutually dependent.
 */

export * from './intake/schema';
export * from './intake/presence';
export * from './legal/disclaimers';
export * from './legal/branding';
