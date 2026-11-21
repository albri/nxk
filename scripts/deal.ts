#!/usr/bin/env node
// Ideas from combinations the agent would not reach on its own. Asked for ideas, a model writes them for one kind of
// person: twenty from a plain request were wanted by the same people. This takes the parts of a business that can
// vary (who it is for, who pays, how it is charged, how it reaches them, who does the work, what starts it), lists the
// options for each, and deals out combinations so that every option and as many pairs of options as possible turn up.
// The "who" options are groups counted on the generated people, so each idea starts from a real, sized group. No
// request is made.
//
//   node scripts/deal.ts --country=uk --area="household admin" [--n=16] [--seed=1] [--for=retired,carers]
//   node scripts/deal.ts --country=uk --area="..." --axes=axes.json       your own options for any part
//
// Write each combination that makes sense as an idea a person would meet, with a price, into ideas.json, and say
// which you dropped and why. Then put them to the people: ideas_scan (mcp/guides/discover.md).
import { argsOf, cli, readIn, usageExit, type Out, type RunContext } from "./cli.ts";
import { draw } from "./groups.ts";
import { openLog } from "./log.ts";
import { loadPeople } from "./population.ts";

/** A group to aim at: its key, its name in words, the field it is read from and a pattern for the codes making it. */
export interface AimGroup {
  key: string;
  name: string;
  field: string;
  codes: RegExp;
}

/** Groups to aim at, as a field and a pattern for the codes that make the group, so one list serves both countries. */
export const GROUPS: AimGroup[] = [
  {
    key: "private-renters",
    name: "private renters",
    field: "home_tenure",
    codes: /private_landlord|rented_without_government/,
  },
  {
    key: "social-renters",
    name: "social housing tenants",
    field: "home_tenure",
    codes: /council|housing_association|rented_with_government/,
  },
  {
    key: "shift-workers",
    name: "shift workers",
    field: "shift_work",
    codes: /^shift_work_(most|occ)|evening|night|rotating|split|irregular/,
  },
  {
    key: "carers",
    name: "unpaid carers, 20 hours a week or more",
    field: "unpaid_care_hours_per_week",
    codes: /^(20_to_49|50_or_more)/,
  },
  {
    key: "under-fives",
    name: "parents of under-fives",
    field: "youngest_dependent_child_age",
    codes: /^(under_1|1_to_4)/,
  },
  { key: "self-employed", name: "self-employed people", field: "employment_type", codes: /^self_employed/ },
  { key: "alone", name: "people living alone", field: "household_type", codes: /^one_person/ },
  {
    key: "lone-parents",
    name: "lone parents",
    field: "household_type",
    codes: /^lone_parent_household_with_dependent/,
  },
  {
    key: "movers",
    name: "people who moved in the last year",
    field: "years_at_current_address",
    codes: /^less_than_1/,
  },
  { key: "rural", name: "people in villages and the countryside", field: "settlement_size", codes: /village|^rural/ },
  { key: "retired", name: "retired people", field: "economic_activity_status", codes: /^retired$/ },
  {
    key: "sick",
    name: "people off work through long-term illness or disability",
    field: "economic_activity_status",
    codes: /long_term_sick/,
  },
  {
    key: "arrived",
    name: "people who arrived in the country in the last five years",
    field: "years_living_in_the_country",
    codes: /^(under_2|2_to_4)/,
  },
  {
    key: "short",
    name: "people who could not cover an unexpected bill",
    field: "could_cover_an_unexpected_expense",
    codes: /not|borrow/,
  },
  {
    key: "benefits",
    name: "people living mainly on benefits",
    field: "main_source_of_personal_income",
    codes: /benefit|public_assistance|ssi/,
  },
];

/** The parts of a business that can vary, each with its options. */
export type Axes = Record<string, string[]>;

/** One combination: an option for each part. */
export type Hand = Record<string, string>;

/** The other parts of a business, with options that are each a real way to run one. */
export const AXES: Axes = {
  pays: [
    "the person",
    "someone else in their household",
    "their employer",
    "their landlord or letting agent",
    "a council, charity or health service",
    "a business they already pay (bank, energy, phone)",
  ],
  charge: ["monthly", "per use", "once", "free, with a paid extra", "only when it saves them money"],
  reach: [
    "an app",
    "a website",
    "a phone call",
    "post and paper",
    "in person",
    "inside something they already use (bank app, messages, email)",
  ],
  work: ["the person does it, with a tool", "software does it for them", "a person does it for them"],
  starts: ["when something changes in their life", "on a regular schedule", "when something goes wrong"],
};

/**
 * `n` combinations of one option from each part, dealt so that every option turns up about equally often and new pairs
 * of options are preferred to ones already dealt. The same seed gives the same deal.
 */
export function deal(axes: Axes, n: number, seed = 1): Hand[] {
  const parts = Object.keys(axes);
  // How many times each option has been dealt, part by part in the order of `parts`.
  const used = parts.map((part) => new Map(axes[part].map((option): [string, number] => [option, 0])));
  const pairs = new Set<string>();
  const key = (a: string, x: string, b: string, y: string) => `${a}=${x}|${b}=${y}`;
  const out: Hand[] = [];
  for (let k = 0; k < n; k++) {
    let best: Hand = {};
    let bestScore = -Infinity;
    for (let tries = 0; tries < 200; tries++) {
      // Options used least so far come first; ties are broken by the seeded shuffle.
      const pick = Object.fromEntries(
        parts.map((part, p) => {
          const least = Math.min(...used[p].values());
          const pool = axes[part].filter((option) => (used[p].get(option) ?? 0) <= least + (tries > 100 ? 1 : 0));
          return [part, draw(pool, 1, seed * 7919 + k * 104729 + tries * 31 + p)[0]];
        }),
      );
      let fresh = 0;
      for (let i = 0; i < parts.length; i++)
        for (let j = i + 1; j < parts.length; j++)
          if (!pairs.has(key(parts[i], pick[parts[i]], parts[j], pick[parts[j]]))) fresh++;
      if (fresh > bestScore) {
        best = pick;
        bestScore = fresh;
      }
    }
    parts.forEach((part, p) => used[p].set(best[part], (used[p].get(best[part]) ?? 0) + 1));
    for (let i = 0; i < parts.length; i++)
      for (let j = i + 1; j < parts.length; j++) pairs.add(key(parts[i], best[parts[i]], parts[j], best[parts[j]]));
    out.push(best);
  }
  return out;
}

export async function run(argv: string[], out: Out, { folder }: RunContext): Promise<void> {
  const { flags } = argsOf(argv);
  if (!["uk", "us"].includes(flags.country) || !flags.area) throw usageExit(import.meta.url, out, argv);
  const log = openLog("deal", argv, out);
  const { map, people } = loadPeople(flags.country);
  // Size every group on the generated people; keep those of 2% of adults or more.
  const sized = GROUPS.flatMap((group) => {
    const f = map.fields.findIndex((field) => field.name === group.field);
    if (f < 0) return [];
    const codes = new Set(
      (map.fields[f].values ?? []).flatMap((value, v) => (group.codes.test(value.code) ? [v] : [])),
    );
    // Each group's field holds one value a person: a position.
    const n = people.filter((row) => {
      const x = row[f];
      return typeof x === "number" && codes.has(x);
    }).length;
    return n / people.length >= 0.02 ? [{ ...group, share: n / people.length }] : [];
  });
  const wanted = flags.for ? flags.for.split(",") : null;
  const who = wanted ? sized.filter((group) => wanted.includes(group.key)) : sized;
  if (!who.length) throw new Error(`No group matches --for. Groups: ${sized.map((group) => group.key).join(", ")}`);
  const own: Axes = flags.axes ? JSON.parse(readIn(folder, flags.axes, "utf8")) : {};
  const axes: Axes = { who: who.map((group) => group.key), ...AXES, ...own };
  const longest = Math.max(...Object.values(axes).map((options) => options.length));
  const n = Number(flags.n ?? Math.max(16, longest));
  const hands = deal(axes, n, Number(flags.seed ?? 1));
  const named = new Map(who.map((group) => [group.key, group] as const));
  const coverage =
    n >= longest ? "Every option of every part turns up" : `Some options are left out: n ${longest} deals every one`;
  const possible = Object.values(axes).reduce((a, b) => a * b.length, 1);
  log.line(
    `${n} combinations for ${flags.area}, ${flags.country.toUpperCase()}. ${coverage}; ${possible.toLocaleString("en-GB")} combinations exist.\n`,
  );
  hands.forEach((hand, i) => {
    const group = named.get(hand.who);
    const size = group && `${(100 * group.share).toFixed(1)} in every 100 adults, counted`;
    const head = group ? `For ${group.name} (${size})` : `For ${hand.who}`;
    const rest = Object.entries(hand)
      .filter(([part]) => part !== "who")
      .map(([part, option]) => `${part}: ${option}`)
      .join("; ");
    log.line(`${String(i + 1).padStart(2)}. ${head}. ${rest}.`, null, size ? { counted: [size] } : null);
  });
  log.line(
    [
      "\nWrite each one that makes sense as an idea a person would meet, with its price, in ideas.json,",
      "and drop the ones that do not, saying why in a word.",
      "Add the obvious ideas too: discover.ts shows whether the dealt ones reach people the obvious ones miss.",
    ].join(" "),
  );
}

cli(import.meta.url, run);
