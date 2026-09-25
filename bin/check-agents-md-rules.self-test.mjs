#!/usr/bin/env node
// Self-test for bin/check-agents-md-rules.mjs — the guard for the "Working rules" section source.
//
// The source is a fixture passed through AGENTS_MD_RULES in a temp directory; the real rules.md
// is never read. Proof by mutation runs in the same pass: a copy of bin/ in a temp directory, one
// check broken in the copy, and the scenario guarding it is required to turn red.
//
// Run: node bin/check-agents-md-rules.self-test.mjs

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(HERE, "..");
const GUARD = path.join(HERE, "check-agents-md-rules.mjs");
const tmpRoot = fs.realpathSync(os.tmpdir()); // see the note in agents-md.self-test.mjs

let total = 0;
let passed = 0;

function runCase(name, fn) {
  total++;
  try {
    const problem = fn();
    if (!problem) {
      passed++;
      console.log(`OK ${name}`);
    } else {
      console.log(`FAIL ${name}: ${problem}`);
    }
  } catch (e) {
    console.log(`FAIL ${name}: exception — ${e.message}`);
  }
}

function expect(cond, expectedDesc, actualDesc) {
  return cond ? null : `expected ${expectedDesc}, got: ${actualDesc}`;
}

const SANDBOX = fs.mkdtempSync(path.join(tmpRoot, "check-agents-md-rules-self-test-"));
let seq = 0;

/** A source of four levels, padded with rule lines to exactly `lines` lines. */
function rulesText(lines, { skipLevel = null } = {}) {
  const out = ["<!-- preamble -->"];
  for (let lvl = 1; lvl <= 4; lvl++) {
    if (lvl !== skipLevel) out.push("", `## Level ${lvl} — section`, "", `- rule ${lvl}`);
  }
  while (out.length < lines) out.push(`- filler ${out.length}`);
  return out.join("\n") + "\n";
}

function run(guard, text) {
  const p = path.join(SANDBOX, `rules-${seq++}.md`);
  if (text !== null) fs.writeFileSync(p, text, "utf8");
  const res = spawnSync(process.execPath, [guard], { encoding: "utf8", env: { ...process.env, AGENTS_MD_RULES: p } });
  return { ...res, out: `${res.stdout}${res.stderr}` };
}

const scenarios = {
  "healthy-source-is-green": (g) => {
    const r = run(g, rulesText(40));
    return expect(r.status === 0, "exit 0", `exit ${r.status}\n${r.out}`);
  },
  "exactly-120-lines-and-trailing-blanks-dont-count": (g) => {
    const r = run(g, rulesText(120) + "\n\n\n");
    return expect(r.status === 0, "exit 0 at the ceiling", `exit ${r.status}\n${r.out}`);
  },
  "121-lines-turns-red": (g) => {
    const r = run(g, rulesText(121));
    return (
      expect(r.status === 1, "exit 1", `exit ${r.status}\n${r.out}`) ||
      expect(r.out.includes("121 lines"), "names the line count", r.out)
    );
  },
  "missing-level-3-turns-red": (g) => {
    const r = run(g, rulesText(30, { skipLevel: 3 }));
    return (
      expect(r.status === 1, "exit 1", `exit ${r.status}\n${r.out}`) ||
      expect(r.out.includes("Level 3"), "names the missing level", r.out)
    );
  },
  "missing-file-turns-red": (g) => {
    const r = run(g, null);
    return (
      expect(r.status === 1, "exit 1", `exit ${r.status}\n${r.out}`) ||
      expect(r.out.includes("no source file"), 'says "no source file"', r.out)
    );
  },
};

const mutations = [
  { name: "ceiling raised", find: "export const MAX_LINES = 120;", replace: "export const MAX_LINES = 1200;", scenario: "121-lines-turns-red" },
  {
    name: "ceiling boundary shifted by one line",
    find: "if (lines > MAX_LINES) {",
    replace: "if (lines >= MAX_LINES) {",
    scenario: "exactly-120-lines-and-trailing-blanks-dont-count",
  },
  {
    name: "level check removed",
    find: "if (levels[lvl] === undefined) problems.push",
    replace: "if (false) problems.push",
    scenario: "missing-level-3-turns-red",
  },
  {
    name: "missing file counted as fine",
    find: "if (text === null) return [`no source file: ${rulesPath()}`];",
    replace: "if (text === null) return [];",
    scenario: "missing-file-turns-red",
  },
];

try {
  for (const [name, fn] of Object.entries(scenarios)) runCase(name, () => fn(GUARD));

  const live = fs.readFileSync(GUARD, "utf8");
  for (const [i, m] of mutations.entries()) {
    runCase(`mutation ${i + 1}/${mutations.length}: ${m.name} -> reddens "${m.scenario}"`, () => {
      if (!live.includes(m.find)) return `mutation target not found in the guard: ${m.find}`;
      const mutBin = path.join(SANDBOX, `mutant-${i}`, "bin");
      fs.cpSync(path.join(REPO_ROOT, "bin"), mutBin, { recursive: true });
      // check-agents-md-rules.mjs imports its neighbor two levels up in the real tree
      // (plugins/house-rules/bin/agents-md.mjs) — the mutant copy needs that neighbor at the same
      // relative spot, or the import itself fails before the mutation is ever exercised.
      const mutPluginBin = path.join(SANDBOX, `mutant-${i}`, "plugins", "house-rules", "bin");
      fs.cpSync(path.join(REPO_ROOT, "plugins", "house-rules", "bin"), mutPluginBin, { recursive: true });
      const mutGuard = path.join(mutBin, "check-agents-md-rules.mjs");
      fs.writeFileSync(mutGuard, live.replace(m.find, m.replace), "utf8");
      return scenarios[m.scenario](mutGuard) ? null : "mutant passed the scenario — the check can't turn red";
    });
  }
} finally {
  fs.rmSync(SANDBOX, { recursive: true, force: true });
}

console.log(`\npassed ${passed} of ${total}`);
process.exit(passed === total ? 0 : 1);
