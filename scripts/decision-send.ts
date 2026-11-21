// Sending to the decision model, for everything that does: the scan (scan.ts), the survey check
// (evals/surveys/run.ts) and the evals' test answer before a run (evals/decision.ts). A request is put in the form
// its route takes, posted with retries, priced, and many are sent at once within the route's published limits and a
// spending limit. decision-model.ts says which model, route and key (`setup`); none of this ever prints the key.
import type { RoutedSetup } from "./decision-model.ts";
import { pacer, toGoogle, type SystemOneRequest } from "./google.ts";

/**
 * What sending reads of a decision setup (decision-model.ts): the route, where it posts, the model id and key it
 * takes, its published limits and the price.
 */
export type SendSetup = Pick<RoutedSetup, "route" | "url" | "wire" | "key" | "limits" | "charged" | "usdPerMillion">;

/**
 * An answer as the decision services send it back, as far as nxk reads it: each question's probabilities by option
 * (by id on Google's own API), and what it cost, as each provider reports it.
 */
export interface DecisionAnswer {
  answers?: Record<string, { probabilities?: Record<string, number> }>;
  usage?: { cost?: number; input_tokens?: number; total_input_tokens?: number; total_tokens?: number };
  provider_metadata?: { gateway?: { cost?: number } };
}

/** A request in the form its route takes (wireOf). */
export interface Wire {
  /** The text posted. */
  body: string;
  headers: Record<string, string>;
  /** What an answer gives `option` of question `key`: a number from 0 to 1, when the answer has it. */
  probability: (json: DecisionAnswer | null, key: string, option: string) => number | undefined;
}

/** What an answer cost (priceOf). */
export interface Price {
  usd: number;
  /** As the provider reported them, or null. */
  tokens: number | null;
  /** Whether the provider gave the cost itself. */
  reported: boolean;
}

/** The time, and a way to wait: a test's clock moves only when slept on. */
export interface Clock {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

/** How sendJobs sends each job. */
export interface SendOptions<Job> {
  /** The job's System One request. */
  requestOf: (job: Job) => SystemOneRequest;
  /** Reads and saves a job's answer, and throws when it lacks something, which fails that try. */
  answered: (job: Job, json: DecisionAnswer, wire: Wire, price: Price) => void;
  /** The spending limit, in US dollars. */
  maxUsd: number;
  /** What was spent before, counted against the limit. */
  spent?: number;
  /** What a job is expected to cost, in US dollars. */
  estimateOf?: (job: Job) => number;
  fetch?: typeof globalThis.fetch;
  clock?: Clock;
}

/** What sendJobs did. */
export interface Sent<Job> {
  /** Every answer that came back, read or not, with what was spent before. */
  spent: number;
  /** Why it stopped, or null. */
  stop: string | null;
  /** The FATAL key when no resend gets past it, or null. */
  fatal: string | null;
  /** The jobs that failed twice, saving nothing. */
  lost: Job[];
  lastError: string | null;
}

/** How many may be in flight, and until when all wait. */
interface Pool {
  allowed: number;
  calm: number;
  holdUntil: number;
}

/** A request's tokens before it is sent, from its size: about 3.5 characters a token. */
export const tokensIn = (text: string): number => Math.ceil(text.length / 3.5);

/** Why sending stopped when no resend gets past it until the account or the quota allows. */
export const FATAL: Record<string, string> = {
  NO_CREDIT: "The decision-model account has no credit left.",
  DAILY: "The decision model's daily request quota is used up (Google's resets at midnight Pacific time).",
};

const PAUSES = [0, 3000, 8000, 20000, 40000]; // before each try of one request
const TIMEOUT = 120000;
const CLOCK: Clock = { now: () => Date.now(), sleep: (ms) => new Promise((done) => setTimeout(done, ms)) };

/**
 * A System One request in the form the setup's route takes: { body (the text posted), headers, probability(json, key,
 * option) }. Google's own API takes the options by id (google.ts); every other route, by name.
 */
export function wireOf(setup: SendSetup, request: SystemOneRequest): Wire {
  const google = setup.route === "google" ? toGoogle(request, setup.wire) : null;
  const auth: Record<string, string> = google
    ? { "x-goog-api-key": setup.key }
    : { Authorization: `Bearer ${setup.key}` };
  return {
    body: JSON.stringify(google ? google.body : request),
    headers: { "Content-Type": "application/json", ...auth },
    probability: (json, key, option) =>
      json?.answers?.[key]?.probabilities?.[google ? google.idOf(key, option) : option],
  };
}

/**
 * What an answer cost: { usd, tokens (as the provider reported them, or null), reported (whether the provider gave
 * the cost itself) }. An answer with no token count is priced from the request's size, never as free: spending limits
 * count with it.
 * @param json  the answer, parsed
 * @param body  the text posted
 */
export function priceOf(setup: SendSetup, json: DecisionAnswer | null, body: string): Price {
  const cost = json?.provider_metadata?.gateway?.cost ?? json?.usage?.cost;
  const tokens = json?.usage?.input_tokens ?? json?.usage?.total_input_tokens ?? json?.usage?.total_tokens ?? null;
  const usd = setup.charged ? Number(cost ?? ((tokens ?? tokensIn(body)) * setup.usdPerMillion) / 1e6) : 0;
  return { usd, tokens, reported: cost !== undefined };
}

/** How many requests may be in flight: enough to reach a published limit at a second or two each, at most 32. */
export const mostAtOnce = (setup: { limits: { rpm: number } | null }): number =>
  setup.limits ? Math.max(2, Math.min(32, Math.ceil(setup.limits.rpm / 30))) : 16;

/**
 * Sends the jobs, up to mostAtOnce(setup) at a time and within the route's published limits. `requestOf(job)` gives a
 * job's System One request; `answered(job, json, wire, price)` reads and saves its answer, and throws when the answer
 * lacks something, which fails that try. A busy answer (429) halves how many may be in flight and holds every request
 * for as long as the service asks; twenty answers in a row let one more back in. A job is tried twice. Sending stops
 * before a job whose estimate (`estimateOf(job)`, in dollars) would take the spend past `maxUsd`, on no credit or a
 * spent daily quota, or after four failures in a row.
 *
 * Returns { spent (every answer that came back, read or not), stop (why it stopped, or null), fatal (the FATAL key when
 * no resend gets past it, or null), lost (the jobs that failed twice, saving nothing), lastError }.
 */
export async function sendJobs<Job>(
  setup: SendSetup,
  jobs: Job[],
  {
    requestOf,
    answered,
    spent = 0,
    maxUsd,
    estimateOf = () => 0,
    fetch = globalThis.fetch,
    clock = CLOCK,
  }: SendOptions<Job>,
): Promise<Sent<Job>> {
  const most = mostAtOnce(setup);
  const pace = setup.limits
    ? {
        tokens: pacer(setup.limits.tpm, clock.now, clock.sleep),
        requests: pacer(setup.limits.rpm, clock.now, clock.sleep),
      }
    : null;
  const pool: Pool = { allowed: most, calm: 0, holdUntil: 0 };
  const lost: Job[] = [];
  let next = 0,
    inFlight = 0,
    ahead = 0, // the estimates of the requests in flight, so the limit holds before their cost is known
    failures = 0,
    stop: string | null = null,
    fatal: string | null = null,
    lastError: string | null = null;

  const one = async (job: Job) => {
    const wire = wireOf(setup, requestOf(job));
    if (pace) {
      await pace.tokens(tokensIn(wire.body));
      await pace.requests(1);
    }
    const response = await post(setup, wire, pool, fetch, clock);
    if (!response) throw new Error("The decision model could not be reached");
    if (response.status === 429) throw new Error("The decision model stayed busy (429)");
    if (response.status === 402) throw new Error("NO_CREDIT");
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
    const json: DecisionAnswer = await response.json();
    const price = priceOf(setup, json, wire.body);
    // Charged whether or not the answer can be read: counted before it is, so the limit holds.
    spent += price.usd;
    answered(job, json, wire, price);
  };

  const worker = async () => {
    while (next < jobs.length && !stop) {
      if (inFlight >= pool.allowed) {
        await clock.sleep(200);
        continue;
      }
      const job = jobs[next];
      const estimate = estimateOf(job);
      if (spent + ahead + estimate > maxUsd) {
        stop = spent > maxUsd ? "The spending limit was reached." : "The spending limit would be passed.";
        return;
      }
      next++;
      inFlight++;
      ahead += estimate;
      try {
        try {
          await one(job);
        } catch (error) {
          if (FATAL[(error as Error).message]) throw error;
          await one(job);
        }
        failures = 0;
        if (++pool.calm >= 20 && pool.allowed < most) {
          pool.allowed++;
          pool.calm = 0;
        }
      } catch (error) {
        // What one throws is an Error: its own, the fetch's or the one `answered` throws.
        const { message } = error as Error;
        if (FATAL[message]) {
          fatal = message;
          stop = FATAL[fatal];
          return;
        }
        // Failed twice: nothing is saved for it. It is returned, never dropped unsaid.
        lost.push(job);
        lastError = message;
        if (++failures >= 4) stop = `Requests kept failing; the last error: ${message}`;
      } finally {
        inFlight--;
        ahead -= estimate;
      }
    }
  };
  await Promise.all(Array.from({ length: most }, worker));
  return { spent, stop, fatal, lost, lastError };
}

/**
 * One request posted. A busy service (429 or 5xx) or a dropped connection is retried after a pause; anything else is
 * returned at once. A busy answer holds every request in the pool and halves how many may be in flight; one that says
 * the daily quota is used up throws DAILY. Returns the last response, or null when none came.
 */
async function post(
  setup: SendSetup,
  wire: Wire,
  pool: Pool,
  fetch: typeof globalThis.fetch,
  clock: Clock,
): Promise<Response | null> {
  let response: Response | null = null;
  for (const pause of PAUSES) {
    if (pause) await clock.sleep(pause);
    while (clock.now() < pool.holdUntil) await clock.sleep(pool.holdUntil - clock.now());
    try {
      response = await fetch(setup.url, {
        method: "POST",
        headers: wire.headers,
        body: wire.body,
        signal: AbortSignal.timeout(TIMEOUT),
      });
    } catch {
      response = null;
      continue;
    }
    if (response.status === 429) {
      const said = await response.text();
      if (/quota_exceeded|per ?day|daily/i.test(said)) throw new Error("DAILY");
      const after = Number(response.headers.get("retry-after"));
      pool.allowed = Math.max(1, Math.floor(pool.allowed / 2));
      pool.calm = 0;
      pool.holdUntil = Math.max(pool.holdUntil, clock.now() + (after > 0 ? after * 1000 : pause || 3000));
      continue;
    }
    if (response.status < 500) break;
  }
  return response;
}
