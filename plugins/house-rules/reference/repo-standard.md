# Repository Standard

This document is the source, not a summary of it. It is read by an interactive agent session, by a
cloud-run agent, and by any other model working through an API. The companion skill carries no
knowledge of its own — it only points here. Edits land in this one file, and from here they reach
every project that installed the plugin: we don't keep per-repository copies, because copies drift.
In one project, five such copies had drifted hundreds of lines from the source, unnoticed, because
nobody checked that they still matched.

A repository that adopts this standard carries only a short "Rules" section inside its `AGENTS.md`,
generated from `rules/rules.md` by the plugin's update command. The full rulebook — this document and
its neighbors — stays here, in the plugin's `reference/` folder, and is read on demand.

## The rule everything else grows from

🔴 **Every rule that matters must have an expression in CI.** A rule that lives only in a skill or
only in a hook is advice: it disappears the moment the model, the tool, or the machine changes. A
rule expressed as a CI check applies to everyone who opens a pull request, no matter who opened it —
a human, an AI session, another model working through the API.

This isn't theory, it's a lesson paid for the hard way: a local barrier against irreversible commands
sat unwired for weeks without anyone noticing, while a CI gate — indifferent to who authored the
change — actually stopped a bad edit.

**What survives a change of model:** the canonical `AGENTS.md`, specs, gates, branch protection, the
pull-request protocol. **What doesn't survive:** skills, hooks, subagents, a specific workflow action.
The first is the mandatory part of the standard, the second is convenience layered on top of it.

## One document at the root — `AGENTS.md`

**`AGENTS.md` is the canon — the single rulebook at the repository root.** Project, stack, commands,
invariants, the branch protocol, what an agent does on its own and what it never does. Written
neutrally, so any agent can read it, including one with no skills, no MCP tools, and no access to the
owner's machine.

**There is no root `CLAUDE.md`.** Recent versions of Claude Code load `AGENTS.md` automatically — but
**only if no `CLAUDE.md`, `.claude/CLAUDE.md`, or `CLAUDE.local.md` exists anywhere above it in the
tree.** Before that autoload existed, the canon never made it into context on its own at all: an
earlier shim file asked the agent to "read this first," and the canon only reached the session when
the agent remembered to open it.

What used to live in that shim — tools that not every agent has (local hooks, MCP servers, subagents,
skills) — now lives in the agent's own global, machine-level configuration, loaded alongside
`AGENTS.md` without displacing it.

🔴 **A root `CLAUDE.md` silently turns the canon off.** Nothing fails loudly; the session simply runs
without the repository's rules. That's why a `docs-drift` check in CI fails on a root `CLAUDE.md`, on
`.claude/CLAUDE.md`, on a committed `CLAUDE.local.md`, and on a missing or empty `AGENTS.md`.

Not to be confused with **`specs/CLAUDE.md`** — a marker meaning "specs live in this repository," not
a rulebook. It sits below the root and doesn't interfere with the canon's autoload; leave it alone.

⚠️ Cloud execution (an agent acting inside a hosting platform, an unattended cloud session) has no
documented autoload of `AGENTS.md`. So a task handed to a cloud agent names the file explicitly —
"read `AGENTS.md`" — rather than relying on autoload.

## Branches and pull requests

Work happens **through a branch and a pull request.** A direct push to the main branch is blocked by
branch protection, and that protection applies to everyone, including the owner.

- Branch from a fresh main, with a meaningful name.
- The pull request describes three things: **what was done, what was verified, and what was NOT
  verified.** The third is a required field, not a courtesy: an acceptance item that only a human or
  live production traffic can verify does not get checked off — the agent names it honestly as still
  open.
- All required checks are green. A red gate gets fixed at the root cause, not routed around.

### 🔴 Pull request size: batch, don't split

**A pull request is opened for a coherent chunk of work, or for a whole session — not for every
single edit.** This follows from a lesson learned when two adjacent infrastructure changes shipped as
two separate cycles and cost two rounds of waiting on checks, two approval labels, two merges, and —
worse — **two deployments**, where one would have done.

A cycle isn't "a couple of minutes." What it actually costs:

| What's spent | On what |
|---|---|
| the owner's time | an approval label on a guarded path is set by hand, and every extra pull request is another context switch to it |
| time to result | waiting on checks, merging, deploying, checking production afterward |
| production stability | every merge to main rebuilds and restarts production containers. Where there's no automatic rollback, every extra deployment is one more chance to hit "migrations ran, the build didn't" for no reason |
| money and quota | check runs and deployments cost money, and the owner pays for both |

So:

- **Commit locally, often**, so work isn't lost and history reads cleanly. **Open pull requests
  rarely.** These are different things — split the first, not the second.
- Several edits made in one session land in **one branch**, especially when they touch guarded paths:
  the approval label then gets set **once**, for everything, not once per pass (who sets it — see
  "Who sets the approval label").
- Don't babysit checks. Once a pull request is open, work continues; the result gets read later.
  Standing there watching a run and reporting every thirty seconds isn't work.
- Changes that never get deployed (docs, plans, a changelog entry) don't deserve a cycle of their own
  at all — they ride along with the next substantive change.

**What must still be split, despite the rule above:**

- **an urgent fix for broken production** — ships alone and immediately, waiting on nothing;
- **schema migrations** — kept separate from everything else, so a rollback takes exactly them and
  nothing else;
- **money, payments, access rights** — kept separate, so a rollback doesn't drag in something
  unrelated;
- changes that **can't be rolled back together** — if reverting one piece would leave the other
  behind, that's two pull requests, not one.

⚠️ Judgment outweighs the letter of the rule: "one branch per session" isn't a ban on opening a
second pull request when the work genuinely splits by meaning. It's a ban on opening one **out of
habit**, without asking what it costs.

### Who may merge

| Who | May merge their own pull request |
|---|---|
| The human owner | always |
| An interactive session, owner present | no — the owner decides |
| A session launched to "work on its own until morning" | **yes, under three conditions at once** (below) |
| An autonomous executor woken by a task from the board | 🛑 **never, under any circumstances** |

Three conditions for an unattended overnight session, all at once: gates are green · a fan-out review
by fresh-context reviewers has run and its confirmed findings are fixed · the change doesn't touch
money, schema migrations, or deployment files. Miss even one, and the pull request waits for the
owner.

🔴 **The split between "who does the work" and "who lets it in" is the protection itself.** An
autonomous executor drives work to a pull request and stops there, even when the merge button is
technically within its reach.

### Auto-merge on green CI

Auto-merge on a green CI run is allowed **only** together with two other things at once — not
"eventually, once we get to it":

1. **Automatic rollback.** Without it, a broken deployment reaches users and stays there until someone
   notices — and with auto-merge, by definition, no one is watching at that moment.
2. **Schema migrations never auto-merge, ever.** A standing exception, not something to be switched
   off later.

Until automatic rollback exists, there is no auto-merge in the repository — and the canon says so in
plain words, not by implication. A repository with no staging environment, where merging IS deploying
to live users, has to state that in the very first line of this section.

## Gates

The floor the standard doesn't go below:

| Gate | What it guards against |
|---|---|
| build, lint, types, tests | whether the code works at all |
| secrets | a key in code or in history; proven with a decoy, not with "a config file exists" |
| a single canon (`docs-drift`) | `AGENTS.md` is present and non-empty; no root `CLAUDE.md` silently turning off its autoload |
| barrier self-test | a broken barrier against irreversible commands never reaches main |
| gate integrity | editing the checks themselves requires a human's explicit approval |
| pinning third-party actions | a third-party action in a workflow is pinned to a commit hash, not a movable tag |

### Pinning third-party code in workflow runs

A tag on a third-party action (`@v4`, `@v1`) is **not a version — it's a pointer**, one the action's
own maintainer is free to repoint to different code at any moment. If that action is handed a
production deploy key, a swap under the same old tag means running someone else's code with that key.

This isn't theoretical: the tag on one of the most widely used actions in the ecosystem moved to a
different version within days, on its own, unnoticed by everyone still pinned to it.

**Rule:** every third-party action is pinned by its full commit hash (forty characters), with a
comment next to it naming which version that hash corresponds to. A guard checks this across every
workflow file — not a human eyeballing it.

🪤 **Three traps a pinning guard falls into**, caught in real use, worth closing immediately:

1. **It reads its own comment.** A trailing `# v4.4.0` next to the hash gets mistaken for a tag on the
   action itself. Strip the comment before parsing.
2. **It gets bypassed by plain, valid YAML.** A value on the line after `uses:`, or a quoted key
   (`"uses":`) — both legal YAML that a naive line-by-line parser never sees. Such a line doesn't even
   reach the guard's counter, so the "zero lines checked → fail" safety net doesn't catch it either.
3. **It flags an honest entry.** A correct hash written in quotes is a legal form, and a guard that
   complains about it stops being taken seriously.

🔴 **The boundary is named honestly: pinning closes off the reference to the action — and only
that.** A composite action can, on every run, download an executable from a third-party server and
run it; the check there often boils down to "the file isn't empty." Release assets are mutable — they
get re-uploaded under the same version tag, and not a single byte of the action itself changes: the
hash stays valid, the guard stays satisfied, and someone else's code still ships. For an action holding
a production credential, the right fix is **removing the third-party layer** and using plain `ssh`
with a pinned host fingerprint.

Left open by the same logic: production images pulled by a movable tag in `compose`, and package
install scripts that run at dependency-install time (`ignore-scripts` isn't on by default). When
claiming "third-party code is pinned," list the inputs and name the ones still open — otherwise
pinning gives a false sense of a closed class.

**How to keep pins current** (without this they rot): by hand, whenever the workflow file is touched
for any other reason — check what the version tag currently points to, and move the hash. Don't build
a bot for this: it would open a pull request containing someone else's code on autopilot, and if
merging follows green CI, a swap would ride straight through the front door.

### The integrity gate — what exactly it guards

Three kinds of paths, and the third is usually the one forgotten:

1. **The checks themselves:** workflow files, scripts, build-tool and test-runner configuration,
   dependency files, secret-scanning configuration.
2. **The path to production:** `Dockerfile*`, `docker-compose*.yml`, web-server configuration, the
   migrations directory.
3. **The agent's rules and permissions:** the agent's local config directory, `AGENTS.md`, a root
   `CLAUDE.md` (its mere appearance turns off the canon), the specs marker.

🔴 **Guard what decides the outcome of a check, not only what describes it.** Test-runner config can
exclude a file from a run; a guard against forgotten migrations can be neutered in one line; a
secret-scanning rule can be weakened without touching a single "guarded" path by name. Every file like
that belongs on the list.

🔴 **The gate judges a pull request by the rules on main, not by the copy sitting inside the pull
request.** Otherwise the gate-over-gates judges itself using the defendant's own copy: one change to
the path list inside the same pull request, and it can also touch migrations and deployment files
while staying green. The list is fetched with something like `git show origin/main:<file>`.

#### Who sets the approval label: the line runs through what the diff touches

The label that clears the integrity gate is **an agreement backed by a barrier, not a lock** —
technically, whoever opened the pull request can set it too. The standard says so plainly rather than
pretending there's a lock.

Since there's no lock, the line has to be drawn where it actually protects something. It runs **not by
who is driving the session, but by what the diff changes:**

| The session itself approves | Only the owner approves |
|---|---|
| rule text: the canon, the specs marker | **the barrier against irreversible commands itself** |
| skill instruction text | **the list of guarded paths**, and **the allowlist itself** |
| | **how the gates themselves are built, and deployment files** |
| | **agent permissions** (settings, tokens) |
| | **the front door** — who is allowed to wake the agent |
| | migrations, container images, container build files, web-server configuration |

⚠️ **The left column is text, and only text.** Resist writing "a small fix to a deployment file" or
"a new check" into it: the mechanism judges **paths**, and "small" or "new" are properties of content,
not of a path. A promise the mechanism can't keep is worse than no promise at all.

**Why the line sits exactly here:** the label doesn't guard work done inside a guarded directory — it
guards **a change to the guarding itself.** If one agent both edits a check and approves that edit, the
split between "who writes" and "who lets in" disappears — the very split the whole system rests on.
Work inside the directory carries no such risk; ordinary gates already check it.

🪤 **Misjudging your own work is easy.** In one real case, a session concluded its label hadn't taken
effect and went off to "fix" the gate — when the actual problem was its own botched re-run of the
check. That's exactly why the right column exists, and why an edit to this labeling rule itself also
belongs in the right column.

#### What enforces this line — and what can't

🔴 **The command barrier can't draw this line by construction.** It judges **a command string**, and
a command like "put this label on this pull request" carries nothing about which paths the diff
touches. Caught on the first real use of the rule: the barrier rejected a legitimate self-approval
because it was still enforcing an earlier version — "only a human sets the label."

**A change's nature is only visible where the diff itself is visible — in the gate.** So the rule has
to live in the gate, not in the command barrier. **Mechanically, this means two different labels**,
since the gate can't tell who set a label — an event only carries a list of labels present:

| Label | Who sets it | When it counts |
|---|---|---|
| session label | **the owner's own session** | only if **every** guarded path touched is on the allowlist |
| owner label | **the owner** | always, on any guarded path |

**A misclassification by the session doesn't open anything:** a label set on the wrong diff simply
doesn't count, and the gate stays red. One label can't carry two meanings — otherwise "the session got
it wrong" and "the owner approved it" become indistinguishable, and someone has to sort it out after
the merge.

🔴 **This runs on an allowlist, not a denylist.** With a denylist, every newly guarded path would
default to open for self-approval, silently widening the session's own rights as the guard grows. With
an allowlist, a new path defaults to needing the owner: an error skews toward safety.

⚠️ **Only put on the allowlist what the mechanism can tell apart by path** — "small" is a property of
content, and the mechanism judges paths. A promise it can't keep is worse than no promise.

⚠️ **The allowlist is read from main**, same as the guarded-path list: otherwise the same pull request
could widen its own right to self-approve and turn green by its own hand.

⚠️ **This rule is about the label, not about merging.** Who may merge is a separate question — see
"Who may merge."

#### 🔴 The pull request title states, by itself, whether a label is needed

The rule above is useless if the owner has to guess, every time, whether it even applies to this pull
request. They shouldn't have to guess: **whether a label is needed is computed mechanically** — by
the same guarded-path list the gate itself judges by. So it has to be computed **before** opening the
pull request, and written straight into the title.

Three states, because there really are three:

| Marker in the title | What it means for the owner |
|---|---|
| **no marker** | no guarded paths touched, no label needed at all |
| **⚪** | a label is needed, but **the session sets it itself**: the change is inside a guarded directory |
| **⭐** | **the owner's label is required**: the diff changes the guarding itself — the command barrier, the path list, how the gates are built, agent permissions, the front door, migrations, or deployment files |

The rule for the owner comes down to one sentence: **there's a ⭐ → set the label; no ⭐ → leave it
alone.**

**How to compute this, instead of guessing.** The path list comes **from main** — the same place the
gate reads it from. Taking it from your own branch means judging yourself with the defendant's own
copy: a diff that both weakens the list and touches a guarded path would come back "clean."

```bash
git show origin/main:<your-guarded-paths-script> > .git/gate-paths.mjs
git diff --no-renames --name-status origin/main...HEAD | node .git/gate-paths.mjs
```

Empty output means no marker. Non-empty means check the table above for what exactly was touched: a
change to the guarding itself gets ⭐, work inside a guarded directory gets ⚪.

🪤 **Don't put this module in a temporary directory.** On macOS, `mktemp` hands back a path under a
symlinked temp root; a module comparing its own `import.meta.url` against the name it was invoked with
fails to recognize itself, and **the command-line mode silently doesn't run at all.** Output comes back
empty, and empty reads as "no guarded paths" — caught the hard way, when the command answered "clean"
on a diff that actually touched three guarded paths. CI on Linux doesn't have this problem, so the gate
itself still judges correctly — only a local check run diverges.

⚠️ **Empty output is always worth a second look.** Run it against a file you know is guarded and
confirm the answer isn't empty: a check that stays silent is indistinguishable from a check that
permits everything.

🪤 **A task-board ID still doesn't belong in the title** — it would close that card on the board the
moment this pull request merges. The marker and a task ID are different things: put the marker, skip
the ID.

**The first line of the description says the same thing in words** — a marker is easy to miss, a
description gets read: "no label needed" · "set it myself, nothing else required" · "🔴 needs your
`<approval-label>` label."

⚠️ **The marker is a convenience, not the source of truth.** The gate still judges by the actual paths
touched, not by the title. If they disagree, the gate is right, and the title needs fixing.

## Barrier on irreversible commands

A hook that judges tool calls before they run: commands by shape, file writes by target path. It
**adds to what the token's own permissions allow — it doesn't replace them.**

Required properties, each one paid for by an incident:

- **Judges each link of a command chain separately** (split on `&&`, `||`, `;`, `|`, newlines), and the
  split understands quoting. A naive split doesn't just "make a mess" — it **lets the forbidden command
  through**: a semicolon inside a pull-request description once tore a command into fragments, none of
  which matched the ban on its own.
- **Protects itself and its own attachment point** — by write target, not by a list of delete verbs.
  There are more than twenty ways to wipe a file: redirection, `dd of=`, `tee`, `sed -i`,
  `cp /dev/null`, `git checkout --`, `--output=` on `git diff`/`log`/`show`, `curl -o`, an
  interpreter's built-in file functions, moving the whole directory away.
- **A broken guard stops guarding, but doesn't become a trap.** The wrapper checks that the barrier is
  executable and contains its marker string; on failure it lets calls through, printing to stderr each
  time that protection is off. Otherwise one typo locks the whole repository — no commands, no file
  edits, not even a fix to the barrier itself.
- **A legitimate exception has a straight path; a bypass leaves a trail.** The owner can allow a single
  command (a prefixed override with a stated reason) or grant a time-limited unlock for file edits;
  every use is logged outside the repository.
- **Both directions get tested.** A guard that flags normal work gets removed entirely, so every rule
  ships with a "must flag" test and a "must stay quiet" test.

🔴 **The barrier's limits are stated plainly, in its own header and in the canon.** It doesn't inspect
script contents, can't tell a quoted literal from an actual execution, can't prove an override truly
came from the owner, and doesn't see a package's post-install scripts. A barrier whose limits aren't
written down creates false confidence — worse than no barrier at all.

⚠️ **Break the barrier to test it only on a copy outside the repository.** The live file is wired to
the hook. When changing its parsing, compare the old behavior against the new **across the whole
corpus of forms**, not just the ones motivating the change — otherwise the fix turns out to be a
regression, and no one notices.

## What comes next — the board, not a file

Priority comes **from the task board**, not from plan files kept in the repository. Plan files are a
**handoff**: what we walked in with, what turned up, what not to repeat. They don't set priority.

🔴 **There is never a second priority list.** If a repository keeps a plans registry, it loses its
status column on purpose — there's nowhere to write "this is next," so a second source of truth can't
take root there. Confirmed on two separate projects: two registries drift apart, guaranteed.

### 🔴 What the session is doing right now lives in a list inside the session itself

The board answers "what matters" and remembers it across sessions. It doesn't answer "**what's
happening this minute**": a card marked "in progress" looks identical whether it was picked up five
minutes ago or has been worked on for the fourth hour, with three forks along the way.

So work in progress gets a **second, short-lived list — inside the session.** It shows the owner the
steps of the current work and exactly where it stands.

**Three rules, all about honesty:**

1. **The list is started at the beginning of the work, not at the end.** A list written after the
   fact is a report, not a window: it always looks successful, because it's written once everything
   is already known.
2. **A step is marked done by what actually happened, not by intent.** Didn't work, hit a wall, the
   numbers didn't add up — the step stays open, and a new one is added next to it: "what's blocking."
   A closed step covering unfinished work is worse than no list at all — it silences the question
   that should have been asked.
3. **It doesn't replace the board, and doesn't duplicate it.** Only steps of **this** piece of work go
   in the list; anything that outlives the session goes on the board as a card with acceptance
   criteria. A task that exists only in the session's list disappears with the session, and no one
   finds out.

⚠️ **When the list isn't needed:** one short fix, a conversation, answering a question. A one-item
list is noise dressed up as order.

🪤 **A note on long-running work.** The list is the only place where it becomes visible that a task
taken on as "fix two buttons" grew into seven steps. An owner who sees this as it happens can stop it;
an owner who learns it from the final report has already paid for it. That's the reason to keep the
list — not tidiness.

### 🔴 A card's status follows the work; it doesn't catch up at review time

The board is where the owner looks to understand what the team is doing. A status that lags the facts
lies twice: it shows someone busy who's actually free, and it hides work that's waiting on a person.

The rule is tied to events, not to memory:

| What happened | Card status |
|---|---|
| work started | **in progress** |
| pull request opened | **in review** |
| pull request merged | **closed** — with proof in a comment |
| work stopped and isn't continuing | **back in the queue**, with a note on what's left |
| turns out a human is needed | **needs a human**, not the general pool |

### 🔴 Whose turn it is: a separate label, because "someone replied" ≠ "we're waiting"

Added after a routine board sweep turned up a batch of cards carrying a human reply that no one had
acted on — and the owner pointed out that **some of those replies weren't addressed to the agent at
all.** The owner hadn't asked those questions; treating someone else's exchange as our job is a direct
path to closing someone else's task by mistaking it for ours.

The "assignee" field doesn't answer this: it says **who's doing the work**, not **who moves next.** A
human can reply on a card assigned to them, and the ball still stays with them.

Hence a separate label, three values:

| Label | Meaning | How the sweep reads it |
|---|---|---|
| `next: agent` | the next step is the agent's | counted as our debt |
| `next: owner` | waiting on the owner's decision or action | not counted as our debt |
| `next: human` | waiting on a human contributor (who — the assignee field says) | not counted as our debt |
| **no label** | unknown | **shown flagged "no addressee stated"** |

🔑 **The default has to be loud.** The sweep is only allowed to stay silent where it's **explicitly
stated** that the next move isn't ours. A missing label doesn't count as silence — otherwise a
denylist hides inside what's supposed to be an allowlist: "I don't see a sign it's ours, so it isn't."
This exact class of mistake has already bitten this project once.

⚠️ **The label is set the moment the ball changes hands**, not during a later sweep: replied to a
human → set `next: human`; asked the owner → `next: owner`; got an answer and picked it back up →
`next: agent`. A label set after the fact describes a memory of the state, not the state.

🔑 **"In progress" means "being worked on right now," not "was started at some point."** A card left
in that status after the session ends is already a lie: the session is over, so no one is working on
it. Either it's explicitly handed to the next session, or it goes back to the queue.

⚠️ **Merging doesn't close a card — proof does.** A commit mentioning a task ID doesn't mean
acceptance was met: the commit could have touched the task in passing. Close a card with the command
that was run and its output, a file, or a number in the comment. Partially done doesn't get closed —
it goes back to the queue with a note on what's left; otherwise the remainder disappears along with
the card.

📏 **This was measured, not assumed.** A sweep once found over a dozen cards sitting in "in progress"
or "in review," the oldest well over two weeks old. Several of them had already been merged into main
long before; one turned out to have been finished weeks earlier without the board ever learning.
Several cards held a human's reply that no one had acted on — meaning people had done their part and
were waiting, and we simply weren't looking.

The cause wasn't carelessness: the rule "reconcile the board" already existed in the session-end
section, but **the working checklist didn't reference it**, and there was no automated check at all.
A rule with no mechanism doesn't get followed — so the sweep now runs as a command that prints what's
gone stale, what looks done, and what's unanswered (see "Session start" and "Session end").

### 🔴 Words said mid-work are input for the board, not a command to execute

An owner thinking out loud mid-session **is naming a problem, not giving an order.** "We should really
do X" means "X shouldn't get lost," not "drop what you're doing and do X right now."

The difference is expensive. In one session, this rule was broken repeatedly: every stray thought
turned into its own full work cycle — branch, checks, label, merge, deploy. That's the root of the
feeling that "half an hour writing code, three hours committing": the work that consumed the time
wasn't what the session was started for — it was a string of side-wishes, each one paying its own full
price.

**What to do instead:** hear "we should" → open a card with a touch point and acceptance criteria →
go back to what you were doing. Work gets pulled from the board at planning time, in batches (below),
not in the order it was mentioned.

**Do it immediately — exactly three cases, and only these:** explicitly told "do it now" ·
production is down and this is the urgent fix · this is the very work the session was started for.

⚠️ The rule runs both ways: filing a card instead of doing the work isn't a way to go quiet. A filed
card has to be actionable (see "Questions are asked at planning time") — otherwise "I filed a card"
just becomes a polite way of saying "I forgot."

### 🔴 Related tasks are taken in a batch, not one at a time

Priority says **what** matters. It doesn't say **how many** to take at once — and that's a separate
decision, or a board of ten tasks turns into ten cycles of "branch → checks → label → merge → deploy →
check production." The owner pays for that fragmentation in time and in money for check runs (see
"Pull request size").

**Rule: before picking up a task, look at its neighbors — do they touch the same place?** Closeness
isn't a shared word in the title, it's the **touch point**: the same file, the same guard, the same
subsystem, the same deployment layer. Three tasks about the same file are one piece of work split into
three cards, and it should be done in one pass: one read-through, one review, one pull request, one
label, one deployment.

The side benefit outweighs the savings: edits to one file, done as a batch, are **visible to each
other.** Spread across three separate passes, they walk past the same class of bug three times — which
is exactly what happened once, when a shared defect got fixed in one spot and left standing everywhere
else.

**When a batch can't be assembled:**

- the tasks carry different levels of risk — money and permissions don't ship alongside cosmetics;
- one of them is **urgent** — urgent doesn't wait for a batch to form;
- the tasks need different decisions from the owner — one would then block the rest;
- a rollback needs to take them separately.

⚠️ Batching doesn't erase individual cards on the board: each task still closes on its own acceptance
criteria and its own proof. What's combined is **execution**, not bookkeeping.

### 🔴 Deploying is also batched. Not every commit ships

The rule above is about how work is picked up. This one is about how it ships, and it's easy to lose:
a batch gets assembled, and everything still merges as three separate pull requests and deploys three
times anyway.

**Every merge to main rebuilds and restarts production containers.** Three merges are three windows
where production might not come back up. Where there's no automatic rollback, every deployment is a
non-zero chance of hitting "migrations ran, the build didn't" — on a change that may not even have
touched the code at risk.

**What to do:**

* Finished work waits **for a meaningful delivery** instead of shipping piece by piece as each part
  becomes ready.
* Small stuff (copy, docs, a reference file) **never ships alone** — it rides along with the nearest
  substantive delivery.
* Anything the live product doesn't need is **excluded from deployment by path**, not case by case:
  docs, plans, reference material, skill text. The list is built from a property — "the running
  product never reads this" — otherwise it falls behind silently and gets rediscovered as a new
  incident each time.

**What ships immediately, without waiting for a batch:** production is down · a leak · money being
lost right now. Everything else waits.

⚠️ **Count deployments, not commits.** A commit is cheap, a branch is cheap, a pull request is cheap.
A deployment is expensive: waiting time, risk to production, money for check runs, and the owner's
minutes verifying production afterward. So the measure of how much work happened in a session is **how
many times production was touched**, not how many cards were closed.

### The touch point is set when a card is filed, not sorted out later

A task filed "into the void" then has to be assembled into a batch by hand later — by rereading a
dozen cards. It's cheaper to tag the **touch point** (`guard`, `deploy`, `directory`, `payments`, …)
right when the card is filed, and link it to neighboring cards on the same touch point. Then the board
groups itself, and a batch is visible at a glance, without digging.

### 🔴 An assembled batch is marked on the board, not only in a plan

A touch-point tag is a **hint** for what a batch could be made from. The batch itself is already a
**decision**: these tasks ship together in one pass, while another one on the same touch point doesn't,
because it carries a migration or needs the owner. A touch-point tag doesn't express that decision.

**So an assembled batch gets its own tag, `batch: <what>`** — set at planning time, the moment it's
assembled. Not a letter ("batch A") — letters live for one session and mean something else in the
next plan; name it by substance: `batch: duplicate cleanup`, `batch: guards and protection`.

🔑 **The reason for the batch goes in the tag's own description.** Naming the reason out loud is the
point — otherwise no one can check it, and the next person either breaks the batch apart or assembles
it wrong. The reason lives in the plan, but work is pulled **from the board**, and not everyone reads
the plan: neither a second contributor nor an autonomous executor does. A reason that only reaches the
plan is a reason that doesn't exist.

⚠️ **Sign the rule isn't working: not a single batch visible on the board.** Checked with one glance
at a label filter. If batches only exist in plan text, an agent picks up tasks one at a time and pays
the full cycle cost for each — exactly what the rule exists to prevent.

A batch of one task doesn't need a tag: it's just a task.

This is the same rule as "a finding is filed as a task right away, not as a line in a plan," one step
further: **filing isn't enough — it also has to land where it'll be found together with its
relatives.**

### 🔴 Questions are asked at planning time, not mid-work

Goal: **a well-planned session doesn't need comments along the way.** Questions get asked in a batch,
at planning time — for every task, as many as possible — instead of surfacing mid-work, when the owner
is busy with something else and every question costs a context switch.

This requires **a complete card.** It has to contain everything needed to execute it without the
owner: why this is being done at all · which forks have already been decided, and by whom · what
must not break (invariants, neighboring mechanisms) · how completion is proven · who closes any
human-only items, if there are any. In substance the card becomes a mini-spec; larger work still gets
a full spec — this is for things smaller than a spec but bigger than a note.

**Order of questioning — run through every task before assembling a batch:**

1. What counts as done, and exactly how is it proven?
2. Which forks here are the owner's to decide — and have they already been decided?
3. Does the task touch money, schema migrations, access rights, or deployment files?
4. Are there items a machine can't close, and who closes them?
5. Does a card suffice, or does this need a full spec?
6. Who executes it — an attended session or an autonomous executor (see below)?

Answers go **into the card**, not left in chat: chat doesn't survive a context reset, and the card is
what whoever executes it will actually read.

🔴 **The batch is assembled after the questioning, not before.** Otherwise it turns out, mid-work,
that tasks inside the batch need different owner decisions — and the batch falls apart on exactly the
criterion listed third under "when a batch can't be assembled."

⚠️ **An honest boundary worth accepting up front: not every question can be foreseen.** One rule about
path substitution for hooks once looked simple at planning time and turned out to have several distinct
entry points — review caught most of them, planning caught none. So the goal is stated so it can
actually be checked: **zero interruptions for things that could have been asked in advance**, not
"zero interruptions, period." The first is achievable and measured by fact (how many times work was
interrupted by a question during the session); the second is wishful thinking.

### 🔴 Two planning modes: daytime and nighttime

Planning depends not only on the tasks, but on whether **the owner will be reachable while they're
being worked.** That changes not the tone of the plan but **which tasks get picked at all**, so the
mode is stated explicitly.

| | Daytime | Nighttime |
|---|---|---|
| trigger phrase | "plan the day," "day plan" | "plan a night session," "work overnight" |
| the owner | reachable: answers questions, sets labels | asleep: no questions, no labels |
| a task with an unresolved fork | taken, the question asked at planning time | **not taken** |
| taken first | **the owner's explicit orders** | **already-accepted findings** (an order still goes first if it passes the filter) |
| a finding from the inbox | accepted by the owner, moves to the queue | **not accepted — no one to accept it**; waits till morning |
| a task on a guarded path | taken in full, the label is minutes away | taken **only up to the point of the label** |
| a human acceptance item | closed the same day | deferred, and that gets written down |

#### Daytime mode

The owner is reachable, so there's no restriction on the mix of work — only a requirement to **batch
the interruptions.** All questions get asked together at planning time (above), all labels get
requested together once branches are ready, not one at a time as they come up. The goal stays the
same: zero interruptions for things that could have been asked in advance.

#### Nighttime mode

The owner is unreachable, and that's **a filter at the front door, not a footnote at the end of the
plan.** A task makes it into the night plan only if it passes three tests:

1. **Are all forks resolved?** Even one "the owner decides" and the task isn't taken. Instead, the plan
   includes different work: write up the question and file a card, so in the morning the owner answers
   it once, from a ready-made description, instead of untangling it from scratch.
2. **Can it reach the end without a label?** If it touches a guarded path, take it **up to the point
   where the label is needed**: branch, pull request, green checks, a written rationale. The plan
   states plainly, "waiting on the label from here," and that doesn't count as unfinished.
3. **How is the result proven without a human?** Work whose acceptance rests on a human eye (a look, a
   feel for the copy, a product judgment call) doesn't get closed overnight. It can still get done, but
   the item stays open and is **explicitly deferred**, not quietly counted as complete.

Four more rules apply at night:

* 🔴 **One deployment for the whole night, at the end, covering everything accumulated.** No merging
  or deploying happens mid-run: a task is driven to a ready branch with green checks and left waiting.
  At the end of the night everything ready merges at once — one deployment, one production check, one
  pass through the customer path. Exactly one exception: **production is down** — the urgent fix ships
  immediately and alone, since the cost of waiting outweighs one extra deployment. If something
  accumulated turns out incompatible (one change breaks another), whatever is ready and verified ships
  and the rest waits for morning, noted in the handoff — splitting "just in case" isn't allowed.

  ⚠️ **This rule has to be stated in the actual step-by-step instructions for the overnight run, not
  only here.** A document sitting somewhere in the middle of the night doesn't read itself; an agent
  follows the instructions in front of it. This was learned expensively when "batch, don't split" was
  written into the standard, but the overnight run's own instructions said "merge → deploy" after every
  task — and the instructions won: two deployments in one night against a weekly budget of a few. A
  mismatch between this section and the run instructions isn't a formatting detail — it's the
  reason the rule stops applying.

* **Everything deployed is checked mechanically.** Not "does the homepage load," but what status codes
  the key endpoints return and what a post-deploy run reports. There's no one to wake up, so the check
  has to judge for itself.
* **If production goes down, roll back and wake the owner.** The one exception to "no questions, no
  labels": the cost of silence outweighs the cost of a phone call.
* **A handoff remains by morning**, listing separately: what's waiting on a label, which human items
  are still open, which questions are written up and waiting for an answer. That's the result of the
  night, on equal footing with the code.

🪤 **The mistake this rule exists to prevent:** an overnight session takes a task with an unresolved
fork, reaches it at three in the morning, and either stalls until dawn or decides something that
wasn't its call to decide. Both outcomes are worse than not taking the task at all.

#### 🔴 Night is for derived work, day is for orders

Agent findings and the owner's explicit orders get split **not just by queue, but by time of day.**
Why this isn't arbitrary:

- **A finding usually suits the night better than an order does — but it doesn't automatically pass
  the night filter.** The bar for a finding (a fact · a consequence · not already a line in a spec)
  answers whether a card is worth filing **at all**; the three nighttime questions answer whether its
  **execution** can be driven to completion without a human. A finding can be reproduced perfectly and
  still have a fix that carries a fork ("revert the old behavior, or build a check for it" is the
  owner's call), or no way to prove it by machine ("stale numbers on a dashboard" needs a human eye).
  Such a finding doesn't get taken at night just because it's a finding.
- **An order structurally fits the day.** The owner more often states a wish than a decision, so an
  order carries a fork by default — and a task with an unresolved fork doesn't get taken at night.
- **Night gives findings what they were missing** — time that isn't competing with orders. It was
  exactly that competition for daytime that had left some owner requests waiting for weeks.

Rules of the mode:

1. **Only ACCEPTED findings get taken at night.** A finding still sitting in the inbox is never taken
   at night: the owner accepts it, and the owner is asleep. A night session works through findings the
   owner has already moved into the queue during the day — otherwise the machine hands itself its own
   work, and the point of splitting the queues is lost.
2. **An order still goes first.** If an accepted order passes the three nighttime questions, it's taken
   ahead of any finding. Night favors derived work, but doesn't shield it from an order.
3. **The findings cap still applies at night.** Working through findings produces new findings — the
   same loop of "a system busy with itself." Anything found overnight goes into the inbox and waits for
   morning; nothing beyond what's already accepted gets taken up at night.
4. **Out of accepted findings — night doesn't invent work for itself.** It picks up orders that pass
   the filter; none of those either, and the night ends early. An empty night is more honest than a
   night spent busy with itself.

⚠️ **What this mechanism doesn't yet verify.** "Who exactly accepted a finding" is indistinguishable
as long as the agent acts on the board under the owner's own credentials — the board records the owner
either way. So rule 1 today rests on a guard that sees the composition of overnight work, not the
identity behind the acceptance; it becomes fully verifiable once the agent has its own identity on the
board.

### How much to take at once: a deployment budget, not a sprint

Capping the volume of work is useful, but **sprints don't get introduced to do it**: a sprint cycle is
a second priority list next to the board, and there's never a second source of truth (above; confirmed
on two separate projects). "In scope for this cycle or not?" becomes a live question, and within a
couple of weeks half the work ships outside the cycle while the cycle itself turns into decoration.

The cap comes from a different angle — **cost**: not the number of tasks, but **the number of
deployments.** A deployment is the real currency here: a label set by hand, risk to production with no
automatic rollback, money for check runs, time checking production afterward. "No more than a few
deployments a week" doesn't argue with priority: the board still says **what** matters, the
budget says **when** it ships.

Side benefit: the budget forces batching on its own — there just aren't enough deployments to spend,
so the work has to be stacked, without anyone having to remember the rule.

⚠️ Deliberately absent from this scheme: estimates in hours or points, velocity tracking, planning and
retrospective ceremonies. For a single owner and their agents, that's ceremony with no audience — and
the cost of unnecessary ceremony is already named in this same document.

🪤 **A task ID in a pull request title closes that card on the board** on every merge. For a task
waiting on a human, that means "marked done, though no one actually did anything." Don't put that
task's ID in the title — reference it in the body instead.

### The "human only" marker

A task that can't be handed to an autonomous executor gets a marker on the board, and the wake-up trigger
doesn't get attached to it. It's a property, not a fixed list: a task gets the marker if doing it **or
verifying it** needs something the cloud agent doesn't have and won't get — a production server, a
production database, external accounts, an owner's decision, moving money.

The wording has to be literal: "obvious from context" doesn't work here, because the decision is made
by whoever has no context in front of them.

### Who executes it is decided at planning time, not mid-work

Today the only signal is the **inverse** one: the "human only" marker says what can't go to an agent.
There's no positive signal for "this suits an agent," so by default everything goes to an attended
session, even though part of it could run in parallel without the owner. The place for this decision is
planning, where the whole picture is visible at once — deciding "who does this" mid-work is too late,
and more expensive.

**A task suits an autonomous executor if all of these hold:**

- doesn't need a production server, a production database, or external accounts;
- doesn't move money, doesn't touch schema migrations or deployment files;
- doesn't need an owner decision — price, tone, a product choice;
- closes on a CI check, not on watching production;
- the agent has nothing to **run**, if its environment has no interpreters: without them it has neither
  self-test nor an index rebuild available, ruling out nearly everything except text and simple edits.
  This condition drops once the agent's environment can execute commands.

🪤 **A trap to resolve before handing work out, not after.** An autonomous executor works one card at a
time: a label gets set on a task, and it opens a pull request for that task alone. Batches don't exist
for it, so its work would arrive as separate pull requests — exactly the fragmentation the delivery-size
rule exists to prevent.

**Decision: only tasks that don't belong in a batch to begin with go to an agent** — standalone,
self-contained ones. Batching stays a tool of the attended session. Two other options were rejected: a
rollup card breaks accounting (each task closes on its own acceptance item; a rollup would close them
all at once, including ones not actually done), and "accept fragmentation as the cost of autonomy"
simply cancels the delivery-size rule the moment it becomes inconvenient.

## Review — before merge, not after

A non-trivial diff (new logic, three or more files, a critical path, money, routing, migrations) goes
through a **fan-out of reviewers with fresh context and different angles.** Confirmed findings get
fixed before the commit lands.

📖 **The list of angles lives in [`review.md`](review.md), deliberately not repeated here.** A
summary once drifted from the source: a mandatory angle about deployment lived in two places, and a
later angle about editing the rules themselves only reached one of them — a reader working from the
short document never learned about it at all. The rule lives in one place; everything else points to
it.

🔴 **Review of a pull request opened by an autonomous executor is a separate job in CI, not part of the
executor's own session.** As long as a human clicked merge, that click was the last line of defense. Once
merging is automated, the last judge is whatever ran in CI; a review that lives inside the executor's own
session and leaves no artifact can't be that judge. The verdict is a required check: it fails on
confirmed critical findings and blocks the merge.

Honest about the weakness: same model, same repository — independence is incomplete. What it still
buys: a clean context and a visible trail.

## Specs and tests

The full rulebook is a separate document, [`spec-and-tests.md`](spec-and-tests.md). Here's only what
everything else depends on:

- **The spec comes first, code is derived from it.** Non-trivial work starts with a spec, not with
  code.
- **Atomicity:** a spec and the code implementing it land in the same commit. That keeps history from
  letting them drift apart.
- **A machine-checkable acceptance item becomes an executable check**, run in CI. An item that only a
  human or production traffic can verify doesn't get checked off by the executor: marking it "green CI"
  is a forged acceptance.
- **A check that can't turn red is more dangerous than no check.** Wrote a check? Break the invariant
  on purpose and confirm it goes red; note in the acceptance record exactly what you broke to prove
  it.

## Stage log

🔴 **A script that runs a stage of work writes a line about it to a log.** The format is deliberately
plain: JSON Lines, one line per event, no dependencies — a file that both `jq` and a future
orchestrator can read.

Stages that must be visible: task accepted → run started → agent began → agent finished (how many
turns) → pull request opened → each gate with its outcome → reviewer's verdict → merge → deploy →
post-deploy check → rollback.

🔴 **Log not just events but decisions with a reason:** "gate went red because X," "the reviewer found
two critical issues," "merge blocked by Y." Events say what happened; reasons say why. A future
orchestrator needs the second kind.

⚠️ **Logging never brings down what it's logging.** No disk space, no permissions, bad arguments — the
event gets lost silently, the work keeps going. Don't turn the log into a gatekeeper: its job is to
tell the story, not to block anything.

## Session start

Two actions, and the second one gets forgotten.

### 1. Sync with the server — has the local copy fallen behind

More than one machine writes to this repository. Working from a stale copy means conflicts, lost
edits, and figuring out "why does this file look different from what's in the pull request."

Automation (a start-of-session hook) is a convenience, not a guarantee: it may not be wired up on a
given machine. **The rule is broader than the tool** — if the sync didn't happen automatically, do it
by hand before the first edit.

### 2. 🔴 Sync with the board — a short delta, because the full pass already happened last night

⚠️ **Syncing with the board belongs to planning, and planning happens at session end.** So the full
pass is done at the end (see "Session end"), and this step is only the **delta: what came in since the
last sync.** Usually there's nothing, and by the rule below nothing gets printed at all.

Two windows close different gaps, and one doesn't substitute for the other:

| When | What question it answers |
|---|---|
| **session end** — the main pass | what came in **while we were working** |
| **session start** — the delta | what came in **while we were away** |

Hours, sometimes days, pass between sessions, and that's exactly when people work on their own
schedule. A session can also end abruptly, so the previous end-of-session pass never happened at all.

🔑 **Something visible only at the start: false closures.** A merge closes a task by branch name too,
not only by the pull-request title, and merges happen between sessions. A task marked done with zero
actual work behind it gets caught exactly here. Syncing with the server shows what changed **in the
code**; it says nothing about what changed **in the work** — and priority comes from the board.

**This hits humans the hardest.** Human contributors answer **in comments**: "re-ran it, got
this number," "tried the flow, here's what was confusing," "the document says this." Their reply
is exactly what unblocks our work. Miss it, and the task sits open with a ready answer, while the
person sees their reply changed nothing and answers less readily next time. Cheaper but just as real:
a task the owner files between sessions — the session won't know about it until they say so out loud.

Check exactly three things, in the window **since the last session**:

1. **new comments** on in-progress cards and cards waiting on a human;
2. **new cards** filed between sessions;
3. **status changes** — what closed on its own, including falsely (a merge closes a card by branch
   name too, not only by the pull-request title).

**What's found doesn't get summarized — it turns into action.** A human's comment answering our
question is an unblocked task: say so out loud and put it in this session's queue, don't just "read it
and move on." A reply that changes nothing is a single line.

⚠️ **This is a step in the ritual, not a script.** A shell script has no access to the board; an agent
session has it through its normal tools. Building board access with its own key inside a start-up
script would mean a second path to the board and a second set of secrets, for something already
directly available.

⚠️ **It has to stay cheap.** A ritual that takes a minute and prints a wall of text stops getting read
— and becomes worse than no ritual at all. **Nothing changed → print nothing**: an empty summary is
noise.

## Session end

A session ends not when the work stops, but when **the next session can start without a recap.** The
order:

1. **Stop anything running in the background.** Unfinished subagents and background runs — either wait
   for them or stop them. An orphan still writing to a file after the session ends is a source of
   edits no one is expecting.
2. **Finish what was started — don't leave it half done.** Uncommitted work either ships in a pull
   request or gets explicitly named as unfinished in the handoff. A working tree left dirty without a
   word is a landmine for the next session and for anyone else picking it up.
3. **Check production, if anything was deployed.** Not "does the homepage load," but **what status
   codes** the key endpoints return: working ones 200, a removed one 404, a moved one pointed at
   something live. Where there's no automatic rollback, this is the only way to learn about a break
   before a customer does.
4. 🔴 **Reconcile the board — this is the main pass, not a formality.** The full sync happens here, not
   at the start of the next session, for three reasons, all proven by the same measured fact:
   - **people work while we work.** A morning sync once turned up half a dozen old unread replies, and
     the evening sync the same day turned up **several fresh ones** that hadn't existed that morning;
   - **replies feed planning directly.** Reading them a minute before assembling batches means
     planning against what's current; reading them the next morning means yesterday's plan was built
     without them;
   - **a human gets unblocked a day sooner.** On that same day, some of the stuck tasks weren't stuck
     because the person hadn't worked — they were stuck because **we'd phrased the task badly**;
     answering that evening puts the person back to work the next morning, answering the next morning
     costs them a whole day.

   Check the same three things as at session start: new comments · new cards · status changes. The
   difference is that what's found here **turns straight into cards and replies to people**, instead
   of being deferred.

5. **Turn findings into tasks — right away, not as a line in the handoff.** Anything that surfaced and
   needs its own follow-up gets filed as a card **with acceptance criteria.** A line in a plan wakes no
   one; a card lands in the priority queue. The same goes for review findings that were deliberately
   left unfixed for now: not fixed and not filed means forgotten.
6. **Bring the board back to the truth.** Close what's done; verify what someone else closed actually
   was done; and for anything that turned out wrong, note it on the card rather than leave it hanging.

   ⚠️ **Close only what's proven by acceptance, not what merely means your part is finished.** A
   session's internal task list shouldn't contradict the board: a "done" check mark next to an open
   card reads as a closure. If proof is missing, say so, and name exactly what's missing.
7. **Write a handoff:** what we walked in with, what turned up, what not to repeat, what's still open
   and why. A handoff is a snapshot frozen at a date — it doesn't set priority.

### 🔴 The next session's plan — in batches, not a list

An easy planning mistake to miss: a handoff lists tasks one by one, the next session honestly takes
them one by one — and pays the full cycle cost for each, again.

So the handoff groups work **by touch point** (see "Related tasks are taken in a batch"): not "six
tasks," but "two batches and one urgent item on its own," stating plainly that inside a batch there's
one branch, one pull request, and one label. Planning is the only point where grouping is still cheap
— mid-work, the cards have already scattered across branches.

⚠️ A batch is named together with its reason ("all three edit the same guard") — otherwise the next
session can't verify it, and either breaks it apart or assembles it wrong.
