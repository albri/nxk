import assert from "node:assert/strict";
import test from "node:test";
import { depthOf, nudgeLine, resolutionsIn, callsOf, shallow } from "./depth.ts";

/** A tool call for a test transcript: its name, input and output, and whether it failed. */
type TestCall = [name: string, input: Record<string, unknown>, text: string, error?: boolean];

/** A transcript of tool calls: [name, input, output] each, as Claude Code writes them. */
export function transcript(calls: TestCall[]): string[] {
  return calls.flatMap(([name, input, text, error = false], i) => [
    JSON.stringify({
      type: "assistant",
      message: {
        content: [
          { type: "tool_use", id: `t${i}`, name: /^[A-Z]/.test(name) ? name : `mcp__plugin_nxk_nxk__${name}`, input },
        ],
      },
    }),
    JSON.stringify({
      type: "user",
      message: {
        content: [{ type: "tool_result", tool_use_id: `t${i}`, content: [{ type: "text", text }], is_error: error }],
      },
    }),
  ]);
}

test("depth counts looks, tests, what came after the first scan, raw-file scripts and nudges taken", () => {
  const lines = transcript([
    ["product", {}, "Path: who_for"],
    ["people", { action: "count", who: "a=1" }, 'A: 10 people\n\nNext: people {"action":"profile"}. Why.'],
    ["people", { action: "profile", who: "a=1" }, "more 40% against 20%  b: x"],
    ["options_scan", { label: "s", spec: {}, max_usd: 1 }, "Simulated..."],
    ["options_scan", { label: "s", read_only: true }, "Simulated again"],
    ["Bash", { command: "python3 -c \"open('.nxk/data/people-uk-all.csv.gz')\"" }, "12"],
    ["note_check", { reply: "x" }, "FAIL", true],
  ]);
  const d = depthOf(lines);
  assert.equal(d.nxk, 6);
  assert.equal(d.looks, 3); // two counts and the script on the raw file
  assert.equal(d.tests, 2);
  assert.equal(d.after, 1); // the script; reading the same scan again for everyone asks nothing new
  assert.equal(d.raw, 1);
  assert.deepEqual([d.nudges, d.followed, d.errors], [1, 1, 1]);
  assert.equal(shallow(d), false);
  assert.equal(nudgeLine('text\n\nNext: people {"a":1}. Why.\nmore'), 'Next: people {"a":1}. Why.');
});

test("a session that read a scan and asked nothing more is shallow; so is one that looked twice and never scanned", () => {
  assert.equal(
    shallow(
      depthOf(
        transcript([
          ["ideas_scan", { label: "x" }, "Running"],
          ["ideas_scan", { label: "x" }, "read"],
          ["segment_add", {}, "Kept"],
        ]),
      ),
    ),
    true,
  );
  assert.equal(
    shallow(
      depthOf(
        transcript([
          ["ideas_scan", { label: "x" }, "read"],
          ["options_scan", { label: "x", who: "a=1" }, "group"],
        ]),
      ),
    ),
    false,
  );
  assert.equal(
    shallow(
      depthOf(
        transcript([
          ["people", { action: "find" }, ""],
          ["people", { action: "count" }, ""],
        ]),
      ),
    ),
    true,
  );
});

test("depth counts the steps that looked further by what they came to, each line once", () => {
  const confirmed =
    'Keep in the reply, outside any draft: "Looked further at aged 65 or over, among adults: it is about the same. Result: confirmed; who your customers are does not move it."';
  const lines = transcript([
    ["probe", { who: "age_years=65..120" }, `Counted\n${confirmed}`],
    ["probe", { who: "age_years=65..120" }, `Counted\n${confirmed}`],
    [
      "explore_next",
      {},
      'Leads\nLooked further at whether the kind of customers you have could change "Deposit": it turns on it. Result: could not tell; it stays "Deposit" until you know.\nNext: x',
    ],
    [
      "options_scan",
      {},
      [
        'Keep in the reply, outside any draft: "Looked further at which version of \\"a\\" gets the answer \\"Try it\\" most:',
        '\\"b\\" first for adults (simulated). Result: changed; \\"b\\" over \\"a\\"."',
      ].join(" "),
    ],
    ["Bash", { command: "echo Looked further at x: y. Result: changed." }, "Looked further at x: y. Result: changed."],
  ]);
  assert.deepEqual(resolutionsIn(callsOf(lines)), { changed: 1, confirmed: 1, unclear: 1 });
  const d = depthOf(lines);
  assert.deepEqual([d.changed, d.confirmed, d.unclear], [1, 1, 1]);
});
