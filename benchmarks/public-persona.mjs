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

/** The tested instruction for a Noul (one yes probability). Like DEFAULT_INSTRUCTION, it is meant to be used unchanged. */
export const NOUL_INSTRUCTION = "Based on `respondent.profile`, would this person answer yes to `survey.questions.q.text` in the situation described in `survey.context`? Apply the person's stated circumstances; predict their response rather than recommending what is best in general.";

/** The tested instruction for a question type, pointed at that question's key in `state.survey.questions`. */
export function instructionFor(type, key) {
  const text = type === "noul" ? NOUL_INSTRUCTION : DEFAULT_INSTRUCTION;
  return text.replaceAll("survey.questions.q.", `survey.questions.${key}.`);
}

/** The same options starting from a different one, so that across a panel no option is always first. */
export function rotate(options, index) {
  const start = ((index % options.length) + options.length) % options.length;
  return [...options.slice(start), ...options.slice(0, start)];
}

/**
 * Several independent questions about one situation, for one person, in one request.
 * `questions` maps a key to { type: "choice", text, options } or { type: "noul", text }.
 * Choice options are sent in the order given: rotate them per person with `rotate`.
 */
export function buildQuestionsRequest(study, person, questions) {
  const entries = Object.entries(questions ?? {});
  if (!entries.length) throw new Error("At least one question is required");
  const respondent = person
    ? projectPersonaForModel(person, study.country)
    : { profile: { country: study.country } };
  const stated = {};
  const asked = {};
  for (const [key, question] of entries) {
    if (!/^[a-z][a-z0-9_]*$/.test(key)) throw new Error(`Question key "${key}" must be lower-case letters, digits and underscores`);
    if (typeof question?.text !== "string" || question.text === "") throw new Error(`Question "${key}" needs its text`);
    if (question.type === "noul") {
      stated[key] = { text: question.text };
      asked[key] = { type: "noul", instructions: instructionFor("noul", key) };
    } else if (question.type === "choice") {
      const options = question.options;
      if (!Array.isArray(options) || options.length < 2 || new Set(options).size !== options.length) {
        throw new Error(`Question "${key}" needs two or more different options`);
      }
      stated[key] = { text: question.text, options: [...options] };
      asked[key] = {
        type: "choice",
        instructions: instructionFor("choice", key),
        criteria: Object.fromEntries(options.map((text) => [text, null])),
      };
    } else {
      throw new Error(`Question "${key}" must have type "choice" or "noul"`);
    }
  }
  return {
    model: "jev-latest",
    state: { respondent, survey: { context: situation(study), questions: stated } },
    questions: asked,
  };
}

/**
 * Check a Jev response against the request that produced it. Returns each answer in a plain shape
 * ({ probabilities } keyed by option text for a Choice, { yes } for a Noul), with the resolved model
 * and the tokens used. Throws on a missing or invalid answer: report it, never turn it into a zero.
 */
export function readAnswers(request, response) {
  const answers = {};
  for (const [key, question] of Object.entries(request.questions)) {
    const answer = response?.answers?.[key];
    if (question.type === "noul") {
      if (typeof answer?.noul !== "number" || !(answer.noul >= 0 && answer.noul <= 1)) throw new Error(`Invalid answer for "${key}"`);
      answers[key] = { yes: answer.noul };
    } else {
      const options = request.state.survey.questions[key].options;
      const given = answer?.probabilities;
      if (!isRecord(given) || options.some((text) => !Number.isFinite(given[text]) || given[text] < 0 || given[text] > 1)) {
        throw new Error(`Invalid answer for "${key}"`);
      }
      const total = options.reduce((sum, text) => sum + given[text], 0);
      if (Math.abs(total - 1) > 0.03) throw new Error(`Invalid probability total for "${key}"`);
      answers[key] = { probabilities: Object.fromEntries(options.map((text) => [text, given[text]])) };
    }
  }
  return {
    answers,
    model: response?.model,
    inputTokens: response?.usage?.input_tokens,
    outputTokens: response?.usage?.output_tokens,
  };
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
