#!/usr/bin/env node
// Guard for the changelog: an edit inside the plugin must be recorded in CHANGELOG.md.
//
// Why. The changelog is the only thing anyone reads to find out about an update. An edit with no
// entry makes it FALSE, and a false changelog is worse than none: people rely on it as if it were
// checked, and the update silently never arrives.
//
// Run: node bin/check-changes-logged.mjs [--staged | --since <ref>]
//   --staged  — what's staged for commit (for pre-commit)
//   --since   — what changed since the given commit (default HEAD, i.e. the working tree)
// Exit 1 — files under the plugin were touched and there's no entry for today in the changelog.
// Exit 0 — also when there's nothing to compare against yet (a first commit, an all-zero base from
// CI on the very first push): that's not a broken check, it's an empty range.

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const WATCHED_DIR = "plugins/house-rules/";
const CHANGELOG = "plugins/house-rules/CHANGELOG.md";
// GitHub sends this as `github.event.before` on the very first push to a branch — there's no
// commit on the other end of it, so it's not a broken git call, it's an empty range.
const ALL_ZERO_SHA = /^0+$/;

const args = process.argv.slice(2);
const sinceIdx = args.indexOf("--since");
const sinceRef = sinceIdx >= 0 ? args[sinceIdx + 1] : "HEAD";

if (!args.includes("--staged") && ALL_ZERO_SHA.test(sinceRef)) {
  console.log(`check-changes-logged: base "${sinceRef}" is the all-zero sha (first push) — nothing to compare against.`);
  process.exit(0);
}

const range = args.includes("--staged") ? "diff --cached --name-only" : `diff --name-only ${sinceRef}`;

let changed = [];
try {
  changed = execSync(`git -C "${ROOT}" ${range}`, { encoding: "utf8" }).split("\n").filter(Boolean);
  // git diff doesn't show a brand-new file at all. That matters for the changelog: it CAN be
  // added in the same pass as a rule edit — and then "not touched" would be untrue.
  const untracked = execSync(`git -C "${ROOT}" ls-files --others --exclude-standard`, { encoding: "utf8" })
    .split("\n").filter(Boolean);
  changed = [...new Set([...changed, ...untracked])];
} catch (e) {
  // A ref that doesn't resolve (HEAD~1 on a repo with a single commit, a base branch not fetched)
  // means there's nothing to compare against yet, not a broken check — a raw git fatal here would
  // fail the very first commit to this repository for no real reason.
  const msg = String((e && e.stderr) || (e && e.message) || "");
  if (/unknown revision|bad revision|ambiguous argument|fatal: bad object/i.test(msg)) {
    console.log(`check-changes-logged: couldn't resolve "${sinceRef}" — probably the first commit, nothing to compare.`);
    process.exit(0);
  }
  console.error("check-changes-logged: couldn't ask git — nothing to check against");
  process.exit(2);
}

// The changelog itself lives inside WATCHED_DIR too, but it can't be required to name itself.
const rules = changed.filter((f) => f.startsWith(WATCHED_DIR) && f.endsWith(".md") && f !== CHANGELOG);
if (!rules.length) {
  console.log("check-changes-logged: plugin documents not touched — no entry required.");
  process.exit(0);
}

const journalTouched = changed.includes(CHANGELOG);
// The date is LOCAL, not UTC: journal entries are written by a person or a session on their own
// clock, and near midnight in any non-UTC zone the two dates can disagree by a day. A guard that
// compares by UTC would fail for no reason at exactly that hour (caught on itself the first time
// it ran).
const d = new Date();
const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const journal = fs.readFileSync(path.join(ROOT, CHANGELOG), "utf8");
// A weak "is there an entry for today" check is NOT ENOUGH: the changelog might already have an
// entry for the same day about something else, and an edit to any document would pass silently.
// Caught by mutation — deleting the needed entry left the guard green. So the check is by name:
// every touched document must be NAMED in a "Documents:" line of some entry dated today.
const todayBlocks = journal.split(/^## /m).filter((b) => b.startsWith(`${today} · `));
const mentioned = new Set();
for (const b of todayBlocks) {
  // One entry can have several "Documents:" lines (the edit spans multiple sections) — take ALL
  // of them, otherwise a document named on the second line would count as unmentioned.
  for (const line of b.matchAll(/\*\*Documents:\*\*\s*(.+)/g)) {
    for (const m of line[1].matchAll(/`([\w./-]+\.md)`/g)) mentioned.add(m[1]);
  }
}
const missing = rules.map((f) => f.slice(WATCHED_DIR.length)).filter((f) => !mentioned.has(f));
const hasToday = todayBlocks.length > 0 && missing.length === 0;

console.log(`check-changes-logged: plugin documents touched — ${rules.length} (${rules.map((f) => f.slice(WATCHED_DIR.length)).join(", ")}).`);

if (hasToday && journalTouched) {
  console.log(`✓ ${today} entry in ${CHANGELOG} is there`);
  process.exit(0);
}

if (!journalTouched) console.log(`✗ ${CHANGELOG} not touched at all`);
else if (!todayBlocks.length) console.log(`✗ ${CHANGELOG} was edited, but has no entry for ${today}`);
else if (missing.length) console.log(`✗ today's entries don't name a touched document: ${missing.join(", ")}`);
console.log("");
console.log(`Add an entry like:  ## ${today} · short title`);
console.log("With **Documents:** and **For adopters:** lines — the second matters more:");
console.log("it's what a repository pulling in the update actually reads.");
process.exit(1);
