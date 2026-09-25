# Spec and Tests

This document has one axis: **a promise in the spec ↔ a check that can go red.** A spec produces
an acceptance item → the item becomes an executable check → the spec↔test map shows where a check
is missing entirely → an audit judges whether an existing check only pretends to work → mutation is
the only proof that a check is alive, not decoration.

Every link in this chain is useless without its neighbors. A spec without a check is a promise on
paper. A check without a spec — nobody knows what it's actually guarding. A map without an audit is
bare numbers. An audit without mutation is an opinion, not a fact.

## Spec first, code derives from it

Nontrivial work starts with a spec, not with code. Signs of nontrivial: more than 1-2 files, new
logic, a new endpoint or route, an architecture change, a bug with an unclear cause. A typo, a mass
rename, a config change, an obvious one-line fix — none of these need a spec.

If work arrives without a spec but turns out to be nontrivial by these signs, write the spec first,
then the code. A spec is written as a co-author, not filled in like a blank form: first scout the
existing code and neighboring specs, then draft a section, then have the owner revise it. Whatever
writes the spec is obligated to push back on vague language ("improve performance" → "by how much,
measured how") and to catch contradictions — with other sections of the same spec, with decisions
already made, with the architecture that actually exists.

When a bug has an unclear cause, don't patch the code by hand around the spec: it's either a hole in
the spec (fix the spec) or a violation of a spec that already exists (then the fix restores the
written contract, it isn't a new decision made on the fly).

## Where a spec lives

Specs live **in the repository, next to the code** — not in a separate store on one person's
machine. The sign that a project is set up this way is a marker file, `specs/CLAUDE.md`, at the
repo root: it also sets the project's local conventions (folder layout, frontmatter format, template
name). Anyone who opens the repository — a person, any model, any agent — finds the specs by this
marker with no external setup and no borrowed context.

A personal spec store on one person's machine is a convenience for that person, not part of the
standard: it doesn't belong to the shared body of rules.

## Atomicity: spec and code in one commit

A spec and the code that implements it go into one commit (or one branch, if there are several
commits but the change is one logical unit). The reason is simple and checkable:

- `git blame` on the code leads to the same commit that holds the reasoning for why it's built that
  way;
- a revert takes the spec and the code together — no spec is left describing something that no
  longer exists;
- a reviewer sees intent and change side by side, instead of having to search for the spec
  separately;
- the spec and the code physically cannot drift apart in history — they were always a change to one
  pair of files.

Separate commits ("spec first, code in a separate pull request later") look tidier, but that's
exactly how spec and code drift apart: between the two commits, someone edits one without the other,
and nobody notices until the drift bites.

## Anatomy of a spec

A typical spec has a fixed set of sections: **Context** (why the feature exists), **Goal** (one
sentence — if it doesn't fit in one, the task is too big and needs splitting), **Non-goals** (what
the feature deliberately does not do — the most common source of misunderstanding when it's
missing), **Contract** (input/output/side effects), **Behavior** (scenarios, pseudocode, not an
implementation), **Edge cases** (empty input, an unavailable external service, duplicates, race
conditions, limits), **Acceptance criteria** (see below — the most important section), technical
details (stack, paths, env vars, migrations), and open questions that are explicitly left open so
the agent doesn't invent an answer.

⚠️ If a project's spec template carries fields inherited from a retired automation (flags, run
ids, statuses left over from a once-working, now-disabled pipeline) — that's dead weight. Such
fields aren't part of the standard; if you find them in someone else's template, strip them out
instead of copying them out of habit.

## Machine-checked and human-judged acceptance items

Every acceptance item is tagged explicitly: **(machine)** or **(human)**.

- **Machine** — checked by a command, a test, or a request, with no human involved: "responds
  within N seconds," "error E writes Z to the log," "GET /health → 200, body has field Z," "the data
  structure validates against the schema." A vague phrasing ("works well," "handles it correctly")
  means the item isn't ready yet — bring it to a checkable form, don't just tag it.
- **Human** — what a machine honestly can't settle: a visual impression, a product or business
  judgment, whether something "got better" by feel. This kind of item is never marked done by an
  automated green run — only the person who judges by the actual result closes it.

Every machine item must be tied to an executable check — a test, a command, a health request — that
automation actually runs. An item without such a check isn't "almost done," it's a hole, and calling
it closed is a lie.

🔴 **Don't fake a machine criterion.** If the real "done" is a product or visual judgment, the item
stays human. A check like "curl returned 200" standing in for the real criterion isn't a simplified
version of an honest check — it's false confidence: worse than an honest human item, because it
creates the appearance of having checked something it didn't. The reverse holds too: every human
item is worth honestly trying to turn into a machine one (add a test, a state endpoint, a structure
check) — but only if that actually closes the question, not just masks it.

Status marks for an item distinguish three things, not two: an item that is **not started** (work
hasn't begun, too early to demand a check), an item that is **closed** (claimed that the invariant is
guarded — without a real check that's not "almost," it's a lie), and an item that is **retired**
along with the mechanism it guarded (deliberately dropped, the check is no longer needed). Blurring
these three states in a report loses exactly the information the marks exist to preserve.

### 🪤 A check that lives inside someone else's spec disappears with it

It's tempting to drop an executable acceptance check into whatever block already fits — and that's
how a check like "types compile across the whole project" ends up living inside the acceptance
block of an unrelated, minor spec (say, a contact-form feature).

While that spec is alive, everything works and looks correct. But it **will** close: specs exist
because work has an end. The check that never belonged to it goes with it — and nobody notices,
because nothing turns red. A missing guard looks exactly like an absent one: silence.

One real case cost a dedicated investigation: a whole-project type check lived in the acceptance
block of a spec for an unrelated minor feature, and before anyone dug in, nobody could say whether
it was even being run.

🔴 **Rule: a check lives where the thing it guards lives.** Something project-wide belongs in a
project-wide place, not as a guest of the nearest spec. The tell is simple: **will the spec close
while the check needs to stay? Then it doesn't belong there.**

## The spec↔test map

A separate measuring tool builds a map: it checks whether each spec's acceptance item actually calls
a real test, and, the other way around, which tests aren't tied to any spec at all. The tool counts
facts, it doesn't judge; it produces numbers, not conclusions. Judgment on those numbers is a
separate audit (next section).

The map distinguishes several kinds of mismatch between spec and code, and they're different
diagnoses:

- **code with no spec** — something lives in the code tree that no spec references; for critical
  areas (money, auth, database schema) this is a high-priority finding;
- **spec with no code** — the spec describes something that physically doesn't exist in the code;
- **stuck spec** — marked "in progress" but hasn't changed past a reasonable threshold;
- **status doesn't match location** — the folder a spec sits in doesn't match what its own status
  claims;
- **spec with no executable acceptance block** — it has machine items, but no command that actually
  checks them.

The most common and most expensive setup mistake is failing to distinguish "checked the real
production path end-to-end" from "checked a nearby function." If the route detector is misconfigured,
the map reports an endpoint as covered when the test actually calls a helper function next to the
handler, not the request handler itself. Because of this, the tool needs to be **checked for lying**
with two mutations before it can be trusted:

1. take a spec the map counts as covered at the route level, and verify by eye that the test really
   calls the handler, not a neighboring function;
2. temporarily remove the test invocation from one spec's acceptance block, rebuild the map — the
   state must get worse. If it doesn't, the tool isn't reading what it should, and it's lying with a
   green light over a leaky hull.

Until both checks pass, the map can't be used as a source of fact — only as a draft that still needs
to earn trust.

Technical limit of this measurement: if a project has no concept of "route" at all (a library, a
CLI, batch processing with no HTTP surface), the "covered at the route level" state will always be
empty, and that's normal — not a sign the tool is broken.

## Recovering specs from existing code

In a project that adopts spec-first not from scratch but on top of code that already exists, specs
are reconstructed after the fact — one area at a time, not all at once. Here it matters not to
confuse two different things: **behavior** (what the code does right now — extracted from the code
itself and objectively checkable) and **intent** (why it's built that way, what must not break, what
invariants sit behind a decision — none of this is in the code, and only the product owner can state
it). A recovered spec with intent not yet filled in is a draft, even if it sits in the folder for
finished documents; its status only moves to "done" once the owner has confirmed the "why," not just
the "what."

## Test quality audit — four axes

"There are a lot of tests" and "the tests are green" prove nothing. An audit doesn't look at
quantity — it looks at **what a check actually guards and whether it will go red when that breaks**,
across four independent axes.

**Axis 1 — spec coverage.** Every acceptance item tagged "machine" is closed by a real test call, not
by a check that a nearby piece of text exists. An item closed only by a string search ("this phrase
is present") is a check that text is in place, not that the behavior works; fine as a supplement,
useless as the sole guard for a behavior item.

**Axis 2 — check quality.** Signs of an empty check, found in practice and worth hunting for
deliberately:

- **function instead of the wiring** — the most common and most dangerous disease: a test checks a
  pure function ("is this the order's owner," "is the guard on") but never checks that the real route
  or service actually calls it. Remove the check's call from the route — the test stays green, and
  the hole ships unnoticed;
- **guard mocked into oblivion** — a test spins up a handler but replaces the permission check with a
  stub that always answers "allowed," and never once tries the denied case;
- **mocking exactly what's being checked** — a test replaces the check itself and then confirms the
  replacement worked: it's testing the mock, not the code;
- **diffing source text instead of behavior** — a test reads a chunk of code as a string and looks
  for a substring in it; such a test stays green as long as the string is in place, even if the logic
  was inverted;
- **a green suite doesn't prove the other side accepted the request** — a double answers "success" to
  anything, and a dry run doesn't go anywhere at all; operations that go out to the world need a
  check against a real external target, not just against a stand-in;
- **tautology and inability to fail** — comparing a constant to itself, checking that a stub was
  called, a condition that passes no matter what the code does;
- **a test that really hits the network** — real requests to a live service instead of the code's own
  logic: slow, goes red for reasons unrelated to the code, can change live data;
- **an empty run counted as success** — a filter matched no files, the runner returned zero checks,
  and the gate stayed green;
- **a test-impersonator** — sits next to the code but doesn't call it, instead checking its own copy
  of the logic.

**Axis 3 — completeness.** List every promised behavior and edge case out of the spec, and match each
one against what's actually checked. A finding must be concrete: not "not enough tests," but "the
happy path is covered, but the refund, the zero-balance case, and reapplying a discount are not."

**Axis 4 — freshness.** Code that a test guards changed after the test did is a reason to read it (not
always a verdict — refactoring without a behavior change is fine). An orphan test, tied to no
acceptance item and no spec, is either forgotten or guarding something that no longer exists. A test
guarding a rule that's been retired is the most harmful case: it blocks changing the code in the
right direction while still looking useful.

For a spec-driven project all four axes apply; where there are no specs, or they don't live next to
the code, only three apply (no spec coverage) — say that out loud, don't paper over it with a
checkbox claiming it was checked against the spec.

## "A hundred percent" is not a goal

Line coverage percentage is not a goal to chase: a hundred percent is easy to fake with hollow tests.
Ninety percent with an uncovered money operation is worse than forty percent with that operation
covered. A coverage report is useful only as a hint of "where it's completely empty," not as a
quality score. Don't propose "raise the percentage" as a fix plan — propose specific uncovered
behaviors.

## The mutation-proof ritual

"There's a check" and "the check works" are different claims, and the difference can only be proven
by experiment. A check that can't go red is more dangerous than having none: a missing check is
visible right away, a silent one creates confidence where there shouldn't be any.

Order: break the guarded invariant by one line → confirm the check goes red → revert the
change. Mutate only in a separate working copy (an isolated tree, a separate checkout), never in a
shared one — several parallel sessions mutating the same tree wreck each other's work with no error
message at all.

A finding of "the check doesn't go red" that isn't confirmed by mutation is a suspicion, not a fact,
and a report shouldn't blur those two categories together.

## Open questions

**1. What exactly to mutate: every finding, or only the expensive areas?** One reasonable position
mutates selectively — "not everything, only findings in money/security/personal-data areas and
anywhere a mistake is expensive." A wider position says every axis-2 finding should be confirmed by
mutation where practical, without restricting by area. The difference shows up on cosmetic,
secondary findings: under the first, you can skip mutating them; under the second, it's worth trying.
This standard takes the ritual's wording from the wider position, but leaves open whether mutation is
mandatory outside expensive areas — that's a question about the audit's acceptable cost, not a
technical one.

**2. May a machine acceptance check touch production?** One reasonable position gives, as an example
of a machine item, `curl` against a live `/api/health` endpoint with no caveat — hitting a live
endpoint is treated as ordinary. Another position, for checking a spec against code on a live
project, carries an explicit warning: executable acceptance blocks are code that can touch a live
service or change data, and before running one against a live project you either need to confirm the
block is harmless and local, or not run it automatically at all and check it by eye instead. This
standard doesn't collapse these into one rule: how careful to be depends on how destructive the
specific check is and how normal it is, in your project, to run checks against a live environment.
