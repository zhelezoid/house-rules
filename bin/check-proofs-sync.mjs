#!/usr/bin/env node
// Guard for the sync between the requirement lists: REQUIRED-PROOFS.md (human-readable) and
// required-proofs.json (machine-readable) must name the same statements.
//
// Why it exists. Two people (or a person and a machine edit) can independently add a point to
// one file and forget the other, and until this exists nothing catches it: the files exist on
// their own, nobody cross-checks them.
//
// How the sync works. Every `### N.M …` heading in REQUIRED-PROOFS.md carries a
// `<!-- id: … -->` right under it — the same id as a `proofs[].id` entry in
// required-proofs.json. Without a shared id, comparing two prose descriptions would be guessing
// by resemblance; the id is the one thing that can be compared exactly.
//
// Run: node bin/check-proofs-sync.mjs [--md <path>] [--json <path>]
//   (default — plugins/house-rules/proofs/{REQUIRED-PROOFS.md,required-proofs.json})
// Exit 1 — a point missing from the other file, a level mismatch, or a heading without an id.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROOFS_DIR = path.join(ROOT, "plugins", "house-rules", "proofs");

function argOf(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
}

const mdPath = argOf("--md", path.join(PROOFS_DIR, "REQUIRED-PROOFS.md"));
const jsonPath = argOf("--json", path.join(PROOFS_DIR, "required-proofs.json"));

/**
 * Parses REQUIRED-PROOFS.md: pairs of "heading N.M" -> id, declared on the line right under it.
 * A heading with no id is also a mismatch (otherwise the point stays forever unverifiable in
 * silence). Exported for the self-test.
 */
export function parseMarkdown(text) {
  const lines = text.split("\n");
  const entries = [];   // { number, title, id }
  const headerless = []; // headings WITHOUT an id line right under them
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^### (\d+\.\d+) (.+)$/);
    if (!m) continue;
    const [, number, title] = m;
    const next = (lines[i + 1] || "").trim();
    const idMatch = next.match(/^<!--\s*id:\s*([\w-]+)\s*-->$/);
    if (idMatch) entries.push({ number, title: title.trim(), id: idMatch[1] });
    else headerless.push(`${number} ${title.trim()}`);
  }
  return { entries, headerless };
}

/** Parses required-proofs.json: a list of { id, level, statement }. Exported for the self-test. */
export function parseJson(text) {
  const data = JSON.parse(text);
  if (!Array.isArray(data.proofs)) throw new Error("required-proofs.json: no proofs array");
  return data.proofs.map((p) => ({ id: p.id, level: p.level, statement: p.statement }));
}

/**
 * Compares two parses and returns a list of mismatches (empty means everything matches).
 * Exported for the self-test — runs on strings supplied directly, no disk access.
 */
export function diff(md, json) {
  const problems = [];

  if (md.headerless.length) {
    for (const h of md.headerless) {
      problems.push(`REQUIRED-PROOFS.md: heading "${h}" has no <!-- id: … --> line under it — nothing to compare it against`);
    }
  }

  const byId = new Map(md.entries.map((e) => [e.id, e]));
  const jsonIds = new Set(json.map((p) => p.id));

  for (const e of md.entries) {
    if (!jsonIds.has(e.id)) {
      problems.push(`in REQUIRED-PROOFS.md, missing from required-proofs.json: "${e.id}" (point ${e.number} "${e.title}")`);
    }
  }
  for (const p of json) {
    if (!byId.has(p.id)) {
      problems.push(`in required-proofs.json, missing from REQUIRED-PROOFS.md: "${p.id}"`);
    }
  }

  // The level is named twice — by the heading's number (N.M -> level N) and by the json field
  // level. A mismatch means someone raised or lowered the point in one place and forgot the other.
  for (const e of md.entries) {
    const p = json.find((x) => x.id === e.id);
    if (!p) continue;
    const mdLevel = Number(e.number.split(".")[0]);
    if (mdLevel !== p.level) {
      problems.push(
        `level mismatch for "${e.id}": REQUIRED-PROOFS.md names level ${mdLevel} (point ${e.number}), ` +
          `required-proofs.json — level ${p.level}`
      );
    }
  }

  return problems;
}

function main() {
  let mdText, jsonText;
  try {
    mdText = fs.readFileSync(mdPath, "utf8");
  } catch (e) {
    console.error(`check-proofs-sync: couldn't read ${mdPath}: ${e.message}`);
    process.exit(2);
  }
  try {
    jsonText = fs.readFileSync(jsonPath, "utf8");
  } catch (e) {
    console.error(`check-proofs-sync: couldn't read ${jsonPath}: ${e.message}`);
    process.exit(2);
  }

  const md = parseMarkdown(mdText);
  let json;
  try {
    json = parseJson(jsonText);
  } catch (e) {
    console.error(`check-proofs-sync: couldn't parse ${jsonPath}: ${e.message}`);
    process.exit(2);
  }

  const problems = diff(md, json);

  console.log(
    `check-proofs-sync: ${md.entries.length} point(s) in REQUIRED-PROOFS.md, ${json.length} in required-proofs.json.`
  );

  if (!problems.length) {
    console.log("✓ the two lists are in sync");
    process.exit(0);
  }

  console.log(`\nMismatches (${problems.length}):`);
  for (const p of problems) console.log(`  ✗ ${p}`);
  console.log("");
  console.log("Both files — REQUIRED-PROOFS.md and required-proofs.json — must name the same");
  console.log("statements under the same id. A point forgotten in one place is a point that");
  console.log("silently doesn't travel with the rest.");
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
