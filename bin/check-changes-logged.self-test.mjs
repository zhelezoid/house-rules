#!/usr/bin/env node
// Self-test for bin/check-changes-logged.mjs — the guard for CHANGELOG.md.
//
// Builds a sandbox git repository (mkdtempSync + git init) with a copy of the tool and a couple
// of documents under plugins/house-rules/. The real repository is never touched: the guard is
// always invoked on its own copy, and ROOT inside it is computed from the SCRIPT's own location —
// so the copy of bin/ has to live in its own git tree, separate from the live one.
//
// Run: node bin/check-changes-logged.self-test.mjs
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

function git(cwd, args) {
  const res = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (res.status !== 0) throw new Error(`git ${args.join(" ")} in ${cwd} failed:\n${res.stdout}${res.stderr}`);
  return res.stdout;
}

function gitInit(repoDir) {
  fs.mkdirSync(repoDir, { recursive: true });
  git(repoDir, ["init", "-q", "-b", "main"]);
  git(repoDir, ["config", "user.email", "self-test@noreply.example.com"]);
  git(repoDir, ["config", "user.name", "Self Test"]);
  git(repoDir, ["config", "commit.gpgsign", "false"]);
}

function gitCommitAll(repoDir, message) {
  git(repoDir, ["add", "-A"]);
  git(repoDir, ["commit", "-q", "-m", message]);
}

// Same formula as the guard itself — local date, not UTC.
function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** A fresh sandbox repo: copy of bin/, one rules/ document, one proofs/ document, empty changelog. */
function makeRepo(dir) {
  gitInit(dir);
  fs.mkdirSync(path.join(dir, "bin"), { recursive: true });
  fs.copyFileSync(path.join(REPO_ROOT, "bin", "check-changes-logged.mjs"), path.join(dir, "bin", "check-changes-logged.mjs"));

  const rulesDir = path.join(dir, "plugins", "house-rules", "rules");
  fs.mkdirSync(rulesDir, { recursive: true });
  fs.writeFileSync(path.join(rulesDir, "rules.md"), "# Rules\n\nText.\n", "utf8");

  const proofsDir = path.join(dir, "plugins", "house-rules", "proofs");
  fs.mkdirSync(proofsDir, { recursive: true });
  fs.writeFileSync(path.join(proofsDir, "REQUIRED-PROOFS.md"), "# Proofs\n\nText.\n", "utf8");

  fs.writeFileSync(path.join(dir, "plugins", "house-rules", "CHANGELOG.md"), "# Changelog\n\n---\n", "utf8");

  gitCommitAll(dir, "Initial state");
  return { rulesDir, proofsDir };
}

function appendJournalEntry(dir, docs) {
  const entry = `\n## ${todayLocal()} · Test entry\n\n**Documents:** ${docs}\n\n**For adopters:** nothing, self-test.\n`;
  fs.appendFileSync(path.join(dir, "plugins", "house-rules", "CHANGELOG.md"), entry, "utf8");
}

function runGuard(dir, args = []) {
  return spawnSync(process.execPath, [path.join(dir, "bin", "check-changes-logged.mjs"), ...args], {
    cwd: dir,
    encoding: "utf8",
  });
}

const sandbox = fs.mkdtempSync(path.join(tmpRoot, "check-changes-logged-self-test-"));

try {
  runCase("documents-untouched-is-silent", () => {
    const dir = path.join(sandbox, "s1");
    makeRepo(dir);
    // Edit a file the guard doesn't watch at all.
    fs.writeFileSync(path.join(dir, "README.md"), "not about rules\n", "utf8");
    const res = runGuard(dir);
    return (
      expect(res.status === 0, "exit 0 — plugin documents untouched", `exit ${res.status}\n${res.stdout}${res.stderr}`) ||
      expect(res.stdout.includes("not touched"), 'message "not touched"', res.stdout)
    );
  });

  runCase("edit-under-rules-without-an-entry-turns-red", () => {
    const dir = path.join(sandbox, "s2");
    const { rulesDir } = makeRepo(dir);
    fs.writeFileSync(path.join(rulesDir, "rules.md"), "# Rules\n\nEdit with no journal entry.\n", "utf8");
    const res = runGuard(dir);
    return (
      expect(res.status === 1, "exit 1 — changelog not touched at all", `exit ${res.status}\n${res.stdout}`) ||
      expect(res.stdout.includes("not touched at all"), 'message "not touched at all"', res.stdout)
    );
  });

  runCase("edit-under-rules-with-a-full-entry-is-green", () => {
    const dir = path.join(sandbox, "s3");
    const { rulesDir } = makeRepo(dir);
    fs.writeFileSync(path.join(rulesDir, "rules.md"), "# Rules\n\nEdit with an entry.\n", "utf8");
    appendJournalEntry(dir, "`rules/rules.md`");
    const res = runGuard(dir);
    return (
      expect(res.status === 0, "exit 0 — the document is named in today's entry", `exit ${res.status}\n${res.stdout}`) ||
      expect(res.stdout.includes("is there"), 'message "… is there"', res.stdout)
    );
  });

  // A different subfolder of the plugin (proofs/, not rules/) is watched too — the guard covers
  // the whole plugin tree, not one hand-picked folder.
  runCase("edit-under-proofs-without-an-entry-turns-red", () => {
    const dir = path.join(sandbox, "s4");
    const { proofsDir } = makeRepo(dir);
    fs.writeFileSync(path.join(proofsDir, "REQUIRED-PROOFS.md"), "# Proofs\n\nNew point, no entry.\n", "utf8");
    const res = runGuard(dir);
    return (
      expect(res.status === 1, "exit 1 — proofs/ is also watched", `exit ${res.status}\n${res.stdout}`) ||
      expect(res.stdout.includes("REQUIRED-PROOFS.md"), "REQUIRED-PROOFS.md named among touched documents", res.stdout)
    );
  });

  runCase("edit-under-proofs-with-an-entry-is-green", () => {
    const dir = path.join(sandbox, "s5");
    const { proofsDir } = makeRepo(dir);
    fs.writeFileSync(path.join(proofsDir, "REQUIRED-PROOFS.md"), "# Proofs\n\nNew point, honestly logged.\n", "utf8");
    appendJournalEntry(dir, "`proofs/REQUIRED-PROOFS.md`");
    const res = runGuard(dir);
    return expect(res.status === 0, "exit 0 — REQUIRED-PROOFS.md named in the entry", `exit ${res.status}\n${res.stdout}`);
  });

  runCase("entry-names-a-different-document-turns-red", () => {
    // Changelog was edited today, but about a DIFFERENT rule — the per-name check refuses to
    // count that.
    const dir = path.join(sandbox, "s6");
    const { rulesDir } = makeRepo(dir);
    fs.writeFileSync(path.join(rulesDir, "rules.md"), "# Rules\n\nEdit.\n", "utf8");
    appendJournalEntry(dir, "`some-other-file.md`");
    const res = runGuard(dir);
    return (
      expect(res.status === 1, "exit 1 — the touched document isn't named", `exit ${res.status}\n${res.stdout}`) ||
      expect(res.stdout.includes("don't name a touched document"), 'message "don\'t name a touched document"', res.stdout)
    );
  });

  runCase("staged-flag-only-sees-whats-staged", () => {
    const dir = path.join(sandbox, "s7");
    const { rulesDir } = makeRepo(dir);
    fs.writeFileSync(path.join(rulesDir, "rules.md"), "# Rules\n\nEdit in the index.\n", "utf8");
    git(dir, ["add", "plugins/house-rules/rules/rules.md"]);
    const res = runGuard(dir, ["--staged"]);
    return (
      expect(res.status === 1, "exit 1 — a staged rule with no entry", `exit ${res.status}\n${res.stdout}`) ||
      expect(res.stdout.includes("rules.md"), "document named", res.stdout)
    );
  });

  runCase("changelog-edit-alone-does-not-need-to-name-itself", () => {
    // The changelog lives inside WATCHED_DIR too (it moved into the plugin), but a fix to the
    // journal itself (a typo, a wording tweak) isn't a rule edit that needs its own entry — the
    // filter has to exclude the journal from the set of documents that require one.
    const dir = path.join(sandbox, "s11");
    makeRepo(dir);
    appendJournalEntry(dir, "`rules/rules.md`");
    const res = runGuard(dir);
    return expect(res.status === 0, "exit 0 — editing only the changelog needs no entry naming itself", `exit ${res.status}\n${res.stdout}`);
  });

  runCase("all-zero-base-is-nothing-to-compare-not-a-failure", () => {
    // GitHub sends this as `github.event.before` on a branch's first push — there's no commit on
    // the other end of it. Not a broken check, an empty range.
    const dir = path.join(sandbox, "s9");
    const { rulesDir } = makeRepo(dir);
    fs.writeFileSync(path.join(rulesDir, "rules.md"), "# Rules\n\nEdit with no journal entry.\n", "utf8");
    const zero = "0".repeat(40);
    const res = runGuard(dir, ["--since", zero]);
    return (
      expect(res.status === 0, "exit 0 — nothing to compare against", `exit ${res.status}\n${res.stdout}${res.stderr}`) ||
      expect(res.stdout.includes("nothing to compare"), 'message "nothing to compare"', res.stdout)
    );
  });

  runCase("unresolvable-base-is-nothing-to-compare-not-a-failure", () => {
    // A single-commit repository has no HEAD~1 — same answer, discovered only once git itself
    // refuses the ref.
    const dir = path.join(sandbox, "s10");
    const { rulesDir } = makeRepo(dir);
    fs.writeFileSync(path.join(rulesDir, "rules.md"), "# Rules\n\nEdit with no journal entry.\n", "utf8");
    const res = runGuard(dir, ["--since", "HEAD~50"]);
    return (
      expect(res.status === 0, "exit 0 — the ref doesn't resolve, nothing to compare", `exit ${res.status}\n${res.stdout}${res.stderr}`) ||
      expect(res.stdout.includes("nothing to compare"), 'message "nothing to compare"', res.stdout)
    );
  });

  runCase("new-uncommitted-file-is-seen-as-touched", () => {
    // git diff won't show a brand-new file at all — the guard must see it via ls-files --others.
    const dir = path.join(sandbox, "s8");
    const { rulesDir } = makeRepo(dir);
    fs.writeFileSync(path.join(rulesDir, "new-rule.md"), "# New rule\n", "utf8");
    const res = runGuard(dir);
    return (
      expect(res.status === 1, "exit 1 — a new rule document with no entry", `exit ${res.status}\n${res.stdout}`) ||
      expect(res.stdout.includes("new-rule.md"), "the new document is named", res.stdout)
    );
  });
} finally {
  fs.rmSync(sandbox, { recursive: true, force: true });
}

console.log(`\npassed ${passed} of ${total}`);
process.exit(passed === total ? 0 : 1);
