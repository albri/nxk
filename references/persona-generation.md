# Drawing people and asking questions

nxk targets **PersonaGen 4.0** (API and persona schema `4.0.0`). Every response
and the catalogue name the version they come from. If they report another
major version, stop and tell the user: filter names, value codes and payload
paths differ between major versions.

## Connections

| Service | Request | Authentication |
| --- | --- | --- |
| PersonaGen | `https://api.personagen.dev/{uk\|us}/...` | `X-API-Key: <key>`, optional |
| Jev | `POST https://api.typesafe.ai/v1/systemone` | `Authorization: Bearer <key>` |

Both take `Content-Type: application/json`. Use the credentials supplied by the
user's environment; their storage and variable names are up to the user. A
supplied local PersonaGen instance uses its own URL and development key. This
covers PersonaGen only; Jev needs its own key and credit.

Without a key, PersonaGen allows 10 personas per request and 25 persona
requests an hour per IP, which is enough to look but not to run a study. A free
key (personagen.dev) raises a request to 1,000 personas. Discovery and
validation do not spend the persona allowance; see
[Keep calls bounded](#keep-calls-bounded) for their limits. Send
`Accept-Encoding: gzip`: answers of 1 KB or more come back compressed.

Current contracts: [PersonaGen](https://personagen.dev/docs/getting-started),
[TypeSafe HTTP API](https://docs.typesafe.ai/api.md). The API describes itself:
`GET /llms.txt` is a one-page guide and `GET /openapi.json` the full contract.
Consult the TypeSafe docs when changing the evaluator integration; no separate
installed skill is required.

## Target an audience

Five steps, in this order. A precise audience costs four to five small calls
and no probe draws.

1. **Discover the fields once.** The catalogue lists every field of a persona:
   its section, meaning, who has a value, how to filter it, and each value with
   its share of the population. It is static for a release and carries an
   `ETag`, so keep it. The whole Markdown form is about 90 KB, far more than a
   task needs, so read it in parts:

   ```bash
   node scripts/catalogue.mjs uk                      # sections and field names, about 1.5k tokens
   node scripts/catalogue.mjs uk --group work         # one section as a table
   node scripts/catalogue.mjs uk --grep tenure        # field rows mentioning a word
   node scripts/catalogue.mjs uk --field home_tenure  # every value of one field
   ```

   The script caches under the system temp directory (`NXK_CACHE_DIR` to move
   it), uses a copy under a day old with no request, and otherwise revalidates
   with the `ETag` so an unchanged catalogue costs a 304 with no body. Set
   `PERSONAGEN_URL` for a local API. Without the script, request
   `GET /{country}/catalogue?format=md` yourself, send `If-None-Match` with the
   saved `ETag`, and cache the result. `?groups=work` or
   `?fields=home_tenure,region` returns only those parts. Never fetch it per
   question.

2. **Find values by their words.** `GET /{country}/search?q=nursing&limit=8`
   searches every filterable field's values and labels at once and returns
   `{field, value, label, share}`. Add `fields=current_occupation,current_occupation_group`
   to stay inside those fields. Search matches whole words in the labels, so
   the form of the word matters. In the UK, "nurse" finds the detailed nursing
   codes (`2231` to `2236`), dental nurses and one group, veterinary nurses
   (`324`), but not the group most nurses are in. "Nursing" finds that group
   (`223`, Nursing Professionals) and nursing assistants. When the group you
   expect doesn't appear, search the other form of the word (nurse or
   nursing, teacher or teaching). Check the label against the person you want,
   and prefer the grouping that matches the audience: an occupation group
   (`223`) covers many detailed occupations, a detailed code (`2232`) one. A
   few fields exist in one country only, and a search or filter on a field the
   country lacks is refused.
   A share of "<1%" is normal for a detailed occupation.

3. **Validate the filter set once.** `POST /{country}/personas/validate` with
   the body you intend to draw with:

   ```json
   {
     "count": 100,
     "seed": "nurse-renters-1",
     "filters": {
       "age_years": { "min": 25, "max": 44 },
       "current_occupation_group": ["223"],
       "home_tenure": ["rented_from_a_private_landlord_or_letting_agency"]
     }
   }
   ```

   A 200 means the filters are accepted and no one was drawn. It returns
   `estimated_share` (the share of all adults, rounded: "about 36%",
   "about 0.8%", or "<0.01%" when it is too small to size), `range` (a 95%
   interval), `basis` with `basis_detail` (how the share was estimated) and,
   usually, `narrowest_filter`: the filter whose removal raises the share most,
   with the share without it. Use it this way:

   - Read the share as how rare the audience is, not as the chance a draw
     succeeds. Every drawn person matches the filters, so a rare audience still
     fills a draw of 100. What rarity costs is breadth: a very narrow audience
     is a few people in thousands, so their answers describe a thin slice of
     the country; say so.
   - Under about 0.1% is a poor audience to draw from: loosen
     `narrowest_filter` first and validate the new set. Validate each filter
     set once; the answer for the same set does not change.
   - A 200 accepts the filters; it does not promise people. When
     `basis_detail` says no one in the reference sample matched, the audience is
     either rare or impossible, and only a draw can tell which. This is the one
     case for a probe: draw 10 people once to find out.
   - A 400 (`invalid_filters`) lists each wrong field in `issues`. A 422
     (`UNSATISFIABLE_FILTERS`) means no person can meet the filters together:
     `details.conflicting_dimensions` is the smallest set that conflict, and
     `details.drop_one_to_match`, when present, the filters whose removal alone
     would give a match. Other 422s are `too_many_filters` (more than 10
     fields) and `filters_too_rare_to_draw`. Change the audience on purpose.
     Do not retry a refusal unchanged and do not drop a constraint to fill the
     sample.

4. **Draw.** `POST /{country}/personas` with the validated body. Next section.

5. **Keep the draw** with its seed, filters, `generator_version` and the
   sections you asked for, so a later comparison reuses the same people.

Filter rules. A filter key is the field's bare name (`current_occupation`
filters `work.current_occupation`). A categorical or coded field takes a list of
its codes; a range field takes `{"min": n, "max": n}` with either bound optional.
Values within a field are OR; different fields are AND. A list field such as
`long_term_health_conditions` matches a person who has at least one of the
listed values. A request can name at most 10 fields. Fields marked "not
filterable" in the catalogue, such as `interests` and `job_title`, cannot be
sent; filter those locally and draw extra. See [filters.md](filters.md) for how
the catalogue maps to the groups that matter for common questions.

## Draw

```json
{
  "count": 100,
  "seed": "nurse-renters-1",
  "filters": { "...": "as validated" },
  "sections": ["name_and_summary", "identity", "work", "money", "household_and_family", "shopping_and_decisions"]
}
```

- `count` is 1 to 1,000 (10 without a key). Omit `filters` for a broad adult
  draw. Omit `seed` and the API picks one and reports it in `metadata`.
- The response is `{ success: true, data: [...], metadata }`; `data` is the
  array. `metadata.personas` lists each person's own seed.
- **Pages.** Person `i` of a seeded draw is drawn from `<seed>_<start + i>`. A
  request with `start: 100, count: 100` returns the same people as positions
  101 to 200 of one request for 200. Draw 50 first and add `start: 50` to
  extend the same panel; never redraw people you hold. `start` needs a `seed`.
  Persist both.
- **Streaming.** `Accept: application/x-ndjson` returns one
  `{ "seed": ..., "data": { ...sections } }` line per person as it is drawn and
  a final `{ "metadata": ... }` line. Prefer it for 200 or more people so each
  person can be saved, or sent to the evaluator, as it arrives; a failure after
  the stream starts ends it with an `{ "error": ... }` line.
- **Sections.** `sections` cuts each person to the named sections and saves
  bytes and tokens; `exclude_sections` keeps every section but the named ones
  (send one or the other). The sections are `name_and_summary`, `identity`,
  `origin_and_language`, `place`, `household_and_family`, `home_and_travel`,
  `education`, `work`, `money`, `health`, `body_and_appearance`,
  `digital_and_media`, `shopping_and_decisions`, `beliefs_and_politics`,
  `personality_and_skills` and `interests`. Ask for what the evaluation or the
  grouping needs. For an answering model, send the full life without
  `body_and_appearance` (`"exclude_sections": ["body_and_appearance"]`;
  appearance is about a quarter of the payload and rarely affects an answer).
  Cutting further saves tokens but costs accuracy: in testing, a profile
  without beliefs, personality, shopping, interests and media answered less
  accurately, so do it only when the budget forces it.
  Always include `name_and_summary` when evaluating, for the first name.
- **One person.** `GET /{country}/persona?seed=abc&sections=identity` is a
  seeded persona with an `ETag`; repeat it with `If-None-Match` and a 304 costs
  nothing. `POST /{country}/persona` takes the same body without `count`.
- **Shapes.** A section is an object of flat, uniquely named fields. A coded
  field (occupation, industry, local area) is `{ "code", "title" }` and is
  filtered by its code; a field outside the person's universe is a named value
  such as `not_in_employment`, or `null` for a number. `interests` holds
  `[{ "family", "specific", "intensity" }]` entries (casual, regular or
  committed); `interest_families` lists the person's main interest areas and
  `interest_count` counts them; `interest_participation` lists every area they
  took part in over the last 12 months.

Verify the returned count and the fields the audience depends on, including that
related fields agree (an occupation title with its major group and industry); a
mismatch is a finding to report, not something to repair in the sample. Save the draw
and its metadata. A seed, country, filters, sections and `generator_version`
repeat the same people; a new generator version may change them, so reuse saved
profiles for exact comparisons. For several independent draws, change the seed.
Save the `model` each answer reports too. An alias such as `jev-latest` moves
to a new version without notice, and a new version can change how far apart
groups come out, so compare answers only within one version.

Apply server-side filters first and filter locally only on fields the API
cannot filter. For the local part, draw more than you need and keep both the
drawn and the retained counts; check `metadata.usage`; set a modest cap on
further drawing. If one in twenty qualifies, 100 retained people need about
2,000 drawn, which is about as far as it is worth going. If far fewer qualify,
stop and offer a broader audience.

## Evaluate

This JavaScript builds one Jev request from a saved persona. It uses the same
tested projection as the benchmark, which keeps the person's life and drops the
appearance section and the surname. `persona` is one saved element of `data`
from a batch response (or the `data` of a single-persona response, or one
`data` of a stream line). `jevKey` is the credential supplied by the
environment. Substitute the situation and options for the user's decision.

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

The body puts the person in `state.respondent` (`firstName` and `profile`), the
situation in `state.survey.context`, and the question and its options, in the
order shown, in `state.survey.questions.q`. `questions.q` is what Jev answers:
its `type`, the `instructions` that point at those state paths, and one
`criteria` entry per option. The instruction is tested as it stands. Extra
coaching sentences made answers less accurate, so to change an answer change
the situation or the options, never the instruction.

Jev tends to make people keener on new technology than surveys find. When
asking about adopting something new, put its real cost, effort and risk in the
situation.

Keep the full life rather than reducing it to `name_and_summary.summary`. The
helper sends the person's first name and every saved section except
`body_and_appearance`, which is the 4.0 payload as the API returned it, with
the surname taken out of the name and the summary. If you drew with `sections`
to save bytes, the helper copes with whatever sections you kept (it needs
`name_and_summary.first_name`).
Set `country` to the draw's country. Keep full option text unique and preserve
the mapping back to your own IDs in code. For each extra question, add it under
`state.survey.questions` and `questions` with its own key, and point its
instruction at that key. For a Score,
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
  sample. If you add made-up test people to check a constraint, leave them out
  of the totals.
  Cache successful answers and resume only missing ones.
- Use bounded concurrency, for example eight calls at a time, and timeouts.
- Stop the batch on authentication, billing or monthly quota errors. Report
  the problem; extra retries will not solve it.
- For temporary rate limits or overload, honour `Retry-After` when present,
  otherwise back off. Keep retries bounded and report any incomplete sample.

PersonaGen meters three things apart, and `metadata.usage` in each response is
authoritative:

| Spent by | With a key | Without a key |
| --- | --- | --- |
| Drawing (`personas`, `persona`) | 100,000 personas a month; a request costs one burst token plus one per 100 personas, 120 tokens a minute | 10 personas a request, 25 requests an hour per IP |
| Validating (`personas/validate`) | 1,000 a day | 30 an hour per IP |
| Discovery (`catalogue`, `search`) | 1,000 a month | a per-minute burst limit only |

Cached catalogue reads, one validation per filter set and paged draws keep
well inside these. A 422 still counts as a validate call; a 400 (a wrong field
or value) does not, but read the field values before sending anyway. The IP
limit across all routes is 600 requests a minute. Seeded draws are
reproducible, so reuse them.

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

Only explore further groups when the decision needs it. Before each new
comparison, check the question again as SKILL.md's "Start small" does: a real
action, a real cost for every option, and an answer that could change the work. Recheck a consequential result
if the offer's price or meaning changes.
