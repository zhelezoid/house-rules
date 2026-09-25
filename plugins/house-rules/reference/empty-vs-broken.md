# "Empty" and "broken" are different things

The most common mistake in checks looks the same across every system: **absence of data gets
treated as absence of a problem.** Zero records reads as "nothing to do," an empty response reads as
"no changes," a 200 status reads as "the page is alive." In every case the mechanism isn't lying on
purpose — it simply can't tell "I found out there's nothing here" apart from "I couldn't find out."

The mistake is expensive precisely because **it looks like health.** A broken guard stays just as
quiet as a guard that genuinely has nothing to report — and silence gets read as calm.

## Five examples of the same class

Collected within a single working session, across unrelated subsystems — this isn't a rarity, it's a
typical blind spot:

| what was observed | what it actually meant |
|---|---|
| A board sync reported "no changes on the board" | The response came back with a 200 but was missing the expected field. The sync saw nothing at all and **moved its timestamp forward anyway** — the observation window shifted, and whatever it missed never came back |
| A page returned 200 | It rendered zero records. A visitor saw an empty page, while every automated check judged health by the response code alone |
| A run reported "thousands of tests passed," exit code 1 | The tests genuinely all passed; a notification channel inside the runner had crashed. The red exit code got read as "tests failed," which trained people to stop looking at the exit code at all |
| A sender's first run reported zero on every counter | The queue was actually full: the batch pulled the first N records, all of which turned out to be stale and got filtered out. Zero meant "wrong batch," not "nothing to send" |
| A run wrapper reported "result is trustworthy" | The report path still held **yesterday's** green file; today's run had crashed before it ever got to write. The judgment was made on someone else's run, not this one |

## The rule

🔴 **Any mechanism that can answer "there's nothing here" has to be able to tell that apart from "I
couldn't find out" — and say so in different words.**

Three states instead of two:

| state | meaning | what to do |
|---|---|---|
| **has data** | found out, here it is | work with it |
| **empty** | found out that there's no data | a legitimate answer, move on |
| **couldn't find out** | the source didn't respond, the response didn't parse, a field is missing | **say so loudly**, don't substitute a zero |

The third state can't get folded into the second "for simplicity." That folding is exactly what
creates a silent breakage.

## What this looks like in code

- **A missing field in a response is not an empty list.** A response that arrives without the
  expected structure is a broken response, not "no data." An empty list inside a structure that
  otherwise arrived intact is a legitimate "empty."
- **A response code doesn't stand in for content.** 200 says "the server answered," not "the page is
  useful." A check that judges health by response code alone will miss an empty list, an empty
  table, or a placeholder page.
- **A successful exit code and a complete report are different claims.** Judge by the work's own
  report, not by the tool's sense of its own well-being — an exit code is just the tool's opinion of
  itself.
- **Data has to belong to this run.** A file left over from last time isn't a result. Clear it before
  the run starts, so "no file" honestly means "this run produced nothing."
- **Zero on the first pass isn't the final total.** If the batch is limited (first N records, a time
  window), zero means "this batch was empty," not "empty overall." Either work through the whole
  thing, or say plainly that only part of it was processed.

### Trap: an exit code read through a pipe belongs to the last command, not yours

```
command | tail -5 ; echo $?      # this is tail's exit code — almost always 0
command > file 2>&1 ; echo $?    # this is the command's own exit code
```

A pipe returns the status of the chain's **last** command, and tools like `tail`, `head`, or
`grep -c` almost always succeed on their own. Reading an exit code through a pipe means reading the
health of whatever is looking at the output, not the health of the work itself.

The trap is nasty precisely because the output still looks convincing: you see the run's own lines,
you see a "0," and a report of "all clean" comes out perfectly sincere. This exact pattern has
produced a false "types are clean" report over genuinely broken type checks more than once in a
single day.

🔴 **Rule: the exit code gets captured by writing to a file, not by reading it through a pipe.** A
report of "the run is green" without that isn't a fact — it's an impression.

### Trap: a measurement that lives only in a container's log stream gets wiped by every deploy

Numbers a tool writes only to a container's standard output live only until that container gets
recreated. Every deploy erases whatever accumulated — silently, with no error and no trace left
behind.

That sets up a promise that can't actually be kept: "let's add a probe and check the numbers in a
day." If deploys go out several times a day, a full day of numbers never accumulates. Confirmed
repeatedly, over a single night: after each deploy the log held only a handful of lines, and by
actual count, roughly one of them mattered.

🔴 **A sign to catch yourself on ahead of time:** if the answer to a question lives **only** in a
container's log stream, you don't have a measurement — you have a hope that nobody deploys before
you look. Numbers that decisions actually get made on belong somewhere that survives a rebuild: a
database, a file on a persistent disk, an external sink.

⚠️ This is the same class of error as everything above: the tool answers "no data" and looks
perfectly healthy, even though data existed and simply got wiped out from under it.

## What this looks like in a report to a person

Wording that can't be told apart is half the problem. "Nothing found" needs to sound different from
"couldn't check":

- ✅ "no changes on the board" / "board unreachable: <reason>"
- ✅ "nothing to send" / "source didn't respond, send wasn't attempted"
- ❌ "0 records" used for both cases

## The check that catches this mistake

Set it up by mutation: **break the source, don't just empty it out.** An empty response and a broken
response are two different cases, and the check has to go red on the second one while staying green
on the first. If both scenarios produce the same result, the mechanism doesn't actually distinguish
states — no matter how many tests are sitting around it.

There's a separate check that verifies **state doesn't move** on "couldn't find out": no timestamp
shift, nothing marked as processed, no zero written to a counter. Otherwise a single failed attempt
quietly eats into the observation window.

## The other side of this: don't turn it into paranoia

The rule asks you to **distinguish** these states, not to raise an alarm over everything. Where a
source can legitimately be unreachable sometimes, "couldn't find out" should behave gently: the
page keeps showing whatever it was already showing, the guard stays quiet instead of shouting —
but state still doesn't move, and the log gets an honest reason written into it. A guard that cries
alarm on ordinary, expected ground trains people to stop trusting it just as reliably as a guard that
stays silent through a real break does.
