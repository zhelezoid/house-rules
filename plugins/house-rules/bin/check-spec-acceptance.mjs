#!/usr/bin/env node
// Runs the acceptance blocks found in this repository's specs.
//
// Why. Once a repository has specs/ with acceptance points written as executable lines, those
// lines are worthless unless something actually runs them. That's exactly the trap specs/
// conventions warn about: "a check that can't turn red is more dangerous than no check at all."
//
// Understands three commands (nothing else appears in the corpus):
//   file_exists <path>              — the file must exist
//   grep <path> "<string>"          — the string must be present
//   forbid_grep <path> "<string>"   — the string must be absent
// Paths are relative to the repository root; ~ expands to the home directory.
//
// Run: node bin/check-spec-acceptance.mjs [--slot active|done]
// Exit 1 — at least one point failed.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SPECS = path.join(ROOT, "specs");

const resolve = (p) => (p.startsWith("~/") ? path.join(os.homedir(), p.slice(2)) : path.join(ROOT, p));

// Parses a line: command, path, optional quoted string.
function parse(line) {
  const m = line.match(/^(file_exists|grep|forbid_grep)\s+(\S+)(?:\s+"([^"]*)")?\s*$/);
  return m ? { cmd: m[1], file: m[2], needle: m[3] } : null;
}

function run(item) {
  const file = resolve(item.file);
  const exists = fs.existsSync(file);
  if (item.cmd === "file_exists") return exists ? null : `file missing: ${item.file}`;
  if (!exists) return `file missing: ${item.file}`;
  const body = fs.readFileSync(file, "utf8");
  const found = body.includes(item.needle);
  if (item.cmd === "grep") return found ? null : `${item.file} has no line "${item.needle}"`;
  return found ? `${item.file} has the forbidden "${item.needle}"` : null;
}

// A spec in active/ is work that's still GOING ON: its acceptance is legitimately red until it's
// done, and failing the build on that would forbid opening a spec before the work is finished.
// Only closed specs (done) gate the build: a red point there is a regression — something that
// worked stopped working.
let checked = 0;
const failures = [];   // done — fails the build
const pending = [];    // active — printed as "not done yet"
const slots = fs.readdirSync(SPECS, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
for (const slot of slots) {
  for (const f of fs.readdirSync(path.join(SPECS, slot)).filter((x) => x.endsWith(".md")).sort()) {
    const text = fs.readFileSync(path.join(SPECS, slot, f), "utf8");
    for (const block of text.split(/```acceptance\s*\n/).slice(1)) {
      const body = block.split("```")[0];
      for (const raw of body.split("\n")) {
        const line = raw.trim();
        if (!line || line.startsWith("#")) continue;
        const item = parse(line);
        if (!item) { failures.push(`${slot}/${f}: couldn't parse line "${line}"`); continue; }
        checked++;
        const err = run(item);
        if (err) (slot === "done" ? failures : pending).push(`${slot}/${f}: ${err}`);
      }
    }
  }
}

console.log(`Spec acceptance: checked ${checked}, failures in done ${failures.length}, not done yet in active ${pending.length}.`);
if (pending.length) {
  console.log("");
  console.log("Not done yet (a spec in progress is not a failure):");
  for (const p of pending) console.log(`  · ${p}`);
}
if (!failures.length) process.exit(0);
console.log("");
console.log("REGRESSION in closed specs:");
for (const f of failures) console.log(`  ✗ ${f}`);
process.exit(1);
