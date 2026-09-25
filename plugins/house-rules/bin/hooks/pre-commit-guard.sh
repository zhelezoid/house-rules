#!/usr/bin/env bash
# Pre-commit guard: secret scanning (gitleaks) + a rules-freshness reminder.
#
# Judges by TWO rule sets, not one. They are not nested:
#   • common  (~/.gitleaks.toml, or the copy shipped next to this hook — gitleaks-common.toml) —
#     general-purpose rules (AI provider keys, weak default passwords);
#   • repository (<root>/.gitleaks.toml) — variables specific to this project, including
#     READABLE values spelled out in words.
# Swapping one for the other loses half the coverage. A hit in either one blocks the commit.
#
# Silence is forbidden. If gitleaks isn't installed, or neither rule set exists, that's a refusal
# with an explanation — never a quiet pass. Someone who thinks they're protected but isn't is
# worse off than someone who's told plainly that nothing was checked.
#
# Wiring: ln -sfn <path-to-this-file> <repo>/.git/hooks/pre-commit
# (or point a shared hook installer at it — this file itself has no opinion on how it's linked).

set -uo pipefail

FAILED=0
SAY="[secret guard]"

# --- Where we live (need the path to the sibling common rule set) ---------------------
# The hook may be called through a chain of symlinks (.git/hooks/pre-commit -> some bin dir ->
# this file). Resolve the chain ourselves: readlink -f isn't on every machine.
self="${BASH_SOURCE[0]}"
while [ -L "$self" ]; do
  link="$(readlink "$self")"
  case "$link" in
    /*) self="$link" ;;
    *) self="$(dirname "$self")/$link" ;;
  esac
done
SELF_DIR="$(cd "$(dirname "$self")" && pwd)"

# === Phase 1: secrets ==========================================================

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
if [ -z "$ROOT" ]; then
  echo "$SAY couldn't find a repository root — nothing to judge, nowhere to judge it." >&2
  echo "$SAY This isn't permission, it's an unanswered question: run the commit from inside a repository." >&2
  exit 1
fi

# Nothing staged — nothing to judge, stay quiet.
if ! git diff --cached --quiet 2>/dev/null; then

  if ! command -v gitleaks >/dev/null 2>&1; then
    echo "$SAY gitleaks isn't installed — nothing to check the commit with." >&2
    echo "$SAY Install it: brew install gitleaks" >&2
    exit 1
  fi

  # `protect` is deprecated in favor of `git --staged`; use whichever is available.
  if gitleaks git --help >/dev/null 2>&1; then
    SCAN_ARGS=(git --staged)
  else
    SCAN_ARGS=(protect --staged)
  fi

  # Common rule set: the home one, falling back to the copy shipped next to this hook itself.
  # That fallback is what makes the guard portable — a fresh machine is protected even before
  # any other setup runs.
  COMMON_CFG=""
  for cand in "$HOME/.gitleaks.toml" "$SELF_DIR/gitleaks-common.toml"; do
    if [ -f "$cand" ]; then COMMON_CFG="$cand"; break; fi
  done

  REPO_CFG=""
  if [ -f "$ROOT/.gitleaks.toml" ]; then REPO_CFG="$ROOT/.gitleaks.toml"; fi

  if [ -z "$COMMON_CFG" ] && [ -z "$REPO_CFG" ]; then
    echo "$SAY no rule set at all — nothing to judge with." >&2
    echo "$SAY Expected: ~/.gitleaks.toml (common) or $ROOT/.gitleaks.toml (repository)." >&2
    exit 1
  fi
  if [ -z "$COMMON_CFG" ]; then
    echo "$SAY ⚠️ no common rule set — judging with the repository one alone." >&2
    echo "$SAY Half the rules (general-purpose provider keys) aren't applied." >&2
  fi

  # MUT-POINT: rule sets are chosen above this line. Proof by mutation replaces this assignment
  # with a blank rule set and requires the matching scenario to turn red. A check that can't turn
  # red is decoration, not a guard.

  WORKDIR="$(mktemp -d)"
  trap 'rm -rf "$WORKDIR"' EXIT
  HITS="$WORKDIR/hits.tsv"
  : > "$HITS"

  # INVISIBLE SILENCER. gitleaks reads `.gitleaksignore` from the repository root by itself, and a
  # flag can't cancel that: `--gitleaks-ignore-path` ADDS a path, it doesn't replace one — tested,
  # an empty file and an empty directory both leave the repository-root file in force.
  #
  # Worst case: the file isn't staged and is listed in `.gitignore`. Then it silences a finding
  # while being invisible in the diff, in the working tree state, and in a pull request — the
  # check gets switched off by something that, as far as the review is concerned, doesn't exist.
  # Such a file is a refusal.
  #
  # A TRACKED `.gitleaksignore` stays legitimate: it's in git, it's visible in review, and it can
  # be written with real justification. But it's never silent about it.
  IGNORE_FILE="$ROOT/.gitleaksignore"
  if [ -f "$IGNORE_FILE" ]; then
    if git ls-files --error-unmatch ".gitleaksignore" >/dev/null 2>&1; then
      n_ign="$(grep -cvE '^[[:space:]]*(#|$)' "$IGNORE_FILE" 2>/dev/null)"
      echo "$SAY ⚠️ this repository has a .gitleaksignore (${n_ign:-0} entries) — some findings are silenced by it." >&2
    else
      echo "$SAY .gitleaksignore exists but is NOT added to git — that's an invisible silencer." >&2
      echo "$SAY It removes findings without showing up in a diff or a pull request. Not allowed." >&2
      echo "$SAY Either add it to git (so a human can see the exceptions), or remove it." >&2
      FAILED=1
    fi
  fi

  # Shared scan flags, one reason each:
  #   --ignore-gitleaks-allow  a `gitleaks:allow` comment on a line silences the finding in BOTH
  #                            rule sets AT ONCE — that's a property of gitleaks itself, not of a
  #                            rule set. The whole point of "two rule sets" can be defeated by one
  #                            appended comment that a reviewer's eye skates right past.
  #   --redact                 the secret's value never lands even in a temp output file. The
  #                            report only needs a "file:rule:line" fingerprint.
  SCAN_FLAGS=(--no-banner -v --exit-code 7 --ignore-gitleaks-allow --redact)

  # BAIT. A rule set has to prove it can actually catch something. An empty file, a valid TOML
  # with no rules, and a rule set with a catch-all exception all give "clean" and all look like
  # health. Silence on a MISSING rule set is refused already; a toothless rule set that's present
  # gives the same outcome and nothing else caught it. This also catches a change in gitleaks'
  # output format.
  #
  # One bait per custom rule gitleaks-common.toml ships, not just one for the whole file. Baiting
  # only the Anthropic rule once let a real regression through: a custom rule id that collides
  # with one of gitleaks' own built-in ids (its built-in "openai-api-key" is not the same regex as
  # ours) silently wins, and the custom regex is dropped with no warning at all — a single-rule
  # bait check stayed green through exactly that failure, because it was never asking about the
  # rule that had actually gone dead. Every sample below is assembled from pieces at call time —
  # spelled out as one string, any of them would trip this very guard on its own commit.
  bait_check() {
    local cfg="$1" problem=0 label value
    for label in hr-anthropic-api-key hr-openai-api-key hr-gemini-api-key hr-weak-default-passwords; do
      case "$label" in
        hr-anthropic-api-key) value="$(printf '%s%s%s' "sk-ant-" "api03-" "$(printf 'A%.0s' $(seq 1 60))")" ;;
        hr-openai-api-key) value="$(printf '%s%s' "sk-proj-" "$(printf 'A%.0s' $(seq 1 48))")" ;;
        hr-gemini-api-key) value="$(printf '%s%s' "AIza" "$(printf 'B%.0s' $(seq 1 40))")" ;;
        hr-weak-default-passwords) value="$(printf '%s%s%s' "POSTGRES_PASSWORD" "=" "weakvalue1")" ;;
      esac
      if printf '%s\n' "$value" \
        | gitleaks stdin --config "$cfg" --no-banner --exit-code 7 --redact >/dev/null 2>&1; then
        echo "$SAY $cfg didn't see the $label bait — that one rule is toothless." >&2
        problem=1
      fi
    done
    return "$problem"
  }

  if [ -n "$COMMON_CFG" ] && ! bait_check "$COMMON_CFG"; then
    echo "$SAY common rule set ($COMMON_CFG) didn't see an obvious bait — it's toothless." >&2
    echo "$SAY That's not \"clean\": an empty, truncated, or weakened rule set looks healthy too." >&2
    echo "$SAY Check the file in full, or take a fresh copy (bin/hooks/gitleaks-common.toml)." >&2
    FAILED=1
  fi

  # Run one rule set. Return: 0 — clean, 7 — findings, anything else — the rule set didn't run.
  # Findings and breakage get different codes on purpose, so a broken rule set never looks clean.
  scan_one() {
    local label="$1" cfg="$2"
    [ -z "$cfg" ] && return 0
    local out="$WORKDIR/scan.out" rc=0
    gitleaks "${SCAN_ARGS[@]}" --config "$cfg" "${SCAN_FLAGS[@]}" >"$out" 2>&1 || rc=$?
    case "$rc" in
      0) return 0 ;;
      7)
        # Finding fingerprint: <file>:<rule>:<line> — used to dedupe.
        local before after
        before="$(wc -l < "$HITS" | tr -d ' ')"
        grep '^Fingerprint:' "$out" 2>/dev/null \
          | sed 's/^Fingerprint:[[:space:]]*//' \
          | sed "s/^/$label	/" >> "$HITS"
        after="$(wc -l < "$HITS" | tr -d ' ')"
        # The rule set said "found something", and not a single finding could be parsed out —
        # that's a PARSING BREAKAGE, not cleanliness. Without this branch, a change in gitleaks'
        # output (different casing, translation, a new version) would be enough to let a real
        # secret through on an honest "leaks found".
        if [ "$before" = "$after" ]; then
          echo "$SAY rule set \"${label}\" found something, but its output couldn't be parsed." >&2
          echo "$SAY Treating this as broken, not clean. Check the gitleaks version and output format." >&2
          return 1
        fi
        return 7
        ;;
      *)
        # Braces are required here: stock bash on macOS (3.2.57) under `set -u` fails with
        # "unbound variable" on a variable sitting right after a multi-byte character. Confirmed
        # in the wild, and a fresh machine won't have homebrew-bash yet — the hook runs on this
        # exact version.
        echo "$SAY rule set \"${label}\" (${cfg}) didn't run — that's not \"all clean\"." >&2
        grep -E 'FTL|ERR|err:' "$out" 2>/dev/null | tail -3 >&2
        return 1
        ;;
    esac
  }

  BROKEN=0
  rc_common=0; rc_repo=0
  scan_one "common" "$COMMON_CFG" || rc_common=$?
  scan_one "repository" "$REPO_CFG" || rc_repo=$?
  [ "$rc_common" = "1" ] && BROKEN=1
  [ "$rc_repo" = "1" ] && BROKEN=1

  if [ "$BROKEN" = "1" ]; then
    echo "$SAY commit blocked: a rule set couldn't be read. Fix the rule set, don't bypass the check." >&2
    FAILED=1
  elif [ -s "$HITS" ]; then
    n_common="$(grep -c "^common	" "$HITS" 2>/dev/null)"
    n_repo="$(grep -c "^repository	" "$HITS" 2>/dev/null)"
    echo "" >&2
    echo "$SAY secrets found — commit blocked." >&2
    [ -n "$COMMON_CFG" ] && echo "  rule set \"common\" ($COMMON_CFG): ${n_common:-0}" >&2
    [ -n "$REPO_CFG" ] && echo "  rule set \"repository\" ($REPO_CFG): ${n_repo:-0}" >&2
    echo "  distinct findings:" >&2
    # The same secret caught by both rule sets is named once.
    sort -t'	' -k2 "$HITS" | awk -F'	' '
      { if ($2 != prev) { if (prev != "") print "    " prev "  [" who "]"; prev=$2; who=$1 }
        else if (index(who, $1) == 0) { who = who ", " $1 } }
      END { if (prev != "") print "    " prev "  [" who "]" }' >&2
    echo "" >&2
    echo "$SAY Fix it: remove the secret from the file, rotate it, restage the commit." >&2
    FAILED=1
  fi

fi

# === Phase 2: a rules-freshness reminder (does NOT block the commit) =====================
#
# Why. Rules get pulled into a repository ON REQUEST — that's the right call: an update arriving
# by itself mid-task would change behavior without anyone asking for it. But "on request" only
# works as long as someone actually asks, and repositories drift behind if nobody does.
#
# So the question asks itself, at the moment a person is already looking at the terminal. The
# reminder NEVER fails the commit: rules are never a reason to block saving work. At most once a
# day per repository, or it turns into noise nobody reads.
#
# HOUSE_RULES_HOME points at a checkout of this repository (or the installed plugin's cache) —
# without it, the reminder skips silently. There is no machine-specific fallback path.
if [ -n "${HOUSE_RULES_HOME:-}" ]; then
  WHAT_CHANGED="$HOUSE_RULES_HOME/bin/what-changed.mjs"
  REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
  # Who gets reminded: a repository with a rules section in AGENTS.md (the house-rules:begin
  # marker). No section — no rules here by this repository's own choice, nothing to remind about.
  HAS_RULES=0
  if [ -n "$REPO_ROOT" ] && [ -f "$REPO_ROOT/AGENTS.md" ] && grep -qF '<!-- house-rules:begin' "$REPO_ROOT/AGENTS.md"; then
    HAS_RULES=1
  fi
  if [ "$HAS_RULES" -eq 1 ] && [ -f "$WHAT_CHANGED" ]; then
    STAMP="$REPO_ROOT/.git/.house-rules-checked"
    # -mtime -1 = checked less than a day ago; no stamp counts as "a long time ago".
    if [ ! -f "$STAMP" ] || [ -z "$(find "$STAMP" -mtime -1 2>/dev/null)" ]; then
      if command -v node >/dev/null 2>&1; then
        # The tool returns 1 WHEN there's something to pull in — that's its answer, not an error.
        # Its output must not be discarded on a non-zero exit: that's exactly when it carries
        # meaning.
        OUT="$(node "$WHAT_CHANGED" "$REPO_ROOT" 2>/dev/null)"
        case "$OUT" in
          *"rules section is fresh"*|"") : ;;
          *) echo ""; echo "$OUT" | sed 's/^/[rules] /'; echo "" ;;
        esac
        touch "$STAMP"
      fi
    fi
  fi
fi

exit $FAILED
