#!/usr/bin/env node
// Probing a count close to a decision's rule: where it crosses the rule, the kinds of people in it, and what still
// reaches them. suggest.ts prints this for each close call; this script runs it on any group, to look further.
//
//   node scripts/probe.ts --country=uk [--among=...] --who=<conditions>       the people who meet all of these
//   node scripts/probe.ts --country=uk [--among=...] --lacking=<conditions>   the people who miss any of these (what an
//                                                                               option needs)
//   [--rule=10]   the "N in 100" of the decision's rule
//
// Splitting the people a count names only repeats the count: those who rarely go online are retired and have no
// digital skills. What moves a close call is who would be counted differently:
//   - Where it crosses the rule. The audience is split twice by the facts that most change the count, using only facts
//     an owner can see in their customers (age, work, household, money, health, place). 9.6 in 100 of adults can be 25
//     in 100 of those over 65: if the owner's customers are more like that line than the audience is, the rule picks
//     the other option for them.
//   - The kinds. The same lines, as shares of the people counted. Different kinds may need different fixes.
//   - Ways in: how they like to be contacted, where they shop, the devices they use, how they get about and their
//     language, where more of them use one than of the audience.
// These are associations among generated people, not causes. Each run ends with what it found, as a line for the reply
// (a resolution, scripts/log.ts): confirmed when every group is on one side of the rule (or the count is the same in
// every group), unclear when the groups fall on both sides, or when no rule was given to hold them against.
import { argsOf, cli, usageExit, type Out, type RunContext } from "./cli.ts";
import { asWords, per100, valueName } from "./format.ts";
import { conditionsOf, describeConditions, matches } from "./groups.ts";
import { openLog, type Resolution } from "./log.ts";
import {
  countsByField,
  loadPeople,
  numberAt,
  type Field,
  type FieldValue,
  type ListedField,
  type Row,
} from "./population.ts";

/** Facts an owner can recognise in their customers: the only ones the audience is split by. */
export const WHO = [
  "age_years",
  "gender",
  "region",
  "settlement_size",
  "life_stage",
  "household_type",
  "own_dependent_children_at_home",
  "economic_activity_status",
  "full_time_or_part_time",
  "current_occupation_major_group",
  "personal_income_before_tax_per_year",
  "household_income_before_tax_per_year",
  "home_tenure",
  "general_health",
  "day_to_day_activities_limited_by_health",
  "highest_qualification",
  "ethnic_group",
  "health_insurance",
  "fitness_or_sports_club_membership",
];
/**
 * Ways in: how a person likes to be contacted, where they shop, the devices they use, how they get about and the
 * language they speak. Every value of these is a channel a build could use; fields whose values are limits (money to
 * hand, a driving licence) are left to the profile.
 */
export const ROUTES = [
  "preferred_way_for_companies_to_contact_them",
  "usual_channel_for_non_food_shopping",
  "devices_used_to_go_online",
  "main_travel_mode_for_everyday_trips",
  "main_language",
];
const AGE: [from: number, to: number][] = [
  [18, 24],
  [25, 34],
  [35, 44],
  [45, 54],
  [55, 64],
  [65, 74],
  [75, Infinity],
];

// A long label is replaced by its code, which says the same in fewer words.
const named = (value: FieldValue) => valueName(value, 40);
// Values that only say a field does not apply ("Not in employment" under every work field) are not a way in.
const PLACEHOLDER = /^(not_applicable|not_in_employment$|self_employed_or_not_in_employment$)/;
const entropy = (k: number, n: number) => {
  if (!n || !k || k === n) return 0;
  const p = k / n;
  return -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p));
};

/** What every field the splits read has: the field, a code per person (-1 when none) and how many codes there are. */
interface CandidateBase {
  field: Field;
  codes: Int16Array;
  m: number;
}

/** Age, read in the bands of AGE, which are in order: a set of them is named as one range. */
interface AgeCandidate extends CandidateBase {
  ordered: true;
  name: (set: number[]) => string;
}

/** A field of listed values: a set of them is named as a run of its scale, or as a list. */
interface ListCandidate extends CandidateBase {
  field: ListedField;
  ordered: false;
  list: (set: number[]) => string;
  isRun: (set: number[]) => boolean;
}

/** A field as the splits read it: a code per person (-1 when none) and how to name a set of codes. */
type Candidate = AgeCandidate | ListCandidate;

/** A field as the splits read it. The one number they read is age (probeOf), cut into the bands of AGE. */
function candidate(field: Field, f: number, rows: Row[]): Candidate {
  const n = rows.length,
    codes = new Int16Array(n);
  if (field.quantiles) {
    for (let i = 0; i < n; i++) {
      const x = numberAt(rows[i], f);
      codes[i] = x === null ? -1 : AGE.findIndex(([, hi]) => x <= hi);
    }
    const name = (set: number[]) => {
      const lo = AGE[Math.min(...set)][0],
        hi = AGE[Math.max(...set)][1];
      return `aged ${lo}${hi === Infinity ? " or over" : ` to ${hi}`}`;
    };
    return { field, codes, m: AGE.length, ordered: true, name };
  }
  const m = field.values.length;
  for (let i = 0; i < n; i++) {
    // A field of one value: its entry is a position, or null or -1 for none.
    const x = rows[i][f];
    codes[i] = typeof x !== "number" || x < 0 || x >= m ? -1 : x;
  }
  // A run of a scale reads as a range ("£35,000 to £49,999 or more"); other values are listed. The field is named.
  const at = (v: number) => (field.order ?? []).indexOf(field.values[v].code);
  const label = (v: number) => named(field.values[v]);
  const sortedOf = (set: number[]) =>
    [...set].sort((a, b) => (at(a) < 0 ? 99 + a : at(a)) - (at(b) < 0 ? 99 + b : at(b)));
  const isRun = (set: number[]) => {
    const steps = sortedOf(set).map(at);
    return (
      Boolean(field.order) && steps.length > 1 && steps.every((s, k) => s >= 0 && (k === 0 || s === steps[k - 1] + 1))
    );
  };
  const list = (set: number[]) => {
    const sorted = sortedOf(set),
      steps = sorted.map(at),
      // Read only for a run, which a field has only with an order.
      last = (field.order ?? []).length - 1;
    const run = isRun(set);
    const text = run
      ? steps[0] === 0
        ? `${label(sorted[sorted.length - 1])} or less`
        : steps.at(-1) === last
          ? `${label(sorted[0])} or more`
          : `${label(sorted[0])} through ${label(sorted[sorted.length - 1])}`
      : sorted.length > 3
        ? `${sorted.slice(0, 3).map(label).join(", ")} or ${sorted.length - 3} more`
        : sorted.map(label).join(" or ");
    return `${asWords(field.name)}: ${text}`;
  };
  return { field, codes, m, ordered: false, list, isRun };
}

/**
 * A split of a node into two by one field: the codes that go left and right, how much it explains (`gain`) and how
 * uncertain the node was (`base`), both in bits over its people.
 */
interface Split {
  c: Candidate;
  gain: number;
  left: Set<number>;
  right: Set<number>;
  base: number;
}

/** A split that leads to a node: the field, and the side taken in words. */
interface Step {
  field: string;
  text: string;
}

/** A node of the splits: the positions of its people in the audience, and the splits that led to it. */
interface Node {
  path: Step[];
  idx: Int32Array;
}

/** The best split of one node into two: Breiman's sort by rate for a list of values, cuts in order for age bands. */
function bestSplit(cands: Candidate[], idx: Int32Array, mask: Uint8Array, minLeaf: number): Split | null {
  let best: Omit<Split, "base"> | null = null;
  const k0 = idx.reduce((s, i) => s + mask[i], 0),
    base = idx.length * entropy(k0, idx.length);
  for (const c of cands) {
    const n = new Float64Array(c.m + 1),
      k = new Float64Array(c.m + 1);
    for (const i of idx) {
      const v = c.codes[i] < 0 ? c.m : c.codes[i];
      n[v]++;
      k[v] += mask[i];
    }
    const present = [...n.keys()].filter((v) => n[v] > 0);
    const order = c.ordered ? present.filter((v) => v < c.m) : present.sort((a, b) => k[a] / n[a] - k[b] / n[b]);
    let nl = 0,
      kl = 0;
    for (let cut = 0; cut < order.length - 1; cut++) {
      nl += n[order[cut]];
      kl += k[order[cut]];
      const nr = idx.length - nl,
        kr = k0 - kl;
      if (nl < minLeaf || nr < minLeaf) continue;
      const gain = base - nl * entropy(kl, nl) - nr * entropy(kr, nr);
      if (!best || gain > best.gain)
        best = { c, gain, left: new Set(order.slice(0, cut + 1)), right: new Set(order.slice(cut + 1)) };
    }
  }
  return best && { ...best, base };
}

/**
 * How one side of a split reads: its values named, or "other than" the other side's when it holds the people with
 * none or is the longer list. Only the values present in the node are named.
 */
function sideText(split: Split, left: boolean): string {
  const { c } = split;
  const mine = [...(left ? split.left : split.right)],
    theirs = [...(left ? split.right : split.left)];
  if (c.ordered) return c.name(mine);
  if (
    !mine.includes(c.m) &&
    (c.isRun(mine) || mine.length <= 3 || theirs.includes(c.m) || mine.length <= theirs.length)
  )
    return c.list(mine);
  if (!theirs.includes(c.m)) return c.list(theirs).replace(": ", ": other than ");
  return c.list(mine.filter((v) => v < c.m));
}

/** One side of a split as a condition the tools read ("age_years=65..120", "home_tenure=owned|mortgage"). */
function sideCondition(split: Split, left: boolean): string {
  const { c } = split;
  const mine = [...(left ? split.left : split.right)],
    theirs = [...(left ? split.right : split.left)];
  if (c.ordered) {
    const bands = mine.filter((v) => v < c.m),
      lo = AGE[Math.min(...bands)][0],
      hi = AGE[Math.max(...bands)][1];
    return `age_years=${lo}..${hi === Infinity ? 120 : hi}`;
  }
  const code = (v: number) => c.field.values[v].code;
  if (mine.includes(c.m))
    return `${c.field.name}!=${theirs
      .filter((v) => v < c.m)
      .map(code)
      .join("|")}`;
  return `${c.field.name}=${mine.map(code).join("|")}`;
}

/** A line of the probe: the people the splits pick out, in words, how many they are and how many are in the group. */
export interface Leaf {
  text: string;
  n: number;
  k: number;
  /** Their share of the audience. */
  share: number;
  /** The share of them in the group. */
  rate: number;
  /** Their share of the group. */
  ofGroup: number;
}

/** A way in more of the group use than the audience: one value of a field, its share of them (g) and of all (a). */
export interface WayIn {
  field: string;
  label: string;
  code: string;
  g: number;
  a: number;
}

/** Another group of the same build that holds the same people: its share of them (g) and of the audience (a). */
export interface Overlap {
  label: string;
  g: number;
  a: number;
}

/** One side of the first split: in words, as a condition the tools read, its share of the audience and its rate. */
export interface Side {
  text: string;
  cond: string;
  share: number;
  rate: number;
}

/** The first split: the one fact that most changes the count, and its two sides. */
export interface RootSplit {
  field: string;
  sides: Side[];
}

/** What probeOf finds: the audience (n) and the group (k), the lines, the ways in, the overlaps and the first split. */
export interface ProbeResult {
  n: number;
  k: number;
  leaves: Leaf[];
  routes: WayIn[];
  overlaps: Overlap[];
  root: RootSplit | null;
}

/** How probeOf reads a group: the fields that define it, and the other groups counted in the same build. */
export interface ProbeOptions {
  skip?: Set<string>;
  others?: { label: string; inGroup: ArrayLike<unknown> }[];
}

/**
 * The probe of a group within the audience. `rows` are the audience; `inGroup` says for each whether they are in the
 * group counted; `skip` are field paths that define it (left out of the splits and the routes); `others` are other
 * groups counted in the same build, for the overlaps.
 */
export function probeOf(
  fields: Field[],
  rows: Row[],
  inGroup: ArrayLike<unknown>,
  { skip = new Set(), others = [] }: ProbeOptions = {},
): ProbeResult {
  const N = rows.length,
    mask = Uint8Array.from(inGroup, (x) => (x ? 1 : 0)),
    K = mask.reduce((s, x) => s + x, 0);
  const cands = fields.flatMap((field, f) =>
    WHO.includes(field.name) &&
    !skip.has(field.path) &&
    (field.quantiles ? field.name === "age_years" : field.values?.length >= 2 && field.kind !== "list")
      ? [candidate(field, f, rows)]
      : [],
  );
  const minLeaf = Math.max(50, Math.ceil(0.02 * N)),
    rootInfo = N * entropy(K, N);
  const all = Int32Array.from({ length: N }, (_, i) => i);
  // Two levels at most: a split is kept when it explains a twentieth of what the node is uncertain about, and a
  // hundredth of the whole audience's.
  let root: RootSplit | null = null;
  const grow = (idx: Int32Array, path: Step[], depth: number): Node[] => {
    const split = depth < 2 && idx.length >= 2 * minLeaf ? bestSplit(cands, idx, mask, minLeaf) : null;
    if (!split || split.gain < 0.05 * split.base || split.gain < 0.01 * rootInfo) return [{ path, idx }];
    const goes = (i: number) => split.left.has(split.c.codes[i] < 0 ? split.c.m : split.c.codes[i]);
    // The first split is the one fact that most changes the count: what to ask the owner about their customers.
    if (depth === 0)
      root = {
        field: split.c.field.name,
        sides: [true, false].map((left) => {
          const side = idx.filter((i) => goes(i) === left),
            k = side.reduce((s, i) => s + mask[i], 0);
          return {
            text: sideText(split, left),
            cond: sideCondition(split, left),
            share: side.length / N,
            rate: side.length ? k / side.length : 0,
          };
        }),
      };
    // A second split on the same field narrows the first, so it takes its place.
    const after = (left: boolean) => [
      ...path.filter((step) => step.field !== split.c.field.name),
      { field: split.c.field.name, text: sideText(split, left) },
    ];
    return [true, false].flatMap((left) =>
      grow(
        idx.filter((i) => goes(i) === left),
        after(left),
        depth + 1,
      ),
    );
  };
  const leaves = (K && K < N ? grow(all, [], 0) : [{ path: [], idx: all }])
    .map(({ path, idx }) => {
      const k = idx.reduce((s, i) => s + mask[i], 0);
      return {
        text: path.map((step) => step.text).join("; ") || "everyone",
        n: idx.length,
        k,
        share: idx.length / N,
        rate: idx.length ? k / idx.length : 0,
        ofGroup: K ? k / K : 0,
      };
    })
    .sort((a, b) => b.rate - a.rate);

  // Ways in that more of them use than the audience does: one value a field, the most common among them.
  const group = rows.filter((_, i) => mask[i]);
  const inG = countsByField(fields, group),
    inAll = countsByField(fields, rows);
  const routes = fields
    .flatMap((field, f) => {
      if (!ROUTES.includes(field.name) || skip.has(field.path) || !field.values || !K) return [];
      const lines = field.values
        .map((value, v) => ({
          field: field.name,
          label: named(value),
          code: String(value.code),
          g: inG[f][v] / K,
          a: inAll[f][v] / N,
        }))
        .filter(
          (line) => !PLACEHOLDER.test(line.code) && line.g >= 0.25 && line.g - line.a >= 0.05 && line.g >= 1.2 * line.a,
        );
      return lines.sort((x, y) => y.g - x.g).slice(0, 1);
    })
    .sort((x, y) => y.g - y.a - (x.g - x.a))
    .slice(0, 5);

  // Other groups of the same build that hold the same people, far more than they hold the audience.
  const overlaps = others
    .flatMap(({ label, inGroup: theirs }) => {
      let both = 0,
        size = 0;
      for (let i = 0; i < N; i++)
        if (theirs[i]) {
          size++;
          if (mask[i]) both++;
        }
      const g = K ? both / K : 0,
        a = size / N;
      return g >= 0.2 && g >= 1.5 * a && g < 0.99 ? [{ label, g, a }] : [];
    })
    .sort((x, y) => y.g / y.a - x.g / x.a)
    .slice(0, 3);
  return { n: N, k: K, leaves, routes, overlaps, root };
}

/** The question for the owner that would settle a close call: the side of the first split, and the field split. */
export interface Ask extends Side {
  field: string;
}

/**
 * The question for the owner that would settle a close call: of their customers, how many are on the side of the first
 * split where the count is highest. Null when nothing splits it.
 */
export function askOf(result: Pick<ProbeResult, "root">): Ask | null {
  if (!result.root) return null;
  const side = [...result.root.sides].sort((a, b) => b.rate - a.rate)[0];
  return { field: result.root.field, ...side };
}

/** The probe as lines to print. `rule` is the threshold in every 100, or null; `whom` names the audience. */
export function probeLines(
  result: ProbeResult,
  {
    rule = null,
    whom = "adults",
    counted = "those in the group",
  }: { rule?: number | null; whom?: string; counted?: string } = {},
): string[] {
  const out: string[] = [];
  const big = result.leaves.filter((leaf) => leaf.text !== "everyone");
  if (!big.length)
    out.push(
      `  It is about the same, ${per100(result.k / result.n)} in every 100, in every group of age, work, household, money, health and place: who the owner's customers are does not move it.`,
    );
  else {
    out.push(
      `  Where it is above and below${rule === null ? "" : ` the ${+rule.toFixed(1)} in your rule`}, split by the facts that most change it (of every 100 of ${whom}):`,
    );
    out.push(`    ${"rate".padStart(5)}  ${"share".padStart(5)}  ${"of them".padStart(7)}  people`);
    for (const leaf of big) {
      const side = rule === null ? "" : 100 * leaf.rate >= rule ? "  (above)" : "  (below)";
      out.push(
        `    ${per100(leaf.rate).padStart(5)}  ${per100(leaf.share).padStart(5)}  ${per100(leaf.ofGroup).padStart(7)}  ${leaf.text}${side}`,
      );
    }
    out.push(
      `    rate: of every 100 people in that line, how many are among ${counted}; share: the line, of every 100 of ${whom}; of them: of every 100 of ${counted}, how many are in that line.`,
    );
  }
  if (result.routes.length)
    out.push(
      `  Ways in that more of them use than most: ${result.routes.map((r) => `${r.label} (${asWords(r.field)}) ${per100(r.g)} in every 100 of them, against ${per100(r.a)}`).join("; ")}.`,
    );
  if (result.overlaps.length)
    out.push(
      `  The same people again: ${result.overlaps.map((o) => `${o.label} ${per100(o.g)} in every 100 of them, against ${per100(o.a)} of ${whom}`).join("; ")}.`,
    );
  return out;
}

export async function run(argv: string[], out: Out, { folder }: RunContext): Promise<void> {
  const { flags } = argsOf(argv);
  if (!["uk", "us"].includes(flags.country) || (!flags.who && !flags.lacking))
    throw usageExit(import.meta.url, out, argv);
  const { map, people } = loadPeople(flags.country, { people: flags.people || undefined, folder });
  const fields = map.fields;
  const among = conditionsOf(fields, flags.among ? flags.among.split(",") : []);
  const who = conditionsOf(fields, (flags.who || flags.lacking).split(","));
  const log = openLog("probe", argv, { label: "counted", ...out });
  const audience = people.filter((row) => matches(among, row));
  const inGroup = audience.map((row) => (flags.who ? matches(who, row) : !matches(who, row)));
  const whom = among.length ? describeConditions(among) : "adults";
  const result = probeOf(fields, audience, inGroup, { skip: new Set([...among, ...who].map((c) => c.path)) });
  const what = flags.who ? describeConditions(who) : `Missing any of: ${who.map((c) => c.text).join("; ")}`;
  log.line(
    `${what}: ${per100(result.k / result.n)} in every 100 of ${whom} (${result.k} of ${result.n} generated people).`,
  );
  for (const line of probeLines(result, {
    rule: flags.rule ? Number(flags.rule) : null,
    whom,
    counted: flags.who ? "those in the group" : "those it leaves out",
  }))
    log.line(line);
  log.line(
    "Counted on generated people (PersonaGen). Associations, not causes; whom the owner's customers are like is your judgement.",
  );
  log.resolve(
    `probe:${flags.who || `lacking ${flags.lacking}`}|${flags.among ?? ""}`,
    probeResolution(result, {
      what: `${flags.who ? "" : "people "}${what.charAt(0).toLowerCase()}${what.slice(1)}`,
      whom,
      rule: flags.rule ? Number(flags.rule) : null,
    }),
  );
}

/**
 * What a probe found, as a resolution (scripts/log.ts resolutionText): whether who the owner's customers are could
 * move the count across the rule. Every group on one side of it, or the same count in every group, confirms; groups on
 * both sides, or no rule to hold them against, cannot tell. It always says why.
 */
export function probeResolution(
  result: ProbeResult,
  { what, whom, rule = null }: { what: string; whom: string; rule?: number | null },
): Resolution & { why: string } {
  const checked = `${what}, among ${whom}`;
  const big = result.leaves.filter((leaf) => leaf.text !== "everyone");
  if (!big.length)
    return {
      checked,
      found: `it is about the same, ${per100(result.k / result.n)} in every 100 (counted), in every group of age, work, household, money, health and place`,
      outcome: "confirmed",
      why: "who your customers are does not move it",
    };
  const rates = big.map((leaf) => 100 * leaf.rate),
    lo = Math.min(...rates),
    hi = Math.max(...rates);
  const found = `from ${lo.toFixed(1)} to ${hi.toFixed(1)} in every 100 (counted) across groups of age, work, household, money, health and place`;
  if (rule === null)
    return { checked, found, outcome: "unclear", why: "no figure was given for where the choice changes" };
  const t = +rule.toFixed(1);
  if (lo >= rule || hi < rule)
    return {
      checked,
      found,
      outcome: "confirmed",
      why: `every group is ${lo >= rule ? "above" : "below"} the ${t} where the choice changes, whoever your customers are`,
    };
  return {
    checked,
    found,
    outcome: "unclear",
    why: `groups fall on both sides of the ${t} where the choice changes, so it depends on who your customers are`,
  };
}

cli(import.meta.url, run);
