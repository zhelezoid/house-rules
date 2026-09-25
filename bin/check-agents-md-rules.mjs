#!/usr/bin/env node
// Guard for the source of the "Working rules" section: plugins/house-rules/rules/rules.md.
//
// Why. This file is assembled into every adopting repository's AGENTS.md, and AGENTS.md loads
// itself into every session. A section that grows into a reference manual eats the starting
// context everywhere at once and stops being read. The ceiling is 120 lines across all levels;
// explanations and history live in reference/, not here.
//
// Three checks:
//   1. the file exists — no source, nothing for the generator (bin/agents-md.mjs) to assemble;
//   2. it has "## Level 1" … "## Level 4" sections, each exactly once — parsed the same way the
//      generator does (by import), so the guard and the build never disagree on the format;
//   3. no more than 120 lines (trailing blank lines don't count).
//
// Run: node bin/check-agents-md-rules.mjs · path can be swapped with AGENTS_MD_RULES (self-test).
// Exit 1 — at least one complaint, named in the output.

import { MAX_LEVEL, parseRules, readRules, rulesPath } from "../plugins/house-rules/bin/agents-md.mjs";

export const MAX_LINES = 120;

/** Complaints about the source text; null instead of text means the file is missing. Empty array — all good. */
export function evaluate(text) {
  if (text === null) return [`no source file: ${rulesPath()}`];
  const problems = [];
  let levels = {};
  try {
    levels = parseRules(text);
  } catch (e) {
    problems.push(e.message);
  }
  for (let lvl = 1; lvl <= MAX_LEVEL; lvl++) {
    if (levels[lvl] === undefined) problems.push(`no "## Level ${lvl}" section`);
  }
  const lines = text.replace(/\s+$/, "").split("\n").length;
  if (lines > MAX_LINES) {
    problems.push(`${lines} lines, ceiling is ${MAX_LINES}: the section loads into every session — explanations belong in reference/`);
  }
  return problems;
}

function main() {
  const problems = evaluate(readRules());
  if (!problems.length) {
    console.log(`check-agents-md-rules: section source is in order (${rulesPath()}) ✓`);
    process.exit(0);
  }
  console.log(`check-agents-md-rules: ${problems.length} complaint(s):`);
  for (const p of problems) console.log(`  ✗ ${p}`);
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
