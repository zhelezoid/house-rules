---
name: house-rules
description: The standard for working on a repository, and the entry point into deploying it — the AGENTS.md canon (one rulebook at the root, no CLAUDE.md), the branch and pull-request protocol, who may merge, CI gates and what the integrity gate guards, the barrier on irreversible commands, the task board instead of a plan file, review before merge, the changelog, the session-start ritual, deployment levels. Activates for phrases like — repository standard, work protocol, bring this to standard, how we do things here, repository rules, can I merge my own pull request, what do the gates guard, set up branch protection, work through a branch and pull request, auto-merge, barrier, irreversible commands. ALSO for the phrase from any folder — redo this repository, tidy this up, deploy the rules here, set up our protocol here, what level does this need, raise the level, bring this folder up to standard: the skill surveys the repository, proposes a level, and hands off to whatever applies it.
---

# The standard for working on a repository

This skill carries no knowledge of its own — it points to the source. The knowledge lives in a
plain document any model can read, including one accessed by API rather than through skills.

## What to do

**Read `reference/repo-standard.md`** — that's the actual content; this skill only points to it.

🔴 **Where to look for the document, in order — first match wins.**

1. `${CLAUDE_PLUGIN_ROOT}/reference/repo-standard.md` — the main path: the skill arrived as a
   plugin, and this is the installed plugin's own cache, with everything it ships.
2. `HOUSE_RULES_HOME/reference/repo-standard.md`, if that environment variable is set — an override
   for a checked-out clone of this repository, used instead of the installed cache.

⚠️ Neither found — say so out loud rather than reciting the standard from memory. Either way, the
mandatory part is already sitting in the repository's own `AGENTS.md`, under "Rules", regardless of
whether the reference doc is found.

Then follow it. Neighboring documents in the same set:

| Document | About |
|---|---|
| `reference/repo-standard.md` | the AGENTS.md canon, branches and merging, gates, the barrier, the task board, review, the changelog, session start |
| `reference/spec-and-tests.md` | a spec produces a machine-checkable item → a check catches it → a mutation proves it |
| `reference/review.md` | the fan of review angles, including reviewing a pull request from an autonomous executor |
| `reference/deployment-levels.md` | deployment levels, what's decided by the executor and what needs the owner, what to expect at each level |

## The owner said "bring this repository up to standard" — what to do

The phrase can land from any folder, without naming a skill. The order is always the same.

1. **Read `reference/deployment-levels.md`** — the levels and the decision boundaries live there.
2. **Look the repository over quietly.** What's already there (`AGENTS.md` and a `house-rules:begin`
   marker in it, `specs/`, CI workflows, branch protection), what it builds, what it deploys, what's
   covered by checks. Don't ask about anything that's already visible.
3. **Name the current state and propose a level**, explaining the choice. The owner answers in one
   word. **"Leave it" is a complete answer**, not a refusal — name the reason and stop.
4. **Build the section and work the level's checklist:**
   `${CLAUDE_PLUGIN_ROOT}/bin/agents-md.mjs <repo> --level N` (found the same way as the reference
   document above; or just run the `/house-rules:update` command) builds the "Rules" section in
   `AGENTS.md`; `reference/deployment-levels.md` lists whatever else that level needs — branch
   protection, CI gates, a secrets guard, and so on.

🔴 **Deployment is done by a session running inside the target repository**, not by an autonomous
executor: it isn't there yet. A card on the task board is a record and a trail, not a trigger.

🔴 **Only on request, and only where the owner said so.** Sweeping folders and bringing them up to
standard "just in case" is off the table: most repositories are legacy code or simple apps that
don't need this system at all. Silence is not a request.

## Why this lives outside the skill, as a plain document

Three reasons, and each one has been paid for:

1. **Independence from the model.** Skills are a Claude Code mechanism. The standard has to outlive
   a model change, so the knowledge is a document and the skill is a thin wrapper over it.
2. **One source instead of copies.** Copies of this knowledge, scattered across repositories, have
   drifted before without anyone noticing — nothing was checking that they stayed in sync.
3. **Delivery without moving files.** The plugin is pulled from git on every run: a fix in one place
   reaches everyone who has it installed. "Bring this project up to standard" is the
   `/house-rules:update` command, which rebuilds the section in `AGENTS.md` — not a folder copy.

## What this standard does not do

⚠️ It does **not narrow the executor's rights.** Rights live in token permissions and in what a
workflow grants; this skill adds or removes no tools. Don't rely on `allowed-tools` in the
frontmatter as a restriction — the official documentation is inconsistent about whether it even
applies outside interactive mode, and it isn't proven by a run.

⚠️ It does **not replace a repository's own canon.** A project has its own `AGENTS.md` with its own
invariants, production addresses, and prohibitions. Where they disagree, **the repository's own
canon wins** — it knows things about its project that the general standard doesn't.
