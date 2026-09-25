#!/usr/bin/env node
// Guard for staying public: this repository ships in the open, so nothing in it may carry
// anything private. Scans every git-tracked file, plus every untracked file git wouldn't ignore,
// for four things that don't belong in a public repository:
//   - any character from a non-Latin script (Cyrillic, Greek, Armenian, Hebrew, Arabic, CJK,
//     Hangul, and similar) — docs here are English-only, and a stray one means a document or
//     fixture wasn't translated. Emoji and typographic punctuation (em dash, curly quotes,
//     ellipsis, arrows) are NOT script characters and stay allowed;
//   - any email address, except one containing "noreply" (a real person's address, not a
//     no-reply bot address);
//   - any IPv4 address, except 127.0.0.1 and 0.0.0.0 (a real server address, not a loopback or
//     wildcard used as a generic example);
//   - the literal path prefix that names a personal home directory on the machine this repo was
//     built on.
//
// This is a blunt, mechanical net, not a judgment call — it's meant to catch what a careful
// translation might still miss, not to replace the translation itself.
//
// Run: node bin/check-public-clean.mjs
// Exit 1 — at least one hit, printed as file:line, one per line.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// Non-Latin alphabetic/logographic scripts that have no business in an English-only public
// repository, as Unicode block ranges — not "everything except Latin": that broader net would
// also catch emoji and typographic punctuation (em dash, curly quotes, ellipsis, arrows), which
// are meant to stay allowed. Built from code points, not a regex character class with a literal
// escape: writing the escape as source text risks it being decoded into an actual character from
// one of these scripts by some tool along the way, which would defeat the whole point of this
// check by planting the very thing it hunts for. Not exhaustive of every script that exists — it
// covers the ones a translation from this project's own source could plausibly leave behind, plus
// the other major non-Latin scripts, as a wide net.
const NON_LATIN_SCRIPT_RANGES = [
  [0x0370, 0x03ff], // Greek and Coptic
  [0x0400, 0x04ff], // Cyrillic
  [0x0500, 0x052f], // Cyrillic Supplement
  [0x0530, 0x058f], // Armenian
  [0x0590, 0x05ff], // Hebrew
  [0x0600, 0x06ff], // Arabic
  [0x0750, 0x077f], // Arabic Supplement
  [0x08a0, 0x08ff], // Arabic Extended-A
  [0x1100, 0x11ff], // Hangul Jamo
  [0x1f00, 0x1fff], // Greek Extended
  [0x2de0, 0x2dff], // Cyrillic Extended-A
  [0x3040, 0x309f], // Hiragana
  [0x30a0, 0x30ff], // Katakana
  [0x3400, 0x4dbf], // CJK Unified Ideographs Extension A
  [0x4e00, 0x9fff], // CJK Unified Ideographs
  [0xa640, 0xa69f], // Cyrillic Extended-B
  [0xac00, 0xd7a3], // Hangul Syllables
  [0xf900, 0xfaff], // CJK Compatibility Ideographs
  [0xfb1d, 0xfb4f], // Hebrew presentation forms
  [0xfb50, 0xfdff], // Arabic Presentation Forms-A
  // Arabic Presentation Forms-B stops at 0xfefc, not the block's nominal 0xfeff: U+FEFF itself is
  // the zero-width no-break space / byte-order mark, a format character, not an Arabic ligature —
  // agents-md.mjs strips exactly that BOM from a file it reads, and it must not be flagged here.
  [0xfe70, 0xfefc], // Arabic Presentation Forms-B
];
const hasNonLatinScript = (text) => {
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (NON_LATIN_SCRIPT_RANGES.some(([start, end]) => cp >= start && cp <= end)) return true;
  }
  return false;
};
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const IPV4_RE = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g;
const ALLOWED_IPV4 = new Set(["127.0.0.1", "0.0.0.0"]);
// Built by concatenation on purpose: the literal three-piece string is the very thing this guard
// hunts for, so it must not sit whole in the guard's own source — or the guard would flag itself.
const HOME_PATH_PREFIX = "/" + "Users" + "/";

/** Complaints about a single line of text; empty array means the line is clean. Pure, no disk. */
export function scanLine(line) {
  const problems = [];
  if (hasNonLatinScript(line)) problems.push("non-Latin script character");
  for (const m of line.matchAll(EMAIL_RE)) {
    if (!m[0].toLowerCase().includes("noreply")) problems.push(`email address: ${m[0]}`);
  }
  for (const m of line.matchAll(IPV4_RE)) {
    if (!ALLOWED_IPV4.has(m[0])) problems.push(`IPv4 address: ${m[0]}`);
  }
  if (line.includes(HOME_PATH_PREFIX)) problems.push(`"${HOME_PATH_PREFIX}" path`);
  return problems;
}

/** Files to scan: everything git tracks, plus untracked files git wouldn't ignore. */
function listFiles(root) {
  const tracked = execFileSync("git", ["-C", root, "ls-files"], { encoding: "utf8" })
    .split("\n").filter(Boolean);
  const untracked = execFileSync("git", ["-C", root, "ls-files", "--others", "--exclude-standard"], { encoding: "utf8" })
    .split("\n").filter(Boolean);
  return [...new Set([...tracked, ...untracked])].sort();
}

// A null byte is good enough evidence a file is binary — text files with real content don't
// carry one. Binary files (images, archives) may legitimately live in the repo one day; they
// have nothing readable to scan and no reason to crash the guard.
const isBinary = (buf) => buf.includes(0);

/** Findings for one file, formatted "path:line: problem". Missing/unreadable file: empty array. */
export function scanFile(root, relPath) {
  let buf;
  try {
    buf = fs.readFileSync(path.join(root, relPath));
  } catch {
    return [];
  }
  if (isBinary(buf)) return [];
  const findings = [];
  buf.toString("utf8").split("\n").forEach((line, i) => {
    for (const p of scanLine(line)) findings.push(`${relPath}:${i + 1}: ${p}`);
  });
  return findings;
}

function main() {
  const files = listFiles(ROOT);
  const findings = [];
  for (const f of files) findings.push(...scanFile(ROOT, f));

  if (!findings.length) {
    console.log(`check-public-clean: ${files.length} file(s) scanned, all clean ✓`);
    process.exit(0);
  }

  console.log(`check-public-clean: ${findings.length} problem(s) found in ${files.length} file(s) scanned:`);
  for (const f of findings) console.log(`  ✗ ${f}`);
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
