# house-rules

House rules for repositories where AI agents write the code.

`house-rules` is a small, strict rulebook plus the tools that keep it honest, for repositories
where Claude Code, Codex or any other coding agent does a real share of the work. It tells the
agent how work moves through the repository — spec, code, checks, review, pull request, release,
verification — and it pairs every mandatory rule with a mechanism that catches a violation. It is
built for a single owner (or a small team) running one or several agents, and it grows with the
repository: you adopt it at the level you actually need, from "specs and a task board" up to
"several agents working in parallel without you watching."

It ships as a Claude Code plugin, but the knowledge is plain Markdown and the tools are plain
Node.js scripts with no dependencies. Any agent that can read `AGENTS.md` can follow it.

---

## Contents

- [Core ideas](#core-ideas)
- [The levels](#the-levels)
- [The stages of one task](#the-stages-of-one-task)
- [Install and update](#install-and-update)
- [Tools](#tools)
- [Repository map](#repository-map)
- [What is deliberately not here](#what-is-deliberately-not-here)
- [License](#license)

---

## Core ideas

Six ideas carry everything else. Each one is here because its absence has already cost someone a
broken release, a lost week, or false confidence.

### 1. A rule without a mechanism is not adopted — it is advice

A rule that exists only as text gets followed a small fraction of the time; a rule with a program
standing behind it gets followed most of the time. So the bar for a rule in this set is: **what goes
red when someone breaks it?** If nothing does, the rule is either given a mechanism or it is called
what it is — advice.

A mechanism (a "guard") has three parts: a moment it wakes up (commit, pull request, schedule), a
thing it looks at (files, the board, production), and an answer on violation (block, fail, notify).
The strongest form is a platform setting — branch protection, a required status check, an intake
queue on the task board — because a restriction built into the platform cannot be forgotten.

Why: rules that depend on the executor remembering them decay silently. A human forgets; a model
forgets faster, because its context gets compressed mid-task. Only a mechanism survives a change of
person, model, or machine. See [guards.md](plugins/house-rules/reference/guards.md).

### 2. Mandatory rules load themselves; the reference is read on demand

There are two layers, and they are kept apart on purpose.

- **The mandatory layer** is a short "Working rules" section inside the repository's `AGENTS.md`,
  generated from [rules/rules.md](plugins/house-rules/rules/rules.md) for the repository's level.
  One or two lines per rule, capped at 120 lines for all four levels combined. Claude Code and Codex
  load `AGENTS.md` into every session automatically, so the agent has the rules before its first
  action — nobody has to say "read this first."
- **The reference layer** is the long documents in
  [reference/](plugins/house-rules/reference/): the reasons, the edge cases, the examples. Each rule
  in the short section names the reference document behind it. The agent opens the reference when a
  rule applies, not at every session start.

Why: a rulebook that nobody loads is not a rulebook. Copies of reference documents placed in
repositories sit unread, while the one file every session loads on its own gets read every time. At
the same time, a mandatory section that grows into a manual eats the starting context of every
session and stops being read — hence the line cap, enforced by a check.

### 3. No root `CLAUDE.md`

A repository following these rules has exactly one rulebook at its root: `AGENTS.md`.

Why: Claude Code loads `AGENTS.md` automatically only when there is no `CLAUDE.md`,
`.claude/CLAUDE.md` or `CLAUDE.local.md` above it in the tree. A second rulebook at the root does
not fail loudly — the session simply runs without the repository's rules, and from the outside that
looks exactly like a session that has them. Move anything worth keeping from `CLAUDE.md` into
`AGENTS.md` (outside the generated section) and delete it. A `specs/CLAUDE.md` is different: it is a
marker meaning "specs live here," it sits below the root and does not interfere.

### 4. "Empty" and "could not find out" are different answers

Any mechanism that can answer "there is nothing here" must be able to say "I could not check"
instead — in different words, with a different outcome.

Why: this is the most common failure in checks, and the most expensive, because it looks like
health. A sync that received a malformed response reports "no changes." A health check sees `200`
on a page that renders no content. A wrapper reads yesterday's green report because today's run crashed
before writing. In each case silence gets read as calm. Three states — has data, empty, could not
find out — and the third is never folded into the second "for simplicity." See
[empty-vs-broken.md](plugins/house-rules/reference/empty-vs-broken.md).

### 5. A check must be proven able to fail

Writing a check is half the job. The other half is breaking the guarded behavior on purpose,
confirming the check turns red, and reverting. What was broken gets recorded in the acceptance
notes.

Why: a check that always passes looks exactly like one that works — both are green. A missing
check is visible; a dead check creates confidence where there should be none, which makes it worse
than nothing. "Configured" is not "working." Every tool in this repository carries a self-test
built the same way, and a meta-check fails the build if a tool has no self-test or the self-test is
not wired into CI.

### 6. The requirement list travels, not copies of code

What a repository adopting these rules must prove is a list of observable claims in
[proofs/REQUIRED-PROOFS.md](plugins/house-rules/proofs/REQUIRED-PROOFS.md), mirrored for machines in
[proofs/required-proofs.json](plugins/house-rules/proofs/required-proofs.json). Each claim has a
**failure case**: what to break so the check is forced to turn red. How a repository proves the
claim — which language, which CI, which script — is up to the repository.

Why: copies of check code drift from their source without anyone noticing, and they drag one
stack's assumptions into another. A claim with a failure case works in any stack and can be
verified by breaking it. A run answers each claim with one of three answers — **proven**, **not
proven**, **not applicable** (with a reason) — and silence counts as "not proven." Levels decide
which claims are in the set, never how strictly one is judged.

---

## The levels

A repository adopts the rules at one of five levels. The owner picks the level; the agent proposes
one after looking at the repository, with a reason. Levels are cumulative — level 3 includes
everything in levels 1 and 2 — and rungs are not skipped, because each level leans on the one
below: an autonomous agent has nothing to read without a rulebook, and letting it run without
checks means handing the production branch to something nobody is watching.

| Level | Adds | Prevents |
|---|---|---|
| 0 | nothing | spending effort on a repository that does not need it |
| 1 | `AGENTS.md` with the rules section, `specs/`, a task board | nobody knowing what is decided, where things live, or what comes next |
| 2 | executable acceptance, spec-to-test map, checks on every change | "the tests are green" standing in for proof |
| 3 | protected main branch, destructive-command barrier, secrets guard, stage log | an unsupervised agent doing irreversible damage with no trace |
| 4 | task claiming, work split by files, serialized schema changes | two workers taking the same task or clobbering the same file |

Two rules sit above the table.

**Deployment happens only on request.** Sweeping every repository up to a level "just in case" is
explicitly against the rules: most repositories are legacy code or simple apps that do not need
this system. Silence is not a request.

**The rules file names its own level and what is missing.** The first line of `AGENTS.md` says,
for example: "This repository is at level 2: rules, specs and an automatic check run exist. It does
not have an autonomous agent, a guard on destructive commands, or a ban on writing straight to the
main branch — don't rely on them." A rules file that promises protection the repository does not
have is worse than none: whoever reads "a breakage won't reach production" believes it and stops
checking.

Full detail: [deployment-levels.md](plugins/house-rules/reference/deployment-levels.md).

### Level 0 — Leave it alone

**What it adds.** Nothing. There is no rules section for level 0; the generator refuses it.

**Which failure it prevents.** Process for its own sake: rules that cost more to maintain than the
work they govern, and rulebooks that describe protection nobody installed.

**Why it is a level at all.** An agent must be able to say "there is nothing to install here" and
give a reason, rather than feeling obliged to install something. Valid reasons: the repository is
frozen; it is a one-off; it lives inside another repository and takes its rules from there; there
is so little ongoing work that rules would cost more than the work. "Didn't look" is not a reason.

**Move up when** the repository gets recurring work from an agent, or more than one person or model
starts changing it.

### Level 1 — Specs and the task board

**What it adds.** `AGENTS.md` at the root, naming its level, with the generated rules section; a
`specs/` folder with a marker file `specs/CLAUDE.md`; work tracked as cards on a task board.

**Which failure it prevents.** Anyone arriving — a person or a model — not knowing where things
live, what is decided and what is still open. Behavior changing without a record of why. A session
wandering off after every stray thought and losing the thing it started for. A second priority list
quietly competing with the board.

**Why here and not later.** These rules cost almost nothing and need no infrastructure: a file, a
folder, a board. Everything above leans on them — tests need specs to test against, an autonomous
agent needs a rulebook to read. Review before commit is already here too, because a fan of reviewers
needs only the agent's own session, not CI.

A level 1 repository must also keep **spec** and **task** apart, since they appear together here and
are the most common confusion: a spec says how something should work and why, lives next to the
code and outlives the work; a task says what is changing right now, lives on the board and closes.
When unsure — if the text must stay true after the work is done, it is a spec.

**Rules it brings** (from `rules/rules.md`, Level 1):

- Spec first for nontrivial work; spec and code in the same commit; a bug is a hole in the spec or a
  violation of it, never a silent patch.
- Priority comes from the task board; no second registry; the spec index matches reality.
- The owner's words mid-task become a card, not a command.
- Orders and findings are different queues; at most five findings per pass.
- A card is complete: why, forks decided, what must not break, how it is proven, who closes the
  human parts.
- A card's status follows the work; "whose turn" is a separate label; an agent's card is assigned to
  an agent identity.
- Related work moves as one batch: one branch, one pull request, one release.
- A task is driven to a commit before the next starts; questions become cards, not pauses.
- Review before commit, without asking, with an extra deployment angle when the diff touches release
  files.
- "Empty" and "couldn't find out" are different answers.
- Session start syncs with the server and the board; session end leaves nothing half done and
  reconciles the board.
- A rule without a mechanism is not adopted.
- No root `CLAUDE.md`; project material outside the generated section stays under 150 lines.

**Proofs it brings** (from `proofs/required-proofs.json`, level 1):

| id | Claim |
|---|---|
| `intent-and-code-travel-together` | a behavior change and its spec change land as one change |
| `intent-registry-matches-reality` | the spec index shows what is actually there, status matches folder |
| `rules-canon-reaches-the-executor` | one rulebook at the root, loaded automatically, nothing committed disables it |

**Move up when** manual review alone stops catching regressions — concretely, when you catch
yourself saying "just double-check by hand before merging" more than once per change.

### Level 2 — Test control

**What it adds.** Acceptance items in specs tagged **machine** or **human**, with every machine item
tied to an executable check; a spec-to-test map built by
[templates/test-map.mjs](plugins/house-rules/templates/test-map.mjs); the `test-auditor` and
`test-writer` agents; a CI run on every change.

**Which failure it prevents.** "There are a lot of tests" and "the tests are green" standing in for
proof. A regression reaching production and being noticed by a human, long after, with nothing that
would have gone red before it shipped. Tests that call a helper next to the handler instead of the
handler; tests that mock the very guard they claim to check.

**Why here and not earlier or later.** Test control needs specs to measure against, so it cannot
come before level 1. It must come before level 3, because an agent working without the owner needs
something other than the owner to tell it that it broke something. Line coverage is not the goal at
any level: ninety percent with an uncovered payment path is worse than forty percent with it
covered.

**Rules it brings** (Level 2):

- A machine-checkable acceptance item is an executable check in the build; a human or production
  item is never checked off by the executor itself.
- A check must be able to turn red — break it on purpose, record what was broken.
- A test hits live code, not a copy, and never replaces the thing it checks.
- A red build gets its cause fixed, not worked around; checks run on every change.

**Proofs it brings** (level 2):

| id | Claim |
|---|---|
| `checks-can-turn-red` | every guarding claim has a proven red case |
| `run-judged-by-exit-status` | a run's outcome is its exit code, not its printed text (and not a pipe's last command) |
| `shared-check-outlives-single-intent` | a project-wide check does not live inside one task's spec and vanish with it |
| `check-hits-live-code` | gutting the production implementation turns the check red |
| `machine-promise-has-a-checker` | every item marked machine-checked has a check automation actually runs |

**Move up when** a single agent starts making changes without the owner watching in the moment —
even one agent, even with a narrow task. That is the trigger for level 3, not the size of the code.

### Level 3 — Executor without the owner

**What it adds.** Branch protection on the main branch (no direct writes, for anyone); a pull
request that names what was done, what was verified and what was **not** verified; a barrier that
blocks irreversible commands; a secrets guard before commit and in CI; an integrity gate so that
editing the checks themselves needs the owner's approval; a machine identity for the agent; a stage
log; verification of production after every release.

**Which failure it prevents.** An unsupervised agent running a destructive command with nobody to
stop it. A change reaching production with no reviewer and no record of who did what, in which
order. An agent weakening a check and handing itself a green run. A secret landing in history.

**Why here and not earlier.** While the owner is in the conversation, the owner is the barrier and
the log. The moment someone else writes to the repository unobserved, that protection is gone and
must be replaced by mechanisms that do not depend on the executor's good behavior — branch
protection is enforced by the hosting side, not by the agent. What the worker is made of (a coding
agent, a webhook receiver, any model behind an API) does not matter; what matters is that exactly
one worker acts without the owner.

**Rules it brings** (Level 3):

- Nobody writes to the main branch directly, including the owner: branch, pull request, green
  checks, merge.
- A pull request names what was done, what was verified, what was not.
- Who merges: the owner always; a supervised session only if the owner decides; an autonomous
  executor woken by a task — never.
- Editing the guard itself (checks, guarded paths, the barrier, release files, permissions) needs
  the owner's mark; rule text a session approves on its own.
- Irreversible actions stop at a human; a one-off permission needs a reason and leaves a trace.
- A secret never reaches history; a firing guard gets its cause fixed, never `--no-verify`.
- A release is verified after it lands, by the codes key addresses return; auto-rollback counts only
  if it is physically part of the release.
- Releases move as a batch: every merge to main redeploys production.
- Readings a decision leans on survive environment rebuilds.

**Proofs it brings** (level 3):

| id | Claim |
|---|---|
| `no-direct-writes-to-main-line` | a direct write to main is rejected by the hosting side |
| `irreversible-stops-at-a-human` | a destructive command without permission is rejected; with permission, it leaves a trace |
| `secret-never-reaches-history` | a staged key-shaped string blocks the commit |
| `editing-the-guard-needs-owner` | weakening a check without the owner's mark is blocked |
| `agent-work-is-visibly-the-agents` | an agent's cards are assigned to an agent identity and signed |
| `owner-orders-outrank-agent-findings` | agent findings go to an inbox; the receiver sets priority |
| `measurements-outlive-the-environment` | readings survive a rebuild of the environment |
| `release-is-verified-after-it-lands` | a broken key address turns the post-release check red |
| `empty-differs-from-broken` | a cut-off source yields "could not check," not "nothing there" |

The "empty vs. could not find out" rule applies from level 1, but it becomes a machine-proven claim
only at level 3, where no one is watching to notice a silent zero.

**Move up when** a second independent worker shows up — in any mix: two agents, an agent and a
person, two people. Check by fact: an owner running two sessions on the same repository at once is
already halfway into level 4.

### Level 4 — More than one executor

**What it adds.** Claiming a task on the board before work starts (status, executor, machine,
occupied files); splitting work by file zones rather than topics; a mechanical overlap check against
other open pull requests; one worker at a time for schema migrations; a rule for who reviews whom —
with mandatory review before merge when one of the workers is a human with merge rights.

**Which failure it prevents.** Two workers taking the same task. Two workers editing the same file
and one silently overwriting the other. Two migrations claiming the same slot and breaking a
release that then has to be repaired by hand on a live server.

**Why here and not earlier.** With one worker these problems do not exist. With two, they appear
immediately, whatever the workers are made of. Conflicts come from files, not from tasks — two tasks
on unrelated topics can touch the same file — so the split is drawn by paths. What protects you
without relying on discipline is already in place from level 3: protected main, required checks,
serialized releases. With those, the worst outcome of a bad split is a merge conflict, not a broken
production system.

**Rules it brings** (Level 4):

- A task is claimed before work starts; one held by someone else is not taken.
- File overlap is checked in advance against other tasks in progress.
- Only one executor changes the data schema at a time; migrations never merge automatically.
- Hands off what is not yours: uncommitted work that predates the session, another executor's
  branches.

**Proofs it brings** (level 4):

| id | Claim |
|---|---|
| `claimed-work-is-visible` | a second executor learns a task is taken before starting it |
| `file-overlap-is-seen-in-advance` | editing a file in someone else's open pull request is flagged before the first edit |
| `schema-change-is-serialized` | two schema changes on the same slot turn red before release |

**Move up.** This is the top of the ladder. Needs beyond it are specific to your project. Note what
is not shared between machines even in one repository: an owner's permission granted on one machine,
local hooks and the secrets guard are installed per machine. Say so when a second machine joins.

---

## The stages of one task

One task goes through the same stages every time. The order matters more than any single stage:
repeated identically, a pass can be run in a loop, and losing an agent's context stops meaning
losing work, because the state lives on the board and in the repository, not in the chat.

Two invariants frame every pass. **A pass does not stop on a question to the owner** — the question
becomes a card and the pass takes the next task; only production being down, a red check caused by
something else, or a task outside the executor's zone justify stopping. **A task reaches a commit or
pull request before the next one starts** — then the worst that context compression can do is lose
detail inside one task, which the diff and the card can restore.

### 0. Sync

**What happens.** Before the first edit: pull from the server; read what changed on the board since
the last session (new comments, new cards, status changes, including false closures); check whether
the rules section is current (`/house-rules:update`). Replies from people are read first.

**Why here.** More than one machine writes to the repository, and work from a stale copy turns into
conflicts. The server tells you what changed in the code, not in the queue — a person's reply that
unblocks a task sits unread otherwise. Rule freshness is separate again: rules live at their source
and nothing in the repository's own history says they moved on.

### 1. Pick and claim

**What happens.** The board sets priority. Owner requests come before agent findings, whatever
priority the finding carries. Closely related tasks — same file, same guard, same subsystem, not
merely the same topic — are taken as one batch. At level 4 the card is claimed before any code:
status, executor, machine, occupied files.

**Why here.** Picking is where the owner's orders are protected from a flood of machine-generated
work; claiming is the only way another worker learns, immediately, that the task is taken. Batching
decided now is cheap; decided mid-work, the cards have already scattered across branches.

### 2. Spec

**What happens.** Nontrivial work (more than 1–2 files, new logic, a new route, an architecture
change, a bug with an unclear cause) starts with a spec in `specs/`: context, goal, non-goals,
contract, behavior, edge cases, acceptance. Each acceptance item is tagged machine or human. The
spec is written as a co-author: scout the code, draft, push back on vague wording, then let the
owner correct it.

**Why here.** The spec is the only place where the owner's intent is fixed before code locks in an
interpretation. A bug is either a hole in the spec (fix the spec) or a violation of it (restore the
contract) — so the spec has to exist before anyone can tell which. See
[spec-and-tests.md](plugins/house-rules/reference/spec-and-tests.md).

### 3. Code

**What happens.** The change is written against the spec, in one branch per pass. Spec and code land
in the same commit.

**Why here.** Code after the spec, and together with it in history: `git blame` leads to the
reasoning, a revert takes both, a reviewer sees intent and change side by side. Split into separate
commits, spec and code drift the moment someone edits one without the other.

### 4. Checks

**What happens.** Every machine acceptance item becomes an executable check. Each new or changed
check is proven by mutation: break the invariant by one line in a separate working copy, see red,
revert. Then the full set — build, lint, types, tests, spec acceptance — must be green, judged by
exit code. Human items stay open; the executor never checks them off.

**Why here.** Checks come before review so that reviewers spend their attention on what machines
cannot judge. Mutation comes before the commit because a check proven dead after release has already
let something through. Exit codes rather than console text, because a reassuring message and a
failing run can arrive together — and a pipe hands you the exit code of the last command, not yours.

### 5. Review

**What happens.** A nontrivial diff (new logic, three or more files, money, authorization, routing,
migrations, anything a live user sees) gets a fan of reviewers with fresh context and different
angles — correctness and regressions, security and robustness, spec conformance and how real the
checks are; a devil's advocate for money, migrations and authorization; a deployment angle ("what
if the release fails halfway?") when the diff touches release files; a mechanism angle ("what goes
red if nobody follows this?") when the diff introduces a rule. Findings are verified against fact,
and confirmed ones are fixed before the commit. Trivial diffs skip review.

**Why here.** After checks, so reviewers do not rediscover what a test already caught; before the
commit, because a known defect committed "to fix later" is a hole already found and left open.
Review runs without asking permission — asking is easy to forget, and the diff is no safer for it.
For a pull request from an autonomous executor, review is a separate CI job with a required verdict,
because once merging is automated the last judge is whatever ran outside the session and left a
trace. See [review.md](plugins/house-rules/reference/review.md).

### 6. Commit and pull request

**What happens.** Commit spec and code together. Merge the main branch into the working branch
before opening the pull request and again before merging it. The pull request names what was done,
what was verified, and what was not verified. At level 3 and above, only a pull request with green
checks reaches main; an autonomous executor stops at the pull request.

**Why here.** Commit locally often, open pull requests rarely: every pull request costs a round of
checks, an approval, a merge and usually a release. The "not verified" field is mandatory because it
is the only honest place for human and production acceptance items. The split between who does the
work and who lets it in is the protection itself. See
[repo-standard.md](plugins/house-rules/reference/repo-standard.md).

### 7. Release

**What happens.** Finished work waits for a meaningful delivery instead of shipping piece by piece;
small changes ride along with the next substantive one; anything the running product never reads is
excluded from deployment by path. Only production down, a leak, or money being lost right now ship
immediately and alone. Schema migrations and money changes ship separately, so a rollback takes
exactly them.

**Why here.** Every merge to main typically rebuilds production. Each release is a window where
production might not come back, and where there is no automatic rollback, a chance to hit
"migrations ran, the build didn't" for no reason. Count releases, not commits.

### 8. Verify production

**What happens.** After a release, check what codes the key addresses actually return — working ones
200, removed ones 404, moved ones pointing somewhere live — and what the run said. At level 3 this
is a machine check that turns red on a broken address.

**Why here.** Right after the release is the only moment to learn about a break before a customer
does. "Does the homepage load" is not verification: a `200` can sit on top of an empty page.
Automatic rollback is counted as a safety net only once you have seen it physically wired into the
release.

### 9. Close the card

**What happens.** The card is closed with proof — commit and pull request, the command and its
output, a number — not the word "done." Whatever is not finished is named with a reason, or split
into its own card before the merge (a card number in a pull request title can close the card
automatically, in full). Findings not fixed now become cards in the inbox, if they clear the bar:
confirmed by fact, consequence named, more than a line in the spec. At the end of the session: stop
background work, finish or name what is unfinished, reconcile the board, plan the next session in
batches by touch point.

**Why here.** The card outlives the chat. If the session were cut off right now, another executor
must be able to pick up from the board alone. See
[task-loop.md](plugins/house-rules/reference/task-loop.md).

---

## Install and update

### Install the plugin

```bash
claude plugin marketplace add zhelezoid/house-rules
claude plugin install house-rules@house-rules
```

This installs the `house-rules` and `update` skills, the `test-auditor` and `test-writer` agents, and
everything under `plugins/house-rules/` — including its own `bin/`, with the tools a repository
adopting the rules actually runs (`agents-md.mjs`, `what-changed.mjs`, `check-spec-acceptance.mjs`,
the pre-commit hook and its gitleaks config). Plain Node.js, no dependencies, nothing to install
separately. The reference documents come with the plugin too and are read from there on demand;
nothing is copied into your repositories except the generated rules section.

The main path to all of it is `${CLAUDE_PLUGIN_ROOT}`, the variable Claude Code sets to the
installed plugin's own cache. A clone of this repository, pointed to by `HOUSE_RULES_HOME`, is an
**override** on top of that — useful for developing house-rules itself, or running its tools outside
a Claude Code session:

```bash
git clone https://github.com/zhelezoid/house-rules.git
export HOUSE_RULES_HOME=/path/to/house-rules/plugins/house-rules
```

The skills look for the source in this order: `${CLAUDE_PLUGIN_ROOT}`, then `HOUSE_RULES_HOME`. If
neither is found they say so rather than answer "everything is current." The pre-commit hook's
freshness reminder uses `HOUSE_RULES_HOME` only and skips itself without it.

### Adopt the rules in a repository

1. **Pick a level.** In a session inside the repository, ask to "bring this repository up to
   standard." The `house-rules` skill looks the repository over, names what is there, and proposes a
   level with a reason. You answer with a number, or "leave it."
2. **Generate the section.** `AGENTS.md` must exist (the section goes into an existing rulebook, it
   does not start one):

   ```bash
   node "$HOUSE_RULES_HOME/bin/agents-md.mjs" <repo> --level 2 --date 2026-09-25
   ```

   `--date` is the date of the newest changelog entry you are applying. Running
   `/house-rules:update` inside the repository does the same, plus the adoption steps from the
   changelog.
3. **Remove a root `CLAUDE.md`** if there is one, after moving anything worth keeping into
   `AGENTS.md` outside the markers.
4. **Write the first line of `AGENTS.md`**: the level, and what the repository does not have yet.
5. **Work the level's checklist** from
   [deployment-levels.md](plugins/house-rules/reference/deployment-levels.md) — branch protection,
   CI gates, the secrets guard, the test map — and prove each item by fact, by the table there.

Generator flags:

| Flag | Meaning |
|---|---|
| `--level N` | level 1–4; required the first time, then read from the marker. Changing it needs `--force` |
| `--date YYYY-MM-DD` | the "applied" date written into the marker; required the first time |
| `--check` | write nothing; exit 0 if the section matches the source, 1 if stale, hand-edited, missing or at another level |
| `--force` | overwrite a hand-edited section or change the level; without it, nothing is overwritten and the diff is printed |

Exit codes: `0` written or already fresh; `1` nothing written (hand edit, level mismatch, stale
under `--check`); `2` cannot run (no `AGENTS.md`, broken markers, bad argument, level 0).

### What the markers look like

```markdown
<!-- house-rules:begin level=2 applied=2026-09-25 fingerprint=8515bd97bc58 -->
<!-- This section is assembled by house-rules via /house-rules:update. Hand edits here are lost on the next update — put project-specific rules outside these markers. -->
## Working rules

### Level 1 — Specs and the task board
...
### Level 2 — Test control
...
<!-- house-rules:end -->
```

- `level` — the repository's level; the section carries levels 1 through N.
- `applied` — the date of the last changelog entry applied here; "what's new" is measured from it.
- `fingerprint` — a hash of the section body. A hand edit inside the markers breaks it, and both
  the generator and `what-changed` report "hand-edited" instead of silently overwriting it.

Everything project-specific — stack, commands, invariants, production addresses — lives in
`AGENTS.md` outside the markers.

### Keep it fresh: `/house-rules:update`

Run `/house-rules:update` in a session inside the repository (or say "check for rule updates"). It:

1. finds the source and, if it is a git checkout, fast-forwards it;
2. runs `bin/what-changed.mjs <repo>`, which reads the `applied` date from the marker and prints only
   the changelog entries after it, plus whether the section is stale or hand-edited;
3. applies each entry's `For adopters:` steps, oldest first — skipping conditional steps that do not
   hold, and marking as applied those the repository already satisfies;
4. regenerates the section with `agents-md.mjs`;
5. does all of it as one branch and one pull request, and reports one line per entry: applied,
   already in place, not applicable (why), or blocked on the owner's mark.

With `HOUSE_RULES_HOME` set, the pre-commit hook also reminds you when the section is behind — at
most once a day per repository, never blocking the commit.

### How the changelog works

[CHANGELOG.md](plugins/house-rules/CHANGELOG.md) — shipped inside the plugin, so an installed copy
can answer "what changed" without a separate clone — is the only place to check for rule updates,
not commit history, not the documents themselves. Commit history answers "what changed"; the
changelog answers "what does this change mean for my repository." Each entry is:

```markdown
## YYYY-MM-DD · short title

**Documents:** `rules/rules.md`, `reference/review.md`

**Applies to:** all

**For adopters:** what a repository that already adopted the rules must do — or
"nothing, the rule applies itself."
```

`Applies to:` is optional; `all` means the entry matters even to repositories that have not adopted
the rules yet, so `what-changed` shows it to them as the adoption recipe. In this repository, a
change under `plugins/house-rules/` without a same-day changelog entry fails CI, because a changelog
that misses an update is worse than none: people trust it as if it were checked.

---

## Tools

### Scripts and templates

Every script has a self-test next to it (`<name>.self-test.mjs`, or `pre-commit-guard.self-test.sh`
for the hook) that proves it can turn red, and CI runs all of them.

**Shipped with the plugin** (`plugins/house-rules/bin/`) — installing the plugin installs these onto
your machine, at `${CLAUDE_PLUGIN_ROOT}/bin/`; a clone under `HOUSE_RULES_HOME` is an override, not
a requirement:

| Tool | What it does | When to run it |
|---|---|---|
| [agents-md.mjs](plugins/house-rules/bin/agents-md.mjs) | Builds the "Working rules" section in `AGENTS.md` from `rules/rules.md` for a level; `--check` proves it matches | On adoption, on a level change, from `/house-rules:update`, and in CI with `--check` if you want drift to fail the build |
| [what-changed.mjs](plugins/house-rules/bin/what-changed.mjs) | Compares the repository's section with the source and prints changelog entries newer than `applied`, each with its `For adopters:` line. Exit 1 when there is something to pull in | At session start, or via `/house-rules:update` |
| [hooks/pre-commit-guard.sh](plugins/house-rules/bin/hooks/pre-commit-guard.sh) | Pre-commit hook: scans staged changes with gitleaks against two rule sets (common and the repository's own `.gitleaks.toml`) and blocks the commit on a hit; refuses loudly if gitleaks or the rules are missing; then reminds about stale rules without blocking | Wired once per machine: `ln -sfn <path>/pre-commit-guard.sh <repo>/.git/hooks/pre-commit`. Level 3 and up |
| [hooks/gitleaks-common.toml](plugins/house-rules/bin/hooks/gitleaks-common.toml) | General-purpose secret patterns on top of gitleaks' defaults (AI provider keys, weak default passwords) | Used by the hook; also `gitleaks detect --source . --config gitleaks-common.toml` in CI |
| [templates/test-map.mjs](plugins/house-rules/templates/test-map.mjs) | Builds `specs/TEST-MAP.md`: which specs are really guarded by a test (at route, module or structural level) and which only on paper, plus orphan tests. Counts facts, judges nothing | Level 2. Copy to `specs/test-map.mjs`, edit only the "PROJECT SETTINGS" block, prove it with two mutations before trusting it — see [test-map-and-audit.md](plugins/house-rules/reference/test-map-and-audit.md) |
| [check-spec-acceptance.mjs](plugins/house-rules/bin/check-spec-acceptance.mjs) | Runs the ` ```acceptance ` blocks in `specs/` (`file_exists`, `grep`, `forbid_grep`). A failure in `done/` fails the build; one in `active/` is reported as "not done yet" | In CI on every change. A reference implementation: copy it, or write your own in your stack |

**Maintainer-only** (root `bin/`) — these guard THIS repository and never ship to an adopting one;
use them as patterns if you keep your own rulebook. In CI here they run both as a self-test and
directly against this repository's own tree:

| Tool | What it does | When to run it |
|---|---|---|
| [bin/check-agents-md-rules.mjs](bin/check-agents-md-rules.mjs) | `rules/rules.md` exists, has `## Level 1`…`## Level 4` exactly once each, and fits in 120 lines | CI, on every change |
| [bin/check-proofs-sync.mjs](bin/check-proofs-sync.mjs) | `REQUIRED-PROOFS.md` and `required-proofs.json` name the same ids at the same levels | CI, on every change |
| [bin/check-changes-logged.mjs](bin/check-changes-logged.mjs) | A change under `plugins/house-rules/` has a changelog entry dated today | CI, and pre-commit with `--staged` |
| [bin/check-plugin-version.mjs](bin/check-plugin-version.mjs) | A change inside a plugin bumps its version in `.claude-plugin/plugin.json` — the updater compares versions, so an unbumped edit never reaches anyone | CI, on every change |
| [bin/check-guards-selftested.mjs](bin/check-guards-selftested.mjs) | Every tool in EITHER `bin/` directory has a self-test (or a written reason why not), every self-test is run by `.github/workflows/checks.yml`, the workflow calls no missing self-test, and every maintainer guard in root `bin/` is also invoked directly, not just through its self-test | CI, on every change |
| [bin/check-public-clean.mjs](bin/check-public-clean.mjs) | Keeps this public repository clean: no characters from a non-Latin script, no email addresses other than `noreply`, no IPv4 addresses other than `127.0.0.1` / `0.0.0.0`, no absolute home-directory paths, gitleaks clean | CI, on every change |

### Agents

| Agent | What it does | When to use it |
|---|---|---|
| [test-auditor](plugins/house-rules/agents/test-auditor.md) | Read-only audit of test health across four axes: spec coverage, check quality (live code, no mocked guards, can turn red), completeness against the spec's promised behaviors, freshness. Returns prioritized findings, changes nothing | Before a release, after a large logic change, when asked "are our tests any good," and as a review angle |
| [test-writer](plugins/house-rules/agents/test-writer.md) | Writes checks from the spec, not from the code, and proves by mutation that each can turn red. A red result against current code is reported, never "fixed" by adjusting the expectation | Closing coverage gaps; on money, security and personal-data paths, where code and its check are deliberately written by different executors |

### Skills

| Skill | What it does | Trigger |
|---|---|---|
| [house-rules](plugins/house-rules/skills/house-rules/SKILL.md) | Entry point: points the agent at the reference, surveys a repository, proposes a level, hands off to the generator and the level's checklist | "bring this repository up to standard," "what level does this need," "can I merge my own pull request," and similar |
| [update](plugins/house-rules/skills/update/SKILL.md) | Pulls rule updates into the current repository: diff, run the `For adopters:` recipes, regenerate the section, one pull request | `/house-rules:update`, "check for rule updates" |

---

## Repository map

```text
house-rules/
├── README.md                     this document
├── LICENSE                       MIT
├── .claude-plugin/
│   └── marketplace.json          the "house-rules" marketplace
├── .github/workflows/
│   └── checks.yml                every self-test and guard, on every change
├── bin/                          MAINTAINER-ONLY guards for this repository — never ships to an adopter
│   ├── check-agents-md-rules.mjs
│   ├── check-changes-logged.mjs
│   ├── check-guards-selftested.mjs
│   ├── check-plugin-version.mjs
│   ├── check-proofs-sync.mjs
│   ├── check-public-clean.mjs
│   └── *.self-test.mjs           one per tool: proves it can turn red
└── plugins/house-rules/          the installed plugin — everything below ships to an adopting machine
    ├── .claude-plugin/plugin.json
    ├── CHANGELOG.md              the only place to check for rule updates
    ├── rules/rules.md            source of the generated section (levels 1–4, ≤120 lines)
    ├── reference/                the long "why" — read on demand
    │   ├── repo-standard.md      AGENTS.md canon, branches, merging, gates, barrier, board, sessions
    │   ├── task-loop.md          one pass through the board, autonomous mode
    │   ├── spec-and-tests.md     spec → acceptance → check → mutation
    │   ├── test-map-and-audit.md rolling out the test map and the audit
    │   ├── review.md             review angles, reviewing autonomous pull requests
    │   ├── guards.md             what a guard is and how to prove it alive
    │   ├── empty-vs-broken.md    "empty" vs. "could not find out"
    │   └── deployment-levels.md  levels 0–4 and what the owner decides
    ├── proofs/
    │   ├── REQUIRED-PROOFS.md    what a repository must prove, with failure cases
    │   └── required-proofs.json  the same list for machines
    ├── skills/
    │   ├── house-rules/SKILL.md
    │   └── update/SKILL.md
    ├── agents/
    │   ├── test-auditor.md
    │   └── test-writer.md
    ├── templates/
    │   └── test-map.mjs          spec-to-test map builder, copied into a repo's specs/
    └── bin/                      ADOPTER tools — installed onto a machine along with the plugin
        ├── agents-md.mjs         build / check the rules section in AGENTS.md
        ├── what-changed.mjs      what changed in the rules since this repo applied them
        ├── check-spec-acceptance.mjs
        ├── *.self-test.mjs       one per tool: proves it can turn red
        └── hooks/
            ├── pre-commit-guard.sh   secrets guard + rules-freshness reminder
            ├── pre-commit-guard.self-test.sh
            └── gitleaks-common.toml  shared secret patterns
```

---

## What is deliberately not here

Each boundary is a decision, not an omission.

- **No task-board integration.** The rules talk about "the task board" and assume it has cards,
  statuses, assignees, comments and ideally an intake queue. Which board you use, and how an agent
  reaches it, is yours to wire. A board setting (an intake queue, "no release without a priority")
  beats any script, so the rules ask for the setting, not for code.
- **No machine installer.** Nothing here configures your machine, your global agent settings, your
  shell or your other repositories. Hooks are linked by hand, per repository, per machine — and the
  rules say plainly that they are not shared between machines.
- **No sweeping.** No tool walks your folders bringing repositories up to standard. Adoption happens
  only where you ask for it.
- **No copies of the rules in your repositories.** A repository carries one generated section in
  `AGENTS.md`. The reference stays in the plugin. Copies drift, and nobody checks that they match.
- **No check code to vendor.** The proofs travel as claims with failure cases; each repository
  builds its own checks in its own stack. The scripts here guard this repository and serve as
  examples.
- **No autonomous-agent runtime.** Levels 3 and 4 describe what must be true — task transport,
  machine identity, trigger labels, the destructive-command barrier, the stage log — but the
  automation itself is project-specific and not shipped.
- **No style rules and no coverage thresholds.** Formatting is taste, not something you can
  meaningfully fail, and a coverage number proves only itself.
- **No narrowing of agent permissions.** Rights live in tokens and workflow permissions. Nothing
  here removes tools from an agent.
- **It does not override your repository.** Where your own `AGENTS.md` disagrees with the general
  rules, your repository wins: it knows things about its project that these rules cannot.

---

## License

MIT — see `LICENSE`.
