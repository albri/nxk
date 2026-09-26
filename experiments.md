# Experiments

This is a loose record of ideas I have tried or might return to. It is not a
roadmap, and none of it is required to use nxk.

## Keep the probabilities

**Status:** Keep.

Asking each person to cast one vote throws away useful information. Keeping the
probability of every answer shows how strongly they leaned and makes smaller
differences between groups visible.

## Check who cares before asking what they prefer

**Status:** Keep.

A broad crowd can answer a question about something most of them would never
use. First estimate who is likely to encounter, need or consider it. Use that
probability when reading the later answers. Choosing the right people has been
more useful than making the prompt cleverer.

## Fill in a missing fact

**Status:** In the skill as an experimental recipe.

Some answers hang on a fact the profile doesn't have, like how someone's home
is heated or what their credit score is. So before asking the real question, I
asked Jev to guess that fact for each person, nudged the guesses to match a
published figure I found with Exa, and gave each person one value.

On nine benchmark questions, same 300 people each time:

| Question | Fact filled in | Without | With |
| --- | --- | ---: | ---: |
| Streaming is worth the cost | Paid services | 23.1 pts, wrong leader | **4.4 pts, right leader** |
| Buy now, pay later | Credit score | 6.1 pts | **1.5 pts** |
| Considering a pot-for-life pension | Pension pots | 11.0 pts | **6.7 pts** |
| Considering an electric car | Home charging | 13.6 pts | **8.7 pts** |
| Checked a food hygiene rating | Eating out | 17.5 pts | **15.3 pts** |
| Would install a heat pump | Heating | wrong leader | **right leader** |
| Why people stay with their bank | Years with bank | **5.7 pts** | 9.4 pts |
| Trust loyalty prices | Scheme member | **8.4 pts** | 10.4 pts |
| Monthly streaming budget | Current spend | **6.6 pts** | 14.2 pts |

The average miss dropped from 11.6 to 9.2 points, and nxk found the real
leading answer on six questions instead of three. The credit score also gave
nxk a gap the survey found: people below 720 were 24 points more likely to use
buy now, pay later than people above 760. The survey says 20.

The published figure does most of the work. Jev's own guesses put 95% of homes
on gas and 98% of shoppers in a loyalty scheme, and without the correction a
few questions got worse.

It can also steer too hard. Tell people how long they've banked somewhere and
"it's the account I've always had" triples. Tell them they spend $60 a month on
streaming and they'll happily pay $60. So only fill in facts that shape the
answer, never one that is the answer, and compare with a run without it.

## Send the full persona

**Status:** Keep.

I tried condensed personas, selected fields and prose summaries made from the
JSON. The full PersonaGen payload produced the most plausible and varied
answers. A detail that looks irrelevant on its own can matter when it meets the
question or another part of the person's life. Removing that detail in advance
also removes a connection nxk could have found.

## Written answers in different voices

**Status:** Deprioritised.

I do not see much value in generating pages of synthetic quotes just because a
model can. If 100 supposed people sound like the same assistant wearing
different name badges, that is text slop, not qualitative colour. Current
models repeat the same voice and thought patterns across profiles. Until the
answers add something the probabilities cannot, they are extra words no one
needs to read.

## Verbalised sampling

**Status:** Mixed.

This was mainly an experiment for traditional LLMs generating written answers.
Ask the model for several possible responses and a probability for each, then
randomly choose one using those probabilities. This stops every persona
returning only the single most likely sentence and worked best for qualitative
answers. Jev already returns probabilities for structured choices. The written
results still did not add enough real variety or value to justify the extra
text, time and cost.

## Just use a frontier model for "smarter" answers

**Status:** Did not help.

Bigger and newer models did not produce better persona responses in my tests.
The strongest traditional LLM results came from
`google/gemini-2.5-flash-lite` and the now-deprecated
`xiaomi/mimo-v2-flash`. They cost less and were less likely to overthink a
simple choice.

My working theory is that extra reinforcement learning and post-training can
make frontier models worse at this job. A model trained to reason at length may
choose the answer it can best defend instead of the answer this person would
most likely give. I have not proved that mechanism. Paying for a larger model
did not improve the result.

## Random moods and circumstances

**Status:** Unproven.

I have tried giving people extra circumstances such as a mood, a rushed day or
a recent experience. This can make responses more colourful, but random detail
can become random noise. It is more promising when the circumstance has a
clear reason to affect the decision and can be tested against the same profile
without it.

## People who are too sensible

**Status:** Open problem.

Models often make people more rational, consistent and cautious than real
humans. Prompting them to be less rational can move the answers, but it can just
replace one shared bias with another. I have not found a general correction
that improves every kind of question.

## Reverse the options

**Status:** Keep as a check.

Option order can affect an answer. Rotate the order across people or repeat a
small run with the order reversed. A result that disappears is not strong
enough to build on.

## Leave out "don't know"

**Status:** Keep.

Given a "don't know" option, people grabbed it far more than real respondents,
even about their own habits. 32% didn't know whether they'd checked a food
hygiene rating. In the survey, 3% said that. The model was handing its own
uncertainty to the person. The probabilities already show how sure each person
is, so nxk leaves the option out.

## Extra answering rules

**Status:** Didn't help.

I tried adding a few broad rules to every question, like "weigh all of this
person's circumstances" and "hold views as firmly as they would". Results got
slightly worse and age differences barely moved. Earlier tests with other
models went the same way, so the default instruction stays short.
