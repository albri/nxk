const STRING = "string";
const NUMBER = "number";
const BOOLEAN = "boolean";
const STRING_ARRAY = "string[]";

const PUBLIC_PERSON_FIELDS = {
  name: { first_name: STRING, last_name: STRING },
  description: {
    short: STRING,
    frame: { $items: { key: STRING, label: STRING, value: STRING } },
  },
  identity: {
    age: NUMBER,
    birth_year: NUMBER,
    birthday: STRING,
    gender: STRING,
    ethnicity: STRING,
    sexual_orientation: STRING,
    religious_identity: STRING,
    religious_tradition: STRING,
    christian_tradition: STRING,
    religion_salience: STRING,
    political_leaning: STRING,
    political_orientation_group: STRING,
    political_alignment: STRING,
  },
  origin: {
    country_of_birth: STRING,
    immigration_status: STRING,
    migration_background_context: STRING,
    region: STRING,
    local_area: STRING,
    geographic_context: STRING,
    languages: STRING_ARRAY,
    english_proficiency: STRING,
    language_use_context: STRING,
  },
  background: {
    parental_education: STRING,
    childhood_socioeconomic_status: STRING,
    education: STRING,
  },
  economic: {
    personal_income_band: STRING,
    primary_personal_income_source: STRING,
    current_earned_income_source: STRING,
    social_grade: STRING,
    household_support_model: STRING,
    economic_dependency_role: STRING,
    household_resource_context: STRING,
    household_income_band_estimate: STRING,
    financial_planning_style: STRING,
    debt_load_context: STRING,
    financial_pressure_context: STRING,
  },
  household: {
    relationship_status: STRING,
    number_of_children: NUMBER,
    has_children: BOOLEAN,
    dependent_children_count_band: STRING,
    child_age_bands: STRING_ARRAY,
    youngest_child_age_band: STRING,
    oldest_child_age_band: STRING,
    parenting_stage: STRING,
    child_household_presence: STRING,
    family_lifecycle_stage: STRING,
    relationship_household_context: STRING,
    current_partnership_state: STRING,
    relationship_history_context: STRING,
    partnership_household_role: STRING,
    household_composition: STRING,
    life_stage_segment: STRING,
    caregiving_role: STRING,
    household_living_state: STRING,
    dependency_state: STRING,
    housing_tenure: STRING,
    homeownership_pathway: STRING,
    housing_type: STRING,
    garden_or_outdoor_space: STRING,
    recent_mover: STRING,
    renovation_status: STRING,
    debt_band: STRING,
    debt_profile: STRING,
  },
  behavior: {
    interests: STRING_ARRAY,
    has_pets: BOOLEAN,
    pet_types: STRING_ARRAY,
    pet_owner_intensity: STRING,
    physical_activity_level: STRING,
    activity_routine_context: STRING,
    fitness_engagement_level: STRING,
    primary_transport_mode: STRING,
    car_access: STRING,
    commute_pattern: STRING,
    technology_confidence: STRING,
    digital_engagement_level: STRING,
    social_media_usage: STRING,
    digital_capability_level: STRING,
    digital_engagement_intensity: STRING,
    digital_privacy_posture: STRING,
    technology_adoption_orientation: STRING,
    price_sensitivity: STRING,
    purchase_channel_preference: STRING,
    brand_loyalty_orientation: STRING,
    promotion_responsiveness: STRING,
  },
  psychology: {
    literacy_level: STRING,
    numeracy_level: STRING,
    problem_solving_style: STRING,
    cognitive_capability_band: STRING,
    big_five_scores: {
      openness: NUMBER,
      conscientiousness: NUMBER,
      extraversion: NUMBER,
      agreeableness: NUMBER,
      neuroticism: NUMBER,
    },
    big_five_openness: STRING,
    big_five_conscientiousness: STRING,
    big_five_extraversion: STRING,
    big_five_agreeableness: STRING,
    big_five_neuroticism: STRING,
  },
  decisioning: {
    communication_preference: STRING,
    message_processing_style: STRING,
    purchase_risk_tolerance: STRING,
    persuasion_susceptibility: STRING,
    political_engagement_level: STRING,
  },
  health: {
    dietary_restrictions: STRING_ARRAY,
    health_conditions: STRING_ARRAY,
    mobility_or_exertion_context: STRING,
  },
};

const PUBLIC_DATA_GROUPS = Object.keys(PUBLIC_PERSON_FIELDS);
const PURCHASE_CATEGORIES = [
  "software_saas", "it_hardware", "marketing_advertising", "professional_services",
  "recruitment_staffing", "facilities_office", "raw_materials_inventory",
  "equipment_machinery", "travel_fleet", "insurance", "utilities_energy",
  "food_hospitality_supplies",
];
const PURCHASE_LEVELS = new Set([
  "org_does_not_buy", "no_role", "uses_or_requests", "recommends_or_evaluates",
  "approves_within_budget", "final_signoff",
]);
const PRIVATE_PROFILE_ID = /\bprivate_profile_[a-z0-9_]+\b|\b(?:v\d+_\d+_)?[a-z0-9]+(?:_[a-z0-9]+)*_candidate_\d{4}_\d{2}_\d{2}\b/i;
export const DEFAULT_INSTRUCTION = "Based on `respondent.profile`, which answer would this person give to `survey.questions.q.text` in the situation described in `survey.context`? The available answers are in `survey.questions.q.options`. Apply the person's stated circumstances; predict their response rather than recommending the best option in general.";

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function publicString(value) {
  if (typeof value !== "string" || PRIVATE_PROFILE_ID.test(value)) {
    return undefined;
  }
  return value;
}

function projectBySpec(value, spec) {
  if (spec === STRING) return publicString(value);
  if (spec === NUMBER) return typeof value === "number" && Number.isFinite(value) ? value : undefined;
  if (spec === BOOLEAN) return typeof value === "boolean" ? value : undefined;
  if (spec === STRING_ARRAY) {
    return Array.isArray(value)
      ? value.map(publicString).filter((item) => item !== undefined)
      : undefined;
  }
  if (spec.$items) {
    return Array.isArray(value)
      ? value.map((item) => projectBySpec(item, spec.$items)).filter((item) => item !== undefined)
      : undefined;
  }
  if (!isRecord(value)) return undefined;
  const output = {};
  for (const [key, childSpec] of Object.entries(spec)) {
    if (!Object.hasOwn(value, key)) continue;
    const child = projectBySpec(value[key], childSpec);
    if (child !== undefined) output[key] = child;
  }
  return output;
}

function projectIndustry(value) {
  if (!isRecord(value)) return undefined;
  const output = {};
  for (const key of ["code", "label", "parent_code"]) {
    const child = publicString(value[key]);
    if (child !== undefined) output[key] = child;
  }
  if (Array.isArray(value.sectors)) {
    output.sectors = value.sectors.map(publicString).filter((item) => item !== undefined);
  }
  return output;
}

function projectOperatingContext(value) {
  if (!isRecord(value)) return undefined;
  const output = {};
  if (Array.isArray(value.sales_channels)) {
    output.sales_channels = value.sales_channels.map(publicString).filter((item) => item !== undefined);
  }
  const complexity = publicString(value.organisation_complexity_band);
  if (["owner_only", "flat_team", "layered", "unknown"].includes(complexity)) {
    output.organisation_complexity_band = complexity;
  }
  return output;
}

function projectPurchaseAuthority(value) {
  if (!isRecord(value) || !isRecord(value.categories)) return undefined;
  const categories = {};
  for (const category of PURCHASE_CATEGORIES) {
    const item = value.categories[category];
    if (!isRecord(item)) continue;
    const level = publicString(item.level);
    if (!PURCHASE_LEVELS.has(level) || typeof item.probability !== "number" ||
      !Number.isFinite(item.probability) || item.probability < 0 || item.probability > 1) continue;
    categories[category] = { level, probability: item.probability };
  }
  return { categories };
}

function pickStrings(value, fields) {
  if (!isRecord(value)) return undefined;
  const output = {};
  for (const key of fields) {
    const child = publicString(value[key]);
    if (child !== undefined) output[key] = child;
  }
  return output;
}

function projectCareerContext(value) {
  const output = pickStrings(value, [
    "scope", "occupation_code", "canonical_role", "career_seniority", "management_scope",
    "business_ownership_status", "employer_type", "company_size_band", "company_size_band_semantics",
    "startup_stage_context", "decision_role", "public_sector_context",
  ]);
  if (!output) return undefined;
  const sectors = isRecord(value) && Array.isArray(value.sector_tags)
    ? value.sector_tags.map(publicString).filter((item) => item !== undefined)
    : undefined;
  if (sectors) output.sector_tags = sectors;
  const industry = projectIndustry(value.industry);
  const authority = projectPurchaseAuthority(value.purchase_authority);
  // Older saved/API bodies use a different internal field name. Read only the
  // ordinary values from it; nested provenance and diagnostics are discarded.
  const operatingInput = isRecord(value.operating_context)
    ? value.operating_context
    : value.synthetic_operating_context;
  const operating = projectOperatingContext(operatingInput);
  if (industry) output.industry = industry;
  if (authority) output.purchase_authority = authority;
  if (operating) output.operating_context = operating;
  return output;
}

function projectEmployerContext(value) {
  const output = pickStrings(value, [
    "context_kind", "employer_type", "business_ownership_status", "company_size_band",
    "company_size_band_semantics", "startup_stage_context", "public_sector_context",
  ]);
  if (!output) return undefined;
  const sectors = isRecord(value) && Array.isArray(value.sector_tags)
    ? value.sector_tags.map(publicString).filter((item) => item !== undefined)
    : undefined;
  if (sectors) output.sector_tags = sectors;
  const industry = projectIndustry(value.industry);
  const operatingInput = isRecord(value.operating_context)
    ? value.operating_context
    : value.synthetic_operating_context;
  const operating = projectOperatingContext(operatingInput);
  if (industry) output.industry = industry;
  if (operating) output.operating_context = operating;
  return output;
}

function projectWork(value) {
  const output = pickStrings(value, [
    "occupation_domain", "occupation_title", "occupation_code", "canonical_role", "employment_status",
    "employment_flexibility", "work_location_mode", "military_service_status", "public_sector_context",
  ]);
  if (!output) return undefined;
  if (isRecord(value) && typeof value.military_background === "boolean") {
    output.military_background = value.military_background;
  }
  const career = projectCareerContext(value.career_context);
  const employer = projectEmployerContext(value.employer_context);
  if (career && Object.keys(career).length) output.career_context = career;
  if (employer && Object.keys(employer).length) output.employer_context = employer;
  if (!output.occupation_title) {
    const fallback = isRecord(value.career_context) ? publicString(value.career_context.canonical_role) : undefined;
    if (fallback) output.occupation_title = fallback;
  }
  return output;
}

/** Fixed public-shape projection for saved personas before an external model request. */
export function projectPublicPersonaData(input) {
  if (!isRecord(input)) return {};
  const output = {};
  for (const group of PUBLIC_DATA_GROUPS) {
    if (!Object.hasOwn(input, group)) continue;
    const projected = projectBySpec(input[group], PUBLIC_PERSON_FIELDS[group]);
    if (projected !== undefined) output[group] = projected;
  }
  const work = projectWork(input.work);
  if (work) output.work = work;
  return output;
}

/** Return only a projected person state; caller supplies the scenario separately. */
export function projectPersonaForModel(person, country) {
  const publicPersona = projectPublicPersonaData(person);
  const firstName = publicString(publicPersona.name?.first_name);
  if (!firstName || !isRecord(person?.work) ||
    typeof publicPersona.work?.employment_status !== "string" || !["uk", "us"].includes(country)) {
    throw new Error("A saved person with a supported country, first name and work record is required");
  }
  const { name: _name, ...profile } = publicPersona;
  return { firstName, profile: { country, ...profile } };
}

function situation(study) {
  return [`It is ${study.surveyed}.`, study.context].filter(Boolean).join(" ");
}

/** Pure outbound Jev state builder. The scenario stays outside the person profile. */
export function buildPersonaRequest(study, person, order, instruction = DEFAULT_INSTRUCTION) {
  const options = order.map((index) => study.options[index]);
  const respondent = person
    ? projectPersonaForModel(person, study.country)
    : { profile: { country: study.country } };
  return {
    model: "jev-latest",
    state: {
      respondent,
      survey: { context: situation(study), questions: { q: { text: study.question, options } } },
    },
    questions: {
      q: {
        type: "choice",
        instructions: instruction,
        criteria: Object.fromEntries(options.map((text) => [text, null])),
      },
    },
  };
}
