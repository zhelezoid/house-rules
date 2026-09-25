#!/usr/bin/env node
// "Check for a rules update" — one command instead of reading through documents by hand.
//
// Answers two questions at once:
//   1. has the "Working rules" section in AGENTS.md fallen behind the source, or was it hand-edited;
//   2. what landed in CHANGELOG.md after the `applied` date in the section's marker, with a
//      "For adopters:" line per entry — what to actually do about it.
//
// Why not `git log`: commit history of the source answers "what changed", not "what does this
// change for me". This command is the comparison that catches rules quietly falling behind.
//
// The base date — where "new" is measured from — comes from one place only: the
// `<!-- house-rules:begin … applied=YYYY-MM-DD … -->` marker in AGENTS.md. No section, nothing
// to compare against: only entries with `Applies to: all` are shown (their whole point is to get
// a repository to adopt the section in the first place).
//
// Run from any repository:
//   node bin/what-changed.mjs [path-to-repository]
// Exit code: 0 — fresh (or no section at all — nothing to flag, this repository may legitimately
// not use house-rules); 1 — there's something to pull in, the section is stale/edited, or the
// markers are broken.
// The source path for the section can be swapped with AGENTS_MD_RULES, the journal path with
// WHAT_CHANGED_CHANGELOG — for tests and one-off comparisons only.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sectionStatus, STATE_EDITED, STATE_STALE } from "./agents-md.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHANGELOG = process.env.WHAT_CHANGED_CHANGELOG || path.join(HERE, "..", "CHANGELOG.md");

// The path comes from a positional argument. Anything starting with a dash is NOT a path — a
// familiar `--repo <path>` form would otherwise silently land in argv[2] as the literal string
// "--repo", the tool would look at the current directory and confidently answer "no rules here"
// where there are some. That answer would sound like a fact when it's really "I didn't
// understand you", quietly defeating the whole freshness check.
const rawArg = process.argv[2];
if (rawArg && rawArg.startsWith("-")) {
  console.error(
    `what-changed: unknown flag "${rawArg}". The repository path is passed without a flag:\n` +
      `  node bin/what-changed.mjs <path to repository>\n` +
      `No argument means the current directory.`
  );
  process.exit(2);
}
const repo = path.resolve(rawArg || process.cwd());

// Journal parsing — see the field layout documented at the top of CHANGELOG.md.
function readChangelogEntries() {
  const entries = [];
  for (const block of fs.readFileSync(CHANGELOG, "utf8").split(/^## /m).slice(1)) {
    const [head, ...rest] = block.split("\n");
    const m = head.match(/^(\d{4}-\d{2}-\d{2})\s*·\s*(.+)$/);
    if (!m) continue;
    const body = rest.join("\n");
    const docs = (body.match(/\*\*Documents:\*\*\s*(.+)/) || [])[1] || "";
    const scope = (body.match(/\*\*Applies to:\*\*\s*(.+)/) || [])[1] || "";
    const todo = (body.match(/\*\*For adopters:\*\*\s*([\s\S]*?)(?=\n##|\n$|$)/) || [])[1] || "";
    entries.push({
      date: m[1],
      title: m[2].trim(),
      docs: docs.trim(),
      scope: scope.trim(),
      todo: todo.trim().replace(/\s+/g, " "),
    });
  }
  return entries;
}

function printEntry(e) {
  console.log(`  ${e.date} · ${e.title}`);
  if (e.docs) console.log(`     documents: ${e.docs}`);
  if (e.scope) console.log(`     applies to: ${e.scope}`);
  if (e.todo) console.log(`     for adopters: ${e.todo}`);
  console.log("");
}

// An entry "applies to all" is one where the field starts with the word "all" (case-insensitive).
// It's the one entry that has to reach a repository even without a section — its whole point is
// to get the repository to adopt the section in the first place.
const isScopedAll = (e) => /^all/i.test(e.scope);

const section = sectionStatus(repo);
if (section.kind === "broken") {
  console.log(`Rules section markers in AGENTS.md are broken: ${section.reason}.`);
  console.log("Nothing to compare until the markers are fixed by hand: exactly one begin/end pair.");
  process.exit(1);
}
if (section.kind === "ok") {
  const base = section.date;
  console.log(`Repository: ${path.basename(repo)} · rules section in AGENTS.md: level ${section.level}, applied ${base}`);
  const sectionNotes = [];
  if (section.state === STATE_STALE) {
    sectionNotes.push(
      "Rules section in AGENTS.md has fallen behind the source. Regenerate: " +
        `node bin/agents-md.mjs ${repo}`
    );
  } else if (section.state === STATE_EDITED) {
    sectionNotes.push(
      "Rules section in AGENTS.md was hand-edited (fingerprint doesn't match the body) — the edit will " +
        "be lost on the next update; move project-specific text OUTSIDE the markers."
    );
  } else if (section.sourceUnavailable) {
    sectionNotes.push("No source for the section — nothing to compare the section against (that's not \"fresh\").");
  }
  const fresh = readChangelogEntries().filter((e) => e.date > base);
  if (!sectionNotes.length && !fresh.length) {
    console.log("✓ rules section is fresh, no new rules");
    process.exit(0);
  }
  for (const n of sectionNotes) console.log(`\n${n}`);
  if (fresh.length) {
    console.log(`\nLanded after ${base} — ${fresh.length} ${fresh.length === 1 ? "entry" : "entries"}:\n`);
    for (const e of fresh) printEntry(e);
  }
  console.log("Pull it in: /house-rules:update");
  process.exit(1);
}

// No section at all: only entries that apply to everyone, no base date — better to reread too
// much than to miss the one entry meant to reach every repository.
console.log("No rules section in AGENTS.md (no house-rules:begin markers).");
console.log("That's not a defect: a repository can legitimately run without house-rules.");
const scopedAll = readChangelogEntries().filter(isScopedAll);
if (scopedAll.length) {
  console.log(`\nApplies to all repositories: ${scopedAll.length}\n`);
  for (const e of scopedAll) printEntry(e);
}
process.exit(0);
