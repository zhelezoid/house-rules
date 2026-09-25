# Review before merge

Review is an independent check of a diff, with fresh context, done **before** it lands on the main
branch, not after. What review finds gets fixed **before** the commit or the merge, not filed as a
separate "do it later" task: a history that accumulates known-broken code costs more than fixing it
now does.

## When review is mandatory, and when it's just ritual

A nontrivial diff always goes through fan-out review — no exceptions. Signs of nontrivial: new
logic, three or more files, a critical path (money, authorization, routing and response codes, data
migrations, personal data), anything that changes behavior for a live user.

A trivial diff — a typo, a text edit, a config change with no new logic, an obvious one-line fix —
doesn't need review. Judgment beats ritual here: running a fan-out of reviewers on a typo isn't
rigor, it's process theater that only slows work down and trains people to stop reading reports.

## Review runs on its own, without waiting for permission

Waiting for confirmation ("is it okay to run review now?") in practice means review doesn't happen
at all: asking is easy to forget, and a nontrivial diff doesn't get any safer for the asking not
happening. One rule covers it: nontrivial diff — review runs itself, before the commit, with no
separate request needed.

## Different angles, not copies of one prompt

Fan-out review means several independent reviewers with different assignments, not several runs of
the same question. Copies of one prompt find the same thing — or nothing — because they're looking
from the same angle; independence comes from a real difference in focus.

The base set of angles:

1. **Correctness and regressions** — what breaks for the user, which edge cases got missed, is
   anything worse than it was before the change. Require proof by fact (run it, read the actual
   output) rather than reasoning about how the code is supposed to behave.
2. **Security and robustness** — authorization and privilege bypass (including reaching someone
   else's object by ID with no ownership check), injection, open redirects, behavior under garbage
   or deliberately malformed input, swallowed errors, and what ends up in the logs — and whether
   anything sensitive lands there.
3. **Spec conformance and how real the checks actually are** — does the code match what it claims;
   which acceptance items are marked as machine-checkable but nothing actually guards them; which of
   the new tests would return a false "green" over broken logic (see reference/empty-vs-broken.md
   for the signs of an empty check).

For money, schema migrations, and authorization, it's worth adding a fourth angle — a "devil's
advocate" whose only job is not to confirm the change is correct but to look for grounds to consider
it wrong. Framing the assignment this way surfaces findings that a reviewer primed toward "this looks
about right" skips out of habit.

📏 **A diff that introduces or changes a rule** (a standards document, a checklist, a working
agreement) gets a separate, mandatory angle: **where's the mechanism behind this rule, and what
happens if nobody follows it?** Questions for this angle: does the rule require the executor to
remember something — what goes red when they forget? A check exists — who actually calls it? Is the
rule written into a file that reaches the people adopting it, or one that only lives here?

This angle exists because no machine can replace it: a guard can't tell a new rule apart from a
clarification of an old one — the paragraphs look the same. One real case: a requirement that "every
guard has a self-test" lived only in one repository's top-level instructions file — a file that
never gets distributed to other repos at all — and it had no check of its own: tools sitting in that
same repo shipped without self-tests, and nothing ever went red. It was caught by someone asking a
question, not by a gate; the rule was moved into a file that does ship everywhere and backed with an
actual guard.

🚀 **A diff that touches the deploy path** (schema migrations, build/deploy automation files,
container configuration, environment variables, web server configuration, background job schedules)
gets a separate mandatory angle on top of the base set: **what happens during the deploy itself, and
what happens if it fails halfway through.** Typical questions for this angle: did the migration run
but the build didn't; was an environment variable added to the code but never wired into the
container configuration; is the step order such that an interruption partway through leaves the
system in an inconsistent state. This is the only point where anyone examines the deploy ahead of
time rather than after it breaks — an automated post-deploy check only judges an already-completed
fact, and only against a fixed list of endpoints; nothing automatically investigates why the deploy
itself failed.

## How to write an assignment for a reviewer

An incomplete assignment produces a useless report — the reviewer either guesses at context or
checks the wrong thing. A good assignment always includes:

- **full context** — what was being fixed or added and why, so the reviewer doesn't "fix" the
  original intent by mistaking it for a bug;
- **specific files or commits** — not "look at the diff in general" but exact paths, and which tool
  to read them with;
- **what to look at especially** — the author's own list of suspicions, with an explicit note "don't
  limit yourself to this list": a hint shouldn't turn into blinders;
- **how to check things by fact** — which command, which test, which request will show real behavior
  rather than an assumption about it;
- **what NOT to touch** — files and areas out of scope, so the reviewer doesn't expand the scope
  themselves and turn a targeted check into a wander through the whole repo;
- **finding format** — severity (critical / medium / low), the exact location (file and line), the
  substance, a concrete failure scenario (which input leads to which result), a suggested fix;
- **an explicit ban on padding for volume** — "no findings" is a normal, useful answer; a report
  padded out for line count is worse than a short, honest "clean."

The reviewer works read-only: it doesn't touch code or files — that's done by whoever accepts the
work, after going through the findings.

## What to do with findings

1. **Filter out false positives.** A reviewer can be wrong — including claiming that a disproven
   hypothesis was disproven against a different version of the code than the one actually changed.
   Don't trust the report blindly; check every finding against fact: re-read the code, run the
   command, reproduce the scenario.
2. **Fix confirmed findings before the commit or the merge.** A deferred finding on a critical path
   is a hole that's already been found and left open, not "next time."
3. **Verify that a new or fixed check is real.** Break the invariant on purpose, confirm the check
   goes red, revert (the mutation ritual — see reference/guards.md).
4. **Report in plain language.** What was found, what the author of the change already fixed on
   their own, what's fixed now, what's left for whoever accepts the work to decide.

### The finding that disproves the task itself is the most valuable one

A check written **from the task's stated promise**, rather than from the code, sometimes goes red
not because a hole was found but because **the promise itself was wrong**. That's not a defect —
it's the only way to catch a mistake in the ask before it gets locked in by code.

Example: a false-positives review once listed a command that a guard was "wrongly" blocking. A check
written from the promise went red — and digging into it showed the block was intentional, with the
reasoning written directly into the code: the whole input is closed off, rather than a list of
dangerous subcommands, because a list would need maintaining, and the first forgotten entry would
become a hole.

**What to do:** don't delete the check — rewrite it to expect the current behavior, **together with
the reasoning**, so the next person doesn't "fix" a phantom hole. Writing it from the code instead
would have just cemented current behavior and never noticed the gap in the first place.

### Reviewing a change to a guard: findings here are worth extra

A guard is code with two failure modes, and both fail silently:

- **it lets something dangerous through** — you find out once it's already too late;
- **it goes red on something legitimate** — you find out right away, but pay a different price for
  it: people stop reading the guard's output, and eventually turn it off entirely.

So reviewing a change to a guard has to verify **both** sides by actually running it, not by
reasoning about it: the list of legitimate, everyday commands has to pass silently, and the list of
dangerous ones has to get blocked. Both checked by fact, by exit code.

🔴 **A full-corpus comparison is mandatory** (see reference/guards.md on mutation testing): run the
old and the new version of the guard over every known form and explain every difference between
them. Zero weakening is a result shown with a number, not promised in words.

## Reviewing a pull request opened by an autonomous executor

As long as the final decision to merge a diff into the main branch is made by a human clicking a
button, that look right before the click is the last line of defense, and review can happily live
inside the session of whoever wrote the code — even an imperfect review still puts a second pair of
eyes on it.

The moment merging is done by the executor itself, or by automation with no human in the loop at
that moment, that line of defense disappears. As a matter of fact, the last judge stops being
whatever the executor told itself inside its own session and becomes whatever actually ran and left
a trace — that is, a check wired into the automated build. Review that lives inside the executor's
own session and leaves nothing behind but chat text can't be that judge: nobody but the executor
itself ever saw its result, and nothing can lean on it when deciding "merge or not."

That's where the shape for autonomous merging comes from: review of a diff opened by an autonomous
executor is a **separate job wired into the automated build**, not part of the session that wrote the
code. Its verdict is a mandatory branch check — it goes red on confirmed critical findings and
thereby physically blocks the merge, rather than leaving behind a recommendation that's easy to
ignore.

Honestly, about this scheme's weak point: the checking run often uses the same model that wrote the
code, in the same repo — independence isn't complete, and it's not a substitute for a second human
with different experience and a different eye. What the scheme does provide: a clean context (the
checking run doesn't remember the author's chain of reasoning and isn't defending its own earlier
work) and a visible trace — the review result exists as an artifact outside anyone's session, and
automation making the merge decision can actually lean on it.

## A tool the model can't call on its own

In many environments the model has a built-in review command that only a human can run directly —
the model itself can't call it; that's a limitation of the tool, not an agreement. A tool like that
doesn't count as a working step in the standard: it can't be relied on as an automatic stage. It
stays an extra manual check a human turns on themselves, on top of review that's already been done —
for an especially critical diff (payments, authorization, a data migration), say — not instead of it.

## Boundaries

- Review doesn't replace checking by code — tests and build gates stay mandatory regardless of what
  the reviewer said.
- Review doesn't commit and doesn't merge — that's done by whoever holds the right to accept the
  work.
- A reviewer's report is input to a decision, not the decision itself: confirmed critical findings
  get fixed, disputed ones get discussed — neither silently accepted nor silently dismissed.
