#!/usr/bin/env node
/**
 * The brand kit is seven colours. This proves it still is.
 *
 * Two checks, because the constraint can break in two different ways:
 *
 *   1. SOURCE - a Tailwind default class (`bg-white`, `text-stone-600`,
 *      `border-red-200`) creeping back into a component. Easy to add, invisible
 *      in review, and it silently ends the design system.
 *
 *   2. OUTPUT - a hex in the built stylesheet that is not in the kit. This
 *      catches what the source check cannot: a utility emitted for a reason
 *      nobody intended. It has already happened once - the bare word "shadow"
 *      inside a CODE COMMENT was enough for Tailwind v4's scanner to emit the
 *      rule, which put a black tint in the stylesheet.
 *
 * Run: node scripts/check-palette.mjs [--built]
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const PALETTE = ['132849', 'f6e9d9', '52cc94', 'fffaf5', '1e1e21', 'f99132', '97c1ff'];

/** Tailwind's built-in scales. None of these belong in this codebase. */
const BANNED_SCALES =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const BANNED_CLASS = new RegExp(
  `\\b(bg|text|border|ring|from|via|to|divide|outline|decoration|placeholder|accent|caret|fill|stroke|shadow)-(${BANNED_SCALES})-(\\d{2,3})\\b`,
  'g',
);
/** `bg-white` / `text-black` have no numeric suffix, so they need their own pattern. */
const BANNED_BARE = /\b(bg|text|border|ring|divide|fill|stroke)-(white|black)\b/g;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry === 'dist') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx?|css)$/.test(entry)) out.push(full);
  }
  return out;
}

let failed = false;

/* -------------------------------------------------------------------------- */
/* 1. Source                                                                  */
/* -------------------------------------------------------------------------- */

const files = walk('apps/web/src');
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const hits = [
    ...source.matchAll(BANNED_CLASS),
    ...source.matchAll(BANNED_BARE),
  ];
  if (hits.length === 0) continue;

  failed = true;
  const where = relative(process.cwd(), file).replace(/\\/g, '/');
  for (const hit of hits) {
    const line = source.slice(0, hit.index).split('\n').length;
    console.error(`${where}:${line}  '${hit[0]}' is not in the brand kit`);
  }
}

/* -------------------------------------------------------------------------- */
/* 2. Built output                                                            */
/* -------------------------------------------------------------------------- */

if (process.argv.includes('--built')) {
  const cssDir = 'apps/web/.next/static/css';
  let sheets = [];
  try {
    sheets = readdirSync(cssDir).filter((f) => f.endsWith('.css'));
  } catch {
    console.error(`${cssDir} not found - run \`pnpm build\` before --built.`);
    process.exit(1);
  }

  for (const sheet of sheets) {
    const css = readFileSync(join(cssDir, sheet), 'utf8');
    const hexes = new Set((css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).map((h) => h.toLowerCase()));
    for (const hex of hexes) {
      const bare = hex.slice(1);
      // `#0000` is transparent, not a colour.
      if (bare === '0000') continue;
      if (PALETTE.some((p) => bare.startsWith(p))) continue;
      failed = true;
      console.error(`${cssDir}/${sheet}  emits '${hex}', which is not in the brand kit`);
    }
  }
}

if (failed) {
  console.error('\nPalette check failed. See docs/DESIGN.md for the seven permitted colours.');
  process.exit(1);
}

console.log(`Palette clean: ${files.length} source files checked.`);
