import { test } from "node:test";
import assert from "node:assert/strict";
import { FATAL, mostAtOnce, priceOf, sendJobs, wireOf, type Clock, type SendSetup } from "./decision-send.ts";

const GATEWAY: SendSetup = {
  route: "gateway",
  url: "https://gateway.test",
  wire: "m",
  key: "k",
  charged: true,
  usdPerMillion: 1,
  limits: null,
};
const GOOGLE: SendSetup = { ...GATEWAY, route: "google", url: "https://google.test", wire: "gemini-decision-1" };
const request = (id: number) => ({
  model: "m",
  state: { id },
  questions: { q: { type: "choice", instructions: "Which?", criteria: { Yes: null, No: null } } },
});

/** A clock that moves only when slept on, so the retry pauses take no time. */
const fakeClock = (): Clock => {
  let at = 0;
  return { now: () => at, sleep: async (ms) => void (at += ms) };
};
const reply = (status: number, body: string | object, headers: Record<string, string> = {}) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });
const yes = (p = 0.7, cost = 0.001) =>
  reply(200, { answers: { q: { probabilities: { Yes: p, No: 1 - p } } }, usage: { cost } });

/** Sends `count` jobs, the service answering each call with `respond(call)`; returns what was sent and saved. */
async function send(
  respond: (call: number) => Response,
  {
    count = 3,
    setup = GATEWAY,
    maxUsd = 1,
    estimateOf,
  }: { count?: number; setup?: SendSetup; maxUsd?: number; estimateOf?: (job: number) => number } = {},
) {
  // sendJobs posts the headers wireOf made: a plain record.
  const calls: { url: string | URL | Request; init: RequestInit & { headers: Record<string, string> } }[] = [],
    saved: [number, number][] = [];
  const sent = await sendJobs(
    setup,
    Array.from({ length: count }, (_, i) => i),
    {
      requestOf: request,
      answered: (job, json, wire) => {
        const p = wire.probability(json, "q", "Yes");
        if (p === undefined || !(p >= 0 && p <= 1)) throw new Error(`No answer for ${job}`);
        saved.push([job, p]);
      },
      maxUsd,
      estimateOf,
      fetch: async (url, init) => {
        calls.push({ url, init: init as RequestInit & { headers: Record<string, string> } });
        return respond(calls.length);
      },
      clock: fakeClock(),
    },
  );
  return { sent, calls, saved };
}

test("every job is sent once, read and priced", async () => {
  const { sent, calls, saved } = await send(() => yes());
  assert.equal(calls.length, 3);
  assert.deepEqual(saved.map(([job]) => job).sort(), [0, 1, 2]);
  assert.equal(sent.spent.toFixed(3), "0.003");
  assert.deepEqual([sent.stop, sent.fatal, sent.lost], [null, null, []]);
  assert.equal(calls[0].init.headers.Authorization, "Bearer k");
});

test("a busy answer is retried after the pause the service asks for", async () => {
  const { sent, calls } = await send((n) => (n === 1 ? reply(429, "slow down", { "retry-after": "2" }) : yes()), {
    count: 1,
  });
  assert.equal(calls.length, 2);
  assert.equal(sent.stop, null);
});

test("no credit and a spent daily quota stop sending, saying which", async () => {
  const credit = await send(() => reply(402, "payment required"));
  assert.deepEqual([credit.sent.fatal, credit.sent.stop, credit.saved.length], ["NO_CREDIT", FATAL.NO_CREDIT, 0]);
  const daily = await send(() => reply(429, "quota_exceeded: requests per day"));
  assert.deepEqual([daily.sent.fatal, daily.sent.stop], ["DAILY", FATAL.DAILY]);
});

test("a job that fails twice is returned as lost; four in a row stop sending", async () => {
  const once = await send((n) => (n <= 2 ? reply(400, "bad request") : yes()), { count: 1 });
  assert.equal(once.sent.lost.length, 1);
  assert.match(once.sent.lastError ?? "", /^HTTP 400: bad request/);
  assert.equal(once.sent.stop, null);
  // Every job tried twice, and the ones after the fourth failure never sent.
  const always = await send(() => reply(200, { answers: {} }), { count: 40 });
  assert.ok(always.sent.lost.length < 40);
  assert.equal(always.calls.length, 2 * always.sent.lost.length);
  assert.match(always.sent.stop ?? "", /^Requests kept failing; the last error: No answer for/);
});

test("nothing is sent that would take the spend past the limit", async () => {
  const { sent, calls } = await send(() => yes(0.7, 0.4), { count: 3, maxUsd: 1, estimateOf: () => 0.4 });
  assert.equal(calls.length, 2);
  assert.equal(sent.stop, "The spending limit would be passed.");
  assert.ok(sent.spent <= 1);
});

test("an answer that is charged for but cannot be read still counts towards the limit", async () => {
  const unreadable = () => reply(200, { answers: {}, usage: { cost: 0.3 } });
  const { sent, saved } = await send(unreadable, { count: 1, maxUsd: 1 });
  assert.equal(saved.length, 0);
  assert.equal(sent.spent.toFixed(1), "0.6");
});

test("on Google's own API the key goes in its header and the options by id", () => {
  const wire = wireOf(GOOGLE, request(0));
  assert.equal(wire.headers["x-goog-api-key"], "k");
  assert.equal(wire.headers.Authorization, undefined);
  const body = JSON.parse(wire.body);
  assert.deepEqual(Object.keys(body.questions.q.criteria), ["o1", "o2"]);
  assert.equal(wire.probability({ answers: { q: { probabilities: { o1: 0.6, o2: 0.4 } } } }, "q", "Yes"), 0.6);
});

test("an answer is priced as the provider reports it, else from its tokens, else from its size", () => {
  assert.deepEqual(priceOf(GATEWAY, { usage: { cost: 0.002 } }, "x"), { usd: 0.002, tokens: null, reported: true });
  assert.equal(priceOf(GATEWAY, { usage: { total_tokens: 1000 } }, "x").usd, 0.001);
  assert.equal(priceOf(GATEWAY, {}, "x".repeat(3500)).usd, 0.001);
  assert.equal(priceOf({ ...GATEWAY, charged: false }, { usage: { cost: 0.002 } }, "x").usd, 0);
});

test("requests in flight follow the published limit", () => {
  assert.equal(mostAtOnce(GATEWAY), 16);
  assert.equal(mostAtOnce({ limits: { rpm: 200 } }), 7);
  assert.equal(mostAtOnce({ limits: { rpm: 10 } }), 2);
});
