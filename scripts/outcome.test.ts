import assert from "node:assert/strict";
import test from "node:test";
import {
  compareArms,
  compareCustomers,
  difference,
  directionOf,
  neededEach,
  normalQuantile,
  trackRecord,
  verdict,
  wilson,
  zFor,
  type Arm,
} from "./outcome.ts";

const near = (a: number, b: number, tol = 5e-4) => assert.ok(Math.abs(a - b) < tol, `${a} is not ${b}`);

test("the intervals match the published examples", () => {
  near(normalQuantile(0.975), 1.959964, 1e-6);
  near(normalQuantile(0.005), -2.575829, 1e-6);
  near(zFor(1), 1.959964, 1e-6);
  near(zFor(3), normalQuantile(1 - 0.05 / 6), 1e-12);
  // Wilson (Newcombe 1998, table I): 1 of 10 is 0.0179 to 0.4042; 0 of 10 is 0 to 0.2775.
  const [lo, hi] = wilson(1, 10);
  near(lo, 0.0179);
  near(hi, 0.4042);
  near(wilson(0, 10)[0], 0);
  near(wilson(0, 10)[1], 0.2775);
  // The difference of two rates (Newcombe 1998, method 10): 56 of 70 against 48 of 80 is +0.2, from 0.0524 to 0.3339.
  const d = difference({ took: 56, shown: 70 }, { took: 48, shown: 80 });
  near(d.d, 0.2);
  near(d.lo, 0.0524);
  near(d.hi, 0.3339);
  // About 1,200 a group tell 5% from 3% at 95% and 80% power; none for no difference.
  const needed = neededEach(0.05, 0.03);
  assert.ok(needed !== null && Math.abs(needed - 1500) < 100, String(needed));
  assert.equal(neededEach(0.04, 0.04), null);
});

test("a lean under 5% says nothing; a clear difference agrees or disagrees with it; an unclear one cannot tell", () => {
  assert.equal(directionOf(1.04), 0);
  assert.equal(directionOf(0.96), 0);
  assert.equal(directionOf(1.06), 1);
  assert.equal(directionOf(0.9), -1);
  assert.equal(directionOf(null), 0);
  assert.equal(verdict(0, { lo: 0.01, hi: 0.03 }), "nothing to compare");
  assert.equal(verdict(1, { lo: 0.01, hi: 0.03 }), "agrees");
  assert.equal(verdict(-1, { lo: 0.01, hi: 0.03 }), "disagrees");
  assert.equal(verdict(1, { lo: -0.01, hi: 0.03 }), "too few to tell");
});

test("more groups widen every interval, so a chance difference among many is not called a finding", () => {
  // 50 of 1,000 against 30 of 1,000 is clear alone (from +0.28 to +3.77 points), not as one of six comparisons.
  const arms = [
    { name: "a", shown: 1000, took: 50 },
    { name: "b", shown: 1000, took: 30 },
    { name: "c", shown: 1000, took: 40 },
    { name: "d", shown: 1000, took: 41 },
  ];
  const said = () => ({ lean: 1.2, direction: 1, text: "said" });
  const one = compareArms(arms.slice(0, 2), [[arms[0], arms[1]]], said).comparisons[0];
  const pairs: [Arm, Arm][] = [];
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) pairs.push([arms[i], arms[j]]);
  const six = compareArms(arms, pairs, said);
  const ab = six.comparisons.find((c) => c.a === "a" && c.b === "b");
  assert.ok(ab);
  assert.equal(one.verdict, "agrees");
  assert.equal(ab.verdict, "too few to tell");
  assert.ok(ab.lo < one.lo);
  assert.match(six.lines.join("\n"), /each interval widened for the 6 comparisons nxk said something about/);
  assert.match(six.lines.join("\n"), /about [\d,]+ shown in each would tell a difference this size, if it is real/);
});

test("customers are set against their group's counted share, and the record counts only what was compared", () => {
  const { comparisons } = compareCustomers(
    [
      { name: "renters", took: 60, share: 0.2, lean: 1.3 },
      { name: "owners", took: 30, share: 0.3, lean: null },
    ],
    100,
  );
  assert.deepEqual(
    comparisons.map((c) => c.verdict),
    ["agrees", "nothing to compare"],
  );
  const record = trackRecord([
    { claim: "segment_customers", comparisons },
    { claim: "decision_pick", comparisons: [{ verdict: "disagrees" }, { verdict: "too few to tell" }] },
  ]);
  assert.deepEqual(record.by, {
    segment_customers: { agrees: 1, disagrees: 0, "too few to tell": 0 },
    decision_pick: { agrees: 0, disagrees: 1, "too few to tell": 1 },
  });
});
