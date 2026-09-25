#!/usr/bin/env node
// Self-test for bin/what-changed.mjs — "check for a rules update".
//
// Builds a stand-in for the source (plugins/house-rules/rules/rules.md + CHANGELOG.md) and a
// stand-in for a target repository in a temp directory (fs.mkdtempSync), with a section in
// AGENTS.md carrying a marker. Nothing real is touched: the tool is copied into the sandbox
// along with its neighbor (agents-md.mjs), and the whole tree it reads is sandboxed too; the
// section source is substituted through AGENTS_MD_RULES, the journal path through
// WHAT_CHANGED_CHANGELOG.
//
// A date shift in the marker proves the base is taken from there and nowhere else; a code
// mutation separately proves the base can't be swapped for anything else without turning red.
//
// Run: node bin/what-changed.self-test.mjs
// Output: OK <case> / FAIL <case>: <reason>, ending with "passed N of M", exit code 0/1.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { renderSection } from "./agents-md.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(HERE, "..");

// os.tmpdir() is a symlink on macOS; without realpath the copied tool's `import.meta.url ===
// file://argv[1]` check wouldn't match (same trick as the neighboring self-tests).
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

const RULES_V1 = "<!-- preamble -->\n\n## Level 1 — a\n\n- rule-a\n\n## Level 2 — b\n\n- rule-b\n\n" +
  "## Level 3 — c\n\n- rule-c\n\n## Level 4 — d\n\n- rule-d\n";

/** Assembles a sandbox toolDir (copy of bin/ + a fresh source/CHANGELOG.md pair). */
function makeTool(sandbox) {
  const toolDir = path.join(sandbox, "tool");
  fs.mkdirSync(toolDir, { recursive: true });
  fs.cpSync(path.join(REPO_ROOT, "bin"), path.join(toolDir, "bin"), { recursive: true });

  fs.writeFileSync(path.join(toolDir, "CHANGELOG.md"), "# Changelog\n\nEmpty.\n", "utf8");

  const rulesPath = path.join(toolDir, "plugins", "house-rules", "rules", "rules.md");
  fs.mkdirSync(path.dirname(rulesPath), { recursive: true });
  fs.writeFileSync(rulesPath, RULES_V1, "utf8");

  return { toolDir, rulesPath };
}

/** Target repository with a section in AGENTS.md, assembled from RULES_V1, level 2, given date. */
function makeTarget(sandbox, date, { extra = "" } = {}) {
  const targetRepo = path.join(sandbox, "target");
  fs.mkdirSync(targetRepo, { recursive: true });
  fs.writeFileSync(
    path.join(targetRepo, "AGENTS.md"),
    `# Project\n\nOwn.\n\n${renderSection(RULES_V1, 2, date)}\n${extra}`,
    "utf8"
  );
  return targetRepo;
}

function setLabelDate(targetRepo, date) {
  const p = path.join(targetRepo, "AGENTS.md");
  fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace(/applied=\d{4}-\d{2}-\d{2}/, `applied=${date}`), "utf8");
}

function appendChangelogEntry(toolDir, dateStr, title, docs, todo, scope = "") {
  const changelogPath = path.join(toolDir, "CHANGELOG.md");
  const scopeLine = scope ? `**Applies to:** ${scope}\n` : "";
  const entry = `\n## ${dateStr} · ${title}\n\n**Documents:** ${docs}\n${scopeLine}\n**For adopters:** ${todo}\n`;
  fs.appendFileSync(changelogPath, entry, "utf8");
}

/** A bare target repository: no section in AGENTS.md. */
function makeBareTarget(sandbox) {
  const targetRepo = path.join(sandbox, "bare-target");
  fs.mkdirSync(targetRepo, { recursive: true });
  fs.writeFileSync(path.join(targetRepo, "AGENTS.md"), "# Project without a section\n", "utf8");
  return targetRepo;
}

function run(toolDir, targetRepo) {
  return spawnSync(process.execPath, [path.join(toolDir, "bin", "what-changed.mjs"), targetRepo], {
    encoding: "utf8",
    env: { ...process.env, AGENTS_MD_RULES: path.join(toolDir, "plugins", "house-rules", "rules", "rules.md") },
  });
}

/** Two journal entries around the marker date: old (2026-08-15) and new (2026-09-20). */
function appendAroundEntries(toolDir) {
  appendChangelogEntry(toolDir, "2026-08-15", "Old rule", "`rule-doc.md`", "already done.");
  appendChangelogEntry(toolDir, "2026-09-20", "New rule", "`rule-doc.md`", "do this.");
}

/**
 * A marker dated 2026-09-01 between two entries: only the new one is printed. Parameterized by
 * the tool path — the same scenario also runs through a mutant.
 */
function scenarioLabelFiltersByDate(toolDir, scratch) {
  appendAroundEntries(toolDir);
  const targetRepo = makeTarget(scratch, "2026-09-01");
  const res = run(toolDir, targetRepo);
  const forward = (() => {
    setLabelDate(targetRepo, "2026-09-30");
    return run(toolDir, targetRepo);
  })();
  const back = (() => {
    setLabelDate(targetRepo, "2026-08-01");
    return run(toolDir, targetRepo);
  })();
  return (
    expect(res.status === 1, "exit 1 — a rule landed after the marker date", `exit ${res.status}\n${res.stdout}${res.stderr}`) ||
    expect(res.stdout.includes("applied 2026-09-01"), "base is the date from the marker", res.stdout) ||
    expect(res.stdout.includes("New rule"), "entry newer than the marker is printed", res.stdout) ||
    expect(!res.stdout.includes("Old rule"), "entry older than the marker is NOT printed", res.stdout) ||
    expect(forward.status === 0, "date moved forward — exit 0", `exit ${forward.status}\n${forward.stdout}`) ||
    expect(!forward.stdout.includes("New rule"), "date moved forward — entry gone", forward.stdout) ||
    expect(forward.stdout.includes("rules section is fresh"), "date moved forward — \"rules section is fresh\"", forward.stdout) ||
    expect(back.stdout.includes("Old rule") && back.stdout.includes("New rule"), "date moved back — both appear", back.stdout)
  );
}

const sandbox = fs.mkdtempSync(path.join(tmpRoot, "what-changed-self-test-"));

try {
  runCase("no-section-silently-exits-zero", () => {
    const { toolDir } = makeTool(path.join(sandbox, "s1"));
    const targetRepo = makeBareTarget(path.join(sandbox, "s1"));
    const res = run(toolDir, targetRepo);
    return (
      expect(res.status === 0, "exit 0 — a repository can legitimately run without rules", `exit ${res.status}\n${res.stdout}`) ||
      expect(res.stdout.includes("No rules section in AGENTS.md"), 'message "No rules section in AGENTS.md"', res.stdout)
    );
  });

  // A key that isn't a path is an explicit refusal, not a silent swap of the target directory.
  // Previously `--repo <path>` would land in the positional argument as the literal "--repo", the
  // tool would look at the current directory and confidently answer "no rules here" where there
  // are some — "I didn't understand you" passed off as a fact, defeating the whole freshness check.
  runCase("flag-instead-of-path-is-refused-clearly-not-swapped-for-a-directory", () => {
    const { toolDir } = makeTool(path.join(sandbox, "s2"));
    const res = spawnSync(
      process.execPath,
      [path.join(toolDir, "bin", "what-changed.mjs"), "--repo"],
      { encoding: "utf8" }
    );
    const out = `${res.stdout}${res.stderr}`;
    return (
      expect(res.status === 2, "exit 2 — flag not understood", `exit ${res.status}\n${out}`) ||
      expect(out.includes("unknown flag"), "says the flag wasn't understood", out) ||
      expect(!out.includes("No rules section"), "doesn't pass off confusion as \"no rules here\"", out)
    );
  });

  runCase("bare-repository-prints-only-applies-to-all", () => {
    const { toolDir } = makeTool(path.join(sandbox, "s3"));
    const targetRepo = makeBareTarget(path.join(sandbox, "s3"));
    appendChangelogEntry(toolDir, "2026-09-24", "Rule for everyone", "`rule-doc.md`", "do it everywhere.", "all repositories with `AGENTS.md`");
    appendChangelogEntry(toolDir, "2026-09-20", "Ordinary rule", "`rule-doc.md`", "pull it in.");
    const res = run(toolDir, targetRepo);
    return (
      expect(res.status === 0, "exit 0 — a repository without a section never turns red", `exit ${res.status}\n${res.stdout}`) ||
      expect(res.stdout.includes("Applies to all repositories"), '"Applies to all repositories" block', res.stdout) ||
      expect(res.stdout.includes("Rule for everyone"), "the applies-to-all entry is printed", res.stdout) ||
      expect(!res.stdout.includes("Ordinary rule"), "the unscoped entry is NOT printed", res.stdout)
    );
  });

  // ---- main path: the marker in AGENTS.md ----

  runCase("marker-date-filters-entries-and-the-date-shift-proves-it", () => {
    const { toolDir } = makeTool(path.join(sandbox, "l1"));
    return scenarioLabelFiltersByDate(toolDir, path.join(sandbox, "l1"));
  });

  runCase("marker-fresh-section-with-no-entries-silently-exits-zero", () => {
    const { toolDir } = makeTool(path.join(sandbox, "l2"));
    const targetRepo = makeTarget(path.join(sandbox, "l2"), "2026-09-01");
    const res = run(toolDir, targetRepo);
    return (
      expect(res.status === 0, "exit 0", `exit ${res.status}\n${res.stdout}${res.stderr}`) ||
      expect(res.stdout.includes("rules section is fresh"), '"rules section is fresh"', res.stdout)
    );
  });

  runCase("marker-section-fell-behind-the-source", () => {
    const { toolDir, rulesPath } = makeTool(path.join(sandbox, "l3"));
    const targetRepo = makeTarget(path.join(sandbox, "l3"), "2026-09-01");
    fs.writeFileSync(rulesPath, RULES_V1.replace("rule-b", "rule-b-new"), "utf8");
    const res = run(toolDir, targetRepo);
    return (
      expect(res.status === 1, "exit 1", `exit ${res.status}\n${res.stdout}`) ||
      expect(res.stdout.includes("fallen behind the source"), '"fallen behind the source"', res.stdout) ||
      expect(res.stdout.includes("agents-md.mjs"), "names the regeneration command", res.stdout)
    );
  });

  runCase("marker-section-was-hand-edited", () => {
    const { toolDir } = makeTool(path.join(sandbox, "l4"));
    const targetRepo = makeTarget(path.join(sandbox, "l4"), "2026-09-01");
    const p = path.join(targetRepo, "AGENTS.md");
    fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace("rule-a", "rule-a edited"), "utf8");
    const res = run(toolDir, targetRepo);
    return (
      expect(res.status === 1, "exit 1", `exit ${res.status}\n${res.stdout}`) ||
      expect(res.stdout.includes("hand-edited"), '"hand-edited"', res.stdout)
    );
  });

  runCase("broken-marker-turns-red", () => {
    const { toolDir } = makeTool(path.join(sandbox, "l6"));
    const targetRepo = path.join(sandbox, "l6", "t");
    fs.mkdirSync(targetRepo, { recursive: true });
    fs.writeFileSync(path.join(targetRepo, "AGENTS.md"), "<!-- house-rules:begin level=1 applied=2026-09-01 fingerprint=aa -->\nno end\n", "utf8");
    const res = run(toolDir, targetRepo);
    return (
      expect(res.status === 1, "exit 1", `exit ${res.status}\n${res.stdout}`) ||
      expect(res.stdout.includes("broken"), '"broken"', res.stdout)
    );
  });

  // Mutation proof, not just data: a copy of what-changed.mjs has its base date hard-coded — the
  // marker scenario must turn red (otherwise the tool can't tell "date from the marker" apart
  // from any other date).
  runCase("mutation-base-not-from-marker-is-caught", () => {
    const { toolDir } = makeTool(path.join(sandbox, "m1"));
    const wc = path.join(toolDir, "bin", "what-changed.mjs");
    const text = fs.readFileSync(wc, "utf8");
    const marker = "const base = section.date;";
    if (!text.includes(marker)) return `mutation target not found in what-changed.mjs: ${marker}`;
    fs.writeFileSync(wc, text.replace(marker, 'const base = "0000-00-00";'), "utf8");
    const problem = scenarioLabelFiltersByDate(toolDir, path.join(sandbox, "m1"));
    return problem ? null : "mutant passed the scenario — the check can't tell the marker's base apart from any other date";
  });
} finally {
  fs.rmSync(sandbox, { recursive: true, force: true });
}

console.log(`\npassed ${passed} of ${total}`);
process.exit(passed === total ? 0 : 1);
