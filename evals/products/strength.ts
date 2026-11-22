#!/usr/bin/env node
// How strong a lead must be before it points the right way, on the 32 products with published figures. The products
// were scanned asking about every field of the UK map (answers/every-fact/, 21 November 2026). Each published group in a
// breakdown that covers everyone once (age, sex, social grade, tenure) is read as a corner is read, its odds against
// everyone's, and held against the published figures: is a group the scan reads as keener really keener?
//
//   node evals/products/strength.ts      reads the saved answers; sends nothing
//
// It reads three sets of fields: the six the published groups are defined by, the ten general ones and those six (what
// a cheaper scan asks about), and every field. For each, how big a reading is against its published size, with the
// damping nxk sets by how many fields are read (scripts/scan-answers.ts dampingFor) and with the fixed 0.1 it replaced,
// and how often each strength of reading (scripts/product.ts strengthOf) points the right way.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isMain } from "../../scripts/cli.ts";
import { roomOf, scoresOf, type Room } from "../../scripts/corners.ts";
import { conditionsOf } from "../../scripts/groups.ts";
import { loadPeople } from "../../scripts/population.ts";
import { strengthOf, type Strength } from "../../scripts/product.ts";
import { GENERAL_FIELDS } from "../../scripts/scan-answers.ts";
import { linesOf, mean } from "../lib.ts";
import { clear, loadProducts, SIX, type Product } from "./run.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
export const EVERY_FACT = join(HERE, "answers", "every-fact");
const MODEL = "gemini-decision-1";

const logit = (p: number) => Math.log(p / (1 - p));

/** A published group read on the people: its people, its published figure, and its odds against its breakdown's average. */
export interface Read {
  product: string;
  batch: number;
  dimension: string;
  label: string;
  list: number[];
  percent: number;
  /** The published figure's odds against the breakdown's average, weighting each group by its people. */
  published: number;
}

/**
 * The published groups of a product in breakdowns that cover everyone once, each with its odds against the breakdown's
 * average (groups weighted by how many of the people they hold). A breakdown whose groups overlap or leave people out
 * (income bands that stop short) has no average to read against, and is left out.
 */
export function breakdowns(product: Product, listOf: (cond: string) => number[], N: number): Read[][] {
  const by = new Map<string, Product["groups"]>();
  for (const g of product.groups) by.set(g.dimension, [...(by.get(g.dimension) ?? []), g]);
  return [...by].flatMap(([dimension, groups]) => {
    const lists = groups.map((g) => listOf(g.cond));
    const covered = lists.reduce((s, l) => s + l.length, 0);
    if (Math.abs(covered - N) / N >= 0.05 || new Set(lists.flat()).size !== covered) return [];
    const average = groups.reduce((s, g, k) => s + (g.percent / 100) * lists[k].length, 0) / covered;
    return [
      groups.map((g, k) => ({
        product: product.id,
        batch: product.batch,
        dimension,
        label: g.label,
        list: lists[k],
        percent: g.percent,
        published: Math.exp(logit(Math.min(0.995, Math.max(0.005, g.percent / 100))) - logit(average)),
      })),
    ];
  });
}

/** A group as the scan reads it: its odds against everyone's (as corners.ts keenestOn reads a corner) and mean answer. */
export interface Scanned {
  group: Read;
  odds: number;
  p: number;
}

/** How often each strength of reading points the right way: groups read as keener, as colder, and every pair. */
export interface Row {
  strength: Strength;
  keen: [number, number];
  cold: [number, number];
  pairs: [number, number];
}

const STRENGTHS: Strength[] = ["strong", "lead", "faint", "none"];

export function byStrength(read: Scanned[][]): Row[] {
  return STRENGTHS.map((strength) => {
    const groups = read.flat();
    const keen = groups.filter((x) => x.odds > 1 && strengthOf(x.odds) === strength),
      cold = groups.filter((x) => x.odds < 1 && strengthOf(1 / x.odds) === strength);
    const pairs: boolean[] = [];
    for (const breakdown of read)
      for (let a = 0; a < breakdown.length; a++)
        for (let b = a + 1; b < breakdown.length; b++) {
          const [high, low] =
            breakdown[a].odds >= breakdown[b].odds ? [breakdown[a], breakdown[b]] : [breakdown[b], breakdown[a]];
          if (high.group.percent === low.group.percent || strengthOf(high.odds / low.odds) !== strength) continue;
          pairs.push(high.group.percent > low.group.percent);
        }
    return {
      strength,
      keen: [keen.filter((x) => x.group.published > 1).length, keen.length],
      cold: [cold.filter((x) => x.group.published < 1).length, cold.length],
      pairs: [pairs.filter(Boolean).length, pairs.length],
    };
  });
}

/**
 * How big a reading is against its published size: the published log odds over the scan's, fitted through zero on
 * every group (1 when the scan reads differences at their published size, above 1 when it reads them smaller), and the
 * clear pairs (run.ts) the scan puts the right way round on its mean answers.
 */
export function sizeOf(read: Scanned[][]): { size: number; right: number; of: number } {
  const groups = read.flat();
  const xy = groups.reduce((s, x) => s + Math.log(x.odds) * Math.log(x.group.published), 0),
    xx = groups.reduce((s, x) => s + Math.log(x.odds) ** 2, 0);
  let right = 0,
    of = 0;
  for (const breakdown of read)
    for (let a = 0; a < breakdown.length; a++)
      for (let b = a + 1; b < breakdown.length; b++) {
        const [x, y] = [breakdown[a], breakdown[b]];
        if (!clear(x.group.percent, y.group.percent, x.group.batch === 2)) continue;
        of++;
        if (x.group.percent > y.group.percent === x.p > y.p) right++;
      }
  return { size: xy / xx, right, of };
}

/** Each product's saved answers by "path=code", for one decision model. */
function answersOf(product: Product): Map<string, number> {
  const file = join(EVERY_FACT, `scan-${product.id}.jsonl`);
  if (!existsSync(file)) throw new Error(`No answers for ${product.id} in ${EVERY_FACT}`);
  const by = new Map<string, number[]>();
  for (const line of linesOf(file)) {
    const row = JSON.parse(line);
    if ((row.m ?? MODEL) === MODEL) by.set(row.id, [...(by.get(row.id) ?? []), row.p]);
  }
  return new Map([...by].map(([id, ps]): [string, number] => [id, mean(ps) as number]));
}

/** Every product's groups read from the answers to `fields` (null: every field), at `damping` (undefined: nxk's own). */
function readAll(
  room: Room,
  products: Product[],
  reads: Map<string, Read[][]>,
  answers: Map<string, Map<string, number>>,
  fields: Set<string> | null,
  damping?: number,
) {
  return products.flatMap((product) => {
    const all = answers.get(product.id) as Map<string, number>;
    const only = fields
      ? new Map([...all].filter(([id]) => id === "base" || fields.has(id.split("=")[0].split(".").pop() as string)))
      : all;
    const s = scoresOf(room, only, { damping });
    const everyone = mean(Array.from(s.l)) as number;
    return (reads.get(product.id) as Read[][]).map((breakdown) =>
      breakdown.map((group): Scanned => {
        let l = 0,
          p = 0;
        for (const i of group.list) {
          l += s.l[i];
          p += s.p[i];
        }
        return { group, odds: Math.exp(l / group.list.length - everyone), p: p / group.list.length };
      }),
    );
  });
}

const share = ([n, of]: [number, number]) => (of ? `${n} of ${of} (${Math.round((100 * n) / of)}%)` : "none");
const NAMES: Record<Strength, string> = {
  strong: "x2 or more (strong)",
  lead: "x1.5 to x2 (lead to test)",
  faint: "x1.15 to x1.5 (faint)",
  none: "under x1.15 (none)",
};

function main() {
  const products = loadProducts();
  const { map, people } = loadPeople("uk");
  const room = roomOf(map.fields, people);
  const memo = new Map<string, number[]>();
  const listOf = (cond: string) => {
    if (!memo.has(cond)) {
      const test = conditionsOf(map.fields, cond.split(","));
      memo.set(
        cond,
        people.flatMap((row, i) => (test.every((c) => c.test(row)) ? [i] : [])),
      );
    }
    return memo.get(cond) as number[];
  };
  const reads = new Map(products.map((product) => [product.id, breakdowns(product, listOf, people.length)]));
  const answers = new Map(products.map((product) => [product.id, answersOf(product)]));
  const groups = [...reads.values()].flat(2).length;
  console.log(
    `The 32 products scanned asking about every field, read against the published figures: ${groups} groups in breakdowns that cover everyone once.`,
  );
  const sets: [string, Set<string> | null][] = [
    ["the six", new Set(SIX)],
    ["ten general and the six", new Set([...GENERAL_FIELDS, ...SIX])],
    ["every field", null],
  ];
  console.log(
    "\nA reading's published size, as many times the reading (1 is its size), and the clear pairs in those breakdowns (run.ts) the right way round:",
  );
  for (const [name, fields] of sets) {
    const own = sizeOf(readAll(room, products, reads, answers, fields)),
      fixed = sizeOf(readAll(room, products, reads, answers, fields, 0.1));
    console.log(
      `  ${name.padEnd(24)} ${own.size.toFixed(2)} as nxk adds facts up (${own.right} of ${own.of} right); ${fixed.size.toFixed(2)} at a fixed 0.1 (${fixed.right} of ${fixed.of})`,
    );
  }
  for (const [name, fields] of sets.slice(1)) {
    console.log(
      `\nBy strength, reading ${name}: groups read as keener that are keener, read as colder that are colder, and pairs the right way round`,
    );
    for (const row of byStrength(readAll(room, products, reads, answers, fields)))
      console.log(
        `  ${NAMES[row.strength].padEnd(26)} keener ${share(row.keen)}; colder ${share(row.cold)}; pairs ${share(row.pairs)}`,
      );
  }
  return 0;
}

if (isMain(import.meta.url)) process.exit(main());
