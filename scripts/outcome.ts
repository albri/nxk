// What happened, against what nxk said beforehand. The owner's own results (take-up by group from an advert, an A/B
// split, who the first customers turned out to be) are set beside the direction a scan, a segment or a decision
// pointed. Each comparison ends as one of:
//
//   agrees              the results clearly lean the way nxk said
//   disagrees           they clearly lean the other way
//   too few to tell     the results could go either way; it says about how many more would tell
//   nothing to compare  nxk said nothing about it (not scanned on those facts, or no lean of 5% or more)
//
// Only directions are compared: a scan's levels are not a forecast (tested.md). "Clearly" is a 95% interval that
// does not cross zero, widened for the number of comparisons made at once (Bonferroni), so that more groups do not
// make a chance difference look like a finding. The MCP server's outcome_record tool uses these functions; they make
// no request and write nothing.
import { existsSync, readFileSync } from "node:fs";
import { canonical, modelOf } from "./decision-model.ts";
import { join } from "node:path";
import { scoresOf, type Room } from "./corners.ts";
import { conditionsOf, describeConditions, matches } from "./groups.ts";
import type { Parts } from "./log.ts";
import type { Claim, Comparison, Scan, Verdict } from "./product.ts";
import type { SavedAnswer } from "./scan.ts";

/** Take-up in one arm: how many were shown it and how many took it. */
export interface Rate {
  shown: number;
  took: number;
}

/** One arm of a result compared pair by pair: a group or an option. */
export interface Arm extends Rate {
  name: string;
}

/** A group of customers: how many are in it, its counted share of adults, and nxk's keenness there over all adults. */
export interface CustomerArm {
  name: string;
  took: number;
  share: number;
  lean?: number | null;
}

/** An interval for a difference: from `lo` to `hi`. */
export interface Interval {
  lo: number;
  hi: number;
}

/** What nxk said of a against b: the direction (1, -1 or 0), the lean as a ratio (or null), and in words. */
export interface SaidBefore {
  direction: number;
  lean?: number | null;
  text: string;
}

/** A comparison with its line as printed. */
export interface Compared extends Comparison {
  line: string;
}

/** What a scan says about one group (scanSays). */
export interface GroupSaid {
  among: string;
  text: string;
  /** The group's counted share of the people, and how many they are. */
  share: number;
  n: number;
  /** The group's average simulated keenness, or null where the scan says nothing. */
  keen: number | null;
  /** The fields naming the group that the scan did not ask about. */
  unasked: string[];
}

/** How many comparisons of one claim agreed, disagreed or could not tell. */
export type Tally = Record<Exclude<Verdict, "nothing to compare">, number>;

/** A lean smaller than this (5% either way) is not a direction nxk said anything about. */
export const MIN_LEAN = Math.log(1.05);

/** The standard normal quantile, by Acklam's approximation (good to about 1e-9). */
export function normalQuantile(p: number): number {
  const a = [
    -39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239,
  ];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [
    -0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968,
    2.938163982698783,
  ];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const tail = (q: number) =>
    (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  if (p < 0.02425) return tail(Math.sqrt(-2 * Math.log(p)));
  if (p > 1 - 0.02425) return -tail(Math.sqrt(-2 * Math.log(1 - p)));
  const q = p - 0.5,
    r = q * q;
  return (
    ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
  );
}

/** The z for 95% two-sided, widened for `m` comparisons made at once. */
export const zFor = (m: number): number => normalQuantile(1 - 0.05 / (2 * Math.max(1, m)));

/** The Wilson interval for `k` of `n`. */
export function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (!n) return [0, 1];
  const p = k / n,
    z2 = z * z,
    d = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / d,
    half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / d;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

/** Newcombe's interval for the difference of two rates (a minus b), from their Wilson intervals: sound with small counts and zeros. */
export function difference(a: Rate, b: Rate, z = 1.96): Interval & { d: number } {
  const p1 = a.took / a.shown,
    p2 = b.took / b.shown;
  const [l1, u1] = wilson(a.took, a.shown, z),
    [l2, u2] = wilson(b.took, b.shown, z);
  const d = p1 - p2;
  return { d, lo: d - Math.sqrt((p1 - l1) ** 2 + (u2 - p2) ** 2), hi: d + Math.sqrt((u1 - p1) ** 2 + (p2 - l2) ** 2) };
}

/** About how many shown in each of two groups would tell rates of p1 and p2 apart, at this z and 80% power. */
export function neededEach(p1: number, p2: number, z = 1.96): number | null {
  const d = Math.abs(p1 - p2);
  return d ? Math.ceil(((z + 0.8416) ** 2 * (p1 * (1 - p1) + p2 * (1 - p2))) / (d * d)) : null;
}

/** The direction of a lean (a over b): 1, -1, or 0 when it is under 5% either way or there is none. */
export const directionOf = (lean: number | null | undefined): number =>
  lean === null || lean === undefined || Math.abs(Math.log(lean)) < MIN_LEAN ? 0 : Math.sign(Math.log(lean));

/** The verdict on an observed interval {lo, hi} (a minus b, or a share minus its base) against the direction nxk said. */
export function verdict(direction: number, { lo, hi }: Interval): Verdict {
  if (!direction) return "nothing to compare";
  if (lo <= 0 && hi >= 0) return "too few to tell";
  return lo > 0 === direction > 0 ? "agrees" : "disagrees";
}

/**
 * A scan's saved answers for one idea, as discover.ts keeps them: "path=code" to the average answer, from the decision
 * model the scan was made with (answers from another model are left out). Null when there are none.
 */
export function savedAnswers(
  scansDir: string,
  scan: Pick<Scan, "model" | "label">,
  key: string,
  country: string,
): Map<string, number> | null {
  const model = canonical(scan.model);
  const files = [
    join(scansDir, `ideas-${country}.spec`, `scan-${key}.jsonl`),
    join(scansDir, `${scan.label}.spec`, `scan-${key}.jsonl`),
  ];
  const file = files.find(existsSync);
  if (!file) return null;
  const by = new Map<string, number[]>();
  for (const line of readFileSync(file, "utf8").split("\n").filter(Boolean)) {
    const row: SavedAnswer = JSON.parse(line);
    if (modelOf(row) !== model) continue;
    if (!by.has(row.id)) by.set(row.id, []);
    by.get(row.id)!.push(row.p);
  }
  return by.size ? new Map([...by].map(([id, ps]) => [id, ps.reduce((s, p) => s + p, 0) / ps.length])) : null;
}

/**
 * What a scan says about one offer in each group: the average simulated keenness of the generated people in it, from
 * the saved answers (scored as discover.ts scores them), and the group's counted share of adults. `keen` is null
 * for a group named by a fact the scan did not ask about: there the scan says nothing, whatever the scores show.
 */
export function scanSays(
  room: Room,
  answers: Map<string, number> | null,
  groups: string[],
): { overall: number | null; groups: GroupSaid[] } {
  const { fields, people } = room;
  const scores = answers ? scoresOf(room, answers) : null;
  const overall = scores ? scores.mean : null;
  return {
    overall,
    groups: groups.map((among): GroupSaid => {
      const conditions = conditionsOf(
        fields,
        String(among)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      );
      // Every condition reads one of the fields (conditionsOf).
      const names = conditions.flatMap((c) => fields.find((field) => field.path === c.path)?.name ?? []);
      const members: number[] = [];
      people.forEach((row, i) => {
        if (matches(conditions, row)) members.push(i);
      });
      const asked = scores !== null && names.every((name) => scores.scanned.includes(name));
      const keen = asked && members.length ? members.reduce((s, i) => s + scores.p[i], 0) / members.length : null;
      return {
        among,
        text: describeConditions(conditions),
        share: members.length / people.length,
        n: members.length,
        keen,
        unasked: scores ? names.filter((name) => !scores.scanned.includes(name)) : [],
      };
    }),
  };
}

const rate = (x: number) => `${(100 * x).toFixed(x < 0.1 ? 2 : 1)}%`;
const points = (x: number) => `${x >= 0 ? "+" : ""}${(100 * x).toFixed(2)}`;
const n_ = (x: number) => x.toLocaleString("en-GB");

/**
 * Compare groups (one offer, take-up in each) or options (one choice, A/B), pair by pair. `arms` are
 * [{ name, shown, took }]; `pairs` lists [a, b]; `said(a, b)` is what nxk said of a against b, as
 * { direction (1, -1 or 0), lean (a ratio, or null), text }. Returns { lines, comparisons }.
 */
export function compareArms<A extends Arm>(
  arms: A[],
  pairs: [A, A][],
  said: (a: A, b: A) => SaidBefore,
): { lines: string[]; comparisons: Compared[] } {
  // Only the comparisons nxk said something about are tests; the intervals are widened for those alone.
  const saids = pairs.map(([a, b]) => said(a, b)),
    m = saids.filter((s) => s.direction).length;
  const z = zFor(m),
    level = m > 1 ? ` (each interval widened for the ${m} comparisons nxk said something about)` : "";
  const lines = arms.map((a) => {
    const [lo, hi] = wilson(a.took, a.shown);
    return `  ${a.name}: ${n_(a.took)} of ${n_(a.shown)}, ${rate(a.took / a.shown)} (95% from ${rate(lo)} to ${rate(hi)})`;
  });
  const comparisons = pairs.map(([a, b], i): Compared => {
    const ci = difference(a, b, z),
      s = saids[i],
      v = verdict(s.direction, ci);
    const need = v === "too few to tell" ? neededEach(a.took / a.shown, b.took / b.shown, z) : null;
    const tail = !need
      ? ""
      : need > 100000
        ? "; a difference this small would take over 100,000 shown in each to tell: treat these two as alike"
        : `; about ${n_(need)} shown in each would tell a difference this size, if it is real`;
    return {
      a: a.name,
      b: b.name,
      d: ci.d,
      lo: ci.lo,
      hi: ci.hi,
      lean: s.lean ?? null,
      direction: s.direction,
      verdict: v,
      line: `  ${a.name} against ${b.name}: ${points(ci.d)} points (from ${points(ci.lo)} to ${points(ci.hi)}). ${s.text[0].toUpperCase()}${s.text.slice(1)}: ${v}${tail}.`,
    };
  });
  return {
    lines: [...lines, ...(comparisons.length ? [`Compared${level}:`] : []), ...comparisons.map((c) => c.line)],
    comparisons,
  };
}

/**
 * Who the customers turned out to be: each group's share of the customers against its counted share of adults.
 * `arms` are [{ name, took (customers in the group), share (of adults, counted), lean (nxk's keenness there over all
 * adults, or null) }]; `total` is all customers counted. `parts` gives, line by line, the figures in a line that are not
 * the owner's (scripts/log.ts): the group's share of adults (counted) and the scan's keenness (simulated).
 */
export function compareCustomers(
  arms: CustomerArm[],
  total: number,
): { lines: string[]; comparisons: Compared[]; parts: (Parts | null)[] } {
  const m = arms.filter((a) => directionOf(a.lean)).length;
  const z = zFor(m),
    level = m > 1 ? ` (each interval widened for the ${m} groups nxk said something about)` : "";
  const comparisons = arms.map((a): Compared => {
    const [lo, hi] = wilson(a.took, total, z),
      seen = a.took / total,
      direction = directionOf(a.lean);
    const v = verdict(direction, { lo: lo - a.share, hi: hi - a.share });
    const leanText =
      a.lean === null || a.lean === undefined
        ? "nxk said nothing about them"
        : `the scan said x${a.lean.toFixed(2)} as keen as all adults (simulated)`;
    return {
      a: a.name,
      d: seen - a.share,
      lo: lo - a.share,
      hi: hi - a.share,
      lean: a.lean ?? null,
      direction,
      verdict: v,
      line: `  ${a.name}: ${n_(a.took)} of ${n_(total)} customers, ${rate(seen)} (from ${rate(lo)} to ${rate(hi)}), against ${rate(a.share)} of adults (counted). ${leanText}: ${v}.`,
    };
  });
  const parts = arms.map((a): Parts => ({
    counted: [`${rate(a.share)} of adults`],
    ...(a.lean === null || a.lean === undefined ? {} : { simulated: [`x${a.lean.toFixed(2)} as keen as all adults`] }),
  }));
  return {
    lines: [`Of ${n_(total)} customers${level}:`, ...comparisons.map((c) => c.line)],
    comparisons,
    parts: [null, ...parts],
  };
}

/** The claims nxk makes, as the track record counts them. */
export const CLAIMS: Record<Claim, string> = {
  scan_groups: "a scan: which groups are keener on an offer",
  segment_customers: "a segment or scan: who buys",
  decision_pick: "a decision: the option it picked",
  scan_order: "a scan: which offer more people take (not claimed by nxk; kept to measure it)",
};

/** The track record: for each claim, how many comparisons agreed, disagreed or could not tell. */
export function trackRecord(outcomes: { claim: Claim; comparisons?: Pick<Comparison, "verdict">[] }[]): {
  by: Partial<Record<Claim, Tally>>;
  lines: string[];
} {
  const by: Partial<Record<Claim, Tally>> = {};
  for (const o of outcomes)
    for (const c of o.comparisons ?? []) {
      if (c.verdict === "nothing to compare") continue;
      const t = (by[o.claim] ??= { agrees: 0, disagrees: 0, "too few to tell": 0 });
      t[c.verdict]++;
    }
  const lines = Object.entries(by).map(
    ([claim, t]) =>
      `${CLAIMS[claim as Claim] ?? claim}: ${t.agrees} agreed, ${t.disagrees} disagreed, ${t["too few to tell"]} too few to tell`,
  );
  return { by, lines };
}
