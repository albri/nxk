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

Ask about the nearest real action. “What would they do next?” is stronger than
“Would they consider it?” Include what they already do and the real cost or
inconvenience of every option. If one option has upside with no believable
downside, skip the question or restore the missing trade-off.

Skip or reframe questions whose answers follow from the audience definition or
known profile facts. Give people only the information they would have at that
point in real life. Do not explain away uncertainty with reassuring details the
real page, product or situation would not provide. When testing wording, hold
the offer and essential facts constant.

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
for connections, full-profile requests, answer shapes and failure handling.
When you choose filters, use the live `filter_catalogue` in
`GET /{country}/capabilities`, or the groups in
[references/filters.md](references/filters.md). If the two disagree, use the
response.

## Choose the people

Consumer questions are the easiest fit: money, households, shopping, pets,
travel, technology and everyday choices. Use the fields relevant to the task;
more filters do not automatically make a better draw.

Check that the people have a reason to care about the decision. When the
audience is unknown, first ask a broad draw about a concrete use, need or
exposure within a stated period. Keep that relevance probability and use it
as a weight when comparing later answers. Do not act on a strong difference
between groups until those people are relevant to the decision.

Apply supported filters server-side first. For a more specific group, filter
the returned profiles locally only for conditions the API cannot express. Start
with a small draw to check how many qualify, then cap any further draws against
the user's remaining allowance. Do not spend thousands of profiles chasing a
tiny group; explain the constraint and offer a smaller sample or broader group.

For work-related questions, resolve the occupation through the occupation
search endpoint and check the returned role. Specify current employment and
`career_context_scope` when the decision concerns someone doing that job today.
Seniority, ownership, employer size and decision role can narrow the group
further. Employer context is inferred; a profile does not contain a company's
budget, software stack or buying committee. Supply any needed company facts as
an explicit situation.

Keep the full saved profile. Start with its household, money, work and habits
together when evaluating; the reference omits appearance and API metadata.

Verify the relevant fields in the draw before evaluating it. Keep the country,
seed, filters, generator version and profiles so a later comparison can reuse
the same people. If the requested group cannot be drawn, explain the missing
part instead of silently widening it.

## Ask

Give the person a concrete situation and credible options, including the choice
to do nothing when appropriate. Put the question and complete options together
in `state`. Ask for that person's response using the profile and situation.
Use the request pattern in the reference. Keep hypothetical circumstances
separate from profile facts. Give trade-offs concrete prices, times and terms.
To test one change, reuse the situation and question. Change only that factor.

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
| Check a particular obstacle | Noul, one yes/no question per obstacle |
| Rate strength or choose a price band | Score with clearly described levels |
| Find what would change their mind | Choice, including nothing |

Jev returns typed answers and probabilities. Use the full response text as
Choice labels and rotate option order consistently in `state` and `criteria`.
For an ordered Score, keep the levels in their meaningful order.

Batch independent questions about the same situation for one person. Put
separate comparisons in separate requests: every question sees the whole
state, though it cannot see another question's answer. If a follow-up depends
on an earlier answer, send that answer in a new request.

Use the model available to the agent. Jev is recommended because it returns
structured answers and probabilities quickly, but nxk is not tied to a
particular provider. PersonaGen is free; the answering model is the cost. Use
current pricing for the chosen model and keep the run within the task's budget.
Check a few people with clearly different lives before completing the batch.
Inspect the probabilities and check that each answer follows the stated limits.
Keep those answers in the run; stop when you find a fault.

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
not a headcount or strength score. A Score is a position on the levels you
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
found connections as leads: a group difference does not explain its cause.

Agreement can be real. Check whether the full probability sets vary between
people before claiming a difference between groups. If the result does not
make sense, inspect the request and test a few clearly different profiles or
the same question without a profile before scaling up.
Change an identified problem, not the numbers to manufacture variety.

Use the results to explore preferences and obstacles. Do not present them as
what real people actually did. Describe a wording result as a preference for
that wording, not proof that it will change behaviour. Keep political, hiring,
medical and other high-stakes decisions out of this workflow.
