import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { decisionStop, preflight, type Post } from "./decision.ts";
import type { ResultPart } from "./lib.ts";
import { keptOf, type RunRecord } from "./run.ts";

/** A transcript in which `tool` was called and answered `said`. */
const traceOf = (tool: string, said: string | ResultPart[], id = "t1") =>
  [
    { type: "assistant", message: { content: [{ type: "tool_use", id, name: tool }] } },
    { type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, content: said }] } },
  ].map((e) => JSON.stringify(e));
const SCAN = "mcp__plugin_nxk_nxk__options_scan";

test("a scan the account or the key stopped is read from nxk's tool results, and nothing else is", () => {
  const noCredit =
    "15 requests ...\nSpent $0.000 on this spec. Stopped: The decision-model account has no credit left.";
  assert.equal(
    decisionStop(traceOf(SCAN, noCredit)),
    "Spent $0.000 on this spec. Stopped: The decision-model account has no credit left.",
  );
  // The same words in a file the session read, or in its own reply, are not a stopped scan.
  assert.equal(decisionStop(traceOf("Read", noCredit)), null);
  assert.equal(
    decisionStop([JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: noCredit }] } })]),
    null,
  );
  // Credit cards in the people tool's field list are not the account.
  assert.equal(decisionStop(traceOf("mcp__plugin_nxk_nxk__people", "unsecured_debt: credit cards, overdrafts")), null);
  // The daily quota, discover's no-credit note, and a refused key or account; a server error is not one of these.
  for (const said of [
    "Spent $0.111 on this spec. Stopped: The decision model's daily request quota is used up (Google's resets at midnight Pacific time).",
    "No answers can be had for now: the decision-model account has no credit left. Tell the owner ...",
    "Stopped: Requests kept failing; the last error: HTTP 403: PERMISSION_DENIED",
    '4 of 15 requests failed twice and saved nothing (the last error: HTTP 400: {"error":{"message":"API key not valid."}})',
  ])
    assert.ok(decisionStop(traceOf("mcp__plugin_nxk_nxk__ideas_scan", [{ type: "text", text: said }])), said);
  assert.equal(decisionStop(traceOf(SCAN, "the last error: HTTP 500: internal")), null);
  assert.equal(decisionStop(traceOf(SCAN, "Spent $0.004 on this spec.")), null);
});

test("a run whose scans were stopped is a failure that --fill runs again", () => {
  const stopped: RunRecord = { case: "a", failure: "error", error: "the decision model stopped the scans: ..." };
  const scored: RunRecord = { case: "b", score: 1 };
  assert.deepEqual(keptOf([stopped, scored]), { kept: [scored], failures: [stopped] });
});

/** A key folder with a made-up Google key, as the sessions would get it. */
function keys(withKey = true) {
  const dir = mkdtempSync(join(tmpdir(), "nxk-decision-test-"));
  if (withKey) writeFileSync(join(dir, "gemini-key"), "test-key-not-real\n");
  writeFileSync(join(dir, "gemini-tier"), "tier1\n");
  return { env: { NXK_CONFIG_DIR: dir }, home: dir };
}
const answer = (status: number, body: unknown) => async () =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

test("the test answer: one Choice to Google with the key in its header, priced as a scan prices it", async () => {
  const { env, home } = keys();
  const sent: { url: string; init: Post }[] = [];
  const send = async (url: string, init: Post) => {
    sent.push({ url, init });
    return new Response(
      JSON.stringify({ answers: { q: { probabilities: { o1: 0.97, o2: 0.03 } } }, usage: { total_tokens: 60 } }),
      {
        status: 200,
      },
    );
  };
  const got = await preflight(env, { send, home });
  assert.equal(sent.length, 1, "a single request");
  assert.match(sent[0].url, /generativelanguage\.googleapis\.com/);
  assert.equal(sent[0].init.headers["x-goog-api-key"], "test-key-not-real");
  const body = JSON.parse(sent[0].init.body);
  assert.equal(body.model, "gemini-decision-1");
  assert.deepEqual(Object.keys(body.questions), ["q"]);
  assert.deepEqual(got, { model: "gemini-decision-1", route: "google", usd: (60 * 0.1) / 1e6, tokens: 60 });
});

test("the test answer refuses to start, saying what to do, and never shows the key", async () => {
  const { env, home } = keys();
  await assert.rejects(preflight(env, { send: answer(402, "payment required"), home }), /no credit left: top it up/);
  await assert.rejects(
    preflight(env, {
      send: answer(400, { error: { message: "API key not valid: test-key-not-real" } }),
      home,
    }),
    (e: Error) =>
      /refused the key/.test(e.message) && !e.message.includes("test-key-not-real") && /\[key\]/.test(e.message),
  );
  await assert.rejects(preflight(env, { send: answer(403, "PERMISSION_DENIED billing"), home }), /refused the key/);
  await assert.rejects(preflight(env, { send: answer(429, "quota_exceeded per day"), home }), /daily quota/);
  await assert.rejects(preflight(env, { send: answer(200, { answers: {} }), home }), /nothing to read/);
  await assert.rejects(
    preflight(env, {
      send: async () => {
        throw new Error("getaddrinfo ENOTFOUND");
      },
      home,
    }),
    /could not be reached/,
  );
  const none = keys(false);
  let called = false;
  await assert.rejects(
    preflight(none.env, {
      send: async () => {
        called = true;
        return new Response("{}");
      },
      home: none.home,
    }),
    /Not starting: .*no decision-model key reaches the sessions/,
  );
  assert.equal(called, false, "nothing is sent with no key");
});
