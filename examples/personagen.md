# One actual PersonaGen profile

> **Duwayne is 39 and lives near Petersburg, Virginia. He drives a semi-truck
> full-time for a transport company, earns $100k–$150k, is married with two
> children under 12, owns his home with a mortgage and has a dog or cat and a
> fish.**

No LLM wrote a biography around him. These fields came from one PersonaGen 4.0
response, `GET /us/persona?seed=nxk-example-us-28`. The same seed and generator
version return the same person.

| Part of his life | What PersonaGen generated |
| --- | --- |
| Place | Suburban area of a large metropolitan area in Virginia (`place`) |
| Household | Married; couple household with two dependent children aged 5 to 11; one adult in paid work (`household_and_family`) |
| Home | Owns a detached house with a garden on a mortgage of $300k–$500k; two vehicles; drives alone to work (`home_and_travel`) |
| Work | Heavy and tractor-trailer truck driver, 35 to 48 hours, regular daytime schedule, no fixed place of work, experienced, 1 to 4 years with a 100 to 499 person employer (`work`) |
| Money | $100k–$150k personal and household income; $25k–$50k of student loans; would borrow or sell something to cover an unexpected $400 expense (`money`) |
| Education | Some college, no degree; parents the same (`education`) |
| Technology | Very confident with devices, several times a day on social media, does not know how to change privacy settings; adopts new technology when most people have it (`digital_and_media`) |
| Shopping | Usually compares prices; switches to whichever brand is on offer; never buys more because of a promotion; says advertising does not influence him (`shopping_and_decisions`) |
| Personality | Big Five percentiles from 2 (agreeableness) to 71 (extraversion) (`personality_and_skills`) |
| Interests | Hiking, swimming, scuba and snorkelling, archery (`interests`) |

The value comes from seeing these parts together. An agent can use his single
household income, the mortgage, the student loans, his comparison shopping and
his scepticism of advertising when they matter. Different questions can draw on
different parts of the same life.

[View the saved profile JSON →](data/personagen-us-example.json)

The JSON holds every section: identity, origin and language, health,
beliefs, personality and 74 appearance fields as well. nxk normally sends the
person's first name and every section except appearance to the answering model.
An agent that draws with `sections` asks only for the parts it will use.
