#!/usr/bin/env node
// Self-test for the plugin-version guard.
//
// The check has to do TWO things, both proven here on real repositories, not stubs: stay quiet
// when the version is bumped, and turn red when it isn't. The second matters more than the
// first — a guard that never turns red looks like health.

import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkRange } from "./check-plugin-version.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const TOOL = join(HERE, "check-plugin-version.mjs");

let failures = 0;

function check(name, condition, detail = "") {
  if (condition) {
    console.log(`  ✓ ${name}`);
  } else {
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
    failures += 1;
  }
}

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

/**
 * Builds a sandbox repository with a plugin and makes a second commit in it.
 * bumpVersion=true — the edit bumps the version, false — it doesn't.
 */
function sandbox(bumpVersion) {
  const dir = mkdtempSync(join(tmpdir(), "plugin-version-"));
  git(["init", "-q", "-b", "main"], dir);
  git(["config", "user.email", "self-test@noreply.example.com"], dir);
  git(["config", "user.name", "self-test"], dir);

  const pluginDir = join(dir, "plugins", "demo");
  mkdirSync(join(pluginDir, ".claude-plugin"), { recursive: true });
  mkdirSync(join(pluginDir, "rules"), { recursive: true });
  const manifest = (version) => JSON.stringify({ name: "demo", version }, null, 2);

  writeFileSync(join(pluginDir, ".claude-plugin", "plugin.json"), manifest("0.1.0"));
  writeFileSync(join(pluginDir, "rules", "rule.md"), "first rule\n");
  git(["add", "-A"], dir);
  git(["commit", "-q", "-m", "first"], dir);

  writeFileSync(join(pluginDir, "rules", "rule.md"), "rewritten rule\n");
  if (bumpVersion) {
    writeFileSync(join(pluginDir, ".claude-plugin", "plugin.json"), manifest("0.2.0"));
  }
  git(["add", "-A"], dir);
  git(["commit", "-q", "-m", "second"], dir);

  return dir;
}

console.log("Self-test: plugin-version guard");

// 1. Version bumped — the guard stays quiet.
{
  const dir = sandbox(true);
  const complaints = checkRange("HEAD~1", "HEAD", dir);
  check("version bumped -> no complaints", complaints.length === 0, complaints.join("; "));
  rmSync(dir, { recursive: true, force: true });
}

// 2. Mutation: the same edit without a version bump — the guard must turn red.
{
  const dir = sandbox(false);
  const complaints = checkRange("HEAD~1", "HEAD", dir);
  check("version NOT bumped -> guard turns red", complaints.length === 1, `complaints: ${complaints.length}`);
  check(
    "the complaint names the plugin and the old version",
    complaints.length === 1 && complaints[0].includes("plugins/demo") && complaints[0].includes("0.1.0"),
    complaints[0] ?? "no complaint"
  );
  rmSync(dir, { recursive: true, force: true });
}

// 3. An edit OUTSIDE a plugin's directory doesn't require a version bump — otherwise the guard
//    would start lying the other way and get disabled entirely.
{
  const dir = mkdtempSync(join(tmpdir(), "plugin-version-outside-"));
  git(["init", "-q", "-b", "main"], dir);
  git(["config", "user.email", "self-test@noreply.example.com"], dir);
  git(["config", "user.name", "self-test"], dir);
  mkdirSync(join(dir, "plugins", "demo", ".claude-plugin"), { recursive: true });
  writeFileSync(
    join(dir, "plugins", "demo", ".claude-plugin", "plugin.json"),
    JSON.stringify({ name: "demo", version: "0.1.0" }, null, 2)
  );
  writeFileSync(join(dir, "README.md"), "first edition\n");
  git(["add", "-A"], dir);
  git(["commit", "-q", "-m", "first"], dir);
  writeFileSync(join(dir, "README.md"), "second edition\n");
  git(["add", "-A"], dir);
  git(["commit", "-q", "-m", "second"], dir);

  const complaints = checkRange("HEAD~1", "HEAD", dir);
  check("edit outside a plugin -> no complaints", complaints.length === 0, complaints.join("; "));
  rmSync(dir, { recursive: true, force: true });
}

// 4. A single-commit repository has no HEAD~1 — that's "nothing to compare yet", not a broken
//    check. A raw git fatal here would fail the very first commit to a repository for no reason.
{
  const dir = mkdtempSync(join(tmpdir(), "plugin-version-single-commit-"));
  git(["init", "-q", "-b", "main"], dir);
  git(["config", "user.email", "self-test@noreply.example.com"], dir);
  git(["config", "user.name", "self-test"], dir);
  writeFileSync(join(dir, "README.md"), "only commit\n");
  git(["add", "-A"], dir);
  git(["commit", "-q", "-m", "first"], dir);

  const res = execFileSync(process.execPath, [TOOL, "HEAD~1", "HEAD"], { cwd: dir, encoding: "utf8" });
  check("no HEAD~1 on a single-commit repo -> exits 0, nothing to compare", res.includes("nothing to compare"), res);
  rmSync(dir, { recursive: true, force: true });
}

// 5. The all-zero sha CI sends as `github.event.before` on a branch's first push — same answer,
//    without even asking git.
{
  const dir = mkdtempSync(join(tmpdir(), "plugin-version-all-zero-"));
  git(["init", "-q", "-b", "main"], dir);
  git(["config", "user.email", "self-test@noreply.example.com"], dir);
  git(["config", "user.name", "self-test"], dir);
  writeFileSync(join(dir, "README.md"), "only commit\n");
  git(["add", "-A"], dir);
  git(["commit", "-q", "-m", "first"], dir);

  const zero = "0".repeat(40);
  const res = execFileSync(process.execPath, [TOOL, zero, "HEAD"], { cwd: dir, encoding: "utf8" });
  check("all-zero base -> exits 0, nothing to compare", res.includes("nothing to compare"), res);
  rmSync(dir, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`\nFailures: ${failures}`);
  process.exit(1);
}
console.log("\nAll good.");
