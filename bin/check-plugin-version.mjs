#!/usr/bin/env node
// Guard: an edit inside a plugin's directory must bump its version number.
//
// Why it exists. A plugin is delivered NOT as a live link to the source directory, but as a copy
// taken at install time. The updater compares the version number, not the content: same number,
// it answers "already the latest version" and leaves the cached copy untouched. A plugin whose
// number never moves means an edit never reaches a single machine, and nothing says so —
// there's no error, only silence.
//
// Usage:
//   node bin/check-plugin-version.mjs                 # compare HEAD with the previous commit
//   node bin/check-plugin-version.mjs <from> <to>     # compare arbitrary revisions
//
// Exit code: 0 — every touched plugin bumped its version, OR there's no base to compare against
// yet (the repository's first commit, an all-zero base from CI on the first push to a branch —
// see isMissingBase); 1 — a touched plugin didn't bump its version.

import { execFileSync } from "node:child_process";

const PLUGIN_MANIFEST = ".claude-plugin/plugin.json";

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

/** Content of a file at a given revision; null means the file didn't exist there. */
function fileAt(rev, path, cwd) {
  try {
    return git(["show", `${rev}:${path}`], cwd);
  } catch {
    return null;
  }
}

/**
 * Compares "major.minor.patch"-style versions: -1 if a is older than b, 0 if equal, 1 if newer.
 * Non-numeric tails ("0.7.0-rc1") are compared as numbers by their leading digits — good enough
 * for this guard's job (did it go down?), full semver isn't worth pulling in here.
 */
export function compareVersions(a, b) {
  const parse = (v) => String(v).split(".").map((x) => parseInt(x, 10) || 0);
  const [pa, pb] = [parse(a), parse(b)];
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

function versionAt(rev, pluginDir, cwd) {
  const raw = fileAt(rev, `${pluginDir}/${PLUGIN_MANIFEST}`, cwd);
  if (raw === null) return null;
  try {
    return JSON.parse(raw).version ?? null;
  } catch {
    return null;
  }
}

/**
 * Checks a commit range. Returns a list of complaints (empty means all good). Exported for the
 * self-test — it runs this same function against real sandbox repositories.
 */
export function checkRange(from, to, cwd = process.cwd()) {
  const changed = git(["diff", "--name-only", `${from}`, `${to}`], cwd)
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  // Plugin directories are taken from the changes themselves: no list of plugins is hard-coded
  // anywhere, and hard-coding one would just be a second thing that can silently drift from the
  // first.
  const touched = new Set();
  for (const file of changed) {
    const parts = file.split("/");
    if (parts.length >= 2 && parts[0] === "plugins") touched.add(`plugins/${parts[1]}`);
  }

  const complaints = [];
  for (const pluginDir of [...touched].sort()) {
    const before = versionAt(from, pluginDir, cwd);
    const after = versionAt(to, pluginDir, cwd);

    // The plugin was created within this range — nothing to bump.
    if (before === null) continue;

    if (after === null) {
      complaints.push(`${pluginDir}: manifest ${PLUGIN_MANIFEST} is gone or unreadable`);
      continue;
    }
    if (before === after) {
      complaints.push(
        `${pluginDir}: files changed, but the version stayed ${after} — the cached copy on machines won't update`
      );
    } else if (compareVersions(after, before) < 0) {
      // A downgrade is worse than a missing bump: the updater compares the NUMBER, so a machine
      // on 0.6.0 will decide it's already newer and won't take this edit, or any that follow,
      // until the version climbs back past 0.6.0. The edit disappears with no error at all.
      complaints.push(
        `${pluginDir}: version was LOWERED ${before} -> ${after} — machines on the old number won't take the edit at all`
      );
    }
  }
  return complaints;
}

// GitHub sends this as `github.event.before` on the very first push to a branch — there's no
// commit on the other end of it. Not a broken comparison, an empty one.
const ALL_ZERO_SHA = /^0+$/;

/** A git error that means "the ref doesn't resolve" rather than "something is actually broken". */
export function isMissingBase(err) {
  const msg = String((err && err.stderr) || (err && err.message) || "");
  return /unknown revision|bad revision|ambiguous argument|fatal: bad object|fatal: ambiguous/i.test(msg);
}

function main() {
  const args = process.argv.slice(2);
  const from = args[0] ?? "HEAD~1";
  const to = args[1] ?? "HEAD";

  if (ALL_ZERO_SHA.test(from)) {
    console.log(`Plugin versions: base "${from}" is the all-zero sha (first push) — nothing to compare against.`);
    return;
  }

  let complaints;
  try {
    complaints = checkRange(from, to);
  } catch (err) {
    if (isMissingBase(err)) {
      console.log(`Plugin versions: couldn't resolve ${from}..${to} — probably the first commit, nothing to compare.`);
      return;
    }
    console.error(`Couldn't compare ${from}..${to}: ${err.message}`);
    process.exit(1);
  }

  if (complaints.length === 0) {
    console.log(`Plugin versions are in order (${from}..${to}).`);
    return;
  }

  console.error("A plugin edit didn't bump the version:\n");
  for (const c of complaints) console.error(`  ✗ ${c}`);
  console.error(
    "\nBump the version in the manifest in the same commit — otherwise the edit reaches no machine\nat all, and nothing will say so: there's no error, only silence."
  );
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
