// Reading a scan: which fields and values it asks about, how far each field's answers spread, and each person's
// probability, built from the answers for the facts they hold. Pure functions: no request is made here (scan.ts
// sends the requests). Every probability is between 0 and 1; rows are read through scripts/population.ts.
import { numberAt, shareOf, valuesAt } from "./population.ts";
import type { CodedAs, Field, InterestAs, Row } from "./population.ts";

/** What a profile sends for a probed value: a code, a list of codes, a number, or a coded value or interests. */
export type ProbeValue = string | number | string[] | CodedAs | InterestAs[];

/** One value of a field that a scan asks about alone. */
export interface Probe {
  /** The value as it appears in a profile. */
  value: ProbeValue;
  code: string;
  label: string;
  /** The share of adults holding it, or null for a quantile of a numeric field. */
  share: number | null;
}

/** A probed value of one field against the answer with no fact known. */
export interface ValueShift {
  code: string;
  label: string;
  share: number | null;
  shift: number;
}

/** One field of a scan, as scanField measures it. */
export interface FieldSpread {
  path: string;
  values: ValueShift[];
  low: ValueShift;
  high: ValueShift;
  spread: number;
}

/** One level of a field before and after a change, for splitOfChange. */
export interface Step {
  share: number | null | undefined;
  before: number;
  after: number;
}

/** The people who hold one probed value: its id ("path=code") and their positions among the people. */
export interface Holders {
  id: string;
  members: number[];
}

/**
 * A scan applied to the people: each person's probability, the average level, the shift applied to it, and how
 * strongly their facts were added up (`damping`).
 */
export interface PeopleAnswers {
  p: number[];
  level: number;
  shift: number;
  damping: number;
}

/**
 * How strongly a person's facts add up when no damping is given: 1.2 over the square root of the number of fields
 * read, about 0.1 with every field of the map (146) and 0.3 with ten general fields and six named. A person's answer
 * is a sum over the fields read, so with a fixed damping the same difference came out bigger the more fields a scan
 * asked about. On 32 products whose users are published, scanned with every field (evals/products/strength.ts), a
 * group's published difference at a fixed 0.1 was 7.95 times the reading from six of the fields, 2.58 times it from
 * ten general fields and those six, and 0.78 times it from every field: a cheaper scan never reached x1.5. Set this
 * way it is 1.62, 0.86 and 0.79 times, so the bars a corner is judged by (product.ts strengthOf) mean much the same
 * in a scan of every field and in a cheaper one.
 */
export const dampingFor = (fields: number): number => 1.2 / Math.sqrt(Math.max(1, fields));

const mean = (xs: number[]) => xs.reduce((sum, x) => sum + x, 0) / xs.length;
const expit = (x: number) => 1 / (1 + Math.exp(-x));

/** Log-odds of a probability, held away from 0 and 1 so one certain answer cannot dominate an average. */
export function logOdds(p: number): number {
  const q = Math.min(0.999, Math.max(0.001, p));
  return Math.log(q / (1 - q));
}

/**
 * The general facts every scan asks about. Across 72 saved scans of the whole map (40 product ideas, 32 existing
 * products), these ten did most to separate people whatever the subject. They say who is keen on anything, which a
 * list of facts chosen for one decision leaves out.
 */
export const GENERAL_FIELDS: string[] = [
  "financial_risk_tolerance",
  "new_technology_adoption",
  "digital_skill_level",
  "internet_use_frequency",
  "big_five_openness_quintile",
  "says_advertising_influences_what_they_buy",
  "big_five_conscientiousness_quintile",
  "household_resource_context",
  "big_five_extraversion_quintile",
  "brand_choice_when_shopping",
];

/**
 * Which fields of the map a scan asks about. `picked` are the names chosen for this decision, to which the general
 * fields are added; `all` takes every field; `only` takes exactly the names given and adds nothing.
 * Returns { names, general, unknown }: the names to ask about, the general ones among them, and names not in the map.
 */
export function fieldsToScan(
  fields: Pick<Field, "name">[],
  { picked = [], all = false, only = null }: { picked?: string[]; all?: boolean; only?: string[] | null } = {},
): { names: string[]; general: string[]; unknown: string[] } {
  const known = new Set(fields.map((field) => field.name));
  const unknown = (only ?? picked).filter((name) => !known.has(name));
  if (all) return { names: fields.map((field) => field.name), general: [], unknown };
  if (only) return { names: [...new Set(only.filter((name) => known.has(name)))], general: [], unknown };
  const general = GENERAL_FIELDS.filter((name) => known.has(name));
  return { names: [...new Set([...general, ...picked.filter((name) => known.has(name))])], general, unknown };
}

/**
 * The values of one map field to ask about alone: every value listed (up to `max`), or the five quantiles of a
 * numeric range. Each is { value (as it appears in a profile), code, label, share }. A long list (occupations,
 * interests) keeps every value anyone holds, most held first, and `field.common` says how many of those come first
 * because 1 in 100 adults or more hold them (3 in 100 for a specific interest): only those are asked about, so a scan
 * costs what it did when the map kept nothing else. A field with more than `max` values and no common ones (places),
 * or free text, returns nothing. The probes are the field's first values, so probe i is value position i.
 */
export function probesOf(field: Field, { max = 60 }: { max?: number } = {}): Probe[] {
  const asked = !Array.isArray(field.values)
    ? []
    : field.common !== undefined
      ? field.values.slice(0, Math.min(field.common, max))
      : field.values.length <= max
        ? field.values
        : [];
  if (asked.length >= 2) {
    // `as` is the value as it appears in a profile, where that is not the bare code (a coded field, an interest).
    return asked.map((v) => ({
      value: v.as ?? (field.kind === "list" ? [v.code] : v.code),
      code: String(v.code),
      label: v.label ?? String(v.code),
      share: shareOf(v.share),
    }));
  }
  if (field.range && field.quantiles)
    return Object.entries(field.quantiles).map(([q, v]) => ({
      value: v,
      code: `${v} (${q})`,
      label: `${v}`,
      share: null,
    }));
  return [];
}

/**
 * One field of a scan: how far its common values (held by `common` of adults or more) sit from the answer with no
 * fact known. `answers` maps "path=code" to a probability. Returns the lowest and highest value and their spread.
 */
export function scanField(
  field: Pick<Field, "path">,
  probes: Probe[],
  answers: Map<string, number>,
  base: number,
  { common = 0.02 }: { common?: number } = {},
): FieldSpread | null {
  const seen = probes.flatMap((probe): ValueShift[] => {
    const answer = answers.get(`${field.path}=${probe.code}`);
    return answer === undefined
      ? []
      : [{ code: probe.code, label: probe.label, share: probe.share, shift: answer - base }];
  });
  const kept = seen.filter((v) => v.share === null || v.share >= common);
  const use = (kept.length >= 2 ? kept : seen).sort((a, b) => a.shift - b.shift);
  if (use.length < 2) return null;
  // With many values the extremes are mostly noise, so a long field is measured between its 10th and 90th percentile.
  const low = use.length > 8 ? use[Math.floor(0.1 * use.length)] : use[0];
  const high = use[use.length > 8 ? Math.ceil(0.9 * use.length) - 1 : use.length - 1];
  return { path: field.path, values: use, low, high, spread: high.shift - low.shift };
}

/**
 * How a change splits across the levels of one field: each level's share of adults times how far its answer moved,
 * as a fraction of the field's total. The fractions add up to 1. Returns null when the levels pull in different
 * directions or shares are missing, where a split has no meaning. `steps` is [{ share, before, after }].
 */
export function splitOfChange(steps: Step[]): number[] | null {
  const known = (step: Step): step is Step & { share: number } => step.share !== null && step.share !== undefined;
  if (steps.length < 2 || !steps.every(known)) return null;
  const parts = steps.map((step) => step.share * (step.after - step.before));
  const total = parts.reduce((sum, x) => sum + x, 0);
  if (total === 0 || parts.some((x) => x !== 0 && Math.sign(x) !== Math.sign(total))) return null;
  return parts.map((x) => x / total);
}

/**
 * The people who hold each probed value of one field: [{ id: "path=code", members: [person index] }]. A numeric field
 * is cut at the midpoints between its probed values, so every person with a number falls with the nearest probe.
 */
export function membersOf(field: Field, f: number, people: Row[]): Holders[] {
  const probes = probesOf(field);
  if (field.quantiles) {
    const sorted = probes.map((probe) => ({ probe, v: Number(probe.value) })).sort((a, b) => a.v - b.v);
    return sorted.map(({ probe, v }, i) => {
      const low = i ? (sorted[i - 1].v + v) / 2 : -Infinity,
        high = i < sorted.length - 1 ? (v + sorted[i + 1].v) / 2 : Infinity;
      return {
        id: `${field.path}=${probe.code}`,
        members: people.flatMap((row, n) => {
          const x = numberAt(row, f);
          return x !== null && x >= low && x < high ? [n] : [];
        }),
      };
    });
  }
  // One pass over the people, not one a value.
  const members = probes.map((): number[] => []);
  people.forEach((row, n) => {
    for (const v of valuesAt(field, row, f)) if (v < members.length) members[v].push(n);
  });
  return probes.map((probe, v) => ({ id: `${field.path}=${probe.code}`, members: members[v] }));
}

/** The facts with answers missing in a version, from requests that failed: a field asked about in some version, or for some of its values, but not all. */
export function missingAnswers(
  answers: Record<string, Map<string, number>>,
  versionNames: string[],
  fieldList: { field: Pick<Field, "path">; probes: Pick<Probe, "code">[] }[],
): string[] {
  const gaps = versionNames.filter((v) => !answers[v].has("base")).map((v) => `the answer with nothing known (${v})`);
  for (const { field, probes } of fieldList) {
    const have = versionNames.map(
      (v) => probes.filter((probe) => answers[v].has(`${field.path}=${probe.code}`)).length,
    );
    if (have.every((n) => n === 0)) continue; // never asked about: said where the fields are listed
    versionNames.forEach((v, i) => {
      if (have[i] < probes.length)
        gaps.push(`${field.path} (${v}: ${probes.length - have[i]} of ${probes.length} values)`);
    });
  }
  return gaps;
}

/**
 * One scan applied to the people: each person's probability, built from every fact they hold.
 * A fact's effect is its scan answer against its own field's average (weighted by how many people hold each value),
 * in log-odds, so a field as a whole pushes nobody. A person's answer is the level plus `damping` times the sum of
 * their facts' effects; a multi-valued field counts once, as the average of the person's values.
 *
 * Facts overlap (a lone fact carries what usually goes with it), which is why the sum is damped. In testing, damping
 * between 0.05 and 0.15 ordered people as the decision model did when asked about them one by one, and who was
 * affected most hardly changed across that range; the size of differences did. So read who, and treat sizes as rough.
 * With no `damping` given, it is set by how many fields are read (dampingFor).
 *
 * `answers` maps "path=code" to a probability. `target` sets the population average to a figure you know (your real
 * rate); `shift` applies a previous call's shift, so that a changed version keeps the same footing.
 * Returns { p: [per person], level, shift, damping }.
 */
export function peopleAnswers(
  fields: Field[],
  people: Row[],
  answers: Map<string, number>,
  {
    damping: given,
    target = null,
    shift = 0,
    min = 25,
    over = null,
  }: { damping?: number; target?: number | null; shift?: number; min?: number; over?: number[] | null } = {},
): PeopleAnswers {
  const sum = new Float64Array(people.length);
  const levels: number[] = [];
  fields.forEach((field, f) => {
    // Each value held by `min` people or more, with its answer.
    const groups = membersOf(field, f, people).flatMap(({ id, members }) => {
      const answer = answers.get(id);
      return answer !== undefined && members.length >= min ? [{ members, answer }] : [];
    });
    if (groups.length < 2) return;
    const total = groups.reduce((s, g) => s + g.members.length, 0);
    const level = groups.reduce((s, g) => s + g.members.length * g.answer, 0) / total;
    levels.push(level);
    const tot = new Float64Array(people.length),
      count = new Uint16Array(people.length);
    for (const g of groups) {
      const effect = logOdds(g.answer) - logOdds(level);
      for (const i of g.members) {
        tot[i] += effect;
        count[i]++;
      }
    }
    for (let i = 0; i < people.length; i++) if (count[i]) sum[i] += tot[i] / count[i];
  });
  if (!levels.length) throw new Error("No field of the map has scan answers for two or more of its values");
  const level = mean(levels),
    damping = given ?? dampingFor(levels.length);
  const at = (c: number) => Array.from(sum, (s) => expit(c + damping * s));
  let c = logOdds(level) + shift;
  if (target !== null) {
    // `over` names the people whose average is set to the target (an audience); by default, everyone.
    const average = (p: number[]) => (over ? mean(over.map((i) => p[i])) : mean(p));
    let low = -12,
      high = 12;
    for (let step = 0; step < 60; step++) {
      c = (low + high) / 2;
      if (average(at(c)) < target) low = c;
      else high = c;
    }
  }
  return { p: at(c), level, shift: c - logOdds(level), damping };
}
