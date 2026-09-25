# Changelog

> This file is the only place to check for rule updates — not commit history, not digging through
> documents. Every change to the rules gets one entry here: a dated heading, a `Documents:` line,
> and a `For adopters:` line — what a repository that has already adopted the rules needs to do
> about it.
>
> The machine entry point into this file is `bin/what-changed.mjs`: it diffs a repository's copy of
> the rules against this source and prints only what changed since that repository last applied it.
> That's what the `/house-rules:update` command runs.

Entry format: `## YYYY-MM-DD · title` · a `Documents:` line · a `For adopters:` line — what to do to
pick up the change (or "nothing, the rule applies itself"). An optional `Applies to:` line, starting
with "all" when the entry reaches even repositories that haven't adopted the rules yet.

---

## 2026-09-25 · Neutral examples in the reference and the agents

**Documents:** `reference/empty-vs-broken.md`, `reference/repo-standard.md`, `reference/spec-and-tests.md`, `agents/test-auditor.md`, `agents/test-writer.md`, `templates/test-map.mjs`, `bin/hooks/pre-commit-guard.self-test.sh`

**For adopters:** nothing — wording of examples only; no rule changed.

---

## 2026-09-25 · Initial release

**Documents:** `rules/rules.md`, `reference/repo-standard.md`, `reference/task-loop.md`,
`reference/review.md`, `reference/guards.md`, `reference/empty-vs-broken.md`,
`reference/spec-and-tests.md`, `reference/test-map-and-audit.md`, `reference/deployment-levels.md`,
`proofs/REQUIRED-PROOFS.md`, `proofs/required-proofs.json`, `skills/house-rules/SKILL.md`,
`skills/update/SKILL.md`, `agents/test-auditor.md`, `agents/test-writer.md`

**Applies to:** all

**For adopters:**
1. Install the plugin: `claude plugin marketplace add zhelezoid/house-rules`, then
   `claude plugin install house-rules@house-rules`.
2. Pick a deployment level (1–4, see `reference/deployment-levels.md`) and build the "Rules" section
   in your repository's `AGENTS.md`: run `/house-rules:update` from a session inside the repository —
   it finds this plugin's `bin/agents-md.mjs` on its own and builds the section, plus the adoption
   recipes for whatever else that level needs.
3. If your repository has a root `CLAUDE.md`: Claude Code doesn't auto-load `AGENTS.md` when a root
   `CLAUDE.md` exists, so the second file quietly disables the canon. Move anything in it worth
   keeping into `AGENTS.md`, then remove `CLAUDE.md`.
4. Keep project-specific rules outside the `<!-- house-rules:begin -->` / `<!-- house-rules:end -->`
   markers — that section is generated and gets overwritten on the next update.
