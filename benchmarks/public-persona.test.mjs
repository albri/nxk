import assert from "node:assert/strict";
import test from "node:test";
import { buildPersonaRequest, projectPersonaForModel } from "./public-persona.mjs";

function study() {
  return {
    country: "us",
    surveyed: "October 2026",
    question: "Would you choose this offer?",
    context: "Imagine choosing between the offer and your current option. This is hypothetical.",
    options: ["Choose the offer", "Keep the current option"],
  };
}

// A persona as POST /{country}/personas returns it in data[], with 4.0 sections.
function savedPerson() {
  return {
    name_and_summary: { first_name: "Avery", last_name: "Morgan", summary: "Avery is a 38-year-old woman." },
    identity: { age_years: 38, gender: "woman" },
    work: { current_occupation: { code: "11-2021", title: "Marketing Managers" }, usual_weekly_hours_worked: "31_to_48_hours" },
    money: { personal_income_before_tax_per_year: "75k_to_99k_usd" },
    body_and_appearance: { height_cm: 170, visible_hair_color: "brown" },
    interests: { interests: [{ family: "cycling", specific: "road_cycling", intensity: "regular" }], interest_count: 1 },
  };
}

test("projection keeps the life and drops appearance and the surname", () => {
  const { firstName, profile } = projectPersonaForModel(savedPerson(), "us");
  assert.equal(firstName, "Avery");
  assert.equal(profile.country, "us");
  assert.deepEqual(profile.name_and_summary, { summary: "Avery is a 38-year-old woman." });
  assert.equal(profile.body_and_appearance, undefined);
  assert.deepEqual(profile.work.current_occupation, { code: "11-2021", title: "Marketing Managers" });
  assert.deepEqual(profile.interests.interests[0], { family: "cycling", specific: "road_cycling", intensity: "regular" });
  assert.equal(JSON.stringify(profile).includes("Morgan"), false);
});

test("a section-limited persona projects what it has", () => {
  const { identity } = savedPerson();
  const { profile } = projectPersonaForModel({ name_and_summary: { first_name: "Avery" }, identity }, "us");
  assert.deepEqual(Object.keys(profile), ["country", "identity"]);
});

test("a persona without a first name, or from a 3.1 payload, is refused", () => {
  assert.throws(() => projectPersonaForModel({ identity: { age_years: 38 } }, "us"), /first_name/);
  assert.throws(() => projectPersonaForModel({ name: { first_name: "Avery" }, identity: { age: 38 } }, "us"), /first_name/);
  assert.throws(() => projectPersonaForModel(savedPerson(), "fr"), /supported country/);
});

test("the request keeps the scenario outside the person", () => {
  const body = buildPersonaRequest(study(), savedPerson(), [1, 0]);
  const { respondent, survey } = body.state;
  assert.equal(respondent.firstName, "Avery");
  assert.deepEqual(survey.questions.q.options, ["Keep the current option", "Choose the offer"]);
  assert.equal(JSON.stringify(respondent).includes("hypothetical"), false);
  assert.deepEqual(Object.keys(body.questions.q.criteria), survey.questions.q.options);
});

test("a request without a person carries only the country", () => {
  assert.deepEqual(buildPersonaRequest(study(), undefined, [0, 1]).state.respondent, { profile: { country: "us" } });
});
