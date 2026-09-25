#!/usr/bin/env node
// Self-test for bin/agents-md.mjs — the generator for the "Working rules" section in AGENTS.md.
//
// Everything runs in temp directories (fs.mkdtempSync): the source is a fixture passed through
// AGENTS_MD_RULES, the target repository is a sandbox with its own AGENTS.md. The real rules.md
// and real repositories are never read.
//
// Proof by mutation happens in the same run: for each mutation, the generator is copied to a
// temp directory, one spot is broken in the copy, and the scenario guarding that spot is
// required to turn red. The live bin/agents-md.mjs is never mutated.
//
// Run: node bin/agents-md.self-test.mjs
// Output: OK <case> / FAIL <case>: <reason>, ending with "passed N of M", exit code 0/1.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOOL = path.join(HERE, "agents-md.mjs");
// os.tmpdir() is a symlink on macOS; without realpath, `import.meta.url === file://argv[1]`
// wouldn't match in the copied tool and main() would silently never run (same trick used by the
// other self-tests here).
const tmpRoot = fs.realpathSync(os.tmpdir());

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

const RULES = [
  "<!-- Preamble for whoever edits the source: does not make it into the section. PREAMBLE-MARKER -->",
  "",
  "## Level 1 — specs",
  "",
  "- rule-one-a",
  "- rule-one-b",
  "",
  "## Level 2 — tests",
  "",
  "- rule-two",
  "",
  "## Level 3 — no single owner",
  "",
  "- rule-three",
  "",
  "## Level 4 — multiple executors",
  "",
  "- rule-four",
  "",
].join("\n");

const PROJECT_BEFORE = "# Project\r\n\r\nProject rule BEFORE the section.  \n\n";
const PROJECT_AFTER = "\n\n## Own\n\nProject rule AFTER the section.\n";

let seq = 0;
function sandbox(label) {
  const dir = path.join(SANDBOX, `${label}-${seq++}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function makeRules(dir, text = RULES) {
  const p = path.join(dir, "rules.md");
  fs.writeFileSync(p, text, "utf8");
  return p;
}

function makeRepo(dir, agentsText) {
  const repo = path.join(dir, "repo");
  fs.mkdirSync(repo, { recursive: true });
  if (agentsText !== null) fs.writeFileSync(path.join(repo, "AGENTS.md"), agentsText, "utf8");
  return repo;
}

function run(tool, rulesPath, args) {
  const res = spawnSync(process.execPath, [tool, ...args], {
    encoding: "utf8",
    env: { ...process.env, AGENTS_MD_RULES: rulesPath },
  });
  return { ...res, out: `${res.stdout}${res.stderr}` };
}

const readAgents = (repo) => fs.readFileSync(path.join(repo, "AGENTS.md"), "utf8");

// ---- scenarios: each takes a path to the generator (live or mutant) ------------------------

const scenarios = {
  "insert-at-end-of-agents-without-markers": (tool) => {
    const d = sandbox("insert");
    const rules = makeRules(d);
    const repo = makeRepo(d, "# Project\n\nOwn.\n");
    const res = run(tool, rules, [repo, "--level", "1", "--date", "2026-09-24"]);
    const text = readAgents(repo);
    return (
      expect(res.status === 0, "exit 0", `exit ${res.status}\n${res.out}`) ||
      expect(text.startsWith("# Project\n\nOwn.\n\n<!-- house-rules:begin level=1 applied=2026-09-24 fingerprint="), "section appended after a blank line", text) ||
      expect(text.includes("\n## Working rules\n") && text.includes("### Level 1 — specs"), "section title and demoted level heading", text) ||
      expect(text.endsWith("<!-- house-rules:end -->\n"), "file ends with the closing marker", text) ||
      expect(!text.includes("PREAMBLE-MARKER"), "source preamble didn't leak into the section", text)
    );
  },

  "repeat-run-is-byte-for-byte-idempotent": (tool) => {
    const d = sandbox("idem");
    const rules = makeRules(d);
    const repo = makeRepo(d, "# Project\n");
    const r1 = run(tool, rules, [repo, "--level", "2", "--date", "2026-09-24"]);
    const after1 = readAgents(repo);
    const r2 = run(tool, rules, [repo]);
    const after2 = readAgents(repo);
    return (
      expect(r1.status === 0 && r2.status === 0, "both runs exit 0", `${r1.status}/${r2.status}\n${r2.out}`) ||
      expect(after1 === after2, "second run changed nothing", `${after1}\n---\n${after2}`)
    );
  },

  "level-2-carries-1-and-2-but-not-3": (tool) => {
    const d = sandbox("level2");
    const rules = makeRules(d);
    const repo = makeRepo(d, "# Project\n");
    const res = run(tool, rules, [repo, "--level", "2", "--date", "2026-09-24"]);
    const text = readAgents(repo);
    const i1 = text.indexOf("rule-one-a");
    const i2 = text.indexOf("rule-two");
    return (
      expect(res.status === 0, "exit 0", `exit ${res.status}\n${res.out}`) ||
      expect(i1 !== -1 && i2 !== -1 && i1 < i2, "levels 1 and 2 present, in order", text) ||
      expect(!text.includes("rule-three") && !text.includes("rule-four"), "levels 3 and 4 absent", text)
    );
  },

  "hand-edit-exit-1-and-file-untouched": (tool) => {
    const d = sandbox("handedit");
    const rules = makeRules(d);
    const repo = makeRepo(d, "# Project\n");
    run(tool, rules, [repo, "--level", "2", "--date", "2026-09-24"]);
    const edited = readAgents(repo).replace("rule-two", "rule-two HAND-EDIT");
    fs.writeFileSync(path.join(repo, "AGENTS.md"), edited, "utf8");
    // The source moved on too — so there's something to write, not "nothing to change".
    fs.writeFileSync(rules, RULES.replace("rule-one-b", "rule-one-b-new"), "utf8");
    const res = run(tool, rules, [repo]);
    return (
      expect(res.status === 1, "exit 1 — a hand edit is not touched without --force", `exit ${res.status}\n${res.out}`) ||
      expect(readAgents(repo) === edited, "file unchanged byte for byte", readAgents(repo)) ||
      expect(res.out.includes("hand-edited"), 'says "hand-edited"', res.out) ||
      expect(res.out.includes("HAND-EDIT"), "names the line that would be lost", res.out)
    );
  },

  "force-overwrites-the-edit-and-names-it": (tool) => {
    const d = sandbox("force");
    const rules = makeRules(d);
    const repo = makeRepo(d, "# Project\n");
    run(tool, rules, [repo, "--level", "2", "--date", "2026-09-24"]);
    const clean = readAgents(repo);
    fs.writeFileSync(path.join(repo, "AGENTS.md"), clean.replace("rule-two", "rule-two EDIT"), "utf8");
    const res = run(tool, rules, [repo, "--force"]);
    return (
      expect(res.status === 0, "exit 0", `exit ${res.status}\n${res.out}`) ||
      expect(readAgents(repo) === clean, "section restored from the source", readAgents(repo)) ||
      expect(res.out.includes("overwritten by --force"), "report names the overwritten hand edit", res.out)
    );
  },

  "check-0-on-fresh-1-on-stale-and-writes-nothing": (tool) => {
    const d = sandbox("check");
    const rules = makeRules(d);
    const repo = makeRepo(d, "# Project\n");
    const r0 = run(tool, rules, [repo, "--check"]);
    run(tool, rules, [repo, "--level", "3", "--date", "2026-09-24"]);
    const fresh = run(tool, rules, [repo, "--check"]);
    fs.writeFileSync(rules, RULES.replace("rule-three", "rule-three-new"), "utf8");
    const before = readAgents(repo);
    const stale = run(tool, rules, [repo, "--check"]);
    return (
      expect(r0.status === 1, "no markers — --check exit 1", `exit ${r0.status}\n${r0.out}`) ||
      expect(fresh.status === 0, "fresh section — --check exit 0", `exit ${fresh.status}\n${fresh.out}`) ||
      expect(stale.status === 1, "source moved on — --check exit 1", `exit ${stale.status}\n${stale.out}`) ||
      expect(stale.out.includes("stale"), 'says "stale"', stale.out) ||
      expect(readAgents(repo) === before, "--check wrote nothing", readAgents(repo))
    );
  },

  "level-in-argument-disagrees-with-marker": (tool) => {
    const d = sandbox("mismatch");
    const rules = makeRules(d);
    const repo = makeRepo(d, "# Project\n");
    run(tool, rules, [repo, "--level", "2", "--date", "2026-09-24"]);
    const before = readAgents(repo);
    const res = run(tool, rules, [repo, "--level", "3"]);
    return (
      expect(res.status === 1, "exit 1", `exit ${res.status}\n${res.out}`) ||
      expect(res.out.includes("level 2") && res.out.includes("3"), "names the level mismatch", res.out) ||
      expect(readAgents(repo) === before, "file unchanged", readAgents(repo))
    );
  },

  "no-agents-md-fails-2": (tool) => {
    const d = sandbox("noagents");
    const rules = makeRules(d);
    const repo = makeRepo(d, null);
    const res = run(tool, rules, [repo, "--level", "1", "--date", "2026-09-24"]);
    return (
      expect(res.status === 2, "exit 2", `exit ${res.status}\n${res.out}`) ||
      expect(!fs.existsSync(path.join(repo, "AGENTS.md")), "AGENTS.md not created", "created")
    );
  },

  "broken-markers-fail-2": (tool) => {
    const d = sandbox("broken");
    const rules = makeRules(d);
    const problems = [];
    const variants = {
      "begin-without-end": "# P\n\n<!-- house-rules:begin level=1 applied=2026-09-24 fingerprint=abc -->\ntext\n",
      "two-pairs":
        "<!-- house-rules:begin level=1 applied=2026-09-24 fingerprint=abc -->\n<!-- w -->\nx\n<!-- house-rules:end -->\n" +
        "<!-- house-rules:begin level=1 applied=2026-09-24 fingerprint=abc -->\n<!-- w -->\nx\n<!-- house-rules:end -->\n",
    };
    for (const [name, text] of Object.entries(variants)) {
      const repo = makeRepo(path.join(d, name), text);
      const res = run(tool, rules, [repo, "--level", "1", "--date", "2026-09-24"]);
      const bad = expect(res.status === 2, `${name}: exit 2`, `exit ${res.status}\n${res.out}`) ||
        expect(readAgents(repo) === text, `${name}: file unchanged`, readAgents(repo));
      if (bad) problems.push(bad);
    }
    return problems.length ? problems.join("; ") : null;
  },

  "level-0-refused": (tool) => {
    const d = sandbox("level0");
    const rules = makeRules(d);
    const text = "# Project\n";
    const repo = makeRepo(d, text);
    const res = run(tool, rules, [repo, "--level", "0", "--date", "2026-09-24"]);
    return (
      expect(res.status === 2, "exit 2", `exit ${res.status}\n${res.out}`) ||
      expect(res.out.includes("level 0 carries no common rules"), 'says "level 0 carries no common rules"', res.out) ||
      expect(readAgents(repo) === text, "file unchanged", readAgents(repo))
    );
  },

  "project-text-before-and-after-section-untouched-byte-for-byte": (tool) => {
    const d = sandbox("project");
    const rules = makeRules(d);
    // The section is written first, then project text with CRLF and trailing spaces is wrapped
    // around it; the source moves on, the section regenerates.
    const repo = makeRepo(d, "");
    run(tool, rules, [repo, "--level", "2", "--date", "2026-09-01"]);
    const section = readAgents(repo).replace(/\n$/, "");
    fs.writeFileSync(path.join(repo, "AGENTS.md"), PROJECT_BEFORE + section + PROJECT_AFTER, "utf8");
    fs.writeFileSync(rules, RULES.replace("rule-two", "rule-two-new"), "utf8");
    const res = run(tool, rules, [repo, "--date", "2026-09-24"]);
    const text = readAgents(repo);
    return (
      expect(res.status === 0, "exit 0", `exit ${res.status}\n${res.out}`) ||
      expect(text.startsWith(PROJECT_BEFORE), "text BEFORE the section intact byte for byte", JSON.stringify(text.slice(0, 80))) ||
      expect(text.endsWith(PROJECT_AFTER), "text AFTER the section intact byte for byte", JSON.stringify(text.slice(-80))) ||
      expect(text.includes("rule-two-new") && text.includes("applied=2026-09-24"), "section updated", text)
    );
  },
};

// ---- mutations: {what breaks, exact line in the generator, replacement, which scenario turns red} -

const mutations = [
  {
    name: "hand edit no longer stops the write",
    find: "if (handEdited && !opts.force) {",
    replace: "if (false) {",
    scenario: "hand-edit-exit-1-and-file-untouched",
  },
  {
    name: "--force doesn't overwrite",
    find: "if (next === text) {",
    replace: "if (next === text || opts.force) {",
    scenario: "force-overwrites-the-edit-and-names-it",
  },
  {
    name: "level filter removed — takes all of them",
    find: "for (let lvl = 1; lvl <= level; lvl++) {",
    replace: "for (let lvl = 1; lvl <= MAX_LEVEL; lvl++) {",
    scenario: "level-2-carries-1-and-2-but-not-3",
  },
  {
    name: "section replacement loses surrounding project text",
    find: "next = text.slice(0, sec.start) + fresh + text.slice(sec.end);",
    replace: "next = fresh + \"\\n\";",
    scenario: "project-text-before-and-after-section-untouched-byte-for-byte",
  },
  {
    name: "with markers present, section is appended instead of replaced",
    find: "next = text.slice(0, sec.start) + fresh + text.slice(sec.end);",
    replace: "next = `${text}\\n${fresh}\\n`;",
    scenario: "repeat-run-is-byte-for-byte-idempotent",
  },
  {
    name: "--check always green",
    find: "if (sec.text !== fresh) {",
    replace: "if (false) {",
    scenario: "check-0-on-fresh-1-on-stale-and-writes-nothing",
  },
  {
    name: "level mismatch with marker goes unnoticed",
    find: "const levelMismatch = sec.kind === \"ok\" && argLevel !== null && argLevel !== sec.level;",
    replace: "const levelMismatch = false;",
    scenario: "level-in-argument-disagrees-with-marker",
  },
  {
    name: "no AGENTS.md — creates an empty one instead of refusing",
    find: "if (!fs.existsSync(agentsPath)) fail(2,",
    replace: "if (!fs.existsSync(agentsPath)) fs.writeFileSync(agentsPath, \"\"); if (false) fail(2,",
    scenario: "no-agents-md-fails-2",
  },
  {
    name: "broken markers go unrecognized",
    find: "if (begins.length !== 1 || ends.length !== 1) {",
    replace: "if (false) {",
    scenario: "broken-markers-fail-2",
  },
  {
    name: "level 0 accepted",
    find: "if (level === 0) fail(2,",
    replace: "if (false) fail(2,",
    scenario: "level-0-refused",
  },
  {
    name: "source preamble leaks into the section",
    find: "if (current !== null) levels[current].push(line);",
    replace: "if (current !== null) levels[current].push(line); else (levels[1] ??= []).push(line);",
    scenario: "insert-at-end-of-agents-without-markers",
  },
];

const SANDBOX = fs.mkdtempSync(path.join(tmpRoot, "agents-md-self-test-"));

try {
  for (const [name, fn] of Object.entries(scenarios)) runCase(name, () => fn(TOOL));

  const liveBefore = fs.readFileSync(TOOL, "utf8");
  for (const [i, m] of mutations.entries()) {
    runCase(`mutation ${i + 1}/${mutations.length}: ${m.name} -> reddens "${m.scenario}"`, () => {
      if (!liveBefore.includes(m.find)) {
        return `mutation target not found in agents-md.mjs — update the self-test together with the generator: ${m.find}`;
      }
      const mutDir = sandbox("mutant");
      const mutTool = path.join(mutDir, "agents-md.mjs");
      fs.writeFileSync(mutTool, liveBefore.replace(m.find, m.replace), "utf8");
      const problem = scenarios[m.scenario](mutTool);
      return problem ? null : "mutant passed the scenario without complaint — the check can't turn red";
    });
  }
  runCase("live-generator-untouched-by-mutations", () =>
    expect(fs.readFileSync(TOOL, "utf8") === liveBefore, "bin/agents-md.mjs unchanged byte for byte", "changed")
  );
} finally {
  fs.rmSync(SANDBOX, { recursive: true, force: true });
}

console.log(`\npassed ${passed} of ${total}`);
process.exit(passed === total ? 0 : 1);
