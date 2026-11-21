import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { firmsOf, labelOf, longList, orderOf } from "./build-maps.ts";
import type { ListedField, PeopleMap } from "./population.ts";
import { probesOf } from "./scan-answers.ts";

test("a scale keeps its order, leaves out the values off it, and puts counts in number order", () => {
  assert.deepEqual(orderOf("pets_in_household_count", ["1", "2", "5_or_more", "0"]), ["0", "1", "2", "5_or_more"]);
  assert.deepEqual(orderOf("usual_weekly_hours_worked", ["15_hours_or_fewer", "16_to_30_hours", "not_in_employment"]), [
    "15_hours_or_fewer",
    "16_to_30_hours",
  ]);
  assert.equal(
    orderOf("digital_skill_level", ["low_digital_skills", "no_digital_skills_does_not_use_the_internet"])?.[0],
    "no_digital_skills_does_not_use_the_internet",
  );
  assert.equal(orderOf("religion", ["no_religion", "christian"]), null);
});

test("a long list keeps every value held, the most held first, and counts the common ones", () => {
  const { values, common } = longList(
    [
      { code: "a", share: 0.004 },
      { code: "b", share: 0 },
      { code: "c", share: 0.2 },
      { code: "d", share: 0.01 },
    ],
    0.01,
  );
  assert.deepEqual(
    values.map((v) => v.code),
    ["c", "d", "a"],
  );
  assert.equal(common, 2);
  // A scan asks about the common values only; a long list with none (places) is not asked about.
  const field = {
    name: "job",
    path: "work.job",
    kind: "categorical",
    common,
    values: values.map((v) => ({ code: v.code, share: `${Math.round(100 * v.share)}%` })),
  } as ListedField;
  assert.deepEqual(
    probesOf(field).map((p) => p.code),
    ["c", "d"],
  );
  assert.deepEqual(probesOf({ ...field, common: 1 }), []);
  assert.deepEqual(
    probesOf({
      name: "town",
      path: "place.town",
      kind: "categorical",
      values: Array.from({ length: 61 }, (_, i) => ({ code: `t${i}` })),
    } as ListedField),
    [],
  );
});

test("a buying role's label says what is bought, and how an organisation buys says that it is", () => {
  assert.equal(
    labelOf("purchasing_role_software_and_saas", "Gives final sign-off on purchases of this"),
    "Gives final sign-off on purchases of software and SaaS",
  );
  assert.equal(
    labelOf("purchasing_role_it_hardware", "The organisation does not buy this"),
    "The organisation does not buy IT hardware",
  );
  assert.equal(
    labelOf("organisation_purchasing_process", "The owner or one person decides"),
    "The owner or one person decides (how their organisation buys)",
  );
  assert.equal(labelOf("home_tenure", "Owns outright"), "Owns outright");
  // The maps shipped carry these labels: none of a buying role says only "this".
  for (const country of ["uk", "us"]) {
    const map: PeopleMap = JSON.parse(readFileSync(new URL(`../maps/${country}.json`, import.meta.url), "utf8"));
    for (const field of map.fields.filter((f): f is ListedField => f.name.startsWith("purchasing_role_")))
      for (const v of field.values) assert.doesNotMatch(v.label, /\bthis\b/, `${country} ${field.name}`);
  }
});

test("the map keeps the firm weight as firms: firms an adult stands for, who holds a weight, and the sectors none does", () => {
  const field = { path: "work.firm_weight", meaning: "The number of firms the person stands for." };
  assert.deepEqual(
    firmsOf(field, {
      sum: 20,
      held: 118,
      n: 200,
      sectors: [
        { label: "Local government", held: 1, none: 49 },
        { label: "Private sector", held: 100, none: 2 },
        { label: "Mixed", held: 5, none: 40 },
      ],
    }),
    { ...field, per_adult: 0.1, held: "59%", not_counted: ["Local government"] },
  );
  assert.equal(firmsOf(null, { sum: 1, held: 1, n: 1 }), null, "a catalogue with no firm weight gives none");
  // The maps shipped: US government employers stand for no firm, and every UK sector does.
  const map = (country: string): PeopleMap =>
    JSON.parse(readFileSync(new URL(`../maps/${country}.json`, import.meta.url), "utf8"));
  assert.deepEqual(map("uk").firms?.not_counted, []);
  assert.ok(map("us").firms?.not_counted.includes("Local government"));
  for (const country of ["uk", "us"]) assert.ok(!map(country).fields.some((f) => f.path === "work.firm_weight"));
});
