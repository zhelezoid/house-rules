#!/usr/bin/env node
// Spec <-> test map builder — portable template. Walks specs/<slot>/*.md and test files,
// builds specs/TEST-MAP.md: which specs are actually guarded by a test, and which are only
// claimed on paper. A script, not a model: deterministic, no judgment calls — a human or an
// auditor agent (test-auditor) reasons on top of this map.
// Run from repo root: `node specs/test-map.mjs [--check|--gate]`.
//
// PORTING TO A NEW PROJECT: edit ONLY the "PROJECT SETTINGS" block below — everything after it
// is generic. The most important knob is ROUTE_SPECIFIER_PATTERNS (what counts as a "route"):
// get it wrong and the WHOLE map lies — it silently confuses "checked the wiring" with "checked
// a nearby function". Check it first when adapting to a non-Next.js stack.

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SPECS_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(SPECS_DIR); // specs/ -> repo root (not process.cwd() — same as
// build-index.mjs, works no matter where `node` is invoked from)
const OUT_FILE = join(SPECS_DIR, 'TEST-MAP.md');

// Project name for the report title — DELIBERATELY not `basename(REPO_ROOT)` (the checkout
// folder name). Same defect class as the git dates in staleNote below: "a file that --check
// compares byte-for-byte must not contain anything that depends on the run environment" — and a
// checkout folder name differs between CI and a local machine all the time (GITHUB_WORKSPACE, a
// second clone under a different name, etc.), so the title would drift with zero meaningful
// change. Sources, most reliable first, both live in git rather than in one machine's
// filesystem:
//   1. `name` from package.json at repo root — if present, it's the project author's own choice;
//   2. the last segment of `git remote get-url origin` (without `.git`) — works without a
//      package.json too;
//   3. neither — don't fill in a name, the title stays neutral.
function resolveProjectName() {
  try {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
    if (pkg && typeof pkg.name === 'string' && pkg.name.trim()) return pkg.name.trim();
  } catch {
    // no package.json / not JSON / no name field — try the next source
  }
  try {
    const url = execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }).trim();
    const last = url.split(/[\/:]/).filter(Boolean).pop();
    const name = last ? last.replace(/\.git$/, '') : '';
    if (name) return name;
  } catch {
    // not a git repo / no remote origin — no sources left
  }
  return null;
}
const PROJECT_NAME = resolveProjectName();

// ============================================================================================
// PROJECT SETTINGS — the only block to edit when porting into another repository.
// ============================================================================================

// --- 1. Where specs live ---------------------------------------------------------------------
// Scans active/ (in progress) and done/ (shipped — tests stay a regression gate), same as
// check-acceptance.mjs. ideas/ and reference/ are out of scope for this map (no acceptance runs
// there).
const SCAN_SLOTS = ['active', 'done'];

// --- 2. Where tests live -----------------------------------------------------------------
// Folders RELATIVE to repo root, scanned individually and NOT recursively (a flat folder, as in
// the originating project's __tests__/). A missing folder is silently skipped, the map doesn't
// fail. Common variants: Next.js/vitest — `__tests__`; Node/jest/mocha — `test` or `tests`; a
// monorepo with tests next to source won't fit here without adding recursion.
const TEST_DIRS = ['__tests__', 'test', 'tests'];

// --- 3. What a test file name looks like ---------------------------------------------------
// Suffix of a file name inside TEST_DIRS that counts as a test.
const TEST_FILE_RE = /\.(test\.tsx?|test\.jsx?|test\.mjs|test\.cjs|spec\.tsx?|spec\.jsx?)$/;

// --- 4. How a spec's acceptance block invokes a test ---------------------------------------
// List of "test run command" regexes with ONE capture group — the rest of the line with the
// test arguments (files/globs). Matches are tokenized to find tokens that look like a test path
// (see TEST_DIRS/TEST_FILE_RE) — that's what "tests the spec actually calls" means.
//
// The first entry is the originating project's convention: a bash helper `run_tests
// <files...>`, declared in the PRELUDE of check-acceptance.mjs. It FAILS if the file doesn't
// exist — a plain `npx vitest run <files>` instead treats a missing name as an EMPTY FILTER and
// silently exits 0 (a trap found by review in that project: three acceptance points looked
// verified even though the test file had been deleted). If your project has no such helper,
// build one on the same model (see check-acceptance.mjs) and uncomment the pattern you need
// below INSTEAD OF/ALONGSIDE it.
//
// WARNING: without a helper, the runner decides on its own what to do with a missing file —
// sometimes that's a silent 0. After uncommenting any pattern below, verify your runner's
// behavior on a deliberately missing file before trusting the map as a gate.
const TEST_INVOCATION_PATTERNS = [
  /(?:^|[\n;&|]\s*)run_tests\s+([^\n]+)/g,
  // /(?:^|[\n;&|]\s*)node\s+--test\s+([^\n]+)/g,           // node:test
  // /(?:^|[\n;&|]\s*)npx?\s+vitest\s+run\s+([^\n]+)/g,     // vitest without a helper
  // /(?:^|[\n;&|]\s*)npx?\s+jest\s+([^\n]+)/g,             // jest
  // /(?:^|[\n;&|]\s*)npx?\s+mocha\s+([^\n]+)/g,            // mocha
];

// --- 5. What counts as a "route" — THE MOST IMPORTANT PARAMETER ----------------------------
// Distinguishes "checked the wiring" (the test boots the real HTTP request handler) from
// "checked a nearby function" (the test calls a plain function that the real handler happens to
// call — and that call site is checked by NOTHING). Set this wrong and the WHOLE map lies; it's
// the first thing to re-verify when porting to a different stack.
//
// ROUTE_SPECIFIER_PATTERNS is matched against the test's IMPORT SPECIFIERS (`from '...'`,
// `import('...')`), not against the test's own path. Empty means the project has no concept of
// "route" at all (a pure batch job with no HTTP surface, say): every spec then honestly settles
// into "module"/"structural", which is expected and true, not a bug.
//
// Ready-made options (uncomment/replace for your stack):
//   Next.js App Router (DEFAULT) — importing app/api/.../route.ts, any path (alias or
//     relative): .../route or .../route.ts(x)
//   Express/Fastify — importing a router/controller file: /routes/, /controllers/
//     ROUTE_SPECIFIER_PATTERNS: [/\/routes?\//, /\/controllers?\//]
//   Plain HTTP handler (Lambda/Netlify Functions etc.) — handler.ts/handler.js under a
//     functions folder: ROUTE_SPECIFIER_PATTERNS: [/\/functions\/.+\/handler(\.[jt]s)?$/]
const ROUTE_SPECIFIER_PATTERNS = [
  /\/route(\.tsx?)?$/,
];
// Fallback for stacks where a route isn't a separately importable file (e.g. an Express app
// assembled in one src/app.js, tested by booting it whole via supertest). Matched against the
// RAW TEXT of the test file, not a specifier. Empty by default.
//   example: [/supertest\(\s*app\s*\)/]
const ROUTE_CONTENT_PATTERNS = [];

// --- 6. What an internal repo import looks like ------------------------------------------
// Aliases (tsconfig/jsconfig paths) counted as "inside the repo" — relative `./`/`../` always
// count too, no need to touch that. Other alias examples: `~/`, `#/`.
const INTERNAL_IMPORT_ALIASES = ['@/'];

// --- 7. Where to find the coverage report (a hint, not a required input) -------------------
const COVERAGE_SUMMARY_PATH = join(REPO_ROOT, 'coverage', 'coverage-summary.json');

// ============================================================================================
// End of settings block — everything below is generic, no need to touch it.
// ============================================================================================

const args = new Set(process.argv.slice(2));
const MODE_CHECK = args.has('--check');
const MODE_GATE = args.has('--gate');

// ---------- parsing a single spec: shared with build-index.mjs and check-acceptance.mjs ----------

// Pull the value of a single-line key out of YAML front matter (between the first --- ... ---).
// Copy of build-index.mjs's logic — that file isn't touched, but the parser matches it.
function frontmatter(text) {
  const m = text.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!m) return null;
  const fm = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '');
  }
  return fm;
}

// Extract all ```acceptance ... ``` blocks — with a line-by-line state machine, not one regex.
//
// Why not a regex (the way check-acceptance.mjs does it — that file runs each block ISOLATED
// through spawnSync and doesn't need to tell "empty" from "unclosed" apart; a broken block just
// executes as an empty script and fails on its own). Here it's the opposite: we need to tell
// these two cases apart precisely, and a single-regex approach conflates them. The concrete trap
// (found by review in the originating project): for an EMPTY block —
//   ```acceptance
//   ```
// — there is no "\n" left in reserve between the opening and closing line: the newline after
// "acceptance" is consumed by the opening pattern's `\s*\n`, and the very next character is
// already the closing "```" itself, without a leading "\n" of its own. The regex's closing
// requirement "\n```" finds no match right there, and either matches the next "\n```" further
// down the file (merging two distinct blocks into one) or matches nothing at all — both outcomes
// read as "marker without a pair", even though the block is in fact closed, just empty. The state
// machine reads line by line and compares the whole (trimmed) line to the marker phrase — an
// empty block is a perfectly ordinary case for it (bodyLines stays an empty array), not a regex
// edge case. It also fixes an old nuisance for free: a prose line like "...removed the fence
// ```acceptance from the spec..." (a comment describing the syntax itself) doesn't trigger an
// open, because the trimmed line isn't exactly "```acceptance".
function acceptanceBlocks(text) {
  const blocks = [];
  let bodyLines = null; // null — outside a block; array — accumulating the current block's body
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (bodyLines === null) {
      if (line === '```acceptance') bodyLines = [];
    } else if (line === '```') {
      blocks.push(bodyLines.join('\n'));
      bodyLines = null;
    } else {
      bodyLines.push(raw);
    }
  }
  // bodyLines !== null here means: an opening marker was seen, but no matching closing "```"
  // line was found before the end of the file — that's a genuinely broken format (not an empty
  // block).
  return { blocks, malformed: bodyLines !== null };
}

// The "## Acceptance criteria" section — from the heading to the next "## " (or end of file).
function acceptanceCriteriaSection(text) {
  const lines = text.split('\n');
  let start = -1;
  let end = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (start === -1 && /^##\s+Acceptance criteria\s*$/.test(lines[i])) {
      start = i + 1;
      continue;
    }
    if (start !== -1 && /^##\s+/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return start === -1 ? '' : lines.slice(start, end).join('\n');
}

// The "(machine...)" marker is NOT matched literally: real specs qualify it — "(machine, staging)",
// "(machine, post-deploy)", "(machine, after migration)", etc. Anything is treated as a machine
// item as long as the parenthesis STARTS with "(machine" (case-insensitive) — what follows the
// comma doesn't affect classification, but the exact form is collected separately for the report
// (see `machineMarkerForm`/`markerFormCounts` below), so the variety stays visible instead of
// hiding behind one narrow case. Real finding: a security spec with several closed items was
// invisible to the mapper while it required an exact "(machine)" — in practice there were many
// qualified forms in the wild.
const MACHINE_MARKER_RE = /\(machine[^)]*\)/i;

// The exact marker form found in an item's text — "(machine)", "(machine, staging)", ... — null if
// the item has no marker at all. Only needed for the summary (a human should see there's more
// than one form).
function machineMarkerForm(item) {
  const m = item.match(MACHINE_MARKER_RE);
  return m ? m[0] : null;
}

// State of a SINGLE machine item — three distinct diagnoses, not one "no check":
//   closed — "- [x] (machine…" — the spec CLAIMS the invariant is guarded;
//   open   — "- [ ] (machine…" — work honestly hasn't started, nothing to guard yet;
//   struck — the item's text is struck through entirely "~~…~~" — retired along with its
//            mechanism.
// Mixing them in classify() is not allowed (see below) — otherwise "work not started" would
// paint the gate the same red as a real hole (a real finding: specs were, in practice, falsely
// declared holes this way).
function machineItemState(item) {
  const checked = /^-\s*\[[xX]\]/.test(item);
  const rest = item.replace(/^-\s*\[[ xX]\]\s*/, '').trim();
  if (/^~~[\s\S]*~~$/.test(rest)) return 'struck';
  return checked ? 'closed' : 'open';
}

// Texts of items marked "(machine…)". An item is a "- [ ]"/"- [x]" line; its text may continue
// onto following (non-bullet, non-empty) lines — those are glued onto the same item, so a marker
// after a line break isn't lost. Returns an array of full item texts — needed both for counting
// (`.length`) and for the risk-signal search (only inside the spec's OWN CLAIMS, not the
// executable block's commands), and for per-item state classification (machineItemState).
function extractMachineItems(section) {
  const lines = section.split('\n');
  const items = [];
  let item = null;
  const flush = () => {
    if (item !== null && MACHINE_MARKER_RE.test(item)) items.push(item);
  };
  for (const raw of lines) {
    if (/^-\s*\[[ xX]\]/.test(raw)) {
      flush();
      item = raw;
    } else if (item !== null) {
      if (raw.trim() === '' || /^##\s+/.test(raw)) {
        flush();
        item = null;
      } else {
        item += ' ' + raw.trim();
      }
    }
  }
  flush();
  return items;
}
function countMachineItems(section) {
  return extractMachineItems(section).length;
}

// The literal string "test not applicable: <reason>" — an explicit, justified exception (a spec
// edge case). Searched across the whole spec text, not just the Acceptance section — the
// justification usually lives near Edge cases, not inside the checklist.
//
// Trap: a spec describing THIS mechanism might itself contain the literal template text
// "...literal string `test not applicable: <reason>` in the spec..." — an unapplied placeholder,
// not a real use. Told apart from a real use by the placeholder: if whatever follows the colon
// itself starts with "<" (an unfilled `<reason>`), it's not a real reason and the match is
// skipped.
function exceptionReason(text) {
  for (const m of text.matchAll(/test not applicable:\s*(.+)/g)) {
    const reason = m[1].trim().replace(/[`*]+$/, '');
    if (reason.startsWith('<')) continue;
    return reason;
  }
  return null;
}

// Exec lines of a block: non-empty, not comments. At least one present means "this block has a
// machine check" — not necessarily a test invocation, could be grep/forbid_*/test -f.
function execLines(block) {
  return block
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));
}

// A simple quote-aware tokenizer — for TEST_INVOCATION_PATTERNS and for the "path inside a grep
// line" heuristic.
function tokenize(line) {
  return (line.match(/'[^']*'|"[^"]*"|\S+/g) || []).map((t) => t.replace(/^['"]|['"]$/g, ''));
}

// A token looks like a test file path — either it lives in one of TEST_DIRS, or its name ends
// with TEST_FILE_RE (works for a bare file name too, without a directory in the argument).
function looksLikeTestToken(tok) {
  if (TEST_DIRS.some((d) => tok === d || tok.startsWith(`${d}/`))) return true;
  return TEST_FILE_RE.test(tok);
}

// A crude shell-glob-to-RegExp translation (`test/*.test.mjs`) — only `*` -> "any characters",
// everything else escaped. Enough for the simple single-level globs typical of acceptance
// blocks; globs with `**`/`?`/character classes aren't understood by this function — such a
// token simply finds no match in discoveredTestFiles and silently drops out (not counted as a
// reference).
function globToRegExp(glob) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

// Test files invoked via TEST_INVOCATION_PATTERNS across all of a spec's blocks combined. Glob
// tokens (`test/*.test.mjs`) are expanded against the REAL test files found
// (allTestFiles — the result of discoverTestFiles()), not against the filesystem directly — so
// the map never confuses "the runner called files by this mask" with "a file matches the mask,
// but the runner won't touch it".
function extractRunTestsFiles(blocksJoined, allTestFiles) {
  const files = new Set();
  for (const pattern of TEST_INVOCATION_PATTERNS) {
    pattern.lastIndex = 0;
    let m;
    while ((m = pattern.exec(blocksJoined)) !== null) {
      for (const tok of tokenize(m[1])) {
        if (tok.startsWith('-')) continue; // a flag like -t '<name>' — not a path
        if (!looksLikeTestToken(tok)) continue;
        if (tok.includes('*')) {
          const re = globToRegExp(tok);
          for (const f of allTestFiles) if (re.test(f)) files.add(f);
        } else {
          files.add(tok);
        }
      }
    }
  }
  return [...files];
}

// Code paths mentioned in a block's grep/forbid_grep/forbid_file_grep/git grep/test lines.
// "Keep it simple" (this measurer's guiding principle): take any token on the line that looks
// like a code file path (has a slash or a known extension, isn't a test file). Sometimes this
// will accidentally be part of a SEARCH PATTERN (a grep pattern in quotes) rather than a target —
// the cost of that mistake is low: a git log on such a "path" just finds no commits and the pair
// silently drops out of the freshness section (no fabricating).
const CODE_PATH_RE = /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*\.(?:ts|tsx|js|jsx|mjs|cjs|json|conf|ya?ml|md|env|css|txt)$/;
function extractCodePaths(blocksJoined) {
  const paths = new Set();
  for (const raw of blocksJoined.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (/^run_tests\b/.test(line)) continue; // test files are a separate category (calls
    // caught by TEST_INVOCATION_PATTERNS never reach here: the allow-list below only lets in
    // grep/forbid_*/git grep/test lines, a test-runner invocation doesn't qualify)
    if (!/^(forbid\s+)?(git\s+grep|grep|forbid_grep|forbid_file_grep|test)\b/.test(line)) continue;
    for (const tok of tokenize(line)) {
      if (tok.startsWith('-')) continue;
      if (looksLikeTestToken(tok)) continue;
      if (CODE_PATH_RE.test(tok)) paths.add(tok);
    }
  }
  return [...paths];
}

// All import specifiers of a file — static `from "…"` and dynamic `import("…")`.
function importSpecifiers(content) {
  const specs = [];
  const staticRe = /from\s+['"]([^'"]+)['"]/g;
  const dynamicRe = /import\(\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = staticRe.exec(content)) !== null) specs.push(m[1]);
  while ((m = dynamicRe.exec(content)) !== null) specs.push(m[1]);
  return specs;
}

// Route handler — see settings § 5 (ROUTE_SPECIFIER_PATTERNS/ROUTE_CONTENT_PATTERNS).
function isRouteSpecifier(spec) {
  return ROUTE_SPECIFIER_PATTERNS.some((re) => re.test(spec));
}
function isRouteContent(content) {
  return ROUTE_CONTENT_PATTERNS.some((re) => re.test(content));
}

// An internal repo import (not an external package, not node:*, not a test framework): one of
// INTERNAL_IMPORT_ALIASES (settings § 6) or a relative `./`/`../` onto a repo file — e.g.
// `../specs/check-acceptance.mjs`, `../lib/util.mjs`.
function isInternalSpecifier(spec) {
  if (INTERNAL_IMPORT_ALIASES.some((prefix) => spec.startsWith(prefix))) return true;
  return spec.startsWith('./') || spec.startsWith('../');
}

// How deep the spec's invoked tests actually reach — PER FILE, not just an overall boolean: a
// spec may call three tests, and only one of them boots a route (wiring — the only thing that's
// sufficient for money/security/PII), while the rest only check a plain function. We return the
// breakdown so this partial coverage stays visible in the report (see `partialNote` in
// classify()), rather than getting lost inside a single "route" verdict.
function testFileDepth(files) {
  const routeFiles = [];
  const nonRouteFiles = [];
  let anyModule = false;
  for (const f of files) {
    const abs = join(REPO_ROOT, f);
    let content = null;
    if (existsSync(abs)) {
      try {
        content = readFileSync(abs, 'utf8');
      } catch {
        content = null;
      }
    }
    if (content === null) {
      nonRouteFiles.push(f); // file missing/unreadable — it certainly doesn't boot a route
      continue;
    }
    const specs = importSpecifiers(content);
    if (specs.some(isRouteSpecifier) || isRouteContent(content)) routeFiles.push(f);
    else nonRouteFiles.push(f);
    if (specs.some(isInternalSpecifier)) anyModule = true;
  }
  return { routeFiles, nonRouteFiles, anyModule };
}

// Classification — priority follows the spec exactly: exception -> route -> module -> structural
// -> no check -> work not started -> items struck -> no machine items.
//
// "route"/"module" are judged for the SPEC AS A WHOLE (if any invoked test is a route test, the
// whole spec is "route"), not per acceptance item — sorting that out per item stays the
// reviewer's job on top of this map, not the measurer's. But the coarseness is made VISIBLE: if
// not EVERY invoked test boots a route, `partialNote` records "N of M" and the report carries
// such specs in a separate "Holes" subsection — an honest state ("wiring is checked somewhere"),
// but the perimeter isn't fully closed.
//
// When there's no executable block (or it's empty), "no machine block" is NOT yet a single
// diagnosis — a machine acceptance item lives in three states (closed/open/struck, see
// machineItemState), and these are different situations, not "a hole" by default:
//   no check         — at least one CLOSED machine item exists: the spec CLAIMS the invariant
//                       is guarded, and there's no check — a real hole, colors --gate.
//   work not started — no closed items, some open ones: honestly not started yet, requiring a
//                       test from an unclosed item would mean forcing it to be written before the
//                       implementation — --gate does NOT color this spec.
//   items struck      — no closed and no open items, only struck-through ones: the item was
//                       retired along with its mechanism — also not a hole.
// Mixing these three into one "no check" is directly harmful (a real finding: specs were, in
// practice, falsely declared holes that way, when work simply hadn't started).
function classify(spec) {
  if (spec.exceptionReason) return 'exception';
  if (spec.runTestsFiles.length > 0) {
    const depth = testFileDepth(spec.runTestsFiles);
    spec.routeFiles = depth.routeFiles;
    spec.nonRouteFiles = depth.nonRouteFiles;
    if (depth.routeFiles.length > 0) return 'route';
    if (depth.anyModule) return 'module';
  }
  if (spec.hasMachineChecks) return 'structural';
  if (spec.closedMachineCount > 0) return 'no check';
  if (spec.openMachineCount > 0) return 'work not started';
  if (spec.struckMachineCount > 0) return 'items struck';
  return 'no machine items';
}

// The "risk: function instead of wiring" hint — only for the "module" state. Keywords are
// searched STRICTLY in the text of "(machine)" items in the Acceptance criteria section — what
// the spec PROMISES to check, not the executable block's commands: a path like
// `app/api/items/route.ts` inside a `forbid_grep` line must not paint a spec risky just
// because it contains the word "route" (a real finding: in practice, many specs were falsely
// flagged because of paths inside commands). Keywords are English terms for auth
// and money; extend for your own domain as needed.
const RISK_KEYWORDS = [
  'route',
  '/api/',
  'endpoint',
  'authoriz',
  'guard',
  'webhook',
  'token',
  'owner',
  'idor',
  'permission',
  'payment',
];
function hasRiskSignal(text) {
  const lower = text.toLowerCase();
  return RISK_KEYWORDS.some((kw) => {
    const esc = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?<![a-z])${esc}`, 'i').test(lower);
  });
}

// The "guard mocked wide open" heuristic (a real finding in the originating project). Being in
// the "route" state does NOT by itself guarantee the permission check inside wasn't replaced by
// a mock — that's for the reviewer to sort out; this is only a cheap machine hint, not a verdict.
//
// WARNING: tuned for Vitest (`vi.mock`). On Jest, swap in `jest.mock`; on plain `node --test`
// (no mocking library) this heuristic won't trigger at all — every check inside it returns
// false, which is honest (there's nothing much to mock that way), not "the guard isn't mocked",
// just "this signal doesn't apply to your stack".
//
// Looks at EXACTLY the tests that lifted the spec to "route" (`routeFiles`) — those are the
// tests the "wiring is checked" guarantee rests on; if they mock the guard module with an open
// text and nowhere in the file switch it to a denial (mockReturnValue/mockResolvedValue(false),
// mockImplementation with false, or expecting a 401/403 status), the guarantee has a hole in it.
function guardMockedOpen(files) {
  for (const f of files) {
    const abs = join(REPO_ROOT, f);
    if (!existsSync(abs)) continue;
    let content;
    try {
      content = readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    const mockTargets = [...content.matchAll(/vi\.mock\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
    const guardMocked = mockTargets.some((t) => /authz|guard|auth/i.test(t));
    if (!guardMocked) continue;
    const hasDenialSwitch =
      /mockReturnValue(?:Once)?\(\s*false\s*\)/.test(content) ||
      /mockResolvedValue(?:Once)?\(\s*false\s*\)/.test(content) ||
      /mockImplementation(?:Once)?\([^)]*(?:=>|return)\s*false\b/.test(content) ||
      /\b40[13]\b/.test(content);
    if (!hasDenialSwitch) return true; // at least one route test keeps the guard permanently mocked open
  }
  return false;
}

// ---------- walking the specs ----------

const specs = [];
const formatErrors = [];
// Forms of the "(machine…)" marker actually found in specs, with a count per form — the summary
// prints this as a separate line so a human sees there's more than one form (see the comment
// next to MACHINE_MARKER_RE above). A Map, not an object — preserves first-appearance order.
const markerFormCounts = new Map();

for (const slot of SCAN_SLOTS) {
  let files = [];
  try {
    files = readdirSync(join(SPECS_DIR, slot)).filter((f) => f.endsWith('.md')).sort();
  } catch {
    continue;
  }
  for (const file of files) {
    const relPath = `${slot}/${file}`;
    const text = readFileSync(join(SPECS_DIR, slot, file), 'utf8');

    const fm = frontmatter(text);
    if (!fm || !fm.name || !fm.status) {
      formatErrors.push(`${relPath}: front matter didn't parse (need at least name/status between --- ... ---)`);
      continue;
    }

    const { blocks, malformed } = acceptanceBlocks(text);
    if (malformed) {
      formatErrors.push(
        `${relPath}: an opening \`\`\`acceptance marker was found, but no matching closing \`\`\` before end of file — the block isn't closed, check the format`
      );
      continue;
    }

    const joined = blocks.join('\n');
    const criteriaSection = acceptanceCriteriaSection(text);
    const machineItems = extractMachineItems(criteriaSection);
    const machineItemStates = machineItems.map(machineItemState);
    for (const item of machineItems) {
      const form = machineMarkerForm(item);
      if (form) markerFormCounts.set(form, (markerFormCounts.get(form) || 0) + 1);
    }

    specs.push({
      slot,
      file,
      relPath,
      name: fm.name,
      description: fm.description || '',
      status: fm.status,
      machineItemCount: machineItems.length,
      machineItemsText: machineItems.join('\n'),
      closedMachineCount: machineItemStates.filter((s) => s === 'closed').length,
      openMachineCount: machineItemStates.filter((s) => s === 'open').length,
      struckMachineCount: machineItemStates.filter((s) => s === 'struck').length,
      criteriaText: criteriaSection,
      blocksText: joined,
      blockCount: blocks.length,
      hasMachineChecks: blocks.some((b) => execLines(b).length > 0),
      codePaths: extractCodePaths(joined),
      exceptionReason: exceptionReason(text),
    });
  }
}

if (formatErrors.length > 0) {
  console.error('test-map.mjs: spec(s) with a broken format — fix and rerun:\n');
  for (const e of formatErrors) console.error(`  ✗ ${e}`);
  process.exit(1);
}

// ---------- walking the tests: file list is needed BEFORE spec classification (run_tests
// globs are expanded against it) ----------

function discoverTestFiles() {
  const result = [];
  for (const dir of TEST_DIRS) {
    let files = [];
    try {
      files = readdirSync(join(REPO_ROOT, dir)).filter((f) => TEST_FILE_RE.test(f)).sort();
    } catch {
      continue;
    }
    for (const f of files) result.push(`${dir}/${f}`);
  }
  return result;
}
const testFiles = discoverTestFiles();

for (const spec of specs) {
  spec.runTestsFiles = extractRunTestsFiles(spec.blocksText, testFiles);
}

for (const spec of specs) {
  spec.state = classify(spec);
  // Risk signal is searched ONLY in the spec's own claims (the text of machine items), never in
  // block commands — otherwise a path inside forbid_grep/grep would paint a spec risky on a
  // coincidental word match.
  spec.riskFlag = spec.state === 'module' && hasRiskSignal(spec.machineItemsText);
  spec.partialNote =
    spec.state === 'route' && spec.nonRouteFiles && spec.nonRouteFiles.length > 0
      ? `partial: route booted by ${spec.routeFiles.length} of ${spec.runTestsFiles.length} tests`
      : null;
  spec.guardMockedOpenFlag = spec.state === 'route' && guardMockedOpen(spec.routeFiles);
}

// ---------- walking the tests: feedback, orphans, broken links ----------

const calledBySpecs = new Set(specs.flatMap((s) => s.runTestsFiles));

// Pattern for a spec reference in a test's header: `specs/active/<name>`, `specs/done/<name>`,
// `active/<name>`, `done/<name>` (with or without .md) — slots come from SCAN_SLOTS so the regex
// never falls behind the settings.
const SPEC_REF_RE = new RegExp(
  `(?:specs\\/)?(${SCAN_SLOTS.join('|')})\\/([a-z0-9][a-z0-9-]*)(?:\\.md)?`,
  'g'
);

// A second reference form, without the folder prefix: "spec <kebab-name>" — this is how a
// noticeable share of test headers are written in practice, and without this form live
// tests were falsely flagged as orphans. The anchor is NOT the mere word "spec" (it shows up in
// prose plenty without being a reference) but a match of the found token against a REALLY
// existing spec name — the list is already built above as `specs`. A token that matches no spec
// is silently ignored: not a broken link (a prefix-less form makes no promise of being a path),
// just not counted as a reference at all.
const BARE_SPEC_REF_RE = /\bspecs?\s+([a-z][a-z0-9-]*)/gi;
const specNameToPath = new Map(specs.map((s) => [s.name, s.relPath]));

// Number of lines in a test's header to search for a spec reference.
const HEADER_LINES = 15;

// The slot where a spec FILE actually lives right now (by filesystem, not front matter — we
// check the path the test referenced, not what the spec thinks of itself). Needed to tell apart
// two DIFFERENT findings behind a reference to a nonexistent path:
//   1. the spec moved between slots (active -> done) — the path in the test's header is stale,
//      the spec is alive; fixed by editing ONE comment line, not a reason to touch the test;
//   2. the spec doesn't exist in any slot — now this needs sorting out (the test may be left
//      over from a removed/renamed feature).
// Confusing them causes real harm: "doesn't exist" on a live spec pushes the reader to delete a
// working test.
function slotOfSpecFile(fileSlug) {
  for (const slot of SCAN_SLOTS) {
    if (existsSync(join(REPO_ROOT, 'specs', slot, `${fileSlug}.md`))) return slot;
  }
  return null;
}

const orphans = [];
const brokenLinks = []; // spec doesn't exist at all — needs sorting out
const movedLinks = []; // spec is alive, moved to another slot — needs a path fix in the comment
let totalChecks = 0;

for (const f of testFiles) {
  const abs = join(REPO_ROOT, f);
  const content = readFileSync(abs, 'utf8');
  totalChecks += (content.match(/\b(it|test)\(/g) || []).length;

  const header = content.split('\n').slice(0, HEADER_LINES).join('\n');
  const refs = [...header.matchAll(SPEC_REF_RE)];
  let hasValidRef = false;
  for (const m of refs) {
    const [, refSlot, fileSlug] = m;
    const specPath = `specs/${refSlot}/${fileSlug}.md`;
    if (existsSync(join(REPO_ROOT, specPath))) {
      hasValidRef = true;
      continue;
    }
    const actualSlot = slotOfSpecFile(fileSlug);
    if (actualSlot && actualSlot !== refSlot) {
      hasValidRef = true; // spec is alive, just at a different path — not an orphan
      movedLinks.push({ test: f, oldPath: specPath, newPath: `specs/${actualSlot}/${fileSlug}.md` });
    } else {
      brokenLinks.push({ test: f, specPath });
    }
  }
  for (const m of header.matchAll(BARE_SPEC_REF_RE)) {
    if (specNameToPath.has(m[1].toLowerCase())) hasValidRef = true;
  }

  const called = calledBySpecs.has(f);
  if (!called && !hasValidRef) orphans.push(f);
}

// ---------- freshness (git): is the spec's code newer than the test it calls? ----------
// Works both outside a git repo and without history for a file — commitDate then just returns
// null, and spec.staleNote stays null (not counted as stale, and not "can't tell" either).
//
// WARNING — FUNDAMENTAL LIMIT: staleNote is computed from COMMIT DATES — that is, from the
// environment of the moment the script runs, not from the content of the specs/tests. It MUST
// NOT be written into TEST-MAP.md (a file `--check` compares byte-for-byte against the already
// committed version): committing the report itself shifts the dates, which means the report
// instantly goes "stale" with zero meaningful change — `--check` would fail in CI for no reason
// (a real finding: the very first rollout broke this way). The observation is still useful, so
// it isn't dropped entirely — it's printed to the console as a separate section during a normal
// run (see bottom of file, "Freshness hints"), where it never participates in the freshness
// comparison.

const dateCache = new Map();
function commitDate(relPath) {
  if (dateCache.has(relPath)) return dateCache.get(relPath);
  let iso = null;
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cI', '--', relPath], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }).trim();
    iso = out || null;
  } catch {
    iso = null;
  }
  dateCache.set(relPath, iso);
  return iso;
}

for (const spec of specs) {
  spec.staleNote = null;
  if (spec.codePaths.length === 0 || spec.runTestsFiles.length === 0) continue;

  const codeDates = spec.codePaths.map(commitDate).filter(Boolean).map((d) => new Date(d));
  const testDates = spec.runTestsFiles.map(commitDate).filter(Boolean).map((d) => new Date(d));
  if (codeDates.length === 0 || testDates.length === 0) continue;

  const maxCode = new Date(Math.max(...codeDates.map((d) => d.getTime())));
  const minTest = new Date(Math.min(...testDates.map((d) => d.getTime())));
  if (maxCode > minTest) spec.staleNote = 'code was edited after the test';
}

// ---------- coverage (a hint, not a gate) ----------

// Reads COVERAGE_SUMMARY_PATH, if present (built by a separate build step, an ordinary test run
// doesn't touch it). Returns null if there's no report — the map MUST still build without it
// (coverage is a hint, not a gate and not a required input).
function readUntouchedFiles() {
  if (!existsSync(COVERAGE_SUMMARY_PATH)) return null;
  let data;
  try {
    data = JSON.parse(readFileSync(COVERAGE_SUMMARY_PATH, 'utf8'));
  } catch {
    return null;
  }
  const untouched = [];
  for (const [file, stats] of Object.entries(data)) {
    if (file === 'total') continue;
    const pct = stats?.lines?.pct;
    if (typeof pct === 'number' && pct === 0) {
      const rel = file.startsWith(REPO_ROOT) ? file.slice(REPO_ROOT.length + 1) : file;
      untouched.push(rel);
    }
  }
  untouched.sort();
  return untouched;
}
const untouchedFiles = readUntouchedFiles();

// ---------- report ----------

function buildReport() {
  const bySlot = {};
  for (const slot of SCAN_SLOTS) bySlot[slot] = specs.filter((s) => s.slot === slot);
  const stateCounts = {};
  for (const s of specs) stateCounts[s.state] = (stateCounts[s.state] || 0) + 1;
  const holes = specs.filter((s) => s.state === 'no check');
  const notStarted = specs.filter((s) => s.state === 'work not started');
  const struckOff = specs.filter((s) => s.state === 'items struck');
  const exceptions = specs.filter((s) => s.state === 'exception');
  const risky = specs.filter((s) => s.riskFlag);
  const partial = specs.filter((s) => s.partialNote);
  const guardOpen = specs.filter((s) => s.guardMockedOpenFlag);
  // Forms of the "(machine…)" marker — by descending frequency, alphabetical on ties
  // (determinism matters: this text goes into a file `--check` compares byte-for-byte).
  const markerForms = [...markerFormCounts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  );

  const lines = [
    PROJECT_NAME ? `# TEST-MAP — spec <-> test map (${PROJECT_NAME})` : '# TEST-MAP — spec <-> test map',
    '',
    '> ⚙️ Auto-generated by `node specs/test-map.mjs` from specs in `specs/<slot>/*.md` (slots — ' +
      `\`${SCAN_SLOTS.join('/')}\`) and tests in \`${TEST_DIRS.join(', ')}\`. **Do not edit by hand.**` +
      ' Freshness is checked with `--check` (same model as `specs/INDEX.md`/`build-index.mjs`); holes with',
    '> `--gate`. Both flags only read, they never write TEST-MAP.md — a plain run without flags is the one that writes.',
    '',
    '## State legend',
    '',
    '- **route** — at least one invoked test imports a route handler (see the settings block',
    '  `ROUTE_SPECIFIER_PATTERNS`/`ROUTE_CONTENT_PATTERNS` at the top of the script — THIS run',
    '  judged "route" by the regexes configured there). ⚠️ This means EXACTLY one thing: the test',
    '  boots the handler itself — nothing more. It does NOT guarantee the permission/guard check',
    '  inside wasn\'t replaced by a mock stuck at "always true" (see "guard mocked wide open"',
    '  below), and it does NOT guarantee every acceptance item of the spec is covered — actual',
    '  completeness is for the reviewer to judge, not this measurer.',
    '- **module** — the test imports a live repo module (one of the',
    '  `INTERNAL_IMPORT_ALIASES` or a relative `./`/`../` onto a repo file), but none of the',
    '  invoked tests boots a route. The module might be a pure function whose call from the route',
    '  is checked by NOTHING — exactly the false-green case the "risk" flag below watches for.',
    '  For computation/batch tasks (no HTTP surface at all), "module" is the normal state.',
    '- **structural** — no test invocation found (see `TEST_INVOCATION_PATTERNS`), the block is',
    '  closed only by `grep`/`test`/`forbid_*` or plain commands with no reference to a test file.',
    '- When there\'s no executable block (or it\'s empty), a spec lands in one of three DIFFERENT',
    '  states — depending on what its "(machine…)" items look like (the marker is matched by the',
    '  start of the parenthesis — "(machine)", "(machine, staging)", "(machine, post-deploy)" etc.,',
    '  case-insensitive):',
    '- **no check** — at least one CLOSED (`- [x]`) machine item exists: the spec CLAIMS the',
    '  invariant is guarded, and there\'s no check — a real hole, colors `--gate`.',
    '- **work not started** — no closed items, some open (`- [ ]`) ones: work honestly hasn\'t',
    '  started yet, nothing to guard. `--gate` does NOT color this spec — requiring a test from an',
    '  unclosed item would mean forcing it to be written before the implementation.',
    '- **items struck** — no closed and no open items, only struck-through (`~~text~~`) ones: the',
    '  mechanism was retired along with the item. `--gate` doesn\'t color it.',
    '- **exception** — an explicit "test not applicable: `<reason>`" line in the spec.',
    '- **no machine items** — the spec has no "(machine…)" marker at all (legitimate, but visible).',
    '- ⚠️ **"partial: route booted by N of M tests"** — the "route" state is judged for the SPEC AS A',
    '  WHOLE (one route test among the invoked ones is enough), not per acceptance item. This note',
    '  makes that coarseness visible: the spec is honestly "route" (wiring is checked somewhere),',
    '  but not every invoked test boots a route — the remaining N of M appear in "Holes" below, by',
    '  name.',
    '- ⚠️ **"risk: function instead of wiring"** — a hint for the reviewer, not a verdict: the spec',
    '  is in the "module" state, and the text of its "(machine)" items (what the spec PROMISES to',
    '  check, not the block\'s commands) mentions route/endpoint/authorization/guard/webhook/',
    '  payment — meaning it should by rights guard the wiring, but only guards a function.',
    '- ⚠️ **"guard mocked wide open"** — a HEURISTIC (tuned for Vitest `vi.mock`, see the comment on',
    '  `guardMockedOpen` in the script): for a spec in the "route" state, the test that lifted it',
    '  there mocks the auth/guard module with a constant and NEVER switches the mock to a denial',
    '  anywhere in the file. Remove the guard call from the route and this test wouldn\'t notice.',
    '- ⚠️ **"moved"** vs **"doesn\'t exist"** (a test\'s reference to a spec): "moved" — the spec\'s',
    '  name was found in a DIFFERENT slot (usually `active` -> `done`), the spec is alive, fixed by',
    '  editing one path in the test\'s header; "doesn\'t exist" — the name isn\'t in any slot at all,',
    '  the test may be guarding a feature that\'s gone — that\'s worth sorting out, not just a path fix.',
    '',
    '## Summary',
    '',
    `- Specs total (${SCAN_SLOTS.join('+')}): ${specs.length}` +
      SCAN_SLOTS.map((slot) => `, ${slot}: ${bySlot[slot].length}`).join(''),
    ...[
      'route',
      'module',
      'structural',
      'no check',
      'work not started',
      'items struck',
      'exception',
      'no machine items',
    ].map((st) => `- ${st}: ${stateCounts[st] || 0}`),
    `- Forms of the "(machine…)" marker: ${
      markerForms.length === 0
        ? 'no marked items'
        : markerForms.map(([form, count]) => `\`${form}\` — ${count}`).join(', ')
    }`,
    `- ⚠️ partial route-level coverage (among "route" state): ${partial.length}`,
    `- ⚠️ guard mocked wide open (among "route" state): ${guardOpen.length}`,
    `- ⚠️ risk "function instead of wiring" (among "module" state): ${risky.length}`,
    `- Test files (${TEST_DIRS.join(', ')}): ${testFiles.length}`,
    `- Checks (\`it(\`/\`test(\` occurrences): ${totalChecks}`,
    `- Orphan tests (called by no spec and referencing no live spec): ${orphans.length}`,
    `- References to a moved spec (alive, stale path): ${movedLinks.length}`,
    `- Broken references (spec doesn't exist at all): ${brokenLinks.length}`,
    `- Code files with zero checks (coverage): ${untouchedFiles === null ? 'report not built' : untouchedFiles.length}`,
    '',
  ];

  for (const slot of SCAN_SLOTS) {
    lines.push(`## ${slot[0].toUpperCase()}${slot.slice(1)} (${bySlot[slot].length})`, '');
    lines.push('| spec | state | invoked tests | notes |', '|---|---|---|---|');
    for (const s of bySlot[slot].sort((a, b) => a.name.localeCompare(b.name))) {
      const tests = s.runTestsFiles.length ? s.runTestsFiles.map((t) => `\`${t}\``).join(', ') : '—';
      const notes = [];
      if (s.state === 'structural' && s.blockCount > 0) {
        notes.push('has machine checks, but no test invocation was recognized by TEST_INVOCATION_PATTERNS');
      }
      if (s.partialNote) notes.push(`⚠️ ${s.partialNote}`);
      if (s.guardMockedOpenFlag) notes.push('⚠️ guard mocked wide open');
      if (s.riskFlag) notes.push('⚠️ risk: function instead of wiring');
      if (s.exceptionReason) notes.push(`exception: ${s.exceptionReason}`);
      // "code was edited after the test" is deliberately NOT written here — it's a commit date,
      // depends on the moment the script runs (see the staleNote comment above), and must not
      // land in a file compared for freshness. See the console output of a plain run, "Freshness
      // hints" section.
      lines.push(`| [${s.name}](${s.relPath}) | ${s.state} | ${tests} | ${notes.join('; ') || '—'} |`);
    }
    lines.push('');
  }

  lines.push('## Holes — specs in the "no check" state', '');
  if (holes.length === 0) {
    lines.push('No holes — every spec is either covered by a route/structural block or carries an exception.', '');
  } else {
    for (const s of holes.sort((a, b) => a.name.localeCompare(b.name))) {
      lines.push(
        `- [${s.name}](${s.relPath}) — closed machine items: ${s.closedMachineCount} of ${s.machineItemCount}, executable blocks: ${s.blockCount}`
      );
    }
    lines.push('');
  }

  lines.push('## Work not started — machine items are open, nothing to check yet', '');
  lines.push('> Not a hole: `--gate` doesn\'t color these specs. A calm list for visibility, not for alarm.', '');
  if (notStarted.length === 0) {
    lines.push('Empty — no spec has open machine items without a block.', '');
  } else {
    for (const s of notStarted.sort((a, b) => a.name.localeCompare(b.name))) {
      lines.push(`- [${s.name}](${s.relPath}) — open machine items: ${s.openMachineCount} of ${s.machineItemCount}`);
    }
    lines.push('');
  }

  lines.push('## Items struck — every machine item struck through', '');
  lines.push('> Not a hole: the mechanism was retired along with the item. `--gate` doesn\'t color these specs.', '');
  if (struckOff.length === 0) {
    lines.push('Empty — no spec has all its machine items struck at once.', '');
  } else {
    for (const s of struckOff.sort((a, b) => a.name.localeCompare(b.name))) {
      lines.push(`- [${s.name}](${s.relPath}) — struck machine items: ${s.struckMachineCount} of ${s.machineItemCount}`);
    }
    lines.push('');
  }

  lines.push('### Partial route-level coverage', '');
  if (partial.length === 0) {
    lines.push('Empty — every "route" spec is covered by a route test across all of its invoked tests.', '');
  } else {
    for (const s of partial.sort((a, b) => a.name.localeCompare(b.name))) {
      const missing = s.nonRouteFiles.map((t) => `\`${t}\``).join(', ');
      lines.push(`- [${s.name}](${s.relPath}) — ${s.partialNote}; route NOT booted by: ${missing}`);
    }
    lines.push('');
  }

  lines.push('### Guard mocked wide open (heuristic)', '');
  if (guardOpen.length === 0) {
    lines.push('Empty — no route test mocks the auth guard without a switch to denial.', '');
  } else {
    for (const s of guardOpen.sort((a, b) => a.name.localeCompare(b.name))) {
      const tests = s.routeFiles.map((t) => `\`${t}\``).join(', ');
      lines.push(`- [${s.name}](${s.relPath}) — route tests: ${tests}`);
    }
    lines.push('');
  }

  lines.push('### Next in priority: "risk: function instead of wiring"', '');
  if (risky.length === 0) {
    lines.push('Empty — no spec in the "module" state mentions route/authorization/payment in its item text.', '');
  } else {
    for (const s of risky.sort((a, b) => a.name.localeCompare(b.name))) {
      const tests = s.runTestsFiles.map((t) => `\`${t}\``).join(', ');
      lines.push(`- [${s.name}](${s.relPath}) — invoked tests: ${tests}`);
    }
    lines.push('');
  }

  lines.push('## Justified exceptions', '');
  if (exceptions.length === 0) {
    lines.push('No spec has an explicit "test not applicable: <reason>" line yet.', '');
  } else {
    for (const s of exceptions.sort((a, b) => a.name.localeCompare(b.name))) {
      lines.push(`- [${s.name}](${s.relPath}) — ${s.exceptionReason}`);
    }
    lines.push('');
  }

  lines.push('## Orphans and broken references', '');
  lines.push('### Orphans (test called by no spec and referencing no existing spec)', '');
  if (orphans.length === 0) {
    lines.push('No orphans.', '');
  } else {
    for (const t of orphans) lines.push(`- \`${t}\``);
    lines.push('');
  }
  lines.push('### Spec moved (path stale, spec alive — fix by editing the path in the test\'s header)', '');
  if (movedLinks.length === 0) {
    lines.push('No moved references.', '');
  } else {
    for (const b of movedLinks) lines.push(`- \`${b.test}\` -> \`${b.oldPath}\` (moved to \`${b.newPath}\`)`);
    lines.push('');
  }
  lines.push('### Broken references (spec doesn\'t exist in any slot — needs sorting out)', '');
  if (brokenLinks.length === 0) {
    lines.push('No broken references.', '');
  } else {
    for (const b of brokenLinks) lines.push(`- \`${b.test}\` -> \`${b.specPath}\` (doesn't exist)`);
    lines.push('');
  }

  lines.push('## Code files with zero checks (coverage)', '');
  lines.push(
    '> A hint — NOT a gate, not a threshold. Built from ' +
      `\`${COVERAGE_SUMMARY_PATH.startsWith(REPO_ROOT) ? COVERAGE_SUMMARY_PATH.slice(REPO_ROOT.length + 1) : COVERAGE_SUMMARY_PATH}\`` +
      ' (a separate build step), an ordinary test run doesn\'t touch it.',
    ''
  );
  if (untouchedFiles === null) {
    lines.push('Coverage report not built — build it and regenerate the map.', '');
  } else if (untouchedFiles.length === 0) {
    lines.push('Empty — every counted file is touched by at least one line of coverage.', '');
  } else {
    lines.push(`Files with zero checks: ${untouchedFiles.length}.`, '');
    for (const f of untouchedFiles) lines.push(`- \`${f}\``);
    lines.push('');
  }

  return lines.join('\n') + '\n';
}

const report = buildReport();

// --check and --gate are "judge" modes: read-only, never write TEST-MAP.md (otherwise `--gate`
// would bump the mtime of the working tree just because a developer asked "would I pass the
// gate?"). Both flags are INDEPENDENT of each other: `--check --gate` runs BOTH checks and fails
// if either one does — otherwise `--check` could `process.exit()` BEFORE execution reaches
// `--gate`, and `--check --gate` in CI would be an evergreen gate (a real trap, found by review
// in the originating project).
if (MODE_CHECK || MODE_GATE) {
  let failed = false;

  if (MODE_CHECK) {
    const existing = existsSync(OUT_FILE) ? readFileSync(OUT_FILE, 'utf8') : null;
    if (existing === report) {
      console.log('test-map.mjs --check: TEST-MAP.md is fresh.');
    } else {
      console.error(
        existing === null
          ? 'test-map.mjs --check: specs/TEST-MAP.md not found — run `node specs/test-map.mjs` and commit it.'
          : 'test-map.mjs --check: specs/TEST-MAP.md is stale — run `node specs/test-map.mjs` and commit it.'
      );
      failed = true;
    }
  }

  if (MODE_GATE) {
    const holes = specs.filter((s) => s.state === 'no check');
    if (holes.length > 0) {
      console.error(
        `test-map.mjs --gate: ${holes.length} spec(s) without a check: ${holes.map((s) => s.relPath).join(', ')}`
      );
      failed = true;
    } else {
      console.log('test-map.mjs --gate: no holes ("no check").');
    }
  }

  process.exit(failed ? 1 : 0);
}

// A plain run without flags — the only mode that writes the file.
writeFileSync(OUT_FILE, report);
const stateCounts = {};
for (const s of specs) stateCounts[s.state] = (stateCounts[s.state] || 0) + 1;
const riskCount = specs.filter((s) => s.riskFlag).length;
const partialCount = specs.filter((s) => s.partialNote).length;
const guardOpenCount = specs.filter((s) => s.guardMockedOpenFlag).length;
console.log(
  `TEST-MAP.md updated: specs ${specs.length} (route ${stateCounts['route'] || 0}, ` +
    `module ${stateCounts['module'] || 0}, structural ${stateCounts['structural'] || 0}, ` +
    `no check ${stateCounts['no check'] || 0}, work not started ${stateCounts['work not started'] || 0}, ` +
    `items struck ${stateCounts['items struck'] || 0}, exception ${stateCounts['exception'] || 0}, ` +
    `no machine items ${stateCounts['no machine items'] || 0}); partial route coverage ` +
    `${partialCount}; guard mocked wide open ${guardOpenCount}; risk "function instead of wiring" ` +
    `${riskCount}; tests ${testFiles.length}, orphans ${orphans.length}, moved references ${movedLinks.length}, ` +
    `broken references ${brokenLinks.length}; files without coverage ${untouchedFiles === null ? 'n/a' : untouchedFiles.length}`
);

// "Freshness hints" — CONSOLE ONLY, never the file (see the staleNote comment): commit dates
// depend on the moment the script runs, and TEST-MAP.md is compared for freshness byte-for-byte.
const staleSpecs = specs.filter((s) => s.staleNote);
if (staleSpecs.length > 0) {
  console.log(
    `\nFreshness hints: ${staleSpecs.length} pair(s) where code was edited after the test (not a gate, not written to the file):`
  );
  for (const s of staleSpecs.sort((a, b) => a.name.localeCompare(b.name))) {
    console.log(`  - ${s.name} (${s.relPath})`);
  }
}

process.exit(0);
