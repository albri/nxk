# The scan, checked against real products

nxk's scan says which groups are more likely to want something. This folder
checks it on 32 products and activities that already exist, whose users
regulators publish by group. Each product is described without its name and
scanned, and every pair of published groups with a clear gap between them is
scored: right when the scan puts the group that uses the thing more above the
group that uses it less.

## What is checked

32 products and activities, in [products.json](products.json), each with a
description of two or three sentences that names no brand:

- **Ofcom**, Adults' Media Literacy 2025 data tables: eight social apps and AI
  assistants, by seven age bands, sex and four social grades.
- **English Housing Survey** 2023 to 2024, low-carbon fact sheet: electric or
  hybrid cars, solar panels and heat pumps, by tenure and by rural or urban
  area.
- **FCA**, Financial Lives 2022 key findings: paying by phone, by age and sex.
- **Gambling Commission**, Gambling Survey for Great Britain 2024 annual data
  tables, Table B.9: eight gambling activities in the past four weeks, by sex
  and seven age bands.
- **FCA**, Financial Lives 2024 data tables, volume 3: eleven financial
  products held, by sex, age, tenure and household income.

Streaming video, streamed music, console games and smoking were left out: the
made-up people already carry them as facts.

Each published group is given with its figure and as the same group of
made-up people (`cond`): Ofcom's 16 to 24s are `age_years=18..24`, and each of
the FCA's income bands is the people's bands that fall wholly inside it. The
gambling and Financial Lives 2024 figures were read from the regulators'
spreadsheets cell by cell, and the 104 social-app figures checked against
Ofcom's tables, by the scripts in [derive/](derive/). The scripts are as they
were on 13 November 2026, reading the map from this repository.

A **clear pair** is two groups in one breakdown of one product whose published
figures differ by 3 points or more, one at least 1.25 times the other. Gambling
and finance (`batch` 2) have many low figures, so there two figures both under
10 also count when one is at least 1.5 times the other and a point or more
above it. Each rule was fixed before its batch was scanned. That gives 622
pairs: 435 by age, 113 by household income, 32 by tenure, 24 by social grade,
15 by sex and 3 by rural or urban.

## Method

Each product is one version of a scan spec,
[specs/year-on-offer.json](specs/year-on-offer.json), in the words nxk's scans
use: "This has been on offer where you live for the past year: …", then
"Which of these is true of you today?", following the answer "I have it or use
it". `run.test.ts` checks that this is what nxk would send for these
products.

The scan is nxk's own (`scripts/scan.ts`), asked about the six facts the
published groups are defined by: age, sex, social grade, tenure, household
income and size of place. The decision model is asked about a person of whom
one fact is known, once for each value, and each of the 200,000 made-up UK
adults nxk ships is given an answer built from the facts they hold. A group's
figure is the average of its people. A pair is right when the group with the
higher published figure has the higher figure in the scan.

## Result

On 19 November 2026, with Google's decision model, `gemini-decision-1`,
through Google's Decisions API: **559 of 622 pairs right (90%)**, for USD
0.022.

| Breakdown | Right |
| --- | ---: |
| Age | 379 of 435 |
| Household income | 112 of 113 |
| Tenure | 28 of 32 |
| Social grade | 23 of 24 |
| Sex | 15 of 15 |
| Rural or urban | 2 of 3 |

Every pair is in
[results/2026-11-19-year-on-offer-google.json](results/2026-11-19-year-on-offer-google.json),
and every answer the decision model gave is in [answers/](answers/).

**Asked again, it holds.** A run on 14 November, on the 20,000 made-up adults
nxk had then, gave the same verdict on 616 of the 622 pairs.

**Why nxk asks it this way.** Told "You see an advert for …" and asked what
they would do, the same model leans to the young: it put 533 pairs right
(86%), lottery draws 2 of 14 and premium bonds 18 of 30. Asked where a person
stands after a year on offer, lottery draws are 13 of 14 and premium bonds 30
of 30. ([specs/advert.json](specs/advert.json); that run asked about every
fact.)

**Where it is wrong.** The football pools (1 of 15): the published figures say
under-35s play them most, and the decision model takes them for an older
person's game. Catalogue credit is 16 of 27, and the stocks and shares ISA 27
of 36.

## Files

- [products.json](products.json): the 32 products, their sources and links,
  and each group's published figure and condition.
- [specs/](specs/): nxk's wording, and the advert wording it replaced.
- [results/](results/): one file a run, with each of the 622 pairs, its two
  published figures and the scan's.
- [answers/](answers/): the decision model's 1,088 answers, one file a
  product.
- [derive/](derive/): the scripts that read the published tables and wrote the
  products, what they read out (`ofcom.json`, `batch-2-figures.json`), and how
  to run them.
- `run.ts` and `run.test.ts`: the recount, the rescore, a new run, and
  their tests.

## Run it

```bash
node evals/products/run.ts --score                               # scores the saved answers again on the people; sends nothing
node evals/products/run.ts --show=2026-11-19-year-on-offer-google  # by product, and the pairs it got wrong
node evals/products/run.ts                                       # recounts each saved run and checks it against products.json
node evals/products/run.ts --plan                                # the requests and cost of a new run; sends nothing
node evals/products/run.ts --run --max-usd=0.05                  # a new run, then its score
node --test evals/products/run.test.ts                           # the rules, the saved runs, the answers and the spec; no network
```

The rescore builds the pairs again from the saved answers and checks they are
the ones saved; it needs no key. A new run is nxk's scan as it ships, on the
decision model, route and key nxk is set up with: 224 requests, about 2 US
cents. Its answers are saved in `answers/`, so a second run sends only what is
missing.
