#!/usr/bin/env node
// Self-test for bin/check-proofs-sync.mjs — the guard for REQUIRED-PROOFS.md/required-proofs.json sync.
//
// Some cases run PURE logic (parseMarkdown/parseJson/diff, exported by the guard) on strings in
// memory — no disk at all. Some run a real subprocess of check-proofs-sync.mjs with --md/--json
// flags on temp files (fs.mkdtempSync). Every fixture here is invented for the test; the real
// plugins/house-rules/proofs/* pair (written elsewhere, possibly mid-edit) is never read.
//
// Run: node bin/check-proofs-sync.self-test.mjs
// Output: OK <case> / FAIL <case>: <reason>, ending with "passed N of M", exit code 0/1.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseMarkdown, parseJson, diff } from "./check-proofs-sync.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOOL = path.join(HERE, "check-proofs-sync.mjs");
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

const HONEST_MD = [
  "# Points",
  "",
  "### 1.1 First point",
  "<!-- id: proof-one -->",
  "",
  "**Statement.** Text.",
  "",
  "### 2.1 Second point",
  "<!-- id: proof-two -->",
  "",
  "**Statement.** Text.",
  "",
].join("\n");

const HONEST_JSON = JSON.stringify({
  proofs: [
    { id: "proof-one", level: 1, statement: "Text." },
    { id: "proof-two", level: 2, statement: "Text." },
  ],
});

// ---- cases on pure logic (no disk) ---------------------------------------------------

runCase("honest-pair-is-in-sync", () => {
  const md = parseMarkdown(HONEST_MD);
  const json = parseJson(HONEST_JSON);
  const problems = diff(md, json);
  return expect(problems.length === 0, "zero mismatches", JSON.stringify(problems));
});

runCase("point-in-md-missing-from-json", () => {
  const md = parseMarkdown(HONEST_MD);
  const json = parseJson(JSON.stringify({ proofs: [{ id: "proof-one", level: 1, statement: "Text." }] }));
  const problems = diff(md, json);
  return (
    expect(problems.length === 1, "exactly one mismatch", JSON.stringify(problems)) ||
    expect(problems[0].includes("proof-two"), "names proof-two", problems[0]) ||
    expect(problems[0].includes("missing from required-proofs.json"), "names the direction of the mismatch", problems[0])
  );
});

runCase("point-in-json-missing-from-md", () => {
  const md = parseMarkdown(HONEST_MD);
  const json = parseJson(
    JSON.stringify({
      proofs: [
        { id: "proof-one", level: 1, statement: "Text." },
        { id: "proof-two", level: 2, statement: "Text." },
        { id: "proof-three", level: 3, statement: "Text." },
      ],
    })
  );
  const problems = diff(md, json);
  return (
    expect(problems.length === 1, "exactly one mismatch", JSON.stringify(problems)) ||
    expect(problems[0].includes("proof-three"), "names proof-three", problems[0]) ||
    expect(problems[0].includes("missing from REQUIRED-PROOFS.md"), "names the direction of the mismatch", problems[0])
  );
});

runCase("level-mismatch", () => {
  const md = parseMarkdown(HONEST_MD); // proof-two is declared at level 2 (heading "### 2.1")
  const json = parseJson(
    JSON.stringify({
      proofs: [
        { id: "proof-one", level: 1, statement: "Text." },
        { id: "proof-two", level: 3, statement: "Text." }, // but level 3 here
      ],
    })
  );
  const problems = diff(md, json);
  return (
    expect(problems.length === 1, "exactly one mismatch", JSON.stringify(problems)) ||
    expect(problems[0].includes("level mismatch"), 'message "level mismatch"', problems[0]) ||
    expect(problems[0].includes("proof-two"), "names proof-two", problems[0])
  );
});

runCase("heading-without-id-counts-as-a-mismatch", () => {
  const brokenMd = HONEST_MD.replace("<!-- id: proof-two -->\n\n", "");
  const md = parseMarkdown(brokenMd);
  const json = parseJson(HONEST_JSON);
  const problems = diff(md, json);
  const hasHeaderless = problems.some((p) => p.includes("has no"));
  return expect(hasHeaderless, "names the missing-id problem", JSON.stringify(problems));
});

// ---- cases through a real subprocess on temp files --------------------------------

const sandbox = fs.mkdtempSync(path.join(tmpRoot, "check-proofs-sync-self-test-"));

function writeFixture(dir, mdText, jsonText) {
  fs.mkdirSync(dir, { recursive: true });
  const mdPath = path.join(dir, "REQUIRED-PROOFS.md");
  const jsonPath = path.join(dir, "required-proofs.json");
  fs.writeFileSync(mdPath, mdText, "utf8");
  fs.writeFileSync(jsonPath, jsonText, "utf8");
  return { mdPath, jsonPath };
}

function runTool(mdPath, jsonPath) {
  return spawnSync(process.execPath, [TOOL, "--md", mdPath, "--json", jsonPath], { encoding: "utf8" });
}

try {
  runCase("subprocess-honest-pair-exit-0", () => {
    const { mdPath, jsonPath } = writeFixture(path.join(sandbox, "s1"), HONEST_MD, HONEST_JSON);
    const res = runTool(mdPath, jsonPath);
    return (
      expect(res.status === 0, "exit 0", `exit ${res.status}\n${res.stdout}${res.stderr}`) ||
      expect(res.stdout.includes("in sync"), 'message "in sync"', res.stdout)
    );
  });

  runCase("subprocess-mutation-point-dropped-from-json-turns-red", () => {
    // Mutation: json "forgets" the second point — exactly the case the guard must catch.
    const mutatedJson = JSON.stringify({ proofs: [{ id: "proof-one", level: 1, statement: "Text." }] });
    const { mdPath, jsonPath } = writeFixture(path.join(sandbox, "s2"), HONEST_MD, mutatedJson);
    const res = runTool(mdPath, jsonPath);
    return (
      expect(res.status === 1, "exit 1 — a point dropped out of json", `exit ${res.status}\n${res.stdout}`) ||
      expect(res.stdout.includes("proof-two"), "the missing point is named", res.stdout)
    );
  });

  runCase("subprocess-mutation-new-point-in-md-without-json-turns-red", () => {
    const extendedMd = HONEST_MD + "### 3.1 Third point\n<!-- id: proof-three -->\n\n**Statement.** Text.\n";
    const { mdPath, jsonPath } = writeFixture(path.join(sandbox, "s3"), extendedMd, HONEST_JSON);
    const res = runTool(mdPath, jsonPath);
    return (
      expect(res.status === 1, "exit 1 — a new point with no json side", `exit ${res.status}\n${res.stdout}`) ||
      expect(res.stdout.includes("proof-three"), "the new point is named", res.stdout)
    );
  });
} finally {
  fs.rmSync(sandbox, { recursive: true, force: true });
}

console.log(`\npassed ${passed} of ${total}`);
process.exit(passed === total ? 0 : 1);
