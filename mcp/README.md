# The nxk server

nxk is a plugin for Claude Code: an add-on that gives Claude tools. The tools count 200,000 made-up adults for each of
the UK and the US, keep what Claude learns about a product, and check what Claude writes. nxk's main part is an MCP
server, a program Claude Code starts and talks to over stdio (MCP, the Model Context Protocol, is the standard way to
give Claude tools). With it come three hooks: scripts Claude Code runs at set moments, such as when Claude stops. The plugin is declared in
`.claude-plugin/plugin.json` at the root of this repository. It needs Node 22.18 or later, which runs its TypeScript directly, and nothing else installed.
The server and the hooks start through `scripts/launch.mjs`, which says so in one line on an older Node.
[README.md](../README.md) says what nxk is for, and [docs/architecture.md](../docs/architecture.md) how the parts fit
together.

```bash
claude --plugin-dir /path/to/nxk          # this checkout as the plugin, for one session
claude plugin validate /path/to/nxk       # check the plugin's files
```

This page is the reference for what Claude sees: the server's instructions (when to use nxk, its rules, and how
to keep the owner's work as asked while saying what is worth considering), 23 tools with typed inputs, and the
guides in `mcp/guides/`, which nxk's agents read with the `guide` tool. The three ways in (below) are agents, not
prompts, and you start each: research with `/nxk:research`, the second look with `/nxk:look`, and the panel with
`/nxk:meet`.

The tools that count or check run the scripts in `scripts/`. The server imports each script and calls its `run` in its
own process (`runScript` in `mcp/common.ts`), in the folder the tool names, with the made-up people read once a
session. A paid ideas scan (`ideas_scan`) runs as a separate process, so that a cancelled call does not stop it. Claude
never calls the scripts itself, but each one also runs from a shell (`scripts/cli.ts`).

## Words

The instructions, tools, guides and hooks use these words in one sense each.

| Word | Means |
| --- | --- |
| you, the owner | The person Claude works for, whose product or business it is. The tools and `nxk.json` call you the owner (`owner_ask`, the source `owner`). Only you know your customers and your margin, so nxk asks you and never answers for you. |
| made-up people, adults | The 200,000 made-up adults of each country. They are not real people. PersonaGen, a separate project, made them so that as a group they match official statistics. The code calls them generated people. A count is "in every 100 adults" unless it names an audience, and also says about how many real adults it stands for. |
| fact, field, condition | A fact is one thing known about each person, such as age or how they hold their home. The code calls it a field, and its values are codes. A condition picks people by a fact: `field=code`, `field=code\|code`, or `field=low..high` for a number. Conditions joined by commas must all hold, as in `age_years=65..120,home_tenure=owned_outright`. `people` with action `find` looks up a fact's name and codes. |
| tier | The letter on each fact that says where it comes from: A, official statistics such as the census; B, other published surveys; C, PersonaGen's own estimate where no survey exists. |
| group | Any set of people described by conditions. |
| audience | Who the product is for, as conditions, kept in `nxk.json`. When it is set, counts are made within it. |
| the person you pictured | The customer Claude had in mind, written as conditions (`pictured`) for `sweep` and for `people` with action `cast`. |
| term | Something your request already settles: a price, opening hours, a contract, how to pay. Claude lists them for `terms`, which checks each quote against the request and counts whom each one fits. |
| open fact | Something the work needs that the request does not say and only you can give, such as how long people have to send an item back. The reply asks it, marks it "yours to confirm", or leaves a [placeholder] for it. |
| sweep | What the `sweep` tool does: it counts every fact about people against the person you pictured, and lists the biggest groups that picture leaves out. |
| suggestion, option, rule, close call | A suggestion is a point where a person could be turned away. It has two or more options. When you set it (one of your terms), your option is kept in what Claude builds (`as_asked`), and the other is offered in the note with a change Claude will make if you say yes (`offer`). When you did not set it (a required field, how a name is checked, which ways to pay), Claude takes the option that turns away the fewest, unless it costs your goals. Its rule is the figure, written down before counting, at which the other option is worth raising with you ("N in 100"). A close call is a count near that figure: it is raised, with the fact about your customers it turns on. |
| the note | The few lines after the work that start "Worth considering:": at most three items, each with who it affects, about how many, and what Claude will do if you say yes. No note when nothing is worth raising. |
| label | The word every figure in a reply carries to say where it came from: given (you said it), measured (your own results), counted (the made-up people), computed (worked out from your figures), sourced (a page that was opened and holds the words), simulated (a scan) or guess. A passage in a made-up person's voice is marked imagined and carries no figure. Guide topic `reply` has the rules. |
| decision model | An AI model that, given a question and its possible answers, returns a probability for each and writes no text. Google's `gemini-decision-1` is the default. |
| scan | A run of a decision model, paid for with your key. It asks about one fact at a time, then gives each made-up person an answer built from all their facts. `options_scan` scans versions of one choice, and `ideas_scan` scans ideas. Its figures are simulated: it says which groups are more or less likely to want something, never how many will. |
| second look | nxk's look after the work and the reply, on counts only, at most three points (below). |
| research | Your question about people, started by you with `/nxk:research`, answered with idea scans and returned as findings only (below). The guides and the code also call its scans discovery. |
| keenness, corner, segment | Keenness is how much a group prefers an offer (simulated). A corner is the group that prefers one offer most, among the offers scanned together. A segment is a group kept as a candidate audience, from a corner or written as conditions. |
| the floor | Nothing that works by misleading or trapping people. If you ask for it, the reply says so first and offers a fair way to the same goal. |
| next move | The `Next:` line at the end of every tool's answer: one call that digs further, which Claude may make or not. |
| looked further | A step that goes past the first count: `probe`, a reading of an `options_scan`, `explore_next` after a move, and `corner_split`. Each writes one line for the reply: what it checked, what it found, and whether that changed what is worth suggesting, confirmed it, or could not tell. |

## The knowledge base: nxk.json

`nxk.json` sits at the root of your project (the folder holding `.git`), and the tools find it from any folder below.
Every entry says where it came from: `owner` (you said so; a reply labels it given), `measured` (your own records),
`counted`, `sourced`, `simulated`, or `guess` (Claude's). A guess is kept so that a later step can ask you about it. It
is never used as what you said.

| Part | What it holds |
| --- | --- |
| `product` | Name, a one-paragraph description as a customer would meet it, and stage: `none`, `idea`, `defined` or `live` |
| `country` | `uk` or `us`: the first one a tool is given. Another country in a later call is refused: if the product has moved, change it here first |
| `where` | Where you sell, when it is one area and not the whole country, as place conditions. Research takes its place from `research_start`, and counts every lead there as well as nationwide |
| `audience` | Who it is for, as conditions the tools read, where that came from, and why |
| `customers` | Shares of your customers ("45 in 100 aged 65 or over"), used to count among people like them |
| `facts` | What you said in words, by topic: contacts, policies, prices, what you will not do |
| `money` | Your figures: price, margin, cost to win a customer |
| `questions` | What you were asked, open or answered, so that nothing is asked twice |
| `discovery` | The scans run, and the segments with their counted size, simulated keenness and sourced rivals |
| `suggestions` | Each suggestion: the rule, the count, your option as asked, the offer, whether it was worth raising, the option the counts favour, what to watch |
| `outcomes` | Your real results (measured), each set against what nxk said beforehand: agrees, disagrees, too few to tell, or nothing to compare. Together they are the product's track record |
| `research` | Each research question: your words, its place and budget, the saved scans it reads, whether it is open, and the state of `explore_next` for it (corners split, groups widened for, rounds in a row that found no strong corner, the last move named, whether the last call found progress) |

## Three ways in

nxk has three ways in, one command each, and each command hands the work to an agent with its own context. `product`
is the first tool each agent calls: it reads `nxk.json` and says what is missing and, between the second look and
research, which way in fits.

1. **Second look** (started by you; `/nxk:look`, `agents/second-look.md`, guide topic `second-look`). On work Claude has done: a
   page, a policy, a plan, a message or an answer, in code or in a plain chat. `sweep` for the groups the person you
   pictured leaves out; `terms` on the request (your terms, kept as given) and `suggest` on each point where people
   could be turned away, counted among the audience and among people like your customers; then a short note of what is
   worth considering, and `note_check` on it and what the work delivers. It runs on counts only: it cannot call a scan
   tool, and where a scan would settle a point it offers research, with the price a version `product` prints.
2. **Research** (started by you; `/nxk:research`, `agents/researcher.md`, guide topic `research`). Your question
   about people: who would want this, which version people would take, who nobody is serving, what a scan you started
   found. `research_start` records the question, its place and budget, and opens it as a study: from there the scans
   and segments are that question's, so two questions in one folder never mix their leads. Versions are written to
   whoever pays (firms counted as firms when businesses pay), scanned with `ideas_scan` (`ideas_deal` for an area with
   no product yet), and explored with `explore_next` until it says report. It returns findings only: strong leads
   first, faint ones marked faint, or plainly that nothing stood out; the groups no version serves; what your own
   figures would sharpen; what the scans cannot say and what they cost. It records no product and picks no segment.
3. **Panel** (started by you; `/nxk:meet`, `agents/panel.md`, guide topic `panel`). For colour: it counts the group you
   name, draws a few of its people with `people` action meet, each as a card of their own facts, and, when you ask,
   walks each through a page, marked imagined and with no figures (`note_check` fails a figure in an imagined
   passage). Asked to answer a question in their voices, it says that would be Claude's guess and offers research. It
   cannot call the scan tools.

Every way in writes to `nxk.json`, and the next one reads it: a second look after research starts with its saved
scans, its segments and your answers already there.

### The explorer

`explore_next` works in research, after the first scan, on the open question only. It lays out the leads: first who
wants your own offer (marked `own` in the scan: the people keenest on it against everyone, and how keen by age and
gender), then each other version's corner when it is clearly keener on it than everyone (a quarter keener at least),
and the big groups no version suits. For each lead it shows the people's side (keenness, simulated;
rivals, sourced) and the business's side (size, counted; how many must buy to reach your target at the version's price
and margin, computed, when you gave them). Then it names one move:

- first, moves that cost nothing: keep a corner, split it with `corner_split`, look up rivals;
- then a budget for scans, the one thing it asks you, when none is set;
- then paid moves, within the budget: new versions for the biggest group none suits;
- then report: the findings, as guide topic `research` says.

Widening stops after two rounds in a row that found no strong corner. Leads are ordered by the corner's strength (x2 or
more is strong), then by counted size. There is no single score, and nxk never chooses for you: the findings name the
cheapest real test that would tell the leading two apart.

### Real results

After any path, when you have real numbers, `outcome_record` records them against what nxk said beforehand:

- `groups`: one offer's take-up by group, such as an advert's results by age band, against what the scan said of each
  group;
- `options`: an A/B split, against the option a suggestion's counts favoured;
- `customers`: who the customers turned out to be, against each group's counted share of adults. A group defined by a
  single fact also becomes a measured share that `suggest` weights its counts by.

Only directions are compared, never a scan's levels. A difference counts only when its 95% interval clears zero,
widened (Bonferroni) for the number of comparisons nxk said something about, so that more groups do not turn chance
into a finding. "Too few to tell" says about how many more results would tell. `product`, `segments`, `suggest`, later
scans and the start of every session show what was measured beside what was simulated.

## Tools

Every tool except `guide` takes `folder`: the folder to work in, relative to the project (default: its root). Most
also take `country`, `uk` or `us`. The country is never assumed: leave it out once `nxk.json` or an earlier call in the
folder has given it, and a tool that counts or scans people refuses without one. `*` marks a required input. The full
description and schema of each tool are in the file named in each heading.

No tool loads when a session starts: the session doing the owner's work never carries nxk's tools in its context. nxk's
agents load the ones they use with one tool search, first thing (step 0 in `agents/second-look.md`,
`agents/researcher.md` and `agents/panel.md`).

### What is known, and your answers (`mcp/knowledge.ts`)

| Tool | Does | Inputs | Writes |
| --- | --- | --- | --- |
| `product` | What is known, which way in fits (second look, or research while one is open), open questions, and what research costs a version | - | - |
| `research_start` | Opens your research question as a study: your words, its place, its budget, and any saved scans it reads. Closes any other, so two questions never mix their leads. For the researcher, first | `question`\*, `where`, `budget`, `include` | `research` |
| `owner_ask` | Puts one question to you: a share of your customers, words, or a figure. Shows a form when the client can show one, and otherwise returns the question to ask in chat | `question`\*, `kind`\* (`share`, `words`, `figure`), `fact` (for a share), `topic`, `why` | `questions` (and the answer, from a form) |
| `owner_answer` | Records an answer you gave in chat, or something you said unprompted: a share, words, a figure, or that you do not know | `id` (from `owner_ask`), `kind`, `question`, `fact`, `topic`, `share` (0 to 100), `answer`, `value`, `unknown`, `source`, `note` | `customers`, `facts`, `money`, `questions` |
| `outcome_record` | Your real results against what nxk said (above) | `what`\*, `kind`\* (`groups`, `options`, `customers`), `arms`\*, `total`, `from_scan`, `idea`, `segment`, `suggestion`, `unscanned` | `outcomes` (and measured `customers`) |

### Build (`mcp/build.ts`)

| Tool | Does | Inputs | Writes |
| --- | --- | --- | --- |
| `people` | Counts the made-up people. `find`: the facts and codes that mention a word. `values`: a fact's values and their shares. `fields`: every fact. `count`: how many meet `who`, with about how many real adults (several groups separated by `;` are counted side by side). `split`: a group broken down by the facts in `by`. `reach`: how many are left after each requirement in `need`. `profile`: what marks a group out. `cast`: people drawn from everyone except `pictured`, as examples, not evidence. `meet`: people drawn at random from inside `who` (`n`, default 6, at most 12; `seed`), each as a card of their own facts, for the panel | `action`\*, `word`, `field`, `who`, `among`, `by`, `need`, `pictured`, `n` (default 12), `seed`, `show`, `people_file` | - |
| `sweep` | Counts every fact about people against the person you pictured: how many in 100 fit, and the largest groups it leaves out under seven headings (money, access, time, who decides and pays, what starts the need, how they hear of it and choose, risk and trust), each with the question the choice must answer for them. Runs after `terms` | `pictured`\*, `among`, `top` (default 3), `min` (default 5 in 100), `people_file` | - |
| `terms` | Takes every term as Claude lists it, checks each quote against the request, adds two that are always there (the words are in English; it is opened on whatever the person has), and counts whom each fits, with the question to settle. Also takes the open facts (`[]` for none; one you have answered in `nxk.json` is closed), who pays, and where the request contradicts itself. A place its word patterns read as a contradiction is put back until Claude lists it in `clashes` or sets it aside in `not_clashes` | `request` or `request_file`, `terms`\*, `open`\*, `buyer`\* (`people` or `businesses`), `clashes`\*, `not_clashes`, `among`, `people_file` | `request.md`, `terms.json`, `open.json`, `clashes.json`, `not-clashes.json` |
| `probe` | Looks further at a group near a suggestion's rule: where the count crosses it, split by facts you can see in your customers (age, work, household, money, health, place), the kinds of people in it, and the ways in more of them use. Its last line says whether who your customers are could change what is worth raising | `who` or `lacking`, `among`, `rule`, `people_file` | - |
| `suggest` | Counts each point among the audience and among people like your customers. For one of your terms it keeps your option and says, by its rule, whether the other is worth raising; for a choice you left open it names the option that turns away the fewest. A close call is raised with the fact it turns on, and no question comes back to you. Prints the note's lines, at most three, largest first. Refuses until `sweep` has run after `terms` and every term that leaves out many is answered | `suggestions`\* (each with `suggestion`, `options`, and for your terms `as_asked`, `rule`, `count` and `offer`; the form is in the tool's description) | `suggestions.json`, and `suggestions` in `nxk.json` |
| `sums` | The arithmetic: break-evens, the one figure to solve for, customers needed against a group's size, and the months to pay back what a customer costs to win | `options`, `unit` | - |
| `note_check` | Checks the reply, and what it delivers, before you see it (below) | `reply` or `reply_file`, `pays`\*, `delivered` | `reply.md`, `pays.json` |
| `source_check` | Opens a page and checks that the words copied from it, with the figure, are on it | `link`\*, `words`\* (3 to 40 words) | `.nxk/sources.jsonl` |
| `people_pull` | Draws more people for a narrow audience from PersonaGen (needs a PersonaGen key). `check: true` sizes it without drawing | `among`\*, `count` (default 2000), `seed`, `check` | `.nxk/people-<country>-<seed>.json.gz` |
| `options_scan` | Puts two or more versions of one choice to the people. Paid. `read_only` with the label alone prints saved answers again at no cost | `label`\*, `spec` and `max_usd` (needed to send), `fields`, `read_only`, `who`, `among`, `level` | `.nxk/scans/options/<label>/` |
| `guide` | The method, by topic | `topic`\*: `second-look`, `research`, `panel`, `reply`, `look_up`, `cannot`, `sums`, `scan`, `discover`, `narrow` | - |

### Discovery (`mcp/discovery.ts`)

| Tool | Does | Inputs | Writes |
| --- | --- | --- | --- |
| `ideas_deal` | Deals out, for an area, combinations of who it is for (groups counted on the people), who pays, how it is charged, how it reaches them, who does the work and what starts it, for Claude to write as offers. Sends nothing | `area`\*, `n` (default 16), `seed`, `for` (groups to deal for, such as ones nothing suits) | - |
| `ideas_scan` | Puts three or more offers to the people, each with what it is bought as (`buying_category`: a household, or an organisation, asked at work). Prints who wants your own offer (`own: true`: its keenest people against everyone, and how keen by age and gender), each offer's corner with its counted size, and the big groups none suits. Paid. Waits up to ten minutes; a longer scan carries on in the background, one at a time, and calling again with its `label` alone waits and then reads it, sending nothing. A scan stays with the research question it was started for, even when read under another | `label`, `ideas`, `max_usd` (needed to send), `read_only` | `.nxk/scans/` beside `nxk.json`, and `discovery.scans` |
| `segment_add` | Keeps a group as a segment and counts its size: from a scan's corner (`from_scan` and `idea`, or `idea` `nothing:<n>` for a group none suits) or written as conditions (`among`) | `label`\*, `among`, `from_scan`, `idea`, `why` | `discovery.segments` |
| `segment_rival` | Records a business already serving a segment: opens the link and checks the words copied from it, or records `none_found` with what was searched | `segment`\*, `name`, `offer`, `link`, `words`, `none_found` | the segment's `rivals` |
| `segments` | The segments side by side: size (counted), keenness (simulated), rivals (sourced), and what is missing. With `price`, `margin` and `target`, also the customers each needs against its size | `price`, `margin` (%), `target` (profit a month), `cac` (cost to win a customer), `churn` (% leaving a month) | - |

### The explorer (`mcp/explore.ts`; the moves it names are planned in `mcp/explorer.ts`)

| Tool | Does | Inputs | Writes |
| --- | --- | --- | --- |
| `explore_next` | The leads, both sides of each, what is missing, and the one next move with its tool and inputs (above) | - | `explore` |
| `corner_split` | Splits a segment kept from a corner by every fact the scan asked about, from the saved answers: the sub-groups keenest and least keen, with their counted size. Sends nothing | `segment`\*, `min` (default 1 in 100) | `explore.splits` |

### What note_check checks

- A label on every figure. Every counted, computed, simulated or measured figure must be one a tool printed in this
  folder, traced through the log. A sourced figure needs a link that `source_check` opened and found the words on.
  A reply that labels figures says once, outside any draft, what each label it uses means (for counted: "on 200,000
  made-up UK adults that match official statistics"); when that line is missing, the check prints the exact line to
  add, and the line does not count towards the length. Whom each count is of. The length: Claude's own prose, outside the lines the other checks ask for, fails over
  about 400 words, and the whole reply gets a warning over 400. The limit is fixed; a session cannot raise it.
- Each contradiction Claude listed in `clashes` is put to you in one point with both sides, asked as a question or
  marked "yours to confirm".
- What is delivered: each file in `delivered` (a folder stands for its `index.html`), and each draft in the reply (a
  fenced block or lines quoted with `>`; with neither, the reply itself). Each payment over time that Claude declares
  in `pays` (a free trial that turns into a payment, a renewal, a repeating payment) must be told in its own words:
  what the trial turns into, what the renewal costs, how the payment stops. Nothing paid or consented to may be ticked
  for the person in advance.
- Each open fact from `terms`, unless you have answered it, is asked or marked "yours to confirm" in the reply outside
  any draft, or left as a [placeholder] that names it.
- The lines tools said to keep, and each looked-further line, are in the reply outside any draft, as printed.
- Your terms are kept: every figure in each term you set (a price, hours, a contract's length, a limit, an age) is in
  what is delivered. A term with no figure ("pay by direct debit") is not checked this way.
- A rule with a figure that you never gave: a line in what is delivered that states money, a percentage or a length of
  time found nowhere in your request, what you typed, `nxk.json`, the pages opened or your project's files. This only
  warns, and it cannot see an invented rule with no figure in it.
- After `suggest`, the note: at most three items, each short, and a warning when `suggest` raised something and the
  reply has none. Nothing in the reply is left in brackets.

Its 30 checks are in `scripts/checks/`, each with a kind. Format, trace and quote checks look for something exact and
can fail a reply. Hint checks, such as the one for invented proof, are word patterns on the reply's own prose, and they
only warn.

### What every answer carries

Tools return text only. Claude Code shows the model a tool's structured content in place of its text, and the text is
what says what each figure means, so no structured content is sent.

Every answer ends with one next move (`Next: <tool> <inputs>` and why), from `mcp/nudge.ts`: in research, the move
`explore_next` would name; after a count, what marks the group out; after that, a split by it; after an options scan,
the groups at both ends of the fact where the versions differ most, and the same split inside a group read. Claude may
make it or not, and `evals/depth.ts` counts how often it does.

Every line a tool prints goes to the folder's `.nxk/log.jsonl` as a record, with the label its figures carry (counted,
computed, simulated or measured), written where the line is made. The scripts write it as they print
(`scripts/log.ts`). The server's own tools return their lines labelled, and `mcp/tools.ts` logs them. What a tool
means beyond its lines is a record too: a line the reply must keep, a contradiction in the request, an open fact,
your terms, `suggest`'s note lines, a scan's pace, `note_check`'s verdict, and each looked-further line with its outcome.
`note_check`, the hooks and the next moves read these records (`scripts/records.ts`), never a tool's text.
`evals/depth.ts` counts the looked-further lines by outcome.

## Settings

The plugin asks for these when it is installed, and `/plugin configure nxk@nxk` changes them. All are optional:
counting the made-up people needs none of them. Keys are kept in the system's credential store and reach the server as
`NXK_*` environment variables, and nothing prints them. [scripts/decision-model.ts](../scripts/decision-model.ts)
reads them first, then the usual environment variables, then key files in `~/.config/nxk/`.
[guides/scan.md](guides/scan.md) lists those names, which way a model is reached when several keys are set, and the
limits and prices.

| Setting | What it does |
| --- | --- |
| `gemini_api_key` | A Google AI Studio key, for scans on Google's decision model, `gemini-decision-1` |
| `gemini_tier` | Your Google project's tier, which sets how fast scans are sent. When it is not set, scans keep to the Free Tier's limits |
| `gateway_api_key`, `openrouter_api_key` | Keys for two services that pass requests on to many models, for decision models reached that way |
| `typesafe_api_key` | A TypeSafe key, for scans with Jev, TypeSafe's decision model, sent straight to TypeSafe |
| `decision_model` | The decision model: `gemini-decision-1` by default, and `jev-1.14.0` and `jev-1.13.0` by name. Saved answers are kept apart by model |
| `personagen_api_key` | Lets `people_pull` draw more people from PersonaGen for an audience too narrow for the 200,000 shipped |

`product` and the start of each session say what is set: the model, how it is reached, Google's tier, and whether a
PersonaGen key is set. They never show a key.

## The agents

The work is the session's, done as Claude would do it without nxk, and so is its reply. nxk runs after it, in the
plugin's subagents, each in its own context, so the tools' output and the guides never fill the context the work is
done in:

- `nxk:second-look` (`agents/second-look.md`) reads the work and the reply, looks at the room with the counting
  tools, checks its note with `note_check` and returns only the note, which the session puts under its reply. It
  cannot call the scan tools.
- `nxk:researcher` (`agents/researcher.md`) runs research you started with `/nxk:research`
  (`skills/research/SKILL.md`, which Claude never starts on its own), or with your yes to a second look's offer, and
  returns findings only, which the session passes on with no answer of its own beside them.
- `nxk:panel` (`agents/panel.md`) runs a panel you started with `/nxk:meet` (`skills/meet/SKILL.md`): the group's
  count, the cards, and any walk-throughs, marked imagined.

None can write or edit files; a point becomes part of the work only when you say yes and the session makes it.

The session doing the work is told almost nothing about nxk. The server's instructions are one line, to leave nxk's
tools to its agents; the tools load only when an agent asks for them. `/nxk:look`, `/nxk:research` and `/nxk:meet` say how to
brief each agent, and nothing starts one on its own. So the work is done exactly as it would be without nxk, and
nxk's findings come back beside it.

## Hooks

| Hook | Runs | Does |
| --- | --- | --- |
| `hooks/asked.ts` | Before each nxk tool | Copies what you typed in the session into `.nxk/asked.md`, so that `note_check` takes a figure you gave as given. A session that never uses nxk leaves nothing behind |
| `hooks/stop-check.ts` | When Claude stops, and when nxk's agents stop (SubagentStop, `nxk:second-look`, `nxk:researcher` and `nxk:panel` only) | Holds the session or the agent once, with every reason in one note (below) |

The main session is never held for nxk: nxk runs only when you start it with `/nxk:look`, `/nxk:research` or
`/nxk:meet`.

The rest holds nxk's agents, each read from its own transcript, and the main session only where it used the tools itself.
Either is held when:

- it stopped on one look: it read a scan and asked nothing after it, or never scanned and looked at the people fewer
  than three times (`scripts/depth.ts`). The note names the last next move a tool gave. A scan still running in the
  background is waited for instead;
- it counted your terms (`terms`) and ran no `suggest` after them;
- it ran `suggest`, and the reply has not passed `note_check` since;
- it printed other figures (a count, a scan, a sum), and no reply has passed `note_check` since;
- its last message is not the reply that passed, and fails `note_check`;
- it called `explore_next`, and the last call found progress and named a move Claude can make itself (not yours, and
  not a stop).

It reads the records in the `.nxk/log.jsonl` files written in the last six hours, and the session's transcript to
know which tools the session called itself, never a tool's text. It never holds a session twice in a row.

## What it will not do

- Rank segments by one made-up score. Size is counted, keenness is simulated and rivals are sourced. They are shown
  side by side, with what is missing, and you choose.
- Say how many would buy. Scans give direction for groups, not levels ([tested.md](../tested.md)).
- Send a scan without a spending limit (`max_usd`), or answer for you.
