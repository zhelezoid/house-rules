#!/usr/bin/env node
// Self-test for bin/check-spec-acceptance.mjs — the runner for ```acceptance``` blocks in specs.
//
// Builds a sandbox specs/{active,done}/*.md tree with acceptance blocks (fs.mkdtempSync); a copy
// of the tool sits in a sandbox bin/, ROOT is computed from the script's own location — this
// repository's real specs/ is never read or touched. The `~/...` path case is exercised by
// swapping the child process's HOME env var (os.homedir() reads it before the passwd entry) — the
// real home directory is never touched either.
//
// Run: node bin/check-spec-acceptance.self-test.mjs
// Output: OK <case> / FAIL <case>: <reason>, ending with "passed N of M", exit code 0/1.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(HERE, "..");
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

/** A sandbox tree: copy of the tool + an empty specs/ tree. Cases add specs themselves. */
function makeRepo(dir) {
  fs.mkdirSync(path.join(dir, "bin"), { recursive: true });
  fs.copyFileSync(path.join(REPO_ROOT, "bin", "check-spec-acceptance.mjs"), path.join(dir, "bin", "check-spec-acceptance.mjs"));
  fs.mkdirSync(path.join(dir, "specs", "active"), { recursive: true });
  fs.mkdirSync(path.join(dir, "specs", "done"), { recursive: true });
}

function writeSpec(dir, slot, name, acceptanceBody) {
  const text = `# Spec\n\n## Acceptance\n\n\`\`\`acceptance\n${acceptanceBody}\n\`\`\`\n`;
  fs.writeFileSync(path.join(dir, "specs", slot, name), text, "utf8");
}

function run(dir, args = [], env = {}) {
  return spawnSync(process.execPath, [path.join(dir, "bin", "check-spec-acceptance.mjs"), ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

const sandbox = fs.mkdtempSync(path.join(tmpRoot, "check-spec-acceptance-self-test-"));

try {
  runCase("closed-spec-all-points-green", () => {
    const dir = path.join(sandbox, "s1");
    makeRepo(dir);
    fs.writeFileSync(path.join(dir, "marker.txt"), "contains the needed string right here\n", "utf8");
    writeSpec(dir, "done", "ok.md", 'file_exists marker.txt\ngrep marker.txt "needed string"');
    const res = run(dir);
    return (
      expect(res.status === 0, "exit 0 — every point of the closed spec passed", `exit ${res.status}\n${res.stdout}${res.stderr}`) ||
      expect(res.stdout.includes("failures in done 0"), "summary reports 0 failures", res.stdout)
    );
  });

  runCase("closed-spec-file_exists-fails-turns-red", () => {
    const dir = path.join(sandbox, "s2");
    makeRepo(dir);
    writeSpec(dir, "done", "missing.md", "file_exists no-such-file.txt");
    const res = run(dir);
    return (
      expect(res.status === 1, "exit 1 — regression in a closed spec", `exit ${res.status}\n${res.stdout}`) ||
      expect(res.stdout.includes("REGRESSION"), 'message "REGRESSION"', res.stdout) ||
      expect(res.stdout.includes("file missing: no-such-file.txt"), "names the specific cause", res.stdout)
    );
  });

  runCase("closed-spec-grep-misses-the-string-turns-red", () => {
    const dir = path.join(sandbox, "s3");
    makeRepo(dir);
    fs.writeFileSync(path.join(dir, "marker.txt"), "something else is here\n", "utf8");
    writeSpec(dir, "done", "grep-fail.md", 'grep marker.txt "needed string"');
    const res = run(dir);
    return (
      expect(res.status === 1, "exit 1 — the needed string is missing", `exit ${res.status}\n${res.stdout}`) ||
      expect(res.stdout.includes('has no line "needed string"'), "names the missing string", res.stdout)
    );
  });

  runCase("closed-spec-forbid_grep-finds-the-forbidden-string-turns-red", () => {
    const dir = path.join(sandbox, "s4");
    makeRepo(dir);
    fs.writeFileSync(path.join(dir, "marker.txt"), "here is a forbidden string\n", "utf8");
    writeSpec(dir, "done", "forbid-fail.md", 'forbid_grep marker.txt "forbidden string"');
    const res = run(dir);
    return (
      expect(res.status === 1, "exit 1 — the forbidden string is present", `exit ${res.status}\n${res.stdout}`) ||
      expect(res.stdout.includes("has the forbidden"), "names the forbid_grep cause", res.stdout)
    );
  });

  runCase("active-spec-failure-doesnt-fail-the-build", () => {
    // Key rule of the runner: a spec in progress is work that's still GOING ON, a red point
    // there is legitimate and printed as "not done yet", not a regression.
    const dir = path.join(sandbox, "s5");
    makeRepo(dir);
    writeSpec(dir, "active", "pending.md", "file_exists no-such-file-yet.txt");
    const res = run(dir);
    return (
      expect(res.status === 0, "exit 0 — unfinished work doesn't fail the build", `exit ${res.status}\n${res.stdout}`) ||
      expect(res.stdout.includes("Not done yet"), '"Not done yet" section in the output', res.stdout) ||
      expect(res.stdout.includes("no-such-file-yet.txt"), "the specific point is named", res.stdout)
    );
  });

  runCase("active-and-done-together-only-colors-done", () => {
    // A mixed run — the shared check must not depend on the life of a single task: a failure in
    // active must not mask, and must not stand in for, a regression in done.
    const dir = path.join(sandbox, "s6");
    makeRepo(dir);
    writeSpec(dir, "active", "pending.md", "file_exists no-such-file-yet.txt");
    writeSpec(dir, "done", "broken.md", "file_exists also-missing.txt");
    const res = run(dir);
    return (
      expect(res.status === 1, "exit 1 — the regression in done outweighs it", `exit ${res.status}\n${res.stdout}`) ||
      expect(res.stdout.includes("REGRESSION"), "regression is named", res.stdout) ||
      expect(res.stdout.includes("Not done yet"), "unfinished active work is also printed", res.stdout)
    );
  });

  runCase("unparsed-line-in-a-closed-spec-turns-red", () => {
    const dir = path.join(sandbox, "s7");
    makeRepo(dir);
    writeSpec(dir, "done", "garbled.md", "unknown_command somewhere");
    const res = run(dir);
    return (
      expect(res.status === 1, "exit 1 — syntax wasn't parsed", `exit ${res.status}\n${res.stdout}`) ||
      expect(res.stdout.includes("couldn't parse line"), 'message "couldn\'t parse line"', res.stdout)
    );
  });

  // An unparsed line in a spec IN PROGRESS must also fail the build — broken syntax doesn't
  // become "not done yet" just because the spec is active. Otherwise a future edit to the runner
  // could start silently skipping broken acceptance lines without a single red run — exactly what
  // the source's own conventions warn against.
  runCase("unparsed-line-in-an-active-spec-also-turns-red", () => {
    const dir = path.join(sandbox, "s8");
    makeRepo(dir);
    writeSpec(dir, "active", "garbled.md", "unknown_command somewhere");
    const res = run(dir);
    return (
      expect(res.status === 1, "exit 1 — syntax wasn't parsed even in active", `exit ${res.status}\n${res.stdout}`) ||
      expect(res.stdout.includes("couldn't parse line"), 'message "couldn\'t parse line"', res.stdout)
    );
  });

  runCase("tilde-path-resolves-into-home", () => {
    // os.homedir() reads $HOME before the passwd entry — swapped for a sandbox directory, the
    // real user home directory is never touched.
    const dir = path.join(sandbox, "s9");
    makeRepo(dir);
    const fakeHome = path.join(sandbox, "fake-home");
    fs.mkdirSync(fakeHome, { recursive: true });
    fs.writeFileSync(path.join(fakeHome, "outside-repo.txt"), "content outside the repo\n", "utf8");
    writeSpec(dir, "done", "tilde.md", "file_exists ~/outside-repo.txt");
    const res = run(dir, [], { HOME: fakeHome });
    return expect(res.status === 0, "exit 0 — ~ resolves into HOME and the file is found", `exit ${res.status}\n${res.stdout}`);
  });

  runCase("empty-spec-set-is-green", () => {
    const dir = path.join(sandbox, "s10");
    makeRepo(dir); // no specs at all — a legitimately empty folder, not a failure
    const res = run(dir);
    return (
      expect(res.status === 0, "exit 0 — no specs is not a failure", `exit ${res.status}\n${res.stdout}`) ||
      expect(res.stdout.includes("checked 0"), "summary reports 0 checked", res.stdout)
    );
  });
} finally {
  fs.rmSync(sandbox, { recursive: true, force: true });
}

console.log(`\npassed ${passed} of ${total}`);
process.exit(passed === total ? 0 : 1);
