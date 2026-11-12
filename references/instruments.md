# Question recipes

Use the recipe that helps the current decision. These are optional ways to
explore further, not a checklist. Start with the smallest useful run and finish
when you have enough to continue.

For Choice, average the option probabilities and keep each person's full set
for group comparisons. See [probabilities.md](probabilities.md) for the detailed
calculations and checks. Batch questions about the same situation; keep
separate comparisons in separate requests.

| You need to decide… | Start with… |
| --- | --- |
| Which idea to explore | Compare ideas |
| What to charge | Explore prices |
| Which offer or feature to keep | Compare trade-offs |
| What puts people off | Find obstacles |
| What to say | Compare wording |
| Who to focus on | Follow an audience difference |
| How people who already own or use something respond | Fill in a missing fact (experimental) |

## Compare ideas

Describe a few concrete ideas, including what each does and what it costs.
Use the same saved profiles for each idea, evaluating each in its own request.

Ask about the next action the real situation permits. Include keeping the
current approach or doing nothing. Compare support and relevant audience
differences. Ask about existing habits only when the profile contains them or
you have filled them in; otherwise make the situation hypothetical.

When an idea is a new supplier or product entering an existing relationship,
add a version in which the supplier the person already uses offers the same
thing on the same terms. If support for the idea collapses, its appeal belongs
to whoever already serves the person, not to the idea.

Continue with the idea whose results suggest a useful next decision. Every
additional idea resends the profile, so include those calls in the estimate.

## Explore prices

Start with a concrete offer at a stated price, including keeping the current
routine as an option. To compare prices, change only the price and evaluate
each version separately on the same profiles.

For a broader range, use Scores with explicit price bands: a bargain, getting
expensive but still considered, and too expensive to consider. Keep each answer
on its stated scale. Recheck if the offer changes; these are model judgments,
not observed willingness to pay.

## Compare trade-offs

Give credible alternatives with their benefits, costs and effort made clear.
Keep essentials constant unless they are part of the trade-off. Include none
or no preference when it makes sense.

Compare overall support and useful group differences. If you later put several
products on one menu, test that menu together; results from separate pairwise
comparisons do not tell you how support will divide across the full set.

## Find obstacles

Ask one Noul per obstacle, all in one request, and rank the obstacles by their
averages. Tested against official surveys that gave people a list of reasons,
ranking by Noul averages matched the real order better than asking for the
single biggest reason. Read the order and which groups feel an obstacle more;
the averages themselves run high. Use a Choice with "nothing" or "I don't need
this" only when you need each person's one main obstacle.

A later question can compare ways to address an obstacle, including "none of
these would help". Keep the proposed solution concrete: a lower price, a smaller
order, or a preview before paying. A separate obstacle question does not explain
an earlier individual choice unless that choice is supplied in the next request.

## Compare wording

Show the copy in its intended position, with the surrounding offer. Keep price,
features and essential information constant between versions. Ask which version
they prefer, with neither or no preference available.

Treat the result as a weak signal at best. Tested on real headline experiments
where one headline drew far more clicks than the other, the panel picked the
winner no more often than a coin, with Jev and with a stronger answering
model. Use a clear preference to choose a draft when nothing better is to
hand, and describe it as wording preference, never as a prediction of which
version will perform. A small or inconsistent gap gives no reason to keep
generating more versions. When the wording matters, run the real test.

## Follow a useful difference

Start with profile details that could change the work. Compare the same
measure within each group and retain group sizes. Then inspect other well-sized
groups when the full probability sets suggest a connection worth following. A
group difference that merely restates the question adds little: "parents prefer
the parenting product" is rarely a discovery.

Before acting on a group difference, check that the group is likely to use,
need or encounter the thing. If that is unknown, measure relevance first and
use the weighting method in [probabilities.md](probabilities.md).

If an action rests on a group represented by only a few profiles, check its
direction on another draw. Treat new splits found while exploring as leads.
Avoid hunting through ever-smaller groups for a striking percentage.

When profiles barely change the answer, a small no-profile or contrasting-profile
check can help diagnose why. Use the result to choose the next question or
continue the work; a longer study is optional.

## Fill in a missing fact (experimental)

Use this when the answer depends on something people already own, use, spend or
have done, and the profile does not say: how their home is heated, which app
they use now, how many subscriptions they pay for.

1. Ask the model, as a Choice, which value is most likely for each person.
2. Find a published figure for how common each value is, dated before the
   decision. Multiply each person's probabilities by the target share divided
   by the crowd's current average, renormalise each person, and repeat until
   the crowd matches the figure. The model's own guesses are often skewed.
3. Give each person one value with a seeded draw from their rescaled
   probabilities (see [probabilities.md](probabilities.md)). Save it, and send
   it with every later question as a sentence in `respondent.knownFacts`. Add
   "Treat `respondent.knownFacts` as true about this person." to the
   instruction.

This puts your own assumptions into every answer, and it can steer them too
far:

- A highlighted fact can become the whole answer. If one option jumps to
  dominate once the fact is added, compare with a run without it before
  trusting the result.
- Never fill in a fact that restates an answer option, such as current
  spending when you are asking what people would pay.
- A wrong figure is copied into every person. Use a source you trust and
  report it alongside the result.
- It supplies missing facts, not attitudes or opinions.

Say in the result which facts were filled in and where each figure came from.
The tests behind this step are in [experiments.md](../experiments.md).
