#!/usr/bin/env node
// Guard of guards: every tool (this repository's own maintainer guards in `bin/`, and the adopter
// tools shipped inside the plugin in `plugins/house-rules/bin/`) must have a self-test, and that
// self-test must actually be run by `.github/workflows/checks.yml`.
//
// Why it exists. reference/guards.md, requirement #1: "a guard has a self-test, and that
// self-test proves it can turn red by mutation." A self-test that's written but never called is
// the same hole from a different angle: a check standing apart from what it's supposed to guard.
//
// Four checks:
//   1. Every `*.mjs` tool in EITHER bin/ directory (except `*.self-test.mjs`) has a matching
//      self-test `<name>.self-test.mjs` — EITHER the pairing is named explicitly in ALIASES (the
//      self-test exists under a different name because it guards several tools at once), OR the
//      tool is in NOTHING_TO_GUARD with a mandatory reason (see below).
//   2. Every SELF-TEST that actually sits in one of the two bin/ directories (including
//      `bin/hooks/*.self-test.sh`) is mentioned in a `run:` step of `.github/workflows/checks.yml`.
//      Not mentioned — it's decoration.
//   3. The flip side: `checks.yml` must not call a self-test file that doesn't exist.
//   4. Every maintainer guard — a tool that lives in THIS repository's own `bin/`, not inside the
//      plugin — is additionally invoked DIRECTLY in `checks.yml` (`run: node bin/<tool>.mjs`), not
//      only through its self-test. A self-test proves a guard CAN work; only running it against
//      this repository's own tree proves it DID. Adopter tools shipped inside the plugin need only
//      their self-test in CI here — they run for real once a repository adopts them, not here.
//
// Run: node bin/check-guards-selftested.mjs
// Exit 1 — any of the four complaints, named in the output.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN_DIR = path.join(ROOT, "bin");
const PLUGIN_BIN_DIR = path.join(ROOT, "plugins", "house-rules", "bin");
const WORKFLOW_PATH = path.join(ROOT, ".github", "workflows", "checks.yml");

// ---------------------------------------------------------------------------------------------
// Explicit exceptions and aliases. Both lists are a DECISION, not "forgot" — and a decision has
// to carry its reason right next to it: a list with no reason is a hole wearing the costume of
// order (see reference/guards.md).
// ---------------------------------------------------------------------------------------------

/**
 * Tools with no self-test BY DECISION, not by oversight: they legitimately have nothing to
 * guard — they don't check state and can't "turn red" on a rule violation. Key is the basename
 * in bin/, value is the mandatory reason (printed when parsed).
 *
 * Empty today: every tool found something to guard.
 */
const NOTHING_TO_GUARD = {
  // "file-name.mjs": "reason — why it legitimately has no self-test",
};

/**
 * Tools whose self-test exists but under a DIFFERENT name — because it guards several tools in
 * one file. Key is the tool's basename, value is the self-test's basename (path relative to
 * bin/, may live in a nested directory).
 */
const ALIASES = {
  // Empty today.
};

// ---------------------------------------------------------------------------------------------
// Pure logic — no disk, so the self-test can run it on made-up data.
// ---------------------------------------------------------------------------------------------

export function isSelfTestName(name) {
  return /\.self-test\.(mjs|sh)$/.test(name);
}

export function isToolName(name) {
  return name.endsWith(".mjs") && !isSelfTestName(name);
}

export function defaultSelfTestNameFor(toolName) {
  return toolName.replace(/\.mjs$/, ".self-test.mjs");
}

/** Pulls every `bin/<path>.self-test.(mjs|sh)` mention out of the checks.yml text. */
export function parseWorkflowSelfTestCalls(workflowText) {
  const found = new Set();
  const re = /\bbin\/([\w./-]+\.self-test\.(?:mjs|sh))\b/g;
  let m;
  while ((m = re.exec(workflowText))) found.add(m[1]);
  return found;
}

/**
 * Pulls every DIRECT `node bin/<path>.mjs` invocation out of the checks.yml text — a tool run for
 * its own sake, not through its self-test. `\bbin\/` matches on the LAST `bin/` segment of a path
 * regardless of what comes before it (same trick as parseWorkflowSelfTestCalls), so a step reading
 * `node plugins/house-rules/bin/agents-md.mjs` is recorded the same way as one reading
 * `node bin/check-public-clean.mjs` — both collapse to their bin/-relative name.
 */
export function parseWorkflowDirectMjsCalls(workflowText) {
  const found = new Set();
  const re = /\bnode\s+\S*\bbin\/([\w./-]+\.mjs)\b/g;
  let m;
  while ((m = re.exec(workflowText))) {
    if (!isSelfTestName(m[1])) found.add(m[1]);
  }
  return found;
}

/**
 * The guard's core — takes already-collected lists (basenames), never touches disk itself. That
 * split is what lets the self-test run every case on made-up names, instead of building a real
 * file tree for each one.
 *
 * @param {string[]} toolNames       — every `bin/*.mjs` except `*.self-test.mjs`
 * @param {Set<string>} selfTestNames — every real self-test (basename relative to bin/, may
 *                                      include a nested path like `hooks/x.self-test.sh`)
 * @param {Set<string>} workflowCalls — what's actually invoked in checks.yml (same format)
 * @param {Record<string,string>} nothingToGuard — see NOTHING_TO_GUARD
 * @param {Record<string,{selfTest:string,reason:string}>} aliases — see ALIASES
 * @param {(selfTest:string, tool:string) => boolean} mentions — does the self-test mention the
 *        tool; on disk this reads the file, in the self-test it's a made-up map
 * @returns {string[]} complaints, empty array means all good
 */
export function evaluate({
  toolNames,
  selfTestNames,
  workflowCalls,
  nothingToGuard = {},
  aliases = {},
  mentions = () => true,
  toolsRequiringDirectCall = [],
  workflowDirectCalls = new Set(),
}) {
  const problems = [];

  // 1. Every tool needs a pair, an alias, or an explicit exception with a reason.
  for (const tool of toolNames) {
    if (Object.prototype.hasOwnProperty.call(nothingToGuard, tool)) {
      const reason = nothingToGuard[tool];
      if (!reason || !reason.trim()) {
        problems.push(
          `bin/${tool}: listed as an exception WITH NO REASON — an exception with no reason is not a decision, it's a hole. ` +
            `Add a reason to NOTHING_TO_GUARD, or write a self-test.`
        );
      }
      continue; // a legitimate exception — no self-test required
    }
    const alias = aliases[tool];
    if (alias) {
      // An alias is the same door as an exception, and it locks the same way. Without a reason,
      // and without checking "does the named self-test actually mention this tool", an alias
      // could pin any new file to someone else's green test: the guard would say "everyone has
      // one" while guarding nothing. Caught by review once — a made-up tool passed with a
      // borrowed self-test.
      if (!String(alias.reason || "").trim()) {
        problems.push(
          `bin/${tool}: alias to bin/${alias.selfTest} with no reason. A list with no reason is a hole wearing ` +
            `the costume of order — write why the self-test lives under a different name.`
        );
      }
      if (!selfTestNames.has(alias.selfTest)) {
        problems.push(`bin/${tool}: alias points at bin/${alias.selfTest}, which doesn't exist.`);
      } else if (!mentions(alias.selfTest, tool)) {
        problems.push(
          `bin/${tool}: alias points at bin/${alias.selfTest}, but it never mentions ` +
            `${tool} — meaning it guards something else, not this tool.`
        );
      }
      continue;
    }
    const expected = defaultSelfTestNameFor(tool);
    if (!selfTestNames.has(expected)) {
      problems.push(
        `bin/${tool}: no self-test. Expected bin/${expected}` +
          `. Either write it, or add bin/${tool} to NOTHING_TO_GUARD with a reason there's nothing to guard.`
      );
    }
  }

  // 2. Every self-test that exists must actually be called in checks.yml.
  for (const st of selfTestNames) {
    if (!workflowCalls.has(st)) {
      problems.push(
        `bin/${st}: self-test is written but NOT called by any step of .github/workflows/checks.yml — ` +
          `decoration, not a guard. Add a \`run: node bin/${st}\` step (or bash for .sh) to the checks.yml job.`
      );
    }
  }

  // 3. The flip side: the workflow must not call a file that doesn't exist.
  for (const call of workflowCalls) {
    if (!selfTestNames.has(call)) {
      problems.push(
        `.github/workflows/checks.yml calls bin/${call}, which doesn't exist on disk. ` +
          `Either restore the file, or remove the step from checks.yml.`
      );
    }
  }

  // 4. A maintainer guard — this repository's own, in root bin/ — has to be invoked DIRECTLY in
  //    checks.yml, not only through its self-test: a self-test proves the guard CAN work, running
  //    it here proves it actually DID, against this repository's real tree.
  for (const tool of toolsRequiringDirectCall) {
    if (!workflowDirectCalls.has(tool)) {
      problems.push(
        `bin/${tool}: this repository's own guard is not invoked DIRECTLY in ` +
          `.github/workflows/checks.yml — only its self-test runs there, which proves the guard CAN ` +
          `work, not that it actually ran against this repository. Add a \`run: node bin/${tool}\` step.`
      );
    }
  }

  return problems;
}

// ---------------------------------------------------------------------------------------------
// Disk access and CLI — used only by main(), the self-test never goes through here.
// ---------------------------------------------------------------------------------------------

/** Recursively collects (bin/-relative) names of `*.self-test.(mjs|sh)` files. */
function walkSelfTests(dir, base) {
  const out = new Set();
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      for (const f of walkSelfTests(full, rel)) out.add(f);
    } else if (isSelfTestName(entry.name)) {
      out.add(rel);
    }
  }
  return out;
}

/** Top-level (non-recursive) `*.mjs` tool names in a bin/ directory, self-tests excluded. */
export function collectToolNames(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && isToolName(e.name))
    .map((e) => e.name)
    .sort();
}

function main() {
  // Two bin/ directories, two different jobs: root bin/ holds this repository's OWN maintainer
  // guards — they need a self-test AND a direct run here. plugins/house-rules/bin/ holds tools
  // meant for an adopting repository — they need only their self-test proven here; they run for
  // real once a repository actually adopts them, not against this repository's own tree.
  const rootToolNames = collectToolNames(BIN_DIR);
  const pluginToolNames = collectToolNames(PLUGIN_BIN_DIR);
  const toolNames = [...rootToolNames, ...pluginToolNames].sort();

  const selfTestNames = new Set([...walkSelfTests(BIN_DIR, ""), ...walkSelfTests(PLUGIN_BIN_DIR, "")]);
  const workflowText = fs.readFileSync(WORKFLOW_PATH, "utf8");
  const workflowCalls = parseWorkflowSelfTestCalls(workflowText);
  const workflowDirectCalls = parseWorkflowDirectMjsCalls(workflowText);

  // Read a self-test and look for the tool's name in it: an alias pointing at a file that knows
  // nothing about the tool is a borrowed green test, pinned on for silence. The self-test could
  // live in either bin/ directory — try both, in order.
  const mentions = (selfTest, tool) => {
    for (const dir of [BIN_DIR, PLUGIN_BIN_DIR]) {
      try {
        const text = fs.readFileSync(path.join(dir, selfTest), "utf8");
        return text.includes(tool) || text.includes(tool.replace(/\.mjs$/, ""));
      } catch {
        // not in this directory — try the next one
      }
    }
    return false; // couldn't read it anywhere — that's "couldn't tell", not "all good"
  };

  const problems = evaluate({
    toolNames,
    selfTestNames,
    workflowCalls,
    mentions,
    nothingToGuard: NOTHING_TO_GUARD,
    aliases: ALIASES,
    toolsRequiringDirectCall: rootToolNames,
    workflowDirectCalls,
  });

  console.log(
    `check-guards-selftested: ${toolNames.length} tool(s) (${rootToolNames.length} maintainer, ` +
      `${pluginToolNames.length} plugin), ${selfTestNames.size} self-test(s) on disk, ` +
      `${workflowCalls.size} self-test call(s) and ${workflowDirectCalls.size} direct call(s) in checks.yml.`
  );

  if (!problems.length) {
    console.log("✓ every tool has a self-test, and every self-test is actually run");
    process.exit(0);
  }

  console.log(`\nComplaints (${problems.length}):`);
  for (const p of problems) console.log(`  ✗ ${p}`);
  console.log("");
  console.log("Rule: reference/guards.md, requirement #1 — a guard with no self-test proven by");
  console.log("mutation, and with no place in the shared gate, is indistinguishable from one nobody wrote.");
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
