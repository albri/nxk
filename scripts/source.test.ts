import assert from "node:assert/strict";
import test from "node:test";
import { around, describeProblems, figuresOf, holds, linksIn, sourceProblems, squash } from "./source.ts";

test("words are found whatever the case, spacing, quote marks and punctuation", () => {
  const page = "Freeze cost\nCore and Off-peak memberships – You can freeze for up to 3 months\nfor £ 6.99 per month.";
  assert.ok(holds(page, "you can freeze for up to 3 months for £6.99 per month"));
  assert.ok(holds("Members’ area: £1,200 a year", "members area £1200 a year"));
  assert.ok(!holds(page, "freeze for £5.99 per month"));
  assert.ok(!holds("costs £700", "costs £70"), "a figure is not found inside a longer one");
  assert.equal(squash("£57.60/£39.20."), " £57.60 £39.20 ");
});

test("figures leave out the links and a year standing alone", () => {
  assert.deepEqual(
    figuresOf("Spire Leeds £70 and £55 (Spire Healthcare, 2026, https://example.com/a-1/2027)"),
    [70, 55],
  );
  assert.deepEqual(
    figuresOf("rules apply from January 1, 2027 to 12-month contracts; 30% off; £2,000"),
    [1, 12, 30, 2000],
  );
});

test("links lose the punctuation after them", () => {
  assert.deepEqual(linksIn("(sourced, https://a.example/x). See https://b.example/y;"), [
    "https://a.example/x",
    "https://b.example/y",
  ]);
});

test("a sourced text needs each link opened, and each figure in the words checked on its pages", () => {
  const records = [
    { url: "https://gym.example/freeze/", words: "You can freeze for up to 3 months for £6.99 per month" },
  ];
  assert.deepEqual(
    sourceProblems("PureGym freeze £6.99 a month, up to 3 months (PureGym, 2026, https://gym.example/freeze)", records),
    { unopened: [], missing: [], words: [records[0].words] },
  );
  const wrongPage = sourceProblems("freeze £6.99 (PureGym, 2026, https://gym.example/cancel)", records);
  assert.deepEqual(wrongPage.unopened, ["https://gym.example/cancel"]);
  assert.match(describeProblems(wrongPage)[0], /was not opened: run source_check with https:\/\/gym\.example\/cancel/);
  const ownFigure = sourceProblems("freeze £6.99, above our £5 (PureGym, 2026, https://gym.example/freeze)", records);
  assert.deepEqual(ownFigure.missing, [5]);
  assert.match(describeProblems(ownFigure)[0], /5 is not in the words checked/);
  assert.deepEqual(sourceProblems("freeze £6.99 (https://gym.example/freeze)", null).unopened, [
    "https://gym.example/freeze",
  ]);
});

test("around shows each line with a figure and the lines either side", () => {
  assert.deepEqual(around(["Physiotherapy", "Members", "£57.60/£39.20", "Initial Assessment - 45 minutes"], [57.6]), [
    "Members | £57.60/£39.20 | Initial Assessment - 45 minutes",
  ]);
});

test("references and dates are not figures, real figures still are", () => {
  assert.deepEqual(figuresOf("under reg 30 and condition C1.14, from 2021-22 and 2021/22, on 1 April or 12 March"), []);
  assert.deepEqual(figuresOf("from 1 May the fee is £28"), [28]);
  assert.deepEqual(figuresOf("£28 for 30 days, 13 miles, 50%, at least 1 month's notice"), [28, 30, 13, 50, 1]);
  assert.deepEqual(figuresOf("up to 20 may be affected"), [20]);
});

test("problems name the source_check tool, not a script", () => {
  const said = describeProblems({ unopened: ["https://a.example/x"], missing: [30] }).join(" ");
  assert.ok(said.includes("source_check") && !said.includes("scripts/"));
});
