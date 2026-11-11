# One actual PersonaGen profile

> **Jonathan is 63 and lives in a rural part of Westchester County, New York.
> He works for himself full-time as a labourer for a hardware and plumbing
> wholesaler, earns $50k–$75k, is married with four grown children who have
> left home, owns his house outright and is just about getting by.**

No LLM wrote a biography around him. These fields came from one PersonaGen 4.0
response, `GET /us/persona?seed=nxk-example-us_3`. The same seed and generator
version return the same person.

| Part of his life | What PersonaGen generated |
| --- | --- |
| Place | Rural area outside any town, in a large suburban county of New York (`place`) |
| Household | Married and living with his wife; four children, none at home; one adult in paid work (`household_and_family`) |
| Home | Owns a detached house with a garden outright; 10 to 19 years at the address; two vehicles; drives alone to work (`home_and_travel`) |
| Work | Self-employed labourer, 35 to 48 hours, regular daytime schedule, a fixed place of work, experienced, no employees; makes his own business's buying decisions (`work`) |
| Money | $50k–$75k personal and $75k–$100k household income; no mortgage or other debt; would have to borrow or sell something to cover an unexpected $400 expense (`money`) |
| Health | Good health; arthritis that doesn't limit him; buys his own health insurance; less than 30 minutes of exercise a week (`health`) |
| Education | High school diploma; parents the same (`education`) |
| Technology | Online every day on a smartphone, laptop, tablet, smart speaker and watch, with basic digital skills; reads social media but doesn't post (`digital_and_media`) |
| Shopping | Rarely compares prices; switches to whichever brand is on offer; reads the details carefully; would rather companies contact him by post (`shopping_and_decisions`) |
| Personality | Big Five percentiles from 14 (agreeableness) to 64 (openness) (`personality_and_skills`) |
| Interests | Watches documentaries every week (`interests`) |

The value comes from seeing these parts together. An agent can use his tight
budget despite owning his home, his own business's buying, his arthritis, his
habit of reading the small print and his preference for post when they matter.
Different questions can draw on different parts of the same life.

[View the saved profile JSON →](data/personagen-us-example.json)

The JSON holds every section: identity, origin and language, beliefs,
personality and 74 appearance fields as well. nxk normally sends the person's
first name and every section except appearance to the answering model. An
agent that draws with `sections` asks only for the parts it will use.
