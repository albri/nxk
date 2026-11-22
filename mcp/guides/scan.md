# The scan

The scan is optional. It asks a decision model how different kinds of person
respond to a situation, then counts the result on the generated people, so that
it can say who an option reaches and who it loses, for the whole population or
any group. The counts in `suggest` come first (guide topic second-look); in build tests
a scan did not change what was built.

It works from two static files for a country and asks about nobody in
particular:

- `maps/<country>.json`: every fact recorded about people, about 145 fields
  and 1,050 values, with the share of adults holding each;
- `maps/<country>-people.bin.gz`: the generated people, each reduced to
  those facts and packed, which is how the scan knows which facts go together.

## Write the spec

```json
{
  "surveyed": "November 2026",
  "versions": {
    "email_only": "You are looking at the pricing page of a budgeting app that links to your bank accounts and shows where your money goes. Plus costs £4.99 a month and has a 14-day free trial. To start the trial you enter an email address only; when it ends you drop to the free plan unless you choose to pay.",
    "card_first": "You are looking at the pricing page of a budgeting app that links to your bank accounts and shows where your money goes. Plus costs £4.99 a month and has a 14-day free trial. To start the trial you enter your card details; you are charged when it ends unless you cancel first."
  },
  "questions": {
    "act": { "type": "choice", "text": "What would you do next?", "options": ["Start the free trial", "Use the free plan only", "Leave without using the app"] }
  },
  "watch": ["act", "Start the free trial"]
}
```

- **Each version is an option you could choose.** The first is the baseline.
  Versions differ in one thing: a term, a step, what is asked for, what
  happens next. To compare three options, write three versions.
- **Write the situation as the person would meet it:** what they see, what it
  costs, what happens next. Leave out any reassurance the real screen would
  not give. Use real prices, times and terms.
- **Test substance, not wording.** Against real headline experiments this
  kind of model picked the better wording no more often than a coin.
- **The options are what a person really does,** including carrying on as
  they are or leaving. Leave out "don't know". Keep the wording of the options
  neutral and alike.
- **`watch` is the answer to follow:** the one you want more of, usually the
  action the business wants. Each read ends with one line for the reply: which
  version gets it most, for everyone read and in each group, against the
  first version.
- **To scan a feeling or an obstacle,** make it the question of its own spec
  with Yes and No as the options ("Would you worry about being charged
  without noticing?").

## Run it

`options_scan` takes `label`, `spec` (the JSON object above), `max_usd`, and
optionally `fields`, `read_only`, `who`, `among` and `level`. A scan is asked
once for everyone: `who` only chooses which groups are read, so a group never
needs a scan of its own. For example, the first call, and then a reading of two
groups from its saved answers (separated by a semicolon; a read needs only the
label):

```json
{"label": "work", "spec": {"versions": {}, "questions": {}, "watch": []}, "max_usd": 0.1}
{"label": "work", "read_only": true, "who": "financial_risk_tolerance=not_willing_to_take_any_financial_risk,digital_skill_level=above_basic_digital_skills; age_years=65..120"}
```

A read with `who` prints those groups alone; the reading for everyone does not
change with the group, and `read_only` without `who` prints it again.

With `read_only` and `level` (for example 0.12), or with `fields` (for example
`["home_tenure", "household_type", "managing_financially", "age_years"]`), the
call is the same with that input added.

**Every field, unless you name some.** With no fields named, the scan asks
about every field of the map: about 146 requests and 2 cents a version. That
is the default because a model picking the facts that matter left out the
ones that mattered most (attitude to financial risk, for 38 ideas of 40). To
spend less, `fields` asks about ten general fields that say who is keen
on anything (attitude to financial risk, technology adoption, digital skill,
internet use, three personality scores, whether advertising sways them, how
they choose brands and how well resourced the household is) and the ones you
name: about a fifth of a cent a version. A fact that is not asked about cannot
show up in the result.

Each question is asked with the options in order 1 only (the order count is fixed). Answers are
saved under the scan's label, so `read_only` prints again at no cost and a
second run sends only what is missing. They are answers to the words they were
asked with: a version reworded under its old key, or a changed question, is
refused (give the new wording a new key or the scan a new label), and the same
versions and question under a new label read the saved answers instead of
paying again. `max_usd` stops a run that would cost more than you allow.

## The decision model

The answers come from a decision model: a model that gives a probability for
each possible answer to a fixed question and writes no text. It runs on the
owner's own account. The `product` tool's last lines say what is set: the
model, its route and Google's tier, and whether a PersonaGen key is set.
They never show a key.

- **Settings.** Set the keys and choices in the plugin's settings (`/plugin`,
  then Configure options, or `/plugin configure nxk`): `gemini_api_key`,
  `gemini_tier`, `gateway_api_key`, `openrouter_api_key`, `typesafe_api_key`,
  `decision_model` and `personagen_api_key`. Keys are kept in the system's
  credential store. Without them, nxk reads `GEMINI_API_KEY`,
  `AI_GATEWAY_API_KEY`, `OPENROUTER_API_KEY`, `TYPESAFE_API_KEY`,
  `PERSONAGEN_API_KEY`, or files of those names in `~/.config/nxk/`:
  `gemini-key`, `decision-key`, `openrouter-key`, `typesafe-key`,
  `personagen-key`.
- **Which model.** Google's `gemini-decision-1` is recommended and is the
  default. `jev-1.14.0` and `jev-1.13.0` (TypeSafe's Jev) are known by name on
  every route. Any other decision model a gateway or OpenRouter serves can be
  named as that service names it. Each saved answer records its model. A scan
  reads and asks only for its own model's answers, so changing the model sends
  every question again; answers from different models are never mixed.
  Answers saved before nxk recorded the model count as `gemini-decision-1`.
- **Which route.** A model is sent to its own provider when that key is set:
  Google for Gemini, TypeSafe for Jev. Otherwise it goes through Vercel AI
  Gateway, else OpenRouter. OpenRouter's decisions endpoint is marked alpha,
  and nxk has not yet run a scan through it. `NXK_DECISION_URL` points the
  scan at any other endpoint that takes TypeSafe's System One requests.
- **How fast.** Google publishes limits by tier, for each project. Set
  `gemini_tier` to yours, or write it (as "Tier 1") in the file
  `~/.config/nxk/gemini-tier`: aistudio.google.com/projects shows it. With no tier
  set, the scan keeps to the Free Tier's limits, which are safe on every tier.

  | Google tier | Requests a minute | Tokens a minute | Requests a day | A scan of every field, one offer |
  |---|---|---|---|---|
  | Free Tier | 200 | 50,000 | 10,000 | about 4 minutes |
  | Tier 1 | 1,500 | 1,000,000 | 50,000 | under a minute |
  | Tier 2 | 5,000 | 4,000,000 | no limit | under a minute |
  | Tier 3 | 15,000 | 10,000,000 | no limit | under a minute |

  The gateway, OpenRouter and TypeSafe publish no limit for paid use. There,
  the scan sends up to 16 requests at a time. On every route, a busy answer
  (429) halves the requests in flight and waits as long as the service asks;
  twenty answers in a row let one more back in. A spent daily quota stops the
  scan. The answers so far are kept, and the same scan run again later sends
  only the rest. The call waits for a scan paced to finish within about ten
  minutes; a longer one carries on in the background (the discover guide).
- **What Google keeps.** On the Free Tier, Google may use what is sent to
  improve its products; on paid tiers it does not. The scan sends the option
  as written in the spec and one fact about a person at a time, never a real
  person. Put a confidential idea through a paid tier.
- **The price.** Nothing is charged on Google's Free Tier. Elsewhere the cost
  is taken from the provider's reply where it gives one. Otherwise it is
  worked out at the model's published price for a million input tokens:
  0.10 US dollars for `gemini-decision-1` and 0.042 for Jev (output is not
  charged). `NXK_DECISION_USD_PER_M` overrides it. A version asked about every
  field costs about 2 cents on Google's paid tiers. The scan prints the
  estimate before it sends anything and stops at `max_usd`.
- No key is ever printed.

The checks in [tested.md](../tested.md) used Google's model through the
gateway. Reached directly, it did about as well: on 32 existing products with
622 published gaps between groups, 554 and 557 the right way round (two
wordings), against 563 and 560 through the gateway. The two routes do not give
identical answers, so finish a scan on the route it began on: a second run
reuses the answers already saved in its folder. A different model can give
different answers: when two decision models were compared on the same offer,
they disagreed about whether price or commitment mattered more.

## What it prints

1. **Facts that matter most.** For each field, how far apart its common
   values sit on the watched answer, when that fact is all that is known
   about the person. Also the facts that hardly matter.
2. **Where a change lands unevenly.** For each other version, the fields whose
   levels are hit most differently, level by level: before, after, the change
   in log-odds, and the level's share of the field's whole change.
3. **Counted on people.** Each of the 200,000 generated people is given an
   answer built from the scanned facts they hold. From that: how many of every 100
   adults act under each version; for a change, who the fifth of adults moved
   most are, against all adults; and, with `who`, any combination of facts,
   with its share of adults and its answer under each version.

`level` is for when you know the real figure under the first version, such
as the share of visitors who start a trial today. The people are then shown
around that figure and the other versions keep the same footing. `among`
counts within an audience in place of all adults, such as
`age_years=18..44,internet_use_frequency=daily_or_almost_daily`.

## Read it

Tell the owner which version leads for whom, how far to trust it, and what to
test, in a few lines (guide topic reply: under about 400 words in all).

- **Who, not how much.** Many facts say nearly the same thing (retired, over
  65, on a state pension). Adding all their
  effects at full strength would count the same thing many times, so the sum
  is damped: 1.2 over the square root of the fields asked about, about 0.1
  with every field and 0.3 with ten general and six named. Who is most
  affected hardly changes with the damping; the size of every difference
  does. The scan prints the result at half and one and a half times the
  damping so you can see this.
  Quote who is affected and roughly how many. Do not quote a size as a
  finding. Act on the first few lines of "the fifth moved most": when the
  same question was scanned in two different forms, the strongest marks of
  that group repeated (unwilling to take financial risk, short of money) and
  the weaker ones did not.
- **Fewer fields, the same scale.** A person's answer is a sum over the
  fields asked about, so with one damping for every scan, 25 fields showed
  the same kinds of person standing out far less than all 146 did. The
  damping is set by how many are asked so that they do not: on 32 products
  whose users are published, a difference read from ten general fields and
  six named came out at 1.2 times its published size, and from every field
  at 1.3 times it (evals/products/strength.ts). Sizes are still rough: read
  who, not how much.
- **A lone fact carries everything that usually goes with it.** "Retired" also
  means older and often a homeowner. The first two lists show differences
  between kinds of person, which is what you need to decide who to serve. They do not show what a fact itself does.
- **Trust a field when its levels line up.** One value's figure is rough: the
  same request with the options in another order moves it by a few points.
  A field whose four or five levels fall in order is signal.
- **Do not quote an overall level.** The answer with nothing known moved by
  several points when the same request was laid out differently. Compare
  within one scan. If you know the real rate, pass it as `level`.
- **The scan can ask about people who do not exist.** Two facts that never go
  together still get an answer when asked about. `who` counts real
  combinations among the people, and says when one has too few to read.
- **It cannot set a price, rank one lever against another, or choose
  wording.** Different decision models disagree about whether price or
  commitment matters more for the same offer.

How far it has been checked:

- Against 22 official surveys, asking about one fact at a time pointed the
  right way on 95% of 345 real differences between groups (329 on 12
  November, 327 when rerun on 19 November in the form the scan sends) and kept
  about nine-tenths of their size (0.94, 0.88). The questions, sources and
  answers are in evals/surveys/.
- The count on people was checked against the same decision model asked
  about 300 other people one by one: it ordered them the same way
  (correlation 0.75 on two questions). That shows one scan stands in for
  asking each person, not that either is right.
- Asking about ten general fields and the fields named for the decision, in
  one option order, was compared with asking about every field in both
  orders, on 40 product ideas and 32 existing products already scanned in
  full. The fields were named by a model that saw no results, and the ten
  general fields were ranked for each set on the other, so they differ by
  two or three from the ten shipped. It found the
  same or mostly the same people for 16 of the 19 ideas with a clear group of
  their own (every field in one order: 17), and put groups the right way
  round against published figures at least as often (87% to 91% against 86%).
  The differences it showed were about half the size.
- Nothing here has been checked against what real people did with a real
  product. It is the decision model's view of people, organised by real
  population data. Use it to decide who to worry about and what to measure.

## Ask the people

The `people` tool takes an `action`, a `country` and the inputs that action
needs:

```json
{"action": "fields", "country": "uk"}
{"action": "find", "country": "uk", "word": "smartphone"}
{"action": "values", "country": "uk", "field": "home_tenure"}
{"action": "count", "country": "uk", "who": "age_years=18..34,home_tenure=rented_from_a_private_landlord_or_letting_agency"}
{"action": "split", "country": "uk", "who": "age_years=18..34", "by": ["home_tenure", "life_stage"]}
{"action": "reach", "country": "uk", "need": ["internet_use_frequency=daily_or_almost_daily", "devices_used_to_go_online=smartphone"]}
{"action": "profile", "country": "uk", "who": "financial_risk_tolerance=not_willing_to_take_any_financial_risk"}
{"action": "cast", "country": "uk", "pictured": "age_years=25..44,confidence_using_digital_devices_and_apps=very_confident"}
```

The `people` tool answers questions about who exists from the generated people
alone. It asks no model and sends no request.

- **`cast`** counts the person you pictured, then draws twelve people from
  everyone else, at random, and prints each as a few facts. The first line of
  each is always given; the second lists only what sets the person apart from
  most adults (a difficulty, no smartphone, short of money). `who` draws
  from a group, `n` and `seed` change the draw, `show` (a list of fields) adds a
  fact to every person. A draw of twelve can miss a kind of person held by
  one adult in fifteen, so count requirements with `reach`.

- **`reach`** applies what a thing requires of a person, one requirement after
  another, and prints how many of every 100 are left after each, then who the
  ones left out are. Use it on every choice: list what a person must have or
  do to get through (a device, a payment method, a level of skill, a
  language) and see who that excludes before deciding anything else.
- **`profile`** compares a kind of person with adults in general across every
  field of the map.
- **`count`** sizes a group, with its margin and about how many real adults it
  is; **`split`** breaks one fact down
  by another; **`find`** and **`values`** look up the names to use;
  **`fields`** lists every field in one line, to choose what a scan asks about.
- **`among`** works within an audience in place of all adults.

Conditions are joined by commas and must all hold. A value can be several
codes joined with `|`; a numeric field takes a range such as `18..34`; a scale
(income, frequency, a quintile: `people` with action `values` says which, and in what
order) takes a range of its codes, such as
`personal_income_before_tax_per_year=30000_to_39999_gbp..150000_gbp_or_more`.

- Each line carries the field's tier. A link between two facts fitted to
  official statistics (tier A) is close to measured. A link involving a
  modelled fact (tier C) is PersonaGen's modelling; treat it as a lead.
- With 200,000 people a group of 5% of adults has 10,000 people and its
  shares are good to about 1 point; a group of 1,000 to about 3; a group of
  100 people to about 10.
  Under 100 the lines are leads; under 30 they mean nothing.
- It describes; it does not predict. Check anything you will spend money on.

## The maps

A map is plain data built from PersonaGen, which generates people fitted to
official statistics and other sources. It holds every field with a list of
values, except appearance and names, with every value anyone holds. A long
list (occupations, industries, countries of birth, health conditions,
interests) runs from the most held value to the least, and its `common` says
how many come first because 1% of adults or more hold them (3% for a specific
interest): a scan asks about those alone, and counts, splits, profiles and the
raw files take every value. A numeric field is five points along its range.
Places (region or state, local authority or county, town) stay in the
catalogue's order and are not asked about one by one; job titles and other
free text stay out. A scale carries its `order`. Every share is of all adults.

The maintainers rebuild both files with `scripts/build-maps.ts` after a new
PersonaGen release. Apart from `people_pull`, nothing else calls PersonaGen. People drawn for a
narrow audience are passed as `people_file`, from the `people_pull` tool, in
the same shape.
