#!/usr/bin/env node
// Who else is in the room: the groups the person you pictured doesn't cover, across every fact PersonaGen records about
// a person. Each is a set of people the work isn't speaking to: possible customers first, and where a choice stops
// them, a cost. The agent does not choose where to look: every field of the country's map is counted, and the results
// are sorted under seven lenses taken from product, finance and marketing practice, each with the questions to ask of
// the groups it shows. No request is made and it costs nothing.
//
//   node scripts/sweep.ts --country=uk --pictured=age_years=25..44,economic_activity_status=in_employment
//   node scripts/sweep.ts --country=us --pictured=... --among="fitness_or_sports_club_membership=member_of_a_gym_or_fitness_club_only|member_of_both"
//
//   --pictured  the person you had in mind, as facts: conditions joined by commas, all of which hold
//   --among     the audience the owner named, in place of all adults (same form)
//   --top=3     lines a lens (the last lens, everything else, gets two more)
//   --min=5     the smallest group to show, in every 100 of the audience
//   --people    another people file of the same form (from scripts/pull.ts), in place of the shipped one
//
// Each line is a group: how many in every 100 of the audience belong to it, and how many in every 100 of the people
// like the one you pictured. The groups shown are the largest ones your picture doesn't cover.
import { biggerDraw } from "./decision-model.ts";
import { argsOf, cli, usageExit, type Out, type RunContext } from "./cli.ts";
import { asWords, per100, shorten, tierLabel, unbracketed } from "./format.ts";
import { conditionsOf, describeConditions, giveOrTake, matches, type Condition } from "./groups.ts";
import { openLog } from "./log.ts";
import { broadLines } from "./occupation-ties.ts";
import {
  countsByField,
  holds,
  loadPeople,
  numberAt,
  packedList,
  shareOf,
  type Field,
  type Row,
  type Tier,
} from "./population.ts";

/** A lens: its heading, the question to answer for the groups it shows, and the fields it names. */
export interface Lens {
  title: string;
  question: string;
  fields: string[];
}

/**
 * The lenses, in the order a choice meets them. A field belongs to the first lens that names it; every field no lens
 * names is still counted, under the last one. The questions are the ones to answer for the groups a lens shows.
 */
export const LENSES: Lens[] = [
  {
    title: "Money: what they can pay, and when",
    question:
      "Is there a price, a plan or a time to pay that would bring them in? Does a charge the work sets stop them, or catch them out?",
    fields: [
      "could_cover_an_unexpected_expense",
      "managing_financially",
      "household_resource_context",
      "main_source_of_personal_income",
      "employment_contract_type",
      "unsecured_debt_excluding_student_loans",
      "personal_income_before_tax_per_year",
      "household_income_before_tax_per_year",
      "financial_planning_horizon",
      "social_grade",
      "student_loan_balance",
      "mortgage_balance_outstanding",
    ],
  },
  {
    title: "Access: how they would get to it",
    question:
      "What way in would reach them: a device, a place, a language, help? Does the work assume something they don't have?",
    fields: [
      "devices_used_to_go_online",
      "internet_use_frequency",
      "confidence_using_digital_devices_and_apps",
      "digital_skill_level",
      "online_activities_last_3_months",
      "serious_functional_difficulties",
      "day_to_day_activities_limited_by_health",
      "english_speaking_ability",
      "main_language",
      "literacy_proficiency",
      "numeracy_proficiency",
      "adaptive_problem_solving_proficiency",
      "has_full_driving_licence",
      "vehicles_in_household",
      "main_travel_mode_for_everyday_trips",
      "settlement_size",
    ],
  },
  {
    title: "Time: when they could come",
    question:
      "When in their week are they free for this, and is the work offering that time? How long may it take, and can they stop and come back?",
    fields: [
      "usual_weekly_hours_worked",
      "shift_work",
      "unpaid_care_hours_per_week",
      "own_dependent_children_at_home",
      "youngest_dependent_child_age",
      "usual_work_location",
      "workplace_fixed_or_mobile",
      "commute_pattern",
      "full_time_or_part_time",
      "economic_activity_status",
    ],
  },
  {
    title: "Who decides, who pays, who uses it",
    question:
      "Is the person on the page the one who decides, pays and uses it? Who else has a say, and could the work speak to them too?",
    fields: [
      "household_type",
      "people_in_household",
      "couple_status",
      "position_in_household",
      "adults_in_paid_work_in_household",
      "own_adult_children_at_home",
      "legal_marital_status",
      "decision_role",
      "management_responsibility",
      "organisation_size",
    ],
  },
  {
    title: "What starts the need",
    question:
      "What has just happened in their life that makes this matter now, and could the work meet them at that moment?",
    fields: [
      "life_stage",
      "years_at_current_address",
      "years_living_in_the_country",
      "current_education_enrolment",
      "when_last_worked",
      "home_tenure",
      "accommodation_type",
      "home_improvement_work_last_2_years",
      "pets_in_household",
      "has_long_term_condition",
      "long_term_health_conditions",
      "general_health",
    ],
  },
  {
    title: "How they hear of it and choose",
    question: "Where would they first hear of this, how do they compare, and what makes them act?",
    fields: [
      "preferred_way_for_companies_to_contact_them",
      "usual_channel_for_non_food_shopping",
      "compares_prices_before_buying",
      "brand_choice_when_shopping",
      "buys_more_when_items_are_on_promotion",
      "reads_product_details_before_buying",
      "says_advertising_influences_what_they_buy",
      "social_media_use_frequency",
      "social_media_platforms_used_count",
      "social_media_posting",
    ],
  },
  {
    title: "Risk and trust",
    question: "What does trying this risk for them, what would they need to see first, and who do they trust?",
    fields: [
      "financial_risk_tolerance",
      "new_technology_adoption",
      "changes_online_privacy_settings",
      "big_five_neuroticism_quintile",
      "big_five_openness_quintile",
      "big_five_conscientiousness_quintile",
      "big_five_agreeableness_quintile",
      "big_five_extraversion_quintile",
    ],
  },
  {
    title: "Everything else",
    question:
      "Could the work speak to any of these too, or does it get them wrong: the words, the pictures, the examples, the assumptions?",
    fields: [],
  },
];

// Values that only say a field does not apply ("Not in employment" under every work field) repeat another field.
const PLACEHOLDER = /^(not_applicable|not_in_employment$|self_employed_or_not_in_employment$)/;
const short = (label: string) => shorten(unbracketed(label), 70);

/** A group one field makes: its label, the value's position when it is one listed value, and who is in it. */
export interface FieldGroup {
  label: string;
  v?: number;
  test: (row: Row) => boolean;
}

/**
 * The groups one field makes. A listed value is a group; a listed thing that 70% or more of adults have also makes a
 * group of those who do not list it ("smartphone not among devices used to go online"); a number is cut into bands
 * between the points of its range the map records.
 */
export function groupsOf(field: Field, f: number): FieldGroup[] {
  if (field.quantiles) {
    const points = Object.values(field.quantiles)
      .map(Number)
      .sort((a, b) => a - b);
    const cuts = points.slice(1).map((p, i) => (points[i] + p) / 2);
    return points.map((_, i) => {
      const low = i ? cuts[i - 1] : -Infinity,
        high = i < cuts.length ? cuts[i] : Infinity;
      const from = Number.isFinite(low) ? Math.ceil(low) : points[0],
        to = Number.isFinite(high) ? Math.ceil(high) - 1 : points.at(-1);
      return {
        label: `${asWords(field.name)} ${from === to ? from : `${from} to ${to}`}`,
        test: (row) => {
          const x = numberAt(row, f);
          return x !== null && x >= low && x < high;
        },
      };
    });
  }
  const out = (field.values ?? []).flatMap((value, v): FieldGroup[] =>
    PLACEHOLDER.test(String(value.code))
      ? []
      : [{ label: short(value.label ?? value.code), v, test: (row) => holds(field, row, f, v) }],
  );
  if (field.kind === "list") {
    (field.values ?? []).forEach((value, v) => {
      if ((shareOf(value.share) ?? 0) < 0.7) return;
      const label = short(value.label ?? value.code);
      out.push({
        label: `${label} not among ${asWords(field.name)}`,
        test: (row) => (Array.isArray(row[f]) || packedList(field)) && !holds(field, row, f, v),
      });
    });
  }
  return out;
}

/**
 * A group as the sweep counts it: the lens and field it comes under, its shares of the audience (`aud`) and of the
 * pictured people (`pic`), and whether it only restates the picture.
 */
export interface SweepLine {
  /** The lens's position in LENSES. */
  lens: number;
  field: string;
  path: string;
  tier: Tier;
  label: string;
  aud: number;
  pic: number;
  restates: boolean;
}

/**
 * Every group of every field, counted in the audience and among the pictured people. `audience` and `pictured` are
 * lists of rows; `conditions` are the picture's own conditions. A group that one of those conditions shuts out almost
 * entirely (retired people, when the picture said "in work") only restates the picture and is marked `restates`.
 */
export function sweep(
  fields: Field[],
  audience: Row[],
  pictured: Row[],
  { skip = new Set(), conditions = [] }: { skip?: Set<string>; conditions?: Condition[] } = {},
): SweepLine[] {
  const lensOf = new Map<string, number>();
  LENSES.forEach((lens, l) =>
    lens.fields.forEach((name) => {
      if (!lensOf.has(name)) lensOf.set(name, l);
    }),
  );
  const lines: SweepLine[] = [];
  // Listed values are counted for every field in one pass over the people; numbers and "not among" groups are tested
  // one by one.
  const audCounts = countsByField(fields, audience),
    picCounts = countsByField(fields, pictured);
  const conditionCounts = conditions.map((c) => countsByField(fields, audience.filter(c.test)));
  fields.forEach((field, f) => {
    // Place names are not a lens: a town is too small a group to show. A long list with common values (occupations,
    // interests) is, but only its values held by 1 in 100 of the audience or more: no rarer one could be shown.
    const long = (field.values?.length ?? 0) > 60;
    if (skip.has(field.path) || (long && field.common === undefined)) return;
    const inAud = audCounts[f],
      inPic = picCounts[f],
      inCondition = conditionCounts.map((counts) => counts[f]);
    for (const group of groupsOf(field, f)) {
      if (long && group.v !== undefined && inAud[group.v] < 0.01 * audience.length) continue;
      let n: number, pic: number, restates: boolean;
      const v = group.v;
      if (v !== undefined) {
        n = inAud[v];
        pic = pictured.length ? inPic[v] / pictured.length : 0;
        restates = n > 0 && inCondition.some((counts) => counts[v] / n < 0.03);
      } else {
        const members = audience.filter(group.test);
        n = members.length;
        pic = pictured.length ? pictured.filter(group.test).length / pictured.length : 0;
        restates = n > 0 && conditions.some((c) => members.filter(c.test).length / n < 0.03);
      }
      lines.push({
        lens: lensOf.get(field.name) ?? LENSES.length - 1,
        field: field.name,
        path: field.path,
        tier: field.tier,
        label: group.label,
        aud: n / audience.length,
        pic,
        restates,
      });
    }
  });
  return lines;
}

/**
 * The lines worth showing under each lens: groups of at least `min` of the audience that the picture holds at least
 * `gap` less of, one line a field, and no line that repeats another's figures (the same people named twice) or only
 * restates the picture. They are ranked by gap times how much of the group the picture misses (gap squared over the
 * group's share), so a group the picture nearly leaves out comes before a large one it merely holds less of.
 */
export function leftOut(
  lines: SweepLine[],
  { min = 0.05, gap = 0.05, top = 3, extra = 2 }: { min?: number; gap?: number; top?: number; extra?: number } = {},
): SweepLine[][] {
  const shown: SweepLine[][] = LENSES.map(() => []);
  const seen = new Set<string>(),
    perField = new Map<string, number>();
  const score = (line: SweepLine) => (line.aud - line.pic) ** 2 / line.aud;
  for (const line of [...lines].sort((a, b) => score(b) - score(a))) {
    if (line.restates || line.aud < min || line.aud - line.pic < gap || line.pic > 0.75 * line.aud) continue;
    const same = `${Math.round(1000 * line.aud)}|${Math.round(1000 * line.pic)}`;
    const limit = line.lens === LENSES.length - 1 ? top + extra : top;
    if (seen.has(same) || (perField.get(line.field) ?? 0) >= 1 || shown[line.lens].length >= limit) continue;
    seen.add(same);
    perField.set(line.field, 1);
    shown[line.lens].push(line);
  }
  return shown;
}

export async function run(argv: string[], out: Out, { folder, env = process.env }: RunContext): Promise<void> {
  const { flags } = argsOf(argv);
  if (!["uk", "us"].includes(flags.country) || !flags.pictured) throw usageExit(import.meta.url, out, argv);
  const log = openLog("sweep", argv, { label: "counted", ...out });
  const { map, people: everyone, drawnFor } = loadPeople(flags.country, { people: flags.people || undefined, folder });
  if (drawnFor)
    log.line(`People drawn from PersonaGen for an audience (${drawnFor}): "adults" below means that audience.`);
  const fields = map.fields;
  const list = (text: string | undefined) => (text ? text.split(",") : []);
  const among = conditionsOf(fields, list(flags.among));
  const audience = everyone.filter((row) => matches(among, row));
  const pictured = conditionsOf(fields, list(flags.pictured));
  const fits = audience.filter((row) => matches(pictured, row));
  const who = among.length
    ? `this audience (${describeConditions(among)}: ${audience.length} people, ${((100 * audience.length) / everyone.length).toFixed(1)}% of adults)`
    : "adults";
  const whom = among.length ? "the audience" : "adults";
  if (audience.length < 100)
    log.line(
      `Only ${audience.length} people in the audience: every line below is a lead, not a count. ${biggerDraw(env)}`,
    );
  const share = fits.length / audience.length;
  log.line(
    `Swept all ${fields.length} facts recorded about each of ${audience.length} generated ${flags.country.toUpperCase()} ${among.length ? "people in " : ""}${who}.`,
  );
  log.line(
    [
      `The person you pictured (${describeConditions(pictured)}) is ${per100(share)} in every 100 of ${whom} (give or take ${giveOrTake(share, audience.length)}).`,
      `The other ${per100(1 - share)} are not.`,
    ].join(" "),
  );
  if (fits.length < 30)
    log.line(`Only ${fits.length} people fit the picture, so the second figure on each line is rough.`);
  for (const line of broadLines(map, everyone, [[...among, ...pictured]])) log.line(line);
  const lines = sweep(fields, audience, fits, { skip: new Set(pictured.map((c) => c.path)), conditions: pictured });
  const shown = leftOut(lines, { min: Number(flags.min ?? 5) / 100, top: Number(flags.top ?? 3) });
  log.line(
    [
      "\nThe largest groups your picture doesn't cover: people the work isn't speaking to yet.",
      `Each line: in every 100 of ${whom}, then in every 100 people like the one you pictured.`,
    ].join(" "),
  );
  LENSES.forEach((lens, l) => {
    if (!shown[l].length) return;
    log.line(`\n${lens.title}\n  ${lens.question}`);
    for (const line of shown[l]) {
      const about = asWords(line.field);
      const label = line.label.toLowerCase().includes(about.split(" ")[0]) ? line.label : `${line.label} (${about})`;
      log.line(
        `  ${per100(line.aud).padStart(5)} vs ${per100(line.pic).padStart(5)}  ${label}  [${tierLabel(line.tier)}]`,
      );
    }
  });
  log.line(
    [
      "\nCounted on generated people (PersonaGen): tier A is fitted to official statistics, B to other surveys, C is modelled.",
      `Say "counted" when you repeat a figure, and name who it is ${among.length ? "of (this audience)" : "of (adults)"}.`,
    ].join(" "),
  );
  log.next(
    [
      "Next: ask of each line, could they be customers too, and what would it take (an offer, a time, a message, a way in)?",
      "Keep only what serves the work in hand or the owner's goal; most lenses will bear on nothing, and that is fine.",
      "Only if a term the owner set may shut out a big group: terms, then suggest.",
      "Then the note, and note_check (guide topic second-look).",
    ].join(" "),
  );
}

cli(import.meta.url, run);
