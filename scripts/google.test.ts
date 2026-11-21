import assert from "node:assert/strict";
import test from "node:test";
import { pacer, toGoogle } from "./google.ts";

test("toGoogle puts the state in as text and the options under short ids, and maps answers back", () => {
  const request = {
    model: "google/gemini-decision-1",
    state: { respondent: { profile: { age: 40 } } },
    questions: {
      v0_o0: {
        type: "choice",
        instructions: "Pick one.",
        criteria: { "Start the free trial": null, "Option 2": "A very long option text" },
      },
    },
  };
  const { body, idOf } = toGoogle(request, request.model);
  assert.equal(body.model, "gemini-decision-1");
  assert.deepEqual(JSON.parse(body.input), request.state);
  assert.deepEqual(body.questions.v0_o0.criteria, { o1: "Start the free trial", o2: "A very long option text" });
  assert.equal(idOf("v0_o0", "Start the free trial"), "o1");
  assert.equal(idOf("v0_o0", "Option 2"), "o2");
});

test("the pacer spaces requests to stay under a tokens-a-minute limit", async () => {
  let clock = 0;
  const waits: number[] = [];
  const wait = pacer(
    60000,
    () => clock,
    async (ms) => {
      waits.push(ms);
      clock += ms;
    },
  );
  await wait(1000);
  await wait(1000);
  await wait(1000); // 1,000 tokens at 60,000 a minute: one a second
  assert.deepEqual(waits, [1000, 1000]);
});
