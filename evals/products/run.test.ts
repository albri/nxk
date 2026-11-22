import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { conditionsOf } from "../../scripts/groups.ts";
import { loadMap, loadPeople, type Field } from "../../scripts/population.ts";
import {
  RESULTS_DIR,
  SPEC_FILE,
  checkRun,
  clear,
  isRight,
  loadProducts,
  loadRun,
  pairsOf,
  savedAnswers,
  scorePairs,
  specFor,
  tally,
  type Product,
} from "./run.ts";

const products = loadProducts();

test("a clear gap is 3 points and a quarter; under 10, the second batch also takes a point and a half", () => {
  assert.equal(clear(83, 54), true);
  assert.equal(clear(12, 10), false); // 2 points
  assert.equal(clear(40, 36), false); // 4 points, but 1.11 times
  assert.equal(clear(5, 3), false); // 2 points: not clear in the first batch
  assert.equal(clear(5, 3, true), true); // in the second: both under 10, 1.67 times, 2 points
  assert.equal(clear(4, 3, true), false); // 1.33 times
  assert.equal(clear(12, 10.5, true), false); // not both under 10
});

test("the 32 products give 622 clear pairs: 184 in the first batch, 438 in the second", () => {
  assert.equal(products.length, 32);
  assert.equal(pairsOf(products).length, 622);
  assert.equal(pairsOf(products.filter((p) => p.batch === 1)).length, 184);
  assert.equal(pairsOf(products.filter((p) => p.batch === 2)).length, 438);
});

test("every group is a condition on the UK people", () => {
  const { fields } = loadMap("uk");
  for (const product of products)
    for (const group of product.groups) assert.doesNotThrow(() => conditionsOf(fields, group.cond.split(",")));
});

// The figures the README, tested.md and llms.txt quote.
const RECORDED = {
  "2026-11-13-advert-gateway.json": 533,
  "2026-11-14-year-on-offer-google.json": 557,
  "2026-11-19-year-on-offer-google.json": 559,
  "2026-11-22-year-on-offer-google.json": 560,
};

test("the saved answers, scored on the UK people, give the saved run exactly", () => {
  const file = "2026-11-22-year-on-offer-google.json";
  const run = loadRun(join(RESULTS_DIR, file));
  const { map, people } = loadPeople("uk");
  assert.equal(people.length, run.people);
  const { answers, missing } = savedAnswers(products, map.fields, run.model);
  assert.deepEqual(missing, []);
  assert.deepEqual(scorePairs(products, map.fields, people, answers), run.pairs);
});

test("each saved run holds exactly the 622 pairs, with the published figures, and scores as recorded", () => {
  const files = readdirSync(RESULTS_DIR).filter((f) => f.endsWith(".json"));
  for (const [file, right] of Object.entries(RECORDED)) {
    assert.ok(files.includes(file), file);
    const run = loadRun(join(RESULTS_DIR, file));
    assert.deepEqual(checkRun(run, products), [], file);
    assert.equal(tally(run.pairs).right, right, file);
  }
});

test("a saved run with a figure changed or a pair dropped is caught", () => {
  const run = loadRun(join(RESULTS_DIR, "2026-11-14-year-on-offer-google.json"));
  const changed = { ...run, pairs: run.pairs.slice(1).map((p, i) => (i ? p : { ...p, published: [99, 1] })) };
  const problems = checkRun(changed, products);
  assert.equal(problems.length, 2);
  assert.match(problems.join("\n"), /published 99 and 1/);
  assert.match(problems.join("\n"), /missing: /);
});

test("the spec a new run sends is what nxk's scans would send for these products", () => {
  assert.deepEqual(specFor(products), JSON.parse(readFileSync(SPEC_FILE, "utf8")));
});

test("a pair is scored on the people from the answers about the facts they hold", () => {
  const fields = [
    {
      name: "home_tenure",
      path: "home_and_travel.home_tenure",
      kind: "categorical",
      values: [
        { code: "own", share: "50%" },
        { code: "rent", share: "50%" },
      ],
    },
  ] as Field[];
  const people = Array.from({ length: 100 }, (_, i) => [i % 2]);
  const toy = [
    {
      id: "toy",
      batch: 1,
      groups: [
        { dimension: "tenure", label: "Owners", percent: 30, cond: "home_tenure=own" },
        { dimension: "tenure", label: "Renters", percent: 60, cond: "home_tenure=rent" },
      ],
    },
  ] as Product[];
  const answers = {
    toy: new Map([
      ["base", 0.4],
      ["home_and_travel.home_tenure=own", 0.2],
      ["home_and_travel.home_tenure=rent", 0.5],
    ]),
  };
  const [pair] = scorePairs(toy, fields, people, answers);
  assert.deepEqual([pair.higher, pair.lower], ["Renters", "Owners"]);
  assert.ok(isRight(pair));
  answers.toy.set("home_and_travel.home_tenure=own", 0.7);
  assert.equal(isRight(scorePairs(toy, fields, people, answers)[0]), false);
});
