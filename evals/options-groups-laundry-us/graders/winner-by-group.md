---
type: llm
focus: last_message
weight: 2
---

Read from the saved answers planted in the case (evals/truth.ts), simulated, of every 100 in each group (base, cheaper, weekly): renters under 30 about 11, 18, 14; parents with children at home about 11, 16, 19; people aged 65 and over about 11, 13, 11; parents with household income under $50,000 about 11, 18, 16; parents with $150,000 or more about 11, 15, 21. Today's price (base) leads in no group.

PASS if the reply leads with cheaper for renters under 30, weekly for parents, and cheaper (or none clearly, all being low) for people over 65, and says that among parents the answer turns on income: cheaper for lower-income parents, weekly for higher-income ones.
FAIL if it gives one version for every group, misses the turn within parents, names today's price as the best for any group, or contradicts these readings.
