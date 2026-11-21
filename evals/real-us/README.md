# The counts, checked against real people

nxk's people are made up. As a group they are meant to match government
statistics, so a count on them should come out close to the same count on real
adults. This folder checks that once, for the US, on 23 counts.

## What was compared

The made-up people are the 200,000 US adults nxk ships in
`maps/us-people.bin.gz`. PersonaGen generated them; this check used the file
built on 2026-11-16.

The real people are 200,000 US adults from the
[American Community Survey](https://www.census.gov/programs-surveys/acs/microdata.html)
(ACS) 2024 1-year Public Use Microdata Sample, published by the US Census
Bureau. Each adult in the survey has a weight: the number of adults they stand
for. The 200,000 were drawn from the survey's 2.8 million adults, each with a
chance in proportion to their weight, so together they stand for all adults,
as the made-up people do.

Both groups are adults aged 18 and over in the 50 states and DC. Like the
made-up people, the real ones leave out people who are not Hispanic and gave
"some other race" as their only race (fewer than 1 in 100 adults).

The real answers were put into nxk's field names and codes, in the same file
format. Then each count was run with nxk's own command,
`node scripts/people.ts count` or `reach`, once on each file.

The 23 counts are in [counts.txt](counts.txt), each with why it is there. They
are the groups nxk counts when a choice leaves people out (people who speak
little English, people with a disability, people free during the working day,
renters, people with no car, low incomes, non-citizens, older people, parents,
people who live alone), the groups the US test cases rely on, five counts of
two facts at once, and two counts of requirements applied one after another.
Each count uses only facts the ACS records in the same way: a person's own
facts against the person's own answers, and household facts (tenure,
vehicles, household income and size) against the household's.

The rule for a match was written down before the run: the made-up share is
within 2 points of the real share, or, for a real share under 10 in 100, the
made-up share divided by the real one is between 0.8 and 1.25. With 200,000
people on each side, chance alone moves a gap among all adults by up to about
a third of a point, and by a little more within a smaller group such as
renters.

## Results

Shares are in every 100 adults, or in every 100 renters for the last line.
Gaps are made-up minus real, in points, worked out before rounding.

| Count | Made-up | Real | Gap | Verdict |
| --- | ---: | ---: | ---: | --- |
| Speaks English not well or not at all | 5.2 | 5.2 | -0.1 | match |
| Speaks Spanish at home | 13.9 | 13.8 | 0.0 | match |
| Has difficulty hearing, seeing, remembering, walking, dressing or doing errands alone | 16.3 | 16.6 | -0.2 | match |
| Not in full-time work (works part time, or does not work) | 50.0 | 50.1 | -0.1 | match |
| Works from home | 8.4 | 8.2 | +0.2 | match |
| Lives in a rented home | 28.3 | 28.5 | -0.2 | match |
| No car, van or truck in the household | 9.4 | 9.4 | 0.0 | match |
| Household income under $25,000 a year | 12.5 | 12.2 | +0.3 | match |
| Not a US citizen | 8.2 | 8.2 | 0.0 | match |
| Aged 65 or over | 22.9 | 22.9 | 0.0 | match |
| Has their own children under 18 at home | 23.6 | 23.7 | -0.1 | match |
| Lives in a lone-parent household with the parent's own children under 18 | 4.1 | 4.1 | -0.1 | match |
| Lives alone | 17.4 | 17.4 | 0.0 | match |
| Self-employed | 6.2 | 6.3 | -0.1 | match |
| Out of work and looking for work | 2.9 | 2.8 | 0.0 | match |
| Enrolled in school or college | 9.1 | 9.2 | -0.1 | match |
| Aged 18 to 29 and lives in a rented home | 8.9 | 8.8 | +0.1 | match |
| Drives alone to work, and the household has one vehicle | 8.6 | 8.4 | +0.2 | match |
| Aged 65 or over and lives alone | 6.6 | 6.6 | +0.1 | match |
| Has their own children under 18 at home, and household income under $50,000 | 3.8 | 4.0 | -0.2 | match |
| Aged 18 to 24 and enrolled in school or college | 5.6 | 5.6 | 0.0 | match |
| Of all adults, has a vehicle in the household, then also speaks English well or better | 86.1 | 86.1 | 0.0 | match |
| Of renters, household income $50,000 or more (about three times a $1,400 monthly rent), then also an employee who gets pay stubs | 46.2 | 46.9 | -0.7 | match |

All 23 match. [results-2026-11-17.json](results-2026-11-17.json) has every
share, and for the two lines of requirements, the share left after each step.

## Where the made-up people are off

On these 23 counts, by 0.7 points at most. Among all adults no gap is over 0.3
points, which is about what chance gives with 200,000 people on each side. The
largest gap is in the rental application: of renters, 46.2 in 100 made-up
people have a household income of $50,000 or more and work for an employer,
against 46.9 in 100 real ones.

Two gaps lean the way counts.txt said they would before the run. The ACS asks
how a person got to work in the week of the survey, and a worker who was away
from work that week has no answer. So real shares of travel to work run a
little low, and the made-up people are 0.2 points higher on working from home
and on driving alone from a one-car home.

## What a match here means

Every fact compared here is one PersonaGen fits to official statistics, and
for the US most of them come from this same survey. So the check shows that
those figures hold in the 200,000 people nxk ships, counted the way nxk counts,
for single facts, for pairs and for requirements one after another. It does not
test facts PersonaGen takes from other surveys or estimates itself. Those are
more likely to be off, and the ACS does not ask about them.

## What this cannot see

- The UK. Real UK records at this level need a registration that this project
  does not use.
- Facts the ACS does not ask about: attitudes, interests, devices, money
  worries, driving licences, shift work and each person's own internet use.
  Internet use is known to be off: about 15 in 100 made-up US adults do not go
  online, against about 5 in 100 in the Pew Research Center's 2024 figures.
  PersonaGen is fixing this.
- The ACS asks about internet access and computers in the home. The made-up
  people hold each person's own internet use and devices instead, which is a
  different fact, so the two are not compared.
- Combinations beyond the ones listed. These 23 can match while another
  combination is off.
- Whether whole people hang together. A count of one or two facts can match
  while one person's full set of facts reads oddly.
- More than one moment: this is one run, on one survey year.

## How to rerun

The real records are not in this repository, and neither is the code that
draws them. To run the check on another file of real US adults:

```bash
node evals/real-us/run.ts --real=<people file>
```

The file holds real adults in nxk's people-file format: the fields of
`maps/us.json`, packed as `scripts/population.ts` packs them, or JSON as
`scripts/pull.ts` writes it. The command runs every count in `counts.txt` on
both files, prints the table and writes the shares to `results-<date>.json`.
`--made-up=<file>` compares another file of made-up people.

The check is run again whenever nxk's US people are rebuilt. The ACS files are
downloaded, used and deleted on a separate machine, and only the shares come
back.
