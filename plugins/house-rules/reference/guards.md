# Guards: how the mechanism behind a rule actually works

A rule recorded only as text gets followed a small fraction of the time. A rule with a
program standing behind it gets followed in the large majority of cases (measured across a sample of
cards). Hence a requirement that holds across every repo: **a rule with no mechanism doesn't get
adopted.** This document is about the mechanisms themselves — what makes a guard different from a
test, what it has to be able to do, and what it most often turns out to be in practice.

## What a guard is

A program that wakes up at a defined moment, looks at the facts, and finishes with a nonzero result
if the rule was broken. Three parts, all mandatory:

| part | question | examples |
|---|---|---|
| **moment** | when it wakes up | on commit, on push to the shared branch, on a schedule |
| **look** | what it looks at | committed files, document contents, board cards, production endpoints |
| **answer** | what it does on a violation | blocks the commit, fails the build, writes to the owner |

**A guard is not a test.** A test checks whether the code works correctly. A guard checks whether a
rule was followed — and the rule is often not about code at all: was a document named in the
changelog, did a card land in the inbox, was a version number bumped, did a change actually reach the
people adopting it.

## Five requirements for a guard

🔴 **1. A guard has a self-test, and the self-test proves the guard can go red by actually breaking
something.** A program that always answers "pass" looks exactly like an honest one — both show
green. The only way to tell them apart is to deliberately break the thing being guarded and confirm
the guard answers "no." A self-test lives right next to the guard (`<name>.self-test.mjs`), runs in a
temporary directory, doesn't touch the real tree or the real home directory, and prints "passed N of
N" at the end.

⛔ **Writing a check and never proving it by breaking something is forbidden.** In one repository,
three checks turned out to be dead within a single session: one looked for a card in two mutually
exclusive states at once, so it could never actually trigger; a second checked for the existence of a
same-day record instead of a link between the change and that record, so any unrelated record filed
the same day made it green; a third printed a warning on a broken reference and answered "pass"
regardless. All three were caught by deliberately breaking them; none were caught by reading them.

This requirement is backed by a machine of its own: a meta-guard compares every guard script against
its paired self-test and confirms the self-test is actually invoked in the shared gate — a guard
missing a self-test fails the build on its own rather than staying on the author's conscience. A tool
that legitimately has nothing to guard (it just lays things out or compares them on request, and
doesn't check any state) goes on an explicit exclusion list inside that same meta-guard, and every
entry there has to carry a reason next to its name: an exclusion list with no reason is a hole
wearing a decision's clothes.

🔴 **2. A guard judges by meaning, not by exact spelling.** Character-for-character comparison is
the most fragile signal there is. One real case: a tag written with a capital letter went
unrecognized, and a money-related finding silently fell into the ordinary basket; a tag from an
unlisted family made a card invisible to every check at once, and a couple dozen high-priority cards
slipped past the owner in silence as a result. Normalize names (case, stray spaces), compare values
against a **closed list**, and call out a value from a known tag family that isn't on the list as a
separate complaint rather than losing it silently.

🔴 **3. "Empty" and "broken" are different answers.** A guard that couldn't look at something has to
say so in different words than a guard that simply has nothing to report. A blind guard's silence is
indistinguishable from order. Details in reference/empty-vs-broken.md.

🔴 **4. A guard wakes itself up.** One that only runs when someone starts it by hand only guards in
the minutes someone happened to remember it — which means it doesn't guard. The wake-up moment
follows the nature of the rule: a rule about a commit — on commit; a rule about the repo's own
contents — in the shared gate; a rule about the state of an external system (a board, production
endpoints, another service) — on a schedule.

🔴 **5. A false alarm is worse than silence.** Within a week it trains people to stop trusting the
guard, and after that it's useless even when it's right. One real case: a build failed to even fetch
the repo, so the guard never reached the board at all — and the owner still got "intake rule
violated" with not one line of report behind it. You only get to raise an alarm about a violation
once you've actually seen one; blindness on the guard's own part gets reported differently.

## How to prove a check is actually alive

Every one of these was learned by a real breakage, each one its own incident. When you add a check,
break the invariant on purpose and confirm it goes red: "configured" isn't the same claim as
"working."

* **By mutation, not by reasoning.** Mutate the call site, not just the function sitting next to it.
* **Judge by exit code, not by tests that merely look green.** A run can fail even with every single
  test green.
* **A 200 response doesn't mean "done."** A count with no list behind it is a rumor.
* **A set's completeness is proven by a count.** One inventory of ignored items once silently
  dropped a large share of the files it was supposed to cover.
* **"The only place this happens" needs an actual search, not confidence.** Three claimed entry
  points turned out to be several more once someone looked.
* **Green on a staging double proves nothing about production.** Database checks belong on the real
  database.
* **Checked once isn't the same as checked repeatably.** A one-off check goes stale silently.
* **A fixture mirrors the real shape of the data**, or the check is guarding a fiction.
* **"Can't be checked" is something you test by actually attempting it.** Until that attempt has been
  made, it's a guess, not a fact.

Three questions to ask of any check before relying on it:

1. **Is it actually wired in?** One guard ran with a green self-test for weeks while its hook was
   disabled.
2. **Can it go red?** Break it on purpose and watch. If it can't, it isn't a check.
3. **Does it judge the right thing, or something adjacent to it?** A check that judges a file path
   instead of the substance of the change is a formality dressed up as a check.

Fails any of the three — call it decoration, honestly, and either fix it or remove it. 🔴 **Removing
it is a normal outcome.** A decoration left in place is worse than having no check at all.

## What a guard is allowed to be

Not every guard is a program running in the build. Any of these forms work — the choice depends on
the moment:

| form | when it fits |
|---|---|
| a commit hook | a rule about what enters the history (secrets, deleting live files) |
| a step in the shared gate | a rule about the repo's own contents (a map, a log, a version, spec acceptance) |
| a scheduled run | a rule about an external system that lives its own life |
| a setting on the platform itself | stronger than any code: what a platform simply doesn't allow needs no check |

⭐ **The last row is the preferred one.** A restriction built into a board's or a repo's own settings
can't be forgotten. That's how findings bypassing the owner's inbox actually get closed off: the
intake queue and the ban on releasing a card from it without a priority are switched on directly in
the board's own settings, and the guard only mops up whatever's left over.

## What a guard is not allowed to do

⛔ **Block something that isn't actually a violation.** A board guard doesn't stop work: the decision
on each card stays with the owner, and the guard's job is only to show, not to decide.

⛔ **Judge by someone else's work.** A check that reads a previous run's report instead of looking for
itself stays green right up until the first failed write — and from that point on it's judging
yesterday's file.

⛔ **Have a door for bypassing itself.** Every switch that skips checks — a "skip checks" flag, an
environment variable that swaps out the data source — has to **shout about itself in the output**. A
variable leaked into the environment that quietly swaps the source gives a green answer that's
indistinguishable from the real one.

## How to set up a new guard

1. Name the rule in one sentence, plus the sign of a violation — worded so it can be checked by
   fact.
2. Pick the wake-up moment from the table of forms above.
3. Write the guard: closed lists of values, name normalization, different answers for "empty" and
   "couldn't tell."
4. **Write the self-test and prove it by breaking something**: knock a tooth out of the guard in a
   copy outside the real repo and confirm the self-test goes red. If it doesn't, it isn't guarding
   anything.
5. Wire it into the gate or the schedule. A guard wired into nothing is decoration.
6. Record the rule in a document, and the change itself in the changelog.
