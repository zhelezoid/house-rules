# Deployment Levels: How Much Structure to Put Into a Repository

This document is the **source**, not a summary. It answers one question: the owner says "bring this
repository up to standard" — how much structure goes in, and in what order?

The old answer was one-size-fits-all: the full setup, every time. A small app doesn't need it, and
there was no way to say "just rules and specs here, no autonomous executor" except explaining it in
words each time. Hence five levels: the owner names one, and the executor takes it from there.

## Who this document binds

**Deployment is done by a session working inside the repository itself** — not a cloud-run
executor: a cloud-run executor only exists where the setup is already in place, and can't
physically reach into other folders. A task on the board, in this context, is a **record, not a
trigger**: it holds what was
decided and how it was proven; the work itself starts when the owner says so.

🔴 **Deployment happens only on request, and only where the owner asked for it.** Sweeping through
folders, bringing them up to standard "just in case," laying down rules ahead of need — none of this
is needed, and it's explicitly against the rules. Most repositories are either legacy nobody's gotten
to, or simple apps that genuinely don't need this system. Silence is not a request.

## The levels

| Level | What it adds | Roughly how it's set up |
|---|---|---|
| **0. Leave it alone** | nothing | — |
| **1. Specs and a board** | a rules file (`AGENTS.md`) with a "Rules" section · a `specs/` skeleton · a task on the board | write it by hand, following the walkthrough below |
| **2. + Test control** | a spec↔test map · executable acceptance criteria · auditor agents · **automatic checks on every change** | follow `reference/test-map-and-audit.md` |
| **3. + Executor without the owner** | a task transport · a machine identity · trigger labels · **a guard on destructive commands** · **no direct writes to the main branch** | project-specific automation, not covered by this repo |
| **4. + More than one executor** | claiming a task · splitting work by file zones · a rule for who reviews whom · mandatory review before merge, when one of the workers is a human with merge rights · **a stage log** | project-specific automation, not covered by this repo |

Levels are **cumulative**: level 4 includes everything from levels 1-3. You can't skip a rung — not
out of pedantry, but because each level leans on the one before it: an autonomous executor has nothing
to read without a rules file, and letting it run without checks or a ban on writing straight to main
means handing the production branch to something nobody is watching.

### Level 0 is a full answer, not a refusal

An executor needs to be able to say "there's nothing to install here" **and give a reason**. Valid
reasons: the repository is frozen · it's a one-off throwaway · it lives inside another repository and
takes its rules from there · there's so little ongoing work that maintaining rules would cost more
than the work itself.

An invalid reason is "didn't look into it." Didn't look into it → look, or say plainly that you
haven't.

### Level 1 — specs and a board

**Adds:** a rules file at the repo root naming its own level, a `specs/` skeleton, and an entry on
the task board.

**Prevents:** anyone arriving — human or model — not knowing where anything lives, or what's decided
and what's still open; and the mix-up between a spec and a task (see the table below), which is the
single most common confusion once both exist.

**Move up when:** the project has enough real behavior, and enough repeat work on it, that manual
review alone stops catching regressions — or, more concretely, once you're tempted to say "just
double-check by hand before merging" more than once per change.

### Level 2 — + test control

**Adds:** a spec↔test map, acceptance criteria that resolve to a runnable check, agents that audit
test health, and an automatic check run on every change.

**Prevents:** "there are a lot of tests" and "the tests are green" standing in for proof; a
regression that reaches production and is caught only by a human noticing, well after the fact — with
nothing that would have gone red before it shipped.

**Move up when:** a single executor starts making changes without the owner watching in the moment —
even one executor, even one with a narrow task. That's the trigger for level 3, not the amount of code or
the size of the project.

### Level 3 — + executor without the owner

**Adds:** a way to hand it tasks, a machine identity distinct from the owner's, labels that trigger a
run, a guard that blocks destructive commands, a ban on writing straight to the main branch (only via
a branch and a pull request), and a log of what happened while nobody was watching.

**Prevents:** an unsupervised executor running a destructive command with nobody to stop it, and a
change reaching production with no record of who did what and in what order, and no reviewer's eyes
on it at all before it lands.

**Move up when:** see below — a second independent worker shows up.

### Level 4 — + more than one executor

**Adds:** a way to claim a task before starting it, a split of work by file zones (not by topic),
a rule for who reviews whose work, and — specifically when one of the workers is a human with the
right to merge — mandatory review before merge.

**Prevents:** two workers taking the same task twice, or fighting over the same file and one
clobbering the other's change; a schema migration colliding with another one because two workers
touched it at once.

**Move up:** this is the top of the ladder as it stands. Needs beyond this are specific to your
project.

### 🔑 What actually marks level 3 versus level 4 — not "human or machine"

The level is decided by **how many independent workers write to the repository**, not what they're
made of.

- **Level 3** is **one** worker acting without the owner. What it's made of — a webhook receiver, a
  coding agent, any model behind an API — is a **detail, not a level**: swapping the engine, not
  changing the vehicle. Exactly one thing changes: someone other than the owner is now writing to the
  repo, and nobody is watching over their shoulder while they do it.
- **Level 4** is **more than one**, in any mix: two agents, an agent and a human, two humans. A
  different problem shows up that level 3 doesn't have at all: two workers grabbing the same task and
  fighting over the same file.
- **Mandatory human review is one specific case of level 4, not all of it.** It's needed when the
  second worker is a human **with merge rights**. Two agents don't need it — the owner is the one who
  lets their work in.

🪤 **Check this by fact, not by what you're told the setup is.** An owner running two sessions on the
same repository at once is already halfway into level 4, even though nobody called it that: two
sessions step on each other's prepared changes exactly the way two separate agents do. Some of level
4's machinery is needed for that repository already.

### How two workers split work — by files, not by topic

🔴 **Conflicts come from files, not from tasks.** Two tasks on completely unrelated topics can edit
the same file — and then the second one either gets a merge conflict or, worse, overwrites the
first's change silently. So the boundary is drawn by **the area a task touches**, the same signal
used to batch tasks together.

Three rules, from loose to strict:

1. **Each worker has its own zone of files.** Not "a topic," a list of paths. A task that's
   ambiguous (one zone by topic, another by files) goes to whoever's files it actually touches. A
   task that spans both zones is picked up by nobody — split it in two, or wait for the zone to free
   up.
2. **Claiming a task is marked on the board before the first line of code.** Status "in progress"
   plus who's on it — the only way the other worker finds out it's taken, immediately.
3. **Check for overlap mechanically before starting**, not from memory: look at the files touched by
   other workers' open pull requests (`gh pr diff <number> --name-only`). Overlap found → wait,
   don't try to be careful about it.

🔴 **Database schema migrations are always one worker.** Two migrations with the same number break
the deploy, and fixing that means hand-repairing a live server. This is the one place where
parallelism is banned outright, not just discouraged.

**What protects you without relying on discipline** (and matters more than the rules above): a ban on
writing to the main branch directly, mandatory server-side checks, serialized deploys. With those in
place, the worst outcome of a mistake in splitting work is a merge conflict, not a broken production
system.

⚠️ **What is NOT shared between two machines, even in the same repository:** the owner's permission to
edit a guard is granted **to one machine** and doesn't apply to another; local hooks and a secrets
guard are installed on each machine separately; notes and part of the skills living outside the
repository exist only where they physically sit. Say this plainly when setting up a second machine —
otherwise the second worker assumes it's protected the same way the first one is, and it isn't.

## 🔴 The rules file states its own level in the first line

A repo's rules file (`AGENTS.md`) **grows with the level**: an executor writes exactly the sections that
match the chosen level, never one "for later." The level goes up, a section gets added.

**A rules file that promises protection the repo doesn't actually have is worse than no rules file.**
It gives false confidence: whoever reads "a breakage won't reach production" believes it and doesn't
check for themselves. This is exactly how one team believed for years that a deploy would auto-revert
on failure, when it never had that ability at all.

The same trap applies here: **this reference document is complete, and describes the maximum** — all
of it, checks and guards and the ban on writing to main together. The "Rules" section built into
`AGENTS.md` is already scoped to the repo's level and carries nothing extra, but someone who reads
this document directly sees every level at once — the rules file has to say plainly what, of all this,
isn't actually there yet.

So the rules file's **first line names its level and plainly lists what's missing**:

> This repository is at **level 2**: rules, specs, and an automatic check run exist. It does **not**
> have an autonomous executor, a guard on destructive commands, or a ban on writing straight to the main
> branch — don't rely on them, they aren't installed.

One sentence, and no false confidence results. The general reference honestly describes the maximum;
the rules file says where you actually stand.

## Which rule shows up at which level

Easy to get wrong by merging two different rules into one: they rest on **different foundations**, and
the foundation — not the wording — decides which level a rule belongs at.

### "Thoughts said out loud during work are input for the board, not a command" — from level 1

But at level 1 this isn't about saving deploys — there are none yet. It's about two other losses that
exist from day one:

- a session loses the thing it started for and wanders off after every stray thought;
- the thought goes nowhere: said but not done, and it's forgotten by everyone.

Costs nothing, useful from day one.

### "Close related tasks in a batch" — from level 1, for a different reason

This rule pays off two ways, and they kick in at different levels.

**The level-independent payoff:** edits to the same file, made together, **see each other**. Spread
across three separate passes, they miss the same class of bug three times over. So the rule is
written in at level 1 already — but for this reason specifically.

**The monetary payoff builds up gradually, and starts to matter at level 3:**

| Level | What one extra shipment costs |
|---|---|
| 1 | nothing — just another commit |
| 2 | a check run: time and money, every pass |
| 3 | plus a label set by hand, merge only via pull request, a deploy to production, checking production afterward |

### Stage log — level 4

It answers "what happened while I wasn't there." While the owner is in the conversation, they see
everything themselves, nothing to log; at level 2, the history of checks already lives in CI runs; at level 3, in
the pull request ("what was done, how it was checked, what was not"), the CI runs and the card. The
log pays off at level 4, where what matters isn't just "what got done" but **who did it and in what
order** — a chat the owner wasn't part of won't reconstruct that.

⚠️ **When you add a log, verify it actually writes** — run a stage and see the line appear. Otherwise
you risk shipping something that stays silent: a guard file can sit unconnected to anything for weeks
while being treated as installed — don't repeat that shape of mistake.

### The rules file itself — level 1, and it goes in first

Without it, whoever arrives — a person or a model — doesn't even know where things are. It's one
file, and it pays for itself the moment somebody else's change comes in.

## A spec and a task are not the same thing, and this gets explained at level 1

Both ideas show up together at level 1, which is exactly why they get confused. The rules file has to
spell out the difference plainly, not assume it's obvious.

|  | Spec | Task on the board |
|---|---|---|
| Answers | **how it should work, and why** | **what we're changing right now** |
| Lives | in the repository, next to the code | on the board |
| Lifespan | **stays forever**, updated along with the code | closes and gets archived |
| Relationship | one spec produces many tasks | a task **references** a spec, it doesn't restate it |

**When to create which:**

- an idea, a request, a finding → **a task**, always, right away;
- nontrivial work (more than 1-2 files, new logic, a new route, an architecture change, a bug with an
  unclear cause) → **a spec, before the code**;
- something small (a typo, a config tweak, a rename) → no spec, and often no task either.

🔑 **The rule for when you're unsure:** **if the written thing needs to stay alive after the work is
done, it's a spec.** If it stops being needed the moment the work closes, it's a task. A task can be
as detailed as a mini-spec, but the difference isn't detail — it's **lifespan**: whatever must outlive
the work goes into `specs/`.

## What the executor decides on its own, and what's the owner's call

This section exists so the executor doesn't ask about things it shouldn't, and doesn't silently decide
things it shouldn't. Both mistakes are equally bad.

### Decides on its own, by a clear signal, without asking

- **Which skills live inside the repository versus outside it.** Signal: knowledge specific to this
  one project → goes inside, next to the repo's own agent config; knowledge shared across every
  project → goes in the shared reference; a personal process of the owner's → stays on their own
  machine.
- **A thin skill versus documented knowledge.** If a reference doc gets edited often, while the skill
  catalog needs a human sign-off on every edit, the knowledge lives in a document next to the skill,
  and the skill stays thin and points to it. Frequent knowledge under a sign-off either stalls work or
  trains people to skip the sign-off without reading it.
- **Folder layout, file names, step order, whether a spec skeleton is needed.**
- Anything technical: libraries, flags, response codes, wait thresholds, how a check is built.

### The owner decides

- **The deployment level** — or "leave it alone."
- Anything that touches **money, access rights, or the production environment.**
- **External services, anything public-facing, purchases.**
- Product-level forks: price, tone, copy.

## The standard travels with the work, it isn't assumed

🔴 **Rollout builds the "Rules" section itself** — that's a step in bringing a repo up to standard,
not a precondition for starting. Pointing at a document that doesn't exist in the target repository is
doubly pointless: the executor working there will only take its rules from its own `AGENTS.md`, not from
some other repository.

```bash
node "$HOUSE_RULES_HOME/bin/agents-md.mjs" <path-to-repo> --level N --date <today>   # build it
node "$HOUSE_RULES_HOME/bin/agents-md.mjs" <path-to-repo> --check                    # prove it matches
```

The section sits between `house-rules:begin`/`house-rules:end` markers and carries a fingerprint of its own
content: a hand edit inside the markers breaks the fingerprint and turns the check red. No plugin
install, no extra tokens needed for this.

## What the owner expects as an outcome

A checkable result, not a wish list. After a rollout, the executor shows the **command and its output**,
not a summary in prose.

| Level | What's in the repository | How it's proven |
|---|---|---|
| 1 | `AGENTS.md` naming its level, with a "Rules" section between the markers · a `specs/` skeleton · a task on the board | `agents-md.mjs --check` is green · the spec index builds · the rules file's first line names its level · a session prints that `AGENTS.md` loaded at start; the single-canon check goes red on a stray root-level `CLAUDE.md` |
| 2 | a spec↔test map · executable acceptance criteria · a check run on every change | the check run is green · the map builds · **the measuring tool has been proven by mutation — an invariant was broken, and the check went red** |
| 3 | a task transport, a machine identity, a guard on destructive commands, main-branch protection | the protection actually blocks a direct push · the guard's self-test is green · **one real task went through the whole loop, up to a pull request** |
| 4 | task claiming, split work, a review rule, a stage log | two executors didn't grab the same task twice — checked on a live pair · the log has lines from both, in the order things happened |

🔴 **A check that can't go red is more dangerous than having none.** You installed a check — break
the invariant on purpose and confirm it goes red. "Configured" is not "working."

## Rollout order

1. **Look at the repository silently first** — what's already there, how it builds, what deploys, what's
   already checked. Don't ask what's visible for yourself.
2. **State the current situation and propose a level**, with a reason for that one. The owner answers
   in one word.
3. **Build the "Rules" section in `AGENTS.md`** — the first step once there's agreement.
4. **The rules file `AGENTS.md`** — with the level named in its first line; no root-level `CLAUDE.md`.
5. From there, follow the chosen level's rungs in order, **without skipping**.
6. **Prove it by fact**, per the table above, and show the command output.
