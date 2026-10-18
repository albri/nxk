<h1 align="center">
  <img src="assets/readme/banner.webp" alt="nxk. Give your agent a crowd. A skill for coding agents: it asks simulated people, drawn from real statistics, and shows who answers differently. Install with npx skills add albri/nxk.">
</h1>

https://github.com/user-attachments/assets/b7409ffd-ae7b-4f51-830f-cda31fbf352b

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#why-use-it">Why use it</a> ·
  <a href="#does-it-work">Does it work?</a> ·
  <a href="#who-are-the-people-and-what-is-personagen">PersonaGen and the "people"</a> ·
  <a href="#what-it-costs">Cost</a> ·
  <a href="#faq">FAQ</a> ·
  <a href="#skill-and-api-references">References</a>
</p>

---

nxk is a skill for coding agents: the AI assistants that write and run code for
you, such as Claude Code, Codex or Cursor. A skill is a set of instructions an
agent can load to do one job well.

Agents make lots of small choices that depend on people: a default, a price, a
headline, an opening time. Usually they guess. nxk gives your agent a crowd to
ask first. The crowd is a set of simulated people, not real ones.

[PersonaGen](https://personagen.dev) gives each one a detailed profile, with a
job, a home, and habits that fit together. Your agent sends each profile to a
model (I recommend [Jev](https://typesafe.ai)) and asks the model to answer as
that person. With Jev, each answer costs a fraction of a cent, so 100 people can
answer a question for about a cent.

These people don't all answer in the same way, because the answer depends on
the life in the profile. That's the useful bit. An average answer can hide the
people a change is for, so nxk shows your agent who answers differently and
what they have in common. The agent can ask those people more questions, follow
the differences that matter and drop the ones that don't. That way, it makes
something more people want.

## Quick start

Copy this into your agent:

```text
Install the nxk skill by running `npx skills add albri/nxk`
and selecting your agent.

Read the skill at:
https://github.com/albri/nxk/blob/main/SKILL.md
Raw: https://raw.githubusercontent.com/albri/nxk/main/SKILL.md

Follow its setup instructions, using any credentials already available.
If I need a PersonaGen key, direct me to https://personagen.dev/signup.

You'll also need access to a model. I recommend Jev:
https://typesafe.ai. Use my preferred model if I have one.

Help me configure any missing access. Then inspect this project and find one
current decision where people's reactions could change the work. Ask a small
relevant audience, follow one useful difference, then make the change. Keep
the result brief.
```

## How it works

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/readme/how-it-works-dark.webp">
  <img src="assets/readme/how-it-works.webp" alt="How nxk works, in a made-up example. One: the agent has to decide where five more library opening hours go. Two: it asks 100 likely visitors, and weighted by who is likely to visit, mornings lead 61% to 39%. Three: split by work, the answers cross. Retired people lean to mornings, 74%, and people in full-time work lean to evenings, 66%. Four: after a follow-up question, the agent adds three morning hours and two on Thursday evening.">
</picture>

**Hypothetical example:** The library and the numbers are made up. A town's
public library can fund five more opening hours a week, and you ask your agent
to add them where they'll help the most residents. The answer depends on who
would use them, so the agent calls nxk:

| What the agent does | What nxk finds | What changes |
| --- | --- | --- |
| Checks who is likely to visit | Next three months: all adults 36% · retired people 68% · people in full-time work 14% | Weight later answers by each person's chance of visiting |
| Asks likely visitors whether morning or evening hours would help more | Morning 61% · evening 39% | Start with three morning hours and two evening hours |
| Looks for groups that answer differently | Evening support among likely visitors in full-time work is 66%, 27 percentage points above all likely visitors | Do not put all five hours in the morning |
| Asks which days help each group | Retired people prefer weekday mornings · people in full-time work prefer Thursday evening | Put three hours across weekday mornings and two on Thursday evening |

On average, mornings won. Split by work, the answers crossed: the people the
average would have left out wanted evenings, and one more question told the
agent which evening.

**A real run:** [an agent takes a generic landing page and finds the headline, features and price people pick →](examples/budgeting-app.md)

### Each person answers with probabilities

The model reads one person's profile and the question, then gives every option
a probability, as that person would answer. Here are three people from the same
crowd, answering a real survey question:

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/readme/every-answer-dark.webp">
  <img src="assets/readme/every-answer.webp" alt="Three simulated people answer the same question about the affordability of food. Elena, 25, a fitness trainer with a household income of £70,000 to £100,000, is most likely not very concerned, 65%. Jonathan, 61, a social worker who rents privately, is most likely somewhat concerned, 89%. Christine, 52, long-term sick or disabled and in social housing, is highly concerned, 100%.">
</picture>

nxk keeps every probability rather than counting each person's top answer, then
compares groups of people.

### Each answer decides the next question

nxk looks for what the people who answer differently have in common. In the
library example, evening support was higher among people in full-time work, so
the agent asked that group which evening they'd use. It drops splits with no
real gap, and it stops when another answer wouldn't change the work.

## Why use it?

To put it simply, nxk improves your chances of doing something people actually
want.

Your agent often has to guess how people will react to its work. nxk replaces
that guess with answers from a crowd. The differences in those answers show who
to build for, and what to change. nxk keeps every answer, so your agent can
show how it reached its conclusion.

## Does it work?

I checked nxk against 26 questions from 15 published UK and US surveys, with
1,000 simulated people per question. I also asked the model each question with
no person attached, to see what the crowd adds.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/readme/does-it-work-dark.webp">
  <img src="assets/readme/does-it-work.webp" alt="nxk against 26 published survey questions. Leading answer exact or one step off: the model alone gets 21 of 26, 14 exact; nxk on PersonaGen 3.x gets 22 of 26, 16 exact. Biggest gaps between groups pointing the same way: the model alone has no groups to compare; nxk gets 12 of 16, 9 clearly. Average distance from the survey per answer: 14.0 points for the model alone, 9.7 for nxk. Results on PersonaGen 4.0 are still to come.">
</picture>

| Check | Model alone | nxk |
| --- | --- | --- |
| Was the most popular answer the survey's, or the one next to it? | 21 of 26 questions | 22 of 26 questions |
| Did the biggest gaps between groups, like young and old, point the same way? | No groups to compare | 12 of 16 |
| How far was each answer from the survey, on average? | 14.0 points | 9.7 points |
| Do the people answer differently from each other? | One answer for everyone | 26% pick a different top answer from the crowd |

<!-- PersonaGen 4.0: when the 4.0 run is recorded, update this table and the
numbers in assets/readme/src/figures.mjs, then run render.mjs. -->
These results were recorded on PersonaGen 3.x. The PersonaGen 4.0 run is still
to come. Read the results for direction, not decimals.
[Charts and every comparison →](methodology.md)

## What you can use nxk for

| Decision | What your agent can find out |
| --- | --- |
| Choosing between ideas | Which idea gets more support and who answers differently |
| Planning a service | How time, place or access changes the answer |
| Explaining something | Which words and examples different people understand |
| Making a compromise | Who benefits, who loses out and by how much |
| Deciding what to make | Who cares about it and what need it meets |
| Finding people you missed | Who answers differently and what they have in common |

Best suited to questions about everyday life, where PersonaGen can describe
the people involved.

## Who are the "people", and what is PersonaGen?

[PersonaGen](https://personagen.dev) is my persona generator. Here is where
each part fits:

| Part | What it does |
| --- | --- |
| **PersonaGen** | Creates detailed people and a crowd that broadly resembles the UK or US population |
| **Jev or another model** | Predicts how each person might answer |
| **nxk** | Shows your agent how to draw the right people, ask realistic questions, compare probabilities and decide what to ask next |
| **Your agent** | Uses what it finds in the work it is already doing |

PersonaGen does two things at the same time:

- **Each person makes sense.** Their age, work, income and household fit together.
- **The crowd resembles the country.** In a large draw, ages, households and other traits follow UK or US population data.

It's pretty easy to create personas that do *one* of these things; it is much
harder to do both at the same time.

Each person comes with about 230 details across 16 sections of life,
including:

| Part of someone's life | Examples |
| --- | --- |
| People and place | Adult age, education, region, city or rural life |
| Work | Occupation, industry, job level, employer size, remote or on-site work, purchasing roles |
| Money | Personal and household income, debt, how they are managing financially |
| Family and home | Children and their life stages, caregiving, renting, moving, outdoor space |
| Pets and travel | Dogs, cats, other pets, vehicles, commuting |
| Shopping and technology | Price comparison, shopping channels, brand choice, digital skills, privacy |
| Personal context | Interests, language, personality, health, activity |

[Open one actual PersonaGen profile →](examples/personagen.md)

About 200 fields can be filtered in each country. nxk reads them from
PersonaGen's live catalogue (cached, so it costs one call a release), finds
values with search, and asks the API how rare an audience is before drawing it.
A targeting task takes four or five small calls and no trial draws. The
[filter guide](references/filters.md) says how to read the catalogue.

nxk targets **PersonaGen 4.0** (API and schema `4.0.0`).

## What it costs

PersonaGen is free, with generous usage limits (100k personas a month). The
answering model is the only cost.

**Estimated Jev input cost (USD)** when all questions for one person are sent together:

| People | 1 question each | 10 questions each | 20 questions each |
| ---: | ---: | ---: | ---: |
| 100 | $0.01 | $0.02 | $0.03 |
| 1,000 | $0.12 | $0.21 | $0.30 |
| 10,000 | $1.20 | $2.10 | $3.00 |

These estimates use my recorded runs. A run of 100 people and two questions
took about five seconds and cost 1.3 cents. That is fast and cheap enough to
ask another question when one group answers differently. All values are rounded.

<details>
<summary>Why do more questions cost less per question?</summary>

You can send one person's details and several questions about the same thing
in a single prompt. Their details make up most of the input, so you pay to send
them once and share that cost across the questions. Jev's [output is free](https://typesafe.ai/blog/introducing-system-one-models-and-jev),
so extra questions mainly add the cost of their wording.

</details>

## FAQ

<details>
<summary>Can an LLM pretending to be a person tell me anything useful about real people?</summary>

Yes. When I tested it against published surveys, the simulated people answered
differently from each other, and their answers followed their lives.
[Does it work?](#does-it-work) has the numbers.

It's best at everyday choices people make from their own circumstances. Like
most language models, it makes people a bit more sensible than they really are.
They say they check food hygiene ratings more often than real people do, and
they rarely feel strongly either way. A few quirks, like a soft spot for new
technology, are harder to iron out. [More on where to be careful](methodology.md#where-to-be-careful).

I don't expect it to match a survey to the decimal point. You can't recreate
the setting of a real survey, and making each person tick one box throws away
how sure they were. nxk keeps the probability of every answer and looks for
where people differ, which is the useful bit.

</details>

<details>
<summary>How seriously should I take the results?</summary>

Seriously enough to change what you build. Read them for direction: which
option leads and who answers differently. A 61% is a clear lean, not a forecast
that 61% of real people will choose it, and gaps between groups tend to come
out smaller than in real surveys. [How nxk compares with real surveys](methodology.md).

</details>

<details>
<summary>Why is nxk a skill rather than an app?</summary>

Because the useful bit happens inside the work. Your coding agent knows what
you're building, can ask another question when an answer is interesting, and
can change the work when it learns something. I started out building a full
app for this. The more workflow I built, the clearer it became that these
decisions belong with the agent doing the work, not in fixed screens. nxk gives
the agent the people and the method, then lets it adapt the research to the
task.

</details>

<details>
<summary>Why not just ask a model to invent its own personas?</summary>

You can. But a pile of model-generated stereotypes won't represent the UK or
US population, and models reach for the same types of generic people over and
over.

PersonaGen is built to make each person plausible and a large crowd resemble
the UK or US population. You need both.

</details>

<details>
<summary>Do I have to use Jev?</summary>

No. nxk can use another model. I recommend Jev because it returns
probabilities directly and is fast and cheap enough to ask hundreds of people.
Other models generally cost more and take longer, and I have not found that
they improve the answers enough to justify it.

</details>

<details>
<summary>Can I use nxk for B2B questions?</summary>

Yes, with a bit of help. nxk is at its best with consumer questions, because
PersonaGen generates people, not companies. For work questions, ask for a
specific role, seniority and type of employer. A profile can't know a
company's budget, software or buying process, so add those to the question when
they matter.

I'd like to build a company generator for this: companies that make sense on
their own, match the real business population at scale and come with org
charts. Then B2B questions could get the same treatment as consumer ones.

</details>

<details>
<summary>Can nxk collect written answers or quotes?</summary>

Not with Jev. Jev picks between answers and gives each a probability; it
doesn't write prose. For written answers you'd need a traditional LLM, which
is slower and costs more per person.

Even then, I wouldn't present generated prose as quotes from real people.
Models still struggle to give different people genuinely different voices. I
tried having the model write several possible replies and picking one by
probability. It helped, but not enough to make it part of nxk.

</details>

<details>
<summary>Do I need to know statistics?</summary>

No. Your agent handles the numbers and shows you the differences that matter.
It keeps enough detail to repeat the run. You decide what to do with the
result. The maths is in the references if you ever want it.

</details>

<details>
<summary>Can you add Canada, Australia, Germany or another country?</summary>

Realistically, not any time soon. The UK and US took me a long time to research
and optimise. PersonaGen is a bit of fun for me, and I do not have enough spare
time to add more countries properly.

I'd rather spend that time on other kinds of populations, like companies or
whole households whose members fit together.

</details>

## Skill and API references

| File | What it is |
| --- | --- |
| [SKILL.md](SKILL.md) | The agent's instructions |
| [Drawing and evaluating](references/persona-generation.md) | Targeting, drawing, answers and limits |
| [Using the probabilities](references/probabilities.md) | How to keep and compare the answers |
| [Filters](references/filters.md) | How to read the live catalogue and write a filter |
| [Catalogue helper](scripts/catalogue.mjs) | Cached reads of the live catalogue, by section, word or field |
| [Question recipes](references/instruments.md) | Ways to ask about prices, trade-offs and follow-up questions |
| [Methodology](methodology.md) | How nxk compares with published surveys |
| [Experiments](experiments.md) | Ideas tried, rejected and still open |

## Contributing

Tried it on something interesting? Found an instruction that sent your agent
in circles? [Open an issue](https://github.com/albri/nxk/issues) or send a PR.
For examples, include the question, who you asked, and what you changed after
the result. Use a situation readers can understand in one sentence, and keep
the full results. Leave API keys out.

## License

MIT. See [LICENSE](LICENSE).
