# The Spec↔Test Map and the Test Health Audit

`spec-and-tests.md` next to this document lays the foundation: an acceptance item produces a check, a
check unproven by mutation isn't a check, "a hundred percent" isn't the goal. This document is the
practical follow-up: three ready-made tools that apply that foundation, and the order in which you
roll them out in a new repository. Read `reference/spec-and-tests.md` first if you haven't — its
material isn't repeated here, only used.

## Why this is a separate tool, not just "run the tests"

"There are a lot of tests" and "the tests are green" prove nothing. In practice, suites have turned
up where dozens of tests were impersonators that never touched the live code, and one guarded a rule
that had already been retired; in another project, several security invariants could be broken with a
fully green run, including an admin-route permission check replaced by a stub that always answered
"allowed." The question isn't "how many tests" — it's **what they actually guard and whether they'll
go red when that breaks.**

Answering that by hand doesn't scale: an agent told to "check the tests" can't hold a hundred specs
and a thousand checks in its head at once — it starts reasoning plausibly instead of counting, which
is exactly the false confidence this whole exercise exists to fight. So the order is fixed: **a
machine counts first (the measuring tool), then a model judges (the auditor).**

## Three tools and the division of labor

| Tool | What it does | Where it lives |
|---|---|---|
| `templates/test-map.mjs` | the measuring tool: a deterministic script that builds the spec↔test map from facts, with no judgment | `plugins/house-rules/templates/test-map.mjs` |
| `agents/test-auditor.md` | a read-only agent that judges test health across four axes on top of the map | `plugins/house-rules/agents/test-auditor.md` |
| `agents/test-writer.md` | an agent that writes checks **from the spec, not from the code**, and must prove by mutation that each one goes red | `plugins/house-rules/agents/test-writer.md` |

⚠️ **This is the standard, not the tools' bodies.** The full system prompts of both agents (plus the
playbook for writing a route-level check) and the measuring tool itself are deliberately not
transcribed into this document — they live as separate files, installed with the plugin. The reason
is the same one this whole repository is built on: knowledge should have **one** place. A copy of a
prompt in a document would drift from the live agent exactly the way past copies did, and nobody
would notice it happening again.

The split of roles isn't arbitrary:

| Role | Who | Why this way |
|---|---|---|
| writes production code | the implementing agent | routine work against a finished brief |
| writes checks | `test-writer` | takes its promises from the spec; whoever wrote the code checking what they're already confident about just repeats their own blind spots |
| judges checks | `test-auditor` | arrives with a clean head, changes nothing |
| accepts the work | the lead agent | acceptance isn't delegated |

In critical areas (money, security, personal data), the code and its checks are written by
**different** agents — a mismatch between them means someone's wrong, and it's visible immediately.
For routine work the split doesn't pay for itself: three assignments and three reports cost more than
the fix itself.

## What the measuring tool counts

The tool walks `specs/<slots>/*.md` and the test files and classifies every spec into one state, in
this strict priority order: exception → route → module → structural → no machine items / work not
started / items retired / no check.

- **route** — at least one invoked test imports the **route handler itself** (not a neighboring
  function). This state means "the wiring is really checked": remove the guard call from the
  handler, and a test like this will notice.
- **module** — a test imports a live module in the repo, but no invoked test brings up the route.
  The module may be a pure function whose call from the route is **checked by nothing** — that's the
  "function instead of the wiring" disease, the most common and most dangerous one in practice. For
  computational or batch work with no HTTP surface, "module" is the norm, not a verdict.
- **structural** — no test invocation is found in the acceptance block (none of the regex patterns
  the spec uses to call a test matched); the block is closed with no executable command.
- **no check / work not started / items retired / exception** — the same three states
  `spec-and-tests.md` distinguishes for a single acceptance item, applied to a whole spec: closed
  with no check is a hole and a lie; work not started means it's too early to demand a check; items
  retired along with the mechanism means the check is no longer needed; exception means someone
  deliberately decided the check doesn't apply, and wrote down why.

Classification judges **the spec as a whole**: if even one of its invoked tests is a route test, the
whole spec is "route," even if its other tests don't bring up the route. This is a deliberate
simplification, made visible by two flags:

- **partial route coverage** — "N of M tests bring up the route": the spec is honestly "route" (the
  wiring is checked somewhere), but not all of its tests are — the rest are listed by name in the
  "Holes" section;
- **"function instead of the wiring" risk** — for a "module" state where the acceptance text mentions
  a route, an endpoint, auth, a guard, a webhook, or payment: by its meaning the spec probably should
  reach "route," but the tool only sees "module" — this is a suspicion, not a diagnosis, but worth
  looking at first.

A separate heuristic — **guard mocked into oblivion** — looks, for a spec in "route" state, at
whether the test that put it there mocks the auth module as a constant and never once flips the mock
to a denial anywhere in the file. Remove the guard call from the route, and a test like this won't
notice; this is exactly how it was found on live admin routes.

**The single most important setting** is what counts as a "route" (`ROUTE_SPECIFIER_PATTERNS` /
`ROUTE_CONTENT_PATTERNS` in the template's "PROJECT SETTINGS" block). Get it wrong, and the whole
map lies silently, confusing "checked the wiring" with "checked a nearby function." The rest of the
block's settings: where specs and tests live, what a test file name looks like, what pattern a spec
uses to call a test from its acceptance block (`TEST_INVOCATION_PATTERNS`), which import aliases
count as "internal," where to find the line-coverage report. Comments inside the block in the
template itself explain each one in more detail and give ready presets for common stacks (Next.js App
Router, Express/Fastify, framework-free HTTP handlers, projects with no HTTP surface at all).

## Test health — four axes and mandatory mutation

`test-auditor` judges them on top of the map — not by counting, but by reading specific findings:
spec coverage, check quality (is it hollow), completeness (are all promised behaviors and edge cases
closed), freshness (has the test fallen behind the code). The full breakdown of each axis, the
checklist of common check diseases, and why a "the check doesn't go red" finding stays a suspicion
without an experiment — all in `spec-and-tests.md`, sections "Test quality audit" and "The
mutation-proof ritual"; not duplicated here, only used.

Practical consequence for rollout: without mutation, neither an auditor finding nor the measuring
tool itself can be trusted — both apply to the "How to roll it out" walkthrough below.

## Full audit — order of work

1. **Work out how the project is set up.** `specs/CLAUDE.md` exists → spec-driven, all four axes
   apply. It doesn't → three apply (no spec coverage), check completeness against the rules file
   (`AGENTS.md`, or `CLAUDE.md` if there's no `AGENTS.md`) and the code, and say so out loud instead
   of pretending you checked against a spec. Check whether CI **actually** runs the tests — a known
   failure mode: the tests exist in the repo, but the workflow that runs them is disabled.
2. **Run the measuring tool**, if it's already installed (`specs/test-map.mjs` → `specs/TEST-MAP.md`).
   If it isn't, and the project is spec-driven, install it first per the section below; a refusal, or
   a non-spec-driven project, means gathering the minimum by commands instead of guessing: how many
   specs, how many with an executable acceptance block, how many test files, where code was edited
   after the test that guards it.
3. **Split the repository into areas by cost of failure**, not alphabetically: money → security and
   auth → personal data, migrations, and schema → production logic → UI and copy. Give each
   area its own `test-auditor` with its own brief (not a copy of one prompt): what the area is, which
   specs belong to it, which tests supposedly guard it, what the map already shows. Model choice:
   money/security/personal-data areas get the stronger model — a missed hole there costs more than
   the saved quota; everything else gets the cheaper one. Independent areas run in parallel, in one
   message.
4. **Mutate the expensive findings.** "The check doesn't go red" is only confirmed by experiment:
   break the invariant by one line → confirm the check stays silent → revert. Only in a separate
   working copy (`git worktree add`), never in a shared tree — several reviewers mutating a shared
   tree at once wreck each other's work with no error message. Don't mutate everything — expensive
   areas, and anywhere mutation is fast enough to actually do.
5. **"Zero holes" is a hypothesis, not a conclusion.** Before saying "everything's closed," check it
   a second way: a machine item's tag isn't only `(machine)` — it can be `(machine, staging)`,
   `(machine, post-deploy)`, and so on — a tool tuned to one form won't see a spec written with
   another, and will call it healthy. Count the forms yourself:
   `grep -ohE '\(machine[^)]*\)' specs/active/*.md | sort | uniq -c | sort -rn`.
   If a project has several checking mechanisms, verify they agree on the same fact. An empty result
   needs a second look (a different agent, a different search method) to confirm; a non-empty result
   needs no confirmation — the asymmetry is deliberate: a false "all clear" costs more than a false
   alarm.
6. **Sum up the verdict as three lists**, each sorted by cost of failure, worst first: **holes** (no
   check at all), **hollow checks** (a check exists but doesn't go red), **stale checks** (a check has
   fallen behind the code or guards a retired rule). Plus the measuring tool's numbers and a fix plan:
   what to fix first, what to hand to `test-writer` as a batch, what needs an owner's decision. Don't
   propose "raise coverage to N percent" — that's a fake goal; propose specific uncovered behaviors.

### Fast mode — on a diff, before a commit

A separate, cheap entry point: not a full sweep, just one question about the current diff — did new
logic show up, is there a check for it, and can that check go red? It plugs in as one angle of diff
review (see `reference/review.md`), runs alongside it, and needs no separate permission. A diff that
adds a route, a guard, or a money branch with no check is a blocking finding, fixed before the commit.

## How to roll it out in a new repository

### Step -1 — this is the second rung of the ladder

The measuring tool and the test audit are the **second level** of the general ladder in
`reference/deployment-levels.md`: on top of a rules file and a spec skeleton, you add test control.
What decisions belong to the agent versus the owner, and what the owner expects as an outcome at each
level — all there, not repeated here.

⚠️ **The second level stands on the first.** No rules file and no spec skeleton means the measuring
tool has nothing to measure: a spec↔test map with no specs is an empty table. If level 1 isn't in
place, set it up first (a spec-first workflow plus a "Rules" section in `AGENTS.md`, level 1) and
only then come back here.

For a **brand-new** project this step isn't needed separately — level setup handles it from the
start. It matters for an **existing** repository that's growing into the next level.

Moving up to level 2, regenerate the "Rules" section in `AGENTS.md` if it isn't there yet, or its
level is below 2:

```bash
node "$HOUSE_RULES_HOME/bin/agents-md.mjs" <repo> --level 2 --date <today>
node "$HOUSE_RULES_HOME/bin/agents-md.mjs" <repo> --check   # must come back green
```

The section is rebuilt from a single source (`rules/rules.md`) — edit it there, not by hand inside
`AGENTS.md` (a hand edit between the `house-rules:begin`/`house-rules:end` markers is lost on the next
regeneration).

### Step 0 — the agents are already there

The measuring tool gives you facts, but agents do the judging and the writing. `test-auditor` and
`test-writer` ship with the plugin at `plugins/house-rules/agents/` — installing `house-rules`
installs them under those names. Nothing else to set up here.

### Step 0.5 — do you even need the measuring tool

The measuring tool builds a **spec↔test** map. No specs, nothing to build.

- `specs/CLAUDE.md` exists → a spec-driven project, install it, all four audit axes apply.
- No specs → say so plainly and stop the rollout. Don't install a tool that will show an empty table.
  Offer a choice: set up specs first, or run `test-auditor` without a map — it can gather facts on
  its own, just without the spec-coverage axis.
- Specs exist but don't live in the repository (say, in a separate store on one person's machine) —
  the tool doesn't apply, it reads `specs/` next to the code. Say so and stop.

### Step 1 — scout the stack (by fact, not by guessing)

1. **Runner** — `package.json` scripts and devDependencies: vitest, jest, `node --test`, mocha,
   something else. While you're there, check whether CI actually runs the tests.
2. **Where tests live** — `__tests__/`, `test/`, `tests/`, `spec/`, next to the source. Count the
   files so you don't configure the tool for an empty folder.
3. **The route signature — the most important one.** Next.js App Router → files under
   `app/**/route.ts`, signature: the import path ends in `/route`. Express/Fastify → `routes/`,
   `controllers/`, or a test that spins up the whole app (`supertest(app)`) — then matching by test
   content, not file name, helps. HTTP handlers (Lambda, Netlify) have their own shape. No HTTP at
   all (batch, library, CLI) — leave the list empty and say plainly: "route" will always be empty,
   and that's fine, don't force it.
4. **Import aliases** — `tsconfig.json`/`jsconfig.json`, the `paths` field (usually `@/`).
5. **Line coverage** — is `@vitest/coverage-*` / `jest --coverage` / an equivalent installed, and
   where does it write its report.
6. **How specs call tests** — open two or three acceptance blocks in `specs/active/` and see what
   convention invokes tests (a project helper script, plain `npx vitest run`, `node --test`). This is
   the `TEST_INVOCATION_PATTERNS` setting — don't guess it, look.

### Step 2 — install and configure

Copy `templates/test-map.mjs` to `specs/test-map.mjs` in the target repo and fill in the "PROJECT
SETTINGS" block from your scouting; everything after that block is shared logic, leave it alone. Show
the owner a short table of what you picked and why, especially the route signature. If scouting gave
an ambiguous answer (two runners, tests in two places), say which you picked and why — don't stay
silent about it.

### Step 3 — first run and an honest picture

`node specs/test-map.mjs` → show the numbers: how many specs in each state, how many tests, orphans,
files with no coverage. The first map almost always looks bad — that's normal, and that's the point.
"Twelve specs with not a single check" is more useful than a softened "overall not bad."

### Step 4 — 🔴 verify the measuring tool isn't lying (mandatory)

A badly configured tool shows a green picture over a leaky hull — exactly the false confidence it's
meant to fight. Verify it with two mutations:

1. **Check for under-reporting.** Take a spec the map reports as "route" and confirm by eye that its
   test really imports the handler. It does, and the map says "module" — the route signature is
   misconfigured.
2. **Check for over-reporting.** Temporarily remove the test call from one spec's acceptance block →
   regenerate the map → the state must get worse. Put it back. Nothing changed — the tool isn't
   reading test invocations, `TEST_INVOCATION_PATTERNS` is misconfigured.

Mutate in a separate working copy, or with a guaranteed revert; check `git status` afterward. Until
both checks pass, the map can't be used as a source of fact, and you can't say "it's installed."

### Step 5 — ship it

- Commit per the project's own rules: `specs/test-map.mjs` and `specs/TEST-MAP.md` together.
- If you moved the level up to 2 (step -1), update the first line of `AGENTS.md`'s rules section: test
  control moves from "what's missing" to "what's here," and the "missing" list gets shorter. The
  rules file grows with the level, it doesn't describe intentions ahead of time.
- Report the numbers and next steps: which specs have no check, what to fix first (money · security ·
  personal data), and that the next step is a full audit via the `test-auditor` agent.
- No line-coverage tool installed — suggest adding one as a separate step, as a hint, with no
  thresholds and no gate: a hundred percent line coverage is easy to fake with hollow tests.

⚠️ **A gate in CI is a separate, later step.** The order is fixed: measuring tool → close the holes →
gate. Turned on too early, it turns the build red and blocks shipping. Wiring the gate into a
specific CI setup isn't covered by this document — it depends on how the project builds.

## Known limits of the template

- The "guard mocked into oblivion" check is written for vitest (`vi.mock`). On Jest it's a one-line
  change; on plain `node --test` it stays silent — and that means "doesn't work here," not "all
  clear."
- Tests are searched in the listed folders without recursion. A monorepo with tests scattered across
  the whole tree needs a change to the tool's logic, not just its settings.
- Python and other non-JS stacks — the tool would need to be rewritten from scratch; the template
  parses JavaScript imports. Say so plainly, don't pretend it fits.

## What these tools don't do

- They don't write tests themselves — holes are closed by `test-writer` (from the spec, not from the
  code); production-code fixes go to the implementing agent. Auditor and writer are deliberately different agents.
- They don't chase line-coverage percentage: a hundred percent is easy to fake with hollow tests.
- They don't wire a gate into CI and don't judge whether to add one — that's separate work, its own
  commit, decided by the project itself.
- They don't create specs in a project that has none.
- They don't commit or edit production code.
