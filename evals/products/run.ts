#!/usr/bin/env node
// The scan against 32 existing products. Each is described without its name, and regulators publish who uses it by
// group: by age, sex, social grade, home tenure, household income or size of place. Every pair of groups in one
// breakdown whose published figures differ clearly is scored: right when the scan puts the higher group higher.
//
//   node evals/products/run.ts                          recounts every saved run in results/; sends nothing
//   node evals/products/run.ts --show=<run>             one saved run by breakdown and product, and its wrong pairs
//   node evals/products/run.ts --plan                   the requests and cost of a new run; sends nothing
//   node evals/products/run.ts --run [--max-usd=0.05]   scans the 32 products in nxk's own words, then scores
//   node evals/products/run.ts --score                  scores the saved answers again and checks them against their run
//
// A new run is nxk's scan (scripts/scan.ts) of a spec in the words nxk's scans use (scripts/discover.ts specOf),
// asked about the six facts the published groups are defined by, on the decision model, route and key that
// scripts/decision-model.ts picks (the key is read, never printed). Its answers are saved in answers/ beside this
// file, so a second run sends only what is missing; its pairs are written to results/<date>-year-on-offer-<route>.json.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { argsOf, isMain, usage } from "../../scripts/cli.ts";
import { decisionSetup, modelOf } from "../../scripts/decision-model.ts";
import { specOf } from "../../scripts/discover.ts";
import { conditionsOf } from "../../scripts/groups.ts";
import { loadMap, loadPeople, type Field, type Row } from "../../scripts/population.ts";
import { peopleAnswers, probesOf } from "../../scripts/scan-answers.ts";
import { run as scan, TOKENS_PER_QUESTION, type SavedAnswer, type ScanSpec } from "../../scripts/scan.ts";
import { linesOf, mean } from "../lib.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
export const PRODUCTS_FILE = join(HERE, "products.json");
export const RESULTS_DIR = join(HERE, "results");
const ANSWERS_DIR = join(HERE, "answers");
// The spec in nxk's words: run.test.ts checks it is still what scripts/discover.ts writes for these products.
export const SPEC_FILE = join(HERE, "specs", "year-on-offer.json");
export const SURVEYED = "November 2026";
// The facts the published groups are defined by: a new run asks about these and no others.
export const SIX = [
  "age_years",
  "sex_at_birth",
  "social_grade",
  "home_tenure",
  "household_income_before_tax_per_year",
  "settlement_size",
];
// The saved runs were scored with the six facts added up at 0.1, the fixed damping scans had then; nxk now sets it by
// how many fields are read (scripts/scan-answers.ts dampingFor), which strength.ts checks.
export const DAMPING = 0.1;

/**
 * A product's published group: the breakdown it is in (age, tenure), its label, the share of it that uses the product,
 * and who is in it, as a condition on the UK people.
 */
export interface ProductGroup {
  dimension: string;
  label: string;
  percent: number;
  cond: string;
}

/** A product in products.json, as far as the check reads it: described without its name, in the first or second batch. */
export interface Product {
  id: string;
  name: string;
  batch: number;
  description: string;
  groups: ProductGroup[];
}

/** Two groups of one breakdown whose published figures differ clearly (pairsOf): the higher first, and both figures. */
export interface Pair {
  product: string;
  dimension: string;
  higher: string;
  lower: string;
  published: number[];
}

/** A pair with the scan's figure for each group, the higher group's first. */
export interface ScoredPair extends Pair {
  scan: number[];
}

/**
 * A saved run (results/<name>.json): its wording and spec, the facts asked about ("every", or a list), how many people
 * it was scored on, the model and route, where its answers are (a new run's), and its pairs.
 */
export interface SavedRun {
  date: string;
  wording: string;
  spec: string;
  facts: string | string[];
  people: number;
  model: string;
  route: string;
  answers?: string;
  pairs: ScoredPair[];
}

/** The right pairs of a run (tally): in all, and by breakdown and by product as [right, of]. */
export interface Tally {
  right: number;
  of: number;
  byDimension: Map<string, [number, number]>;
  byProduct: Map<string, [number, number]>;
}

type Print = (text: string) => void;

export const loadProducts = (file = PRODUCTS_FILE): Product[] => JSON.parse(readFileSync(file, "utf8")).products;
export const loadRun = (file: string): SavedRun => JSON.parse(readFileSync(file, "utf8"));
const pct = (n: number, d: number) => `${((100 * n) / d).toFixed(1)}%`;

/**
 * Whether two published figures differ clearly: 3 points or more, and one at least 1.25 times the other. For the second
 * batch (`low`), two figures both under 10 also count when one is at least 1.5 times the other and a point or more
 * above it: on things few people do, a 3-point gap is rare however clear the difference. Both rules were fixed before
 * the batch they apply to was scanned.
 */
export function clear(a: number, b: number, low = false): boolean {
  const hi = Math.max(a, b),
    lo = Math.max(0.01, Math.min(a, b)),
    gap = Math.abs(a - b);
  return (gap >= 3 && hi / lo >= 1.25) || (low && hi < 10 && gap >= 1 && hi / lo >= 1.5);
}

/** Every pair of groups in one breakdown of one product whose published figures differ clearly, higher group first. */
export function pairsOf(products: Product[]): Pair[] {
  const pairs: Pair[] = [];
  for (const product of products) {
    const by = new Map<string, ProductGroup[]>();
    for (const group of product.groups) {
      if (!by.has(group.dimension)) by.set(group.dimension, []);
      by.get(group.dimension)!.push(group);
    }
    for (const [dimension, groups] of by)
      for (let a = 0; a < groups.length; a++)
        for (let b = a + 1; b < groups.length; b++) {
          if (!clear(groups[a].percent, groups[b].percent, product.batch === 2)) continue;
          const [higher, lower] =
            groups[a].percent > groups[b].percent ? [groups[a], groups[b]] : [groups[b], groups[a]];
          pairs.push({
            product: product.id,
            dimension,
            higher: higher.label,
            lower: lower.label,
            published: [higher.percent, lower.percent],
          });
        }
  }
  return pairs;
}

const keyOf = (pair: Pair) => `${pair.product}|${pair.dimension}|${pair.higher}|${pair.lower}`;

/** What is wrong with a saved run against products.json: a pair missing, added, or with other published figures. */
export function checkRun(run: SavedRun, products: Product[]): string[] {
  const want = new Map(pairsOf(products).map((pair): [string, Pair] => [keyOf(pair), pair]));
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const pair of run.pairs) {
    const key = keyOf(pair),
      known = want.get(key);
    if (!known) problems.push(`not a clear published pair: ${key}`);
    else if (known.published.join() !== pair.published.join())
      problems.push(
        `${key}: published ${pair.published.join(" and ")}, products.json ${known.published.join(" and ")}`,
      );
    if (!Array.isArray(pair.scan) || pair.scan.length !== 2 || !pair.scan.every(Number.isFinite))
      problems.push(`${key}: no scan figures`);
    seen.add(key);
  }
  for (const key of want.keys()) if (!seen.has(key)) problems.push(`missing: ${key}`);
  return problems;
}

/** A pair is right when the scan puts the group with the higher published figure higher. */
export const isRight = (pair: ScoredPair): boolean => pair.scan[0] > pair.scan[1];

/** The right pairs of a run: in all, by breakdown and by product, as [right, of]. */
export function tally(pairs: ScoredPair[]): Tally {
  const add = (to: Map<string, [number, number]>, key: string, pair: ScoredPair) => {
    const [r, n] = to.get(key) ?? [0, 0];
    to.set(key, [r + (isRight(pair) ? 1 : 0), n + 1]);
  };
  const byDimension = new Map<string, [number, number]>(),
    byProduct = new Map<string, [number, number]>();
  for (const pair of pairs) {
    add(byDimension, pair.dimension, pair);
    add(byProduct, pair.product, pair);
  }
  return { right: pairs.filter(isRight).length, of: pairs.length, byDimension, byProduct };
}

/** The spec nxk's scans would send for these products: each one an offer bought at home, in nxk's own words. */
export const specFor = (products: Product[]): ScanSpec =>
  specOf(
    products.map((product) => ({ key: product.id, offer: product.description, buying_category: "household" })),
    SURVEYED,
  );

/**
 * The pairs scored on the made-up people: each person's answer is built from the saved answers about the facts they
 * hold, and a group's figure is the average of its people. `answers` maps a product id to its answers by "path=code".
 */
export function scorePairs(
  products: Product[],
  allFields: Field[],
  allPeople: Row[],
  answers: Record<string, Map<string, number>>,
): ScoredPair[] {
  // Only the facts with answers or a group on them count, so the rest are dropped first, in the map's order: the same
  // figures, without reading 150 facts of 200,000 people for each product.
  const used = new Set([
    ...products.flatMap((product) => product.groups.flatMap((g) => g.cond.split(",").map((c) => c.split("=")[0]))),
    ...Object.values(answers).flatMap((byId) => [...byId.keys()].map((id) => id.split("=")[0])),
  ]);
  const cols = allFields.flatMap((field, f) => (used.has(field.name) || used.has(field.path) ? [f] : []));
  const fields = cols.map((f) => allFields[f]),
    people = allPeople.map((row) => cols.map((f) => row[f]));
  const means = new Map<string, number | null>();
  // Each group's people, found once: the products share most of their groups.
  const members = new Map<string, number[]>();
  const membersOf = (cond: string): number[] => {
    const known = members.get(cond);
    if (known) return known;
    const test = conditionsOf(fields, cond.split(","));
    const list: number[] = [];
    people.forEach((person, i) => {
      if (test.every((c) => c.test(person))) list.push(i);
    });
    members.set(cond, list);
    return list;
  };
  for (const product of products) {
    const { p } = peopleAnswers(fields, people, answers[product.id], { damping: DAMPING });
    for (const group of product.groups) {
      const list = membersOf(group.cond);
      let sum = 0;
      for (const i of list) sum += p[i];
      means.set(`${product.id}|${group.dimension}|${group.label}`, list.length ? sum / list.length : null);
    }
  }
  return pairsOf(products).map((pair) => ({
    ...pair,
    // Every group in products.json has people in it, so each has a figure.
    scan: [pair.higher, pair.lower].map((label) =>
      Number((means.get(`${pair.product}|${pair.dimension}|${label}`) as number).toFixed(6)),
    ),
  }));
}

// ---------- the command ----------

const runFiles = (): string[] =>
  existsSync(RESULTS_DIR)
    ? readdirSync(RESULTS_DIR)
        .filter((f) => f.endsWith(".json"))
        .sort()
    : [];

const WORDS: Record<string, string> = {
  advert: "you see an advert",
  "year-on-offer": "on offer for a year (nxk's wording)",
};
const describe = (run: SavedRun) =>
  `${WORDS[run.wording] ?? run.wording}, ${Array.isArray(run.facts) ? `${run.facts.length} facts` : `${run.facts} fact`}, ${run.route}, ${run.people.toLocaleString("en-GB")} people`;

function recount(print: Print, products: Product[]) {
  const pairs = pairsOf(products);
  const first = pairsOf(products.filter((p) => p.batch === 1)).length,
    second = pairsOf(products.filter((p) => p.batch === 2)).length;
  print(
    `${products.length} products, ${pairs.length} clear published pairs (${first} in the first batch, ${second} in the second).\n`,
  );
  let bad = 0;
  for (const file of runFiles()) {
    const run = loadRun(join(RESULTS_DIR, file));
    const problems = checkRun(run, products);
    const t = tally(run.pairs);
    print(`${file.replace(/\.json$/, "")}: ${describe(run)}`);
    print(`  right ${t.right} of ${t.of} (${pct(t.right, t.of)})`);
    print(`  ${[...t.byDimension].map(([dimension, [r, n]]) => `${dimension} ${r} of ${n}`).join("; ")}`);
    for (const problem of problems.slice(0, 5)) print(`  PROBLEM ${problem}`);
    if (problems.length) bad++;
  }
  return bad ? 1 : 0;
}

function show(print: Print, products: Product[], name: string) {
  const file = join(RESULTS_DIR, name.endsWith(".json") ? name : `${name}.json`);
  if (!existsSync(file)) throw new Error(`No saved run ${name}: ${runFiles().join(", ")}`);
  const run = loadRun(file),
    t = tally(run.pairs);
  print(`${name}: ${describe(run)}. Right ${t.right} of ${t.of} (${pct(t.right, t.of)}).\n`);
  print("By product:");
  for (const product of products) {
    const [r, n] = t.byProduct.get(product.id) ?? [0, 0];
    if (n) print(`  ${product.name.padEnd(46)} ${String(r).padStart(3)} of ${n}`);
  }
  print("\nWrong pairs (published, then the scan's figure):");
  for (const pair of run.pairs.filter((p) => !isRight(p)))
    print(
      `  ${pair.product}: ${pair.higher} ${pair.published[0]}% against ${pair.lower} ${pair.published[1]}% | scan ${(100 * pair.scan[0]).toFixed(1)} against ${(100 * pair.scan[1]).toFixed(1)}`,
    );
  return 0;
}

/** The requests a new run sends: for each product, the answer with nothing known and one a fact (30 values a request). */
function planOf(products: Product[], fields: Field[]) {
  // The six facts are all in the UK map.
  const asked = SIX.map((name) => fields.find((field) => field.name === name)).map((field) => probesOf(field as Field));
  const requests = products.length * (1 + asked.reduce((s, probes) => s + Math.ceil(probes.length / 30), 0));
  const questions = products.length * (1 + asked.reduce((s, probes) => s + probes.length, 0));
  return { requests, questions };
}

function checkSpec(products: Product[]) {
  const spec: ScanSpec = JSON.parse(readFileSync(SPEC_FILE, "utf8"));
  if (JSON.stringify(spec) !== JSON.stringify(specFor(products)))
    throw new Error(
      "specs/year-on-offer.json is no longer what nxk's scans would send for these products (scripts/discover.ts specOf): write the new wording to its own spec before running",
    );
}

/**
 * The saved answers of a new run (answers/), as each product's answers by "path=code" for one decision model, and the
 * products that lack some: { answers, missing }.
 */
export function savedAnswers(
  products: Product[],
  fields: Field[],
  model: string,
  dir = ANSWERS_DIR,
): { answers: Record<string, Map<string, number>>; missing: string[] } {
  const answers: Record<string, Map<string, number>> = {},
    missing: string[] = [];
  const wanted = [
    "base",
    ...SIX.flatMap((name) => {
      // The six facts are all in the UK map.
      const field = fields.find((f) => f.name === name) as Field;
      return probesOf(field).map((probe) => `${field.path}=${probe.code}`);
    }),
  ];
  for (const product of products) {
    const file = join(dir, "year-on-offer", `scan-${product.id}.jsonl`);
    const by = new Map<string, number[]>();
    const rows = existsSync(file)
      ? linesOf(file)
          .map((line): SavedAnswer => JSON.parse(line))
          .filter((row) => modelOf(row) === model)
      : [];
    for (const row of rows) by.set(row.id, [...(by.get(row.id) ?? []), row.p]);
    const lacking = wanted.filter((id) => !by.has(id));
    if (lacking.length) missing.push(`${product.id} (${lacking.length})`);
    // Each id has an answer at least, so each mean is a number.
    answers[product.id] = new Map([...by].map(([id, ps]): [string, number] => [id, mean(ps) as number]));
  }
  return { answers, missing };
}

/** A new run's pairs, scored from the saved answers on the UK people, or null (said) when answers are missing. */
function scoreSaved(print: Print, products: Product[], model: string) {
  const { map, people } = loadPeople("uk");
  const { answers, missing } = savedAnswers(products, map.fields, model);
  if (missing.length) {
    print(`Answers are missing for ${missing.join(", ")}: run again to send only those. Nothing was scored.`);
    return null;
  }
  return { pairs: scorePairs(products, map.fields, people, answers), people: people.length };
}

const writeRun = (file: string, head: Omit<SavedRun, "pairs">, pairs: ScoredPair[]) =>
  writeFileSync(
    file,
    `${JSON.stringify(head, null, 1).replace(/\n}$/, "")},\n "pairs": [\n  ${pairs.map((p) => JSON.stringify(p)).join(",\n  ")}\n ]\n}\n`,
  );

async function runNew(print: Print, products: Product[], flags: Record<string, string>) {
  checkSpec(products);
  const setup = decisionSetup();
  if (!setup.route) throw new Error(setup.reason);
  const args = [
    ANSWERS_DIR,
    SPEC_FILE,
    "--country=uk",
    `--only=${SIX.join(",")}`,
    "--quiet",
    `--max-usd=${flags["max-usd"] ?? 0.05}`,
  ];
  await scan(args, { print, sinks: [] }, { folder: HERE });
  const scored = scoreSaved(print, products, setup.model);
  if (!scored) return 1;
  const date = new Date().toISOString().slice(0, 10);
  const name = `${date}-year-on-offer-${setup.route}`;
  const head = {
    date,
    wording: "year-on-offer",
    spec: "specs/year-on-offer.json",
    facts: SIX,
    people: scored.people,
    model: setup.model,
    route: setup.route,
    answers: "answers/year-on-offer",
  };
  writeRun(join(RESULTS_DIR, `${name}.json`), head, scored.pairs);
  const t = tally(scored.pairs);
  print(`\n${name}: right ${t.right} of ${t.of} (${pct(t.right, t.of)}). Saved in results/.`);
  return 0;
}

/** The saved answers scored again on the people, and held against the saved run they made; sends nothing. */
function rescore(print: Print, products: Product[]) {
  const runs = runFiles()
    .map((file) => ({ file, run: loadRun(join(RESULTS_DIR, file)) }))
    .filter(({ run }) => run.answers);
  const latest = runs.at(-1);
  if (!latest) throw new Error("No saved run of answers/ in results/");
  const scored = scoreSaved(print, products, latest.run.model);
  if (!scored) return 1;
  const t = tally(scored.pairs);
  const same = JSON.stringify(scored.pairs) === JSON.stringify(latest.run.pairs);
  const verdict = same ? `The same pairs and figures as ${latest.file}.` : `NOT the same as ${latest.file}.`;
  print(
    `The saved answers, scored on ${scored.people.toLocaleString("en-GB")} people: right ${t.right} of ${t.of} (${pct(t.right, t.of)}). ${verdict}`,
  );
  return same ? 0 : 1;
}

async function main(argv: string[]) {
  const { flags } = argsOf(argv);
  const print = (text: string) => console.log(text);
  if (flags.help) {
    print(usage(import.meta.url));
    return 0;
  }
  const products = loadProducts();
  if (flags.show) return show(print, products, String(flags.show));
  if ("plan" in flags) {
    checkSpec(products);
    const { requests, questions } = planOf(products, loadMap("uk").fields);
    const setup = decisionSetup();
    const usd = (questions * TOKENS_PER_QUESTION * (setup.usdPerMillion ?? 0.1)) / 1e6;
    const through = setup.route ? ` through ${setup.route}` : "";
    const free = setup.route && !setup.charged ? ", no charge on Google's Free Tier" : "";
    const cents = `about ${(100 * usd).toFixed(1)} US cents${free}`;
    print(
      `${requests} requests (${questions} questions) for ${products.length} products on ${SIX.length} facts, to ${setup.model}${through}: ${cents}. Nothing was sent.`,
    );
    if (!setup.route) print(setup.reason);
    return 0;
  }
  if ("run" in flags) return runNew(print, products, flags);
  if ("score" in flags) return rescore(print, products);
  return recount(print, products);
}

if (isMain(import.meta.url))
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(error.message);
      process.exit(1);
    },
  );
