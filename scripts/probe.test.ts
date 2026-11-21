import assert from "node:assert/strict";
import test from "node:test";
import type { Field } from "./population.ts";
import { askOf, probeLines, probeOf, probeResolution } from "./probe.ts";

// A small audience where the group is mostly older people, and older people more often like letters.
const values = (codes: string[]) => codes.map((code) => ({ code, label: code.replace(/_/g, " ") }));
const fields = [
  { name: "age_years", path: "identity.age_years", kind: "range", quantiles: { p50: 45 } },
  { name: "home_tenure", path: "home.home_tenure", kind: "categorical", values: values(["owned", "rented"]) },
  {
    name: "preferred_way_for_companies_to_contact_them",
    path: "shop.preferred",
    kind: "categorical",
    values: values(["by_email", "by_post"]),
  },
  { name: "internet_use_frequency", path: "digital.internet", kind: "categorical", values: values(["daily", "never"]) },
] as Field[]; // with only what the probe reads
const rows: number[][] = [],
  inGroup: boolean[] = [];
for (let i = 0; i < 4000; i++) {
  const old = i % 4 === 0,
    owner = i % 3 === 0;
  const offline = old ? i % 8 === 0 : i % 50 === 1;
  rows.push([old ? 80 : 30 + (i % 30), owner ? 0 : 1, offline || (old && i % 16 === 4) ? 1 : 0, offline ? 1 : 0]);
  inGroup.push(offline);
}

test("the audience is split by the facts that most change the count, and only by facts an owner can see", () => {
  const result = probeOf(fields, rows, inGroup, { skip: new Set(["digital.internet"]) });
  assert.equal(result.k, inGroup.filter(Boolean).length);
  const top = result.leaves[0];
  assert.equal(top.text, "aged 75 or over");
  assert.ok(top.rate > 0.45 && top.rate < 0.55);
  assert.ok(result.leaves.every((leaf) => !/internet|tenure/.test(leaf.text)));
  assert.ok(Math.abs(result.leaves.reduce((sum, leaf) => sum + leaf.ofGroup, 0) - 1) < 1e-9);
  // The question for the owner: how many of their customers are on the side of the first split with more of them.
  const ask = askOf(result);
  assert.ok(ask);
  assert.equal(ask.field, "age_years");
  assert.equal(ask.text, "aged 75 or over");
  assert.equal(ask.cond, "age_years=75..120");
  assert.ok(ask.share > 0.2 && ask.share < 0.3);
  assert.equal(askOf({ root: null }), null);
});

test("ways in are the channels more of them use, and a group defined by the same facts is not repeated", () => {
  const same = Uint8Array.from(inGroup, (x) => (x ? 1 : 0));
  const owners = Uint8Array.from(rows, (row) => (row[1] === 0 ? 1 : 0));
  const older = Uint8Array.from(rows, (row) => (row[0] >= 75 ? 1 : 0));
  const result = probeOf(fields, rows, inGroup, {
    skip: new Set(["digital.internet"]),
    others: [
      { label: "older", inGroup: older },
      { label: "owners", inGroup: owners },
      { label: "same", inGroup: same },
    ],
  });
  assert.deepEqual(
    result.routes.map((r) => r.label),
    ["by post"],
  );
  assert.deepEqual(
    result.overlaps.map((o) => o.label),
    ["older"],
  );
  const lines = probeLines(result, { rule: 10, whom: "adults", counted: "those it rules out" }).join("\n");
  assert.match(lines, /aged 75 or over {2}\(above\)/);
  assert.match(lines, /by post \(preferred way for companies to contact them\)/);
});

test("a count that is the same in every group says so", () => {
  // One in ten, picked by a hash so that it has nothing to do with the pattern of age and tenure above.
  const flat = rows.map((_, i) => Math.imul(i + 1, 2654435761) >>> 0 < 429496730);
  const result = probeOf(fields, rows, flat, { skip: new Set(["digital.internet"]) });
  assert.match(probeLines(result, { rule: 10 })[0], /about the same/);
});

test("a probe ends with what it found: groups on both sides of the rule cannot tell, all on one side confirms", () => {
  const result = probeOf(fields, rows, inGroup, { skip: new Set(["digital.internet"]) });
  const rates = result.leaves.map((leaf) => 100 * leaf.rate);
  const between = (Math.min(...rates) + Math.max(...rates)) / 2;
  const at = (rule: number | null) => probeResolution(result, { what: "rarely online", whom: "adults", rule });
  assert.equal(at(between).outcome, "unclear");
  assert.match(at(between).why, /both sides of the [\d.]+ where the choice changes/);
  assert.equal(at(Math.max(...rates) + 1).outcome, "confirmed");
  assert.match(at(Math.max(...rates) + 1).why, /every group is below/);
  assert.equal(at(Math.min(...rates)).outcome, "confirmed");
  assert.equal(at(null).outcome, "unclear");
  assert.match(at(null).found, /^from [\d.]+ to [\d.]+ in every 100 \(counted\) across groups/);
  const flat = rows.map((_, i) => Math.imul(i + 1, 2654435761) >>> 0 < 429496730);
  const same = probeResolution(probeOf(fields, rows, flat, { skip: new Set(["digital.internet"]) }), {
    what: "a tenth",
    whom: "adults",
    rule: 10,
  });
  assert.equal(same.outcome, "confirmed");
  assert.match(same.found, /^it is about the same/);
});
