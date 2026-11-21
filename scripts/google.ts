// Google's Gemini Decisions API, reached directly with a key from Google AI Studio. The scan writes its requests in
// TypeSafe's System One form (the form Vercel AI Gateway takes); this turns one into Google's form and reads the answer
// back. Google's model has a free tier (200 requests and 50,000 tokens a minute, 10,000 requests a day when this was
// written), so the requests are paced to stay under a tokens-a-minute limit.
//
// Google: POST https://generativelanguage.googleapis.com/v1beta/decisions, header x-goog-api-key,
//   { model, input, questions: { key: { type: "choice", instructions, criteria: { optionId: description } } } }
//   -> { answers: { key: { probabilities: { optionId: p } } }, usage: { total_tokens } }

export const GOOGLE = { url: "https://generativelanguage.googleapis.com/v1beta/decisions", model: "gemini-decision-1" };

/** One question of a System One request. A Choice's criteria are its options, each with a description or null for none. */
export interface SystemOneQuestion {
  type: string;
  instructions?: string;
  criteria?: Record<string, string | null>;
}

/** A System One request: the model, the state it reads (as JSON) and its questions by key. */
export interface SystemOneRequest {
  model?: string;
  state: unknown;
  questions: Record<string, SystemOneQuestion>;
}

/** A System One request in Google's form (toGoogle): what is posted, and the id each option was sent as. */
export interface GoogleRequest {
  body: { model: string; input: string; questions: Record<string, SystemOneQuestion> };
  /** The id option `name` of question `key` was sent as. */
  idOf: (key: string, name: string) => string;
}

/**
 * A System One request in Google's form. The state goes in as JSON text, so the instructions' paths into it
 * (`respondent.profile`, `survey.questions.q0`) still point somewhere. Options become ids o1, o2... with the option
 * text as the description, which also gets round Google's limit on long option names. Returns { body, idOf(key, name) }.
 * @param model  the model's id; a google/ in front is dropped
 */
export function toGoogle(request: SystemOneRequest, model = GOOGLE.model): GoogleRequest {
  const ids: Record<string, Record<string, string>> = {};
  const questions = Object.fromEntries(
    Object.entries(request.questions).map(([key, question]) => {
      if (question.type !== "choice") return [key, question];
      const entries = Object.entries(question.criteria ?? {});
      ids[key] = Object.fromEntries(entries.map(([name], i) => [name, `o${i + 1}`]));
      return [
        key,
        {
          type: "choice",
          instructions: question.instructions,
          criteria: Object.fromEntries(entries.map(([name, text], i) => [`o${i + 1}`, text ?? name])),
        },
      ];
    }),
  );
  return {
    body: { model: String(model).replace(/^google\//, ""), input: JSON.stringify(request.state), questions },
    idOf: (key, name) => ids[key]?.[name] ?? name,
  };
}

/** A pacer for a tokens-a-minute limit: `wait(tokens)` resolves when a request of that size may go. */
export function pacer(
  tokensPerMinute: number,
  now: () => number = () => Date.now(),
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((done) => setTimeout(done, ms)),
): (tokens: number) => Promise<void> {
  let free = 0;
  return async (tokens) => {
    const at = Math.max(free, now());
    free = at + (60000 * tokens) / tokensPerMinute;
    if (at > now()) await sleep(at - now());
  };
}
