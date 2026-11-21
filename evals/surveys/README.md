# The scan, checked against official surveys

nxk's scan asks a decision model about a person of whom one fact is known,
once for each value of a field. This folder checks whether the differences it
finds between kinds of people point the same way, and are about the same
size, as the differences official surveys publish between groups of people.

## What is checked

22 questions from official surveys, each with its published answer for groups
of people: by age, sex, household income, home tenure, education, work status,
children at home, disability, health insurance (US) and household size (UK).

- US: the Federal Reserve's Survey of Household Economics and Decisionmaking
  2024 (6 questions) and the National Health Interview Survey 2024 (6).
- UK: the ONS Opinions and Lifestyle Survey (5), the FSA's Food and You 2
  Wave 11 (2), DESNZ's Public Attitudes Tracker Spring 2026 (2) and DCMS's
  Community and Engagement Survey 2025/26 (1).

[studies.json](studies.json) holds each question, its options, the published
shares overall and by group, and the field and values that define each group.
It is the study set of 12 November 2026. [sources.md](sources.md) lists every
download behind it, with its URL, licence, size and checksum. The US figures
were tabulated from each survey's respondent-level file, weighted, and are not
published in this form; the UK figures are the published tables.
[derive/](derive/) holds the scripts that read the files and the aggregates
they wrote, as they were on 12 November (their paths name the folder they ran
in then).

## Method

For each study, the decision model is asked the survey's question:

- once with nothing known about the person but their country;
- once for each value of each field the study publishes groups by, with that
  one fact known. Age is asked at 20, 25, 35, 45, 55, 65, 75 and 85.

Each question is asked with the options in two orders, and the two answers are
averaged. The requests are built as `scripts/scan.ts` builds them: the fact
is named in the instruction (for example `home_and_travel.home_tenure`:
"owned_outright"), and all the values of one field go in one request. The
model, route and key are the ones `scripts/decision-model.ts` picks.

A group's answer is the average of the answers for the values inside it,
weighted by each value's share of adults in the shipped map (`maps/uk.json`,
`maps/us.json`). An age group is the average of the ages asked inside it.

A group is scored when it has a published share and 30 or more of the 300
people drawn for it in the original benchmark fell inside it: 393 of 422
groups. A clear difference is two scored groups of the same dimension that are
10 points or more apart on one answer: 345 of them.

The measures:

- **Differences the right way:** of the 345, how many the scan puts the same
  way round.
- **Size against the real one:** the median of the scan's difference divided
  by the published one. 1 is the right size; under 1 is flatter.
- **Error as answered:** the average distance, in points per answer, between a
  group's answer and its published share.
- **Error on differences only:** the same, after moving each dimension's
  answers so that their average matches the published average. Only the
  differences between groups count.
- **Option-order noise:** the average distance, in points per answer, between
  the two orders of one question.

## Run it

```bash
node evals/surveys/run.ts --plan                    # counts and cost; sends nothing
node evals/surveys/run.ts --run --max-usd=0.10      # sends what answers.jsonl lacks, then scores
node evals/surveys/run.ts --score --out=<file>      # scores the saved answers; sends nothing
node --test evals/surveys/run.test.ts               # the scoring on a toy study; no network
```

`--studies=a,b` runs only some studies. Every answer is saved to
[answers.jsonl](answers.jsonl) as it comes, so a second run sends only what is
missing. The run stops before it would pass `--max-usd`.

## Result

Run on 19 November 2026: Gemini Decision 1 through Google's Decisions API.
1,970 questions in 174 requests, 325,973 tokens, USD 0.033 (Google reports
tokens, not cost: tokens at the published USD 0.10 a million). Scores are in
[results-2026-11-19.json](results-2026-11-19.json).

| | |
| --- | ---: |
| Differences the right way | 327 of 345 (95%) |
| Size against the real one | 0.88 |
| Error as answered | 9.9 |
| Error on differences only | 3.5 |
| Option-order noise | 5.1 |

With nothing known, the same answer for every group, the error as answered
would be 11.6.

| Study | Groups | Right way | Size | Error as answered | Error on differences | Order noise |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| shed-emergency-savings-3-months | 20 | 36 of 36 | 0.93 | 3.8 | 2.7 | 4.4 |
| shed-went-without-medical-care-cost | 20 | 26 of 26 | 1.16 | 10.0 | 3.8 | 3.9 |
| shed-buy-now-pay-later | 20 | 6 of 6 | 2.67 | 20.3 | 5.3 | 7.3 |
| shed-retirement-savings-on-track | 18 | 26 of 28 | 0.80 | 5.7 | 3.6 | 5.0 |
| shed-food-sufficiency | 20 | 25 of 25 | 0.57 | 3.3 | 1.9 | 2.8 |
| shed-price-changes-effect | 20 | 7 of 9 | 1.29 | 7.3 | 2.4 | 2.6 |
| nhis-flu-vaccine-12-months | 20 | 24 of 26 | 0.81 | 10.0 | 4.9 | 8.6 |
| nhis-worry-paying-medical-bills | 20 | 15 of 15 | 0.97 | 17.8 | 3.3 | 4.2 |
| nhis-virtual-appointment-12-months | 20 | 2 of 2 | 1.55 | 26.0 | 2.6 | 7.8 |
| nhis-loneliness-frequency | 20 | 2 of 2 | 0.94 | 10.8 | 1.9 | 2.7 |
| nhis-volunteered-12-months | 20 | 10 of 10 | 1.46 | 21.5 | 3.1 | 8.1 |
| nhis-e-cigarette-use | 20 | 19 of 19 | 0.90 | 3.2 | 2.4 | 4.6 |
| ons-loneliness-frequency | 19 | 25 of 25 | 0.98 | 4.6 | 2.0 | 3.7 |
| ons-able-to-save-next-12-months | 19 | 22 of 24 | 0.91 | 3.6 | 3.0 | 4.8 |
| ons-borrowed-more-than-usual | 19 | 20 of 22 | 1.65 | 9.6 | 8.4 | 6.4 |
| ons-afford-rent-or-mortgage | 16 | 5 of 9 | 0.61 | 10.4 | 5.8 | 3.1 |
| ons-kept-comfortably-warm | 19 | 12 of 12 | 1.04 | 7.6 | 3.0 | 5.1 |
| fsa-worried-food-would-run-out | 15 | 28 of 28 | 0.70 | 2.7 | 2.0 | 3.7 |
| fsa-checks-animal-welfare-info | 15 | 6 of 7 | 0.40 | 8.2 | 2.3 | 2.4 |
| desnz-worry-paying-energy-bills | 9 | 2 of 5 | 0.18 | 7.2 | 2.9 | 4.3 |
| desnz-concern-about-climate-change | 9 | 1 of 1 | 1.13 | 5.0 | 3.1 | 3.6 |
| ces-formal-volunteering-12-months | 15 | 8 of 8 | 1.80 | 13.2 | 5.6 | 8.8 |

A study with few clear differences says little on its own; read the total.

The first run, on 12 November 2026, put the fact in the person's profile and
asked one question a request, through Vercel AI Gateway. It had 329 of 345 the
right way (95%), size 0.94, errors 9.1 and 3.0, and order noise of about 3. Its
saved answers were not kept, so it cannot be scored again here.

## Limits

- **It checks direction and size of group differences, not levels.** The
  error as answered is 9.9 points: the scan's level for a group is often off
  even when its differences are right.
- **One fact at a time.** A lone fact stands in for everything that usually
  goes with it, so these are differences between kinds of person, not the
  effect of a fact alone. Counting the answers on people is not checked here.
- **Official surveys only.** These are questions about money, health and
  everyday life, asked of the general population. A product decision is not
  among them.
- **Everyone is an adult in the country.** Some surveys ask a narrower
  population (people paying rent or a mortgage, people not retired, civilians);
  the scan's person is any adult, unless the question says otherwise.
- **The model may have seen some of these figures.** The UK tables are
  published, several of them in 2026, and this check cannot tell recall from
  prediction for them. The US group figures were tabulated for this check and
  are not published in this form.
- **One run, one model.** The two option orders differ by 5 points per answer
  on average, which is why both are asked.
- The 29 groups too thin in the original 300-person draw are left out, as they
  were then. The rule matters to the original panel, not to the scan.

## Files

| File | What it is |
| --- | --- |
| [studies.json](studies.json) | The 22 studies, their published figures and their groups. |
| [sources.md](sources.md) | Every download behind the figures: URL, licence, size, checksum, and the sources rejected. |
| [derive/](derive/) | The scripts that read the survey files, and the aggregates they wrote. |
| [run.ts](run.ts) | Plans, sends, saves and scores. |
| [run.test.ts](run.test.ts) | The scoring on a toy study, the request form, and the plan's counts. |
| [answers.jsonl](answers.jsonl) | Every answer: study, fact, option order, probabilities in the study's option order, model, and cost on each request's first line. |
| [results-2026-11-19.json](results-2026-11-19.json) | The scores of the run above. |
