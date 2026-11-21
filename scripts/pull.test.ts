import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { PeopleMap } from "./population.ts";
import { filtersOf, pull, refusal, rowOf, type Persona } from "./pull.ts";

// A real persona, as PersonaGen 4.0 returns it (the example shipped on main), and the US map.
const persona: Persona = JSON.parse(
  readFileSync(new URL("../examples/data/personagen-us-example.json", import.meta.url), "utf8"),
).data;
const map: PeopleMap = JSON.parse(readFileSync(new URL("../maps/us.json", import.meta.url), "utf8"));

test("filtersOf turns the tools' conditions into PersonaGen filters", () => {
  assert.deepEqual(filtersOf("home_tenure=owned_outright|owned_with_a_mortgage,age_years=25..34"), {
    home_tenure: ["owned_outright", "owned_with_a_mortgage"],
    age_years: { min: 25, max: 34 },
  });
  assert.throws(() => filtersOf("home_tenure"), /field=value/);
});

test("a filter PersonaGen cannot pull by is named, with the way round it; any other refusal is passed on", () => {
  const body = {
    success: false,
    error: { code: "invalid_filters", issues: [{ field: "interests", message: "is not a filter field for UK" }] },
  };
  assert.equal(
    refusal(400, JSON.stringify(body)),
    "PersonaGen cannot pull by this: interests is not a filter field for UK. Pull by the other facts, and count this one among them with the people tool.",
  );
  assert.equal(refusal(503, "Service Unavailable"), "PersonaGen 503: Service Unavailable");
});

test("rowOf puts a persona into the map's form, value by value", () => {
  const row = rowOf(map.fields, persona);
  assert.equal(row.length, map.fields.length);
  const at = (name: string) => map.fields.findIndex((field) => field.name === name);
  assert.equal(row[at("age_years")], Number(persona.identity?.age_years));
  // Tenure is one value: its entry is a position. The persona gives a coded value as { code, title }, else the code.
  const tenure = map.fields[at("home_tenure")].values?.[row[at("home_tenure")] as number];
  const given = persona.home_and_travel?.home_tenure as { code?: string } | string;
  assert.equal(tenure?.code, String(typeof given === "object" ? given.code : given));
  assert.ok(Array.isArray(row[at("devices_used_to_go_online")]));
  const filled = row.filter((v) => v !== null && v !== -1 && !(Array.isArray(v) && !v.length)).length;
  assert.ok(filled > 0.8 * map.fields.length, `only ${filled} of ${map.fields.length} fields filled`);
});

test("pull sizes the audience, then draws in pages of up to 1,000 with the same filters", async () => {
  /** A request's body, as this test reads it. */
  type Body = { count: number; seed: string; filters: { age_years: { min: number } }; exclude_sections: string[] };
  const calls: { url: string; body: Body }[] = [];
  const send = async (url: string, request: { body: string }) => {
    const body: Body = JSON.parse(request.body);
    calls.push({ url, body });
    const json = url.endsWith("/validate")
      ? { estimated_share: "about 5%" }
      : { data: Array<Persona>(body.count).fill(persona) };
    return { ok: true, status: 200, json: async () => json, text: async () => "" };
  };
  const { check, people } = await pull({
    country: "us",
    filters: { age_years: { min: 25, max: 34 } },
    count: 1500,
    seed: "s",
    key: "k",
    send,
  });
  assert.equal(check.estimated_share, "about 5%");
  assert.equal(people.length, 1500);
  assert.deepEqual(
    calls.map((c) => c.body.count),
    [1000, 1000, 500],
  );
  assert.ok(
    calls
      .slice(1)
      .every((c) => c.body.filters.age_years.min === 25 && c.body.exclude_sections.includes("body_and_appearance")),
  );
  assert.notEqual(calls[1].body.seed, calls[2].body.seed);
});
