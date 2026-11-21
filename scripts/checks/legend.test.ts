import assert from "node:assert/strict";
import test from "node:test";
import { check } from "../note.ts";
import type { LogRun } from "../records.ts";
import type { ReplyRow } from "../reply.ts";
import { requiredLines } from "./form.ts";
import { countryOf, legendFor } from "./legend.ts";

const legendFails = (reply: string, runs: LogRun[] | null = null) =>
  check(reply, runs).filter((f) => f.check === "legend" && f.level === "FAIL");
const LINE_UK = "counted: on 200,000 made-up UK adults that match official statistics, a rough guide";

test("a counted figure with no word on what counted means fails with the line to add", () => {
  const [f] = legendFails("About 18.3 in every 100 of adults (counted) are left out.\n£12 is the price.");
  assert.ok(
    f.message.includes(`"counted: on 200,000 made-up UK adults that match official statistics, a rough guide"`),
    f.message,
  );
});

test("the line says what each label used means, and only those", () => {
  const [f] = legendFails(
    "18.3 in every 100 of adults (counted).\nAbout 40% (simulated) lean towards it.\n£90 (computed).",
  );
  assert.ok(f.message.includes("counted: on 200,000"));
  assert.ok(
    f.message.includes("simulated: from a scan, which says who is more likely to want something, not how many will"),
  );
  assert.ok(f.message.includes("computed:"));
  assert.ok(!f.message.includes("guess:") && !f.message.includes("measured:"));
});

test("one label, one line: the line passes, as one line or one per label", () => {
  const one = `18.3 in every 100 of adults (counted).\n${LINE_UK}`;
  assert.deepEqual(legendFails(one), []);
  const two = [
    "18.3 in every 100 of adults (counted).",
    "40% (simulated).",
    LINE_UK,
    "simulated: a scan's view, not how many will",
  ];
  assert.deepEqual(legendFails(two.join("\n")), []);
  const part = ["18.3 in every 100 of adults (counted).", "40% (simulated).", LINE_UK].join("\n");
  assert.ok(legendFails(part)[0].message.includes("simulated"));
  assert.ok(!legendFails(part)[0].message.includes("counted:"));
});

test("a session's own sentence naming the label in quotes, with its meaning, passes", () => {
  const own =
    'Figures marked "counted" come from a model of 200,000 made-up UK adults built to match official statistics.';
  assert.deepEqual(legendFails(`19.1 in every 100 UK adults have no car (counted).\n\n${own}`), []);
  assert.equal(legendFails('19.1 in every 100 UK adults have no car (counted).\n\nSee "counted".').length, 1);
});

test("a labelled figure line is not a legend, and a draft's line does not count", () => {
  assert.equal(legendFails("counted: 18.3 in every 100 of adults left out here.").length, 1);
  const drafted = ["18.3 in every 100 of adults (counted).", "```", LINE_UK, "```"].join("\n");
  assert.equal(legendFails(drafted).length, 1);
});

test("a reply with no label needs no legend, and nxk's own line is not itself a use", () => {
  assert.deepEqual(legendFails("Built site/join.html. The price is $29 a month."), []);
  assert.deepEqual(legendFails(LINE_UK), []);
});

test("the line is built for the country: a tool's --country, else the reply's own words", () => {
  const us: LogRun[] = [
    { run: "r1", tool: "people", via: "script", args: ["count", "--country=us"], label: null, records: [] },
  ];
  assert.equal(countryOf({ runs: us, text: "" }), "us");
  assert.equal(countryOf({ runs: null, text: "Councils in England charge £5." }), "uk");
  assert.equal(countryOf({ runs: null, text: "Nothing says where." }), null);
  assert.equal(
    legendFor(["counted"], null),
    "counted: on 200,000 made-up adults that match official statistics, a rough guide",
  );
  const [f] = legendFails("12 in every 100 of adults (counted).", us);
  assert.ok(f.message.includes("made-up US adults"));
});

test("the legend line is one the length check leaves out", () => {
  const lines = ["18.3 in every 100 of adults (counted).", LINE_UK, "Some prose."];
  const ctx = {
    lines,
    drafts: new Set<number>(),
    runs: [],
    rows: lines.map((line, i): ReplyRow => ({
      i,
      line,
      where: `line ${i + 1}`,
      figures: /\d/.test(line) && !/200,000/.test(line) ? ["x"] : [],
      worded: [],
      labels: new Set(),
    })),
  };
  assert.deepEqual([...requiredLines(ctx)], [1]);
});

test("a label that follows a full stop on the line is defined", () => {
  const reply = `18.3 in every 100 of adults (counted).\ngiven: what you told me. ${LINE_UK}`;
  assert.deepEqual(legendFails(reply), []);
});
