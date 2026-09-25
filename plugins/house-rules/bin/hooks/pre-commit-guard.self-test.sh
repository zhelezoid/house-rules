#!/usr/bin/env bash
# Self-test for the secret guard (pre-commit-guard.sh).
#
# Runs the guard against twenty-odd sandboxes (mktemp -d, each cleans up after itself) and prints
# OK/FAIL/SKIP per case. `--prove-mutations` additionally proves by mutation that the matching
# cases can turn red: blanking a rule set at the `# MUT-POINT`, cutting the "gitleaks not
# installed" block, breaking finding parsing, dropping --ignore-gitleaks-allow, cutting the
# .gitleaksignore block, cutting the bait check, breaking the rules-freshness reminder's condition
# (both directions). A check that can't turn red is decoration, not a guard.
#
# The live guard file is NEVER mutated — only copies in temp directories.

set -uo pipefail

# --- Where we live, and what we're testing -------------------------------------
SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
SELF_DIR="$(dirname "$SELF")"
GUARD="${GUARD_UNDER_TEST:-$SELF_DIR/pre-commit-guard.sh}"

# Common rule set for fakehome comes from the copy shipped next to the guard in this repository —
# so the self-test doesn't depend on whether the machine running it has ~/.gitleaks.toml.
COMMON_SRC="$SELF_DIR/gitleaks-common.toml"

# The gitleaks binary's directory is discovered, not hard-coded. It lives in different places on
# different machines (a homebrew path on macOS, /usr/local/bin on a typical CI run on Linux). A
# hard-coded path would give a FALSE green in CI: the guard would honestly refuse "no gitleaks" in
# every case, and the self-test would believe it had exercised the secret-handling paths.
GITLEAKS_BIN="$(command -v gitleaks 2>/dev/null || true)"
if [ -n "$GITLEAKS_BIN" ]; then
  PATH_FULL="$(dirname "$GITLEAKS_BIN"):/usr/bin:/bin"
else
  echo "self-test: gitleaks not found in PATH — nothing to test the guard with." >&2
  echo "Install it: brew install gitleaks (mac) or download a release binary (CI)." >&2
  exit 1
fi
PATH_NO_GITLEAKS="/usr/bin:/bin"

ROOT_TMP="$(mktemp -d)"
trap 'rm -rf "$ROOT_TMP"' EXIT

PASS=0
FAIL=0
SKIP=0

report_ok() {
  printf 'OK  %s\n' "$1"
  PASS=$((PASS + 1))
}
report_fail() {
  printf 'FAIL %s: %s\n' "$1" "$2"
  FAIL=$((FAIL + 1))
}
report_skip() {
  printf 'SKIP %s: %s\n' "$1" "$2"
  SKIP=$((SKIP + 1))
}

# Truncate output for a failure message. LC_ALL=C — the guard's output is occasionally broken
# bytes (see case 6: a crash cuts UTF-8 mid-character), tr falls over on them in the normal locale.
truncate_out() {
  export LC_ALL=C
  printf '%s' "$1" | tr '\n' ' ' | cut -c1-300
}

# --- Shared sandbox builders -------------------------------------------------
new_repo() {
  local d="$1"
  mkdir -p "$d"
  git init -q "$d"
  git -C "$d" config user.email t@noreply.example.com
  git -C "$d" config user.name tester
}

# fakehome with a common rule set (the normal case — a common rule set "exists").
new_fakehome() {
  local h="$1"
  mkdir -p "$h"
  cp "$COMMON_SRC" "$h/.gitleaks.toml"
}

# fakehome with no common rule set (cases where it's deliberately absent).
new_fakehome_bare() {
  mkdir -p "$1"
}

write_clean_ts() {
  cat > "$1" <<'EOF'
export function greet(name: string): string {
  return `Hello, ${name}!`;
}
EOF
}

# A Gemini-shaped key (AIza + 35+ chars) — the common rule set catches it as gemini-api-key. The
# tail is drawn from /dev/urandom rather than written as a literal — same reason as case 9: a
# plausible secret inside the self-test's own source would block committing the self-test itself.
write_gemini_key() {
  local tail_
  tail_="$(head -c 200 /dev/urandom | base64 | tr -dc 'A-Za-z0-9_-' | head -c 40)"
  printf 'GEMINI_API_KEY=AIza%s\n' "$tail_" > "$1"
}

# Same, but with a `gitleaks:allow` tag at the end of the line — gitleaks' own standard comment,
# which without --ignore-gitleaks-allow silences the finding in BOTH rule sets at once (case 14).
write_gemini_key_with_allow_tag() {
  local tail_
  tail_="$(head -c 200 /dev/urandom | base64 | tr -dc 'A-Za-z0-9_-' | head -c 40)"
  printf 'GEMINI_API_KEY=AIza%s # gitleaks:allow\n' "$tail_" > "$1"
}

# Repository rule set for cases that need one — an invented example of the KIND of thing a
# project-specific .gitleaks.toml catches (readable secret values under project-specific names),
# not a copy of any real project's file. The self-test doesn't depend on what else is installed on
# the machine: it ships with house-rules on its own.
write_repo_cfg() {
  cat > "$1" <<'EOF'
[extend]
useDefault = true

[[rules]]
id = "selftest-readable-secret"
description = "Self-test: a readable secret value specific to this repository"
regex = '''(?i)(?:HASH_PEPPER|SESSION_SALT|ENCRYPTION_KEY)\s*[:=]\s*["']?([A-Za-z0-9_-]{16,})["']?'''
secretGroup = 1
EOF
}

# A readable secret caught ONLY by the repository rule set (case 1).
write_repo_only_secret() {
  cat > "$1" <<'EOF'
HASH_PEPPER=example-readable-value-one
SESSION_SALT=example-readable-value-two
ENCRYPTION_KEY=example-readable-value-three
EOF
}

# A secret caught ONLY by the common rule set (case 2). Assembled in pieces so no single line of
# the sample sits whole in this file — otherwise the same guard would block committing the
# self-test itself.
write_common_only_secret() {
  # Each pair below is split so that NEITHER half alone matches the rule it forms once joined —
  # otherwise this self-test's own source would trip the guard on its own commit. p1a stops one
  # character short of the "sk-ant-" + 4-alnum + "-" shape; p2a stops one character short of "AIza".
  local p1a="ANTHROPIC_API_KEY=sk-ant-ap" p1b="i03-aaaabbbbccccddddeeeeffffgggghhhhiiiijjjjkkkkllllmmmmnnnnoooo"
  local p2a="GEMINI_API_KEY=AIz" p2b="aaaaabbbbccccddddeeeeffffgggghhhhiii"
  {
    printf '%s%s\n' "$p1a" "$p1b"
    printf '%s%s\n' "$p2a" "$p2b"
  } > "$1"
}

# Run the guard: result goes into globals CASE_OUT / CASE_RC.
# $1 = working directory (repo root), $2 = HOME, $3 = PATH (opt.), $4 = path to the guard (opt.)
run_guard_in() {
  local d="$1" h="$2" p="${3:-$PATH_FULL}" g="${4:-$GUARD}"
  CASE_OUT="$( cd "$d" && env HOME="$h" PATH="$p" bash "$g" 2>&1 )"
  CASE_RC=$?
}

TOTAL_CASES=22

# === Case 1: a readable secret is caught only by the repository rule set =======
{
  name="readable-secret-caught-by-repository-rule-set"
  repo="$ROOT_TMP/c1/repo"; home="$ROOT_TMP/c1/home"
  new_repo "$repo"; new_fakehome "$home"
  write_repo_cfg "$repo/.gitleaks.toml"
  write_repo_only_secret "$repo/leak.env"
  git -C "$repo" add leak.env .gitleaks.toml

  run_guard_in "$repo" "$home"
  if [ "$CASE_RC" -eq 1 ] && printf '%s' "$CASE_OUT" | grep -q "repository"; then
    report_ok "$name"
  else
    report_fail "$name" "expected rc=1 and the word \"repository\" in the output; got rc=$CASE_RC, output: $(truncate_out "$CASE_OUT")"
  fi
}

# === Case 2: a secret caught only by the common rule set ========================
{
  name="secret-caught-by-common-rule-set-only"
  repo="$ROOT_TMP/c2/repo"; home="$ROOT_TMP/c2/home"
  new_repo "$repo"; new_fakehome "$home"
  write_repo_cfg "$repo/.gitleaks.toml"
  write_common_only_secret "$repo/only-home.env"
  git -C "$repo" add only-home.env .gitleaks.toml

  run_guard_in "$repo" "$home"
  if [ "$CASE_RC" -eq 1 ] && printf '%s' "$CASE_OUT" | grep -q "common"; then
    report_ok "$name"
  else
    report_fail "$name" "expected rc=1 and the word \"common\" in the output; got rc=$CASE_RC, output: $(truncate_out "$CASE_OUT")"
  fi
}

# === Case 3: an honest edit passes green ========================================
{
  name="honest-edit-passes-green"
  repo="$ROOT_TMP/c3/repo"; home="$ROOT_TMP/c3/home"
  new_repo "$repo"; new_fakehome "$home"
  write_repo_cfg "$repo/.gitleaks.toml"
  write_clean_ts "$repo/hello.ts"
  git -C "$repo" add hello.ts .gitleaks.toml

  run_guard_in "$repo" "$home"
  if [ "$CASE_RC" -eq 0 ]; then
    report_ok "$name"
  else
    report_fail "$name" "expected rc=0; got rc=$CASE_RC, output: $(truncate_out "$CASE_OUT")"
  fi
}

# === Case 4: no gitleaks in PATH — a refusal, not silence =======================
{
  name="no-gitleaks-refuses"
  repo="$ROOT_TMP/c4/repo"; home="$ROOT_TMP/c4/home"
  new_repo "$repo"; new_fakehome "$home"
  write_repo_cfg "$repo/.gitleaks.toml"
  write_clean_ts "$repo/hello.ts"
  git -C "$repo" add hello.ts .gitleaks.toml

  # The check judges EXACTLY the "gitleaks not installed" branch, not any mention of the word
  # gitleaks — it shows up in the output from a completely different branch too ("rule set didn't
  # run", the path to .gitleaks.toml). Mutation confirmed the narrow check is needed, otherwise
  # this case doesn't turn red.
  run_guard_in "$repo" "$home" "$PATH_NO_GITLEAKS"
  if [ "$CASE_RC" -eq 1 ] \
     && printf '%s' "$CASE_OUT" | grep -q "isn't installed" \
     && printf '%s' "$CASE_OUT" | grep -q "brew install gitleaks" \
     && ! printf '%s' "$CASE_OUT" | grep -q "didn't run"; then
    report_ok "$name"
  else
    report_fail "$name" "expected rc=1, \"isn't installed\" and \"brew install gitleaks\" in the output, WITHOUT \"didn't run\"; got rc=$CASE_RC, output: $(truncate_out "$CASE_OUT")"
  fi
}

# === Case 5: no rule set at all — a refusal =====================================
{
  name="no-rule-set-at-all-refuses"
  isolated="$ROOT_TMP/c5/isolated"; mkdir -p "$isolated"
  cp "$GUARD" "$isolated/guard.sh"
  repo="$ROOT_TMP/c5/repo"; home="$ROOT_TMP/c5/home"
  new_repo "$repo"; new_fakehome_bare "$home"
  write_clean_ts "$repo/hello.ts"
  git -C "$repo" add hello.ts

  run_guard_in "$repo" "$home" "$PATH_FULL" "$isolated/guard.sh"
  if [ "$CASE_RC" -eq 1 ]; then
    report_ok "$name"
  else
    report_fail "$name" "expected rc=1; got rc=$CASE_RC, output: $(truncate_out "$CASE_OUT")"
  fi
}

# === Case 6: a broken rule set — a refusal, with the file name in the output ====
{
  name="broken-rule-set-refuses"
  repo="$ROOT_TMP/c6/repo"; home="$ROOT_TMP/c6/home"
  new_repo "$repo"; new_fakehome "$home"
  printf 'title = "broken\n[[rules]\n' > "$repo/.gitleaks.toml"
  write_clean_ts "$repo/hello.ts"
  git -C "$repo" add hello.ts .gitleaks.toml

  run_guard_in "$repo" "$home"
  if [ "$CASE_RC" -eq 1 ] && printf '%s' "$CASE_OUT" | grep -q '\.gitleaks\.toml'; then
    report_ok "$name"
  else
    report_fail "$name" "expected rc=1 and the path to .gitleaks.toml in the output; got rc=$CASE_RC, output: $(truncate_out "$CASE_OUT")"
  fi
}

# === Case 7: nothing to check — silence ==========================================
{
  name="nothing-staged-stays-silent"
  repo="$ROOT_TMP/c7/repo"; home="$ROOT_TMP/c7/home"
  new_repo "$repo"; new_fakehome "$home"

  run_guard_in "$repo" "$home"
  if [ "$CASE_RC" -eq 0 ] && [ -z "$CASE_OUT" ]; then
    report_ok "$name"
  else
    report_fail "$name" "expected rc=0 and empty output; got rc=$CASE_RC, output: $(truncate_out "$CASE_OUT")"
  fi
}

# === Case 8: outside a repository — a refusal ====================================
{
  name="outside-a-repository-refuses"
  outside="$ROOT_TMP/c8/outside"; home="$ROOT_TMP/c8/home"
  mkdir -p "$outside"; new_fakehome "$home"
  if git -C "$outside" rev-parse --show-toplevel >/dev/null 2>&1; then
    report_skip "$name" "the sandbox unexpectedly ended up inside a git repository — skipping this case"
  else
    run_guard_in "$outside" "$home"
    if [ "$CASE_RC" -eq 1 ]; then
      report_ok "$name"
    else
      report_fail "$name" "expected rc=1; got rc=$CASE_RC, output: $(truncate_out "$CASE_OUT")"
    fi
  fi
}

# === Case 9: a duplicate (caught by both rule sets) is named once ================
{
  name="duplicate-is-named-once"
  attempt=0
  outcome="skip"
  while [ "$attempt" -lt 3 ]; do
    attempt=$((attempt + 1))
    repo="$ROOT_TMP/c9-$attempt/repo"; home="$ROOT_TMP/c9-$attempt/home"
    new_repo "$repo"; new_fakehome "$home"
    write_repo_cfg "$repo/.gitleaks.toml"
    # generic-api-key is one of gitleaks' own default rules (useDefault=true is set in BOTH rule
    # sets), so the same line is caught by the SAME id in both scans and gives an identical
    # fingerprint <file>:generic-api-key:<line> — exactly what's needed for a duplicate. The value
    # comes from /dev/urandom, not a literal — so the self-test's .sh file doesn't itself contain a
    # plausible secret that the guard would block committing.
    secret="$(head -c 200 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 40)"
    printf 'API_KEY = "%s"\n' "$secret" > "$repo/dup.env"
    git -C "$repo" add dup.env .gitleaks.toml

    run_guard_in "$repo" "$home"
    match_count="$(printf '%s\n' "$CASE_OUT" | grep -c 'generic-api-key' || true)"
    match_line="$(printf '%s\n' "$CASE_OUT" | grep 'generic-api-key' | head -1)"
    if [ "$CASE_RC" -eq 1 ] && [ "${match_count:-0}" -eq 1 ] \
       && printf '%s' "$match_line" | grep -q "common" \
       && printf '%s' "$match_line" | grep -q "repository"; then
      outcome="ok"
      break
    fi
  done
  if [ "$outcome" = "ok" ]; then
    report_ok "$name"
  else
    report_skip "$name" "couldn't find a fixture caught by both rule sets under the same rule in 3 tries"
  fi
}

# === Case 10: fallback common rule set next to the hook (portability core) ======
{
  name="fallback-common-rule-set-next-to-the-hook"
  isolated="$ROOT_TMP/c10/isolated"; mkdir -p "$isolated"
  cp "$GUARD" "$isolated/guard.sh"
  cp "$COMMON_SRC" "$isolated/gitleaks-common.toml"
  repo="$ROOT_TMP/c10/repo"; home="$ROOT_TMP/c10/home"
  new_repo "$repo"; new_fakehome_bare "$home"
  # No home rule set (HOME is empty) and no repository one either — the only source of a common
  # rule set here is the fallback next to the hook itself, in an isolated directory.
  write_common_only_secret "$repo/only-home.env"
  git -C "$repo" add only-home.env

  run_guard_in "$repo" "$home" "$PATH_FULL" "$isolated/guard.sh"
  if [ "$CASE_RC" -eq 1 ] \
     && printf '%s' "$CASE_OUT" | grep -q "common" \
     && ! printf '%s' "$CASE_OUT" | grep -q "no common rule set"; then
    report_ok "$name"
  else
    report_fail "$name" "expected rc=1, the word \"common\", without \"no common rule set\"; got rc=$CASE_RC, output: $(truncate_out "$CASE_OUT")"
  fi
}

# === Case 11: no repository rule set — judged by the home one silently ==========
{
  name="no-repository-rule-set-judged-by-home-one-silently"
  repo="$ROOT_TMP/c11/repo"; home="$ROOT_TMP/c11/home"
  new_repo "$repo"; new_fakehome "$home"
  write_clean_ts "$repo/hello.ts"
  git -C "$repo" add hello.ts

  run_guard_in "$repo" "$home"
  if [ "$CASE_RC" -eq 0 ] && ! printf '%s' "$CASE_OUT" | grep -q "⚠"; then
    report_ok "$name"
  else
    report_fail "$name" "expected rc=0 and output with no warnings; got rc=$CASE_RC, output: $(truncate_out "$CASE_OUT")"
  fi
}

# === Case 12: no home rule set — warns, doesn't block ============================
{
  name="no-home-rule-set-warns"
  isolated="$ROOT_TMP/c12/isolated"; mkdir -p "$isolated"
  cp "$GUARD" "$isolated/guard.sh"
  # No neighboring gitleaks-common.toml either — no common rule set exists at all.
  repo="$ROOT_TMP/c12/repo"; home="$ROOT_TMP/c12/home"
  new_repo "$repo"; mkdir -p "$home"
  write_repo_cfg "$repo/.gitleaks.toml"
  write_clean_ts "$repo/hello.ts"
  git -C "$repo" add hello.ts .gitleaks.toml

  run_guard_in "$repo" "$home" "$PATH_FULL" "$isolated/guard.sh"
  if [ "$CASE_RC" -eq 0 ] && printf '%s' "$CASE_OUT" | grep -q "aren't applied"; then
    report_ok "$name"
  else
    report_fail "$name" "expected rc=0 and a warning about \"aren't applied\"; got rc=$CASE_RC, output: $(truncate_out "$CASE_OUT")"
  fi
}

# === Case 13: portability through a two-link chain ===============================
# .git/hooks/pre-commit -> <tmp>/bin/hook-link.sh -> <source>/pre-commit-guard.sh.
# Checks that the chain resolves through git itself (the hook is really invoked, not called by
# hand) and that the fallback common rule set is looked up relative to the FINAL file, not the
# intermediate link.
{
  name="portability-through-a-symlink-chain"
  root13="$ROOT_TMP/c13"
  src="$root13/source-repo"; bin="$root13/bin"; repo="$root13/repo"; home="$root13/home"
  mkdir -p "$src" "$bin" "$home"

  cp "$GUARD" "$src/pre-commit-guard.sh"
  chmod +x "$src/pre-commit-guard.sh"
  cp "$COMMON_SRC" "$src/gitleaks-common.toml"

  ln -sfn "$src/pre-commit-guard.sh" "$bin/hook-link.sh"

  new_repo "$repo"
  ln -sfn "$bin/hook-link.sh" "$repo/.git/hooks/pre-commit"

  write_repo_cfg "$repo/.gitleaks.toml"
  write_repo_only_secret "$repo/leak.env"
  git -C "$repo" add leak.env .gitleaks.toml

  # HOME with no home rule set — the common rule set must be found ONLY through the fallback path
  # next to source-repo/pre-commit-guard.sh, not next to the intermediate link.
  commit_out="$( cd "$repo" && env HOME="$home" PATH="$PATH_FULL" git commit -m "test" 2>&1 )"; commit_rc=$?
  if [ "$commit_rc" -ne 0 ] && printf '%s' "$commit_out" | grep -q "repository"; then
    report_ok "$name"
  else
    report_fail "$name" "expected a non-zero git commit exit code and the word \"repository\" in the output; got rc=$commit_rc, output: $(truncate_out "$commit_out")"
  fi
}

# === Case 14: a gitleaks:allow tag doesn't lift the check =========================
# `gitleaks:allow` in a comment is a standard gitleaks feature that silences a finding in BOTH
# rule sets AT ONCE (a property of gitleaks, not of a rule set). Before --ignore-gitleaks-allow,
# this was a silent bypass of the whole "two rule sets" design, one comment away and invisible in
# review.
{
  name="gitleaks-allow-tag-doesnt-lift-the-check"
  repo="$ROOT_TMP/c14/repo"; home="$ROOT_TMP/c14/home"
  new_repo "$repo"; new_fakehome "$home"
  write_repo_cfg "$repo/.gitleaks.toml"
  write_gemini_key_with_allow_tag "$repo/secret.env"
  git -C "$repo" add secret.env .gitleaks.toml

  run_guard_in "$repo" "$home"
  if [ "$CASE_RC" -eq 1 ] && printf '%s' "$CASE_OUT" | grep -q "secrets found"; then
    report_ok "$name"
  else
    report_fail "$name" "expected rc=1 and \"secrets found\" in the output; got rc=$CASE_RC, output: $(truncate_out "$CASE_OUT")"
  fi
}

# === Case 15: an invisible exception file — a refusal =============================
# .gitleaksignore silences a finding at gitleaks itself (not at the guard) — but if the file isn't
# staged, it's invisible in the diff, and in a pull request. Worse still: also listed in
# .gitignore.
{
  name="invisible-exception-file-refuses"
  repo="$ROOT_TMP/c15/repo"; home="$ROOT_TMP/c15/home"
  new_repo "$repo"; new_fakehome "$home"
  write_gemini_key "$repo/secret.env"
  printf '.gitleaksignore\n' > "$repo/.gitignore"
  printf 'secret.env:gemini-api-key:1\n' > "$repo/.gitleaksignore"
  git -C "$repo" add secret.env .gitignore

  run_guard_in "$repo" "$home"
  if [ "$CASE_RC" -eq 1 ] && printf '%s' "$CASE_OUT" | grep -q "invisible silencer"; then
    report_ok "$name"
  else
    report_fail "$name" "expected rc=1 and \"invisible silencer\" in the output; got rc=$CASE_RC, output: $(truncate_out "$CASE_OUT")"
  fi
}

# === Case 16: a tracked exception file — warns, doesn't block ======================
# The edge of case 15: a staged .gitleaksignore is legitimate (visible in review), but staying
# silent about it isn't allowed either.
{
  name="tracked-exception-file-warns"
  repo="$ROOT_TMP/c16/repo"; home="$ROOT_TMP/c16/home"
  new_repo "$repo"; new_fakehome "$home"
  printf 'secret.env:gemini-api-key:1\n' > "$repo/.gitleaksignore"
  write_clean_ts "$repo/hello.ts"
  git -C "$repo" add hello.ts .gitleaksignore

  run_guard_in "$repo" "$home"
  if [ "$CASE_RC" -eq 0 ] && printf '%s' "$CASE_OUT" | grep -q "\.gitleaksignore"; then
    report_ok "$name"
  else
    report_fail "$name" "expected rc=0 and a mention of .gitleaksignore in the output; got rc=$CASE_RC, output: $(truncate_out "$CASE_OUT")"
  fi
}

# === Case 17: a toothless common rule set (empty file) — a refusal =================
# An empty, truncated, or weakened rule set gives "clean" indistinguishably from a healthy one.
# The bait is an obvious secret the rule set has to catch, or it's not fit to judge with.
{
  name="toothless-common-rule-set-empty-file-refuses"
  isolated="$ROOT_TMP/c17/isolated"; mkdir -p "$isolated"
  cp "$GUARD" "$isolated/guard.sh"
  repo="$ROOT_TMP/c17/repo"; home="$ROOT_TMP/c17/home"
  new_repo "$repo"; mkdir -p "$home"
  write_repo_cfg "$repo/.gitleaks.toml"
  : > "$home/.gitleaks.toml"
  write_clean_ts "$repo/hello.ts"
  git -C "$repo" add hello.ts .gitleaks.toml

  run_guard_in "$repo" "$home" "$PATH_FULL" "$isolated/guard.sh"
  if [ "$CASE_RC" -eq 1 ] && printf '%s' "$CASE_OUT" | grep -q "toothless"; then
    report_ok "$name"
  else
    report_fail "$name" "expected rc=1 and \"toothless\" in the output; got rc=$CASE_RC, output: $(truncate_out "$CASE_OUT")"
  fi
}

# === Case 18: a toothless common rule set (valid TOML, no rules) — a refusal ========
{
  name="toothless-common-rule-set-no-rules-refuses"
  isolated="$ROOT_TMP/c18/isolated"; mkdir -p "$isolated"
  cp "$GUARD" "$isolated/guard.sh"
  repo="$ROOT_TMP/c18/repo"; home="$ROOT_TMP/c18/home"
  new_repo "$repo"; mkdir -p "$home"
  write_repo_cfg "$repo/.gitleaks.toml"
  printf 'title = "rule set with no rules"\n' > "$home/.gitleaks.toml"
  write_clean_ts "$repo/hello.ts"
  git -C "$repo" add hello.ts .gitleaks.toml

  run_guard_in "$repo" "$home" "$PATH_FULL" "$isolated/guard.sh"
  if [ "$CASE_RC" -eq 1 ] && printf '%s' "$CASE_OUT" | grep -q "toothless"; then
    report_ok "$name"
  else
    report_fail "$name" "expected rc=1 and \"toothless\" in the output; got rc=$CASE_RC, output: $(truncate_out "$CASE_OUT")"
  fi
}

# === Case 18b: a custom rule id colliding with a gitleaks built-in — a refusal ======
# This is the id-collision failure described in gitleaks-common.toml, exercised through the guard
# rather than through gitleaks directly: an id renamed back to one of gitleaks' own built-ins (its
# default "openai-api-key" rule doesn't match the same shape as ours) silently wins over the
# custom regex, and gitleaks reports clean even though the file being scanned is exactly the bait
# for that rule. bait_check has to notice, since nothing else would.
{
  name="colliding-rule-id-is-caught-as-toothless"
  isolated="$ROOT_TMP/c18b/isolated"; mkdir -p "$isolated"
  cp "$GUARD" "$isolated/guard.sh"
  # A copy of the real common rule set with the openai rule's id put back to the un-prefixed form
  # that collides with gitleaks' own built-in.
  sed 's/id = "hr-openai-api-key"/id = "openai-api-key"/' "$COMMON_SRC" > "$isolated/gitleaks-common.toml"
  repo="$ROOT_TMP/c18b/repo"; home="$ROOT_TMP/c18b/home"
  new_repo "$repo"; mkdir -p "$home"
  write_repo_cfg "$repo/.gitleaks.toml"
  write_clean_ts "$repo/hello.ts"
  git -C "$repo" add hello.ts .gitleaks.toml

  run_guard_in "$repo" "$home" "$PATH_FULL" "$isolated/guard.sh"
  if [ "$CASE_RC" -eq 1 ] \
     && printf '%s' "$CASE_OUT" | grep -q "toothless" \
     && printf '%s' "$CASE_OUT" | grep -q "hr-openai-api-key"; then
    report_ok "$name"
  else
    report_fail "$name" "expected rc=1, \"toothless\", and \"hr-openai-api-key\" named; got rc=$CASE_RC, output: $(truncate_out "$CASE_OUT")"
  fi
}

# === Cases 19-21: the rules-freshness reminder ====================================
# The reminder calls what-changed.mjs from $HOUSE_RULES_HOME. In the sandbox, a stub sits in its
# place, printing a marker: this checks exactly the trigger condition, not the tool itself. The
# marker to look for is the house-rules:begin section marker in AGENTS.md.
NODE_BIN="$(command -v node 2>/dev/null || true)"
PATH_WITH_NODE="$PATH_FULL"
[ -n "$NODE_BIN" ] && PATH_WITH_NODE="$PATH_FULL:$(dirname "$NODE_BIN")"

new_house_rules_home_with_stub() {
  local dir="$1"
  mkdir -p "$dir/bin"
  printf 'console.log("REMINDER-STUB"); process.exit(1);\n' > "$dir/bin/what-changed.mjs"
}

{
  name="reminder-fires-on-the-section-marker-in-agents"
  if [ -z "$NODE_BIN" ]; then
    report_skip "$name" "node not found — the reminder doesn't run without it"
  else
    repo="$ROOT_TMP/c19/repo"; home="$ROOT_TMP/c19/home"; hrh="$ROOT_TMP/c19/hrh"
    new_repo "$repo"; new_fakehome "$home"; new_house_rules_home_with_stub "$hrh"
    printf '# Project\n\n<!-- house-rules:begin level=1 applied=2026-09-01 fingerprint=aa -->\n<!-- w -->\n<!-- house-rules:end -->\n' > "$repo/AGENTS.md"
    write_clean_ts "$repo/hello.ts"
    git -C "$repo" add hello.ts AGENTS.md

    CASE_OUT="$( cd "$repo" && env HOME="$home" PATH="$PATH_WITH_NODE" HOUSE_RULES_HOME="$hrh" bash "$GUARD" 2>&1 )"; CASE_RC=$?
    if [ "$CASE_RC" -eq 0 ] && printf '%s' "$CASE_OUT" | grep -q "\[rules\] REMINDER-STUB"; then
      report_ok "$name"
    else
      report_fail "$name" "expected rc=0 and \"[rules] REMINDER-STUB\"; got rc=$CASE_RC, output: $(truncate_out "$CASE_OUT")"
    fi
  fi
}

{
  name="no-marker-no-reminder"
  if [ -z "$NODE_BIN" ]; then
    report_skip "$name" "node not found — the reminder doesn't run without it"
  else
    repo="$ROOT_TMP/c20/repo"; home="$ROOT_TMP/c20/home"; hrh="$ROOT_TMP/c20/hrh"
    new_repo "$repo"; new_fakehome "$home"; new_house_rules_home_with_stub "$hrh"
    printf '# Project without a section\n' > "$repo/AGENTS.md"
    write_clean_ts "$repo/hello.ts"
    git -C "$repo" add hello.ts AGENTS.md

    CASE_OUT="$( cd "$repo" && env HOME="$home" PATH="$PATH_WITH_NODE" HOUSE_RULES_HOME="$hrh" bash "$GUARD" 2>&1 )"; CASE_RC=$?
    if [ "$CASE_RC" -eq 0 ] && ! printf '%s' "$CASE_OUT" | grep -q "REMINDER-STUB"; then
      report_ok "$name"
    else
      report_fail "$name" "expected rc=0 and silence from the reminder; got rc=$CASE_RC, output: $(truncate_out "$CASE_OUT")"
    fi
  fi
}

{
  name="no-house-rules-home-reminder-skips-silently"
  if [ -z "$NODE_BIN" ]; then
    report_skip "$name" "node not found — the reminder doesn't run without it"
  else
    repo="$ROOT_TMP/c21/repo"; home="$ROOT_TMP/c21/home"
    new_repo "$repo"; new_fakehome "$home"
    printf '# Project\n\n<!-- house-rules:begin level=1 applied=2026-09-01 fingerprint=aa -->\n<!-- w -->\n<!-- house-rules:end -->\n' > "$repo/AGENTS.md"
    write_clean_ts "$repo/hello.ts"
    git -C "$repo" add hello.ts AGENTS.md

    CASE_OUT="$( cd "$repo" && env -u HOUSE_RULES_HOME HOME="$home" PATH="$PATH_WITH_NODE" bash "$GUARD" 2>&1 )"; CASE_RC=$?
    if [ "$CASE_RC" -eq 0 ] && [ -z "$CASE_OUT" ]; then
      report_ok "$name"
    else
      report_fail "$name" "expected rc=0 and empty output with no HOUSE_RULES_HOME; got rc=$CASE_RC, output: $(truncate_out "$CASE_OUT")"
    fi
  fi
}

echo ""
echo "passed $PASS of $TOTAL_CASES"
[ "$SKIP" -gt 0 ] && echo "skipped: $SKIP"

# === --prove-mutations: a check must not be decoration =====================
MUT_FAILED=0
if [ "${1:-}" = "--prove-mutations" ]; then
  echo ""
  MUT_DIR="$ROOT_TMP/mutations"
  mkdir -p "$MUT_DIR"
  cp "$COMMON_SRC" "$MUT_DIR/gitleaks-common.toml"

  mut_repo_blank="$MUT_DIR/guard-repo-cfg-blank.sh"
  mut_common_blank="$MUT_DIR/guard-common-cfg-blank.sh"
  mut_no_gitleaks_check="$MUT_DIR/guard-no-gitleaks-check.sh"
  mut_unparsed_hits="$MUT_DIR/guard-unparsed-hits.sh"

  awk '/^[[:space:]]*# MUT-POINT/ { print "  REPO_CFG=\"\""; next } { print }' "$GUARD" > "$mut_repo_blank"
  awk '/^[[:space:]]*# MUT-POINT/ { print "  COMMON_CFG=\"\""; next } { print }' "$GUARD" > "$mut_common_blank"
  # Mutation 3: cuts the whole "gitleaks not installed" refusal block (condition + body + fi).
  awk '
    /^[[:space:]]*if ! command -v gitleaks >\/dev\/null 2>&1; then$/ { skip=1; next }
    skip && /^[[:space:]]*fi$/ { skip=0; next }
    skip { next }
    { print }
  ' "$GUARD" > "$mut_no_gitleaks_check"
  # Mutation 4: reverts the guard to its pre-fix state — finding parsing is broken and the "found
  # something but couldn't parse it" branch is removed. This is what the broken code looked like
  # when review found it: the rule set honestly says "found something", not a single fingerprint
  # gets extracted, the finding list is empty — and a commit with a real leak passes GREEN. The
  # check must turn red exactly here.
  awk '
    /^[[:space:]]*if \[ "\$before" = "\$after" \]; then$/ { skip=1; next }
    skip && /^[[:space:]]*fi$/ { skip=0; next }
    skip { next }
    { print }
  ' "$GUARD" | sed 's/\^Fingerprint:/^ThisHeaderNeverExists:/' > "$mut_unparsed_hits"

  mut_no_ignore_allow="$MUT_DIR/guard-no-ignore-allow.sh"
  mut_no_ignore_file="$MUT_DIR/guard-no-ignore-file.sh"
  mut_no_bait_check="$MUT_DIR/guard-no-bait-check.sh"

  # Mutation 5: drops --ignore-gitleaks-allow from the shared scan flags — a `gitleaks:allow`
  # comment silences a finding again, silently.
  sed 's/ --ignore-gitleaks-allow//' "$GUARD" > "$mut_no_ignore_allow"

  # Mutation 6: cuts the whole .gitleaksignore block — from the IGNORE_FILE= line to its closing
  # fi. The block is nested (an if inside an if), exactly two closing "fi"s — counted here.
  awk '
    /^[[:space:]]*IGNORE_FILE=/ { skip=1; closes=0; next }
    skip {
      if ($0 ~ /^[[:space:]]*fi[[:space:]]*$/) {
        closes++
        if (closes == 2) { skip=0 }
        next
      }
      next
    }
    { print }
  ' "$GUARD" > "$mut_no_ignore_file"

  # Mutation 7: cuts the bait check entirely — the bait_check() function and its call. Three
  # closing tokens inside (the bait's fi, the function's }, the call's fi) — counted here.
  awk '
    /^[[:space:]]*bait_check\(\) \{$/ { skip=1; closes=0; next }
    skip {
      if ($0 ~ /^[[:space:]]*(fi|\})[[:space:]]*$/) {
        closes++
        if (closes == 3) { skip=0 }
        next
      }
      next
    }
    { print }
  ' "$GUARD" > "$mut_no_bait_check"

  chmod +x "$mut_repo_blank" "$mut_common_blank" "$mut_no_gitleaks_check" "$mut_unparsed_hits" \
    "$mut_no_ignore_allow" "$mut_no_ignore_file" "$mut_no_bait_check"

  # Mutation 1: only the common rule set is effective (REPO_CFG blanked) — case 1 (the repository
  # rule set is required) must turn red.
  mut1_out="$(GUARD_UNDER_TEST="$mut_repo_blank" bash "$SELF" 2>&1)"
  if printf '%s\n' "$mut1_out" | grep -q "^FAIL readable-secret-caught-by-repository-rule-set:"; then
    echo "OK mutation 1/9"
  else
    echo "FAIL mutation 1: the check can't turn red"
    MUT_FAILED=1
  fi

  # Mutation 2: only the repository rule set is effective (COMMON_CFG blanked) — case 2 (the
  # common rule set is required) must turn red.
  mut2_out="$(GUARD_UNDER_TEST="$mut_common_blank" bash "$SELF" 2>&1)"
  if printf '%s\n' "$mut2_out" | grep -q "^FAIL secret-caught-by-common-rule-set-only:"; then
    echo "OK mutation 2/9"
  else
    echo "FAIL mutation 2: the check can't turn red"
    MUT_FAILED=1
  fi

  # Mutation 3: the "gitleaks not installed" refusal block is cut — case 4 (recognizes EXACTLY
  # that branch by text) must turn red.
  mut3_out="$(GUARD_UNDER_TEST="$mut_no_gitleaks_check" bash "$SELF" 2>&1)"
  if printf '%s\n' "$mut3_out" | grep -q "^FAIL no-gitleaks-refuses:"; then
    echo "OK mutation 3/9"
  else
    echo "FAIL mutation 3: the check can't turn red"
    MUT_FAILED=1
  fi

  # Mutation 4: finding parsing is broken — the guard MUST treat that as broken, not clean. The
  # case that must turn red is a real leak, not some indirect one.
  mut4_out="$(GUARD_UNDER_TEST="$mut_unparsed_hits" bash "$SELF" 2>&1)"
  if printf '%s\n' "$mut4_out" | grep -q "^FAIL readable-secret-caught-by-repository-rule-set:"; then
    echo "OK mutation 4/9"
  else
    echo "FAIL mutation 4: broken finding parsing doesn't turn red — a secret would reach the commit"
    MUT_FAILED=1
  fi

  # Mutation 5: the --ignore-gitleaks-allow flag is dropped — the gitleaks:allow tag silences a
  # finding again, case 14 must turn red.
  mut5_out="$(GUARD_UNDER_TEST="$mut_no_ignore_allow" bash "$SELF" 2>&1)"
  if printf '%s\n' "$mut5_out" | grep -q "^FAIL gitleaks-allow-tag-doesnt-lift-the-check:"; then
    echo "OK mutation 5/9"
  else
    echo "FAIL mutation 5: the check can't turn red"
    MUT_FAILED=1
  fi

  # Mutation 6: the .gitleaksignore block is cut — the invisible silencer passes unnoticed again,
  # "invisible-exception-file-refuses" must turn red.
  mut6_out="$(GUARD_UNDER_TEST="$mut_no_ignore_file" bash "$SELF" 2>&1)"
  if printf '%s\n' "$mut6_out" | grep -q "^FAIL invisible-exception-file-refuses:"; then
    echo "OK mutation 6/9"
  else
    echo "FAIL mutation 6: the check can't turn red"
    MUT_FAILED=1
  fi

  # Mutation 7: the bait check is cut — a toothless rule set looks healthy again, case 17 (empty
  # file) must turn red.
  mut7_out="$(GUARD_UNDER_TEST="$mut_no_bait_check" bash "$SELF" 2>&1)"
  if printf '%s\n' "$mut7_out" | grep -q "^FAIL toothless-common-rule-set-empty-file-refuses:"; then
    echo "OK mutation 7/9"
  else
    echo "FAIL mutation 7: the check can't turn red"
    MUT_FAILED=1
  fi
  # Mutation 8: the AGENTS.md section marker is no longer recognized — the reminder stops firing
  # for a repository that has a section. Case 19 must turn red.
  mut_no_label="$MUT_DIR/guard-no-label.sh"
  sed 's|&& grep -qF .<!-- house-rules:begin. "$REPO_ROOT/AGENTS.md"|\&\& false|' "$GUARD" > "$mut_no_label"
  # Mutation 9: the condition is removed entirely — the reminder fires everywhere. Case 20 must
  # turn red.
  mut_always="$MUT_DIR/guard-remind-always.sh"
  sed 's/^  HAS_RULES=0$/  HAS_RULES=1/' "$GUARD" > "$mut_always"
  chmod +x "$mut_no_label" "$mut_always"
  if cmp -s "$GUARD" "$mut_no_label" || cmp -s "$GUARD" "$mut_always"; then
    echo "FAIL mutations 8-9: mutation target not found — update the self-test together with the guard"
    MUT_FAILED=1
  else
    mut8_out="$(GUARD_UNDER_TEST="$mut_no_label" bash "$SELF" 2>&1)"
    if printf '%s\n' "$mut8_out" | grep -q "^FAIL reminder-fires-on-the-section-marker-in-agents:"; then
      echo "OK mutation 8/9"
    else
      echo "FAIL mutation 8: the check can't turn red"
      MUT_FAILED=1
    fi
    mut9_out="$(GUARD_UNDER_TEST="$mut_always" bash "$SELF" 2>&1)"
    if printf '%s\n' "$mut9_out" | grep -q "^FAIL no-marker-no-reminder:"; then
      echo "OK mutation 9/9"
    else
      echo "FAIL mutation 9: the check can't turn red"
      MUT_FAILED=1
    fi
  fi
fi

if [ "$FAIL" -eq 0 ] && [ "$MUT_FAILED" -eq 0 ]; then
  exit 0
fi
exit 1
