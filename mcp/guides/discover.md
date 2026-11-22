# Discovery

The scans behind research (guide topic research). Discovery answers a
different question from the second look (guide topic second-look): not "whom
does this choice leave out" but "who is this idea for, and who is nothing
for". It puts several ideas to all 200,000 generated people at once and reads
off three things:

1. whether the ideas are wanted by the same people;
2. for each idea, the corner of the population that prefers it most to the
   other ideas, with its counted size;
3. the large groups that no idea on the list is for.

Research uses it when the owner asks, by name, which ideas people would take,
who an idea is for, or where there is room.

## Why it is needed

Asked for ideas, a model writes for one kind of person. Twenty household-admin
ideas from a plain request were wanted by the same people (likeness 0.69,
where 1 means identical), and for most of them the keenest group was the same
well-off, confident, online one. Ideas written for the groups that list left
cold were wanted by different people (0.37) and reached groups the first list
did not.

## Write the ideas

```json
[
  { "key": "renewal_radar",
    "offer": "a service called Renewal Radar. You forward your insurance, broadband and mobile renewal letters, and it tracks every end date. You get a nudge a few weeks before each one, with the steps to switch or haggle. It costs £4.99 a month and you can cancel at any time.",
    "buying_category": "household",
    "fields": ["home_tenure", "vehicles_in_household", "compares_prices_before_buying", "financial_planning_horizon", "managing_financially", "household_income_before_tax_per_year", "household_type", "pets_in_household"] }
]
```

- **Three ideas at least, eight or more if you can.** An idea's corner is read
  against the other ideas, so one idea alone has no corner. Include the
  obvious ideas: they show where the crowd already is.
- **`offer` is the idea as a person would meet it:** what it is, what it does
  for them, its real price and terms. It is put after the words "This has
  been on offer where you live for the past year:" and the person is asked
  whether they have it, tried it and gave it up, or never had it.
- **Leave out `fields` and every idea is asked about every fact.** That is
  the default, so that the model does not choose where to look. To spend
  less, give each idea ten to twenty `fields` (what creates the need, what
  makes it usable or not, what they may have instead; names from
  the `people` tool with `{"action": "fields"}`); ten general facts are then
  added for you.
- **Use the `ideas_deal` tool to write ideas you would not think of.** It deals
  out who an idea is for (groups counted on the generated people), who pays,
  how it is charged, how it reaches people, who does the work and what starts
  it, so that every option turns up. Write each sensible combination as an
  offer; drop the rest.
- **Every idea is asked about every field named for any idea.** That is what
  lets a group be called unserved: each idea was asked about it. A fact
  nobody names cannot show up.
- **Every offer gets a `buying_category`**: `"household"` when a person buys
  it for themselves or their home (a landlord with one flat to let), or, for
  an offer sold to organisations, what they buy it as (`software_and_saas`,
  `facilities_and_office`, `professional_services` and the rest in the tool's
  list). See the next section. An offer with none is refused before anything
  is sent.

## Offers sold to organisations

An offer with a `buying_category` is asked at work. The words become "This
has been on offer to organisations like the one you work for, and to
people's own businesses", and each person answers for where they work.
People not in work answer that they never had it. The scan also asks about
each person's part in buying that category and about where they work: the
size and kind of organisation, how it buys, and the person's job level and
management duties. When every offer on the list is asked at work, the corners,
the groups nobody serves and the reach are read among the people in work
(people not in work would otherwise make up corners of their own); sizes are
still in every 100 adults.

The reading then adds two things for each category:

1. **Who decides, by size of firm (counted; PersonaGen's modelling, tier C,
   so a lead, and not simulated: no decision model is asked).** For each size of
   organisation it gives the number of adults who work at one, then, as shares
   of those adults, how their organisations buy (the owner alone, quotes from a
   few suppliers, a departmental budget, formal procurement, a tender) and what
   part they play in buying it (sign off, approve within a budget, recommend,
   use or ask for it), and who the people with each part are (the owner,
   directors and executives, managers, supervisors, staff). In the US, 73% of the people at firms under 10 work
   where the owner decides, and none of those at firms of 1,000 or more, where
   formal procurement and departmental budgets lead. These are shares of
   people, not of firms.
2. **How keen, at work (simulated).** Each offer's keenness among everyone
   in work, then by part in buying it and by size of organisation. Read it
   for which seats and which sizes lean in, not as how many firms would buy.

- **Run it within the scan budget** the setup names, or one the owner gave;
  with none, tell the owner the cost and ask first. The household question was
  checked against published figures for 32 products. The question at work
  has not been, but the "Who decides" counts come with it either way.
  Two of three eval sessions skipped the scan and named no decision-maker.
- **Say who decides at each size of firm you put forward**, and who else
  takes part, from the counts: name the people (the owner signs off, a
  director or manager approves, staff use it), with the share as printed,
  labelled counted. note_check fails a reply after an at-work scan that gives
  none of the "Who decides" shares.
- **Test the sizes against each other.** When the reply ranks sizes of firm,
  its test with real firms puts the same offer, the same way and for the same
  spend, to firms of each size, and records take-up in each with
  `outcome_record`. Talking only to owners of 3 to 8 person shops cannot say
  whether solo owners would have been better.
- **These are people, not firms.** The reading prints a line for the reply to
  keep, saying so. Several people in one firm can give
  sign-off, and many firms have none in the sample. Count the firms
  themselves with `people`, unit `firms`, by their size, sector, industry, how
  they buy and place ("about 24,000 firms with 10 to 49 staff in the North
  West"), and say them as firms. Any other kind of business needs a published
  count (US: Census Bureau County Business Patterns and Nonemployer
  Statistics; UK: ONS UK Business Counts), labelled sourced. Customers needed
  are set against that count, not against the adults.

## Run it

`ideas_scan` with the ideas list (each `{key, offer, buying_category, fields?}`), `max_usd` and
`label`; to print again from saved answers, the same call with `read_only` set
to true:

```json
{"label": "work", "ideas": [{"key": "...", "offer": "...", "buying_category": "household"}], "max_usd": 0.6}
```

The cost is printed before anything is sent: with every fact, about 18 cents
for ten ideas and 36 for twenty; with fields named, about 7 and 17.
`max_usd` sets the limit (0.60 covers every fact, 0.20 covers fields named). Answers are saved, so adding ideas to the list and
running again sends only what is missing. It needs the same decision-model
key as the scan (the scan guide). Reading takes about a minute for twenty
ideas.

Sending is paced to the decision model's rate (on Google's free tier, 50,000
tokens a minute), so a scan of every fact can take 15 to 30 minutes. The call
waits for a scan paced to finish within about ten minutes. A longer one carries
on in the background, and it keeps going if the session ends. Only one runs at
a time: a second call sends nothing and says so. Tell the owner it is running
and when to come back. `ideas_scan` again with its label alone waits for it (up
to ten minutes a call) and then reads the answers, sending nothing: the offers
were kept when it began. Do not sleep or check its files in between.
`explore_next` says which of these applies.

## Read it

- **Likeness.** The average correlation between two ideas' scores across the
  people. Near 1, the list is one idea several times. The pairs most alike
  are the ones to merge or drop.
- **Keen on all of them, cold on all of them.** The people who like or
  dislike the whole list. They say more about the area than about any idea.
- **Each idea's own corner.** The people who prefer this idea most to the
  other ideas, so the people keen on everything are not named for every
  idea. The figure is how many times more they favour it than their average
  idea. The size of the corner is counted on the generated people. A corner
  can prefer an idea to the others and still be colder on it than adults in
  general, when it is a group cold on the whole list.
- **Strong, leads to test, faint.** A corner shown at x2 or more is worth
  acting on. One at x1.5 to x2 is a lead to test, not a finding. One at x1.15
  to x1.5 is faint and not a lead. On 32 products whose users are published,
  a group read that much keener than everyone really was 26 times in 27, 30
  in 37 and 50 in 67 (evals/products/strength.ts). An idea with no corner of
  its own is competing for the people who like everything. A corner no keener
  on its idea than everyone is a group cold on the whole list: `explore_next`
  lists it as not followed, and follows no faint corner.
- **Nobody serves them.** Large groups, of one fact or two together, at
  least a tenth keener than average on the way people do it now (the version
  marked `now: true`), where every offer does worse than its own average:
  people who want the job done whom nothing on the list suits. Each comes
  with what else marks those people, which is what you need to write an
  idea for them. It is read only when one version is how people do it now
  without buying anything (by hand, a spreadsheet, a free template, asking
  someone). Going without is not one: people who would go without do not
  want the job done. Without such a version a group cold on every offer is
  most often a group that wants none of it (older, out of work, unwell, cold
  on whatever is put to them), so the reading says it was not read. "None"
  is a finding: where people do it themselves most, the offers do as well or
  better.
- **Who the offers leave out.** Large groups who do it themselves at least
  as often as most (the version marked now at its average or above) but are
  cold on every offer (each under 0.9 of its own average). Not a gap the
  offers can fill as they are: what their form costs, which the owner may
  not have thought of (an app leaves out people who do it by hand and use no
  apps). A group nobody serves is not given here again.

Then go round again: write ideas for the groups nobody serves, as those
people would meet them (it need not be an app), add them to the ideas list, run
again. Stop when new ideas stop reaching new people.

## Groups the owner names

When the owner asks which of their groups to go after first (students or
young families, landlords or tenants), answer about those groups:

1. **Count each in the owner's place** with `people`, and say how rough a
   small place's count is.
2. **Scan their offer as they wrote it beside two or more other ways to
   offer it** (another price, another way to reach people, another group's
   version), so each group's lean is read against something.
3. **Keep each group as a segment** with `segment_add`: their conditions in
   `among`, the scan in `from_scan`, their offer in `idea`. Each gets its size
   (counted) and how much more or less it favours the offer (simulated).
4. **Split each** with `corner_split`: which of them lean in and which do not
   (students off campus without a washer against students in halls). A group
   is never one imagined customer.
5. **Set them side by side** with `segments`, as findings: the choice is the
   owner's, and nxk never makes it. The test that tells them apart puts the same offer to both groups,
   the same way and for the same spend, and records take-up in each with
   `outcome_record`. A test on one group cannot say which group is better.

## Explore: let the leads say where to dig

After the first scan, `explore_next` takes over the order. It lays out every
lead (each offer's corner, and the big groups no offer serves) with the
customer's side and the business's, and names one move:

- **costs nothing**: keep a corner as a segment, split it (`corner_split`: who inside it
  is keenest, from the saved answers, nothing sent), look up its rivals;
- **owner**: only a budget for scans, when none is set;
- **paid**: new offers for the biggest group nothing serves, within the
  budget. It stops offering these after two rounds that found no strong corner;
- **report**: when nothing is left worth doing, the findings (guide topic
  research). The owner's margin and target, when they gave them, turn each
  group's size into how many must buy; when they did not, the findings name
  them as what would sharpen the answer.

Sizes are of adults nationwide. When the question is about one area (a trade,
a shop, a local service), give `research_start` its `where` (place
conditions, such as `region=georgia`): every lead is then counted there too,
and the customers the owner needs are set against the group in their area. An
offer sold to businesses is not set against adults at all: nxk counts people,
and adults who run or buy for a business are not businesses. Its customers are
set against a count of that kind of business: firms counted with `people`,
unit `firms`, or a published count, sourced.

Make the move, then call `explore_next` again: it re-reads everything, so a
lead that a split, a rival or a measured result changed is ranked again. Once a
move is made, it ends with a line for the reply on what the moves found: whether
the group that led at the first look still leads. When
it says the owner must answer (a budget), ask them (`owner_ask`) and wait.
Whatever the leads, the floor does not move: no offer that works by misleading
or trapping people.

## What to tell the owner

The findings, as guide topic research says under "What you return". For each
strong lead: who it is for, how many of them there are, and what it would take
to pay its way. Keep the whole reply under about 400 words (guide topic
reply): a line or two a lead.

- **Who and how many are counted.** "Self-employed people in skilled trades,
  about 1.3 million adults" comes from generated people fitted to official
  statistics. Label it counted.
- **How keen they are is simulated.** It is one model's view. Label it
  simulated, and do not turn it into a number of customers.
- **Customers needed is arithmetic.** Work out how many paying customers the
  idea needs from the owner's own costs and price with
  the `sums` tool (see the sums guide), and set that beside the counted size of the
  corner. An idea that needs one in three of a corner is a different
  proposition from one that needs one in three hundred.
- **Then real people.** Name who the owner should go and talk to first. A
  corner is a place to look, not proof of demand.
- **The choice is theirs.** The findings rank leads by strength and size;
  they never pick one for the owner.

## What it cannot do

- **Rank ideas by popularity.** When the same forty ideas were asked about in
  two wordings, the order of ideas by total takers changed (rank agreement
  0.49). Which people preferred which idea did not.
- **Set a price or forecast revenue.** The decision model barely reacts to
  price: nearly doubling it moved the answer by under a tenth.
- **Say how many would buy.** Differences between groups are rough: on 32
  products whose users are published they came out at two-thirds to 1.3
  times their published size, by the fields asked about, and the level
  itself moves with how the request is laid out.
- **See a fact nobody named.** Name more fields when a group you care about
  is missing.

## How far it has been checked

- **Corners repeat.** Asked again with reworded options, eleven of eleven
  corners stood out again and two controls did not. Asked with a different
  question, all sixteen sharp corners were still sharp, fourteen as the same
  or mostly the same people.
- **A smaller scan finds the strong ones.** Against asking every idea about
  every field in both option orders, this mode's corners shown at x2 or more
  were the same or mostly the same people 19 times in 22. Fainter ones
  matched about two times in three. That was with one damping for every
  scan, which read this mode's corners smaller than they are now.
- **Unserved groups need the same questions for every idea.** When each idea
  was asked only about its own facts, the groups named as unserved were ones
  an idea did serve. Asked about the same fields, the groups matched the
  full scan's.
- **Direction is usually right for things that exist.** For 32 existing
  products described without their names, the same kind of scan put the
  group that really uses a thing more above the one that uses it less in 87%
  to 91% of 622 published comparisons.
- **Not checked:** any idea that does not exist yet, since there is nothing
  to check it against; any area but UK household admin; the United States;
  what happens when a builder follows a corner to real customers.
