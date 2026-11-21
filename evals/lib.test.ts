import assert from "node:assert/strict";
import { test } from "node:test";
import { entriesOf, mean, median, money } from "./lib.ts";

test("a transcript's entries are its lines that hold a JSON object; anything else is skipped", () => {
  const lines = ['{"type":"user"}', '{"type":"assist', "null", "3", "", '{"type":"assistant"}'];
  assert.deepEqual(entriesOf(lines), [{ type: "user" }, { type: "assistant" }]);
  assert.deepEqual(entriesOf(undefined), []);
});

test("the figures a summary prints", () => {
  assert.equal(mean([1, 2, 6]), 3);
  assert.equal(median([5, 1, 3, 2]), 2.5);
  assert.equal(median([]), undefined);
  assert.equal(money(1.5), "$1.50");
  assert.equal(money(0.00123, 4), "$0.0012");
});
