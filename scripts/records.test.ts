import assert from "node:assert/strict";
import test from "node:test";
import {
  labelled,
  lineRecords,
  named,
  openLog,
  resolutionText,
  resolved,
  said,
  type LogRecord,
  type Resolution,
} from "./log.ts";
import { loggedNumbers, parseLog, resolutionsOf } from "./records.ts";
import { logText, run } from "./testing.ts";

test("a log is read as runs; a torn last line is left out, any other line that is not a record is an error", () => {
  const text = logText([
    run("people", "counted", "31.0 in every 100"),
    run("note", null, { type: "verdict", ready: true, pays: null }),
  ]);
  const runs = parseLog(text);
  assert.deepEqual(
    runs.map((r) => [r.tool, r.label, r.records.length]),
    [
      ["people", "counted", 1],
      ["note", null, 1],
    ],
  );
  assert.equal(parseLog(`${text}{"type":"line","te`).length, 2);
  assert.throws(() => parseLog(`not a record\n${text}`), /line 1: not a record/);
  assert.throws(
    () => parseLog(`${JSON.stringify({ type: "line", text: "x", run: "nobody" })}\n`),
    /a record of no run/,
  );
});

test("a run's records interleaved with another's are kept with their own run", () => {
  const records: LogRecord[] = [];
  const scan = openLog("scan", [], { label: "simulated", sinks: [(r) => records.push(r)], print: () => {} });
  const people = openLog("people", [], { label: "counted", sinks: [(r) => records.push(r)], print: () => {} });
  scan.line("12% keen");
  people.line("31.0 in every 100");
  scan.record("paced", { minutes: 3 });
  const runs = parseLog(records.map((r) => JSON.stringify(r)).join("\n"));
  assert.deepEqual(
    runs.map((r) => [r.tool, r.records.map((x) => x.type)]),
    [
      ["scan", ["line", "paced"]],
      ["people", ["line"]],
    ],
  );
  assert.deepEqual(loggedNumbers(runs), { counted: [31, 100], computed: [], simulated: [12], measured: [] });
});

test("a part of a line goes to its own label, and its numbers leave the line's", () => {
  const [line] = lineRecords("  x1.29  plan  6.6% of adults, about 17.9m | 8% there", "simulated", {
    counted: ["6.6% of adults, about 17.9m"],
  });
  assert.deepEqual(line.parts, { counted: ["6.6% of adults, about 17.9m"] });
  const logged = loggedNumbers([run("discover", "simulated", line)]);
  assert.deepEqual(
    [logged.counted, logged.simulated],
    [
      [6.6, 17.9],
      [1.29, 8],
    ],
  );
});

test("a server tool's lines keep the label each was made with, and its next move is a record of its own", () => {
  const out = said(
    [
      "Exploring",
      null,
      labelled("counted", "size: 2.0 in every 100 adults"),
      named("Next (free): corner_split"),
      "why",
    ],
    null,
  );
  assert.equal(out.text, "Exploring\nsize: 2.0 in every 100 adults\nNext (free): corner_split\nwhy");
  assert.deepEqual(
    out.records.map((r) => [r.type, "label" in r ? (r.label ?? null) : null]),
    [
      ["line", null],
      ["line", "counted"],
      ["next", null],
      ["line", null],
    ],
  );
  assert.deepEqual(
    said(["a", labelled("simulated", "b")], "measured").records.map((r) => ("label" in r ? r.label : undefined)),
    ["measured", "simulated"],
  );
});

test("what a step that looked further found is a line to keep, its figures logged, and a resolution of its own", () => {
  const r: Resolution = { checked: "x", found: "2.0 in every 100 (counted)", outcome: "unclear", why: "it depends" };
  assert.equal(
    resolutionText(r),
    "Looked further at x: 2.0 in every 100 (counted). Result: could not tell; it depends.",
  );
  const out = said(["a", resolved("k", r, "counted")]);
  assert.equal(out.text, `a\nKeep in the reply, outside any draft: ${JSON.stringify(resolutionText(r))}`);
  assert.deepEqual(out.records.at(-1), { type: "resolution", key: "k", outcome: "unclear", text: resolutionText(r) });
  const written: LogRecord[] = [];
  const log = openLog("probe", [], { label: "counted", sinks: [(rec) => written.push(rec)], print: () => {} });
  log.resolve("k", r);
  log.resolve("k", { ...r, outcome: "confirmed" });
  const runs = parseLog(written.map((rec) => JSON.stringify(rec)).join("\n"));
  assert.ok(loggedNumbers(runs).counted.includes(2));
  assert.deepEqual(
    resolutionsOf(runs).map((x) => x.outcome),
    ["confirmed"],
  );
});
