import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_INSTRUCTION, NOUL_INSTRUCTION, buildPersonaRequest, buildQuestionsRequest, instructionFor,
  projectPersonaForModel, readAnswers, rotate,
} from "./public-persona.mjs";

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

test("the surname is taken out of the summary as well", () => {
  const person = savedPerson();
  person.name_and_summary.summary = "Avery Morgan is a 38-year-old woman living in Ohio. Avery works as a Marketing Manager.";
  const { profile } = projectPersonaForModel(person, "us");
  assert.equal(profile.name_and_summary.summary, "Avery is a 38-year-old woman living in Ohio. Avery works as a Marketing Manager.");
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

function questions() {
  return {
    pick: { type: "choice", text: "Which would you choose?", options: ["Choose the offer", "Keep the current option", "Neither"] },
    too_dear: { type: "noul", text: "Is the price too high for you?" },
  };
}

test("several questions share one request, each with the tested instruction pointed at its own key", () => {
  const body = buildQuestionsRequest(study(), savedPerson(), questions());
  assert.deepEqual(Object.keys(body.questions), ["pick", "too_dear"]);
  assert.deepEqual(body.state.survey.questions.pick.options, questions().pick.options);
  assert.deepEqual(body.state.survey.questions.too_dear, { text: "Is the price too high for you?" });
  assert.equal(body.questions.pick.type, "choice");
  assert.equal(body.questions.pick.instructions, DEFAULT_INSTRUCTION.replaceAll("questions.q.", "questions.pick."));
  assert.deepEqual(Object.keys(body.questions.pick.criteria), questions().pick.options);
  assert.deepEqual(body.questions.too_dear, { type: "noul", instructions: NOUL_INSTRUCTION.replaceAll("questions.q.", "questions.too_dear.") });
  assert.equal(JSON.stringify(body.questions).includes("questions.q."), false);
  assert.equal(body.state.respondent.firstName, "Avery");
});

test("a single choice built either way is the same request", () => {
  const one = buildPersonaRequest(study(), savedPerson(), [1, 0]);
  const options = [study().options[1], study().options[0]];
  const many = buildQuestionsRequest(study(), savedPerson(), { q: { type: "choice", text: study().question, options } });
  assert.deepEqual(many, one);
  assert.equal(instructionFor("choice", "q"), DEFAULT_INSTRUCTION);
});

test("bad questions are refused", () => {
  assert.throws(() => buildQuestionsRequest(study(), savedPerson(), {}), /At least one question/);
  assert.throws(() => buildQuestionsRequest(study(), savedPerson(), { "Too Dear": { type: "noul", text: "x" } }), /lower-case/);
  assert.throws(() => buildQuestionsRequest(study(), savedPerson(), { a: { type: "choice", text: "x", options: ["Yes", "Yes"] } }), /different options/);
  assert.throws(() => buildQuestionsRequest(study(), savedPerson(), { a: { type: "score", text: "x" } }), /"choice" or "noul"/);
});

test("rotate starts the options from a different one and keeps them all", () => {
  assert.deepEqual(rotate(["a", "b", "c"], 0), ["a", "b", "c"]);
  assert.deepEqual(rotate(["a", "b", "c"], 1), ["b", "c", "a"]);
  assert.deepEqual(rotate(["a", "b", "c"], 5), ["c", "a", "b"]);
});

test("answers are checked against the request and returned in a plain shape", () => {
  const body = buildQuestionsRequest(study(), savedPerson(), questions());
  const response = {
    model: "jev-1.14.0",
    usage: { input_tokens: 4200, output_tokens: 120 },
    answers: {
      pick: { type: "choice", choice: "Neither", probabilities: { "Choose the offer": 0.2, "Keep the current option": 0.3, Neither: 0.5 } },
      too_dear: { type: "noul", noul: 0.64 },
    },
  };
  const read = readAnswers(body, response);
  assert.deepEqual(read.answers.pick.probabilities, { "Choose the offer": 0.2, "Keep the current option": 0.3, Neither: 0.5 });
  assert.deepEqual(read.answers.too_dear, { yes: 0.64 });
  assert.equal(read.model, "jev-1.14.0");
  assert.equal(read.inputTokens, 4200);
  assert.throws(() => readAnswers(body, { answers: { pick: response.answers.pick } }), /too_dear/);
  assert.throws(() => readAnswers(body, { answers: { ...response.answers, pick: { probabilities: { "Choose the offer": 0.9, "Keep the current option": 0.9, Neither: 0.5 } } } }), /probability total/);
});
