import assert from "node:assert/strict";
import test from "node:test";
import { FIRM_FACT, ONE_PERSON, notAboutFirms, roleIn, sellsToBusinesses } from "./businesses.ts";
import { conditionsOf } from "./groups.ts";
import type { Field } from "./population.ts";

test("roles at work, and offers sold to businesses", () => {
  assert.ok(roleIn("employer_sector=self_employed_or_family_business,couple_status=x"));
  assert.ok(roleIn("work.purchasing_role_insurance=gives_final_sign_off_on_this"));
  assert.ok(!roleIn("age_years=18..34,home_tenure=owned_outright"));
  assert.ok(
    sellsToBusinesses(
      "Build the pricing page for our HR software for small businesses: £8 per employee a month, at least 5 seats.",
    ),
  );
  assert.ok(sellsToBusinesses("£8 per employee a month"));
  assert.ok(!sellsToBusinesses("Build the membership sign-up page for our gym. Twelve-month contract, £29 a month."));
  assert.ok(!sellsToBusinesses("a returns policy for our shop"));
});

test("firms are counted by facts about the firm; a fact about the person counts them in one-person businesses alone", () => {
  const field = (name: string, path: string, codes: string[]) => ({
    name,
    path,
    kind: "categorical",
    values: codes.map((code) => ({ code, label: code })),
  });
  // Fields as the map lists them, with only what conditionsOf reads.
  const fields = [
    field("organisation_size", "work.organisation_size", [ONE_PERSON, "fewer_than_10_employees", "10_to_49_employees"]),
    field("region", "place.region", ["north_west", "london"]),
    field("employer_industry_section", "work.employer_industry_section", ["F", "G"]),
    field("organisation_purchase_sign_off", "work.organisation_purchase_sign_off", ["me", "a_director_or_the_owner"]),
    field("purchasing_role_insurance", "work.purchasing_role_insurance", ["gives_final_sign_off_on_this"]),
    {
      name: "age_years",
      path: "identity.age_years",
      kind: "range",
      quantiles: { p50: 45 },
      range: { min: 18, max: 100 },
    },
  ] as Field[];
  const of = (text: string) => conditionsOf(fields, text.split(","));
  assert.deepEqual(
    notAboutFirms(of("organisation_size=10_to_49_employees,region=north_west,employer_industry_section=F")),
    [],
  );
  const off = (text: string) => notAboutFirms(of(text)).map((c) => c.path);
  assert.deepEqual(off("organisation_size=10_to_49_employees,age_years=25..34"), ["identity.age_years"]);
  assert.deepEqual(
    off(`organisation_size=${ONE_PERSON},age_years=55..100,purchasing_role_insurance=gives_final_sign_off_on_this`),
    [],
  );
  assert.deepEqual(off(`organisation_size=${ONE_PERSON}|fewer_than_10_employees,age_years=55..100`), [
    "identity.age_years",
  ]);
  assert.deepEqual(off(`organisation_size!=${ONE_PERSON},age_years=55..100`), ["identity.age_years"]);
  // Who signs off is answered from where each person sits ("me"), and a part in buying is a person's: neither counts firms.
  assert.deepEqual(off("organisation_purchase_sign_off=me"), ["work.organisation_purchase_sign_off"]);
  assert.deepEqual(off("purchasing_role_insurance=gives_final_sign_off_on_this"), ["work.purchasing_role_insurance"]);
  assert.ok(FIRM_FACT.test("place.settlement_name") && FIRM_FACT.test("work.employer_sector"));
});
