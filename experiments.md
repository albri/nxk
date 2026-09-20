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

## Add domain-specific details to a profile

**Status:** Idea.

Take shampoo brand as a deliberately contrived example. An agent could add it
as a new dimension, but assigning each person a brand with a separate model
call would probably produce the wrong market share and weak links to the rest
of their life.

For the new dimension to work, the agent would probably need many maps rather
than one:

1. Find the relevant brands and an overall distribution for the market.
2. Identify the existing dimensions most likely to affect the choice. For
   shampoo, that might include age, income, gender and hair type.
3. Generate conditional maps for those dimensions, plus bridge maps for useful
   joins between them, such as age × hair type.
4. Combine the maps into a probability distribution for each persona, then
   assign a plausible brand from it.
5. Save the enriched personas and use them in the actual experiment.

An agent could probably use Jev to generate these maps cheaply enough to make
this practical. The enrichment would happen before the experiment starts, so
every later question sees the same assigned value.

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
