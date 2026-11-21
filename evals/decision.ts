// The decision model behind nxk's scans, from the runner's side: whether a session's scans were stopped by the account
// or the key (such a run measured nxk without its scans, so it is a failure, not a score), and one test answer before
// a run starts, so a run never begins on an account or key that cannot answer. Never a key in what is printed.
import { homedir } from "node:os";
import { decisionSetup, ROUTES, type Route } from "../scripts/decision-model.ts";
import { priceOf, tokensIn, wireOf, type DecisionAnswer } from "../scripts/decision-send.ts";
import { entriesOf, type ToolResultBlock } from "./lib.ts";

// What nxk's scan says when the account or the key stops it (scripts/scan.ts, scripts/discover.ts): no credit left,
// the daily quota used up, or a request refused for the key, the account's permission or its billing. Only scan.ts
// prints "HTTP <status>:".
const STOPS = [
  /decision-model account has no credit left/i,
  /daily (request )?quota is used up/i,
  /\bHTTP 40[123]:/,
  /\bHTTP 400:.{0,300}(api[ _]?key|billing)/i,
];
const NXK_TOOL = /^mcp__plugin_nxk_nxk__/;

/** The request preflight posts: its method, headers and body, and when to give up. */
export interface Post {
  method: string;
  headers: Record<string, string>;
  body: string;
  signal: AbortSignal;
}

/** How preflight posts: fetch, or a test's stand-in. */
export type Send = (url: string, init: Post) => Promise<Response>;

/** The decision model's test answer (preflight): the model and route that answered, what it cost and its tokens. */
export interface Preflight {
  model: string;
  route: Route;
  usd: number;
  tokens: number;
}

/** A tool result's text, whichever form it came in. */
const textOf = (content: ToolResultBlock["content"]) =>
  typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content.map((b) => (typeof b === "string" ? b : (b?.text ?? ""))).join("\n")
      : "";

/**
 * Why the decision model stopped a session's scans, from its transcript lines: the line of an nxk tool's result that
 * says so, or null. Only nxk's own tools count, so a file or page the session read that quotes such a line does not.
 */
export function decisionStop(trace: string[] = []): string | null {
  const names = new Map<string, string>();
  for (const event of entriesOf(trace)) {
    const content = event.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block?.type === "tool_use") names.set(block.id, block.name);
      if (block?.type !== "tool_result" || !NXK_TOOL.test(names.get(block.tool_use_id) ?? "")) continue;
      for (const said of textOf(block.content).split("\n"))
        if (STOPS.some((re) => re.test(said))) return said.trim().slice(0, 300);
    }
  }
  return null;
}

/** What a refused test answer means for the owner, by HTTP status and what the service said. */
function refusal(status: number, said: string, from: string) {
  if (status === 402 || /no credit|insufficient (funds|credit|balance)/i.test(said))
    return "the decision-model account has no credit left: top it up, then start again";
  if (status === 401 || status === 403 || (status === 400 && /api[ _]?key|billing/i.test(said)))
    return `the decision model refused the key or the account (HTTP ${status}: ${said}): check the key in ${from} and the account's billing, then start again`;
  if (status === 429 && /quota_exceeded|per ?day|daily/i.test(said))
    return "the decision model's daily quota is used up (Google's resets at midnight Pacific time): start again once it has reset";
  if (status === 429) return "the decision model is busy (HTTP 429): start again in a minute";
  return `the decision model answered HTTP ${status}: ${said}`;
}

/**
 * One test answer from the decision model the sessions would scan with (`env`: the sessions' own), before any session
 * starts: a single Choice of two options, a fraction of a cent. Throws, saying what to do, when no key reaches the
 * sessions or the answer does not come back. Returns { model, route, usd, tokens }.
 */
export async function preflight(
  env: NodeJS.ProcessEnv,
  { send = fetch, home = homedir() }: { send?: Send; home?: string } = {},
): Promise<Preflight> {
  const d = decisionSetup(env, home);
  const refuse = (why: string): never => {
    throw new Error(`Not starting: research would run without its scans: ${why}.`);
  };
  if (!d.route) return refuse(`no decision-model key reaches the sessions. ${d.reason}`);
  const request = {
    model: d.wire,
    state: { respondent: { profile: { country: "uk" } } },
    questions: {
      q: {
        type: "choice",
        instructions: "Based on `respondent.profile`, does this person live in the United Kingdom?",
        criteria: { Yes: null, No: null },
      },
    },
  };
  const wire = wireOf(d, request);
  // What the service said, never with the key in it.
  const scrub = (text: unknown) => String(text).replaceAll(d.key, "[key]").replace(/\s+/g, " ").slice(0, 200);
  const via = d.route === "custom" ? d.url : ROUTES[d.route].name;
  let response: Response;
  try {
    response = await send(d.url, {
      method: "POST",
      headers: wire.headers,
      body: wire.body,
      signal: AbortSignal.timeout(60000),
    });
  } catch (error) {
    const why = scrub(error instanceof Error ? error.message : error);
    return refuse(`${via} could not be reached (${why}): check the connection, then start again`);
  }
  const text = await response.text();
  if (!response.ok) return refuse(refusal(response.status, scrub(text), d.from));
  let json: DecisionAnswer | null = null;
  try {
    json = JSON.parse(text);
  } catch {
    // read below as no answer
  }
  const p = wire.probability(json, "q", "Yes");
  if (p === undefined || !(p >= 0 && p <= 1)) return refuse(`${via} answered with nothing to read: ${scrub(text)}`);
  const { usd, tokens } = priceOf(d, json, wire.body);
  return { model: d.wire, route: d.route, usd, tokens: tokens ?? tokensIn(wire.body) };
}
