#!/usr/bin/env node
// Synthetic saved answers for this case's options scan, written by its seed: every value of the fields below for three
// versions, with leanings planted so that the best version changes from group to group (no decision model is asked).
// Cheaper leans to the young, renters, students and low incomes; weekly to parents and high incomes; the current
// price (base) to no one. Among parents it turns on income. A general keenness (new technology) moves all three alike.
//
//   node answers.ts <dir>   writes <dir>/scan-<version>.jsonl
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Field, PeopleMap } from "../../scripts/population.ts";
import { GENERAL_FIELDS, probesOf } from "../../scripts/scan-answers.ts";

const map: PeopleMap = JSON.parse(readFileSync(new URL("../../maps/us.json", import.meta.url), "utf8"));
const FIELDS = [
  ...GENERAL_FIELDS,
  "age_years",
  "own_dependent_children_at_home",
  "household_income_before_tax_per_year",
  "economic_activity_status",
  "home_tenure",
];
const logit = (p: number) => Math.log(p / (1 - p)),
  expit = (x: number) => 1 / (1 + Math.exp(-x));
const LEVEL = { base: 0.11, cheaper: 0.15, weekly: 0.14 };
const KEEN = {
  among_the_first_to_try_it: 0.8,
  soon_after_the_first_users: 0.4,
  when_most_people_have_it: 0,
  after_most_people_have_it: -0.4,
  last_or_never: -0.8,
};
// Leanings in log-odds by version, field and code; a number field by its percentile (age: p10 is 23, p90 is 74).
const LEAN: Record<string, Record<string, Record<string, number>>> = {
  base: { new_technology_adoption: KEEN },
  cheaper: {
    new_technology_adoption: KEEN,
    age_years: { p10: 1.5, p25: 0.7, p50: 0, p75: -0.5, p90: -0.8 },
    own_dependent_children_at_home: { 1: 0.4, 2: 0.4, 3: 0.4, 4: 0.4, 5: 0.4, "6_or_more": 0.4 },
    household_income_before_tax_per_year: {
      under_25000_usd: 1.6,
      "25000_to_49999_usd": 1.0,
      "50000_to_74999_usd": 0.4,
      "100000_to_149999_usd": -0.3,
      "150000_to_199999_usd": -0.8,
      "200000_usd_or_more": -1.2,
    },
    economic_activity_status: { student_not_in_employment: 2.0, unemployed_and_looking_for_work: 1.0, retired: -0.8 },
    home_tenure: {
      rented_without_government_housing_assistance: 0.8,
      rented_with_government_housing_assistance: 0.8,
      owned_free_and_clear: -0.5,
    },
  },
  weekly: {
    new_technology_adoption: KEEN,
    age_years: { p10: -0.4, p25: 0.6, p50: 0.8, p75: -0.3, p90: -1.2 },
    own_dependent_children_at_home: { 0: -0.5, 1: 2.0, 2: 2.4, 3: 2.6, 4: 2.6, 5: 2.6, "6_or_more": 2.6 },
    household_income_before_tax_per_year: {
      under_25000_usd: -1.4,
      "25000_to_49999_usd": -0.8,
      "75000_to_99999_usd": 0.4,
      "100000_to_149999_usd": 0.9,
      "150000_to_199999_usd": 1.4,
      "200000_usd_or_more": 1.8,
    },
    economic_activity_status: { in_employment: 0.5, student_not_in_employment: -1.0, retired: -1.0 },
  },
};

const dir = process.argv[2];
if (!dir) {
  console.error("Usage: node answers.ts <dir>");
  process.exit(2);
}
mkdirSync(dir, { recursive: true });
let seed = 7;
const noise = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed / 2147483647 - 0.5) * 0.2;
};
for (const [version, level] of Object.entries(LEVEL)) {
  const lines = [{ id: "base", r: 0, p: level, usd: 0, m: "gemini-decision-1" }];
  for (const name of FIELDS) {
    const field = map.fields.find((f) => f.name === name) as Field;
    for (const probe of probesOf(field)) {
      const key = field.quantiles ? /\((p\d+)\)/.exec(probe.code)![1] : probe.code;
      const lean = LEAN[version][name]?.[key] ?? 0;
      lines.push({
        id: `${field.path}=${probe.code}`,
        r: 0,
        p: Number(expit(logit(level) + lean + noise()).toFixed(4)),
        usd: 0,
        m: "gemini-decision-1",
      });
    }
  }
  writeFileSync(join(dir, `scan-${version}.jsonl`), `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`);
}
