import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  INSTRUCTION,
  ONE_FACT,
  clearGaps,
  loadStudies,
  measures,
  planFor,
  probesInside,
  requestFor,
  score,
} from "./run.ts";
import type { Field } from "../../scripts/population.ts";
import * as scan from "../../scripts/scan.ts";

// A toy study: one question with two answers, published by age (two groups) and by tenure (two groups, one of them
// two values), and a third tenure group too thin in the original draw to be scored.
const study = {
  id: "toy",
  country: "uk",
  surveyed: "May 2026",
  context: "",
  question: "Do you have savings?",
  options: ["Yes", "No"],
  groups: [
    {
      dimension: "Age",
      buckets: [
        { label: "Young", match: { field: "age_years", min: 18, max: 34 }, real: [30, 70], drawn: 100 },
        { label: "Old", match: { field: "age_years", min: 35, max: 100 }, real: [60, 40], drawn: 200 },
      ],
    },
    {
      dimension: "Tenure",
      buckets: [
        { label: "Owners", match: { field: "home_tenure", in: ["own", "mortgage"] }, real: [70, 30], drawn: 150 },
        { label: "Renters", match: { field: "home_tenure", in: ["rent"] }, real: [40, 60], drawn: 120 },
        { label: "Other", match: { field: "home_tenure", in: ["other"] }, real: [10, 90], drawn: 20 },
      ],
    },
  ],
};
const map = {
  fields: [
    { name: "age_years", path: "identity.age_years", range: { min: 18, max: 100 }, quantiles: { p50: 48 } },
    {
      name: "home_tenure",
      path: "home_and_travel.home_tenure",
      kind: "categorical",
      values: [
        { code: "own", share: "30%" },
        { code: "mortgage", share: "10%" },
        { code: "rent", share: "50%" },
        { code: "other", share: "10%" },
      ],
    },
  ] as Field[],
};
const maps = { uk: map };

/** Saved rows for one fact in both option orders: `yes` (0 to 1) in the first order, and `yes + tilt` in the second. */
const rows = (id: string, yes: number, tilt = 0) => [
  { study: "toy", id, r: 0, p: [yes, 1 - yes] },
  { study: "toy", id, r: 1, p: [yes + tilt, 1 - yes - tilt] },
];

test("the clear differences are pairs of scored groups 10 points or more apart, on each answer", () => {
  const age = clearGaps(study, study.groups[0]);
  assert.deepEqual(
    age.map((g) => [g.a, g.b, g.option, g.realGap]),
    [
      ["Young", "Old", "Yes", -30],
      ["Young", "Old", "No", 30],
    ],
  );
  // "Other" has fewer than 30 drawn: never part of a difference.
  assert.equal(clearGaps(study, study.groups[1]).length, 2);
});

test("a group's values: codes listed, or ages between its bounds", () => {
  const ages = [20, 25, 35, 45].map((a) => ({ value: a, code: String(a) }));
  assert.deepEqual(
    probesInside({ min: 18, max: 34 }, ages).map((p) => p.code),
    ["20", "25"],
  );
  assert.deepEqual(
    probesInside({ in: ["rent"] }, [{ code: "own" }, { code: "rent" }]).map((p) => p.code),
    ["rent"],
  );
});

test("a request asks each value in both orders and names the fact in the instruction, as the scan does", () => {
  const probes = [
    { value: "own", code: "own" },
    { value: "rent", code: "rent" },
  ];
  const { body, index } = requestFor(study, map.fields[1], probes, "gemini-decision-1");
  assert.deepEqual(Object.keys(body.questions), ["v0_o0", "v1_o0", "v0_o1", "v1_o1"]);
  assert.deepEqual(body.state.respondent, { profile: { country: "uk" } });
  assert.equal(body.state.survey.context, "It is May 2026.");
  assert.deepEqual(body.state.survey.questions.q1.options, ["No", "Yes"]);
  assert.match(
    body.questions.v1_o1.instructions,
    /one more fact about this person, `home_and_travel.home_tenure`: "rent",/,
  );
  assert.match(body.questions.v1_o1.instructions, /survey\.questions\.q1\.text/);
  assert.deepEqual(
    index.map((q) => q.id),
    [
      "home_and_travel.home_tenure=own",
      "home_and_travel.home_tenure=rent",
      "home_and_travel.home_tenure=own",
      "home_and_travel.home_tenure=rent",
    ],
  );
  // The answers are read back in the study's own option order, whatever order they were asked in.
  assert.deepEqual(index[2].names, ["Yes", "No"]);
});

test("the instruction and the one-fact wording are still the ones scripts/scan.ts sends", () => {
  assert.equal(INSTRUCTION, scan.DEFAULT_INSTRUCTION);
  assert.equal(ONE_FACT, scan.ONE_FACT);
});

test("scoring a toy study: groups weighted by share, direction, size, both errors and order noise", () => {
  const saved = [
    ...rows("base", 0.5),
    ...rows("identity.age_years=20", 0.2, 0.04),
    ...rows("identity.age_years=25", 0.3),
    ...rows("identity.age_years=35", 0.5),
    ...rows("identity.age_years=45", 0.7),
    ...rows("identity.age_years=55", 0.7),
    ...rows("identity.age_years=65", 0.7),
    ...rows("identity.age_years=75", 0.7),
    ...rows("identity.age_years=85", 0.7),
    ...rows("home_and_travel.home_tenure=own", 0.8),
    ...rows("home_and_travel.home_tenure=mortgage", 0.4),
    ...rows("home_and_travel.home_tenure=rent", 0.45),
    ...rows("home_and_travel.home_tenure=other", 0.1),
  ];
  const { total, studies, base, unanswered } = score([study], maps, saved);
  assert.ok(total);
  assert.deepEqual(unanswered, []);
  assert.equal(total.groups, 4); // Other is not scored
  assert.equal(total.gaps, 4);
  // Young: ages 20 (0.22 averaged over orders) and 25 (0.3) -> 26 yes. Old: 35..85 -> (50 + 5 * 70) / 6 = 66.67.
  // Owners: own 0.8 at 30% and mortgage 0.4 at 10% -> 70 yes. Renters: 45 yes.
  // Gaps: age -40.67 against -30 (both answers), tenure 25 against 30 (both answers): all the right way.
  assert.equal(total.right, 4);
  assert.ok(Math.abs(Number(total.size) - (40.667 / 30 + 25 / 30) / 2) < 1e-3);
  // Error as answered: Young |26-30|, Old |66.67-60|, Owners 0, Renters 5 -> (4 + 6.67 + 0 + 5) / 4.
  assert.ok(Math.abs(Number(total.errorAnswered) - (4 + 20 / 3 + 0 + 5) / 4) < 1e-9);
  // On differences only, age is centred by drawn weights: scan mean (100 * 26 + 200 * 66.67) / 300 = 53.11,
  // real mean 50, so Young -> 26 - 3.11 = 22.89 (error 7.11), Old -> 63.56 (error 3.56).
  const age = measures(
    [
      { dim: "a", n: 100, real: [30, 70], scan: [26, 74] },
      { dim: "a", n: 200, real: [60, 40], scan: [200 / 3, 100 / 3] },
    ],
    [],
  );
  assert.ok(Math.abs(Number(age.errorDifferences) - (7.111 + 3.556) / 2) < 1e-2);
  // Only age 20 was asked differently in the two orders: 4 points on each answer, over 13 facts.
  assert.ok(Math.abs(Number(studies[0].noise) - 4 / 13) < 1e-9);
  // With nothing known every group gets 50: (20 + 10 + 20 + 10) / 4.
  assert.equal(base, 15);
});

test("a group with no saved answer is named and left out", () => {
  const { total, unanswered } = score([study], maps, [...rows("base", 0.5), ...rows("identity.age_years=20", 0.2)]);
  assert.ok(total);
  assert.equal(total.groups, 1);
  assert.equal(total.gaps, 0);
  assert.equal(unanswered.length, 3);
});

test("the 22 studies plan as the original: 393 groups, 345 clear differences, 1,970 questions", () => {
  const studies = loadStudies();
  const scored = studies.flatMap((s) => s.groups.flatMap((g) => g.buckets.filter((b) => b.drawn >= 30)));
  const gaps = studies.flatMap((s) => s.groups.flatMap((g) => clearGaps(s, g)));
  assert.equal(studies.length, 22);
  assert.equal(scored.length, 393);
  assert.equal(gaps.length, 345);
  const shipped = {
    uk: JSON.parse(readFileSync(new URL("../../maps/uk.json", import.meta.url), "utf8")),
    us: JSON.parse(readFileSync(new URL("../../maps/us.json", import.meta.url), "utf8")),
  };
  const { jobs, problems } = planFor(studies, shipped);
  assert.deepEqual(problems, []);
  assert.equal(
    jobs.reduce((sum, job) => sum + job.request.index.length, 0),
    1970,
  );
});
