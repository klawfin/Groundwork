/**
 * @klawfin/rubric - the scoring engine.
 *
 * PURE. No network, no database, no Date.now(), no randomness. The LLM is not
 * imported here and never will be: the model receives this package's output
 * as fact (PRD NG9, readme.md structural rule 2).
 */

export * from './types';
export * from './definitions';
export * from './bands';
export * from './mapping';
export * from './score';
export * from './priority';
