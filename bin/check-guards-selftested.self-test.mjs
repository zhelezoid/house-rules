#!/usr/bin/env node
// Self-test for bin/check-guards-selftested.mjs — the guard of guards.
//
// Some cases run PURE logic (evaluate/parseWorkflowSelfTestCalls, exported by the guard) on
// made-up names in memory — no disk at all, the same way check-proofs-sync.mjs exercises its own
// parseMarkdown/parseJson/diff. The last case is a regression check via a real subprocess on
// THIS repository's tree as it stands today (bin/ + checks.yml, no substitution): a guard that
// can't stand its own weight guards nothing.
//
// Run: node bin/check-guards-selftested.self-test.mjs
// Output: OK <case> / FAIL <case>: <reason>, ending with "passed N of M", exit code 0/1.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  evaluate,
  parseWorkflowSelfTestCalls,
  parseWorkflowDirectMjsCalls,
  defaultSelfTestNameFor,
  isToolName,
  isSelfTestName,
} from "./check-guards-selftested.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(HERE, "..");
const TOOL = path.join(HERE, "check-guards-selftested.mjs");

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

// ---- parsing workflow mentions (pure logic) --------------------------------------------------

runCase("workflow-parser-finds-a-node-call", () => {
  const text = "steps:\n  - run: node bin/tool-one.self-test.mjs\n";
  const calls = parseWorkflowSelfTestCalls(text);
  return expect(calls.has("tool-one.self-test.mjs"), "call found", JSON.stringify([...calls]));
});

runCase("workflow-parser-finds-a-bash-call-in-a-nested-path", () => {
  const text = "steps:\n  - run: bash bin/hooks/pre-commit-guard.self-test.sh --prove-mutations\n";
  const calls = parseWorkflowSelfTestCalls(text);
  return expect(
    calls.has("hooks/pre-commit-guard.self-test.sh"),
    "call in a nested directory found",
    JSON.stringify([...calls])
  );
});

runCase("workflow-parser-finds-a-self-test-call-through-a-plugin-path-prefix", () => {
  // A tool that moved into plugins/house-rules/bin/ is still invoked as "node
  // plugins/house-rules/bin/<name>.self-test.mjs" — the parser has to collapse it to the same
  // bin/-relative name a root bin/ call would produce, since that's the name tools are tracked by.
  const text = "steps:\n  - run: node plugins/house-rules/bin/agents-md.self-test.mjs\n";
  const calls = parseWorkflowSelfTestCalls(text);
  return expect(calls.has("agents-md.self-test.mjs"), "plugin-prefixed call found", JSON.stringify([...calls]));
});

// ---- the direct-invocation parser (pure logic) -----------------------------------------------

runCase("direct-call-parser-finds-a-plain-node-invocation", () => {
  const text = "steps:\n  - run: node bin/check-public-clean.mjs\n";
  const calls = parseWorkflowDirectMjsCalls(text);
  return expect(calls.has("check-public-clean.mjs"), "direct call found", JSON.stringify([...calls]));
});

runCase("direct-call-parser-ignores-self-test-invocations", () => {
  // A self-test IS a "node bin/....mjs" invocation too — it must not count as a direct call of the
  // tool it tests, or the new requirement could never turn red.
  const text = "steps:\n  - run: node bin/check-public-clean.self-test.mjs\n";
  const calls = parseWorkflowDirectMjsCalls(text);
  return expect(calls.size === 0, "no direct call recorded, only a self-test", JSON.stringify([...calls]));
});

runCase("isToolName-and-isSelfTestName-tell-a-tool-and-a-self-test-apart", () => {
  return (
    expect(isToolName("tool-one.mjs"), "a tool — yes", String(isToolName("tool-one.mjs"))) ||
    expect(!isToolName("tool-one.self-test.mjs"), "a self-test isn't a tool", String(isToolName("tool-one.self-test.mjs"))) ||
    expect(isSelfTestName("tool-one.self-test.mjs"), "a self-test — yes", String(isSelfTestName("tool-one.self-test.mjs"))) ||
    expect(defaultSelfTestNameFor("tool-one.mjs") === "tool-one.self-test.mjs", "default name", defaultSelfTestNameFor("tool-one.mjs"))
  );
});

// ---- the evaluate() core on made-up data ----------------------------------------------------

runCase("healthy-tree-is-green", () => {
  const problems = evaluate({
    toolNames: ["tool-a.mjs", "tool-b.mjs"],
    selfTestNames: new Set(["tool-a.self-test.mjs", "tool-b.self-test.mjs"]),
    workflowCalls: new Set(["tool-a.self-test.mjs", "tool-b.self-test.mjs"]),
  });
  return expect(problems.length === 0, "zero complaints", JSON.stringify(problems));
});

// Case 1: a tool with no pair turns red.
runCase("tool-without-a-pair-turns-red", () => {
  const problems = evaluate({
    toolNames: ["tool-a.mjs", "tool-orphan.mjs"],
    selfTestNames: new Set(["tool-a.self-test.mjs"]),
    workflowCalls: new Set(["tool-a.self-test.mjs"]),
  });
  return (
    expect(problems.length === 1, "exactly one complaint", JSON.stringify(problems)) ||
    expect(problems[0].includes("tool-orphan.mjs"), "the orphaned tool is named", problems[0]) ||
    expect(problems[0].includes("no self-test"), 'message "no self-test"', problems[0])
  );
});

// Case 2: a self-test exists but isn't called in the workflow — decoration.
runCase("self-test-not-called-in-workflow-turns-red", () => {
  const problems = evaluate({
    toolNames: ["tool-a.mjs"],
    selfTestNames: new Set(["tool-a.self-test.mjs"]),
    workflowCalls: new Set(), // nothing is called
  });
  return (
    expect(problems.length === 1, "exactly one complaint", JSON.stringify(problems)) ||
    expect(problems[0].includes("tool-a.self-test.mjs"), "the self-test is named", problems[0]) ||
    expect(problems[0].includes("decoration"), 'message about "decoration"', problems[0])
  );
});

// Case 3: the workflow calls a file that doesn't exist — turns red.
runCase("workflow-calls-a-missing-file-turns-red", () => {
  const problems = evaluate({
    toolNames: ["tool-a.mjs"],
    selfTestNames: new Set(["tool-a.self-test.mjs"]),
    workflowCalls: new Set(["tool-a.self-test.mjs", "tool-ghost.self-test.mjs"]),
  });
  return (
    expect(problems.length === 1, "exactly one complaint", JSON.stringify(problems)) ||
    expect(problems[0].includes("tool-ghost.self-test.mjs"), "the missing file is named", problems[0]) ||
    expect(problems[0].includes("doesn't exist on disk"), "message about the missing file", problems[0])
  );
});

// Case 4: a file in the exception list with no pair — green.
runCase("exception-with-a-reason-needs-no-pair", () => {
  const problems = evaluate({
    toolNames: ["tool-a.mjs", "tool-exempt.mjs"],
    selfTestNames: new Set(["tool-a.self-test.mjs"]),
    workflowCalls: new Set(["tool-a.self-test.mjs"]),
    nothingToGuard: { "tool-exempt.mjs": "lays out files on human request, checks nothing" },
  });
  return expect(problems.length === 0, "zero complaints — the exception with a reason is legitimate", JSON.stringify(problems));
});

runCase("exception-with-no-reason-turns-red-itself", () => {
  // A list of exceptions with no justification is a hole wearing the costume of a decision — the
  // guard has to notice.
  const problems = evaluate({
    toolNames: ["tool-exempt.mjs"],
    selfTestNames: new Set(),
    workflowCalls: new Set(),
    nothingToGuard: { "tool-exempt.mjs": "" },
  });
  return (
    expect(problems.length === 1, "exactly one complaint", JSON.stringify(problems)) ||
    expect(problems[0].includes("WITH NO REASON"), 'message "WITH NO REASON"', problems[0])
  );
});

runCase("alias-clears-the-complaint-but-needs-a-real-file", () => {
  // A tool pointing at a self-test under a different name — no complaint if it really exists.
  const problems = evaluate({
    toolNames: ["tool-a.mjs", "tool-b.mjs"],
    selfTestNames: new Set(["combined.self-test.mjs"]),
    workflowCalls: new Set(["combined.self-test.mjs"]),
    aliases: {
      "tool-a.mjs": { selfTest: "combined.self-test.mjs", reason: "half of one pair" },
      "tool-b.mjs": { selfTest: "combined.self-test.mjs", reason: "the other half of the same pair" },
    },
    mentions: () => true,
  });
  return expect(problems.length === 0, "zero complaints — alias to an existing self-test", JSON.stringify(problems));
});

runCase("alias-to-a-missing-self-test-turns-red", () => {
  const problems = evaluate({
    toolNames: ["tool-a.mjs"],
    selfTestNames: new Set(),
    workflowCalls: new Set(),
    aliases: { "tool-a.mjs": { selfTest: "combined.self-test.mjs", reason: "has a reason" } },
  });
  return (
    expect(problems.length === 1, "exactly one complaint", JSON.stringify(problems)) ||
    expect(problems[0].includes("combined.self-test.mjs"), "names the expected (alias) name", problems[0])
  );
});

// ---- check #4: a maintainer guard must be invoked directly, not only through its self-test -----

runCase("maintainer-guard-invoked-directly-is-green", () => {
  const problems = evaluate({
    toolNames: ["tool-a.mjs"],
    selfTestNames: new Set(["tool-a.self-test.mjs"]),
    workflowCalls: new Set(["tool-a.self-test.mjs"]),
    toolsRequiringDirectCall: ["tool-a.mjs"],
    workflowDirectCalls: new Set(["tool-a.mjs"]),
  });
  return expect(problems.length === 0, "zero complaints — the guard runs both as a self-test and directly", JSON.stringify(problems));
});

runCase("maintainer-guard-with-only-a-self-test-turns-red", () => {
  // This is the exact shape review found: every self-test was called in checks.yml, but several
  // maintainer guards never ran against this repository's OWN tree — only their self-test ran, on
  // made-up sandbox data.
  const problems = evaluate({
    toolNames: ["tool-a.mjs"],
    selfTestNames: new Set(["tool-a.self-test.mjs"]),
    workflowCalls: new Set(["tool-a.self-test.mjs"]),
    toolsRequiringDirectCall: ["tool-a.mjs"],
    workflowDirectCalls: new Set(), // self-test runs, the guard itself never does
  });
  return (
    expect(problems.length === 1, "exactly one complaint", JSON.stringify(problems)) ||
    expect(problems[0].includes("tool-a.mjs"), "the guard is named", problems[0]) ||
    expect(problems[0].includes("not invoked DIRECTLY"), 'message "not invoked DIRECTLY"', problems[0])
  );
});

runCase("adopter-tool-outside-toolsRequiringDirectCall-needs-no-direct-call", () => {
  // A plugin adopter tool (e.g. agents-md.mjs) is never in toolsRequiringDirectCall — only its
  // self-test is expected here, since the tool itself runs for real once a repository adopts it.
  const problems = evaluate({
    toolNames: ["adopter-tool.mjs"],
    selfTestNames: new Set(["adopter-tool.self-test.mjs"]),
    workflowCalls: new Set(["adopter-tool.self-test.mjs"]),
    toolsRequiringDirectCall: [], // not a maintainer guard
    workflowDirectCalls: new Set(),
  });
  return expect(problems.length === 0, "zero complaints — an adopter tool needs no direct call here", JSON.stringify(problems));
});

// ---- collectToolNames() combines two bin/ directories (mutation-style, on a real sandbox) ------

runCase("collectToolNames-and-a-full-live-tree-scan-covers-both-bin-directories", () => {
  // A real subprocess run on a sandbox tree with tools split across bin/ and
  // plugins/house-rules/bin/ — a tool missing its self-test in EITHER directory must turn the
  // whole check red, proving the scan actually walks both, not just the root one.
  const tmpRoot = fs.realpathSync(os.tmpdir());
  const dir = fs.mkdtempSync(path.join(tmpRoot, "check-guards-selftested-self-test-"));
  try {
    fs.mkdirSync(path.join(dir, "bin"), { recursive: true });
    fs.mkdirSync(path.join(dir, "plugins", "house-rules", "bin"), { recursive: true });
    fs.mkdirSync(path.join(dir, ".github", "workflows"), { recursive: true });
    fs.copyFileSync(TOOL, path.join(dir, "bin", "check-guards-selftested.mjs"));

    // A root maintainer guard with a self-test, called both ways — healthy.
    fs.writeFileSync(path.join(dir, "bin", "root-guard.mjs"), "// noop\n");
    fs.writeFileSync(path.join(dir, "bin", "root-guard.self-test.mjs"), "// noop\n");
    // A plugin adopter tool with NO self-test at all — must turn the check red on its own.
    fs.writeFileSync(path.join(dir, "plugins", "house-rules", "bin", "adopter-tool.mjs"), "// noop\n");
    fs.writeFileSync(
      path.join(dir, ".github", "workflows", "checks.yml"),
      "jobs:\n  checks:\n    steps:\n      - run: node bin/root-guard.self-test.mjs\n      - run: node bin/root-guard.mjs\n",
      "utf8"
    );

    const res = spawnSync(process.execPath, [path.join(dir, "bin", "check-guards-selftested.mjs")], { cwd: dir, encoding: "utf8" });
    return (
      expect(res.status === 1, "exit 1 — the plugin-directory tool with no self-test is caught", `exit ${res.status}\n${res.stdout}${res.stderr}`) ||
      expect(res.stdout.includes("adopter-tool.mjs"), "the plugin-directory tool is named — both bin/ dirs were scanned", res.stdout)
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---- regression check: a real subprocess on today's tree of the repository -------------------

runCase("alias-with-no-reason-turns-red", () => {
  // Review finding: an alias could pin any new tool to someone else's green test. The same key
  // that locks exceptions locks aliases — a mandatory reason.
  const problems = evaluate({
    toolNames: ["tool-a.mjs"],
    selfTestNames: new Set(["combined.self-test.mjs"]),
    workflowCalls: new Set(["combined.self-test.mjs"]),
    aliases: { "tool-a.mjs": { selfTest: "combined.self-test.mjs", reason: "   " } },
    mentions: () => true,
  });
  return (
    expect(problems.length === 1, "exactly one complaint", JSON.stringify(problems)) ||
    expect(problems[0].includes("no reason"), "says there's no reason", problems[0])
  );
});

runCase("alias-to-someone-elses-self-test-turns-red", () => {
  // The self-test exists and is called, but knows nothing about the tool itself — meaning it
  // guards something else. Exactly how a made-up tool used to pass green.
  const problems = evaluate({
    toolNames: ["fake-new-tool.mjs"],
    selfTestNames: new Set(["combined.self-test.mjs"]),
    workflowCalls: new Set(["combined.self-test.mjs"]),
    aliases: { "fake-new-tool.mjs": { selfTest: "combined.self-test.mjs", reason: "reason is there" } },
    mentions: () => false,
  });
  return (
    expect(problems.length === 1, "exactly one complaint", JSON.stringify(problems)) ||
    expect(problems[0].includes("never mentions"), "says it guards something else", problems[0])
  );
});

runCase("live-source-tree-is-green-via-subprocess", () => {
  const res = spawnSync(process.execPath, [TOOL], { cwd: REPO_ROOT, encoding: "utf8" });
  return expect(
    res.status === 0,
    "exit 0 — today's tree holds its own rule",
    `exit ${res.status}\n${res.stdout}${res.stderr}`
  );
});

console.log(`\npassed ${passed} of ${total}`);
process.exit(passed === total ? 0 : 1);
