import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { loadMap } from "../../scripts/population.ts";
import { probesOf } from "../../scripts/scan-answers.ts";
import { linesOf } from "../lib.ts";
import { loadProducts, type Product } from "./run.ts";
import { breakdowns, byStrength, EVERY_FACT, sizeOf, type Read, type Scanned } from "./strength.ts";

const toy: Product = {
  id: "toy",
  name: "Toy",
  batch: 1,
  description: "a toy",
  groups: [
    { dimension: "sex", label: "men", percent: 30, cond: "a" },
    { dimension: "sex", label: "women", percent: 10, cond: "b" },
    { dimension: "income", label: "low", percent: 20, cond: "a" },
    { dimension: "income", label: "high", percent: 40, cond: "c" },
  ],
};
const lists: Record<string, number[]> = { a: [0, 1, 2], b: [3, 4, 5], c: [3] };

test("a breakdown is read against its own average only when its groups hold everyone once", () => {
  const [sex, ...rest] = breakdowns(toy, (cond) => lists[cond], 6);
  // Income leaves two people out: it has no average to read against.
  assert.equal(rest.length, 0);
  // Men 30% and women 10%, as many of each: the average is 20%, and men's odds are 1.71 times its odds.
  assert.ok(Math.abs(sex[0].published - 0.3 / 0.7 / (0.2 / 0.8)) < 1e-9);
  assert.ok(sex[1].published < 1);
});

const read = (percent: number, published: number, odds: number, p = 0.5): Scanned => ({
  group: { percent, published, batch: 1 } as Read,
  odds,
  p,
});

test("each strength of reading is held against the published figures: keener, colder, and every pair", () => {
  const rows = byStrength([
    [read(30, 1.6, 2.5), read(20, 1.1, 1.6), read(10, 0.6, 0.4)],
    [read(12, 0.9, 1.7), read(14, 1.1, 1.0)],
  ]);
  const at = (strength: string) => rows.find((row) => row.strength === strength);
  assert.deepEqual(at("strong"), { strength: "strong", keen: [1, 1], cold: [1, 1], pairs: [2, 2] });
  // Read x1.6 and x1.7 keener: one is keener in the published figures, the other is not.
  assert.deepEqual(at("lead")?.keen, [1, 2]);
  // 30% against 20% read x1.56 apart, the right way; 12% against 14% read x1.7 apart, the wrong way.
  assert.deepEqual(at("lead")?.pairs, [1, 2]);
});

test("a reading's published size is the published log odds over the scan's, fitted through zero", () => {
  const half = sizeOf([[read(30, Math.exp(1), Math.exp(0.5), 0.6), read(10, Math.exp(-1), Math.exp(-0.5), 0.4)]]);
  assert.ok(Math.abs(half.size - 2) < 1e-9);
  assert.deepEqual([half.right, half.of], [1, 1]);
});

test("the every-fact answers hold every field's values for all 32 products, for one decision model", () => {
  const { fields } = loadMap("uk");
  const wanted = [
    "base",
    ...fields.flatMap((field) => {
      const probes = probesOf(field);
      return probes.length >= 2 ? probes.map((probe) => `${field.path}=${probe.code}`) : [];
    }),
  ];
  for (const product of loadProducts()) {
    const rows = linesOf(join(EVERY_FACT, `scan-${product.id}.jsonl`)).map((line) => JSON.parse(line));
    assert.ok(rows.every((row) => row.m === "gemini-decision-1"));
    const have = new Set(rows.map((row) => row.id));
    assert.deepEqual(
      wanted.filter((id) => !have.has(id)),
      [],
      product.id,
    );
  }
});
