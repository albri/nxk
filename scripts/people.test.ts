import assert from "node:assert/strict";
import test from "node:test";
import type { LogRecord } from "./log.ts";
import { findLines, likeForLike, placeLine, type RowCondition } from "./people.ts";
import type { Field, Row } from "./population.ts";

const fields = [
  {
    name: "home_tenure",
    tier: "A",
    meaning: "The tenure of the household's home.",
    values: [
      { code: "owned_outright", label: "Owned outright", share: "33%" },
      { code: "rented_privately", label: "Rented privately", share: "19%" },
    ],
  },
  {
    name: "employer_industry_section",
    tier: "A",
    meaning: "The industry of the person's employer.",
    values: [{ code: "d_electricity_gas", label: "Electricity, gas, steam and air conditioning supply", share: "1%" }],
  },
] as Field[]; // with only what find reads

test("find lists the fields and values that mention a word", () => {
  const lines = findLines(fields, "owned");
  assert.equal(lines[0], "home_tenure (tier A): The tenure of the household's home.");
  assert.match(lines[1], /home_tenure=owned_outright/);
  assert.equal(lines.length, 2);
});

test("find says when no fact mentions the word, and not to count a stand-in under its name", () => {
  const lines = findLines(fields, "boiler");
  assert.match(lines[0], /No fact about people mentions "boiler"/);
  assert.match(lines[0], /list all 2 with action fields/);
  assert.match(lines[1], /nothing here counts it/);
  assert.match(lines[1], /stand-in/);
});

test("a word that misses as written is tried by its root, and the reply says so", () => {
  const lines = findLines(fields, "renting");
  assert.equal(lines[0], 'Nothing mentions "renting" as written; these mention its root "rent":');
  assert.match(lines[2], /home_tenure=rented_privately/);
  // Only one word has a root: a phrase that misses is not cut down to one of its words.
  assert.match(findLines(fields, "sole renting")[0], /^No fact about people mentions/);
});

test("a card says each part of a place once: a US place loses the state its region gives, and its census type", () => {
  assert.deepEqual(placeLine(["Livonia city, Michigan", "Wayne County, Michigan", "Michigan"]), [
    "Livonia",
    "Wayne County",
    "Michigan",
  ]);
  assert.deepEqual(placeLine(["Pasadena CDP, Maryland", "Anne Arundel County, Maryland", "Maryland"]), [
    "Pasadena",
    "Anne Arundel County",
    "Maryland",
  ]);
  // A UK place is said as it was, a part named twice once.
  assert.deepEqual(placeLine(["London", "Tower Hamlets", "London"]), ["London", "Tower Hamlets"]);
  assert.deepEqual(placeLine(["Brough", "East Riding of Yorkshire", "Yorkshire and the Humber"]), [
    "Brough",
    "East Riding of Yorkshire",
    "Yorkshire and the Humber",
  ]);
});

test("a match on a word is not always the fact meant: gas finds the gas industry", () => {
  assert.match(findLines(fields, "gas")[0], /^employer_industry_section/);
});

test("several groups are counted side by side, each against the first, and an overlap is said", async () => {
  const { execFileSync, spawnSync } = await import("node:child_process");
  const count = (who: string) =>
    execFileSync(
      process.execPath,
      [new URL("./people.ts", import.meta.url).pathname, "count", "--country=uk", `--who=${who}`],
      { encoding: "utf8" },
    );
  const towns = count(
    "county_or_local_authority=E08000035,pets_in_household=dogs_only;county_or_local_authority=E06000014,pets_in_household=dogs_only",
  );
  assert.match(towns, /^A\. Leeds, and Dogs only: \d+ people/m);
  assert.match(towns, /^ {2}B: A is \d+\.\d\d times as many, -\d\.\d in every 100 of adults\.$/m);
  assert.match(towns, /No one is in two of these groups: together they are \d+ people/);
  assert.equal((towns.match(/ONS mid-2025/g) ?? []).length, 1); // the source once, not on every line
  const bands = count("age_years=18..30;age_years=25..40");
  assert.match(bands, /The groups overlap: \d+ people are in more than one/);
  const split = spawnSync(
    process.execPath,
    [
      new URL("./people.ts", import.meta.url).pathname,
      "split",
      "--country=uk",
      "--who=age_years=18..30;age_years=31..40",
      "--by=home_tenure",
    ],
    { encoding: "utf8" },
  );
  assert.match(split.stderr, /Several groups \(separated by ;\) are for action count/);
});

test("a group's share of the generated people is turned into about how many real adults it is", async () => {
  const { adultsLine } = await import("./people.ts");
  assert.match(
    adultsLine(2439, 200000, "uk"),
    /^about 680,000 of the adults in the UK \(give or take 27,000; .*ONS mid-2025/,
  );
  assert.match(adultsLine(45858, 200000, "us"), /^about 62,000,000 of the adults in the US/);
});

test("groups that differ in one fact are also given as a share of their own band, and bands of unequal width are said", () => {
  // 100 people aged 20 to 69, one a year twice over; the carers are 30 to 49.
  const base = Array.from({ length: 100 }, (_, i) => ({ age: 20 + (i % 50), carer: i % 50 >= 10 && i % 50 < 30 }));
  type Adult = (typeof base)[number];
  const band = (lo: number, hi: number): RowCondition<Adult> => ({
    path: "id.age_years",
    text: `age ${lo} to ${hi}`,
    range: [lo, hi],
    test: (r) => r.age >= lo && r.age <= hi,
  });
  const carer: RowCondition<Adult> = { path: "health.care", text: "carer", test: (r) => r.carer };
  const groups = [
    [carer, band(20, 39)],
    [carer, band(40, 49)],
    [carer, band(50, 69)],
  ];
  const members = groups.map((g) => base.filter((r) => g.every((c) => c.test(r))));
  const lines = likeForLike(groups, members, base);
  assert.match(lines[0], /share of the adults with its own age_years/);
  assert.deepEqual(
    lines.slice(1, 4).map((l) => /: (\d+) of (\d+), ([\d.]+) in every 100/.exec(l)?.slice(1)),
    [
      ["20", "40", "50.0"],
      ["20", "20", "100.0"],
      ["0", "40", "0.0"],
    ],
  );
  assert.match(lines[4], /different widths \(20, 10, 20 wide\).*split by age_years/);
  // Groups that differ in more than one fact are not compared this way.
  assert.deepEqual(likeForLike([[carer, band(20, 39)], [band(40, 49)]], [[], []], base), []);
});

test("a count of firms says firms, rounded, and a count of adults never does", async () => {
  const { adultsLine, firmShare, firmsLabel, firmsLine } = await import("./people.ts");
  // 20 firms' worth of weight among 200 people: a tenth of the UK's 55,484,667 adults is 5,548,467 firms.
  assert.equal(firmsLine(20, 200, "uk"), "about 5,500,000 firms");
  assert.equal(firmsLine(0.0001, 200000, "uk"), "no firms");
  assert.equal(firmsLine(1, 200000, "us"), "about 1,300 firms");
  for (const sum of [0.5, 20, 1500]) assert.doesNotMatch(firmsLine(sum, 200000, "uk"), /adult|people/);
  assert.doesNotMatch(adultsLine(2439, 200000, "uk"), /firm|business/);
  assert.equal(firmShare(1, 4), "25 in every 100 of the firms");
  assert.equal(firmShare(1, 1000), "under 1 in every 100 of the firms");
  assert.equal(firmShare(4, 4), "all of the firms");
  assert.match(
    firmsLabel(200000),
    /^Firms, not adults: counted on 200,000 made-up adults that match official statistics, .*\. Directional\.$/,
  );
});

test("firms by a field's values: each value's weights, and a number by its bands", async () => {
  const { firmsByValue } = await import("./people.ts");
  const size = {
    name: "size",
    kind: "categorical",
    values: [
      { code: "small", label: "Small" },
      { code: "big", label: "Big" },
    ],
  } as Field;
  // A size, an age and, last, the person's firm weight.
  const rows: Row[] = [
    [0, 30, 1],
    [0, 60, 0.5],
    [1, 40, 0.01],
    [null, 50, null],
  ];
  const weightOf = (row: Row) => row[2] as number | null;
  assert.deepEqual(firmsByValue(size, 0, rows, weightOf), [
    { label: "Small", sum: 1.5 },
    { label: "Big", sum: 0.01 },
  ]);
  const age = {
    name: "age_years",
    kind: "range",
    range: { min: 18, max: 100, unit: "years" },
    quantiles: { p50: 45 },
  } as Field;
  const bands = firmsByValue(age, 1, rows, weightOf);
  assert.deepEqual(
    bands.filter((b) => b.sum).map((b) => [b.label, b.sum]),
    [
      ["25 to 34", 1],
      ["35 to 44", 0.01],
      ["55 to 64", 0.5],
    ],
  );
});

test("people counts firms with unit firms, by facts about the firm, and records them as firms", async () => {
  const { run } = await import("./people.ts");
  const ask = async (...argv: string[]) => {
    const printed: string[] = [],
      records: LogRecord[] = [];
    await run(argv, { print: (text) => printed.push(text), sinks: [(r) => records.push(r)] }, { folder: "." });
    return { text: printed.join("\n"), records };
  };
  const { text, records } = await ask(
    "count",
    "--country=uk",
    "--unit=firms",
    "--who=organisation_size=10_to_49_employees,region=north_west",
  );
  assert.match(text, /^Within all firms in the UK: about [\d,]+ firms, one-person businesses included\.$/m);
  const found = /^10 to 49 employees, and North West England: about ([\d,]+) firms, .* of the firms\.$/m.exec(text);
  assert.ok(found);
  const [, n] = found;
  assert.match(text, /^Firms, not adults: counted on 200,000 made-up adults/m);
  assert.doesNotMatch(text, /of adults|of the adults in|\d people/, "never said as adults");
  // Directional: the business population puts about 220,000 UK firms at 10 to 49 staff, one in nine in the North West.
  assert.ok(Number(n.replace(/,/g, "")) > 15000 && Number(n.replace(/,/g, "")) < 40000, n);
  const firms = records.filter((r) => r.type === "firms").map((r) => r.value);
  assert.ok(firms.includes(Number(n.replace(/,/g, ""))), "the figure is recorded as a number of firms");
  assert.ok(records.some((r) => r.type === "line" && r.label === "counted" && /firms/.test(r.text)));

  // Side by side, and split, say firms too; a size split shows every size with firms, the few large ones included.
  const sizes = await ask(
    "count",
    "--country=uk",
    "--unit=firms",
    "--who=organisation_size=fewer_than_10_employees;organisation_size=50_to_249_employees",
  );
  assert.match(sizes.text, /^ {2}B: A has about \d+ times as many firms\.$/m);
  assert.match(sizes.text, /^No firm is in two of these groups: together they are about [\d,]+ firms/m);
  const split = await ask("split", "--country=us", "--unit=firms", "--by=organisation_size");
  assert.match(split.text, /employers in these sectors are not counted as firms: .*Local government/);
  assert.match(split.text, /^ +<1% +<1% {2}1,000 or more employees: about [\d,]+ firms$/m);

  // A fact about the person is refused, unless the firms are one-person businesses.
  await assert.rejects(
    ask("count", "--country=uk", "--unit=firms", "--who=age_years=25..34,organisation_size=10_to_49_employees"),
    /age_years \(age_years 25 to 34\) is a fact about a person, not their firm: .*parts of firms/,
  );
  const sole = await ask(
    "count",
    "--country=uk",
    "--unit=firms",
    "--who=organisation_size=self_employed_with_no_employees,age_years=55..100",
  );
  assert.match(sole.text, /^Self-employed with no employees, and age_years 55 to 100: about [\d,]+ firms/m);
  await assert.rejects(ask("cast", "--country=uk", "--unit=firms"), /Firms are counted with action count or split/);
  await assert.rejects(ask("count", "--country=uk", "--unit=shops", "--who=region=london"), /unit is adults/);
  // Employers that stand for no firm are said, not counted as none quietly.
  const council = await ask("count", "--country=us", "--unit=firms", "--who=employer_sector=local_government");
  assert.match(council.text, /^Local government: no firms\.$/m);
  assert.match(council.text, /Most of the people in work here have no firm weight/);
  // A count of adults is unchanged and never says firms.
  const adults = await ask("count", "--country=uk", "--who=organisation_size=10_to_49_employees,region=north_west");
  assert.match(adults.text, /people, [\d.]+% of adults/);
  assert.doesNotMatch(adults.text.split("\n").slice(0, 2).join("\n"), /firms/);
  assert.ok(!adults.records.some((r) => r.type === "firms"));
});

test("meet draws people from inside the group, each as a card of their own facts, the same people for the same seed", async () => {
  const { run } = await import("./people.ts");
  const ask = async (...argv: string[]) => {
    const printed: string[] = [];
    await run(argv, { print: (text) => printed.push(text), sinks: [] }, { folder: "." });
    return printed.join("\n");
  };
  const who = "--who=home_tenure=rented_from_a_private_landlord_or_letting_agency,region=north_west_england";
  const text = await ask("meet", "--country=uk", who, "--n=4");
  assert.match(
    text,
    /^4 of \d+ generated people \(Rented from a private landlord or letting agency, and North West England\)/m,
  );
  const cards = text.split(/\n(?=\d+\. )/).slice(1);
  assert.equal(cards.length, 4);
  for (const card of cards) {
    assert.match(card, /^\d+\. (Man|Woman|[A-Z][a-z]+), \d+\. .*North West England\./m);
    assert.match(
      card,
      /^ {3}Home: rented from a private landlord or letting agency/m,
      "everyone drawn is in the group",
    );
    assert.doesNotMatch(card, /second fifth|middle fifth|fourth fifth|not in employment/i, "only what sets them apart");
  }
  assert.match(text, /mark it "imagined", and give it no figures\.$/m);
  assert.equal(await ask("meet", "--country=uk", who, "--n=4"), text, "the same seed draws the same people");
  assert.notEqual(await ask("meet", "--country=uk", who, "--n=4", "--seed=2"), text);
  assert.match(await ask("meet", "--country=uk", who, "--n=40"), /^12 of /m);
});
