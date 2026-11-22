# The evidence

nxk's figures come from two places: counts on 200,000 made-up adults a
country, built by [PersonaGen](https://personagen.dev) to match official
statistics, and scans through a decision model. Each is checked here against
figures published by statistics offices and regulators.

- **The people match the census.** All 23 US counts came within 2 points of
  200,000 real adults in the Census Bureau's 2024 survey, the largest gap 0.7
  points (section 1).
- **The decision model knows who leans which way.** On 22 official surveys,
  asked one fact at a time, it put 327 of 345 published differences between
  groups the right way round: 95% (section 2).
- **Scans hold up on real products.** On 32 existing products and 622
  published differences, the scan put the group that uses each more ahead in
  559: 90%. A group read twice as keen as everyone or more was keener in the
  published figures 26 times in 27, one read 1.5 to 2 times 30 in 37
  (section 3).
- **What a scan finds holds when it is asked again.** With the ideas
  reworded, 11 of 11 groups stood out again, and with a different question,
  all 16 that stood out sharply (section 4).

## Words this page uses

- A **count** is how many of the made-up people meet some conditions, given as
  "N in 100", with about how many real adults it stands for.
- A **decision model** is an AI model that, given a question and its possible
  answers, says how likely each answer is, and writes no text.
- A **scan** asks the decision model about one fact at a time, then gives each
  made-up person an answer built from all their facts. It says which groups
  are more likely to want something.

## 1. The people match the census

On 17 November 2026, 23 of nxk's counts were run twice with nxk's own
command. One run used the 200,000 made-up US adults that nxk ships. The other
used 200,000 real US adults from the Census Bureau's American Community Survey
2024, each drawn with a chance in proportion to their survey weight. The counts
were the groups nxk counts when a choice leaves people out, five pairs of
facts, and two lists of requirements applied one after another. The bar for a
match was set before the run: within 2 points.

All 23 matched. The largest gap was 0.7 points, in a count among renters.
Among all adults, no gap was over 0.3 points. PersonaGen fits these facts to
the same survey, so this checks that the fit holds, count by count and in
combination, in the people nxk ships.

[evals/real-us/](evals/real-us/) has the counts, the shares and how to run the
check again.

## 2. The decision model knows who leans which way

Twenty-two questions from official surveys in the UK and the US, from the
Federal Reserve, the US National Center for Health Statistics, the ONS, the
Food Standards Agency and others, each with its answer published by group: by
age, sex, household income, home, education, work, children, disability and
health insurance. That gives 393 groups and 345 clear differences between them
(10 points or more on one answer, within one dimension). The decision model
was asked each question about a person of whom one fact is known, once for
each value, in two option orders, as a scan asks.

On 19 November 2026, in the request form nxk's scans send, it put 327 of the
345 differences the right way round (95%), at 0.88 of their real size, for 3
US cents. A run on 12 November, in an earlier form, put 329 the right way
round, at 0.94 of their size. The US group figures were tabulated from each
survey's respondent-level file for this check and are published nowhere in
this form.

[evals/surveys/](evals/surveys/) has the questions, their sources and
checksums, every answer, and how to run the check again.

## 3. Scans hold up on real products

Thirty-two products and activities that already exist, from social apps and
AI assistants to heat pumps, lottery draws and premium bonds, were described
without their names. Ofcom, the Gambling Commission, the FCA and the English
Housing Survey publish who really uses each, by age, sex, social grade, home
tenure, household income or size of place: 622 pairs of groups with a clear
gap between them (3 points or more, and one figure at least a quarter above
the other).

Each was scanned in nxk's own words, "This has been on offer where you live
for the past year", asking about the six facts the published groups are
defined by, and read on the 200,000 made-up UK adults nxk ships. On 19
November 2026, through Google, the scan put the group that uses a thing more
above the group that uses it less in 559 of the 622 pairs (90%), for 2 US
cents. By age it was 379 of 435, by household income 112 of 113, and by sex 15
of 15. A run on 14 November, on the 20,000 made-up adults nxk had then, gave
the same verdict on 616 of the 622.

The wording matters, and this check is why nxk's scans use this one. Told
"You see an advert for …" and asked what they would do, the same model leaned
to the young and put 533 pairs the right way (86%). Asked where a person stands after
a year on offer, it put lottery draws right in 13 of 14 pairs, not 2, and
premium bonds in 30 of 30, not 18.

**How keen a reading must be.** On 21 November 2026 the same products were
scanned asking about every fact of the map, for 60 US cents, and each
published group in a breakdown that covers everyone (age, sex, social grade,
tenure: 335 groups) was read as nxk reads a lead, its odds against
everyone's. A group read twice as keen or more was keener in the published
figures 26 times in 27. One read 1.5 to 2 times as keen was 30 times in 37,
one read 1.15 to 1.5 times 50 in 67, and one read keener by less than that 34
in 47. So nxk reports twice as keen as a lead, 1.5 to 2 times as a lead to
test, and nothing fainter.

The same answers showed why that bar had meant different things in different
scans. A person's answer adds up every fact asked about, and with one damping
for every scan, a difference read from the ten general facts and six named
came out at two-fifths of its published size, so a cheaper scan never reached
1.5 times. nxk now damps the sum by how many facts were asked, and the same
difference reads at 1.2 times its published size from those sixteen facts and
1.3 times from every one.

[evals/products/](evals/products/) has the products and their sources, every
pair and every answer, and how to score it again or run the check afresh.

## 4. What a scan finds holds when it is asked again

A scan of several ideas names, for each, the group that prefers it most to the
others. Asked again with the ideas reworded, 11 of 11 of those groups stood
out again, and neither of the two controls did. Asked a
different question, all 16 groups that stood out sharply still did. Against
asking every idea about every fact, the strong groups were the same, or mostly
the same, people 19 times in 22.

## 5. How nxk itself is tested

- **Every figure is traced.** Every figure nxk writes carries a label
  (counted, computed, simulated, measured, given, sourced, guess), and every
  line a tool prints is a record in `.nxk/log.jsonl`. `note_check` traces each
  counted, computed, simulated or measured figure in a reply to the record of
  the tool that printed it, and `source_check` opens each linked page and
  checks that the words quoted with a figure are on it. Run on 14 linked
  figures from saved replies, it refused the 4 that pointed to the wrong page,
  and passed every true figure once its words were copied from the right one.
- **The tools are tested.** About 290 tests of the scripts, the server and the
  hooks run on every change, with local servers standing in for the decision
  model and PersonaGen.
- **The commands are tested.** [evals/](evals/README.md) sends each of nxk's
  commands in real Claude Code sessions and grades the result against checks
  written before the run. On 19 November 2026, both second-look cases and the
  panel case scored 1.00, and research read a scan the owner had saved without
  a serious miss in all five cases.
