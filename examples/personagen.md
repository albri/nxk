# One actual PersonaGen profile

> **Kenji is 39 and lives in Montgomery County, Maryland. He works full-time as
> a recreational therapist, earns $75k–$100k, lives with his partner, rents his
> home and has a dog.**

No LLM wrote a biography around him. These fields came from the same PersonaGen
response.

| Part of his life | What PersonaGen generated |
| --- | --- |
| Place | Major metropolitan area in Montgomery County, Maryland |
| Background | Grew up in poverty; parents had less than a high-school education; later earned a master's degree |
| Work | Recreational therapist in a large health or education institution; full-time, on-site shift work |
| Money | $75k–$100k personal income; $100k–$150k estimated household income; structured budgeting; low or no debt |
| Home | Lives with a partner; no children; recently moved into a rented single-family house with a private yard |
| Everyday life | Dog owner; drives to work; interested in running, yoga, music, art, travel, cooking and reading |
| Technology | Basic functional confidence; smartphone-dependent; selective about privacy; cautious with new technology |
| Shopping | Cares more about quality than the lowest price; prefers trusted brands and shops both online and in person |
| Decisions | Prefers evidence and data; compares options carefully; balanced attitude to risk; difficult to persuade without a good reason |

The value comes from seeing these parts together. An agent can use his shift
work, shared household income, recent move, dog, cautious use of technology and
preference for evidence when they matter. Different questions can draw on
different parts of the same life.

[View the exact generated JSON →](data/personagen-us-example.json)

The JSON also contains identity, personality, health and appearance fields.
nxk normally sends the person's first name and non-appearance profile to the
answering model.
