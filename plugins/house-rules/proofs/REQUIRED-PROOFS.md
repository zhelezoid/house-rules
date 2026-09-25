# What a repository must be able to prove

This is the **only thing that travels between repositories.** Not the check code, not file names,
not the internal layout — a list of claims, each of which the repository must prove with its own
run. How it does that is up to the repository, in whatever language and stack it uses.

Principle: any repository stands on its own — it is handed the rules and builds its own gatekeeper,
checker and tools.

🔑 **Every item carries an `<!-- id: … -->` right under its heading** — the same identifier as the
matching entry in `required-proofs.json` next to it. That's the only thing tying the human-readable
list to the machine-readable one; without it, comparing the two files is no better than comparing by
eye. `bin/check-proofs-sync.mjs` guards this: an item added to one file and forgotten in the other
turns the gate red.

## How to read this list

Every requirement has two parts, and the second is no less mandatory than the first:

* **Claim** — an observable outcome, not a method for achieving it.
* **Failure case** — what has to be broken for the check to be **forced to turn red**. Without it
  the requirement is unprovable: "there's a check" and "the check works" are different things, and
  the first one is judged by eye.

🔴 **A well-formed requirement can be broken without touching a single file name.** If it can't be,
it's a description of an implementation, not a requirement, and it doesn't belong in this list.

## Three answers, not two

A run answers each item with one of three:

| answer | when |
|---|---|
| **proven** | the check is green on the honest case and **red on the failure case** |
| **not proven** | there's no check, or it doesn't turn red on its own case, or the run never touched it |
| **not applicable** | the item isn't required at this level, and that's stated out loud with a reason |

⚠️ **Silence means "not proven."** An item the run never touched lands in "not proven" — it doesn't
disappear from the report.

## Levels decide the set, not the strictness

A repository with no deployment doesn't need the deployment requirements. The mandatory set is
assembled by deployment level (see `deployment-levels.md`). **You can't lower the bar on a single
requirement — you can only leave it out.**

---

# Level 1 — Specs and the task board

### 1.1 Intent and code travel together through history
<!-- id: intent-and-code-travel-together -->

**Claim.** A change to behavior and the change to the intent describing it land in history as one
change: the code leads back to its reasoning, and a revert takes both with it.

**Failure case.** Change behavior while leaving the description as it was, and pass it off as
finished work — the check must turn red.

### 1.2 The spec index doesn't lie about its contents
<!-- id: intent-registry-matches-reality -->

**Claim.** The list of specs matches what's actually there: additions are visible, deletions are
gone, and status matches location.

**Failure case.** Add a new spec and don't rebuild the index — the check must turn red.

### 1.3 The repository's rulebook reaches the executor on its own
<!-- id: rules-canon-reaches-the-executor -->

**Claim.** The repository has one rulebook at its root, and the executor gets it automatically,
with no need to be told "read this first." Nothing stored in the repository disables that
auto-loading.

The honest boundary: an untracked personal file on a developer's machine, and a file in a directory
above the repository, disable auto-loading too — but they leave no trace in history, and a run
can't see them. That case isn't proven by a run, and it's named as such rather than passed off as
proven.

**Failure case.** Put a second rulebook at the root that makes the executor skip the canon when
present — or delete or empty the canon itself. The check must turn red: from the outside this kind
of breakage is invisible, the session just runs without the repository's rules.

---

# Level 2 — Test control

### 2.1 A check can turn red
<!-- id: checks-can-turn-red -->

**Claim.** For every guarding claim there's a case where the check turns red, and that's been
proven by running it, not just asserted.

**Failure case.** Break the guarded behavior — the run must turn red. Stayed green — the item is
"not proven" no matter how many checks were written.

### 2.2 A run is judged by its exit status, not its own output
<!-- id: run-judged-by-exit-status -->

**Claim.** The outcome of a run comes from the exit code of the work itself. Text printed to the
screen doesn't count as the outcome.

**Failure case.** Make a run print a reassuring message and return a nonzero exit code — the
outcome must be counted as failure. The reverse case too: a zero exit code with an empty report
doesn't count as success.

🪤 A common cause of failing this item: reading the exit code through a pipe — you get the code of
the last command in the chain, and the thing doing the displaying is almost always successful.

### 2.3 A shared check outlives any single task
<!-- id: shared-check-outlives-single-intent -->

**Claim.** A check guarding an invariant of the whole project doesn't depend on the life of any one
task.

**Failure case.** Close any single task — the shared check must remain and keep running. It left
along with the task — the item isn't proven.

### 2.4 A check hits live code, not its own copy
<!-- id: check-hits-live-code -->

**Claim.** A check exercises the same code that runs in production, not a similar function sitting
next to it and not an entirely swapped-out mechanism.

**Failure case.** Gut the production implementation while keeping its name — the check must turn
red. Stayed green — it was checking a stub.

### 2.5 A claim marked machine-checked actually has a checker
<!-- id: machine-promise-has-a-checker -->

**Claim.** Every acceptance item declared machine-checked is tied to a check that automation
actually runs.

**Failure case.** Mark an item machine-checked without setting up a check for it — the run must
call it unproven, not skip it.

At level 1 there are no machine-checked items yet: their appearance, and automatically running them,
is exactly what level 2 adds.

---

# Level 3 — Executor working without the owner

### 3.1 Nobody writes to the main line directly
<!-- id: no-direct-writes-to-main-line -->

**Claim.** A change reaches the main branch only through a proposal with passed checks. Nobody can
bypass this, including the owner and including an emergency.

**Failure case.** An attempt to write to the main branch directly — it must be rejected by the side
that holds the repository, not by the executor's good behavior.

### 3.2 Irreversible actions stop at a human
<!-- id: irreversible-stops-at-a-human -->

**Claim.** A command whose consequences can't be undone doesn't run without a human's explicit
permission, and that permission leaves a trace.

**Failure case.** Issue a destructive command without permission — it must be rejected. Rejected
with permission granted — a trace must remain.

### 3.3 A secret never reaches history
<!-- id: secret-never-reaches-history -->

**Claim.** A change staged for commit that contains a usable secret never makes it into history.

**Failure case.** Put a string shaped like a real key into a change — the commit must be rejected
before it reaches history.

### 3.4 Editing the guard itself needs the owner's permission
<!-- id: editing-the-guard-needs-owner -->

**Claim.** Changing **what** gets checked and **how** it gets checked is different from ordinary
work and requires the owner's explicit permission.

**Failure case.** Weaken or disable a check and pass it off as ordinary work — it must be blocked.
Otherwise an executor can hand itself a green run.

### 3.5 An agent's work is visibly the agent's
<!-- id: agent-work-is-visibly-the-agents -->

**Claim.** Work done by an agent shows up on the task board as an agent's work: the assignee is the
platform's agent identity, not the human whose credentials the agent is using.

**Failure case.** File a card as the agent but leave the assignee as the owner — the owner's queue
becomes indistinguishable from the agents' queue, and the owner ends up with work they never took.

**Separately:** the owner's personal key makes them the card's *author*, and reassigning the card
doesn't fix that — they're different fields. So proof means a pair: an agent assignee **and** a
signature in the text (which agent, which machine, which pass). Token permissions cover what the
agent **can** do; the signature shows what it **did** — neither substitutes for the other.

### 3.6 The owner's queue is kept apart from an agent's findings
<!-- id: owner-orders-outrank-agent-findings -->

**Claim.** Something an agent thought of on its own doesn't land in the owner's work queue — it
goes to a separate inbox and waits for a decision. The receiving side sets its priority, not the one
who filed it.

**Failure case.** File a finding straight into the owner's work queue, or give it high priority
yourself — the queue stops answering "what's on me," and the owner's own orders lose out to
derivative work.

**Why this is a separate requirement, not a matter of manners.** Measured on a live board: a large
backlog of open tasks, only a small share of them owner orders; a much larger share of machine-filed
cards carried high priority than human-filed ones; far more got filed in a month than got closed.
Machine cards closed no worse than human ones — the intake was flooding, not the throughput.

### 3.7 Readings survive environment rebuilds
<!-- id: measurements-outlive-the-environment -->

**Claim.** Data a decision leans on stays available after the environment it was collected in gets
rebuilt.

**Failure case.** Rebuild the environment and ask for the last day's readings — they must still be
there. Reset to zero — there's no measurement, only hope that nobody deploys.

### 3.8 A release is verified by machine after it lands
<!-- id: release-is-verified-after-it-lands -->

**Claim.** After a release, the state of the production system is checked on its own: not "does it
respond" but exactly what codes the key addresses respond with, and what the run says.

**Failure case.** Break one key address and deploy — the post-release check must turn red, not
report success.

### 3.9 A report tells "empty" apart from "couldn't tell"
<!-- id: empty-differs-from-broken -->

**Claim.** Any mechanism capable of answering "there's nothing there" tells that apart from "I
couldn't check" and says something different for each.

**Failure case.** Cut off the data source — the mechanism must say "couldn't check," not "nothing
there." Said "nothing there" — the item isn't proven.

---

# Level 4 — More than one executor

### 4.1 Claimed work is visible before it starts
<!-- id: claimed-work-is-visible -->

**Claim.** Another executor finds out a task is already taken before starting it, not at merge
time.

**Failure case.** Take a task and don't mark it — a second executor must see this or be blocked.

### 4.2 File overlap is spotted in advance
<!-- id: file-overlap-is-seen-in-advance -->

**Claim.** Before work starts, it's visible whether someone else is touching the same files.

**Failure case.** Start work on a file that's being edited in someone else's open proposal — it
must be flagged before the first edit, not after.

### 4.3 One executor changes the data schema at a time
<!-- id: schema-change-is-serialized -->

**Claim.** Two schema changes can't move at the same time.

**Failure case.** File two schema changes claiming the same ordinal slot — it must turn red before
deployment, not on the production server by hand.

---

## What's deliberately not in this list

* **Code formatting and style.** That's a project's taste, not something you can meaningfully fail.
* **Numeric thresholds** (how many checks, what coverage percentage). A number proves itself and
  nothing more.
* **Tool names.** None appear here, for the reason stated at the top of this document.
* **Rules about people** (who answers to whom, how to phrase things). Those live in other
  documents: a run can't prove them, and pretending otherwise is harmful.
