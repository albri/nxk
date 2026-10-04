import assert from "node:assert/strict";
import test from "node:test";
import { buildPersonaRequest, projectPersonaForModel } from "./public-persona.mjs";

const INTERNAL_ID = "private_profile_sentinel";

function study() {
  return {
    country: "us",
    surveyed: "October 2026",
    question: "Would you choose this offer?",
    context: "Imagine choosing between the offer and your current option. This is hypothetical.",
    options: ["Choose the offer", "Keep the current option"],
  };
}

function savedPerson() {
  return {
    id: "saved-person-id",
    metadata: {
      generator_profile: INTERNAL_ID,
      trace: { profile_id: INTERNAL_ID, source_posture: "private" },
    },
    name: { first_name: "Avery", last_name: "Morgan", profile_id: INTERNAL_ID },
    appearance: { appearance_summary: "private appearance details" },
    description: {
      short: "A synthetic person with a distinct work and household life.",
      frame: [{ key: "work", label: "Work", value: "Product manager", profile_id: INTERNAL_ID }],
      hidden_trace: { artifact_sha256: "private" },
    },
    identity: { age: 38, gender: "woman", hidden_trace: { profile_id: INTERNAL_ID } },
    origin: { region: "california", unknown_group: { source_posture: "private" } },
    background: { education: "bachelor_degree" },
    economic: { personal_income_band: "75k_to_100k_usd" },
    household: { relationship_status: "married", number_of_children: 1 },
    behavior: { interests: ["gardening", INTERNAL_ID], unknown: { warnings: ["private"] } },
    psychology: {
      big_five_scores: { openness: 62, conscientiousness: 70, unknown: "private" },
      big_five_openness: "low_openness",
      big_five_conscientiousness: "high_conscientiousness",
    },
    decisioning: { communication_preference: "evidence_data_led" },
    health: { dietary_restrictions: [] },
    work: {
      occupation_domain: "business_management",
      occupation_title: "Product Manager",
      occupation_code: "11-2021.00",
      canonical_role: "marketing_managers",
      employment_status: "employed_full_time",
      employment_flexibility: "standard_hours",
      work_location_mode: "hybrid",
      military_background: false,
      military_service_status: "none",
      career_context: {
        status: "private-status",
        scope: "current_role",
        occupation_code: "11-2021.00",
        canonical_role: "marketing_managers",
        source_title: "Source title",
        source_system: "source-system",
        source_release: "source-release",
        career_seniority: "senior",
        management_scope: "team_lead",
        business_ownership_status: "not_owner",
        employer_type: "private_company",
        company_size_band: "large",
        decision_role: "influencer",
        public_sector_context: "none",
        sector_tags: ["marketing", INTERNAL_ID],
        industry: {
          code: "54161",
          label: "Management consulting services",
          source: "private-source",
          artifact_sha256: "private",
          nested_unknown: { profile_id: INTERNAL_ID },
        },
        purchase_authority: {
          source_posture: "private-authority-status",
          model_version: "private-model-version",
          warnings: ["private warning"],
          categories: {
            software_saas: { level: "final_signoff", probability: 0.74, source_posture: "private" },
            it_hardware: { level: "org_does_not_buy", probability: 0.26 },
            marketing_advertising: { level: "malformed private level", probability: 0.5 },
            private_category: { level: "final_signoff", probability: 1 },
          },
        },
        synthetic_operating_context: {
          sales_channels: ["direct_sales", "online"],
          organisation_complexity_band: "unknown",
          model_version: "private-model-version",
          provenance: {
            source_posture: "private-operating-status",
            artifact_id: "private-artifact",
            artifact_sha256: "private",
            profile_id: INTERNAL_ID,
          },
          warnings: ["private warning"],
          unexpected: { source_status: "private" },
        },
        profile_id: INTERNAL_ID,
        warnings: ["private warning"],
        unknown_object: { profile_id: INTERNAL_ID },
      },
      employer_context: {
        context_kind: "employee_employer",
        employer_type: "private_company",
        company_size_band: "large",
        source_posture: "private-employer-status",
        industry: { code: "54161", label: "Management consulting services", source: "private" },
        synthetic_operating_context: {
          sales_channels: ["direct_sales"],
          organisation_complexity_band: "layered",
          provenance: { profile_id: INTERNAL_ID, artifact_sha256: "private" },
        },
        profile_id: INTERNAL_ID,
        warnings: ["private warning"],
      },
      hidden_work_trace: { source_system: "private", profile_id: INTERNAL_ID },
    },
  };
}

function assertNoPrivatePayload(body) {
  const serialized = JSON.stringify(body);
  for (const term of [
    "generator_profile", "profile_id", "source_title", "source_system", "source_release",
    "source_posture", "artifact_sha256", "prevalence_weight", "weight_source", "warnings",
    "unknown_object", "hidden_trace", "hidden_work_trace", INTERNAL_ID,
  ]) {
    assert.equal(serialized.includes(term), false, `outbound body contains ${term}`);
  }
}

test("legacy source-bearing person is projected before building the external-model request", () => {
  const input = savedPerson();
  const body = buildPersonaRequest(study(), input, [1, 0]);
  const respondent = body.state.respondent;
  const work = respondent.profile.work;

  assert.equal(respondent.firstName, "Avery");
  assert.equal(respondent.profile.identity.age, 38);
  assert.equal(respondent.profile.psychology.big_five_openness, "low_openness");
  assert.equal(respondent.profile.psychology.big_five_scores.openness, 62);
  assert.equal(work.occupation_title, "Product Manager");
  assert.equal(work.occupation_code, "11-2021.00");
  assert.equal(work.career_context.scope, "current_role");
  assert.equal(work.employment_status, "employed_full_time");
  assert.deepEqual(work.career_context.purchase_authority, {
    categories: {
      software_saas: { level: "final_signoff", probability: 0.74 },
      it_hardware: { level: "org_does_not_buy", probability: 0.26 },
    },
  });
  assert.deepEqual(work.career_context.operating_context, {
    sales_channels: ["direct_sales", "online"],
    organisation_complexity_band: "unknown",
  });
  assert.deepEqual(work.employer_context.operating_context, {
    sales_channels: ["direct_sales"],
    organisation_complexity_band: "layered",
  });
  assert.equal(work.career_context.industry.source, undefined);
  assert.equal(work.employer_context.industry.source, undefined);
  assert.equal(respondent.profile.appearance, undefined);
  assert.equal(respondent.profile.metadata, undefined);
  assert.deepEqual(body.state.survey.questions.q.options, [
    "Keep the current option", "Choose the offer",
  ]);
  assert.equal(body.state.survey.context, `It is ${study().surveyed}. ${study().context}`);
  assert.equal(body.state.survey.context.includes("hypothetical"), true);
  assert.equal(respondent.profile.work.career_context.scope, "current_role");
  assertNoPrivatePayload(body);
  assert.ok(input.work.career_context.synthetic_operating_context.provenance.profile_id);
});

test("already-public operating context is retained and wins over any legacy alias", () => {
  const person = savedPerson();
  person.work.career_context.operating_context = {
    sales_channels: ["online"],
    organisation_complexity_band: "flat_team",
    trace: { profile_id: INTERNAL_ID },
  };
  const body = buildPersonaRequest(study(), person, [0, 1]);
  assert.deepEqual(body.state.respondent.profile.work.career_context.operating_context, {
    sales_channels: ["online"],
    organisation_complexity_band: "flat_team",
  });
  assertNoPrivatePayload(body);
});

test("unknown keys and unknown nested objects are removed while unknown values stay meaningful", () => {
  const person = savedPerson();
  person.work.career_context.employer_type = INTERNAL_ID;
  person.identity.unknown_group = { profile_id: INTERNAL_ID };
  const projected = projectPersonaForModel(person, "us");
  assert.equal(projected.profile.identity.unknown_group, undefined);
  assert.equal(projected.profile.work.career_context.employer_type, undefined);
  assert.equal(projected.profile.work.career_context.operating_context.organisation_complexity_band, "unknown");
  assertNoPrivatePayload(projected);
});

test("the no-profile baseline keeps the scenario separate and makes no person claims", () => {
  const body = buildPersonaRequest(study(), null, [0, 1]);
  assert.deepEqual(body.state.respondent, { profile: { country: "us" } });
  assert.equal(body.state.survey.context, `It is ${study().surveyed}. ${study().context}`);
  assert.equal(body.state.respondent.profile.context, undefined);
});

test("invalid saved-person identity or country fails closed", () => {
  assert.throws(() => projectPersonaForModel({ name: { first_name: "Avery" }, work: {} }, "us"));
  assert.throws(() => projectPersonaForModel(savedPerson(), "ca"));
});
