# PersonaGen filters

nxk targets PersonaGen 4.0 (API and persona schema `4.0.0`). The filter list is
not copied here. The live catalogue is the only complete and current source,
and it differs by country: the same field can take different values in the UK
and the US, and some fields exist in one country only (UK `social_grade`,
`higher_education_qualification`; US `ethnic_origin_detailed`,
`county_urbanization_class_nchs`, `family_income_at_age_16`). A field the schema
defines may also not be drawn yet in a release; the end of the catalogue lists
those under "Not generated yet", and a request that filters on one is refused.
Read it with the cached helper:

```bash
node scripts/catalogue.mjs uk                      # sections and field names
node scripts/catalogue.mjs us --group work         # one section as a table
node scripts/catalogue.mjs us --grep income        # field rows mentioning a word
node scripts/catalogue.mjs uk --field home_tenure  # every value of one field
```

Never carry a value from one country to the other, or from a 3.1 request to
4.0: 4.0 renamed the fields and recoded the values.

## How a filter is written

- The key is the field's bare name. `current_occupation` filters
  `work.current_occupation`; the section is only for reading.
- A categorical or coded field takes a list of its codes, for example
  `"home_tenure": ["owned_outright", "owned_with_a_mortgage_or_loan"]`. A coded
  field (occupation, industry, local area) is answered as `{ "code", "title" }`
  and filtered by its code; find codes with `GET /{country}/search?q=`.
- A range field takes `{ "min": 25, "max": 44 }`, either bound optional. Age
  is `age_years`; there is no age band.
- Values within a field are OR, different fields are AND. Omit a field rather
  than sending an empty list.
- The catalogue marks fields "not filterable": free text (`job_title`), lists
  (`interests`, `long_term_health_conditions`, `other_pet_types`,
  `online_activities_last_3_months`), measured numbers (`height_cm`, `bmi`) and
  fields drawn conditionally on others, such as the twelve `purchasing_role_*`
  fields. Draw and filter those locally, or filter on the field they depend on
  (`current_occupation`, `job_level`, `organisation_size`).
- A value with no share has none because the model holds no marginal for it.
  A share is a rounded public statistic ("<1%" below one percent), not a
  forecast for your audience; `personas/validate` sizes a combination.

## Where to look

Section keys are also the `sections` names of a draw.

| Question is about | Section | Typical fields |
| --- | --- | --- |
| Who they are | `identity`, `origin_and_language` | `age_years`, `sex_at_birth`, `ethnic_group`, `country_of_birth`, `main_language` |
| Where they live | `place` | `region`, `settlement_size`, `neighborhood_type`, `county_or_local_authority` |
| Household and family | `household_and_family` | `household_type`, `life_stage`, `own_dependent_children_at_home`, `youngest_dependent_child_age`, `unpaid_care_hours_per_week` |
| Home, pets, cars, travel | `home_and_travel` | `home_tenure`, `accommodation_type`, `outdoor_space_at_home`, `pets_in_household`, `vehicles_in_household`, `usual_travel_to_work_mode` |
| Education | `education` | `highest_qualification`, `current_education_enrolment` |
| Work and employer | `work` | `economic_activity_status`, `current_occupation_major_group`, `current_occupation`, `employer_industry_section`, `organisation_size`, `job_level`, `management_responsibility`, `usual_work_location` |
| Money | `money` | `personal_income_before_tax_per_year`, `household_income_before_tax_per_year`, `managing_financially`, `could_cover_an_unexpected_expense`, debt bands |
| Health | `health` | `general_health`, `day_to_day_activities_limited_by_health`, `physical_activity_per_week`, `smoking_status` |
| Technology and media | `digital_and_media` | `internet_use_frequency`, `social_media_use_frequency`, `new_technology_adoption`, `changes_online_privacy_settings` |
| Shopping and decisions | `shopping_and_decisions` | `compares_prices_before_buying`, `brand_choice_when_shopping`, `buys_more_when_items_are_on_promotion`, `usual_channel_for_non_food_shopping`, `financial_risk_tolerance` |
| Beliefs and politics | `beliefs_and_politics` | `religion`, `party_identification`, `political_ideology` (keep political decisions out of this workflow) |
| Personality and skills | `personality_and_skills` | Big Five quintiles and percentiles, `literacy_proficiency`, `numeracy_proficiency` |
| Interests | `interests` | `interests` entries `{ family, specific, intensity }`, `interest_count` |
| Looks | `body_and_appearance` | 74 fields; send them to a model only when the question is about appearance |

Work questions. Resolve the occupation with search, check the returned title,
and filter on the level the audience needs: `current_occupation_major_group`
(for example professional occupations), `current_occupation_group` (UK,
three-digit minor group) or `current_occupation` (one detailed code).
`economic_activity_status: ["in_employment"]` keeps current workers; a person
outside the universe has a named value such as `not_in_employment`. Seniority is
`job_level` and `management_responsibility`; employer size is
`organisation_size`. The `purchasing_role_*` fields describe a person's role in
their organisation's purchases of a product area; they are drawn after the
filter and cannot be filtered, so draw the occupation and level, then filter on
the role locally and size the draw by the share that qualifies. They do not
give a budget or a buying committee; put situation constraints in the scenario.

What the profile does not contain stays outside it: a company's budget, software
stack or a product the person already owns. Supply those as an explicit
situation.
