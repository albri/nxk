# Evals

nxk runs only when the owner asks, with `/nxk:research`, `/nxk:look` or `/nxk:meet`. These evals check two things:

- **That nxk is accurate.** This is nxk's benchmark: its answers set against published figures, in three checks that
  live in their own folders and run on their own.
  - [`real-us/`](real-us/README.md): 23 counts on nxk's made-up US adults against the same counts on 200,000 real
    adults from the American Community Survey 2024. All 23 match.
  - [`surveys/`](surveys/README.md): the scan's differences between kinds of people against what 22 official surveys
    publish. 327 of 345 point the right way (95%), on 19 November 2026.
  - [`products/`](products/README.md): the scan of 32 existing products against who regulators publish uses each.
    559 of 622 published differences point the right way (90%), in nxk's own wording, on 19 November 2026.
- **That nxk behaves when asked.** Each case folder here sends one of nxk's commands in a real Claude Code session and
  checks what comes back: research that reads a saved scan or answers a question the way published figures do, a
  second look that comes back with at most three points and changes nothing, a panel that counts its group and marks
  every walk-through imagined. `run.ts` runs them, and the rest of this page is about it.

## Running it

Run with your decision-model key set (the scan guide says how), as someone using nxk would. Look at the cost first:

```bash
node evals/run.ts --plan                       # what all 11 cases would cost; runs nothing
node evals/run.ts                              # all 11 cases, once
node evals/run.ts --case=look-gym-signup-uk    # one case
node evals/run.ts --tag=output-research        # research only: the eight research cases
node evals/run.ts --repeat=3 --jobs=3         # every case three times, three at a time
```

Every session, judge and scan is paid on your account and counts towards `--max-usd` (25 dollars by default).
`--plan` prices each case at its latest paid run; a case with none (as the three look and meet cases have until their
first run) is priced at the median session. On 19 November 2026 it put all 11 cases at about 14 dollars on Opus 5.5, most of
it the eight research cases.

## The cases

| Kind | Command | Cases | What they check |
| --- | --- | --- | --- |
| research | `/nxk:research` | explore-saved-scan, ideas-drivers-paperwork-uk, options-groups-laundry-us, scan-finished-read, scan-running | a scan saved in the folder: read past its summary (by group, and within a group by a second fact), reported as leads, not findings; a running scan said to be running, with nothing new started; no paid scan when the owner says not to. Keyed to the cases' own planted answers, which `truth.ts` reads |
| research | `/nxk:research` | pet-insurance-research-uk, prize-savings-research-uk, score-draw-research-uk | a question about who would buy a new product, keyed to who uses a published product much like it (the FCA's Financial Lives 2024; the Gambling Commission's Gambling Survey for Great Britain 2024): the findings point the published way, are roughly the right size, and forecast nothing |
| look | `/nxk:look` | look-gym-signup-uk, look-refund-policy-uk | a sign-up page (a gym in Cardiff: twelve months, £29 a month, £20 to join, Direct Debit) and a refunds page (a bike shop in Bristol): the second look ran, came back with at most three points or the one line that nothing is worth raising, labelled every figure, and left the page as it was |
| meet | `/nxk:meet` | meet-cardiff-walkthrough-uk | Cardiff adults who are just getting by or finding money hard, walked through the gym's page: the panel ran, counted the group and gave its size, showed each person as a card, marked every walk-through imagined with no figures in it, and read the page |

The look and meet cases have no `owner.md`: their owner has no goals written down, so they say yes to nothing, and a
page that changed was changed without their yes.

## How a case is written

Each folder is one case, in the format `claude plugin eval` also reads:

- **`prompt.md`**: the owner's request, starting with the command (a test checks each case starts with its kind's
  command), and front matter with a `description` for the reader and `tags`. One tag gives the kind, `output-research`,
  `output-look` or `output-meet`. A tag `serious-<grader>` marks a grader whose failure would mislead the owner or the
  people they serve (a badly wrong figure about people, a forecast passed off as known, a figure with no label, a page
  changed without a yes). A tag `no-key` hides every key from the session. Nothing else in a tag reaches the session.
- **`case.yaml`** and **`seed.sh`**, where the case needs a project to start from: the seed builds it in an empty
  folder (a saved scan, a running one, a page). A case cannot set its own model, tools, turns or time.
- **`graders/*.md`**: what a good result looks like. These make the score.
- **`graders/process/*.md`**: how nxk ran (the session handed the work to `nxk:researcher`, `nxk:second-look` or
  `nxk:panel`, which of its tools ran, that the page was read). Shown apart, never scored.
- **`graders/calibration/`**: for each llm grader, a reply that should pass and one that should fail
  (`<grader>.pass.md`, `<grader>.fail.md`, and more as `<grader>.fail-<what>.md`), each as the judge would read it.
- **`graders/source/`**: where an answer key comes from (`SOURCE.md`: the table, its address, the key and its range),
  the owner's goals (`owner.md`) and the facts only they know (`owner-knows.md`).

Grader types:

- `llm`: three votes from the judge, `claude-sonnet-5-5`, each giving its reasons before its verdict; the majority
  passes. The judge has no tools, and a vote with no verdict is asked again, up to twice. `focus: files` reads the
  reply with every file the session delivered.
- `regex`: a pattern on the reply (`target: last_message`), the transcript (`target: trace`, the subagents' lines
  included), a file (`target: { source: file, path: ... }`), or the reply with every delivered file (`target: files`).
  A look case's `page-unchanged` fails if any delivered file is an HTML page, since the owner's page is the only one.
- `tool_used`: how many times a tool was called, with `min` and `max`.
- `file_exists`.

The delivered files are every file the session wrote with Write or Edit, and any other file it added or changed after
the seed, such as with a shell command, leaving out what nxk keeps for itself (`.nxk/`, `nxk.json` and the records
its tools save).

## How a session runs

Each case is a real Claude Code session (`claude -p`) in a fresh folder built by its seed, with project settings only,
so your own plugins and skills stay out, and this repository loaded with `--plugin-dir`. Every case runs on one setup,
`SESSION` in `cases.ts`: Claude Code's own default model with every built-in tool in auto mode, where a classifier
approves or blocks each action as a careful person would, up to 80 turns and 40 minutes, with nxk's tools approved.
What auto mode blocked is kept with each run. Sessions get your decision-model key but not a PersonaGen key, so every
count comes from the people shipped in `maps/`, and nxk's `scan_budget` is set to one dollar, as an owner would set it
once.

Before the first session, a run:

- finds the model Claude Code chooses by default, from the first event of a session stopped there, and pins that exact
  model ID for every session. The judge is fixed, so scores stay comparable from run to run;
- prints what it should cost (`--plan` stops there);
- refuses to start while the plugin (`.claude-plugin`, `agents`, `hooks`, `mcp`, `scripts`) or the people files
  (`maps`) have uncommitted changes, so a result always names the code it measured (`--allow-uncommitted` for
  development);
- when a research case is in the run, asks the decision model for one test answer with the key the sessions get (a
  fraction of a cent), and refuses to start with no key, no credit, a refused key or a used-up daily quota. The second
  look and the panel never scan.

The same first event says what a plain session here loads (the skills, agents and plugins built into Claude Code).
Every session is held to that list, besides nxk's own parts. A plain session that loads a plugin or MCP server of your
own stops the run before it starts. Sessions and judges run without claude.ai connectors or auto memory, and Claude
Code does not update itself during a run.

A scan the session started that is still running when its turn ends is waited for, and the session is resumed once it
has finished ("I'm back. Has it finished?"), at most twice. A scan the seed left running is the case's state and is not
waited for.

### The owner

A simulated owner (`owner.ts`, on the judge's model) reads each reply and answers what it puts to them, and the
session is resumed with what they said, at most twice. Research uses this: with no budget for a scan, it asks the owner
in a `To ask the owner:` line.

- It knows only what the case says: the request as typed, their goals (`graders/source/owner.md`) and the facts only
  they know (`graders/source/owner-knows.md`).
- A question, or a [blank] left in a file people read, is answered only with words from those files, quoted. Anything
  else is not known: a fact about their business is "mine to fill in", a call the assistant could make is "use your
  judgement". An answer whose quote is not in the files, word for word, is not known either.
- An offer is taken only when it serves one of the owner's goals as written and goes against none of their limits.
- The harness writes the owner's message from those decisions, so the owner never asks for anything new. A reply that
  asks and offers nothing gets no answer and costs nothing; offers only turned down end the session as it is.

Graders and the judge then read the conversation: the replies in order, with each owner message between lines of
`---`, and are told only then that what the owner said yes to, and every fact they gave, is theirs. `--no-owner` leaves
the owner out. `--calibrate=owner` checks it on its own examples (`owner-calibration/`): offers that serve a goal taken,
others turned down, questions answered from the files or not known.

### Where nxk runs, and the reply

The session hands the work to one of nxk's three subagents, each in its own context: the researcher, the second look or
the panel. Claude Code keeps their transcripts beside the session's, and the run reads them all, so every tool grader
and the depth table see the subagents' calls. Each run says which subagent it handed work to and how many of nxk's
calls were made in the work's own context, which should be none (`nxkSplit` in `depth.ts`).

A turn's reply is everything the session wrote in its own context in that turn, read from its transcript (`turnText`
in `run.ts`), as the owner reads it in Claude Code: Claude Code's own result holds only the last block. A command's
turn is the one that names the command, found by its arguments; a later message that repeats them (an owner's answer
naming the same file) is never taken for it. A subagent's own words are not in the reply; only what the session passes
on.

## What counts as a failure, not a score

A run is recorded as a failure, with no score, when its session broke off with an error before it answered; ran past
40 minutes; could not see nxk's tools or any of its three subagents, could use an MCP server other than nxk's, loaded
anything a plain session here does not besides nxk, or ran on another model than the pinned one; or had its scans
stopped by the decision model's account or key. A session that runs out of turns is scored: that is its own result.

`--fill=evals/results/<time>` reruns only the failures of that run and the runs its spending limit skipped, on the same
setup, and writes one combined result. `--max-usd` is checked only when a case starts; a case once started finishes
every repeat, so the spend can pass the limit by about the cost of the cases in flight, which the run prints first.

## Other commands

- `--case=<glob>[,<glob>]` and `--tag=<tag>` choose cases.
- `--repeat=3` runs every case three times and ends with each one's scores and depth, their mean and range: a
  difference smaller than that range is noise.
- `--reuse=evals/results/<time>` takes a run from earlier results when nothing it depends on has changed (the case,
  Claude Code, the session model and code, the judge, this repository, the people files and the decision model), and
  says why when something has.
- `--rejudge=evals/results/<time>` grades saved replies and files again under the current graders, unless a prompt or
  seed changed. A verdict whose rubric is unchanged stands and is not paid for again.
- `--calibrate [--graders=<case>/<grader>,...]` judges each llm grader's pass and fail examples, then the owner's; a
  grader that cannot tell its two apart is rewritten. `--calibrate=owner` checks the owner alone.
- `--agreement=evals/results/<time> [--sample=12]` judges each llm grader of a sample of saved runs twice afresh, and
  reports how often the verdicts agree with each other and with the saved ones. It prints the cost first; add `--plan`
  to stop there.
- `node evals/depth.ts evals/results/<time>` prints how far each session dug (`scripts/depth.ts`).
- `node evals/truth.ts` prints the planted answers the saved-scan cases are keyed to.

Any other option stops the run before anything is paid for.

## Results

Results go to `evals/results/<time>/`, which git ignores:

- `results.json`: the setup every score was measured on (this repository's commit and what was uncommitted, hashes of
  the plugin and the people files, Claude Code's version at the start and the end, the model IDs, the decision model,
  never a key, the judge, and hashes of the code that runs and grades a session), then each run: its score and
  graders, or its failure; its cost; what it could use; how far it dug; where nxk ran; its turns; and what the owner
  decided.
- `replies.md`: every case's request and reply.
- `traces/`: each session's transcript, its subagents' included.
- `files/`: the files each session delivered, so a page can be judged again after its work folder is gone.

In older results that also hold runs without nxk, `--rejudge`, `--agreement`, `depth.ts` and the cost estimate read
only the runs with nxk.

## What a run reports

- Each case: its score (the mean of its repeats), how many runs missed a serious grader, words per reply, in how many
  runs the session handed the work to the subagent its command calls, nxk's calls in the work's own context, and what
  it cost.
- Each kind and all cases together: the mean score with its range across repeats, and the share of runs with at least
  one serious miss, with its range.
- Where nxk ran, the process graders, and what the owner did, none of them scored.
- How far each session dug, and each repeat's score when a case ran more than once.
- Failures, tool errors and words per reply, and what was spent on sessions, judges, the owner and scans.

## `claude plugin eval`

Every case also loads under `claude plugin eval`: each prompt and grader uses only the keys it accepts. It gives each
run a throwaway home folder, so no key reaches nxk and nothing is scanned, and its `files` target may read the files
alone where `run.ts` reads the reply with them, so its scores are not comparable and are untested here.
