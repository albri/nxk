# Using the probabilities

Keep one full set of probabilities per person and question. Use native Choice
for answers where the person can select only one option. The full set is the
useful result;
`choice` is just the highest-ranked answer.

For another evaluator, check whether it exposes option probabilities. If it
returns only a choice, report selected-answer shares instead.

## Audience results

For option `k`, average its probability over successful profiles:

```text
support[k] = sum(person.probabilities[k]) / successful_profiles
```

Calculate group results the same way within each group. Label percentages
**average model support**. Preserve sample sizes and missing-response counts.
If you deliberately oversampled groups, report them separately or use justified
population weights; their pooled average describes the drawn mix.

When not everyone is likely to use, need or encounter the thing, ask about
that relevance first. Keep the probability for each person and use it to weight
their later answer:

```text
relevant_support[k] = sum(person.relevance * person.probabilities[k])
                    / sum(person.relevance)
```

Report the unweighted result too. Weight only for a stated reason; do not use
relevance weighting when everyone in the draw is affected by the decision.
A strong preference in a group with little reason to care should not set the
overall direction.

There are two different kinds of variation. This illustration has the same
overall result in both rows:

| Individual probabilities | Overall A / B | What it means |
| --- | --- | --- |
| Every person: A 60%, B 40% | 60% / 40% | Similar predictions, each uncertain |
| 60% of people: A 100%; the rest: B 100% | 60% / 40% | Different people, each decisive |

Inspect each person's full set as well as the average. Standard deviation of
an option's probability across profiles describes differences between people.
A small demographic gap matters less if it changes direction across draws.
Repeated predictions for the same person can check whether small differences
are merely evaluator variation. Use these checks when the decision warrants
them; they are not extra rounds for every quick question.

More profiles smooth the model's implied audience. They do not remove a shared
model bias. Treat resampling intervals as stability of this simulation, not
confidence intervals for real customers. Keep exploratory group differences
separate from explanations of why people differ.

## When one answer per person is needed

For a follow-up or simulated journey that requires a definite choice, draw
once from that person's distribution. Use a reproducible random seed per
run, person and question. Save the draw and condition later questions on it.
Use the original probabilities for the overall comparison, rather than
resampling until a preferred result appears.

```text
u = seeded_random(run_id, person_id, question_id)  // uniform [0, 1)
answer = first option whose cumulative probability exceeds u
```

Keep option order stable when sampling. Correct tiny rounding drift by dividing
by the set's sum; reject missing, negative, non-finite or materially invalid
values first. A zero-sum set is a failed answer, not a uniform preference.
Label sampled results as **simulated choices**. Stored `choice` counts instead
are **highest-ranked answer shares**; they are a different measure.

## Normalising per-option Noul results

Noul can assess each candidate separately. When comparing alternatives, turn
non-negative scores into relative weights **within each person and question**:

```text
weight[person, option] = score[person, option] / sum(score[person, all_options])
support[option] = average(weight[person, option])
```

Keep the original scores and label the result **normalised preference weights**.
Totals above 100% do not rule this method out. Normalisation makes the weights
comparable; it does not establish that they are calibrated choice probabilities.
Handle a zero total as missing. Keep the candidate set fixed across comparisons.

Use this as an alternative when it helps the decision, not an extra compulsory
pass. For independent obstacles such as price, privacy and effort, several can
apply together: average each Noul directly instead of normalising them away.

## If everyone appears to agree

First inspect the distributions. Unanimous highest-ranked answers can still
contain meaningful uncertainty and differences. If the probability sets
barely change, check a few contrasting profiles and, if useful, the same
question without a profile. A generic winner can be useful, but does not show
that the audience's dimensions added anything.

Check that options preserve the actual trade-offs, that the instruction points
to the right question, and that stated constraints affect the result. An
impossible option winning is a fault to investigate. An obvious winner may
mean the question was not worth asking.

Keep legitimate agreement. Avoid noise, uniform blending or temperature changes
whose only purpose is a prettier split. Extra situational facts belong in an
explicit situation; do not invent them to manufacture differences.
