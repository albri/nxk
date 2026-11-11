// Builds the Jev request for one saved PersonaGen 4.0 persona. The 4.0 payload is already public: sections of flat,
// uniquely named fields. The projection keeps the person's life and leaves out what would only add noise or leak the
// scenario: the appearance section, the surname (from the name and from the summary, which opens with the full name),
// and the request metadata (which is not part of `data`).
const OMITTED_SECTIONS = new Set(["body_and_appearance"]);
export const DEFAULT_INSTRUCTION = "Based on `respondent.profile`, which answer would this person give to `survey.questions.q.text` in the situation described in `survey.context`? The available answers are in `survey.questions.q.options`. Apply the person's stated circumstances; predict their response rather than recommending the best option in general.";

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Return only a projected person state; caller supplies the scenario separately. */
export function projectPersonaForModel(person, country) {
  const firstName = person?.name_and_summary?.first_name;
  if (!isRecord(person) || typeof firstName !== "string" || firstName === "" || !["uk", "us"].includes(country)) {
    throw new Error("A saved 4.0 persona with a supported country and name_and_summary.first_name is required");
  }
  const profile = { country };
  for (const [section, fields] of Object.entries(person)) {
    if (OMITTED_SECTIONS.has(section) || !isRecord(fields)) continue;
    if (section === "name_and_summary") {
      const { first_name: _first, last_name: lastName, ...rest } = fields;
      if (typeof rest.summary === "string" && typeof lastName === "string" && lastName !== "") {
        rest.summary = rest.summary.replaceAll(`${firstName} ${lastName}`, firstName);
      }
      if (Object.keys(rest).length) profile[section] = rest;
    } else {
      profile[section] = fields;
    }
  }
  return { firstName, profile };
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
