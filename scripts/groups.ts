// Groups of the generated people (scripts/population.ts reads their rows): conditions that pick a group, and what is
// measured on it: its profile against everyone, a field split within it, the people left after each requirement,
// weights that match shares known from elsewhere, margins, a seeded draw, and one person as short phrases. Pure
// functions: no request is made here. Every share is between 0 and 1.
import { unbracketed } from "./format.ts";
import {
  countsByField,
  holds,
  numberAt,
  shareOf,
  valueCounts,
  valuesAt,
  type Field,
  type FieldValue,
  type ListedField,
  type NumericField,
  type Row,
  type Tier,
} from "./population.ts";

/** A condition on people (conditionsOf): the field it reads, what it says in words, and whether a person meets it. */
export interface Condition {
  path: string;
  text: string;
  /** The codes of the values named, on a condition that names some. */
  codes?: string[];
  /** On a numeric field's condition, the range counted: from the field's lowest value at the least. */
  range?: [number, number];
  test: (row: Row) => boolean;
}

/** A value's line in a profile: the share of the group holding it against the share of everyone. */
export interface ShareLine {
  path: string;
  tier: Tier;
  code: string;
  label: string;
  group: number;
  all: number;
  /** The group's share less everyone's. */
  gap: number;
  /** How many standard errors the group is from the rest. */
  errors: number;
  numeric?: undefined;
}

/** A numeric field's line in a profile: its middle value in the group and among everyone, null when none has one. */
export interface MedianLine {
  path: string;
  tier: Tier;
  numeric: true;
  group: number | null;
  all: number | null;
  code?: undefined;
  label?: undefined;
  gap?: undefined;
  errors?: undefined;
}

export type ProfileLine = ShareLine | MedianLine;

/** A band of a numeric field: the values from `range[0]` to `range[1]`, as words ("25 to 34", "75 or more"). */
export interface Band {
  range: [number, number];
  label: string;
}

/** A value's line in a split: the share of the group holding it, and the share of everyone it is compared with. */
export interface SplitShare {
  code: string;
  label: string;
  group: number;
  all: number;
  numeric?: undefined;
}

/** The first line of a numeric field's split: its middle value in the group and among everyone. */
export interface SplitMedian {
  label: string;
  group: number | null;
  all: number | null;
  numeric: true;
  code?: undefined;
}

export type SplitLine = SplitShare | SplitMedian;

/** Requirements applied in turn (reach): the people at the start, how many are left after each, and who is in or out. */
export interface Reach {
  start: number;
  steps: { text: string; left: number }[];
  /** The positions of the people who meet every requirement. */
  in: number[];
  /** The positions of the people who dropped out. */
  out: number[];
}

/** A share left out of a fit (rakeWhatFits): its position among those given, and why. */
export interface LeftOut {
  k: number;
  why: string;
}

/** What rakeWhatFits finds: the weights (null when no share is kept), the shares kept, and those left out. */
export interface Raking {
  w: Float64Array | null;
  kept: number[];
  left: LeftOut[];
}

/** A short phrase about a person (sheet), with the field it comes from. */
export interface Phrase {
  name: string;
  text: string;
}

/** One person as short phrases (sheet): those always wanted, and those that set the person apart. */
export interface Sheet {
  always: Phrase[];
  telling: Phrase[];
}

// What a run keeps about everyone, for each people list and field list: every profile of a run compares a group with
// the same people, so their counts and medians are worked out once.
const everyone = new WeakMap<Row[], WeakMap<Field[], Map<string, unknown>>>();
const keptFor = <T>(people: Row[], fields: Field[], key: string, make: () => T): T => {
  if (!everyone.has(people)) everyone.set(people, new WeakMap());
  const byFields = everyone.get(people)!;
  if (!byFields.has(fields)) byFields.set(fields, new Map());
  const kept = byFields.get(fields)!;
  if (!kept.has(key)) kept.set(key, make());
  // A key is always made by the same `make`.
  return kept.get(key) as T;
};

/** The middle value of field `f` among `rows`, or null when none has a value. */
function medianOf(rows: Row[], f: number) {
  const xs = new Float64Array(rows.length);
  let k = 0;
  for (let i = 0; i < rows.length; i++) {
    const x = numberAt(rows[i], f);
    if (x !== null) xs[k++] = x;
  }
  return k ? xs.subarray(0, k).sort()[k >> 1] : null;
}

/** The fields whose names share a word with a name that is not one (age_band: age_years, life_stage), for an error. */
export function nearestFields(fields: Field[], name: string): string {
  const words = String(name)
    .toLowerCase()
    .split(/[_.\s]+/)
    .filter((w) => w.length > 2);
  const shared = (x: Field) =>
    x.name.split("_").filter((part) => words.some((w) => part === w || (w.length > 3 && part.startsWith(w)))).length;
  return (
    fields
      .filter((x) => shared(x))
      .sort((a, b) => shared(b) - shared(a) || a.name.length - b.name.length)
      .map((x) => x.name)
      .slice(0, 12)
      .join(", ") || "none"
  );
}

/**
 * A numeric field's bands, covering the people from the lowest value to the top. Age takes the usual bands (18 to 24,
 * then ten years each, 75 and over); any other number is cut where its quantiles fall, so each band holds a fair part
 * of the people.
 */
export function bandsOf(field: NumericField): Band[] {
  const min = field.range?.min ?? 0,
    max = field.range?.max ?? Math.max(...Object.values(field.quantiles ?? {}), min);
  const cuts =
    field.range?.unit === "years" && min === 18
      ? [25, 35, 45, 55, 65, 75]
      : [...new Set(Object.values(field.quantiles ?? {}))].sort((a, b) => a - b);
  const starts = [min, ...cuts.filter((c) => c > min && c <= max)];
  return starts.map((lo, i): Band => {
    const hi = i < starts.length - 1 ? starts[i + 1] - 1 : max;
    return {
      range: [lo, hi],
      label: hi === lo ? String(lo) : i === starts.length - 1 ? `${lo} or more` : `${lo} to ${hi}`,
    };
  });
}

/** Text as a code would write it: "Doing okay financially" is doing_okay_financially. */
export const slug = (text: string): string =>
  String(text)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

/**
 * The index of the value a condition names, or -1. Its code; else its label written as a code; else the one value
 * whose code or label starts with the words given. A label is often written as a code ("doing_okay_financially") or cut
 * short ("finding_it_difficult_to_get_by" for "Finding it difficult to get by financially"), and refusing it would cost
 * a call. The label counted is printed, so a match is never silent; two values that start the same way match neither.
 */
export function valueOf(field: ListedField, code: string): number {
  const exact = field.values.findIndex((value) => value.code === code);
  if (exact >= 0) return exact;
  const want = slug(code);
  if (!want) return -1;
  const labelled = field.values
    .map((value, i): [number, string] => [i, slug(value.label)])
    .filter(([, label]) => label === want);
  if (labelled.length === 1) return labelled[0][0];
  const starts = field.values
    .map((value, i): [number, FieldValue] => [i, value])
    .filter(([, value]) => [value.code, slug(value.label)].some((text) => text.startsWith(`${want}_`)));
  return starts.length === 1 ? starts[0][0] : -1;
}

/**
 * Conditions on people, from text such as "home_tenure=owned_outright", "life_stage=retired|empty_nester",
 * "age_years=18..34" or "shift_work!=no_shift_work|not_in_employment" (none of those values). All must hold for a
 * person to belong.
 */
export function conditionsOf(fields: Field[], texts: string[]): Condition[] {
  const conditions = texts.map((text): Condition => {
    const not = /^[^=]+!=/.test(text);
    const [name, want = ""] = (not ? text.replace("!=", "=") : text).split("=");
    if (not) {
      const [condition] = conditionsOf(fields, [`${name}=${want}`]);
      if (fields.find((field) => field.name === name || field.path === name)?.quantiles)
        throw new Error(`${name} is a number: give the range you want, not the one you do not`);
      return { path: condition.path, text: `not ${condition.text}`, test: (row) => !condition.test(row) };
    }
    const f = fields.findIndex((field) => field.name === name || field.path === name);
    if (f < 0 && /\s/.test(name.trim()))
      throw new Error(
        [
          `"${text}" is a sentence, not a condition.`,
          "A condition is field=code, such as age_years=18..34 (the people tool lists the fields and codes).",
          'A sentence about whom a term suits belongs in "fits_everyone" (why it suits everyone),',
          'and why a term needs no suggestion in "no_suggestion".',
        ].join(" "),
      );
    // A code alone ("a,b" written for "a or b") names no field: the error says whose code it is.
    const holder = f < 0 && !text.includes("=") ? fields.find((x) => x.values?.some((v) => v.code === name)) : null;
    if (holder)
      throw new Error(
        `"${name}" is a code of ${holder.name}, not a condition: write ${holder.name}=${name}, and for either of two codes join them with |: ${holder.name}=a|b`,
      );
    if (f < 0) throw new Error(`No field "${name}" in the map. Nearest: ${nearestFields(fields, name)}`);
    const field = fields[f];
    if (field.quantiles) {
      const [asked, askedTo] = want.split("..").map(Number);
      if (!Number.isFinite(asked) || !Number.isFinite(askedTo))
        throw new Error(`${field.name} is a number: give a range, such as ${field.name}=18..34`);
      if (askedTo < asked) throw new Error(`${field.name}=${want}: give the lower number first`);
      // The people start at the field's lowest value (adults are 18 and over): a range that starts below it is said,
      // never counted silently, and a range wholly outside the people cannot be counted at all (a count of 0 there
      // would be no finding). Above the top nobody is left out: the top holds everyone at or over it (age 100 means
      // 100 or over), so age_years=65..120 is counted and labelled as asked.
      const min = field.range?.min ?? -Infinity,
        max = field.range?.max ?? Infinity;
      const span = `the people run from ${min} to ${max}${field.range?.note ? `, where ${field.range.note}` : ""}`;
      if (askedTo < min || asked > max)
        throw new Error(
          `${field.name} ${asked} to ${askedTo} is outside the people: ${span}, so nobody there can be counted. Give a range inside it; a figure for the rest needs a published source, named as such.`,
        );
      const low = Math.max(asked, min);
      const text =
        low === asked
          ? `${field.name} ${asked} to ${askedTo}`
          : `${field.name} ${low} to ${askedTo} (asked ${asked} to ${askedTo}; ${span})`;
      return {
        path: field.path,
        text,
        range: [low, Math.min(askedTo, max)],
        test: (row) => {
          const x = numberAt(row, f);
          return x !== null && x >= low && x <= askedTo;
        },
      };
    }
    if (want.includes("..")) {
      if (!field.order) throw new Error(`${field.name} is not a scale: name its codes joined by |`);
      const [from, to] = want.split("..").map((code) => field.order!.indexOf(code));
      if (from < 0 || to < 0) {
        // Numbers given for a scale of bands (income=20000..80000) are matched to the bands that hold them, and said.
        const [low, high] = want
          .split("..")
          .map((end) =>
            field.order!.includes(end) ? end : /^\d+$/.test(end) ? bandHolding(field.order!, Number(end)) : null,
          );
        const bands =
          low && high
            ? ` ${field.name}=${want} names numbers: ${field.name}=${low}..${high} counts the bands that hold them.`
            : "";
        throw new Error(
          `For a range of ${field.name}, give two codes of its scale, the lower first: ${field.order.join(" < ")}.${bands}`,
        );
      }
      return conditionsOf(fields, [
        `${name}=${field.order.slice(Math.min(from, to), Math.max(from, to) + 1).join("|")}`,
      ])[0];
    }
    const wanted = want.split("|").map((code) => {
      const v = valueOf(field, code);
      if (v >= 0) return v;
      const near = field.values
        .filter((value) => value.code.includes(slug(code)) || slug(value.label).includes(slug(code)))
        .slice(0, 8)
        .map((value) => value.code);
      // A long list (hundreds of occupations, thousands of interests) is not printed whole: a word finds its codes.
      throw new Error(
        `No value "${code}" for ${field.name}.${near.length ? ` Nearest: ${near.join(", ")}.` : ""} ${
          field.values.length <= 40
            ? `Values: ${field.values.map((value) => value.code).join(", ")}`
            : `It has ${field.values.length.toLocaleString("en-GB")} values; the most held: ${field.values
                .slice(0, 12)
                .map((value) => value.code)
                .join(", ")}. Look one up with the people tool, action find and a word.`
        }`,
      );
    });
    return {
      path: field.path,
      text: wanted.map((v) => field.values[v].label).join(" or "),
      codes: wanted.map((v) => field.values[v].code),
      test: (row) => wanted.some((v) => holds(field, row, f, v)),
    };
  });
  // A person holds one value of a field that is not a list, so two conditions on it that share no code hold nobody:
  // a count of 0 there is a slip in the asking ("a, b" for "a or b"), never a finding.
  conditions.forEach((a, i) => {
    const b = conditions.slice(i + 1).find((c) => c.path === a.path && c.codes && a.codes);
    const field = b && fields.find((x) => x.path === a.path);
    if (!b || !field || field.kind === "list" || a.codes!.some((code) => b.codes!.includes(code))) return;
    throw new Error(
      `A person has one ${field.name}, so "${a.text}" and "${b.text}" together hold nobody. For either, join the codes with |: ${field.name}=${[...a.codes!, ...b.codes!].join("|")}`,
    );
  });
  return conditions;
}

/** The band of a scale whose code holds a number: 25000 is in 20000_to_29999_gbp, 9000 in under_12570_gbp. */
export function bandHolding(codes: string[], n: number): string | undefined {
  return codes.find((code) => {
    const [lo, hi] = (code.match(/\d+/g) ?? []).map(Number);
    if (lo === undefined) return false;
    if (/^\d+$/.test(code)) return n === lo;
    if (/^(under|less_than|below)_/.test(code)) return n < lo;
    if (/_(or_more|or_over|and_over|plus)(_|$)/.test(code)) return n >= lo;
    return hi !== undefined && n >= lo && n <= hi;
  });
}

/** Whether a person (a row) meets every one of the conditions (from conditionsOf). */
export const matches = (conditions: Condition[], row: Row): boolean => conditions.every((c) => c.test(row));

/** The conditions as words, all of them: "Retired, and Owns outright". */
export const describeConditions = (conditions: Condition[]): string => conditions.map((c) => c.text).join(", and ");

/**
 * What marks a group out from everyone: for every listed value of every field, the share of the group holding it
 * against the share of all the people, with the gap and how many standard errors it is. `inGroup` says for each
 * person whether they belong. Numeric fields come back as medians. Largest gap first.
 */
export function profile(fields: Field[], people: Row[], inGroup: boolean[]): ProfileLine[] {
  const group = people.filter((_, i) => inGroup[i]);
  const out: ProfileLine[] = [];
  const insideAll = countsByField(fields, group),
    everyoneAll = keptFor(people, fields, "counts", () => countsByField(fields, people));
  fields.forEach((field, f) => {
    if (field.quantiles) {
      out.push({
        path: field.path,
        tier: field.tier,
        numeric: true,
        group: medianOf(group, f),
        all: keptFor(people, fields, `median ${f}`, () => medianOf(people, f)),
      });
      return;
    }
    const inside = insideAll[f],
      all = everyoneAll[f];
    (field.values ?? []).forEach((value, v) => {
      const a = inside[v] / group.length;
      const b = all[v] / people.length;
      const rest = people.length - group.length;
      const others = rest ? (b * people.length - a * group.length) / rest : b;
      const pooled = Math.sqrt(b * (1 - b) * (1 / group.length + 1 / Math.max(1, rest)));
      out.push({
        path: field.path,
        tier: field.tier,
        code: value.code,
        label: value.label ?? value.code,
        group: a,
        all: b,
        gap: a - b,
        errors: pooled ? (a - others) / pooled : 0,
      });
    });
  });
  return out.sort((x, y) => Math.abs(y.gap ?? 0) - Math.abs(x.gap ?? 0));
}

/**
 * Requirements applied one after another: how many people are left after each. `conditions` come from conditionsOf;
 * `among` limits the start to some people.
 */
export function reach(people: Row[], conditions: Condition[], among: number[] | null = null): Reach {
  let left = among ?? people.map((_, i) => i);
  const start = left.length,
    first = new Set(left),
    steps: Reach["steps"] = [];
  for (const condition of conditions) {
    left = left.filter((i) => condition.test(people[i]));
    steps.push({ text: condition.text, left: left.length });
  }
  const kept = new Set(left);
  return { start, steps, in: left, out: [...first].filter((i) => !kept.has(i)) };
}

/**
 * One field broken down within a group: for each of its values, the share of the group holding it and the share of
 * everyone the group is compared with. `group` and `all` are lists of person indices.
 */
export function split(field: Field, f: number, people: Row[], group: number[], all: number[]): SplitLine[] {
  if (field.quantiles) {
    // The middle value, then the field's own bands: given the middle value alone, a reader makes bands of their own,
    // often of unequal width, and equal counts in them then look like an even spread.
    const median = (list: number[]) => {
      const xs = list
        .map((i) => numberAt(people[i], f))
        .filter((x) => x !== null)
        .sort((a, b) => a - b);
      return xs.length ? xs[xs.length >> 1] : null;
    };
    const share = (list: number[], [lo, hi]: [number, number]) =>
      list.length
        ? list.filter((i) => {
            const x = numberAt(people[i], f);
            return x !== null && x >= lo && x <= hi;
          }).length / list.length
        : 0;
    return [
      { label: "middle value", group: median(group), all: median(all), numeric: true },
      ...bandsOf(field).map((band) => ({
        code: `${band.range[0]}..${band.range[1]}`,
        label: band.label,
        group: share(group, band.range),
        all: share(all, band.range),
      })),
    ];
  }
  const inGroup = valueCounts(
      field,
      f,
      group.map((i) => people[i]),
    ),
    inAll = valueCounts(
      field,
      f,
      all.map((i) => people[i]),
    );
  return (field.values ?? []).map((value, v) => ({
    code: value.code,
    label: value.label ?? value.code,
    group: group.length ? inGroup[v] / group.length : 0,
    all: all.length ? inAll[v] / all.length : 0,
  }));
}

/** Why a share cannot be met among these rows, or null: no one meets the condition, or everyone does, against the share. */
function impossible(mask: Uint8Array, target: number) {
  const m = mask.reduce((s, x) => s + x, 0);
  if (m === 0 && target > 0) return "no one in this audience is like that";
  if (m === mask.length && target < 1) return "everyone in this audience is like that";
  return null;
}

/** Iterative proportional fitting; `worst` is how far the furthest share ends from its target, as a proportion. */
function fitWeights(masks: Uint8Array[], targets: number[], rounds: number) {
  const n = masks[0]?.length ?? 0,
    w = new Float64Array(n).fill(1);
  const t = targets.map((x) => Math.min(0.999, Math.max(0.001, x)));
  const shareOf = (mask: Uint8Array) => {
    let inside = 0,
      total = 0;
    for (let i = 0; i < n; i++) {
      total += w[i];
      if (mask[i]) inside += w[i];
    }
    return inside / total;
  };
  for (let r = 0; r < rounds; r++) {
    let worst = 0;
    masks.forEach((mask, k) => {
      const s = shareOf(mask);
      worst = Math.max(worst, Math.abs(s - t[k]));
      const up = t[k] / s,
        down = (1 - t[k]) / (1 - s);
      for (let i = 0; i < n; i++) w[i] *= mask[i] ? up : down;
    });
    if (worst < 1e-6) break;
  }
  const mean = w.reduce((s, x) => s + x, 0) / n;
  for (let i = 0; i < n; i++) w[i] /= mean;
  return { w, worst: Math.max(0, ...masks.map((mask, k) => Math.abs(shareOf(mask) - t[k]))) };
}

/**
 * Weights that make the rows match shares known from elsewhere (what the owner said of their customers): for each
 * condition, the weighted share of the rows meeting it equals its target, by fitting one condition at a time until
 * all hold (iterative proportional fitting); the weights average 1. As many shares are used as the rows allow. One is
 * left out, with the reason, when no one among the rows meets its condition (or everyone does) against what it says,
 * or when it cannot hold together with the shares kept before it: the shares are taken in order, and one that leaves
 * the fit more than `tolerance` off is dropped.
 */
export function rakeWhatFits<R>(
  rows: R[],
  conditions: { test: (row: R) => boolean }[],
  targets: number[],
  { rounds = 200, tolerance = 0.005 }: { rounds?: number; tolerance?: number } = {},
): Raking {
  const masks = conditions.map((c) => Uint8Array.from(rows, (row) => (c.test(row) ? 1 : 0)));
  const kept: number[] = [],
    left: LeftOut[] = [];
  let w: Float64Array | null = null;
  for (const [k, mask] of masks.entries()) {
    const why = impossible(mask, targets[k]);
    if (why) {
      left.push({ k, why });
      continue;
    }
    const fit = fitWeights([...kept.map((j) => masks[j]), mask], [...kept.map((j) => targets[j]), targets[k]], rounds);
    if (fit.worst > tolerance) {
      left.push({
        k,
        why: `it cannot hold together with the shares before it (the closest fit is ${(100 * fit.worst).toFixed(1)} in 100 off)`,
      });
      continue;
    }
    kept.push(k);
    w = fit.w;
  }
  return { w, kept, left };
}

/** The weighted share of some rows (a mask, or a list or Set of positions); `w` averages 1 over all rows. */
export function weightedShare(w: Float64Array, members: Uint8Array | Iterable<number>): number {
  let sum = 0;
  if (members instanceof Uint8Array) {
    for (let i = 0; i < w.length; i++) if (members[i]) sum += w[i];
  } else for (const i of members) sum += w[i];
  return sum / w.length;
}

/** How many unweighted people the weighted ones are worth, for margins: (sum of w) squared over the sum of w squared. */
export const effectiveN = (w: Float64Array): number => {
  let s = 0,
    s2 = 0;
  for (const x of w) {
    s += x;
    s2 += x * x;
  }
  return s2 ? (s * s) / s2 : 0;
};

/** The 95% margin, as a proportion, on a share measured on `n` people. */
export function margin(share: number, n: number): number {
  return n ? 1.96 * Math.sqrt((share * (1 - share)) / n) : 1;
}

/** The margin in points of 100, as printed after "give or take": "under 0.1" rather than 0.0 on a large count. */
export function giveOrTake(share: number, n: number): string {
  const m = margin(share, n);
  return m > 0 && m < 0.0005 ? "under 0.1" : (100 * m).toFixed(1);
}

/** Which lines of a profile marked keeps. */
export interface MarkOptions {
  /** The smallest gap kept, as a proportion. */
  gap?: number;
  /** The fewest standard errors a gap kept is from the rest. */
  errors?: number;
  /** The most lines kept. */
  top?: number;
  /** The most lines kept from one field. */
  perField?: number;
}

/**
 * The lines of a profile worth printing: real gaps of `gap` or more, at most `perField` lines from one field, and
 * without the repeats a fact shows under several fields (gender beside sex, "not in employment" under every work field).
 */
export function marked(
  lines: ProfileLine[],
  { gap = 0.05, errors = 4, top = 12, perField = 2 }: MarkOptions = {},
): ShareLine[] {
  const seen = new Set<string>(),
    fromField = new Map<string, number>(),
    out: ShareLine[] = [];
  for (const line of lines) {
    if (line.numeric || Math.abs(line.gap) < gap || Math.abs(line.errors) < errors) continue;
    const same = `${line.gap > 0}|${Math.round(100 * line.group)}|${Math.round(100 * line.all)}`;
    const path = line.path === "identity.gender" ? "identity.sex_at_birth" : line.path;
    if (seen.has(same) || seen.has(line.label) || (fromField.get(path) ?? 0) >= perField) continue;
    seen.add(same);
    seen.add(line.label);
    fromField.set(path, (fromField.get(path) ?? 0) + 1);
    out.push(line);
    if (out.length >= top) break;
  }
  return out;
}

/** `n` of the given items, drawn without replacement. The same seed gives the same draw. */
export function draw<T>(items: T[], n: number, seed: number | string = 1): T[] {
  let state = Number(seed) >>> 0 || 1;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pool = [...items];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.max(0, n));
}

/** A value's label as a sheet gives it: without brackets, and up to its first comma when long. */
export function sheetText(label: string) {
  const text = unbracketed(label);
  return text.length > 60 ? text.split(",")[0] : text;
}

/**
 * One person as short phrases. `always` names fields that are printed whatever the person's value. `telling` names
 * fields printed only when they set the person apart: a single value held by under three in ten adults, a listed thing
 * held by under 15%, or the lack of a listed thing that 70% or more have ("no smartphone").
 * A phrase already given by an earlier field is not repeated.
 */
export function sheet(
  fields: Field[],
  row: Row,
  { always = [], telling = [] }: { always?: string[]; telling?: string[] } = {},
): Sheet {
  const at = (name: string) => fields.findIndex((field) => field.name === name || field.path === name);
  const out: Sheet = { always: [], telling: [] };
  for (const name of always) {
    const f = at(name);
    if (f < 0 || row[f] === null || row[f] === -1) continue;
    const field = fields[f];
    const texts = field.quantiles
      ? numberAt(row, f) === null
        ? []
        : [String(row[f])]
      : valuesAt(field, row, f)
          .filter((v) => field.values?.[v])
          .map((v) => sheetText(field.values[v].label ?? field.values[v].code));
    for (const text of texts)
      if (!out.always.some((entry) => entry.text === text)) out.always.push({ name: field.name, text });
  }
  for (const name of telling) {
    const f = at(name);
    if (f < 0 || row[f] === null || !fields[f].values) continue;
    const values = fields[f].values;
    if (Array.isArray(row[f]) || fields[f].kind === "list") {
      values.forEach((value, v) => {
        const share = shareOf(value.share) ?? 0,
          has = holds(fields[f], row, f, v),
          label = sheetText(value.label ?? value.code);
        if (has && share < 0.15) out.telling.push({ name: fields[f].name, text: label });
        if (!has && share >= 0.7)
          out.telling.push({ name: fields[f].name, text: `no ${label.charAt(0).toLowerCase()}${label.slice(1)}` });
      });
    } else if (values[row[f]] && (shareOf(values[row[f]].share) ?? 0) < 0.3)
      out.telling.push({ name: fields[f].name, text: sheetText(values[row[f]].label ?? values[row[f]].code) });
  }
  return out;
}
