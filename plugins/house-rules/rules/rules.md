<!-- Source of the "Rules" section in every repository's AGENTS.md. Built by bin/agents-md.mjs:
sections up to the repository's level are pulled in and headings are demoted. This file holds ONLY
what the executor MUST follow, a line or two per rule; explanations and reasons live in
plugins/house-rules/reference/, which each rule links to. File cap: 120 lines (guarded by
bin/check-agents-md-rules.mjs) — this loads into every session.
"Level" here is the level from which the executor MUST behave this way. The `level` field in
proofs/required-proofs.json is the level from which this MUST be proven by a check; it can be
higher (the "empty is not 'couldn't tell'" rule applies from level 1, but is machine-proven only
from level 3). -->

## Level 1 — Specs and the task board

- **Spec first.** A nontrivial task (more than 1–2 files, new logic, an unclear bug) starts with a
  spec in `specs/`, not with code. Spec and the code implementing it land in the same commit. A bug
  is either a hole in the spec or a violation of it — never a silent patch. (`spec-and-tests.md`)
- **Priority comes from the task board, not from files.** No repository runs two priority
  registries at once. The spec index doesn't lie about its contents: a spec's status matches its
  folder. (`repo-standard.md`, `spec-and-tests.md`)
- **The owner's words mid-task are a card, not a command.** "We should do X" mid-session becomes a
  card — point of contact and acceptance noted — and work resumes on what was already started. Only
  "do it now," a production fire, or the very reason the session started justify dropping it.
  (`repo-standard.md`)
- **Orders and findings are different queues.** Something the owner asked for goes into the work
  queue. Something an agent thought of on its own goes into an inbox, unprioritized, capped at five
  findings per pass. (`task-loop.md`)
- **A card is complete:** why, which forks got decided, what must not break, how it's proven, who
  closes the human parts. Questions get asked while planning, not mid-task. (`repo-standard.md`)
- **A card's status follows the work;** "whose turn" is a separate label. The executor on a card an
  agent is running is an agent identity, not the owner. (`repo-standard.md`, `task-loop.md`)
- **Related work moves as one batch:** one branch, one commit or pull request, one release per point
  of contact. (`repo-standard.md`)
- **A task is driven to a commit before the next one starts.** Stopping to ask the owner a question
  mid-task is not allowed — the question becomes a card instead. (`task-loop.md`)
- **Review before commit, without asking:** a nontrivial diff gets a fan of reviewers with different
  angles; confirmed findings get fixed before the commit. A diff touching deployment gets an extra
  angle: "what happens if the release fails halfway." (`review.md`)
- **"Empty" and "couldn't find out" are different answers.** A source failing is never silently
  reported as zero, in code or in a report. (`empty-vs-broken.md`)
- **Session start:** sync with the server and the task board before the first edit. **Session end:**
  background work stopped, work in progress either finished or named unfinished, production checked
  by response codes, board reconciled, next work planned in batches. (`repo-standard.md`)
- **A rule without a mechanism doesn't get adopted.** No check guarding it — it's advice, and it's
  named that way. (`guards.md`)
- **No root `CLAUDE.md`:** there is one rulebook, this file. Claude Code doesn't auto-load
  `AGENTS.md` when a root `CLAUDE.md` exists, so a second file at the root silently disables the
  canon. Project-specific material lives outside this section, capped at 150 lines — it loads into
  every session. Rare-case procedures belong in a project skill or a scoped rule (`.claude/rules/`),
  not here. (`repo-standard.md`)

## Level 2 — Test control

- **A machine-checkable acceptance item is an executable check in the build.** An item a human or
  production verifies is never checked off by the executor itself. (`spec-and-tests.md`)
- **A check must be able to turn red:** after writing it, break the guarded thing on purpose and
  confirm it fails; what you broke gets recorded in acceptance. A check that can't turn red is worse
  than no check. (`spec-and-tests.md`, `guards.md`)
- **A test hits live code,** not a copy sitting next to it, and never replaces the very thing it's
  checking. (`test-map-and-audit.md`)
- **A red build gets its cause fixed, not worked around.** Checks run on every change.
  (`repo-standard.md`, "Gates")

## Level 3 — Executor without the owner

- **Nobody writes to the main branch directly, including the owner:** branch → pull request → green
  checks → merge. (`repo-standard.md`, "Branches and merging")
- **A pull request names three things:** what was done, what was verified, what was **not**
  verified.
- **Who merges:** the owner — always; a session with the owner present — only if the owner decides;
  an autonomous executor woken by a task — **never**. (`repo-standard.md`, "Who may merge")
- **Editing the guard itself needs the owner's mark:** checks, the list of guarded paths, the
  barrier, release files, executor permissions. Rule text and the spec index marker a session
  approves on its own. (`repo-standard.md`, "Integrity gate")
- **Irreversible actions stop at a human:** the barrier on dangerous commands is never bypassed; the
  owner's one-off permission needs a reason and leaves a trace. (`repo-standard.md`, "Barrier")
- **A secret never reaches history:** a secrets guard runs in the build and before commit; if it
  fires, fix the cause, don't `--no-verify`. (`guards.md`)
- **A release gets verified after it lands:** what codes the key addresses actually answer with.
  Treat auto-rollback as a safety net only if it's physically part of the release.
  (`repo-standard.md`)
- **Releases move as a batch:** every merge to the main branch redeploys production.
  (`repo-standard.md`)
- **Readings survive environment rebuilds:** counters and measurements a decision leans on live
  outside the container a release recreates. (`empty-vs-broken.md`)

## Level 4 — More than one executor

- **A task is claimed before work starts:** status, executor, which machine took it, which files
  are occupied. Held by someone else — don't take it. (`task-loop.md`, "The 'take a task' door")
- **File overlap is visible in advance:** before starting, check occupied files against other tasks
  in progress. (`task-loop.md`)
- **Only one executor changes the data schema at a time;** migrations never merge automatically.
  (`repo-standard.md`)
- **Hands off what's not yours:** uncommitted work that predates the session, and another
  executor's branches.
