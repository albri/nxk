# Drawing people and asking questions

## Connections

| Service | Request | Authentication |
| --- | --- | --- |
| PersonaGen | `POST https://api.personagen.dev/{uk\|us}/personas` | `X-API-Key: <key>` |
| Jev | `POST https://api.typesafe.ai/v1/systemone` | `Authorization: Bearer <key>` |

Both take `Content-Type: application/json`. Use the credentials supplied by the
user's environment; their storage and variable names are up to the user.
PersonaGen also accepts `X-Demo: true` without a key, limited to 25 requests
per hour per IP. This covers PersonaGen only; Jev needs its own key and credit.
A supplied local PersonaGen instance uses its own URL and development key.

Current contracts: [PersonaGen](https://personagen.dev/docs/getting-started),
[TypeSafe HTTP API](https://docs.typesafe.ai/api.md). Consult the TypeSafe docs
when changing the evaluator integration; no separate installed skill is required.

## Draw

```json
{
  "count": 100,
  "seed": "my-decision-1",
  "filters": {
    "age_group": ["25-34", "35-44"],
    "pet_type_combo": ["dog_only"]
  }
}
```

Omit `filters` for a broad adult draw. Values within one field are OR;
different fields are AND. Omit unused fields rather than sending empty values.
Batch size is 1–1,000. The response is `{ success: true, data: [...], metadata }`;
`data` is the array, not `data.personas`. The singular `/persona` route returns
one object in `data`.

Read `metadata.filtering.warnings` and verify count and relevant emitted fields.
A narrow combination can be unsupported or exhaust the generator's attempts;
fix the requested combination rather than retrying it unchanged. Do not
silently drop a constraint to fill the sample.

Save the draw and its metadata. Within the same generator contract, seed,
country and filters repeat the people. Changing the generator may change the
draw, so reuse saved profiles for exact comparisons. When splitting a large
draw into batches, give each batch a different seed to avoid duplicates.

### Find the right filters

Call `GET /{country}/capabilities` before you choose filters. The response
contains `filter_catalogue`. This catalogue lists every field that the
generation routes accept for that country. The fields are grouped for reading,
and each field has its accepted values or a note that the values come from
facet search.

If the response has no `filter_catalogue`, the API is out of date. Use
[filters.md](filters.md) and tell the user that the API is out of date.

[filters.md](filters.md) is a readable copy of the same catalogue. Use it when
you work offline. If the file and the response disagree, use the response.

Compare the contract versions in the response with the versions at the top of
filters.md. If the versions changed, read the fields from the response. Report
the version that you used.

Probe a new filter combination with a small draw before a full batch.

For occupations, call
`GET /{country}/facets/occupations/search?q=<encoded phrase>&limit=5`.
Read `data.results`, choose a relevant candidate and pass its `occupation_code`
or `canonical_role` as a structured filter. Search is broad: "product manager"
can return manufacturing managers first. Inspect the title, generation status
and warnings; rank alone is not a match. Prefer `generated_safe` candidates.

For current professionals, combine a suitable employment state with
`career_context_scope: ["current_role"]`. A retired person can still have a
valid occupational background. Verify `work.occupation_code`,
`work.occupation_title` and `work.career_context.scope` in the returned people.

Useful path differences:

| Filter | Emitted field |
| --- | --- |
| `location` | `origin.region` |
| `homeownership_status` | `household.housing_tenure` |
| `occupational_background` | `work.occupation_domain` |
| `income_source` | `economic.primary_personal_income_source` |
| `career_seniority`, `decision_role`, `company_size_band` | `work.career_context.*` |
| `career_context_scope` | `work.career_context.scope` |
| `age_group` | Derive from `identity.age` |
| `number_of_children` | `household.number_of_children` is numeric; map to the requested band |
| `pet_type_combo` | Derive the combination from `behavior.pet_types` |

Most other fields are in the matching `household`, `economic`, `behavior`,
`decisioning` or `work` group. Inspect one record before writing field access.

Always apply the supported server-side filters first. Add client-side filtering
only for extra criteria the API cannot express, such as a particular interest.
Reuse saved profiles where possible. Start with a small filtered draw and count
how many qualify before requesting more. Use that retention rate to estimate
the total draw needed, check `metadata.usage`, and set a modest cap on further
generation. Keep both drawn and retained counts.

For example, if 20 of 100 drawn profiles qualify, roughly 500 draws might yield
a group of 100. If only one qualifies, do not automatically scale up to 10,000.
Explain the limit and offer a smaller sample or broader conditions. Never
burn through a user's 100,000-persona monthly allowance to retain 100 people.

## Evaluate

This JavaScript builds one complete Jev request from a drawn persona. `jevKey`
is the credential supplied by the environment. Substitute the situation and
options for the user's decision.

```js
const { appearance, metadata, name, id, ...profile } = persona;
const firstName = name.first_name;
const options = [
  "Two-day battery; standard camera.",
  "One-day battery; better camera.",
  "Neither; look for a different phone."
]; // Rotate this array between people; use the same order below.

const body = {
  model: "jev-latest",
  state: {
    respondent: { firstName, profile: { country: "uk", ...profile } },
    survey: {
      context: "Imagine replacing your phone. Both models cost £300, with the same screen, storage, speed, size, warranty and software support. One lasts two days, with good daylight photos but weaker low-light and moving-subject photos. The other lasts one day, with clearer low-light photos and sharper pictures of moving people or pets. Both recharge at the same speed. You can choose a different phone.",
      questions: {
        phone: { text: "Which phone would you choose?", options }
      }
    }
  },
  questions: {
    phone: {
      type: "choice",
      instructions: "Based on `respondent.profile`, which answer would this person give to `survey.questions.phone.text` in the situation described in `survey.context`? The available answers are in `survey.questions.phone.options`. Apply the person's stated circumstances; predict their response rather than recommending the best option in general.",
      criteria: Object.fromEntries(options.map(text => [text, null]))
    }
  }
};
const response = await fetch("https://api.typesafe.ai/v1/systemone", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${jevKey}`
  },
  body: JSON.stringify(body),
  signal: AbortSignal.timeout(30000)
});
if (!response.ok) throw new Error(`Jev HTTP ${response.status}`);
const result = await response.json();
const answer = result.answers?.phone;
if (!answer || !options.includes(answer.choice) ||
    options.some(key => !Number.isFinite(answer.probabilities?.[key]) ||
      answer.probabilities[key] < 0 || answer.probabilities[key] > 1)) {
  throw new Error("Invalid answer");
}
const total = options.reduce((sum, key) => sum + answer.probabilities[key], 0);
if (Math.abs(total - 1) > 0.03) throw new Error("Invalid probability total");
// Save the complete response alongside a stable ID for this saved profile.
```

Jev tends to make people keener on new technology than surveys find. When
asking about adopting something new, put its real cost, effort and risk in the
situation.

Send the full profile rather than `description.short` or a selected field map.
The example excludes appearance and request metadata; keep the other groups.
Set `country` to the draw's country. Keep full option text unique and preserve
the mapping back to your own IDs in code. For each question, update the state
path in the instruction. For a Score, ask for the rating and give concrete
ordered levels. See [Score](https://docs.typesafe.ai/primitives/score.md)
and [Noul](https://docs.typesafe.ai/primitives/noul.md) for their request shapes.

Several independent questions about the same situation can share one request.
Every question sees the whole state: isolate different offer sets or price
situations in separate requests so one comparison cannot influence another.
Questions cannot see one another's answers. Follow-ups that depend on a selected
option need a later request containing that selection. Each later request
sends the profile again.
Text or JSON goes into Jev; for visual material, provide an explicit description
or use an evaluator that accepts images. Do not describe a text comparison as
a visual test.

### Responses and aggregation

Jev returns `{ model, answers, usage }`. Each answer is inside
`answers[questionId]`:

| Type | Fields | How to combine the answers |
| --- | --- | --- |
| Choice | `choice`, `probabilities`, `confidence` | Average each option's probability for average model support |
| Noul | `noul` | Average yes probability; label as model support, not a count |
| Score | `score`, `legend`, `probabilities`, `confidence` | Average `score` on the stated scale |

Check required answer IDs, valid option keys and finite numbers before aggregating.
A missing result is a failure, not a zero. Keep the same measure, options and
scale across a comparison. Keep each person's full probability set for group
comparisons.
For relative Noul weights, individual sampling and diagnosing collapse, use
[probabilities.md](probabilities.md). Model confidence describes the answer
distribution, not accuracy against real people.

## Keep calls bounded

- Check a few contrasting full profiles before completing the batch. Inspect
  the full probability sets as well as valid JSON; retain those profiles in the
  sample. Keep any invented constraint probes outside the audience totals.
  Cache successful answers and resume only missing ones.
- Use bounded concurrency, for example eight calls at a time, and timeouts.
- Stop the batch on authentication, billing or monthly quota errors. Report
  the problem; extra retries will not solve it.
- For temporary rate limits or overload, honour `Retry-After` when present,
  otherwise back off. Keep retries bounded and report any incomplete sample.

Default PersonaGen key allowances are 1,000 discovery calls and 100,000
personas per UTC calendar month, separately metered. Key bursts allow 120
tokens/minute: one per request plus one per 100 personas. The IP limit is 600
requests/minute. The response's `metadata.usage` is authoritative for that key.
Free generation still spends persona allowance, so reuse draws.

Recorded Jev runs used roughly 2,900 profile tokens per person. At the rate
used for those runs, one question cost about $0.00012 per person and twenty
batched questions about $0.0003. These are run estimates, not a current tariff.
Record returned token usage, resolved model and elapsed time. More questions
still cost tokens; batching saves resending the profile.

## When comparing groups

A quick check can use one draw. If an action rests on a group represented by
only a few profiles, repeat with fresh seeds; three draws is a useful starting
point. Compare versions on the same saved profiles when asking a direct
preference. For separate exposure to a framing treatment, assign people to
different arms instead of showing both treatments together.

Only explore further groups when the decision needs it. Apply the skill's
question check before each new comparison. Recheck a consequential result
if the offer's price or meaning changes.
