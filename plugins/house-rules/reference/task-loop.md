# One pass through the board: a single task from pick to delivery

The work queue lives **outside the context window**. Context compresses on its own, and that's fine
right up until compression takes the work away along with the detail. So a pass through the board
has to look the same every time: only then can it be repeated in a loop, and losing context stops
meaning losing work.

This document describes **behavior**, not commands. The specific scripts, machine zones, and the
list of guarded paths live in the repo's own canon (`AGENTS.md`): they differ from project to
project, and the shared standard has no business assuming them.

## The invariant everything here serves

🔴 **A pass is not allowed to stop on a question to the owner.** A question is a card, not a pause.
Stopping costs the owner a context switch; a card costs thirty seconds and survives context
compression, while a chat message doesn't.

There are exactly three legitimate stops: **production is down** · **a check is red and the cause
isn't this change** · **the task crosses the executor's zone boundary**. In every case: say so out
loud and take the next one.

🔴 **Second invariant: a task is taken to a commit or a pull request before the next one is picked
up.** Not "three things started at once." Then the worst compression can do mid-pass is lose detail
inside a single task — and that detail is recoverable from the diff and the card. Three half-started
tasks after compression aren't recoverable by anyone.

## Order

### 0. Sync check. The pass doesn't start without it

Three checks, and the last two are the ones people forget:

- **with the server** — has the local copy fallen behind. More than one machine writes to the
  repo; working from a stale copy turns into conflicts and lost edits.
- **with the board** — what changed in the work since the last pass. The server check tells you
  what changed in the code and says nothing about what changed in the queue.
- **with the rules** — is the "Rules" section in this repo's `AGENTS.md` current. Both checks
  above stay silent about the rules themselves changing: rules live at their source and have no
  history of their own here.

  🔑 **Look at one file — the changelog at the rules' source, not the commit history and not the
  documents themselves.** History answers "what changed"; the question that matters is "what does
  this change for me." The machine entry point reads the "applied" date from the marker in
  `AGENTS.md`, checks it against the source, and prints only what shipped after that date, along
  with a line telling the recipient what to do. That's the answer to "check whether the rules
  updated."

  Why this check is separate from the gate: the section between the markers is generated text, not
  code that build checks guard; freshness is checked on demand, not on every commit. One
  measurement across several repos running the standard found every one of them behind — one
  missing several documents out of the full set — and no gate had caught it.

🔑 **New replies from people are read first.** A person's reply unblocks a task; it isn't mail — it
changes both what work exists and what order it's in.

The sync tool is unavailable (no key, no network) — the check is still done by hand, not skipped.
The rule outranks the tool.

### 1. Picking a task

Priority is set by **the board**, not by this document.

🔴 **Requests first, then findings.** A task the owner or a team member asked for (tagged as a
"request") is taken before any agent-found item, regardless of what priority the finding carries. A
finding is taken once no requests that pass the filter below remain.

**How this coexists with batching.** Order decides what becomes the pass's **anchor**; touch point
decides what rides **along with** the anchor. If findings sharing the same touch point as a picked
request already exist and are **accepted by the owner**, they go into the same batch: edits to one
file have to see each other, and splitting them across passes is more expensive and riskier. An
unaccepted finding never enters a batch — it isn't work yet, it's a proposal.
Otherwise you get what's been measured before: a queue dominated by machine-invented work while
owner requests sit for weeks.

⛔ **Goals aren't tasks.** A card describing a direction ("grow revenue," "data-driven decisions")
never gets picked up: it has no acceptance criteria and no end. Things like that live as a separate
project and serve as a planning frame, not a line in the queue.

Take the first open task for which all of the following hold:

- **this executor's zone** — if there's more than one worker, each has its own area; a task that
  straddles areas goes to **whoever will have to touch those files**;
- **unclaimed** — status isn't "in progress" or "in review," and the assignee isn't someone else;
- **files don't overlap** with anyone else's open pull request;
- **not flagged** as waiting on a person.

Closely related tasks are taken **as a batch** — one branch, one pull request, one deploy. Sign of
closeness: same file, same guard, same subsystem. **Not the same topic in the title** — two tasks
"about analytics" can touch completely different paths, and a batch built on that basis falls apart
at the first conflict.

⚖️ **A task that's part of a batch doesn't get handed to a separate executor, even if it otherwise
fits that executor's zone.** A batch is a tool for a session; an autonomous executor doesn't have
batches — it works one card at a time and opens its own pull request. Pulling one task out of a
cluster either loses the benefit the batch exists for (edits to the same spot seeing each other) or
produces two pull requests touching the same spot, with a conflict at the first merge. Only work
that isn't part of a cluster can be handed out piece by piece.

### 2. The "take this task" door

Claiming a card is a machine action, not a stated intention: a status, an assignee, a record of
**which machine** took it. Calling it again must tell "I took it" apart from "someone else is
holding it," and refuse in the second case.

No such door, or it's unavailable — the same thing is done by hand, **with a comment, always**: who
took it, which machine, which files are claimed. Another executor reads the board, not minds.

### 2b. The board's assignee is the agent, not the owner

A card an agent is working stays **assigned to itself**: the assignee is the agent's own identity on
the platform, not the person whose credentials the agent is using. The owner looks at the board to
see **what's on them**; a card an agent filed and assigned to the owner adds work they never took on
and hides the work actually waiting for them.

🪤 **The personal-credentials trap.** An agent usually reaches the board through the owner's own
personal key — and then the platform records the *author* of the card and its comments as the owner.
Reassigning doesn't fix this: author and assignee are different fields. So:

- set the **assignee** to the agent's own identity — that's what shows up in the queue and in
  filters;
- **sign in the text**: which agent, which machine, which pass. Otherwise the board looks like one
  person is doing all the work, and the owner's own queue becomes indistinguishable from the
  agents'.

Three cases, and they don't collapse into one:

| Who will actually do the card | Who to set as assignee |
|---|---|
| an agent — now or on a later pass | **the agent's own identity** |
| a person — physical presence, a call, access, a decision on price or tone | the person **and** a "waiting on person" tag |
| not yet known | **nobody**; the assignee appears the moment someone takes the card |

The platform may not have an agent identity set up at all — set one up before the agent starts
filing cards; it's a one-time setup (the platform's own app with its own credential), not something
that happens per pass. Until it exists, the rule is half-honored: there's no assignee to set, but
the signature in the card body is still required.

⚠️ **This rule is about the board, not about the history in code.** Commits stay signed with
whatever credential the agent commits as, and there may be no separate authorship in that history at
all — the separation of privileges rests on the token's permissions, not on a name. One doesn't
replace the other: permissions define what an agent **can** do, the signature shows what it **did**.

### 2c. An owner's request and an agent's finding are two different queues

The owner looks at the board to answer one question: **what's on me**. If an agent dumps everything
it notices onto the same board, the board stops answering that question. One measurement on a live
board showed what that grows into: only a small share of open items were actual requests, the rest
were machine-invented; the open count grew far faster than the closed count over the same period;
and a "high" priority label showed up on machine-made cards much more often than on human ones — the
machine was granting itself the top of the queue.

**A request** is what the owner or a team member asked for: in words during a session, by message,
in conversation. It goes to work immediately.
**A finding** is what an agent worked out on its own while doing something else. It goes to an
**inbox** and waits for one motion from the owner: accept or reject.

🔴 **The split has to be mechanical.** An agreement to "remember to do it right" doesn't hold up —
this has been measured: rules that require the executor to remember are followed in a small fraction
of cases; rules baked into the action itself are followed in the large majority. A rule
with no mechanism gives a false sense of order and, in practice, doesn't get adopted at all.

**The mechanism, at the platform level** (tested on a live board, not just reasoned about): an
enabled intake queue pulls in every card created **without an explicit status** — even one created
by a team member with their own key. So:

| What's being filed | How | Where it lands |
|---|---|---|
| an agent's finding | with no status set | **the inbox** — the owner accepts or rejects |
| the owner's own request | with an explicit status | straight into the queue |

A platform setting that refuses to release anything from the inbox without a priority finishes the
job: **whoever accepts sets the priority, not whoever filed the card.**

#### The bar a finding has to clear

Not every finding deserves a card. It becomes one only when **all** of these hold:

1. **confirmed by fact** — reproduced, not just reasoned out;
2. **names the consequence** — what happens if it isn't fixed;
3. **can't be closed with a line in the spec** — i.e. it's work, not a footnote.

Doesn't clear the bar — it becomes a line in the spec instead. That's not "silencing" the finding:
the spec lives in the repo next to the code and survives context compression just as well as a card
does.

#### The ceiling per pass

**No more than five new finding-cards per pass.** Before this ceiling existed, an active day could
produce dozens.

⚖️ **The ceiling counts two baskets separately: five ordinary and two heavy.** Otherwise five
cosmetic findings, discovered first, eat the slot a sixth finding needed — one about money lost —
and the order findings turn up in is just the order files got read in, which is random. A heavy
finding gets a card even with the ordinary basket already full.

**Heavy is a finding whose consequence is on a closed list.** The list is closed on purpose: an open
one turns into "feels important to me" — the same self-granted priority this rule exists to stop.

| Tag | What it covers |
|---|---|
| `consequence: money` | a figure someone is billed or paid on comes out wrong |
| `consequence: leak` | someone gets access to data or an action they shouldn't have |
| `consequence: data damage` | a record is corrupted or lost with no way to recover it |
| `consequence: prod down` | users can't do what they came to do |

The class is a **checkable claim, not a judgment call**: seeing the "money" tag, the owner can tell
in a minute whether it's real or inflated to dodge the ceiling. That's why there are only two heavy
slots per pass, and they go straight to the inbox in plain sight. A third heavy finding — like a
sixth ordinary one — stays in the findings document rather than getting filed quietly.

The list is closed, not the spelling. A tag from the `consequence:` family (or `origin:`) that
doesn't match any listed value — a typo, a made-up value — isn't silently treated as heavy and
doesn't disappear from view either: the guard calls it out as a separate complaint, naming the card
and the tag, and what happens next depends on what the tag actually claims, not on how it was typed.
Case and stray spaces in a tag name don't matter: `Consequence: money` and `consequence:  money` are
the same tag as `consequence: money`.

⏰ **The intake guard wakes itself up.** It runs on its own schedule — a couple of sweeps a day —
and writes to the owner on a violation rather than waiting to be remembered mid-session. A guard
someone has to start by hand only guards in the minutes someone happened to think of it — which
means it doesn't guard. It blocks nothing: the board isn't a deploy gate, and the decision on each
card stays with the owner.

🪤 **Tagging something minor as heavy to dodge the ceiling is the same violation as filing a card
past the inbox.** The only difference is that a person catches this one, not a guard — which is
exactly why the heavy basket is kept small.

A sixth finding, and every one after it, is **never lost and never merged into one big item.** The
pass stops filing new cards and writes up the rest as a **findings document** — the same way a bulk
run hands off its own output. The owner goes through the document and decides what becomes cards.

⚠️ **An earlier version of this rule demanded something impossible.** It said a sixth finding
"means there's one shared root cause that belongs in the spec" — but seven independent defects in
seven different files don't share a root cause, and forcing them into one spec entry means writing
something false. Meanwhile the rule "a finding is filed immediately, before the commit" was still in
force, and the intake guard trips on the sixth card regardless — honoring both rules at once wasn't
achievable. The findings document resolves the contradiction: the finding isn't lost (it's written
down), no card gets filed past the ceiling (the limit holds), and the decision stays with the owner.

🪤 **Splitting the same work across two passes to dodge the ceiling doesn't work** — that's keeping
the letter of the rule while breaking its point. Every pass pays the full triple sync (step 0), and
resetting the finding counter just to file the same cards again defeats the purpose. The ceiling
counts the work, not the formal boundary of a pass.

#### A bulk run never writes to the board directly

A nightly audit, a review fan-out, any pass over a large body of work hands off a **document of
findings**, and cards from it are filed by the owner, or by a session acting on the owner's word.

The reason was learned the hard way: a bulk run once filed a couple dozen tasks under the owner's
own name, and several sessions in a row worked through them as if the owner had actually requested
them — until the owner finally asked who filed these. Checking the claims against real data
collapsed most of them. Measured separately, on unrelated work: a noticeable share of the findings
from a big fan-out audit turn out to be false.

#### Balance

At the end of a pass, two numbers get said out loud: **filed and closed**. Filing more than you
close isn't work, it's queue growth.

#### What guards this

A dedicated intake guard looks at cards from the recent pass and fails if the pass went over the
ceiling, filed a finding outside the inbox, self-assigned a high priority, or left the origin
unnamed. It runs at the end of a pass, alongside the other gates.

### 3. The work itself

- A nontrivial task starts **with a spec**, not with code.
- One pass's edits go into one branch; a pull request covers one coherent piece of work, not every
  individual edit.
- A check must **be able to go red**: break the behavior with a mutation and see it fail **before**
  the commit. A check that's green by construction is worse than no check at all — it lies with a
  straight face.
- The executor does **not** check off the human and post-deploy acceptance items itself: leave them
  open and say honestly why.
- A nontrivial diff goes through review before the commit — fan-out, from different angles (see
  reference/review.md).

### 4. Gates and delivery

Run the checks, linter, types, spec acceptance — all green, judged by exit code, not by the text in
the console. Then commit (spec and code together), push, open a pull request.

🔴 **Freshness happens before delivery, not after a complaint.** The main branch gets merged into
the working branch **before opening the pull request, and again before merging it**. Not "whenever
the platform complains about a conflict" — by that point the pass is already spent, and untangling
the drift costs more than running one command on time. While work is in progress on a task, other
work lands on the main branch in the meantime — that's normal with more than one worker, not an
exception.

Sign the rule was broken: the pull request shows as "diverged" or "conflicting." Sign it was
followed: the sync ran twice and both times needed no changes.

**Who does the merge depends on the mode — see below.**

### 5. State lives in the card, not in chat

Context compresses, chat disappears, the card stays. So what goes into the card isn't a wrap-up at
the end but state recorded as work happens, in three places:

- **on taking the task** — which machine took it and **which files are claimed**, as soon as that's
  known. Another executor reads the board, not minds.
- **along the way** — a finding that gets decided not to fix right now is filed **immediately,
  before the commit**. Not "I'll add it at the end": the pass might not survive to the end, and
  something neither fixed nor filed is the same as forgotten. But it's filed into **the inbox, not
  the owner's queue**, and only if it clears the bar — see section 2c above. A minor item that
  doesn't clear the bar becomes a line in the spec instead: also "not forgotten," but it doesn't
  take a slot in the owner's queue.
  🔴 **A filed card must be VISIBLE on the board** — under the same project, team, or view the
  owner actually uses to look at the queue. A card reachable only by looking it up by number is as
  good as never filed: no priority pass will surface it, no other executor will see it, while the
  executor honestly believes the work is on record. The check is cheap: open the same board the
  owner opens and find the card there by eye — not confirm that the platform can return it by ID.
- **on closing** — **proof**, not the word "done": the commit and pull request number, the command
  and its output, a number. Whatever isn't closed — name it and say why.

🪤 **The platform can close a card on its own** — off its number in a pull request's title or body.
That means the number there isn't a reference, it's a claim of "closed, in full," and merging
executes that claim without asking. While the work is only partly done, either put the number in a
form that doesn't close the card, or split the remainder into its own card **before the merge**.
Otherwise the merge files away, alongside what's actually done, whatever is still waiting on the
owner's decision — and nobody goes digging through the archive for open decisions.

Self-check: if the session got cut right now, could another executor pick up **from the board**? If
not, the state lives somewhere it shouldn't.

### 6. The next pass

Back to step 0. Don't wait around for someone else's checks to finish: once a pull request is open,
take the next task.

## Autonomous mode: what's different

Autonomous mode is when the owner has **agreed in advance** to work happening without them: not
watching a screen, not answering questions, not pressing buttons. Three differences, all mandatory —
without them, autonomy turns into a queue of half-finished work.

### Only take what will reach the end on its own

Before taking a task, estimate **which files it'll have to touch**. If the work will run into
something only the owner can do — a permission tag on a guarded path, access to someone else's
service, a decision involving money — the task **isn't taken**: it'll reach a pull request and stall
there.

This isn't caution, it's arithmetic: a night spent on five such tasks produces five open pull
requests and zero delivered work. If no qualifying task is left on the board, say so plainly and
stop — don't take one that's a guaranteed dead end.

### It merges on its own — only when every condition holds at once

🔴 **At night, not after every task — once, at the end, on everything accumulated.** Inside the loop
there are no merges and no deploys at all: a task is taken to a ready branch with green checks and
left waiting. At the end of the night, whatever's ready merges all at once — one merge, one
production check. There's exactly one exception: **production is down** — an urgent fix goes out
immediately, on its own.

⚠️ This rule is written down both in the repo's own canon (reference/repo-standard.md, "Night mode")
and here — on purpose, not by oversight. The reason was expensive: this exact rule was once updated
in the canon only, while this document — the one describing the actual shape of a pass — still said
"merges immediately, on its own." The pass document won, because at night an executor does what's in
front of it, and a separate document doesn't get re-read in the middle of the night. The outcome
showed up in the canon's own numbers: production ended up getting deployed far more than the agreed
budget in a single night. The fix was made in one of the two files, and the same mistake came back
by the same route it was supposed to have been fixed through.

🔑 **Night work goes into ONE branch for the whole pass.** Findings are scattered across different
touch points by nature — they don't form a batch — and giving each one its own branch would mean N
merges, i.e. N deploys, instead of the promised one. So at night a single pull request opens for the
whole pass (the delivery-size rule explicitly allows this: "one coherent piece of work **or one
session**"), and individual tasks inside it close out with local commits referencing their own card.

Conditions for the merge itself:

- checks are green;
- review has run and confirmed findings are fixed — and **the review has an artifact outside the
  session** (a build job, a comment on the pull request), not just a trace in a chat transcript. The
  reasoning is the same as for a human executor woken by a task: while a human was the one clicking
  merge, their click was the last line of defense; once merging is automated, the last judge becomes
  whatever ran outside the session and left a trace. Review that lives inside the same session doing
  the merging can't be that judge — doesn't matter whether the session was woken by a card or set
  loose until morning;
- the change doesn't touch what the owner has kept for themselves (usually money, data schema,
  deploys — the exact list lives in the repo's own canon).

⚠️ **This carve-out applies only to an executor the owner authorized in advance.** It never applies
to an executor woken by an outside task (from a queue, from a tracker): that one takes the work to a
pull request and stops there. In that case, the split between "who does the work" and "who lets it
in" is the only safeguard there is.

### It stops on running out of work, not on running out of energy

The loop keeps going as long as qualifying work exists. Three stop conditions, any one of them:

- no task is left on the board that passes the filter above;
- two tasks in a row failed to reach completion — a sign something in common is getting in the way,
  and another attempt would just waste time;
- a resource agreed on in advance runs out (time, a quota).

On stopping — a report: what got done, what's left, what's waiting on a person and why.

## What to do with an obstacle, instead of stopping the whole pass

| Obstacle | Response |
|---|---|
| needs a call only the owner can make — price, tone, a product decision | file a card tagged "waiting on person," take the next task |
| needs a person physically present — on-site work, a phone, a mailbox | file a card for the human executor, written as step-by-step text, take the next task |
| root cause not found in a reasonable amount of time | file a card with reproduction steps and a list of what's already been ruled out by fact |
| task belongs to someone else's zone | don't take it, say so out loud, name whose zone it is |

⚠️ **The loop doesn't waive a single rule above.** It repeats the pass, it doesn't speed it up: same
gates, same door, same review.

## Honest limits

- **Context compression loses detail.** So facts live in the card and in the commit, not in chat:
  whatever isn't on the board doesn't exist after compression.
- **An executor's personal task list is a derivative of the board, not a second source of truth.**
  Private notes kept during a pass are useful, but every line in them has to name a card. A line
  with no card is work that doesn't exist as far as the owner is concerned: they look at the board,
  not at someone else's working notes, and can neither prioritize it nor see what the executor is
  actually doing.
- **Manually clearing a session isn't needed inside the loop** — nobody's there to trigger it. Its
  place is two situations outside the loop: a working hypothesis turned out wrong and has already
  gone through compression, or the subject of the work changed entirely.
- **A filter on guarded paths is an estimate, not a guarantee.** It judges a task before the work
  starts, and the real shape of a change only becomes visible afterward. A task that turns out to
  touch a guarded path partway through still gets taken to a pull request with an honest "waiting on
  a tag" note in the description — and the pass continues.
