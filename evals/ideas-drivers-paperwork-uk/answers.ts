#!/usr/bin/env node
// Synthetic saved answers for this case's ideas scan, written by its seed: every value of the fields below for three
// offers, with leanings planted (no decision model is asked). The app draws people who are online daily with good
// digital skills, and the young; the phone clerk the oldest, the retired and the offline; the posted pack people with
// low household resources and social renters. Early adopters of new technology are keener on all three alike.
//
//   node answers.ts <dir>   writes <dir>/scan-<offer>.jsonl
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Field, PeopleMap } from "../../scripts/population.ts";
import { GENERAL_FIELDS, probesOf } from "../../scripts/scan-answers.ts";

const map: PeopleMap = JSON.parse(readFileSync(new URL("../../maps/uk.json", import.meta.url), "utf8"));
const FIELDS = [...GENERAL_FIELDS, "age_years", "economic_activity_status", "home_tenure"];
const logit = (p: number) => Math.log(p / (1 - p)),
  expit = (x: number) => 1 / (1 + Math.exp(-x));
const LEVEL = { app: 0.18, clerk: 0.12, pack: 0.1 };
const KEEN = {
  among_the_first_to_try_it: 1.0,
  soon_after_the_first_users: 0.5,
  when_most_people_have_it: 0,
  after_most_people_have_it: -0.5,
  last_or_never: -1.0,
};
// Leanings in log-odds by offer, field and code; a number field by its percentile (age: p10 is 24, p90 is 76).
const LEAN: Record<string, Record<string, Record<string, number>>> = {
  app: {
    new_technology_adoption: KEEN,
    internet_use_frequency: {
      daily_or_almost_daily: 0.6,
      at_least_weekly_not_daily: -0.6,
      less_than_weekly: -1.2,
      not_used_in_the_last_3_months: -2.0,
      never_used_the_internet: -2.6,
    },
    digital_skill_level: {
      above_basic_digital_skills: 0.9,
      basic_digital_skills: 0.2,
      low_digital_skills: -0.8,
      no_digital_skills_does_not_use_the_internet: -2.2,
    },
    age_years: { p10: 0.8, p25: 0.6, p50: 0, p75: -0.6, p90: -1.2 },
  },
  clerk: {
    new_technology_adoption: KEEN,
    age_years: { p10: -1.0, p25: -0.6, p50: 0, p75: 0.9, p90: 1.8 },
    economic_activity_status: { retired: 1.4, long_term_sick_or_disabled: 0.8, student_not_in_employment: -1.0 },
    internet_use_frequency: {
      daily_or_almost_daily: -0.3,
      less_than_weekly: 0.6,
      not_used_in_the_last_3_months: 1.0,
      never_used_the_internet: 1.4,
    },
    digital_skill_level: {
      above_basic_digital_skills: -0.3,
      low_digital_skills: 0.6,
      no_digital_skills_does_not_use_the_internet: 1.2,
    },
  },
  pack: {
    new_technology_adoption: KEEN,
    household_resource_context: {
      low_household_resources: 1.8,
      modest_household_resources: 0.7,
      high_household_resources: -0.8,
      very_high_household_resources: -1.2,
    },
    home_tenure: {
      rented_from_a_council_or_local_authority: 1.0,
      rented_from_a_housing_association_or_other_social_landlord: 1.0,
      rented_from_a_private_landlord_or_letting_agency: 0.3,
      owned_outright: -0.4,
    },
  },
};

const dir = process.argv[2];
if (!dir) {
  console.error("Usage: node answers.ts <dir>");
  process.exit(2);
}
mkdirSync(dir, { recursive: true });
let seed = 11;
const noise = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed / 2147483647 - 0.5) * 0.2;
};
for (const [offer, level] of Object.entries(LEVEL)) {
  const lines = [{ id: "base", r: 0, p: level, usd: 0, m: "gemini-decision-1" }];
  for (const name of FIELDS) {
    const field = map.fields.find((f) => f.name === name) as Field;
    for (const probe of probesOf(field)) {
      const key = field.quantiles ? /\((p\d+)\)/.exec(probe.code)![1] : probe.code;
      const lean = LEAN[offer][name]?.[key] ?? 0;
      lines.push({
        id: `${field.path}=${probe.code}`,
        r: 0,
        p: Number(expit(logit(level) + lean + noise()).toFixed(4)),
        usd: 0,
        m: "gemini-decision-1",
      });
    }
  }
  writeFileSync(join(dir, `scan-${offer}.jsonl`), `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`);
}
