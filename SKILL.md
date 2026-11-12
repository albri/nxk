---
name: nxk
description: Explore how different people's lives change response probabilities. Use when work depends on what people may think, prefer, understand or reject, including products, services, messages, prices and everyday trade-offs.
---

# nxk

Ask a relevant group a concrete question. Keep every answer probability, find
what changes across the crowd, and use the useful differences in the current
task. Match the size of the run to the decision.

The differences between people matter more than the overall result. Look for
where the answers change. Then look at what those people have in common, and
what that changes in your work.

## Start small

Before drawing people, state the decision, what success means, any fixed
constraints and what different answers would change. If demand, cost, access
or another goal could point in different directions, name the trade-off. Pick
a simple decision rule before seeing the result; do not invent one afterwards.

Ask about the nearest real action. "What would they do next?" is stronger than
"Would they consider it?" Include what they already do and the real cost or
inconvenience of every option. If one option has upside with no believable
downside, skip the question or restore the missing trade-off.

Skip or reframe questions whose answers follow from the audience definition or
known profile facts. Give people only the information they would have at that
point in real life. Do not explain away uncertainty with reassuring details the
real page, product or situation would not provide. When testing wording, hold
the offer and essential facts constant.

Use a run for changes of substance: a price, a term, a step, an offer, an
audience. It reads those in the right direction. It does not tell which of two
wordings of the same thing will perform better: against real headline
experiments it picked the winner no more often than a coin.

For a quick check, draw about 100 people and ask the one or two questions
needed to choose. Reuse a suitable saved draw when available. A quick check
ends with the result and what it changes. Do not add rounds by default.

For a longer exploration, let each useful finding shape the next question.
That might mean reconsidering the audience, investigating an obstacle, or
revising the alternatives. Drop weak directions. Stop when another answer
would not change the work. The recipes in [references/instruments.md](references/instruments.md)
cover prices, trade-offs, obstacles and follow-up questions; use only what
the task needs.

Map a short path before the run: who will face the decision, what they would
actually do, what could change that action, and which realistic change may
help. Start where the answer is unknown. Ask independent questions together.
Ask a dependent follow-up only after seeing the earlier result. Continue only
when another answer could change the work. Do not turn the run into a generic
questionnaire.

Before the first API call, read [references/persona-generation.md](references/persona-generation.md)
for the targeting workflow, drawing, answer shapes and failure handling. nxk
targets PersonaGen 4.0. Choose filters from the live catalogue, never from
memory: field names and value codes differ by country and release. Read it with
`node scripts/catalogue.mjs`, which caches it;
[references/filters.md](references/filters.md) says how to read it.

## Choose the people

Consumer questions are the easiest fit: money, households, shopping, pets,
travel, technology and everyday choices. Use the fields relevant to the task;
more filters do not automatically make a better draw.

Check that the people have a reason to care about the decision. When the
audience is unknown, first ask a broad draw about a concrete use, need or
exposure within a stated period. Keep that relevance probability and use it
as a weight when comparing later answers. Do not act on a strong difference
between groups until those people are relevant to the decision.

Target the audience in this order and stop as soon as you have it: read the
catalogue once (cached); look up values with `GET /{country}/search?q=`;
`POST /{country}/personas/validate` the filter set once and read its estimated
share, its range and the filter that narrows most; then draw. Filters apply when
each person is drawn, so every returned person matches them and no probe draw is
needed, unless validation says no one in its reference sample matched. A request can filter on up to 10 fields. Filter locally only for what
the API cannot express (interests, free text such as job titles) and size that
draw by the share that qualifies. A refusal is information: change the audience
on purpose, never retry it unchanged. When filtering locally, set a cap on
drawing first and don't draw past it to chase a tiny group. If far fewer than
about one in twenty qualify, explain the constraint and offer a smaller sample
or a broader group.

For answering, draw the full life without appearance
(`"exclude_sections": ["body_and_appearance"]`). The parts of a life that look
unrelated to the question still shape the answer: in testing, leaving out
beliefs, personality, shopping, interests and media made answers less
accurate. Cut to chosen sections (`sections`) only when the budget forces it,
and then keep `name_and_summary` and any section you will group by. Draw the
group with one `seed` and page it with `start` instead of redrawing; stream
(`Accept: application/x-ndjson`) when it is large.

For work-related questions, resolve the occupation with `search` and check the
returned title. Target and group by occupation rather than job title: the
title is free text, cannot be filtered, and does not always match the
occupation and industry. Filter on `economic_activity_status` when the decision concerns
someone doing that job today. Seniority (`job_level`), employer size
(`organisation_size`) and sector can narrow the group further. For buying
decisions, `decision_role` is the biggest part a person plays in their
organisation's purchases (low, influencer, decision maker or budget owner), and
each `purchasing_role_*` field is their part in one area, such as software. All
of them can be filtered. Employer context is inferred; a profile does not
contain a company's budget, software stack or buying committee. Supply any
needed company facts as an explicit situation.

When an answer depends on something people already own, use or spend that the
profile does not include, the experimental "Fill in a missing fact" recipe in
[references/instruments.md](references/instruments.md) can add it. It can
steer answers too far, so use it only when that fact decides the answer.

Keep the saved profile. Start with its household, money, work and habits
together when evaluating; the request helper in the reference leaves out
appearance (`body_and_appearance`), the surname and API metadata.

Verify the relevant fields in the draw before evaluating it. Keep the country,
seed, `start`, filters, sections, generator version and profiles so a later
comparison can reuse the same people. Keep the exact model version each answer
reports as well: a new version of the same model can change how far apart
groups come out, so compare answers only within one version. If the requested
group cannot be drawn, explain the missing part instead of silently widening
it.

## Ask

Give the person a concrete situation and credible options, including the choice
to do nothing when appropriate. Leave out "don't know" and "not sure": each
person's probabilities already show how sure they are, and a catch-all option
hides where that uncertainty lies. "None of these", "neither" and doing
nothing are real choices and can stay; only the catch-alls go. Put the question and complete options
together in `state`. Ask for that person's response using the profile and
situation. Use the request helpers in the reference, which carry a tested
instruction for a Choice and for a Noul, and leave those instructions as they
are: adding coaching, such as telling the model to think as the
person, to weigh every circumstance or to consider how common an answer is,
made answers less accurate in testing. Keep hypothetical
circumstances separate from profile facts. Give trade-offs concrete prices,
times and terms.
To test one change, reuse the situation and question. Change only that factor.
Compare each version with a control built the same way: the same situation,
the same questions and the same batch, differing only in that factor. Do not
compare a version with a baseline request that carries extra questions or
extra material; the difference in structure can move the answer on its own.

When a change could work through its framing rather than its substance, such
as an endorsement, urgency or a deadline, add a version it should not help:
the same recommendation from an unknown source, or the endorsed option at a
clearly worse price. Trust the effect only if this version moves the answer
much less.

Choose possible blockers from the real journey. Look at what the person must
spend, do, risk or give up, and what they already do instead. Turn only
plausible factors into questions. Prefer testing a concrete change over asking
people to explain why they chose something.

Use neutral, parallel wording. Do not hint at the preferred answer. Include the
real current option or default when it is part of the decision; changing the
frame or default can change the answer.

| Need | Question type |
| --- | --- |
| Pick an offer, feature or next step | Choice, including none or no preference |
| Check a particular obstacle | Noul (one yes probability), one yes/no question per obstacle |
| Rate strength or choose a price band | Score with clearly described levels |
| Find what would change their mind | Choice, including nothing |

Prefer a choice between concrete options to an agreement or strength scale.
Answering models rarely pick the ends or the middle of a scale, so a scale
shows direction and differences between groups more reliably than strength of
feeling.

When the share of people who would say yes is itself what you need, ask a
Choice between Yes and No rather than a Noul. In testing, a Noul's yes level
ran high and its gaps between groups came out flatter, though they pointed the
same way. Keep Nouls for comparing obstacles with each other and for seeing
which way a group leans.

Jev returns typed answers and probabilities. Use the full response text as
Choice labels and rotate option order consistently in `state` and `criteria`.
For an ordered Score, keep the levels in their meaningful order.

Batch independent questions about the same situation for one person. Put
separate comparisons in separate requests: every question sees the whole
state, though it cannot see another question's answer. This includes material
added for one question only. Describing an offer so obstacle or price questions
can refer to it draws attention to that offer in every choice in the same
request, so ask such questions in their own request. If a follow-up depends
on an earlier answer, send that answer in a new request.

Use the model available to the agent. Jev is recommended because it returns
structured answers and probabilities quickly, but nxk is not tied to a
particular provider. PersonaGen is free; the answering model is the cost. Use
current pricing for the chosen model and keep the run within the task's budget.

Before the full batch, run three or four people with clearly different lives.
Check that their probabilities differ and that nobody picks an option their
situation rules out. If something is wrong, stop and fix the request; otherwise
keep those answers in the run.

## Read and use the result

Combine the answers in code. For Choice, average each option's probability
across successful profiles. Label this **average model support**. Keep each
person's full probability set for group comparisons. Counting only the
highest-probability answer can make a weak preference look unanimous.

For normalising per-option scores, sampling individual answers, or diagnosing
collapse, read [references/probabilities.md](references/probabilities.md).
Sampling is optional; audience averages need no random draw. Use the same
measure and saved profiles when comparing alternatives.

A Noul is a yes probability. Its mean is average model support for that claim,
not a headcount or strength score, and it tends to run higher than the share
of people who would say yes. A Score is a position on the levels you
specified. Keep these measures separate. Report failed or missing answers;
never turn them into zeros.

Apply the decision rule chosen before the run. If the task allocates limited
money, time or capacity, show the calculation that turns weighted demand into
an allocation. Call a result optimal only when the objective and constraints
fully define what optimal means.

When relevance changes how much each person's answer counts, show the original
relevance percentage beside the result. Never present a result for that smaller
group as support from the whole crowd.

Use the finding in the current task and carry on. The average can give a broad
direction; the more useful result may be where probabilities rise or fall, what
those profiles share, and which difference deserves another question. Surface
a finding when it changes the work or needs the user's input. A sentence or
small table is often enough. Include the group and sample size when reporting
results. Produce a fuller report only when requested.

If an action rests on a group represented by only a few profiles, repeat the
question with a fresh draw before acting.

Prefer percentages to raw counts, retaining sample sizes in the supporting
detail. Look for useful probability shifts across relevant profile traits and
well-sized combinations. Express gaps in percentage points, or relative
percentages with a clear comparison group. Use standard deviation only when
calculated, stating what varies, such as results across seeds. Treat newly
found connections as leads: a group difference does not explain its cause,
and one you found by searching needs a fresh draw to confirm it before you
act on it. The more cuts you search through, the more of them differ by
chance, so name the one gap you mean to act on before you draw again.

Read a gap between groups for its direction first. Against official surveys,
a real gap of ten points or more usually points the same way here, about
eight or nine times in ten. Its size is less dependable: gaps tend to come out
at around two-thirds of their real size, gaps by age are flattened most, and
gaps tied to money can come out larger than they are.

How big a gap must be before you trust it: between two groups of 30 or more
people each, about three in four gaps of ten points or more matched a real gap
the same way in testing, and very few ran the other way; at fifteen points
nearly nine in ten did. Below about seven points a gap is more often nothing
than something, so treat it as a lead.

The overall level is least dependable for questions about what people did in
a recent period, such as in the past 12 months, because the answering model's
sense of how common a behaviour is can be far out. Use such questions to
compare groups, and take the overall rate from a real source when one exists.

When the same people answer two versions of a situation, read the change
across the group, not in one person. A detail that should not matter still
moves one person's answer by a point or two in either direction; across the
group those moves cancel and a real change does not. Compare each person's
probability before and after, not their top answer: in testing, three in four
people moved the right way at a typical step while only one in ten changed
their top answer. Direction is dependable for a clear change. Size is
understated (raising a monthly price from 6 to 16 cost under ten points), and
a very small change, such as delivery in three days instead of one, may not
register at all.

When the aim is to find which groups react most to a change, draw 300 people
or more and compare groups of at least 30. In testing, two panels of 300
agreed closely on which groups moved more, and two panels of 100 only loosely.

Agreement can be real. Check whether the full probability sets vary between
people before claiming a difference between groups. If the result does not
make sense, inspect the request and test a few clearly different profiles or
the same question without a profile before scaling up.
Change an identified problem, not the numbers to manufacture variety.

Use the results to explore preferences and obstacles. Do not present them as
what real people actually did. Describe a wording result as a preference for
that wording, not proof that it will change behaviour. Keep political, hiring,
medical and other high-stakes decisions out of this workflow.
