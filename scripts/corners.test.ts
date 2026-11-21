import assert from "node:assert/strict";
import test from "node:test";
import { CATEGORIES } from "./businesses.ts";
import { alike, correlation, leanBy, ownCorners, reached, roomOf, scoresOf, whiteSpace, workersOf } from "./corners.ts";
import {
  PART,
  atWork,
  homeButBusiness,
  ideasOf,
  keenAtWork,
  specOf,
  undeclared,
  whoDecides,
  wordsOf,
} from "./discover.ts";
import type { Field } from "./population.ts";
import { peopleAnswers } from "./scan-answers.ts";

// A small room: 600 people with a tenure, a work status and a household, in every combination.
const fields = [
  {
    name: "home_tenure",
    path: "home.home_tenure",
    tier: "A",
    kind: "categorical",
    values: [
      { code: "owns", label: "Owns" },
      { code: "rents", label: "Rents" },
    ],
  },
  {
    name: "work",
    path: "work.work",
    tier: "A",
    kind: "categorical",
    values: [
      { code: "employed", label: "Employed" },
      { code: "retired", label: "Retired" },
      { code: "student", label: "Student" },
    ],
  },
  {
    name: "household",
    path: "home.household",
    tier: "A",
    kind: "categorical",
    values: [
      { code: "alone", label: "Lives alone" },
      { code: "couple", label: "Couple" },
    ],
  },
] as Field[]; // with only what the room reads
const people = Array.from({ length: 600 }, (_, i) => [i % 2, i % 3, Math.floor(i / 6) % 2]);
const room = roomOf(fields, people);
/** Each value's answer, where it is not the base's 0.2. */
type Shifts = Partial<Record<string, number>>;
const answers = (shifts: Shifts) =>
  new Map([
    ["base", 0.2],
    ["home.home_tenure=owns", shifts.owns ?? 0.2],
    ["home.home_tenure=rents", shifts.rents ?? 0.2],
    ["work.work=employed", shifts.employed ?? 0.2],
    ["work.work=retired", shifts.retired ?? 0.2],
    ["work.work=student", shifts.student ?? 0.2],
    ["home.household=alone", shifts.alone ?? 0.2],
    ["home.household=couple", shifts.couple ?? 0.2],
  ]);
const idea = (key: string, shifts: Shifts) => ({ key, ...scoresOf(room, answers(shifts)) });

test("roomOf lists who holds each value and leaves out values too rare or too common to name a corner", () => {
  assert.equal(room.N, 600);
  assert.deepEqual(
    room.facts.map((fact) => `${fact.field}=${fact.code}`),
    [
      "home_tenure=owns",
      "home_tenure=rents",
      "work=employed",
      "work=retired",
      "work=student",
      "household=alone",
      "household=couple",
    ],
  );
  assert.equal(room.facts[0].list.length, 300);
  const narrow = roomOf(fields, people, { maxShare: 0.4 });
  assert.deepEqual(
    narrow.facts.map((fact) => fact.field),
    ["work", "work", "work"],
  );
});

test("a person's part in their organisation's buying names a corner; a field that restates another does not", () => {
  const work = [
    {
      name: "purchasing_role_software",
      path: "work.purchasing_role_software",
      tier: "C",
      kind: "categorical",
      values: [{ code: "gives_final_sign_off_on_this" }, { code: "no_role" }],
    },
    {
      name: "organisation_purchasing_process",
      path: "work.organisation_purchasing_process",
      tier: "C",
      kind: "categorical",
      values: [{ code: "owner_decides" }, { code: "formal_procurement" }],
    },
    {
      name: "decision_role",
      path: "work.decision_role",
      tier: "C",
      kind: "categorical",
      values: [{ code: "final_sign_off" }, { code: "none" }],
    },
  ] as Field[];
  const named = roomOf(
    work,
    people.map((row) => [row[0], row[1] % 2, row[0]]),
  ).facts.map((fact) => fact.field);
  assert.deepEqual([...new Set(named)], ["purchasing_role_software", "organisation_purchasing_process"]);
});

test("scoresOf gives every person the score peopleAnswers gives them", () => {
  const given = answers({ retired: 0.5, rents: 0.1, alone: 0.35 });
  const mine = scoresOf(room, given, { damping: 0.3 }),
    theirs = peopleAnswers(fields, people, given, { damping: 0.3 });
  for (let i = 0; i < people.length; i += 37) assert.ok(Math.abs(mine.p[i] - theirs.p[i]) < 1e-12);
  assert.deepEqual(mine.scanned, ["home_tenure", "work", "household"]);
});

test("alike is 1 for ideas wanted by the same people and lower for ideas wanted by different people", () => {
  const a = idea("a", { retired: 0.5 }),
    b = idea("b", { retired: 0.6 }),
    c = idea("c", { student: 0.5 });
  assert.ok(alike([a, b]).average > 0.99);
  assert.ok(alike([a, c]).average < 0);
  assert.equal(alike([a, b, c]).pairs[0].r, correlation(a.p, b.p));
});

test("ownCorners names the people who prefer an idea to the others, not the people keen on everything", () => {
  // Everyone who lives alone is keener on all three ideas; each idea also has a group of its own.
  const ideas = [
    idea("pension_letters", { retired: 0.6, alone: 0.4 }),
    idea("tenancy_help", { rents: 0.5, student: 0.45, alone: 0.4 }),
    idea("generic", { alone: 0.4 }),
  ];
  const found = ownCorners(room, ideas);
  const corner = (key: string) => {
    const own = found.ideas.find((x) => x.key === key);
    assert.ok(own, key);
    return own;
  };
  assert.deepEqual(
    corner("pension_letters").facts.map((fact) => fact.code),
    ["retired"],
  );
  assert.ok(corner("tenancy_help").facts.some((fact) => fact.code === "student" || fact.code === "rents"));
  assert.ok(corner("pension_letters").odds > 1.05);
  assert.ok(corner("pension_letters").share > 0.3 && corner("pension_letters").share < 0.35);
  assert.deepEqual(
    found.keen.facts.map((fact) => fact.code),
    ["alone"],
  );
  assert.deepEqual(
    found.cold.facts.map((fact) => fact.code),
    ["couple"],
  );
});

test("an idea with no corner of its own still names who it is for: the people keenest on it, with their share", () => {
  // generic is wanted by the people who live alone, as every idea is, and by no one in particular beyond them.
  const ideas = [
    idea("pension_letters", { retired: 0.6, alone: 0.4 }),
    idea("tenancy_help", { rents: 0.5, student: 0.45, alone: 0.4 }),
    idea("generic", { alone: 0.4 }),
  ];
  const generic = ownCorners(room, ideas).ideas.find((x) => x.key === "generic");
  assert.ok(generic);
  assert.ok(generic.odds < 1.15);
  assert.deepEqual(
    generic.keenest.facts.map((fact) => fact.code),
    ["alone"],
  );
  assert.equal(generic.keenest.share, 0.5);
  assert.ok(generic.keenest.keen > generic.keenest.room && generic.keenest.odds > 1);
  // Every idea has one: for the owner's own offer it is who wants it, whatever its corner.
  assert.ok(ownCorners(room, ideas).ideas.every((x) => x.keenest && x.keenest.odds > 1));
});

test("whiteSpace finds the big group keen on doing it themselves that every offer misses", () => {
  // Students pick teams by hand more than anyone; both apps are for retired and employed people.
  const ideas = [
    idea("hand", { student: 0.9 }),
    idea("app", { retired: 0.5, student: 0.05 }),
    idea("club", { employed: 0.5, student: 0.05 }),
  ];
  const empty = whiteSpace(room, ideas, { floor: 0.2, now: new Set(["hand"]) });
  assert.deepEqual(
    empty.map((c) => c.facts.map((f) => f.code).join("+")),
    ["student"],
  );
  assert.equal(empty[0].now, "hand");
  assert.ok(empty[0].nowLift >= 1.1 && empty[0].lift < 1);
  assert.ok(["app", "club"].includes(empty[0].best));
  // With no way of doing it now on the list, nothing is read.
  assert.deepEqual(whiteSpace(room, ideas, { floor: 0.2 }), []);
});

test("a group cold on everything, the way they do it now too, is not one nobody serves", () => {
  // The employed are cold on every idea, the way they do it now among them: they want none of it.
  const ideas = [
    idea("a", { retired: 0.6, employed: 0.1 }),
    idea("b", { student: 0.5, employed: 0.1 }),
    idea("hand", { retired: 0.4, student: 0.4, employed: 0.1 }),
  ];
  assert.deepEqual(whiteSpace(room, ideas, { floor: 0.2, now: new Set(["hand"]) }), []);
  // Retired people and students are each a little keener than the room on some idea; the employed are on none.
  assert.ok(Math.abs(reached(room, ideas, 1.02) - 2 / 3) < 0.01);
  assert.equal(reached(room, ideas, 2), 0);
});

test("ideasOf keeps the way people do it now, and refuses an idea marked both own and now", () => {
  assert.deepEqual(ideasOf([{ key: "hand", offer: "pick teams by hand, free", now: true }])[0], {
    key: "hand",
    offer: "pick teams by hand, free",
    fields: [],
    now: true,
  });
  assert.equal(ideasOf([{ key: "a", offer: "x", now: "yes" }])[0].now, undefined);
  assert.throws(() => ideasOf([{ key: "a", offer: "x", own: true, now: true }]), /mark one or the other/);
});

test("ideasOf makes keys safe, and refuses a repeat or an idea with no offer", () => {
  assert.deepEqual(ideasOf([{ key: "Renewal Radar!", offer: " a service ", fields: ["home_tenure"] }]), [
    { key: "renewal_radar", offer: "a service", fields: ["home_tenure"] },
  ]);
  assert.deepEqual(ideasOf([{ key: "a", offer: "x" }])[0].fields, []);
  assert.deepEqual(
    ideasOf({ one: "a thing", two: "another" }).map((x) => x.key),
    ["one", "two"],
  );
  assert.throws(
    () =>
      ideasOf([
        { key: "a", offer: "x" },
        { key: "A", offer: "y" },
      ]),
    /share the key/,
  );
  assert.throws(() => ideasOf([{ key: "a" }]), /needs a "key" and an "offer"/);
});

test("specOf asks where the person stands a year on, with one version for each idea", () => {
  const spec = specOf([{ key: "a", offer: "a service called A. It costs £5 a month." }], "November 2026");
  assert.equal(
    spec.versions.a,
    "This has been on offer where you live for the past year: a service called A. It costs £5 a month.",
  );
  assert.deepEqual(spec.watch, ["act", "I have it or use it"]);
  assert.equal(spec.questions.act.options.length, 3);
});

test("an offer sold to organisations names what they buy it as, and one written for businesses must say", () => {
  const [work, home] = ideasOf([
    { key: "w", offer: "x", buying_category: "Software_and_SaaS" },
    { key: "h", offer: "y", buying_category: "household" },
  ]);
  assert.equal(work.buying_category, "software_and_saas");
  assert.ok(atWork(work) && !atWork(home));
  assert.throws(
    () => ideasOf([{ key: "a", offer: "x", buying_category: "stationery" }]),
    /buying_category is "household" or one of/,
  );
  assert.notEqual(wordsOf(work), wordsOf({ ...work, buying_category: undefined }));
  const ideas = ideasOf([
    { key: "contract", offer: "a maintenance contract for small shops and offices, $150 a month" },
    { key: "landlords", offer: "turnover checks for landlords, $90 a visit", buying_category: "household" },
    { key: "panel", offer: "a panel upgrade, $2,400", buying_category: "household" },
  ]);
  // Every idea says who buys it; how it is written only hints that "household" may be wrong.
  assert.deepEqual(
    undeclared(ideas).map((idea) => idea.key),
    ["contract"],
  );
  assert.deepEqual(
    homeButBusiness(ideas).map((idea) => idea.key),
    ["landlords"],
  );
});

test("specOf asks an offer sold to organisations at work, answered for where the person works", () => {
  const spec = specOf(
    ideasOf([
      { key: "a", offer: "a booking tool. It costs $29 per user a month.", buying_category: "software_and_saas" },
      { key: "b", offer: "a lamp" },
    ]),
    "November 2026",
  );
  assert.match(
    spec.versions.a,
    /^This has been on offer to organisations like the one you work for.*: a booking tool\. .* Answer for where you work.*If you are not in work, you have never had or used it\.$/,
  );
  assert.match(spec.versions.b, /^This has been on offer where you live/);
});

test("an offer sold to organisations is read by who decides at each size (counted) and how keen people in work are (simulated)", () => {
  const work = [
    {
      name: "purchasing_role_software_and_saas",
      path: "work.purchasing_role_software_and_saas",
      tier: "C",
      kind: "categorical",
      values: [
        { code: "gives_final_sign_off_on_this", label: "Gives final sign-off on purchases of software and SaaS" },
        { code: "uses_or_requests_this", label: "Uses software and SaaS or requests it from the buyer" },
      ],
    },
    {
      name: "organisation_size",
      path: "work.organisation_size",
      tier: "B",
      kind: "categorical",
      values: [
        { code: "fewer_than_10_employees", label: "Fewer than 10 employees" },
        { code: "1000_or_more_employees", label: "1,000 or more employees" },
        { code: "not_in_employment" },
      ],
    },
    {
      name: "organisation_purchasing_process",
      path: "work.organisation_purchasing_process",
      tier: "C",
      kind: "categorical",
      values: [{ code: "owner_or_one_person_decides" }, { code: "formal_procurement_process" }],
    },
  ] as Field[];
  // 100 people: 20 sign off at small firms where the owner decides; 30 use it at large firms with procurement; 50 not in work.
  const rows = Array.from({ length: 100 }, (_, i) => (i < 20 ? [0, 0, 0] : i < 50 ? [1, 1, 1] : [2, 2, 2]));
  const p = Float64Array.from({ length: 100 }, (_, i) => (i < 20 ? 0.5 : i < 50 ? 0.2 : 0.01));
  const table = whoDecides(work, rows, "software_and_saas");
  assert.ok(table);
  assert.deepEqual(
    table.map((s) => [s.code, s.share, s.how.map((h) => [h.code, h.share]), s.parts.map((g) => [g.code, g.share])]),
    [
      ["fewer_than_10_employees", 0.2, [["owner_or_one_person_decides", 1]], [["gives_final_sign_off_on_this", 1]]],
      ["1000_or_more_employees", 0.3, [["formal_procurement_process", 1]], [["uses_or_requests_this", 1]]],
    ],
  );
  const keen = keenAtWork(work, rows, { buying_category: "software_and_saas", p });
  assert.ok(keen);
  // Against the 50 people in work (0.32), not all 100 adults: those not in work answered that they never had it.
  assert.equal(Number(keen.work.toFixed(2)), 0.32);
  assert.deepEqual(
    keen.parts.map((g) => [PART[g.code], Number(g.keen.toFixed(2))]),
    [
      ["signs off", 0.5],
      ["uses or asks for it", 0.2],
    ],
  );
  assert.equal(whoDecides(work, rows, "insurance"), null);
  // With who each person is at work, the people holding each part are named: the owner signs off at the small firms,
  // a director at the large one, staff use it.
  const seated = [
    ...work,
    {
      name: "employment_type",
      path: "work.employment_type",
      tier: "A",
      kind: "categorical",
      values: [{ code: "self_employed_with_employees" }, { code: "employee" }, { code: "not_in_employment" }],
    },
    {
      name: "job_level",
      path: "work.job_level",
      tier: "B",
      kind: "categorical",
      values: [{ code: "director_or_executive" }, { code: "experienced" }, { code: "not_in_employment" }],
    },
    {
      name: "management_responsibility",
      path: "work.management_responsibility",
      tier: "B",
      kind: "categorical",
      values: [{ code: "manager" }, { code: "no_supervisory_duties" }, { code: "not_applicable" }],
    },
  ] as Field[];
  // 20 owners sign off at small firms; at the large firm 10 directors sign off and 20 staff use it; 50 not in work.
  const placed = Array.from({ length: 100 }, (_, i) =>
    i < 20 ? [0, 0, 0, 0, 0, 2] : i < 30 ? [0, 1, 1, 1, 0, 0] : i < 50 ? [1, 1, 1, 1, 1, 1] : [2, 2, 2, 2, 2, 2],
  );
  const decided = whoDecides(seated, placed, "software_and_saas");
  assert.ok(decided);
  const who = decided.map((s) => [s.code, s.who?.map((w) => [PART[w.code], w.seats.map((x) => [x.seat, x.share])])]);
  assert.deepEqual(who, [
    ["fewer_than_10_employees", [["signs off", [["the owner", 1]]]]],
    [
      "1000_or_more_employees",
      [
        ["signs off", [["directors and executives", 1]]],
        ["uses or asks for it", [["staff", 1]]],
      ],
    ],
  ]);
});

test("offers sold to organisations are read among the people in work: workersOf marks them", () => {
  const sized = [
    {
      name: "organisation_size",
      path: "work.organisation_size",
      tier: "B",
      kind: "categorical",
      values: [{ code: "fewer_than_10_employees" }, { code: "not_in_employment" }],
    },
  ] as Field[];
  assert.deepEqual([...(workersOf(sized, [[0], [1], [0]]) ?? [])], [1, 0, 1]);
  assert.equal(workersOf(fields, people), null);
});

test("every buying category and work fact asked at work is in both countries' maps", async () => {
  const { readFileSync } = await import("node:fs");
  for (const country of ["uk", "us"]) {
    const names = new Set(
      JSON.parse(readFileSync(new URL(`../maps/${country}.json`, import.meta.url), "utf8")).fields.map(
        (field: { name: string }) => field.name,
      ),
    );
    for (const name of [
      ...CATEGORIES.map((c) => `purchasing_role_${c}`),
      "organisation_size",
      "organisation_purchasing_process",
      "employer_sector",
      "job_level",
      "management_responsibility",
    ])
      assert.ok(names.has(name), `${country}: ${name}`);
  }
});

test("leanBy gives how keen each age band and gender is on one offer, the direction a published table gives", () => {
  const fields = [
    { name: "age_years", path: "person.age_years", tier: "A", kind: "number" },
    {
      name: "gender",
      path: "person.gender",
      tier: "A",
      kind: "categorical",
      values: [
        { code: "woman", label: "Woman" },
        { code: "man", label: "Man" },
      ],
    },
  ] as Field[]; // age with no range: the room names no corner by it, and leanBy reads its numbers
  // 700 people: ages 18 to 87, half men; the young men are keen, everyone else is not.
  const people = Array.from({ length: 700 }, (_, i) => [18 + (i % 70), i % 2]);
  const room = roomOf(fields, people);
  const p = Float64Array.from(people, ([age, man]) => (age < 35 && man ? 0.3 : 0.05));
  const [age, gender] = leanBy(room, { p });
  assert.equal(age.by, "age");
  assert.deepEqual(
    age.groups.map((g) => g.label),
    ["18 to 24", "25 to 34", "35 to 44", "45 to 54", "55 to 64", "65 to 74", "75 and over"],
  );
  assert.ok(age.groups[0].keen > age.groups[3].keen && age.groups[1].keen > age.groups[6].keen);
  assert.equal(gender.by, "gender");
  const [woman, man] = gender.groups;
  assert.ok(man.keen > woman.keen && Math.abs(man.share - 0.5) < 0.01);
  // A room with neither field has nothing to say.
  assert.deepEqual(leanBy(roomOf([fields[1]].slice(0, 0), [[]]), { p: [0] }), []);
});
