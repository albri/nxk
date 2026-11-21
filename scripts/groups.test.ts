import assert from "node:assert/strict";
import test from "node:test";
import {
  bandsOf,
  conditionsOf,
  draw,
  margin,
  marked,
  matches,
  nearestFields,
  profile,
  reach,
  sheet,
  split,
  valueOf,
  type MedianLine,
  type ShareLine,
} from "./groups.ts";
import type { Field, ListedField, NumericField } from "./population.ts";

test("profile shows what marks a group out from everyone", () => {
  const fields = [
    {
      path: "home.tenure",
      tier: "A",
      values: [
        { code: "owns", label: "Owns" },
        { code: "rents", label: "Rents" },
      ],
    },
    { path: "id.age", tier: "A", quantiles: { p50: 48 } },
    { path: "life.hobbies", tier: "B", values: [{ code: "golf" }, { code: "chess" }] },
  ] as Field[];
  // 100 people: the first 40 are the group; 30 of them rent, against 10 of the other 60.
  const rows = Array.from({ length: 100 }, (_, i) => [
    i < 30 || (i >= 40 && i < 50) ? 1 : 0,
    i < 40 ? 30 : 60,
    i % 2 ? [0, 1] : [0],
  ]);
  const result = profile(
    fields,
    rows,
    rows.map((_, i) => i < 40),
  );
  const rents = result.find((r) => r.code === "rents") as ShareLine;
  assert.ok(Math.abs(rents.group - 0.75) < 1e-9 && Math.abs(rents.all - 0.4) < 1e-9 && rents.errors > 3);
  assert.equal(result[0].path, "home.tenure");
  const age = result.find((r) => r.numeric) as MedianLine;
  assert.deepEqual([age.group, age.all], [30, 60]);
  const golf = result.find((r) => r.code === "golf") as ShareLine;
  assert.ok(Math.abs(golf.gap) < 1e-9);
});

const TENURE = {
  path: "home.tenure",
  name: "tenure",
  tier: "A",
  kind: "categorical",
  values: [
    { code: "owns", label: "Owns" },
    { code: "rents", label: "Rents" },
  ],
} as ListedField;
const AGE = {
  path: "id.age",
  name: "age",
  tier: "A",
  range: { min: 18, max: 100 },
  quantiles: { p25: 30, p75: 60 },
} as NumericField;
const HOBBIES = {
  path: "life.hobbies",
  name: "hobbies",
  tier: "B",
  kind: "list",
  values: [
    { code: "golf", label: "Golf" },
    { code: "chess", label: "Chess" },
  ],
} as ListedField;
// 100 people: the first 50 own and are 60, the rest rent and are 30; even-numbered people play golf, the first 25 chess.
const PEOPLE = Array.from({ length: 100 }, (_, i) => [
  i < 50 ? 0 : 1,
  i < 50 ? 60 : 30,
  [...(i % 2 ? [] : [0]), ...(i < 25 ? [1] : [])],
]);
const FIELDS = [TENURE, AGE, HOBBIES];

test("conditionsOf reads values, alternatives and ranges", () => {
  const [owns, young] = conditionsOf(FIELDS, ["tenure=owns", "age=18..34"]);
  assert.equal(PEOPLE.filter((row) => owns.test(row)).length, 50);
  assert.equal(PEOPLE.filter((row) => young.test(row)).length, 50);
  assert.equal(PEOPLE.filter((row) => conditionsOf(FIELDS, ["hobbies=golf|chess"])[0].test(row)).length, 62);
  assert.throws(() => conditionsOf(FIELDS, ["tenure=squats"]), /Values: owns, rents/);
  assert.throws(() => conditionsOf(FIELDS, ["nothing=1"]), /No field/);
});

const SCALED = [
  {
    name: "income",
    path: "money.income",
    kind: "categorical",
    values: ["under_10k", "10k_to_20k", "20k_to_40k", "40k_or_more", "not_known"].map((code) => ({
      code,
      label: code,
    })),
    order: ["under_10k", "10k_to_20k", "20k_to_40k", "40k_or_more"],
  },
  {
    name: "tenure",
    path: "home.tenure",
    kind: "categorical",
    values: ["owned", "rented"].map((code) => ({ code, label: code })),
  },
] as Field[];

test("a range of codes on a scale takes the codes between them, either way round", () => {
  const [up] = conditionsOf(SCALED, ["income=20k_to_40k..40k_or_more"]);
  assert.equal(up.text, "20k_to_40k or 40k_or_more");
  assert.equal(conditionsOf(SCALED, ["income=40k_or_more..20k_to_40k"])[0].text, up.text);
  assert.ok(up.test([2, 0]) && up.test([3, 1]) && !up.test([1, 0]) && !up.test([4, 0]));
  assert.throws(() => conditionsOf(SCALED, ["tenure=owned..rented"]), /not a scale/);
  assert.throws(() => conditionsOf(SCALED, ["income=under_10k..not_known"]), /two codes of its scale/);
});

test("numbers given for a scale of bands name the bands that hold them, in the error", () => {
  const order = [
    "under_12570_gbp",
    "12570_to_19999_gbp",
    "20000_to_29999_gbp",
    "70000_to_99999_gbp",
    "150000_gbp_or_more",
  ];
  const income = [
    {
      name: "income",
      path: "money.income",
      kind: "categorical",
      order,
      values: order.map((code) => ({ code, label: code })),
    },
  ] as Field[];
  assert.throws(
    () => conditionsOf(income, ["income=20000..80000"]),
    /income=20000\.\.80000 names numbers: income=20000_to_29999_gbp\.\.70000_to_99999_gbp counts the bands that hold them/,
  );
  assert.throws(() => conditionsOf(income, ["income=9000..200000"]), /income=under_12570_gbp\.\.150000_gbp_or_more/);
  // A count of children is a scale of plain numbers with an open top: 1..9 is 1 to 6 or more.
  const kids = ["0", "1", "2", "6_or_more"];
  const children = [
    {
      name: "children",
      path: "home.children",
      kind: "categorical",
      order: kids,
      values: kids.map((code) => ({ code, label: code })),
    },
  ] as Field[];
  assert.throws(() => conditionsOf(children, ["children=1..9"]), /children=1\.\.6_or_more counts the bands/);
  assert.throws(
    () => conditionsOf(income, ["income=cheap..dear"]),
    /the lower first: under_12570_gbp < .*gbp_or_more\.$/,
  );
});

test("two values of a field a person holds one of hold nobody together: the error says to join them with |", () => {
  assert.throws(
    () => conditionsOf(FIELDS, ["tenure=owns", "age=18..34", "tenure=rents"]),
    /A person has one tenure, so "Owns" and "Rents" together hold nobody\. For either, join the codes with \|: tenure=owns\|rents/,
  );
  // "tenure=owns,rents" splits into a code alone, which is said to be tenure's.
  assert.throws(
    () => conditionsOf(FIELDS, ["tenure=owns", "rents"]),
    /"rents" is a code of tenure, not a condition: write tenure=rents/,
  );
  // Values that overlap narrow the group, and a list field holds several values at once.
  assert.equal(conditionsOf(FIELDS, ["tenure=owns|rents", "tenure=owns"]).length, 2);
  assert.equal(
    PEOPLE.filter((row) => matches(conditionsOf(FIELDS, ["hobbies=golf", "hobbies=chess"]), row)).length,
    13,
  );
});

test("a value written as its label, or as the start of one, is that value; two that start alike match neither", () => {
  const money = {
    name: "managing_financially",
    path: "money.managing_financially",
    values: [
      { code: "doing_okay", label: "Doing okay financially" },
      { code: "finding_it_difficult", label: "Finding it difficult to get by financially" },
      { code: "just_about_getting_by", label: "Just about getting by financially" },
    ],
  } as ListedField;
  const region = {
    name: "region",
    path: "home.region",
    values: [
      { code: "north_west_england", label: "North West England" },
      { code: "north_east_england", label: "North East England" },
    ],
  } as ListedField;
  assert.equal(valueOf(money, "doing_okay"), 0);
  assert.equal(valueOf(money, "doing_okay_financially"), 0); // the label as a code
  assert.equal(valueOf(money, "finding_it_difficult_to_get_by"), 1); // the label cut short
  assert.equal(valueOf(region, "north_west"), 0); // the code cut short
  assert.equal(valueOf(region, "north"), -1); // two values start so
  assert.equal(valueOf(money, "okay"), -1); // not from the start
  assert.equal(
    conditionsOf([money], ["managing_financially=doing_okay_financially"])[0].text,
    "Doing okay financially",
  );
  // Unmatched: the values that hold the word come first.
  assert.throws(
    () => conditionsOf([region], ["region=west"]),
    /No value "west" for region\. Nearest: north_west_england\. Values:/,
  );
});

test("a range starting below the people says so, and one wholly outside them is refused rather than counted as nobody", () => {
  // The people start at 18, so age=17..60 is counted, and said, as 18 to 60.
  const [past] = conditionsOf(FIELDS, ["age=17..60"]);
  assert.match(past.text, /^age 18 to 60 \(asked 17 to 60; the people run from 18 to 100\)$/);
  assert.equal(PEOPLE.filter((row) => past.test(row)).length, 100);
  // Above the top nobody is left out (the top holds everyone at or over it): the usual 65..120 reads as asked.
  assert.equal(conditionsOf(FIELDS, ["age=40..120"])[0].text, "age 40 to 120");
  assert.equal(conditionsOf(FIELDS, ["age=18..34"])[0].text, "age 18 to 34");
  assert.throws(
    () => conditionsOf(FIELDS, ["age=17..17"]),
    /outside the people: the people run from 18 to 100, so nobody there can be counted.*published source/,
  );
  assert.throws(() => conditionsOf(FIELDS, ["age=60..18"]), /lower number first/);
});

test("marked keeps real gaps and drops the same fact shown twice", () => {
  const lines = profile(
    FIELDS,
    PEOPLE,
    PEOPLE.map((_, i) => i < 50),
  );
  const shown = marked(lines, { gap: 0.1 });
  assert.ok(shown.some((line) => line.label === "Owns"));
  assert.ok(!shown.some((line) => line.numeric));
  assert.equal(new Set(shown.map((line) => line.label)).size, shown.length);
});

test("reach applies requirements in order and says who dropped out", () => {
  const needs = conditionsOf(FIELDS, ["tenure=owns", "hobbies=golf"]);
  const result = reach(PEOPLE, needs);
  assert.deepEqual([result.start, ...result.steps.map((step) => step.left)], [100, 50, 25]);
  assert.equal(result.in.length + result.out.length, 100);
  const within = reach(
    PEOPLE,
    needs.slice(1),
    PEOPLE.map((_, i) => i).filter((i) => i < 50),
  );
  assert.deepEqual([within.start, within.steps[0].left], [50, 25]);
});

test("split breaks a field down within a group, and margin shrinks with more people", () => {
  const all = PEOPLE.map((_, i) => i),
    owners = all.filter((i) => i < 50);
  const hobbies = split(HOBBIES, 2, PEOPLE, owners, all);
  assert.deepEqual(
    hobbies.map((line) => [line.code, line.group, line.all]),
    [
      ["golf", 0.5, 0.5],
      ["chess", 0.5, 0.25],
    ],
  );
  assert.deepEqual(
    split(
      AGE,
      1,
      PEOPLE,
      all.filter((i) => i >= 50),
      all,
    )[0],
    { label: "middle value", group: 30, all: 60, numeric: true },
  );
  // A number splits into bands too, each with the group's share against everyone's.
  const bands = split(
    AGE,
    1,
    PEOPLE,
    all.filter((i) => i >= 50),
    all,
  ).slice(1);
  assert.deepEqual(
    bands.map((b) => [b.label, b.group, b.all]),
    [
      ["18 to 29", 0, 0],
      ["30 to 59", 1, 0.5],
      ["60 or more", 0, 0.5],
    ],
  );
  assert.ok(margin(0.5, 100) > margin(0.5, 10000) && Math.abs(margin(0.5, 10000) - 0.0098) < 1e-4);
});

test("draw takes n different people and repeats for the same seed", () => {
  const all = Array.from({ length: 50 }, (_, i) => i);
  const first = draw(all, 8, 3);
  assert.equal(new Set(first).size, 8);
  assert.deepEqual(draw(all, 8, 3), first);
  assert.notDeepEqual(draw(all, 8, 4), first);
  assert.equal(draw(all, 80, 1).length, 50);
});

test("sheet prints what is always wanted and only what sets a person apart", () => {
  const fields = [
    { name: "age_years", quantiles: { p50: 48 } },
    { name: "life_stage", values: [{ code: "retired", label: "Retired", share: "23%" }] },
    {
      name: "work",
      values: [
        { code: "retired", label: "Retired", share: "23%" },
        { code: "in_work", label: "In paid work", share: "58%" },
      ],
    },
    {
      name: "internet",
      values: [
        { code: "daily", label: "Uses the internet daily", share: "87%" },
        { code: "never", label: "Has never used the internet", share: "7%" },
      ],
    },
    {
      name: "devices",
      values: [
        { code: "smartphone", label: "Smartphone", share: "83%" },
        { code: "console", label: "Games console", share: "20%" },
      ],
    },
    { name: "difficulties", values: [{ code: "seeing", label: "Vision impairment (even with glasses)", share: "3%" }] },
  ] as Field[];
  const options = { always: ["age_years", "life_stage", "work"], telling: ["internet", "devices", "difficulties"] };
  const older = sheet(fields, [81, 0, 0, 1, [1], [0]], options);
  assert.deepEqual(older.always, [
    { name: "age_years", text: "81" },
    { name: "life_stage", text: "Retired" },
  ]); // "Retired" once
  assert.deepEqual(
    older.telling.map((entry) => entry.text),
    ["Has never used the internet", "no smartphone", "Vision impairment"],
  );
  const usual = sheet(fields, [40, null, 1, 0, [0, 1], []], options);
  assert.deepEqual(
    usual.always.map((entry) => entry.text),
    ["40", "In paid work"],
  );
  assert.deepEqual(usual.telling, []);
});

test("a number's bands: the usual ones for age, its quantiles for anything else; and the nearest names", () => {
  assert.deepEqual(
    bandsOf({ range: { min: 18, max: 100, unit: "years" }, quantiles: { p10: 24, p90: 76 } } as NumericField).map(
      (b) => b.label,
    ),
    ["18 to 24", "25 to 34", "35 to 44", "45 to 54", "55 to 64", "65 to 74", "75 or more"],
  );
  // A small count whose quantiles repeat gives one band a value, and starts at its lowest.
  assert.deepEqual(
    bandsOf({ range: { min: 0, max: 36 }, quantiles: { p10: 0, p25: 0, p50: 1, p75: 2, p90: 5 } } as NumericField).map(
      (b) => [b.label, ...b.range],
    ),
    [
      ["0", 0, 0],
      ["1", 1, 1],
      ["2 to 4", 2, 4],
      ["5 or more", 5, 36],
    ],
  );
  const fields = [
    "age_years",
    "youngest_dependent_child_age",
    "main_language",
    "mortgage_balance_outstanding",
    "life_stage",
  ].map((name) => ({ name })) as Field[];
  assert.equal(nearestFields(fields, "age_band"), "age_years, youngest_dependent_child_age");
});

test("a sentence written as a condition is told what a condition is, and where a sentence goes", () => {
  assert.throws(
    () => conditionsOf(FIELDS, ["Pays all 12 months whatever happens"]),
    /is a sentence, not a condition.*field=code.*"fits_everyone".*"no_suggestion"/s,
  );
  assert.throws(() => conditionsOf(FIELDS, ["nothing=1"]), /No field/);
});
