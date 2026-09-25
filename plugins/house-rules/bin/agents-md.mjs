#!/usr/bin/env node
// Generator for the "Working rules" section in a repository's AGENTS.md.
//
// Why. Copies of rule documents nobody reads sit unread — sessions load only what Claude Code
// and Codex load themselves: AGENTS.md. So whatever a repository's level requires lives there as
// one section, assembled from a single source instead of being retyped per repository.
//
// Source: plugins/house-rules/rules/rules.md — sections `## Level 1 …` … `## Level 4 …`;
// everything before the first such heading is preamble for whoever edits the source, and never
// makes it into the section.
//
// In AGENTS.md the section sits between invisible markers:
//   <!-- house-rules:begin level=N applied=YYYY-MM-DD fingerprint=<12 hex> -->
//   <!-- warning: hand edits here are lost -->
//   ## Working rules
//   …bodies of levels 1..N, headings demoted to ###…
//   <!-- house-rules:end -->
// The fingerprint is computed over the BODY — everything between the warning line and the
// closing marker. That's what tells "source moved on, body is stale" apart from "section was
// hand-edited" (fingerprint doesn't match the body at all).
//
// Usage:
//   node bin/agents-md.mjs <repo> [--level N] [--date YYYY-MM-DD] [--check] [--force]
// `--level` and `--date` are optional once markers already exist — taken from the marker.
//
// Exit codes:
//   0 — section written or already matches (`--check`: matches);
//   1 — nothing written: section was hand-edited, level disagrees with the marker
//       (`--check`: stale / edited / no markers / level mismatch);
//   2 — can't run: no AGENTS.md, no source, broken markers, unknown argument, level 0.
//
// A tool that recognizes a hand edit and silently overwrites it is the worst kind of guard.
// Without `--force`, an edited section is never rewritten, and the mismatch is printed before
// anything is written.
//
// The source path can be swapped with the AGENTS_MD_RULES env var — for self-tests and one-off
// comparisons.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const BEGIN_PREFIX = "<!-- house-rules:begin";
export const END_MARK = "<!-- house-rules:end -->";
const WARNING_LINE =
  "<!-- This section is assembled by house-rules via /house-rules:update. " +
  "Hand edits here are lost on the next update — put project-specific rules outside these markers. -->";
const SECTION_TITLE = "## Working rules";
const BEGIN_RE = /^<!-- house-rules:begin level=(\d+) applied=(\d{4}-\d{2}-\d{2}) fingerprint=([0-9a-f]+) -->$/;
const LEVEL_HEADING_RE = /^## Level ([1-9])(?:\s.*)?$/;
export const MAX_LEVEL = 4;

export const STATE_FRESH = "fresh";
export const STATE_STALE = "stale";
export const STATE_EDITED = "edited";

export function rulesPath() {
  return process.env.AGENTS_MD_RULES || path.join(HERE, "..", "rules", "rules.md");
}

/** The source, or null if it's missing: "couldn't compare" is not the same as "fresh". */
export function readRules(file = rulesPath()) {
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, "utf8").replace(/^﻿/, "").replace(/\r\n/g, "\n");
}

export function fingerprint(body) {
  return createHash("sha256").update(body, "utf8").digest("hex").slice(0, 12);
}

/**
 * Parses the source: { level number -> section text, heading demoted to ### }. Preamble before
 * the first level heading is dropped. A repeated level is a source error, not "take the last
 * one": a silently chosen section is a rule nobody chose.
 */
export function parseRules(text) {
  const levels = {};
  let current = null;
  for (const line of text.split("\n")) {
    const m = LEVEL_HEADING_RE.exec(line);
    if (m) {
      current = Number(m[1]);
      if (levels[current] !== undefined) throw new Error(`source has level ${current} twice`);
      levels[current] = ["#" + line];
      continue;
    }
    if (current !== null) levels[current].push(line);
  }
  return Object.fromEntries(Object.entries(levels).map(([k, lines]) => [k, lines.join("\n").trim()]));
}

/** Section body for a level: title plus level sections 1..level in order. */
export function renderBody(rulesText, level) {
  const levels = parseRules(rulesText);
  const parts = [];
  for (let lvl = 1; lvl <= level; lvl++) {
    if (levels[lvl] === undefined) throw new Error(`source has no "Level ${lvl}" section`);
    parts.push(levels[lvl]);
  }
  return `${SECTION_TITLE}\n\n${parts.join("\n\n")}\n`;
}

/** The whole section, from the opening marker to the closing one inclusive, no trailing newline. */
export function renderSection(rulesText, level, date) {
  const body = renderBody(rulesText, level);
  return (
    `${BEGIN_PREFIX} level=${level} applied=${date} fingerprint=${fingerprint(body)} -->\n` +
    `${WARNING_LINE}\n${body}${END_MARK}`
  );
}

/**
 * Finds the section in AGENTS.md text. Text is NOT normalized: section boundaries are indexes
 * into the raw bytes, otherwise writing would rewrite line endings in the project's own part of
 * the file.
 *   { kind: "none" }                        — no markers;
 *   { kind: "broken", reason }              — the pair is incomplete, there's more than one, or a
 *                                              marker doesn't parse;
 *   { kind: "ok", start, end, level, date, fp, body, text } — start/end are section bounds in the text.
 */
export function findSection(text) {
  const begins = [...text.matchAll(/<!-- house-rules:begin/g)].map((m) => m.index);
  const ends = [...text.matchAll(/<!-- house-rules:end -->/g)].map((m) => m.index);
  if (begins.length === 0 && ends.length === 0) return { kind: "none" };
  if (begins.length !== 1 || ends.length !== 1) {
    return {
      kind: "broken",
      reason: `${begins.length} opening markers, ${ends.length} closing — expected exactly one pair`,
    };
  }
  const start = begins[0];
  const endIdx = ends[0];
  if (endIdx < start) return { kind: "broken", reason: "closing marker comes before the opening one" };
  const beginLineEnd = text.indexOf("\n", start);
  const beginLine = text.slice(start, beginLineEnd === -1 ? text.length : beginLineEnd);
  const m = BEGIN_RE.exec(beginLine);
  if (!m || beginLineEnd === -1 || beginLineEnd > endIdx) {
    return { kind: "broken", reason: `opening marker doesn't parse: "${beginLine}"` };
  }
  // The body starts after the second line (the warning). If that line was removed, the body
  // shifts and the fingerprint won't match — that IS the hand-edit case, no separate branch
  // needed.
  const warnEnd = text.indexOf("\n", beginLineEnd + 1);
  const bodyStart = warnEnd === -1 || warnEnd > endIdx ? endIdx : warnEnd + 1;
  const body = text.slice(bodyStart, endIdx);
  return {
    kind: "ok",
    start,
    end: endIdx + END_MARK.length,
    level: Number(m[1]),
    date: m[2],
    fp: m[3],
    body,
    text: text.slice(start, endIdx + END_MARK.length),
  };
}

/**
 * Section state in a repository — for what-changed.mjs (imported, no subprocess).
 *   { kind: "no-agents-md" } | { kind: "none" } | { kind: "broken", reason }
 *   | { kind: "ok", level, date, state, sourceUnavailable }
 * state: "fresh" — matches what generating right now would produce; "edited" — fingerprint
 * doesn't match the body; "stale" — fingerprint matches, but the source moved on. No source
 * means state is null and sourceUnavailable is true: "couldn't compare", not "fresh".
 */
export function sectionStatus(repo, rulesText = readRules()) {
  const agentsPath = path.join(repo, "AGENTS.md");
  if (!fs.existsSync(agentsPath)) return { kind: "no-agents-md" };
  const sec = findSection(fs.readFileSync(agentsPath, "utf8"));
  if (sec.kind !== "ok") return sec;
  const base = { kind: "ok", level: sec.level, date: sec.date };
  if (fingerprint(sec.body) !== sec.fp) return { ...base, state: STATE_EDITED };
  if (rulesText === null) return { ...base, state: null, sourceUnavailable: true };
  let expected;
  try {
    expected = renderSection(rulesText, sec.level, sec.date);
  } catch (e) {
    return { ...base, state: null, sourceUnavailable: true, reason: e.message };
  }
  return { ...base, state: expected === sec.text ? STATE_FRESH : STATE_STALE };
}

/** Line-by-line diff with no external deps: what's missing from the new text and from the current one. */
function lineDiff(current, next) {
  const cur = current.split("\n");
  const nxt = next.split("\n");
  const curSet = new Set(cur);
  const nxtSet = new Set(nxt);
  const out = [];
  for (const l of cur) if (!nxtSet.has(l)) out.push(`  - ${l}`);
  for (const l of nxt) if (!curSet.has(l)) out.push(`  + ${l}`);
  return out.length ? out.join("\n") : "  (same lines, order or blank lines differ)";
}

function fail(code, message) {
  console.error(`agents-md: ${message}`);
  process.exit(code);
}

function parseArgs(argv) {
  const opts = { repo: null, level: null, date: null, check: false, force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--check") opts.check = true;
    else if (a === "--force") opts.force = true;
    else if (a === "--level" || a === "--date") {
      const v = argv[++i];
      if (v === undefined) fail(2, `flag ${a} needs a value`);
      opts[a.slice(2)] = v;
    } else if (a.startsWith("-")) fail(2, `unknown flag "${a}"`);
    else if (opts.repo === null) opts.repo = a;
    else fail(2, `extra argument "${a}"`);
  }
  return opts;
}

function main(argv) {
  const opts = parseArgs(argv);
  if (!opts.repo) fail(2, "give a repository: node bin/agents-md.mjs <repo> [--level N] [--date YYYY-MM-DD] [--check] [--force]");
  const repo = path.resolve(opts.repo);
  const agentsPath = path.join(repo, "AGENTS.md");
  if (!fs.existsSync(agentsPath)) fail(2, `no ${agentsPath} — the section goes into an existing set of rules, it doesn't start one`);

  const rulesText = readRules();
  if (rulesText === null) fail(2, `no source for the section (${rulesPath()}) — nothing to compare against`);

  const text = fs.readFileSync(agentsPath, "utf8");
  const sec = findSection(text);
  if (sec.kind === "broken") fail(2, `section markers in AGENTS.md are broken: ${sec.reason}. Fix by hand, then rerun`);

  if (opts.level !== null && !/^\d+$/.test(opts.level)) fail(2, `level is a number 0..${MAX_LEVEL}, not "${opts.level}"`);
  if (opts.date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(opts.date)) fail(2, `date is YYYY-MM-DD, not "${opts.date}"`);

  // No markers means nothing to compare — that's "no section" (exit code 1), not a run error:
  // that way --check answers the same on a repository that hasn't adopted the section yet.
  if (opts.check && sec.kind === "none") {
    console.log("No rules section in AGENTS.md (no house-rules:begin markers).");
    process.exit(1);
  }

  const argLevel = opts.level === null ? null : Number(opts.level);
  const level = argLevel ?? (sec.kind === "ok" ? sec.level : null);
  const date = opts.date ?? (sec.kind === "ok" ? sec.date : null);
  if (level === null) fail(2, "no markers yet — give a level: --level N");
  if (level === 0) fail(2, "level 0 carries no common rules — no section to write");
  if (level < 1 || level > MAX_LEVEL) fail(2, `there is no level ${level}: levels run 1..${MAX_LEVEL}`);
  if (date === null) fail(2, "no markers yet — give the date applied: --date YYYY-MM-DD");

  let fresh;
  try {
    fresh = renderSection(rulesText, level, date);
  } catch (e) {
    fail(2, `source doesn't assemble: ${e.message}`);
  }

  const handEdited = sec.kind === "ok" && fingerprint(sec.body) !== sec.fp;
  const levelMismatch = sec.kind === "ok" && argLevel !== null && argLevel !== sec.level;

  if (opts.check) {
    if (levelMismatch) {
      console.log(`Marker has level ${sec.level}, asked for ${argLevel} — they disagree.`);
      process.exit(1);
    }
    if (handEdited) {
      console.log("Rules section in AGENTS.md was hand-edited (fingerprint doesn't match the body).");
      process.exit(1);
    }
    if (sec.text !== fresh) {
      console.log(`Rules section in AGENTS.md is stale (level ${level}, applied ${sec.date}).`);
      process.exit(1);
    }
    console.log(`Rules section in AGENTS.md is fresh (level ${level}, applied ${sec.date}).`);
    process.exit(0);
  }

  if (levelMismatch && !opts.force) {
    console.log(
      `Marker has level ${sec.level}, asked for ${argLevel}. Not regenerating silently: a repository's ` +
        `level is a decision, not a typo. If it really changed, rerun with --force.`
    );
    process.exit(1);
  }
  if (handEdited && !opts.force) {
    console.log("Rules section in AGENTS.md was hand-edited — wrote nothing.");
    console.log("Current body vs. the new one (- present now and would be lost, + would appear):");
    console.log(lineDiff(sec.body, renderBody(rulesText, level)));
    console.log("\nMove project-specific text OUTSIDE the markers, then rerun with --force — edits inside the markers will be lost.");
    process.exit(1);
  }

  let next;
  if (sec.kind === "none") {
    const sep = text.length === 0 ? "" : text.endsWith("\n\n") ? "" : text.endsWith("\n") ? "\n" : "\n\n";
    next = `${text}${sep}${fresh}\n`;
  } else {
    next = text.slice(0, sec.start) + fresh + text.slice(sec.end);
  }

  if (next === text) {
    console.log(`Rules section in AGENTS.md is fresh (level ${level}, applied ${date}) — changed nothing.`);
    process.exit(0);
  }
  fs.writeFileSync(agentsPath, next, "utf8");
  if (sec.kind === "none") console.log(`Rules section inserted at the end of AGENTS.md: level ${level}, applied ${date}.`);
  else console.log(`Rules section in AGENTS.md updated: level ${level}, applied ${date}.`);
  if (handEdited) console.log("⚠️ Hand edit inside the markers was overwritten by --force.");
  if (levelMismatch) console.log(`⚠️ Level changed by --force: was ${sec.level}, now ${level}.`);
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
