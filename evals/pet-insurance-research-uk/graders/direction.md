---
type: llm
focus: last_message
weight: 2
---

The answer key, from the FCA's Financial Lives 2024 survey, data tables volume 3 (product ownership), the share of UK adults aged 18 and over who hold pet insurance (https://www.fca.org.uk/publication/financial-lives/financial-lives-survey-2024-tables-volume-3-product-ownership.xlsx): by tenure, mortgage holders 28 in 100, outright owners 14, renters 12; by age, 18 to 24 7, 25 to 34 19, 35 to 44 19, 45 to 54 24, 55 to 64 19, 65 to 74 13, 75 and over 7; by household income, under £15,000 9, £15,000 to £30,000 13, £30,000 to £50,000 20, £50,000 to £70,000 24, £70,000 to £100,000 25, £100,000 to £250,000 25; women 19, men 14. What the reply says about how keen a group is (simulated, a model's view, or its own judgement) is read as which way that group leans, and checked against these.

PASS if, on at least two of these, the reply has the published direction: mortgage holders (or homeowners) above renters; the middle-aged above under-25s or the over-75s; higher household incomes above the lowest; women above men. And it has none of them the other way round.
FAIL if it has any of them the other way round (for example under-25s, renters, the over-75s or the lowest incomes as the keenest, or outright owners well above mortgage holders), or gives the direction of fewer than two of them.
