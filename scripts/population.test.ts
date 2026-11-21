import assert from "node:assert/strict";
import test from "node:test";
import {
  countsByField,
  firmWeightAt,
  firmsAmong,
  firmsIn,
  holds,
  keptFile,
  loadMap,
  loadPeople,
  numberAt,
  packer,
  placeLists,
  readPeopleFile,
  shareOf,
  valueCounts,
  valuesAt,
  type Field,
  type JsonRow,
  type MapSource,
  type PackedPeopleFile,
  type Row,
} from "./population.ts";

test("shareOf reads the catalogue's share text", () => {
  assert.equal(shareOf("33%"), 0.33);
  assert.equal(shareOf("<1%"), 0.005);
  assert.equal(shareOf(undefined), null);
});

const TENURE = ["owned", "rented"].map((code) => ({ code, label: code }));

test("packed rows read the same as JSON rows: lists past 30 values, missing values and numbers", () => {
  const values = Array.from({ length: 45 }, (_, i) => ({ code: `v${i}`, label: `v${i}` }));
  let map = [
    { name: "tenure", path: "home.tenure", kind: "categorical", values: TENURE },
    { name: "likes", path: "interests.likes", kind: "list", values },
    { name: "age", path: "identity.age", kind: "range", quantiles: { p50: 40 } },
  ] as Field[];
  const json: JsonRow[] = [
    [0, [1, 29, 30, 44], 37],
    [null, [], 52],
    [1, [0], null],
  ];
  const pack = packer(map, json.length);
  json.forEach((row, i) => pack.put(i, row));
  const file = readPeopleFile(pack.finish({ country: "uk", source: {} as MapSource })) as PackedPeopleFile;
  map = placeLists(map, file);
  json.forEach((row, i) => {
    const packed = file.people[i];
    assert.deepEqual(valuesAt(map[0], packed, 0), valuesAt(map[0], row, 0));
    assert.deepEqual(valuesAt(map[1], packed, 1), valuesAt(map[1], row, 1));
    assert.equal(numberAt(packed, 2), numberAt(row, 2));
    for (const v of [0, 1, 29, 30, 44]) assert.equal(holds(map[1], packed, 1, v), holds(map[1], row, 1, v));
  });
  assert.deepEqual([...valueCounts(map[1], 1, file.people)], [...valueCounts(map[1], 1, json)]);
  assert.equal(valueCounts(map[1], 1, file.people)[44], 1);
  // Every field counted in one pass gives what one pass a field gives, packed or not.
  const byField = (rows: Row[]) => countsByField(map, rows).map((counts) => [...counts]);
  assert.deepEqual(byField(file.people), byField(json));
  assert.deepEqual(
    byField(file.people).slice(0, 2),
    [0, 1].map((f) => [...valueCounts(map[f], f, json)]),
  );
  assert.deepEqual(byField(file.people)[2], []);
});

test("a list of hundreds of values packs as slots and reads the same as JSON", () => {
  const values = Array.from({ length: 900 }, (_, i) => ({ code: `v${i}`, label: `v${i}` }));
  let map = [
    { name: "tenure", path: "home.tenure", kind: "categorical", values: TENURE },
    { name: "interests", path: "interests.interests", kind: "list", values },
    { name: "likes", path: "interests.likes", kind: "list", values: values.slice(0, 40) },
  ] as Field[];
  const json: JsonRow[] = [
    [0, [899, 3, 450], [1, 39]],
    [null, [], []],
    [1, [0], [0]],
  ];
  assert.throws(() => packer(map, json.length), /give the most one person holds/);
  const pack = packer(map, json.length, { most: { 1: 3 } });
  json.forEach((row, i) => pack.put(i, row));
  assert.throws(() => pack.put(0, [0, [1, 2, 3, 4], []]), /more than the 3 given/);
  const file = readPeopleFile(pack.finish({ country: "uk", source: {} as MapSource })) as PackedPeopleFile;
  map = placeLists(map, file);
  assert.deepEqual(map[1].slots?.length, 3);
  json.forEach((row, i) => {
    for (const f of [1, 2])
      assert.deepEqual(
        valuesAt(map[f], file.people[i], f),
        [...valuesAt(map[f], row, f)].sort((a, b) => a - b),
      );
    for (const v of [0, 3, 450, 899, 5]) assert.equal(holds(map[1], file.people[i], 1, v), holds(map[1], row, 1, v));
  });
  const byField = (rows: Row[]) => countsByField(map, rows).map((counts) => [...counts]);
  assert.deepEqual(byField(file.people), byField(json));
  assert.deepEqual([...valueCounts(map[1], 1, file.people)], [...valueCounts(map[1], 1, json)]);
});

test("a file is read once while it is unchanged, again once it changes, and a missing one is named as given", async () => {
  const { mkdtempSync, rmSync, utimesSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "nxk-kept-"));
  try {
    let reads = 0;
    const parse = (bytes: Buffer) => {
      reads++;
      return JSON.parse(bytes.toString("utf8"));
    };
    writeFileSync(join(dir, "map.json"), JSON.stringify({ v: 1 }));
    const first = keptFile("map.json", parse, dir);
    assert.equal(keptFile(join(dir, "map.json"), parse), first, "the same file by its full path is the same read");
    assert.equal(reads, 1);
    // A map rebuilt in place (another size, another time written) is read again.
    writeFileSync(join(dir, "map.json"), JSON.stringify({ v: 22 }));
    utimesSync(join(dir, "map.json"), new Date(), new Date(Date.now() + 5000));
    assert.deepEqual(keptFile("map.json", parse, dir), { v: 22 });
    assert.equal(reads, 2);
    assert.throws(
      () => keptFile("gone.json", parse, dir),
      (error: NodeJS.ErrnoException) =>
        error.code === "ENOENT" && error.message.includes("'gone.json'") && !error.message.includes(dir),
    );
    // The shipped people come with their lists placed on a copy of the map's fields: the map read once is unchanged.
    const { map } = loadPeople("uk");
    assert.ok(map.fields.some((field) => field.hi !== undefined));
    assert.ok(!loadMap("uk").fields.some((field) => field.hi !== undefined || field.slots !== undefined));
    assert.equal(loadPeople("uk"), loadPeople("uk"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a firm weight packs in two entries after the row and reads back to the billionth; none is null", () => {
  const map = [{ name: "tenure", path: "home.tenure", kind: "categorical", values: TENURE }] as Field[];
  const weights = [1, 0.197811, 0.0000104798, 0, null, 0.5];
  const pack = packer(map, weights.length, { firm: true });
  weights.forEach((w, i) => pack.put(i, [i % 2], w));
  assert.throws(() => pack.put(0, [0], 1.5), /a weight runs from 0 to 1/);
  const file = readPeopleFile(pack.finish({ country: "uk", source: {} as MapSource })) as PackedPeopleFile;
  assert.equal(file.firm, 1);
  assert.equal(file.width, 3);
  const weightOf = firmWeightAt(file.firm);
  file.people.forEach((row, i) => {
    assert.equal(valuesAt(map[0], row, 0)[0], i % 2, "the field reads as before");
    if (weights[i] === null) assert.equal(weightOf(row), null);
    else assert.ok(Math.abs(Number(weightOf(row)) - weights[i]) <= 5e-10, `${weights[i]} read as ${weightOf(row)}`);
  });
  // A file packed without them says nothing of firms.
  const none = packer(map, 1);
  none.put(0, [0]);
  assert.equal(
    (readPeopleFile(none.finish({ country: "uk", source: {} as MapSource })) as PackedPeopleFile).firm,
    undefined,
  );
});

test("summed firm weights count firms: a firm's people add up to one firm, and a group of firms to their number", () => {
  // A firm of 4 people (a quarter each), one of 2 of whom 2 are here (a half each), a one-person business, and a
  // person not in work.
  const rows = [[0.25], [0.25], [0.25], [0.25], [0.5], [0.5], [1], [null]];
  const found = firmsAmong(rows, (row) => row[0]);
  assert.equal(found.sum, 3);
  assert.equal(found.people, 7);
  assert.ok(Math.abs(found.effective - 9 / 1.75) < 1e-9, "equal weights count as many as there are people");
  assert.equal(firmsAmong([[1], [1]], (row) => row[0]).effective, 2);
  assert.deepEqual(
    firmsAmong([[null]], (row) => row[0]),
    { sum: 0, people: 0, effective: 0 },
  );
  // Scaled from the people to the country as a share of adults is: 3 firms' worth among 8 of 55,484,667 adults.
  assert.equal(Math.round(firmsIn(3, 8, "uk")), Math.round((3 / 8) * 55_484_667));
});

test("the shipped people carry each person's firm weight, adding up to the firms the map says an adult stands for", () => {
  const totals: Record<string, number> = {};
  for (const country of ["uk", "us"] as const) {
    const { map, people, firmWeight } = loadPeople(country);
    assert.ok(firmWeight, `${country}: the people file keeps firm weights`);
    assert.ok(map.firms, `${country}: the map says what the firm weights add up to`);
    assert.equal(map.firms.path, "work.firm_weight");
    assert.ok(!map.fields.some((field) => field.name === "firm_weight"), "no fact to filter or scan by");
    const { sum, people: held } = firmsAmong(people, firmWeight);
    assert.ok(Math.abs(sum / people.length - map.firms.per_adult) < 1e-6, `${country}: ${sum / people.length}`);
    assert.equal(`${Math.round((100 * held) / people.length)}%`, map.firms.held);
    totals[country] = firmsIn(sum, people.length, country);
  }
  // Directional checks against published business populations: about 5.5 million UK businesses (DBT, 2025) and,
  // with one-person businesses that are a main job, some 17 million in the US.
  assert.ok(totals.uk > 5e6 && totals.uk < 6e6, String(totals.uk));
  assert.ok(totals.us > 15e6 && totals.us < 20e6, String(totals.us));
});
