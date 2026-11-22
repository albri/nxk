import assert from "node:assert/strict";
import test from "node:test";
import {
  GENERAL_FIELDS,
  fieldsToScan,
  logOdds,
  membersOf,
  missingAnswers,
  peopleAnswers,
  probesOf,
  scanField,
  splitOfChange,
} from "./scan-answers.ts";
import type { Field, ListedField, NumericField, PeopleMap } from "./population.ts";
import type { Probe } from "./scan-answers.ts";
import { scanResolution, spentNote, type GroupRead } from "./scan.ts";

test("logOdds is zero at a half and bounded at the ends", () => {
  assert.equal(logOdds(0.5), 0);
  assert.ok(Number.isFinite(logOdds(0)) && Number.isFinite(logOdds(1)));
});

test("probesOf takes short value lists and range quantiles, and skips long lists", () => {
  const tenure = {
    kind: "categorical",
    values: [
      { code: "owns", label: "Owns", share: "65%" },
      { code: "rents", share: "35%" },
    ],
  } as ListedField;
  assert.deepEqual(probesOf(tenure), [
    { value: "owns", code: "owns", label: "Owns", share: 0.65 },
    { value: "rents", code: "rents", label: "rents", share: 0.35 },
  ]);
  const occupation = {
    kind: "coded",
    values: [
      {
        code: "231",
        label: "Teaching Professionals",
        share: "4%",
        as: { code: "231", title: "Teaching Professionals" },
      },
      { code: "112", label: "Production Managers", share: "2%", as: { code: "112", title: "Production Managers" } },
    ],
  } as ListedField;
  assert.deepEqual(probesOf(occupation)[0].value, { code: "231", title: "Teaching Professionals" });
  const activities = { kind: "list", values: [{ code: "banking" }, { code: "shopping" }] } as ListedField;
  assert.deepEqual(probesOf(activities)[0].value, ["banking"]);
  const age = { kind: "range", range: { min: 18, max: 100 }, quantiles: { p10: 24, p50: 48 } } as NumericField;
  assert.deepEqual(
    probesOf(age).map((p) => p.value),
    [24, 48],
  );
  const places = { kind: "coded", values: Array.from({ length: 200 }, (_, i) => ({ code: `p${i}` })) } as ListedField;
  assert.equal(probesOf(places).length, 0);
  // Free text: a kind no map lists.
  assert.equal(probesOf({ kind: "text" } as unknown as Field).length, 0);
});

test("scanField measures common values against the answer with no fact known", () => {
  const field = { path: "home.tenure" };
  const probes = [
    { code: "owns", share: 0.65 },
    { code: "rents", share: 0.34 },
    { code: "rare", share: 0.005 },
  ] as Probe[];
  const answers = new Map([
    ["home.tenure=owns", 0.3],
    ["home.tenure=rents", 0.5],
    ["home.tenure=rare", 0.9],
  ]);
  const s = scanField(field, probes, answers, 0.4);
  assert.ok(s);
  assert.equal(s.low.code, "owns");
  assert.equal(s.high.code, "rents");
  assert.ok(Math.abs(s.spread - 0.2) < 1e-9);
  assert.equal(scanField(field, probes, new Map(), 0.4), null);
});

test("splitOfChange shares a change out across a field's levels", () => {
  const split = splitOfChange([
    { share: 0.45, before: 0.43, after: 0.1 },
    { share: 0.37, before: 0.5, after: 0.36 },
    { share: 0.18, before: 0.55, after: 0.55 },
  ]);
  assert.ok(split);
  assert.ok(Math.abs(split.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.ok(split[0] > 0.7 && split[2] === 0);
  assert.equal(
    splitOfChange([
      { share: 0.5, before: 0.4, after: 0.3 },
      { share: 0.5, before: 0.4, after: 0.5 },
    ]),
    null,
  );
  assert.equal(
    splitOfChange([
      { share: null, before: 0.4, after: 0.3 },
      { share: 0.5, before: 0.4, after: 0.2 },
    ]),
    null,
  );
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

test("membersOf finds who holds each probed value, cutting a number at the midpoints", () => {
  assert.deepEqual(
    membersOf(TENURE, 0, PEOPLE).map((g) => g.members.length),
    [50, 50],
  );
  const age = membersOf(AGE, 1, PEOPLE);
  assert.deepEqual(
    age.map((g) => [g.id, g.members.length]),
    [
      ["id.age=30 (p25)", 50],
      ["id.age=60 (p75)", 50],
    ],
  );
  assert.deepEqual(
    membersOf(HOBBIES, 2, PEOPLE).map((g) => g.members.length),
    [50, 25],
  );
});

test("peopleAnswers builds each person's answer from their facts, damped", () => {
  const answers = new Map([
    ["home.tenure=owns", 0.2],
    ["home.tenure=rents", 0.6],
    ["id.age=30 (p25)", 0.6],
    ["id.age=60 (p75)", 0.2],
  ]);
  const flat = peopleAnswers(FIELDS, PEOPLE, answers, { damping: 0 });
  assert.ok(flat.p.every((x) => Math.abs(x - 0.4) < 1e-9) && Math.abs(flat.level - 0.4) < 1e-9);
  const some = peopleAnswers(FIELDS, PEOPLE, answers, { damping: 0.5 });
  assert.ok(some.p[60] > some.p[10]); // a renter of 30 against an owner of 60
  const full = peopleAnswers(FIELDS, PEOPLE, answers, { damping: 1 });
  assert.ok(full.p[60] - full.p[10] > some.p[60] - some.p[10]);
  const known = peopleAnswers(FIELDS, PEOPLE, answers, { damping: 0.5, target: 0.1 });
  assert.ok(Math.abs(known.p.reduce((a, b) => a + b, 0) / 100 - 0.1) < 1e-6 && known.shift < 0);
  const kept = peopleAnswers(FIELDS, PEOPLE, answers, { damping: 0.5, shift: known.shift });
  assert.ok(Math.abs(kept.p[0] - known.p[0]) < 1e-9);
  assert.throws(() => peopleAnswers(FIELDS, PEOPLE, new Map()));
});

test("peopleAnswers can set the average of an audience to a known figure", () => {
  const answers = new Map([
    ["home.tenure=owns", 0.2],
    ["home.tenure=rents", 0.6],
    ["id.age=30 (p25)", 0.6],
    ["id.age=60 (p75)", 0.2],
  ]);
  const renters = PEOPLE.map((_, i) => i).filter((i) => i >= 50);
  const set = peopleAnswers(FIELDS, PEOPLE, answers, { damping: 0.5, target: 0.3, over: renters });
  assert.ok(Math.abs(renters.reduce((sum, i) => sum + set.p[i], 0) / renters.length - 0.3) < 1e-6);
});

test("fieldsToScan adds the general fields to the ones picked, and reports names that are not in the map", () => {
  const fields = [...GENERAL_FIELDS.slice(0, 3), "home_tenure", "household_type", "pets_in_household"].map((name) => ({
    name,
  }));
  const chosen = fieldsToScan(fields, { picked: ["home_tenure", GENERAL_FIELDS[0], "not_a_field", "home_tenure"] });
  assert.deepEqual(chosen.names, [...GENERAL_FIELDS.slice(0, 3), "home_tenure"]);
  assert.deepEqual(chosen.general, GENERAL_FIELDS.slice(0, 3));
  assert.deepEqual(chosen.unknown, ["not_a_field"]);
});

test("fieldsToScan takes every field with all, and exactly the named ones with only", () => {
  const fields = [GENERAL_FIELDS[0], "home_tenure", "household_type"].map((name) => ({ name }));
  assert.deepEqual(fieldsToScan(fields, { all: true }).names, [GENERAL_FIELDS[0], "home_tenure", "household_type"]);
  const only = fieldsToScan(fields, { only: ["household_type", "missing"] });
  assert.deepEqual(only.names, ["household_type"]);
  assert.deepEqual(only.general, []);
  assert.deepEqual(only.unknown, ["missing"]);
});

test("every general field is in both shipped maps", async () => {
  const { readFileSync } = await import("node:fs");
  for (const country of ["uk", "us"]) {
    const names = new Set(
      (JSON.parse(readFileSync(new URL(`../maps/${country}.json`, import.meta.url), "utf8")) as PeopleMap).fields.map(
        (field) => field.name,
      ),
    );
    assert.deepEqual(
      GENERAL_FIELDS.filter((name) => !names.has(name)),
      [],
      country,
    );
  }
});

test("answers lost to failed requests are named, not read as never asked", () => {
  const field = (path: string, codes: string[]) => ({ field: { path }, probes: codes.map((code) => ({ code })) });
  const fields = [field("a.age", ["1", "2", "3"]), field("a.home", ["own", "rent"]), field("a.never", ["x", "y"])];
  const full = new Map([
    ["base", 0.2],
    ["a.age=1", 0.1],
    ["a.age=2", 0.2],
    ["a.age=3", 0.3],
    ["a.home=own", 0.2],
    ["a.home=rent", 0.3],
  ]);
  assert.deepEqual(missingAnswers({ now: full }, ["now"], fields), []);
  const part = new Map([...full].filter(([id]) => id !== "a.age=3"));
  assert.deepEqual(missingAnswers({ now: full, later: part }, ["now", "later"], fields), [
    "a.age (later: 1 of 3 values)",
  ]);
  const noBase = new Map([...full].filter(([id]) => id !== "base" && !id.startsWith("a.home")));
  assert.deepEqual(missingAnswers({ now: full, later: noBase }, ["now", "later"], fields), [
    "the answer with nothing known (later)",
    "a.home (later: 2 of 2 values)",
  ]);
});

test("a scan read ends with which version comes first, against the first version, groups counted not named", () => {
  const read = (name: string, now: number, cheaper: number, weekly: number, all = false): GroupRead => ({
    name,
    all,
    levels: [
      { version: "now", p: now },
      { version: "cheaper", p: cheaper },
      { version: "weekly", p: weekly },
    ],
  });
  const of = (list: GroupRead[]) => scanResolution({ watchOption: "Try it", base: "now", read: list });
  const mixed = of([
    read("adults", 0.2, 0.3, 0.25, true),
    read("renters aged 18 to 29", 0.2, 0.3, 0.25),
    read("parents", 0.2, 0.25, 0.3),
    read("aged 65 or over", 0.2, 0.3, 0.25),
    read("parents, high income", 0.3, 0.295, 0.2),
  ]);
  assert.equal(mixed.outcome, "changed");
  assert.equal(
    mixed.found,
    '"cheaper" first for adults; in 4 groups, "cheaper" first in 2, "weekly" first in 1, too close to call in 1 (simulated)',
  );
  assert.equal(mixed.why, "it depends on the group");
  assert.equal(mixed.checked, 'which version gets the answer "Try it" most');
  assert.equal(of([read("adults", 0.2, 0.3, 0.25, true)]).why, '"cheaper" over "now"');
  const stays = of([read("adults", 0.3, 0.2, 0.25, true), read("parents", 0.4, 0.2, 0.3)]);
  assert.deepEqual(
    [stays.outcome, stays.found],
    ["confirmed", '"now" first for adults; "now" first in the group read (simulated)'],
  );
  // Close everywhere it was read: nothing to choose on.
  assert.equal(of([read("adults", 0.2, 0.205, 0.199, true)]).outcome, "unclear");
});

test("a scan says and records its own charge, so a folder's records add up to what was spent", () => {
  // Answers saved by an earlier scan cost 1.7 cents; this one adds 1.1 cents.
  const later = spentNote(0.017, 0.028, null);
  assert.equal(later.line, "Spent $0.011 on this scan ($0.028 on this spec in all).");
  assert.ok(Math.abs(later.record.usd - 0.011) < 1e-9);
  assert.equal(later.record.total, 0.028);
  const first = spentNote(0, 0.017, "The decision-model account has no credit left.");
  assert.equal(first.line, "Spent $0.017 on this scan. Stopped: The decision-model account has no credit left.");
  assert.ok(Math.abs(first.record.usd + later.record.usd - later.record.total) < 1e-12);
});
