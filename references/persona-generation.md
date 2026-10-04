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

Verify the returned count and relevant emitted fields. A narrow combination
can be unsupported or exhaust the generator's attempts; fix the requested
combination rather than retrying it unchanged. Do not silently drop a
constraint to fill the sample.

Save the draw and its metadata. Within the same generator contract, seed,
country and filters repeat the people. Changing the generator may change the
draw, so reuse saved profiles for exact comparisons. When splitting a large
draw into batches, give each batch a different seed to avoid duplicates.

### Find the right filters

Call `GET /{country}/capabilities` before you choose filters. The response
contains `filter_catalogue`, which lists the public filter fields for that
country. The fields are grouped for reading, and each field has its accepted
values or a note that the values come from facet search.

If the response has no `filter_catalogue`, the API is out of date. Use
[filters.md](filters.md) and tell the user that the API is out of date.

[filters.md](filters.md) is a readable copy of the same catalogue. Use it when
you work offline. If the file and the response disagree, use the response.

Compare the contract versions in the response with the versions at the top of
filters.md. If the versions changed, read the fields from the response. Report
the version that you used.

## Discover, validate and draw

Use advertised operation links so clients can follow the country contract. The
compact capability response contains no inline filter-value arrays; look up a
dimension in pages. A successful validation is static preflight only: it does
not initialize the generator or guarantee that a later draw will return the
requested count. Send the same deterministic request body to generation, and
keep any 400 or 422 result as a failure rather than widening filters silently.
The helper client requires the corresponding operation link; if an older API
does not advertise one, do not guess the newer route.

```js
import { createPersonaGenClient } from "./personagen-client.mjs";

const client = createPersonaGenClient({
  headers: process.env.PERSONAGEN_API_KEY
    ? { "X-API-Key": process.env.PERSONAGEN_API_KEY }
    : { "X-Demo": "true" }
});
const country = "us";
const discovery = await client.capabilities(country, { compact: true });
if (discovery.status !== 200 || discovery.body.success !== true) {
  throw new Error(`Capability lookup failed with HTTP ${discovery.status}`);
}
const sectorPage = await client.filterValues(country, "employer_sector", {
  q: "software",
  offset: 0,
  limit: 25
});
if (sectorPage.status !== 200) throw new Error("Filter value lookup failed");

const request = {
  count: 100,
  seed: "b2b-workplace-pilot-01",
  filters: {
    career_context_scope: ["current_role"],
    employer_sector: ["saas_software", "professional_services"]
  }
};
const result = await client.validateThenGenerate(country, request);
if (!result.validation.accepted) {
  // Keep the returned 400/422 details and revise the audience deliberately.
  throw new Error(`Audience validation returned HTTP ${result.validation.status}`);
}
if (!result.generated || result.generation.status !== 200 || result.generation.body.success !== true) {
  throw new Error("Generation did not return the validated audience");
}
const people = result.generation.body.data;
if (!Array.isArray(people) || people.length !== request.count) {
  throw new Error("Generation returned a different count than requested");
}
```

For a comparison, reuse the same saved generated people and scenario, changing
only the treatment being compared. Static validation does not replace checking
the emitted fields or recording generation failures.

Probe a new filter combination with a small draw before a full batch.

For occupations, call
`GET /{country}/facets/occupations/search?q=<encoded phrase>&limit=5`.
Read `data.results`, choose a relevant candidate and pass its `occupation_code`
or `canonical_role` as a structured filter. Search is broad: "product manager"
can return manufacturing managers first. Check the title and domain fit; rank
alone is not a match. Choose a plausible candidate and pass its code or
canonical role as a structured filter.

For current professionals, combine a suitable employment state with
`career_context_scope: ["current_role"]`. A retired person can still have a
valid occupational background. Verify `work.occupation_code`,
`work.occupation_title` and `work.career_context.scope` in the returned people.
If purchase authority is present, it describes prior involvement in a product
area; it does not set the budget or decision authority for a hypothetical
choice. Put situation-specific constraints in the survey context.

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

This JavaScript builds one Jev request from a saved persona. It uses the same
tested public-field projection as the benchmark, keeping ordinary profile facts
while limiting work context to public career and employer fields. `persona` is
one saved `data` object from a single or batch response. `jevKey` is the
credential supplied by the environment. Substitute the situation and options
for the user's decision.

```js
import { buildPersonaRequest } from "../benchmarks/public-persona.mjs";

const options = [
  "Two-day battery; standard camera.",
  "One-day battery; better camera.",
  "Neither; look for a different phone."
];
const study = {
  country: "uk",
  surveyed: "October 2026",
  context: "Imagine replacing your phone. Both models cost £300, with the same screen, storage, speed, size, warranty and software support. One lasts two days, with good daylight photos but weaker low-light and moving-subject photos. The other lasts one day, with clearer low-light photos and sharper pictures of moving people or pets. Both recharge at the same speed. You can choose a different phone.",
  question: "Which phone would you choose?",
  options
};
const order = [0, 1, 2]; // Rotate between people; use the returned order below.
const body = buildPersonaRequest(study, persona, order);
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
const orderedOptions = body.state.survey.questions.q.options;
const answer = result.answers?.q;
if (!answer || !orderedOptions.includes(answer.choice) ||
    orderedOptions.some(key => !Number.isFinite(answer.probabilities?.[key]) ||
      answer.probabilities[key] < 0 || answer.probabilities[key] > 1)) {
  throw new Error("Invalid answer");
}
const total = orderedOptions.reduce((sum, key) => sum + answer.probabilities[key], 0);
if (Math.abs(total - 1) > 0.03) throw new Error("Invalid probability total");
// Save the complete response alongside a stable ID for this saved profile.
```

Jev tends to make people keener on new technology than surveys find. When
asking about adopting something new, put its real cost, effort and risk in the
situation.

Keep the full profile rather than reducing it to `description.short`. The helper
excludes appearance and request metadata and copies only the public person shape.
Set `country` to the draw's country. Keep full option text unique and preserve
the mapping back to your own IDs in code. For each question, update the state
path in the instruction. For a Score,
ask for the rating and give concrete ordered levels. See
[Score](https://docs.typesafe.ai/primitives/score.md)
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
