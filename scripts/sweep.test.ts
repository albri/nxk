import assert from "node:assert/strict";
import test from "node:test";
import { countOption } from "./suggest-count.ts";
import { problems, type SuggestionsSpec } from "./suggest-form.ts";
import { conditionsOf } from "./groups.ts";
import type { Field } from "./population.ts";
import { groupsOf, leftOut, LENSES, sweep } from "./sweep.ts";

// A small population: work, money, devices (a list) and age, 100 people.
const fields = [
  {
    name: "economic_activity_status",
    path: "work.economic_activity_status",
    tier: "A",
    values: [
      { code: "in_employment", label: "In work" },
      { code: "retired", label: "Retired" },
    ],
  },
  {
    name: "could_cover_an_unexpected_expense",
    path: "money.could_cover_an_unexpected_expense",
    tier: "B",
    values: [
      { code: "could", label: "Could cover" },
      { code: "could_not", label: "Could not cover" },
    ],
  },
  {
    name: "devices_used_to_go_online",
    path: "digital_and_media.devices_used_to_go_online",
    kind: "list",
    tier: "A",
    values: [
      { code: "smartphone", label: "Smartphone", share: "80%" },
      { code: "tablet", label: "Tablet", share: "40%" },
    ],
  },
  {
    name: "age_years",
    path: "identity.age_years",
    tier: "A",
    quantiles: { p10: 22, p30: 35, p50: 48, p70: 60, p90: 75 },
  },
  {
    name: "employment_type",
    path: "work.employment_type",
    tier: "A",
    values: [
      { code: "employee", label: "Employee" },
      { code: "not_in_employment", label: "Not in employment" },
    ],
  },
] as Field[]; // with only what the sweep and suggest read
// 60 in work (10 of them cannot cover a bill), 40 retired (20 cannot); 20 retired have no smartphone.
const people = Array.from({ length: 100 }, (_, i) => {
  const working = i < 60;
  return [
    working ? 0 : 1,
    (working ? i < 10 : i < 80) ? 1 : 0,
    working || i >= 80 ? [0] : [1],
    working ? 30 + (i % 20) : 70,
    working ? 0 : 1,
  ];
});

test("groupsOf makes value groups, a group of those without a common listed thing, and bands of a number; placeholders go", () => {
  assert.deepEqual(
    groupsOf(fields[2], 2).map((g) => g.label),
    ["Smartphone", "Tablet", "Smartphone not among devices used to go online"],
  );
  assert.equal(groupsOf(fields[3], 3).length, 5);
  assert.deepEqual(
    groupsOf(fields[4], 4).map((g) => g.label),
    ["Employee"],
  );
});

test("the sweep counts every group in the audience and the picture, and marks groups the picture shuts out by definition", () => {
  const pictured = people.filter((row) => row[0] === 0);
  const lines = sweep(fields, people, pictured, {
    skip: new Set(["work.economic_activity_status"]),
    conditions: conditionsOf(fields, ["economic_activity_status=in_employment"]),
  });
  const line = (label: string) => {
    const found = lines.find((l) => l.label === label);
    assert.ok(found, label);
    return found;
  };
  assert.equal(line("Could not cover").aud, 0.3);
  assert.ok(Math.abs(line("Could not cover").pic - 10 / 60) < 1e-9);
  assert.equal(line("Smartphone not among devices used to go online").aud, 0.2);
  assert.equal(line("age years 68 to 75").restates, true); // every one of them is retired: the picture said "in work"
  assert.equal(line("Could not cover").restates, false);
  const shown = leftOut(lines, { min: 0.05 });
  assert.equal(
    shown.flat().some((l) => l.restates),
    false,
  );
  assert.ok(shown[0].some((l) => l.label === "Could not cover")); // money is the first lens
  assert.equal(LENSES.at(-1)?.title, "Everything else");
});

test("suggest counts who an option rules out and who it is harder for, and refuses a suggestion on the owner's term with no rule", () => {
  const option = {
    name: "App only",
    needs: ["devices_used_to_go_online=smartphone"],
    bears_on: ["could_cover_an_unexpected_expense=could_not"],
  };
  const counted = countOption(fields, people, option);
  assert.equal(counted.out.size, 20);
  assert.equal(counted.lost.size, 30); // the 20 without a smartphone are among the 30 who cannot cover a bill
  // A spec as read from its file, changed below.
  const spec: SuggestionsSpec = {
    country: "uk",
    request: "request.md",
    suggestions: [
      {
        suggestion: "Join in the app",
        as_asked: "App only",
        rule: "",
        offer: "add a desk",
        options: [option, { name: "Desk" }],
      },
    ],
  };
  assert.match(problems(spec, fields).join("\n"), /has no "rule"/);
  spec.suggestions[0].rule = "Worth raising if it rules out 5 in 100 or more";
  spec.suggestions[0].count = "App only: rules out";
  assert.deepEqual(problems(spec, fields), []);
  // A choice left to the session needs no rule and no offer.
  assert.deepEqual(
    problems({ ...spec, suggestions: [{ suggestion: "Join", options: [option, { name: "Desk" }] }] }, fields),
    [],
  );
  spec.suggestions[0].options[0].needs = ["devices_used_to_go_online=phone"];
  assert.match(problems(spec, fields).join("\n"), /No value "phone"/);
  delete (spec as Partial<SuggestionsSpec>).request;
  assert.match(problems(spec, fields).join("\n"), /"request" is missing/);
});
