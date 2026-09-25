#!/usr/bin/env node
// Self-test for bin/check-public-clean.mjs — the guard that keeps this public repo clean.
//
// Builds a sandbox git repository (mkdtempSync + git init) with a copy of the tool, then writes
// fixture files into it. Every "bad" fixture string is assembled at RUNTIME (concatenation,
// character codes, array joins) rather than written as a contiguous literal in this file's own
// source — otherwise this very self-test file would trip the guard it's testing, the same trap
// the guard's own source avoids around the home-directory path prefix it hunts for.
//
// Run: node bin/check-public-clean.self-test.mjs
// Output: OK <case> / FAIL <case>: <reason>, ending with "passed N of M", exit code 0/1.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { scanLine } from "./check-public-clean.mjs";

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

function gitInit(dir) {
  fs.mkdirSync(dir, { recursive: true });
  git(dir, ["init", "-q", "-b", "main"]);
  git(dir, ["config", "user.email", "self-test@noreply.example.com"]);
  git(dir, ["config", "user.name", "Self Test"]);
  git(dir, ["config", "commit.gpgsign", "false"]);
}

/** A fresh sandbox repo: a copy of bin/, git-initialized, nothing committed yet. */
function makeRepo(dir) {
  gitInit(dir);
  fs.mkdirSync(path.join(dir, "bin"), { recursive: true });
  fs.copyFileSync(path.join(REPO_ROOT, "bin", "check-public-clean.mjs"), path.join(dir, "bin", "check-public-clean.mjs"));
}

function runTool(dir) {
  const res = spawnSync(process.execPath, [path.join(dir, "bin", "check-public-clean.mjs")], {
    cwd: dir,
    encoding: "utf8",
  });
  return { ...res, out: `${res.stdout}${res.stderr}` };
}

// ---- fixture strings, assembled indirectly so no forbidden literal sits in this source -------

const cyrillicChar = String.fromCharCode(0x0440); // one Cyrillic letter, built from its code point, never typed literally
const greekChar = String.fromCharCode(0x03b1); // one Greek letter
const hebrewChar = String.fromCharCode(0x05d0); // one Hebrew letter
const arabicChar = String.fromCharCode(0x0627); // one Arabic letter
const cjkChar = String.fromCharCode(0x4e2d); // one CJK ideograph
const hangulChar = String.fromCharCode(0xac00); // one Hangul syllable
// What must stay ALLOWED even though it's non-ASCII: emoji and the typographic punctuation this
// very prose uses throughout — em dash, curly quotes, ellipsis, an arrow. None of these are
// characters from a script the guard blocks; a net wide enough to catch them would also flag every
// other document in this repository.
const allowedNonLatin = "— “quoted” … → \u{1F600}";
const badEmail = "person" + "@" + "example.com"; // not "noreply" — split around "@" in the source
const okEmail = "team" + "@" + "no" + "reply.example.com"; // contains "noreply" once joined
const badIpv4 = [198, 51, 100, 23].join("."); // TEST-NET-2 (RFC 5737), assembled from octets
const okIpv4a = [127, 0, 0, 1].join(".");
const okIpv4b = [0, 0, 0, 0].join(".");
const homePathPrefix = "/" + "Users" + "/"; // the very prefix the guard hunts for

// ---- pure-logic cases on scanLine() (no disk) -------------------------------------------------

runCase("clean-line-no-complaints", () => {
  const problems = scanLine("export function greet(name) { return `Hello, ${name}!`; }");
  return expect(problems.length === 0, "no complaints", JSON.stringify(problems));
});

runCase("cyrillic-character-is-flagged", () => {
  const problems = scanLine(`a comment with one letter: ${cyrillicChar}`);
  return expect(problems.some((p) => p.includes("non-Latin")), "names a non-Latin script character", JSON.stringify(problems));
});

runCase("greek-character-is-flagged", () => {
  const problems = scanLine(`a comment with one letter: ${greekChar}`);
  return expect(problems.some((p) => p.includes("non-Latin")), "names a non-Latin script character", JSON.stringify(problems));
});

runCase("hebrew-character-is-flagged", () => {
  const problems = scanLine(`a comment with one letter: ${hebrewChar}`);
  return expect(problems.some((p) => p.includes("non-Latin")), "names a non-Latin script character", JSON.stringify(problems));
});

runCase("arabic-character-is-flagged", () => {
  const problems = scanLine(`a comment with one letter: ${arabicChar}`);
  return expect(problems.some((p) => p.includes("non-Latin")), "names a non-Latin script character", JSON.stringify(problems));
});

runCase("cjk-character-is-flagged", () => {
  const problems = scanLine(`a comment with one letter: ${cjkChar}`);
  return expect(problems.some((p) => p.includes("non-Latin")), "names a non-Latin script character", JSON.stringify(problems));
});

runCase("hangul-character-is-flagged", () => {
  const problems = scanLine(`a comment with one letter: ${hangulChar}`);
  return expect(problems.some((p) => p.includes("non-Latin")), "names a non-Latin script character", JSON.stringify(problems));
});

runCase("emoji-and-typographic-punctuation-stay-allowed", () => {
  // Em dash, curly quotes, ellipsis, an arrow, an emoji — none of them are script characters, and
  // this repository's own prose is full of them. They must never trip this guard.
  const problems = scanLine(`a line using ${allowedNonLatin} on purpose`);
  return expect(problems.length === 0, "no complaints — emoji and typographic punctuation are allowed", JSON.stringify(problems));
});

runCase("byte-order-mark-stays-allowed", () => {
  // U+FEFF sits numerically inside the Arabic Presentation Forms-B block, but it's the BOM, a
  // format character — not an Arabic ligature. agents-md.mjs strips exactly this character from a
  // file it reads; flagging it here would make that stripping code fail this very guard.
  const bom = String.fromCharCode(0xfeff);
  const problems = scanLine(`${bom}# Rules`);
  return expect(problems.length === 0, "no complaints — the byte-order mark is not a script character", JSON.stringify(problems));
});

runCase("ordinary-email-is-flagged", () => {
  const problems = scanLine(`contact: ${badEmail}`);
  return expect(problems.some((p) => p.includes(badEmail)), "names the email address", JSON.stringify(problems));
});

runCase("noreply-email-is-allowed", () => {
  const problems = scanLine(`contact: ${okEmail}`);
  return expect(problems.length === 0, "no complaints — noreply is allowed", JSON.stringify(problems));
});

runCase("ordinary-ipv4-is-flagged", () => {
  const problems = scanLine(`server: ${badIpv4}`);
  return expect(problems.some((p) => p.includes(badIpv4)), "names the IPv4 address", JSON.stringify(problems));
});

runCase("loopback-and-wildcard-ipv4-are-allowed", () => {
  const problems = scanLine(`listen on ${okIpv4a} or ${okIpv4b}`);
  return expect(problems.length === 0, "no complaints — loopback/wildcard are allowed", JSON.stringify(problems));
});

runCase("home-path-prefix-is-flagged", () => {
  const problems = scanLine(`path: ${homePathPrefix}someone/src/project`);
  return expect(problems.some((p) => p.includes("path")), "names the home path prefix", JSON.stringify(problems));
});

// ---- subprocess cases: a real sandbox repository, four mutations that must turn the tool red --

const sandbox = fs.mkdtempSync(path.join(tmpRoot, "check-public-clean-self-test-"));

try {
  runCase("clean-tree-is-green", () => {
    const dir = path.join(sandbox, "s1");
    makeRepo(dir);
    fs.writeFileSync(path.join(dir, "README.md"), "# Sample\n\nNothing but plain English text here.\n", "utf8");
    git(dir, ["add", "-A"]);
    const res = runTool(dir);
    return (
      expect(res.status === 0, "exit 0 — clean tree", `exit ${res.status}\n${res.out}`) ||
      expect(res.out.includes("all clean"), 'message "all clean"', res.out)
    );
  });

  runCase("mutation-cyrillic-character-turns-it-red", () => {
    const dir = path.join(sandbox, "s2");
    makeRepo(dir);
    fs.writeFileSync(path.join(dir, "notes.md"), `# Notes\n\nLine with ${cyrillicChar} in it.\n`, "utf8");
    git(dir, ["add", "-A"]);
    const res = runTool(dir);
    return (
      expect(res.status === 1, "exit 1 — a non-Latin script character is present", `exit ${res.status}\n${res.out}`) ||
      expect(res.out.includes("non-Latin"), 'names "non-Latin"', res.out) ||
      expect(res.out.includes("notes.md:3"), "names the file and line", res.out)
    );
  });

  runCase("mutation-real-email-turns-it-red", () => {
    const dir = path.join(sandbox, "s3");
    makeRepo(dir);
    fs.writeFileSync(path.join(dir, "contact.md"), `# Contact\n\nReach ${badEmail} for details.\n`, "utf8");
    git(dir, ["add", "-A"]);
    const res = runTool(dir);
    return (
      expect(res.status === 1, "exit 1 — a real email address is present", `exit ${res.status}\n${res.out}`) ||
      expect(res.out.includes(badEmail), "names the email address", res.out)
    );
  });

  runCase("noreply-email-stays-green", () => {
    const dir = path.join(sandbox, "s3b");
    makeRepo(dir);
    fs.writeFileSync(path.join(dir, "contact.md"), `# Contact\n\nBot mail: ${okEmail}\n`, "utf8");
    git(dir, ["add", "-A"]);
    const res = runTool(dir);
    return expect(res.status === 0, "exit 0 — noreply address is allowed", `exit ${res.status}\n${res.out}`);
  });

  runCase("mutation-real-ipv4-turns-it-red", () => {
    const dir = path.join(sandbox, "s4");
    makeRepo(dir);
    fs.writeFileSync(path.join(dir, "infra.md"), `# Infra\n\nServer at ${badIpv4}.\n`, "utf8");
    git(dir, ["add", "-A"]);
    const res = runTool(dir);
    return (
      expect(res.status === 1, "exit 1 — a real IPv4 address is present", `exit ${res.status}\n${res.out}`) ||
      expect(res.out.includes(badIpv4), "names the IPv4 address", res.out)
    );
  });

  runCase("loopback-and-wildcard-ipv4-stay-green", () => {
    const dir = path.join(sandbox, "s4b");
    makeRepo(dir);
    fs.writeFileSync(path.join(dir, "infra.md"), `# Infra\n\nBind ${okIpv4a} or ${okIpv4b}.\n`, "utf8");
    git(dir, ["add", "-A"]);
    const res = runTool(dir);
    return expect(res.status === 0, "exit 0 — loopback/wildcard are allowed", `exit ${res.status}\n${res.out}`);
  });

  runCase("mutation-home-path-prefix-turns-it-red", () => {
    const dir = path.join(sandbox, "s5");
    makeRepo(dir);
    fs.writeFileSync(path.join(dir, "setup.md"), `# Setup\n\nCheckout lives at ${homePathPrefix}someone/project.\n`, "utf8");
    git(dir, ["add", "-A"]);
    const res = runTool(dir);
    return (
      expect(res.status === 1, "exit 1 — a home path prefix is present", `exit ${res.status}\n${res.out}`) ||
      expect(res.out.includes(homePathPrefix), "names the path prefix", res.out)
    );
  });

  runCase("untracked-non-ignored-file-is-scanned", () => {
    const dir = path.join(sandbox, "s6");
    makeRepo(dir);
    fs.writeFileSync(path.join(dir, "README.md"), "# Sample\n\nClean.\n", "utf8");
    git(dir, ["add", "README.md"]);
    // Never staged, never committed — still not gitignored, so it must be scanned.
    fs.writeFileSync(path.join(dir, "scratch.md"), `Leftover note with ${badEmail} in it.\n`, "utf8");
    const res = runTool(dir);
    return (
      expect(res.status === 1, "exit 1 — the untracked file is scanned too", `exit ${res.status}\n${res.out}`) ||
      expect(res.out.includes("scratch.md"), "names the untracked file", res.out)
    );
  });

  runCase("gitignored-file-is-not-scanned", () => {
    const dir = path.join(sandbox, "s7");
    makeRepo(dir);
    fs.writeFileSync(path.join(dir, ".gitignore"), "ignored.md\n", "utf8");
    fs.writeFileSync(path.join(dir, "README.md"), "# Sample\n\nClean.\n", "utf8");
    git(dir, ["add", "-A"]);
    fs.writeFileSync(path.join(dir, "ignored.md"), `Should never be read: ${badEmail}\n`, "utf8");
    const res = runTool(dir);
    return expect(res.status === 0, "exit 0 — an ignored file is never scanned", `exit ${res.status}\n${res.out}`);
  });

  runCase("binary-file-is-skipped-not-crashed-on", () => {
    const dir = path.join(sandbox, "s8");
    makeRepo(dir);
    fs.writeFileSync(path.join(dir, "README.md"), "# Sample\n\nClean.\n", "utf8");
    fs.writeFileSync(path.join(dir, "blob.bin"), Buffer.from([0, 1, 2, 3, 255, 254, 0, 10]));
    git(dir, ["add", "-A"]);
    const res = runTool(dir);
    return (
      expect(res.status === 0, "exit 0 — a binary file is skipped, not scanned as text", `exit ${res.status}\n${res.out}`) ||
      expect(!res.out.includes("blob.bin"), "the binary file isn't named as a problem", res.out)
    );
  });
} finally {
  fs.rmSync(sandbox, { recursive: true, force: true });
}

console.log(`\npassed ${passed} of ${total}`);
process.exit(passed === total ? 0 : 1);
