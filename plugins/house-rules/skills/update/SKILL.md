---
name: update
description: Pull updates to the shared rules into the current repository — diff against the source, run the "For adopters" recipes from the changelog, and refresh the "Rules" section in AGENTS.md, all as one pull request. Invoked by the /house-rules:update command or phrases — check for rule updates, check the rules, pull in rule updates, what's new in the rules, update the rules, update the standard.
---

# Pull in rule updates

The rules an executor must follow sit in the repository's `AGENTS.md`, in a section between
invisible markers:

```
<!-- house-rules:begin level=N applied=YYYY-MM-DD fingerprint=… -->
…
<!-- house-rules:end -->
```

The section is built from the source (`plugins/house-rules/rules/rules.md`) for the repository's
level. `applied` is the date of the last changelog entry applied here. The full rules — the
reference docs — live only in the source; they don't get copied into the repository.

## 1. Find the source and refresh it

Source, in order — first match wins: `${CLAUDE_PLUGIN_ROOT}` — the main path, the installed
plugin's own cache, with everything it ships; otherwise `HOUSE_RULES_HOME`, if that environment
variable is set — an override for a checked-out clone of this repository.

- **Neither found** → say so plainly: "there's no source of rules on this machine to diff against,"
  and stop (this happens in a cloud session). Never answer "everything's current."
- **Found and it's a git checkout** (only `HOUSE_RULES_HOME` can be — the plugin cache never is) →
  `git -C <source> pull --ff-only`. Didn't work → say so, and name the source's last commit date: a
  report against a stale source gets marked stale.

## 2. Diff

```bash
node <source>/bin/what-changed.mjs <repo root>
```

Path only, no flags. Responses:

| response | what to do |
|---|---|
| current, no new entries, section matches | say so in one line and stop |
| entries newer than `applied` | step 3 |
| no markers in `AGENTS.md` | the repository hasn't adopted the rules yet; the entries shown, marked "Applies to: all", carry the adoption recipe — step 3 |
| the section was hand-edited | name which lines; move anything project-specific outside the markers before it gets overwritten |

## 3. Run the recipes

For each entry, oldest to newest:

1. Read its "For adopters" line in full — in the source's `CHANGELOG.md`, not the condensed diff
   output.
2. Steps written with "if" get checked against the repository's actual state: the condition doesn't
   hold — skip the step, and say so out loud.
3. A recipe that describes a state the repository is already in — mark it applied, without touching
   anything.
4. Everything else — do it.

## 4. Refresh the section

```bash
node <source>/bin/agents-md.mjs <repo root> --date <date of the last applied entry>
```

The level comes from the existing marker; on first adoption, pass `--level N` (the repository's
deployment level — named by `AGENTS.md` or by the owner). The tool refuses if the section was
hand-edited: move project-specific content outside the markers first, then repeat with `--force`.

All of this as **one branch and one pull request**, if work here goes through pull requests (the
"Rules" section will say). A recipe that needs the owner's mark is never bypassed: carry it through
to the pull request and name whose mark is needed.

## 5. Report

One line per entry: applied · already in place · not applicable (why) · blocked on the owner's mark.
Then: whether the rules section changed. Finally: a link to the pull request.

🔴 The section between the markers doesn't get hand-edited — it's generated. Found a mistake in a
rule itself — it gets fixed in the source (`rules/rules.md` or a reference doc), not here.
