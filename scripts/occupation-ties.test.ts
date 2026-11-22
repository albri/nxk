import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { conditionsOf } from "./groups.ts";
import { broadLines, readEvidence, tiesFrom, type EvidenceTable } from "./occupation-ties.ts";
import type { Field, OccupationTies, PeopleMap, Row } from "./population.ts";

const field = (name: string, codes: string[], labels = codes) => ({
  name,
  path: `work.${name}`,
  kind: "categorical",
  values: codes.map((code, i) => ({ code, label: labels[i] })),
});
const MAJOR = ["professional_occupations", "caring_leisure_and_other_service_occupations", "not_in_employment"];
const fields = [
  field("current_occupation_major_group", MAJOR, [
    "Professional occupations",
    "Caring, leisure and other service occupations",
    "Not in employment",
  ]),
  field(
    "current_occupation_group",
    ["223", "241", "613"],
    ["Nursing Professionals", "Legal Professionals", "Caring Personal Services"],
  ),
  field(
    "shift_work",
    ["most", "no", "not_in_employment"],
    ["Works shifts most of the time", "No shift work", "Not in employment"],
  ),
  field("employer_sector", ["public", "private"]),
  field("highest_qualification", ["degree", "none"]),
] as Field[]; // with only what the ties and conditions read
// One table of each kind PersonaGen keeps: a fact by broad group (UK: major groups as values, minor groups as
// members), the same fact by a coarser grouping (US: groups of major groups), a finer table for some occupations,
// occupation by a fact, and a table kept only to check a build.
const table = (
  child: string,
  node: string,
  values: string[],
  members?: Record<string, string[]> | null,
  extra: { status?: string } = {},
): EvidenceTable => ({
  kind: "conditional",
  child: { node: child },
  parents: [{ node, values, ...(members ? { members } : {}) }],
  ...extra,
});
const tables = [
  table("shift_work", "current_occupation_group", MAJOR.slice(0, 2), {
    professional_occupations: ["223", "241"],
    caring_leisure_and_other_service_occupations: ["613"],
  }),
  table("shift_work", "current_occupation_major_group", ["everyone"], { everyone: MAJOR.slice(0, 2) }),
  table("employer_sector", "current_occupation_group", MAJOR.slice(0, 2)),
  table("employer_sector", "current_occupation_group", ["floor"], { floor: ["241"] }),
  table("current_occupation_group", "highest_qualification", ["degree", "none"]),
  table("highest_qualification", "current_occupation_group", MAJOR.slice(0, 2)),
  table("shift_work", "current_occupation_group", ["223", "241", "613"], null, { status: "validation_only" }),
];

test("the ties keep a fact tied by broad group alone, its finest grouping, and the occupations a finer table ties", () => {
  const { meaning, facts } = tiesFrom(tables, fields);
  assert.match(meaning, /only by broad groups/);
  // Each major group its own group, the finest of the two broad tables: no `groups` needed.
  assert.deepEqual(facts.shift_work, { by: "current_occupation_major_group" });
  assert.deepEqual(facts.employer_sector, {
    by: "current_occupation_major_group",
    except: { current_occupation_group: ["241"] },
  });
  // Occupation by qualification gives every occupation its own: not a broad tie, whatever else is there.
  assert.equal(facts.highest_qualification, undefined);
});

test("a finer table over most occupations ties the fact finely, and a grouping of major groups is kept as groups", () => {
  const fine = tiesFrom(
    [...tables, table("employer_sector", "current_occupation_group", ["a", "b"], { a: ["223", "241"], b: ["613"] })],
    fields,
  );
  assert.equal(fine.facts.employer_sector, undefined);
  const coarse = tiesFrom([tables[1]], fields);
  assert.deepEqual(coarse.facts.shift_work.groups, [MAJOR.slice(0, 2)]);
});

test("evidence is read from a country's folder, leaving out tables kept only to check a build", () => {
  const dir = mkdtempSync(join(tmpdir(), "nxk-evidence-"));
  try {
    mkdirSync(join(dir, "uk", "shift_work"), { recursive: true });
    tables.forEach((t, i) => writeFileSync(join(dir, "uk", "shift_work", `${i}.json`), JSON.stringify(t)));
    writeFileSync(join(dir, "uk", "shift_work", `marginal.json`), JSON.stringify({ kind: "marginal" }));
    assert.equal(readEvidence(dir, "uk").length, tables.length - 1);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

// Rows: occupation group, major group, shift work, sector, qualification (positions in each field's values).
const map = { fields, occupation_ties: tiesFrom(tables, fields) };
const person = (minor: number, major: number, shift = 1, sector = 1) => [major, minor, shift, sector, 0];
const people: Row[] = [
  ...Array(10).fill(person(0, 0, 1)),
  ...Array(30).fill(person(1, 0, 1)),
  ...Array(20).fill(person(2, 1, 0)),
  ...Array(40).fill([2, -1, 2, -1, 1]),
];
const lines = (texts: string[], read?: string[]) =>
  broadLines(
    map,
    people,
    texts.map((t) => conditionsOf(fields, t.split(","))),
    read,
  );

test("a count of one occupation's shift workers says it is the broad group's rate, and a whole group's does not", () => {
  const [line, ...rest] = lines(["current_occupation_group=223,shift_work=most"]);
  assert.equal(rest.length, 0);
  assert.match(line, /^Rough for this occupation: PersonaGen ties shift work to occupation only by broad group/);
  assert.match(line, /Nursing Professionals have the shift work of Professional occupations as a whole/);
  assert.match(line, /without a published figure/);
  assert.deepEqual(lines(["current_occupation_major_group=professional_occupations,shift_work=most"]), []);
  assert.deepEqual(lines(["current_occupation_group=223|241,shift_work=most"]), []);
  assert.deepEqual(lines(["current_occupation_group=223"]), []);
  assert.deepEqual(lines(["shift_work=most"]), []);
});

test("groups counted side by side share one line, and an occupation a finer table ties has none", () => {
  const [line, ...rest] = lines([
    "current_occupation_group=223,shift_work=most",
    "current_occupation_group=241,shift_work=most",
  ]);
  assert.equal(rest.length, 0);
  assert.match(line, /^Rough for these occupations/);
  assert.match(line, /Nursing Professionals: Professional occupations; Legal Professionals: Professional occupations/);
  assert.deepEqual(lines(["current_occupation_group=241,employer_sector=public"]), []);
  assert.equal(lines(["current_occupation_group=223,employer_sector=public"]).length, 1);
});

test("a split by a finer occupation of a group picked by such a fact says so; a split by another field does not", () => {
  const [line] = lines(["shift_work=most"], ["current_occupation_group"]);
  assert.match(
    line,
    /^Rough by occupation: PersonaGen ties shift work to occupation only by broad group \(Professional occupations; Caring, leisure and other service occupations\)/,
  );
  assert.deepEqual(lines(["shift_work=most"], ["current_occupation_major_group"]), []);
  assert.deepEqual(lines(["current_occupation_group=613"], ["current_occupation_group"]), []);
  assert.match(lines(["current_occupation_group=223"], ["shift_work"])[0], /^Rough for this occupation/);
});

test("the shipped maps keep the ties, each fact and code one the map lists", () => {
  for (const country of ["uk", "us"]) {
    const shipped: PeopleMap & { occupation_ties: OccupationTies } = JSON.parse(
      readFileSync(new URL(`../maps/${country}.json`, import.meta.url), "utf8"),
    );
    const codes = (name: string) => new Set(shipped.fields.find((f) => f.name === name)?.values?.map((v) => v.code));
    const facts = Object.entries(shipped.occupation_ties.facts);
    assert.ok(
      facts.some(([name]) => name === "job_level"),
      country,
    );
    for (const [name, tie] of facts) {
      assert.ok(codes(name).size, `${country} ${name}`);
      for (const code of (tie.groups ?? []).flat()) assert.ok(codes(tie.by).has(code), `${country} ${name} ${code}`);
      for (const [f, list] of Object.entries(tie.except ?? {}))
        for (const code of list) assert.ok(codes(f).has(code), `${country} ${name} ${f} ${code}`);
    }
  }
});

const countUk = (among: string, who: string) =>
  execFileSync(
    process.execPath,
    [new URL("./people.ts", import.meta.url).pathname, "count", "--country=uk", `--among=${among}`, `--who=${who}`],
    { encoding: "utf8", env: { ...process.env, NXK_LOG: "off" } },
  );

test("the eval's count of East Midlands nurses on shifts is the nurses' own rate", () => {
  // In the eval refine-meal-prep-uk, the second look counted these and wrote "about 28,000 against roughly
  // 2,800", where far more nurses work shifts. PersonaGen then gave shift work by broad group of jobs, so nurses had
  // the professionals' rate (10 people here). From 4.0.4 it is tied to the occupation itself, and no warning is due.
  const out = countUk(
    "region=east_midlands",
    "region=east_midlands,shift_work=shift_work_most_of_the_time,current_occupation_group=223; region=east_midlands,shift_work=shift_work_most_of_the_time,current_occupation_group=613",
  );
  assert.match(out, /Works shifts most of the time, and Nursing Professionals: 76 people/);
  assert.doesNotMatch(out, /Rough for these occupations/);
});

test("a count of a fact still tied by broad group, for one occupation, says it is the group's rate", () => {
  const out = countUk(
    "region=east_midlands",
    "region=east_midlands,job_level=senior_or_lead,current_occupation_group=223; region=east_midlands,job_level=senior_or_lead,current_occupation_group=613",
  );
  assert.match(out, /Rough for these occupations: PersonaGen ties job level to occupation only by broad group/);
  assert.match(
    out,
    /Nursing Professionals: Professional occupations; Caring Personal Services: Caring, leisure and other service occupations/,
  );
});
