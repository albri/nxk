#!/usr/bin/env node
// Builds the two static files nxk reads for a country, from PersonaGen:
//   maps/<country>.json            every fact recorded about people, its values and the share of adults holding each
//   maps/<country>-people.bin.gz   the generated people, reduced to those facts and packed (scripts/population.ts)
// Run it when PersonaGen publishes a new release. Nothing else in nxk calls PersonaGen, except people_pull.
//
//   node scripts/build-maps.ts uk --personas=uk-personas.jsonl.gz --from="v4/line 0f1086d0f" --evidence=<engine>/evidence
//     public personas written by a local build of the engine, one JSON line each (the maps here hold 200,000 a country);
//     --from records the engine version in the map's source; --evidence is that engine's evidence folder, for
//     `occupation_ties` below; --out=<folder> writes somewhere other than maps/, and --catalogue=<file> reads the
//     catalogue from a file rather than from PersonaGen (both for test builds).
//
// What goes in the map:
//   - every field with a list of values, except appearance and names, with every value anyone holds;
//   - a long list (occupations, industries, countries of birth, health conditions, interests) runs from the most held
//     value to the least, and `common` says how many come first because 1% of adults or more hold them (3% for a
//     specific interest): a scan asks about those alone, so the rest of the list adds nothing to its cost. Keeping
//     only those would leave most people with a specific interest, and most workers with an occupation, that the map
//     does not list;
//   - places (region or US state, local authority or county, town) in the catalogue's order;
//   - interests, which the catalogue does not list, counted from the people: families and specific interests;
//   - no job titles or other free text;
//   - a numeric field as five points along its range;
//   - not as a field but as `firms`, the firm weight (work.firm_weight: 1 divided by the number of people at the
//     person's employer, none outside work), which the packed people keep for each person: summed over people it
//     counts firms (scripts/population.ts firmsAmong). It is no fact about a person to filter or scan by;
//   - as `occupation_ties`, from the engine's evidence: the facts PersonaGen ties to occupation only by broad group of
//     jobs (shift work by major group, in the UK), so that a count of one occupation's shift workers says it is the
//     broad group's rate (scripts/occupation-ties.ts). Without --evidence the map has none, and no count warns.
// Every share is the share of all adults holding the value, counted from the generated people, so that fields can be
// compared; the catalogue's own share, which is of the field's universe, is kept beside it.
import { createReadStream, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { argsOf, isMain } from "./cli.ts";
import { percent } from "./format.ts";
import { readEvidence, tiesFrom } from "./occupation-ties.ts";
import { loadCatalogue } from "./personagen-catalogue.ts";
import {
  packer,
  type Field,
  type FieldValue,
  type InterestAs,
  type ListedField,
  type MapFirms,
  type MapSource,
  type NumericField,
  type NumericRange,
  type PeopleMap,
  type PersonaGenVersions,
  type Quantiles,
  type Tier,
} from "./population.ts";

/** PersonaGen's catalogue of a country (scripts/personagen-catalogue.ts fetches it): its versions, its fields by group. */
interface Catalogue {
  contract: PersonaGenVersions;
  groups: { group: string; fields: CatalogueField[] }[];
}

/** A field as the catalogue lists it: a number's range and quantiles, or its values, or neither (free text). */
interface CatalogueField {
  name: string;
  path: string;
  group: string;
  kind: string;
  tier: string;
  meaning: string;
  range?: NumericRange;
  quantiles?: Quantiles;
  values?: CatalogueValue[];
}

/** A value as the catalogue lists it, with its share of the field's universe (of people in work, for a work field). */
interface CatalogueValue {
  code: string | number;
  label: string;
  share?: string;
}

/** An object a persona holds as a fact: a coded value ({ code, title }), or another record. */
interface FactRecord {
  code?: string | number;
  [key: string]: unknown;
}

/** A fact about a persona as PersonaGen writes it: a value, a coded value, a list of them, or nothing. */
type Fact = string | number | boolean | null | undefined | FactRecord | Fact[];

/** A public persona as PersonaGen writes it, one JSON line: its facts by group, and its interests. */
interface Persona {
  interests?: {
    /** The specific main interests, each with its family. */
    interests?: { family: string; specific: string }[];
    interest_families?: string[];
    interest_participation?: string[];
  };
  [group: string]: Record<string, Fact> | undefined;
}

/** How many people hold each code of a field. */
type Counts = Map<string, number>;

const SKIP_GROUPS = new Set(["body_and_appearance", "name_and_summary"]);
// The firm weight is kept apart from the fields (`firms` below).
const FIRM = "firm_weight";
const SKIP_FIELDS = new Set(["birth_year", "interest_count", FIRM]);
// Places stay in the catalogue's order with no common values: they are what a local audience is counted by, not facts
// a scan asks about one by one. Cut at 1% of adults, the US would keep 29 of its 51 states and leave 11% of its
// people with none.
const PLACES = new Set(["region", "county_or_local_authority", "settlement_name"]);
// Fields whose values are a scale. The map gives their `order` (lowest or first to last), leaving out the values off the
// scale (not in work, no children at home), so that a condition can take a range of codes: income=30000_to_39999_gbp..150000_gbp_or_more.
// The catalogue lists most scales in order; values that are counts are put in number order, and a few are given here.
const ORDERED = new Set([
  "years_living_in_the_country",
  "english_speaking_ability",
  "settlement_size",
  "neighborhood_type",
  "people_in_household",
  "adults_in_paid_work_in_household",
  "children_ever_had",
  "own_dependent_children_at_home",
  "own_adult_children_at_home",
  "youngest_dependent_child_age",
  "oldest_dependent_child_age",
  "unpaid_care_hours_per_week",
  "years_at_current_address",
  "pets_in_household_count",
  "vehicles_in_household",
  "highest_qualification",
  "higher_education_qualification",
  "parents_highest_qualification",
  "parents_occupational_class_at_age_14",
  "usual_weekly_hours_worked",
  "organisation_size",
  "shift_work",
  "management_responsibility",
  "job_level",
  "years_with_current_employer",
  "decision_role",
  "personal_income_before_tax_per_year",
  "household_income_before_tax_per_year",
  "household_resource_context",
  "social_grade",
  "mortgage_balance_outstanding",
  "unsecured_debt_excluding_student_loans",
  "student_loan_balance",
  "managing_financially",
  "general_health",
  "day_to_day_activities_limited_by_health",
  "physical_activity_per_week",
  "hours_sitting_on_a_usual_day",
  "internet_use_frequency",
  "digital_skill_level",
  "social_media_use_frequency",
  "social_media_platforms_used_count",
  "social_media_posting",
  "confidence_using_digital_devices_and_apps",
  "changes_online_privacy_settings",
  "new_technology_adoption",
  "compares_prices_before_buying",
  "usual_channel_for_non_food_shopping",
  "buys_more_when_items_are_on_promotion",
  "says_advertising_influences_what_they_buy",
  "financial_risk_tolerance",
  "financial_planning_horizon",
  "importance_of_religion",
  "political_ideology",
  "interest_in_politics",
  "big_five_openness_quintile",
  "big_five_conscientiousness_quintile",
  "big_five_extraversion_quintile",
  "big_five_agreeableness_quintile",
  "big_five_neuroticism_quintile",
  "literacy_proficiency",
  "numeracy_proficiency",
  "adaptive_problem_solving_proficiency",
]);
const PURCHASING = /^purchasing_role_/;
const OFF_SCALE =
  /^(not_in_employment|not_applicable|no_dependent_children_at_home|no_mortgage|organisation_does_not_buy_this|does_not_place_themselves|born_in_the_country|other_or_foreign_qualification.*|self_employed_or_not_in_employment|former_user_has_stopped)$/;
const GIVEN_ORDER: Record<string, string[]> = {
  digital_skill_level: [
    "no_digital_skills_does_not_use_the_internet",
    "low_digital_skills",
    "basic_digital_skills",
    "above_basic_digital_skills",
  ],
};

/**
 * A value's label as the map keeps it. The catalogue labels a buying role the same way in each of its twelve fields
 * ("Gives final sign-off on purchases of this"), and how an organisation buys without saying so ("The owner or one
 * person decides"), so in a corner's name beside other facts ("Gives final sign-off on purchases of this + Living
 * comfortably") it would not say of what.
 */
export function labelOf(name: string, label: string): string {
  if (typeof label !== "string") return label;
  if (PURCHASING.test(name)) {
    const what = name
      .replace(PURCHASING, "")
      .split("_")
      .map((w) => ({ saas: "SaaS", it: "IT" })[w] ?? w)
      .join(" ");
    return /\bthis\b/.test(label) ? label.replace(/\bthis\b/, what) : `${label} (${what})`;
  }
  if (name === "organisation_purchasing_process") return `${label} (how their organisation buys)`;
  return label;
}

/** The scale of an ordered field, from its codes as the map keeps them, or null. */
export function orderOf(name: string, codes: string[]): string[] | null {
  if (!ORDERED.has(name) && !PURCHASING.test(name)) return null;
  if (GIVEN_ORDER[name]) return GIVEN_ORDER[name].filter((code) => codes.includes(code));
  const on = codes.filter((code) => !OFF_SCALE.test(code));
  return on.every((code) => /^\d/.test(code))
    ? [...on].sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10))
    : on;
}
const SHORT = 30,
  COMMON = 0.01,
  COMMON_INTEREST = 0.03;
const { positionals, flags } = argsOf(process.argv.slice(2));
const countries = positionals.filter((c) => ["uk", "us"].includes(c));
const flag = (name: string) => flags[name] || null;
const PERSONAS = flag("personas"),
  FROM = flag("from"),
  CATALOGUE = flag("catalogue"),
  EVIDENCE = flag("evidence");
const main = isMain(import.meta.url);
if (main && (countries.length !== 1 || !PERSONAS)) {
  console.error(
    [
      "Usage: node scripts/build-maps.ts <uk|us> --personas=<one public persona a line, gzipped or not>",
      "[--from=<engine version>] [--evidence=<the engine's evidence folder>] [--out=<folder>] [--catalogue=<file>]",
    ].join(" "),
  );
  process.exit(2);
}
const OUT = flag("out");
const dir = OUT ? `${OUT.replace(/\/$/, "")}/` : fileURLToPath(new URL("../maps/", import.meta.url));
if (main) mkdirSync(dir, { recursive: true });
/** A share as the map keeps it: a whole percentage, or "<1%". */
const mapShare = (x: number) => (x < 0.01 ? "<1%" : percent(x));
const codeOf = (v: Fact) => (v !== null && typeof v === "object" && !Array.isArray(v) ? String(v.code) : String(v));

/**
 * A long list's values as the map keeps them: every one held by anyone, the most held first, and `common`, how many
 * of those are held by `cut` of adults or more. `values` are [{ share, ... }], shares of all adults.
 */
export function longList<V extends { share: number }>(values: V[], cut: number): { values: V[]; common: number } {
  const held = values.filter((v) => v.share > 0).sort((a, b) => b.share - a.share);
  return { values: held, common: held.filter((v) => v.share >= cut).length };
}

/** The firm weights counted over `n` people: their sum, how many hold one, and the people in work by employer sector. */
interface FirmCounts {
  sum: number;
  held: number;
  n: number;
  sectors?: { label: string; held: number; none: number }[];
}

/**
 * The map's `firms`: what the firm weight is (the catalogue's `field`), the firms an adult stands for on average (the
 * sum of the weights over the `n` people; times a country's adults, its firms), the share of adults with a weight,
 * and the employer sectors whose people mostly have none (US government: no firm stands for them). `sectors` are
 * the people in work in each sector with a weight and with none. Null without the field.
 */
export function firmsOf(
  field: { path: string; meaning: string } | null,
  { sum, held, n, sectors = [] }: FirmCounts,
): MapFirms | null {
  if (!field || !n) return null;
  return {
    path: field.path,
    meaning: field.meaning,
    per_adult: Number((sum / n).toPrecision(6)),
    held: mapShare(held / n),
    not_counted: sectors.filter((s) => s.none > 0.9 * (s.held + s.none)).map((s) => s.label),
  };
}

if (main)
  for (const country of countries) {
    const catalogue: Catalogue = JSON.parse(
      CATALOGUE ? readFileSync(CATALOGUE, "utf8") : await loadCatalogue(country, { refresh: true }),
    );
    // The file is read twice, one person at a time (to count values, then to pack them), so 200,000 people never sit in
    // memory as JSON.
    // The usage check above has given up without a personas file.
    const each = () => linesOf(PERSONAS as string);
    const valueOf = (person: Persona, field: { group: string; name: string }) => person[field.group]?.[field.name];
    const specifics = (person: Persona) => (person.interests?.interests ?? []).map((i) => i.specific);
    const families = (person: Persona) => person.interests?.interest_families ?? [];
    const participation = (person: Persona) => person.interests?.interest_participation ?? [];
    // The family of each specific interest, read from the people's own interests as they pass.
    const familyOf = new Map<string, string>();

    // How often each value of each field occurs among the generated people (a person counts once per value): one pass.
    const catalogued = catalogue.groups
      .flatMap((group) => group.fields)
      .filter((field) => !SKIP_GROUPS.has(field.group) && !SKIP_FIELDS.has(field.name) && field.group !== "interests");
    // Every name counted has its counts from here: a field's name, or one of the interests' three.
    const counts = new Map<string, Counts>([
      ...catalogued.map((field): [string, Counts] => [field.name, new Map()]),
      ["interest_families", new Map()],
      ["interest_participation", new Map()],
      ["interests", new Map()],
    ]);
    // `most` is the most values of a field one person holds, which a long list needs to be packed.
    const most = new Map<string, number>();
    const add = (name: string, raw: Fact) => {
      const seen = counts.get(name) as Counts,
        codes = new Set(
          [raw]
            .flat()
            .filter((v) => v !== null && v !== undefined)
            .map(codeOf),
        );
      for (const code of codes) seen.set(code, (seen.get(code) ?? 0) + 1);
      most.set(name, Math.max(most.get(name) ?? 0, codes.size));
    };
    // The firm weight, when the catalogue has it: its sum, how many hold one, and, by employer sector, how many in work
    // hold one and how many do not.
    const allFields = catalogue.groups.flatMap((group) => group.fields);
    const firmField = allFields.find((field) => field.name === FIRM) ?? null;
    const sectorField = allFields.find((field) => field.name === "employer_sector") ?? null;
    const firmOf = (person: Persona) => {
      const w = firmField ? valueOf(person, firmField) : null;
      return w === null || w === undefined || w === "" || !Number.isFinite(Number(w)) ? null : Number(w);
    };
    const firm = { sum: 0, held: 0, sectors: new Map<string, { held: number; none: number }>() };
    let n = 0;
    for await (const person of each()) {
      n++;
      const w = firmOf(person);
      if (w !== null) {
        firm.sum += w;
        firm.held++;
      }
      const sector = sectorField ? codeOf(valueOf(person, sectorField)) : null;
      if (sector && !["null", "undefined", "not_in_employment"].includes(sector)) {
        const s = firm.sectors.get(sector) ?? { held: 0, none: 0 };
        s[w === null ? "none" : "held"]++;
        firm.sectors.set(sector, s);
      }
      for (const entry of person.interests?.interests ?? []) familyOf.set(entry.specific, entry.family);
      for (const field of catalogued) add(field.name, valueOf(person, field));
      add("interest_families", families(person));
      add("interest_participation", participation(person));
      add("interests", specifics(person));
    }

    // The catalogue gives a number the kind "range", and a field of values its own kind: they are pushed as such.
    const fields: Field[] = [];
    for (const field of catalogued) {
      const head = {
        name: field.name,
        path: field.path,
        group: field.group,
        kind: field.kind,
        tier: field.tier,
        meaning: field.meaning,
      };
      if (field.range && field.quantiles) {
        fields.push({ ...head, range: field.range, quantiles: field.quantiles } as NumericField);
        continue;
      }
      if (!Array.isArray(field.values) || field.values.length < 2) continue;
      const seen = counts.get(field.name) as Counts;
      // Every share is of all adults, counted from the generated people, so that shares in different fields can be
      // compared. The catalogue's own figure is kept beside it: that one is a share of the field's universe (of people
      // in work, for a work field).
      const values = field.values.map((v) => ({
        code: String(v.code),
        label: labelOf(field.name, v.label),
        share: (seen.get(String(v.code)) ?? 0) / n,
        universe: v.share,
      }));
      const long = field.values.length > SHORT && !PLACES.has(field.name) ? longList(values, COMMON) : null;
      const keep = field.values.length <= SHORT ? values : long ? long.values : values.filter((v) => v.share > 0);
      if (keep.length < 2) continue;
      fields.push({
        ...head,
        ...(long ? { common: long.common } : {}),
        ...(orderOf(
          field.name,
          keep.map((v) => v.code),
        )
          ? {
              order: orderOf(
                field.name,
                keep.map((v) => v.code),
              ),
            }
          : {}),
        values: keep.map((v) => ({
          code: v.code,
          label: v.label,
          share: mapShare(v.share),
          ...(v.universe ? { share_of_universe: v.universe } : {}),
          // A coded field appears in a profile as its code and title together.
          ...(field.kind === "coded" ? { as: { code: v.code, title: v.label } } : {}),
        })),
      } as ListedField);
    }
    // Interests: the catalogue lists no values, so they are counted from the generated people.
    const words = (code: string) => code.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
    // The catalogue lists interests as a field with no values, for its tier.
    const tier = catalogue.groups.flatMap((group) => group.fields).find((f) => f.name === "interests")?.tier as Tier;
    const interestField = (
      name: string,
      meaning: string,
      seen: Counts,
      as: ((code: string) => InterestAs[]) | null,
      cut: number,
    ): ListedField => {
      const long = longList(
        [...seen].map(([code, c]) => ({ code, share: c / n })),
        cut,
      );
      return {
        name,
        path: `interests.${name}`,
        group: "interests",
        kind: "list",
        tier,
        meaning,
        common: long.common,
        values: long.values.map(({ code, share }): FieldValue => ({
          code,
          label: words(code),
          share: mapShare(share),
          ...(as ? { as: as(code) } : {}),
        })),
      };
    };
    fields.push(
      interestField(
        "interest_families",
        "The families of interest that are among the person's main interests.",
        counts.get("interest_families") as Counts,
        null,
        COMMON,
      ),
    );
    fields.push(
      interestField(
        "interest_participation",
        "The families of activity the person takes part in at all.",
        counts.get("interest_participation") as Counts,
        null,
        COMMON,
      ),
    );
    fields.push(
      interestField(
        "interests",
        "A specific main interest of the person.",
        counts.get("interests") as Counts,
        (code) => [{ family: familyOf.get(code), specific: code, intensity: "regular" }],
        COMMON_INTEREST,
      ),
    );

    const source: MapSource = {
      name: "PersonaGen catalogue and generated people",
      ...catalogue.contract,
      people: n,
      people_from:
        "public personas written by a local build of the engine, which may be newer than the catalogue's version",
      ...(FROM ? { engine: FROM } : {}),
      shares: `of all adults, counted from ${n} generated people`,
      built: new Date().toISOString().slice(0, 10),
    };
    const sectorLabel = (code: string) => sectorField?.values?.find((v) => String(v.code) === code)?.label ?? code;
    const firms = firmsOf(firmField, {
      sum: firm.sum,
      held: firm.held,
      n,
      sectors: [...firm.sectors].map(([code, s]) => ({ label: sectorLabel(code), ...s })),
    });
    const ties = EVIDENCE ? tiesFrom(readEvidence(EVIDENCE, country), fields) : null;
    writeFileSync(
      `${dir}${country}.json`,
      `${JSON.stringify({ country, source, fields, ...(firms ? { firms } : {}), ...(ties ? { occupation_ties: ties } : {}) } satisfies PeopleMap, null, 1)}\n`,
    );

    // The people, reduced to the map's fields and packed (scripts/population.ts): a value as its position in the field's
    // list, -1 when it is not listed, and the firm weight after them. Codes the catalogue does not list are counted and
    // reported.
    const index = fields.map((field) => new Map((field.values ?? []).map((v, i): [string, number] => [v.code, i])));
    const unlisted = new Map<string, number>();
    const pack = packer(fields, n, {
      most: Object.fromEntries(fields.map((field, f): [number, number] => [f, most.get(field.name) ?? 0])),
      firm: Boolean(firms),
    });
    let i = 0;
    for await (const person of each()) {
      pack.put(
        i++,
        fields.map((field, f) => {
          const raw =
            field.name === "interests"
              ? specifics(person)
              : field.name === "interest_families"
                ? families(person)
                : field.name === "interest_participation"
                  ? participation(person)
                  : valueOf(person, field);
          if (field.quantiles)
            return raw !== null && raw !== undefined && raw !== "" && Number.isFinite(Number(raw)) ? Number(raw) : null;
          const position = (v: Fact) => {
            const at = index[f].get(codeOf(v));
            if (at === undefined) unlisted.set(field.name, (unlisted.get(field.name) ?? 0) + 1);
            return at ?? -1;
          };
          if (Array.isArray(raw)) return raw.map(position).filter((at) => at >= 0);
          return raw === null || raw === undefined ? null : position(raw);
        }),
        firmOf(person),
      );
    }
    const packed = pack.finish({ country, source });
    writeFileSync(`${dir}${country}-people.bin.gz`, packed);
    const total = fields.reduce((sum, field) => sum + (field.values?.length ?? 5), 0);
    console.log(
      `${country}: ${fields.length} fields, ${total} values; ${n} people (${Math.round(packed.length / 1024)} KB); generator ${catalogue.contract.generator_version}`,
    );
    console.log(
      firms
        ? `  firms: ${firms.per_adult} an adult, a weight held by ${firms.held} of adults${firms.not_counted.length ? `; not counted as firms: ${firms.not_counted.join(", ")}` : ""}`
        : `  no ${FIRM} in the catalogue: the people carry no firm weights, and firms cannot be counted`,
    );
    console.log(
      ties
        ? `  tied to occupation only by broad group: ${Object.keys(ties.facts).join(", ") || "nothing"}`
        : "  no --evidence: the map does not say which facts PersonaGen ties to occupation only by broad group, so no count warns of them",
    );
    if (unlisted.size)
      console.log(
        `  codes the catalogue does not list (person counts): ${[...unlisted].map(([name, c]) => `${name} ${c}`).join(", ")}`,
      );
  }

/** The people in a file of JSON lines, gzipped or not, one at a time. */
async function* linesOf(file: string): AsyncGenerator<Persona> {
  const input = createReadStream(file);
  const lines = createInterface({
    input: file.endsWith(".gz") ? input.pipe(createGunzip()) : input,
    crlfDelay: Infinity,
  });
  for await (const line of lines) if (line.trim()) yield JSON.parse(line);
}
