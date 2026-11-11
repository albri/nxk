import assert from "node:assert/strict";
import { mkdtemp, utimes, readdir } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { describeField, grepRows, indexOf, loadCatalogue, parseSections } from "./catalogue.mjs";

const MARKDOWN = `# PersonaGen UK catalogue

API 4.0.0, persona schema 4.0.0, generator 4.0.0+test.

- A filter key is the field name.

## Identity (identity)

| field | filter | meaning; universe | values (share of universe) |
|---|---|---|---|
| age_years | min/max | Age in completed years. | 18 to 100 years |
| sex_at_birth | codes | Sex recorded at birth. | female 52%; male 48% |

## Home and travel (home_and_travel)

| field | filter | meaning; universe | values (share of universe) |
|---|---|---|---|
| home_tenure | codes | The tenure of the home. | owned_outright 33%; rented_from_a_private_landlord 17% |

Not generated yet, so not in a persona and refused as filters: last_occupation.
`;

const JSON_CATALOGUE = { groups: [{ group: "home_and_travel", fields: [{
  name: "home_tenure", path: "home_and_travel.home_tenure", kind: "categorical", filterable: true,
  meaning: "The tenure of the home.", universe: "all", universe_share: "98%",
  values: [{ code: "owned_outright", label: "Owned outright", share: "33%" }, { code: "lives_rent_free", label: "Lives rent free" }],
}] }] };

test("the index lists sections and fields; grep finds rows; a field is described in full", () => {
  assert.match(indexOf(MARKDOWN), /^API 4\.0\.0/);
  assert.match(indexOf(MARKDOWN), /identity: Identity, 2 fields: age_years, sex_at_birth/);
  assert.match(indexOf(MARKDOWN), /\nNot generated yet.*: last_occupation\.$/);
  assert.equal(parseSections(MARKDOWN).sections[1].rows.length, 1);
  assert.match(grepRows(MARKDOWN, "TENURE"), /^\[home_and_travel\] \| home_tenure/);
  assert.equal(grepRows(MARKDOWN, "nothing"), "");
  const text = describeField(JSON_CATALOGUE, "home_tenure");
  assert.match(text, /universe: all \(98% of adults\)/);
  assert.match(text, /owned_outright\tOwned outright\t33%/);
  assert.match(text, /lives_rent_free\tLives rent free\t$/m);
  assert.throws(() => describeField(JSON_CATALOGUE, "nope"), /No field named nope/);
});

test("the catalogue is fetched once, then served from the cache and revalidated by ETag", async () => {
  let version = "a";
  const seen = [];
  const server = createServer((request, response) => {
    seen.push(request.headers["if-none-match"] ?? "none");
    const tag = `W/"${version}"`;
    if (request.headers["if-none-match"] === tag) { response.writeHead(304, { etag: tag }).end(); return; }
    response.writeHead(200, { etag: tag, "content-type": "text/markdown" }).end(MARKDOWN + (version === "b" ? "changed\n" : ""));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const dir = await mkdtemp(join(tmpdir(), "nxk-catalogue-test-"));
  try {
    const first = await loadCatalogue("uk", "md", { base, dir });
    assert.equal(first, MARKDOWN);
    assert.equal(await loadCatalogue("uk", "md", { base, dir }), MARKDOWN);
    assert.deepEqual(seen, ["none"], "a fresh copy needs no request");
    assert.equal(await loadCatalogue("uk", "md", { base, dir, refresh: true }), MARKDOWN);
    assert.deepEqual(seen, ["none", 'W/"a"'], "revalidation sends the ETag and takes the 304");
    // A copy more than a day old is revalidated too, and a new release replaces it.
    const [slot] = await readdir(dir);
    const old = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await utimes(join(dir, slot, "uk.md"), old, old);
    version = "b";
    assert.match(await loadCatalogue("uk", "md", { base, dir }), /changed/);
    assert.deepEqual(seen.slice(2), ['W/"a"']);
    await assert.rejects(loadCatalogue("fr", "md", { base, dir }), /uk or us/);
  } finally {
    server.close();
  }
});
