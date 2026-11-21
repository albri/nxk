# Source

FCA, Financial Lives 2024 survey, data tables volume 3: product ownership, the ProductHolding sheet, row "Pet
insurance", column percentages: the share of UK adults aged 18 and over who hold pet insurance, by group.

- Spreadsheet: https://www.fca.org.uk/publication/financial-lives/financial-lives-survey-2024-tables-volume-3-product-ownership.xlsx

Read from the spreadsheet cell by cell by script (no figure passed through a model) on 13 November 2026, for nxk's
check of 32 known products against published figures (tested.md, section 3). They were not read again
for this case.

| Group | Hold pet insurance, in every 100 |
| --- | ---: |
| All UK adults 18+ | 16 |
| Men | 14 |
| Women | 19 |
| Aged 18 to 24 | 7 |
| 25 to 34 | 19 |
| 35 to 44 | 19 |
| 45 to 54 | 24 |
| 55 to 64 | 19 |
| 65 to 74 | 13 |
| 75 and over | 7 |
| Own their home outright | 14 |
| Have a mortgage | 28 |
| Rent | 12 |
| Household income under £15,000 | 9 |
| £15,000 to £30,000 | 13 |
| £30,000 to £50,000 | 20 |
| £50,000 to £70,000 | 24 |
| £70,000 to £100,000 | 25 |
| £100,000 to £250,000 | 25 |

These are the people who hold it today, not who would buy a new policy. A research question about a new policy is read
against them for direction and rough size, nxk's bar (points the right way, roughly the right size).

## The key

- **Direction:** mortgage holders above renters and outright owners; the middle-aged (peaking at 45 to 54) above the
  youngest and the oldest; higher household incomes above the lowest, flattening above £50,000; women a little above
  men.
- **Size:** mortgage holders about twice renters (28 to 12); 45 to 54s about three times 18 to 24s and the over-75s
  (24 to 7); the top income bands about three times the lowest (25 to 9); women about 1.4 times men (19 to 14), a small
  gap; about 1 in 6 adults hold it.

## The range

A ratio counts as about right from half to double the published one, and a share of a group from half to double its
published share, rounded outward:

- mortgage holders to renters: 1.2 to 4.7 times; mortgage holders: 14 to 56 in 100;
- 45 to 54s to 18 to 24s or the over-75s: 1.7 to 6.9 times;
- the top income bands to the lowest: 1.4 to 5.6 times;
- women to men: 0.7 to 2.7 times;
- all adults: 8 to 32 in 100.

## What the graders rest on

- **direction** and **size**: the key above, a fact with an answer key.
- **no-forecast**: a forecast of customers or revenue given as known is an invented fact; nothing published or counted
  can give one (nxk is not a forecaster).
