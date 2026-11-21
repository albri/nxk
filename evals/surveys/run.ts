#!/usr/bin/env node
// The scan against 22 official surveys. For each survey's question, the decision model is asked about a person of
// whom one fact is known, once for each value of each field the survey publishes groups by, and once with nothing
// known; each in two option orders. A group's answer is the answers for the values inside it, weighted by how common
// each value is. The groups' answers are then held against the published figures.
//
//   node evals/surveys/run.ts --plan                   counts and cost; sends nothing
//   node evals/surveys/run.ts --run [--max-usd=0.10]   sends what answers.jsonl lacks, then scores
//   node evals/surveys/run.ts --score [--out=<file>]   scores the saved answers; sends nothing
//
//   --studies=a,b   only these studies (ids in studies.json)
//   --max-usd       the spending limit for this run, counted with what the provider reports (default 0.10)
//   --out           also write the scores as JSON to this file
//
// Requests are built as scripts/scan.ts builds them, and go to the decision model, route and key that
// scripts/decision-model.ts picks (the key is read, never printed). Every answer is saved to answers.jsonl beside
// this file as it comes, so a second run sends only what is missing.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { argsOf, isMain, usage } from "../../scripts/cli.ts";
import {
  decisionSetup,
  modelOf,
  ROUTES,
  type DecisionSetup,
  type RoutedSetup,
  type SavedRow,
} from "../../scripts/decision-model.ts";
import { sendJobs, tokensIn, type Sent } from "../../scripts/decision-send.ts";
import type { SystemOneQuestion } from "../../scripts/google.ts";
import { loadMap, type Field, type PeopleMap } from "../../scripts/population.ts";
import { probesOf, type Probe } from "../../scripts/scan-answers.ts";
import { linesOf, mean, median, money } from "../lib.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
export const STUDIES_FILE = join(HERE, "studies.json");
export const ANSWERS_FILE = join(HERE, "answers.jsonl");

export const ORDERS = 2; // each question asked with the options in two orders, and the two averaged
export const AGES = [20, 25, 35, 45, 55, 65, 75, 85]; // the ages asked about, in place of the map's quantiles
export const CLEAR = 10; // points between two published groups on one answer that make a clear difference
export const MIN_DRAWN = 30; // a group is scored when 30 or more of the original 300 drawn people fell in it
const LONG_OPTION = 100; // as scripts/scan.ts: a longer option is sent as "Option n", its text as the description
// The instruction scripts/scan.ts sends with every request (run.test.ts checks the two stay the same).
export const INSTRUCTION = [
  "Based on `respondent.profile`, which answer would this person give to `survey.questions.q.text` in the situation described in `survey.context`?",
  "The available answers are in `survey.questions.q.options`.",
  "Apply the person's stated circumstances; predict their response rather than recommending the best option in general.",
].join(" ");
export const ONE_FACT = "Based on `respondent.profile` and one more fact about this person,";

/** Who is in a published group: the values of a map field listed in `in`, or the numbers from `min` to `max`. */
export interface Match {
  field: string;
  in?: (string | number)[];
  min?: number;
  max?: number;
}

/**
 * A published group: its label, who is in it, its published shares in the study's option order (null where none is
 * published), its people in the survey, and how many of the original 300 drawn people fell in it.
 */
export interface Bucket {
  label: string;
  match: Match;
  real: number[] | null;
  n?: number;
  drawn: number;
}

/** A bucket with a published share and enough of the original draw to be scored (scoredBuckets). */
export type ScoredBucket = Bucket & { real: number[] };

/** One dimension a study publishes its groups by (age, tenure), and its groups. */
export interface StudyGroup {
  dimension: string;
  buckets: Bucket[];
}

/** A study in studies.json, as far as the check reads it: its question and options, when it was asked, and its groups. */
export interface Study {
  id: string;
  title?: string;
  country: string;
  surveyed?: string;
  context: string;
  question: string;
  options: string[];
  groups: StudyGroup[];
}

/** A map field a study publishes groups by, found by name, and the values asked about it. */
export interface FoundField {
  name: string;
  field: Field;
  probes: Probe[];
}

/** A clear difference (clearGaps): two groups, the option, and the published gap in points (a minus b). */
export interface Gap {
  a: string;
  b: string;
  o: number;
  option: string;
  realGap: number;
}

/** The state a survey request describes: the person (only their country) and the survey's questions, by key. */
interface SurveyState {
  respondent: { profile: { country: string } };
  survey: { context: string; questions: Record<string, { text: string; options: string[] }> };
}

/** One Choice question of a survey request: its instruction, and the options by name (each with its text, if long). */
export interface SurveyQuestion extends SystemOneQuestion {
  type: "choice";
  instructions: string;
  criteria: Record<string, string | null>;
}

/** A survey request's body: the model, the state and one Choice question for each value and option order. */
export interface SurveyRequest {
  model: string;
  state: SurveyState;
  questions: Record<string, SurveyQuestion>;
}

/**
 * A question of a request, as its answer is read back: its key, its option order, the fact it is about ("base" for
 * nothing known), and what each of the study's options is called in that order.
 */
export interface Asked {
  key: string;
  r: number;
  id: string;
  names: string[];
}

/** One request of the plan: its study, its field (null for nothing known) and values, and a high estimate of its tokens. */
export interface Job {
  study: Study;
  field: Field | null;
  probes: Probe[];
  request: { body: SurveyRequest; index: Asked[] };
  tokens: number;
}

/**
 * A saved answer (answers.jsonl): the study, the fact, the option order and its probabilities in the study's option
 * order, and the model. A request's first row carries its cost.
 */
export interface AnswerRow extends SavedRow {
  study: string;
  id: string;
  r: number;
  p: number[];
  usd?: number;
  tokens?: number | null;
  cost?: string;
}

/** A scored group: its dimension, how many were drawn in it, its published shares and the scan's, in points. */
export interface GroupRecord {
  dim: string;
  n: number;
  real: number[];
  scan: number[];
}

/** The measures over some groups and differences (measures). */
export interface Measures {
  groups: number;
  gaps: number;
  right: number;
  size: number | undefined;
  errorAnswered: number | undefined;
  errorDifferences: number | undefined;
}

/** One study's measures, with its option-order noise. */
export interface StudyScore extends Measures {
  id: string;
  country: string;
  noise: number | undefined;
}

/** Every study's measures together, with how many studies and the option-order noise. */
export interface TotalScore extends Measures {
  studies: number;
  noise: number | undefined;
}

/** Every study scored (score). */
export interface ScoreResult {
  studies: StudyScore[];
  total: TotalScore | null;
  base: number | undefined;
  unanswered: string[];
}

type Print = (text: string) => void;
/** Each country's map, as far as the check reads it: its fields. */
type Maps = Record<string, Pick<PeopleMap, "fields">>;

/** The options starting at `index`, wrapping round, as scripts/scan.ts orders them. */
export const rotate = <T>(options: T[], index: number): T[] => {
  const start = ((index % options.length) + options.length) % options.length;
  return [...options.slice(start), ...options.slice(0, start)];
};

export const loadStudies = (file = STUDIES_FILE): Study[] => JSON.parse(readFileSync(file, "utf8")).studies;
export const readRows = (file = ANSWERS_FILE): AnswerRow[] =>
  existsSync(file) ? linesOf(file).map((line) => JSON.parse(line)) : [];

// ---------- what is asked ----------

/** The values asked about for one map field: the ages above for age, else every value the scan itself would ask. */
export function probesFor(field: Field): Probe[] {
  if (field.name === "age_years")
    return AGES.map((a) => ({ value: a, code: String(a), label: String(a), share: null }));
  return probesOf(field);
}

/**
 * The fields one study publishes groups by, found in the country's map by name: [{ name, field, probes }], and the
 * names not found. A bucket's `match.field` is a bare field name, unique within a country's map.
 */
export function fieldsFor(study: Study, map: Pick<PeopleMap, "fields">): { found: FoundField[]; missing: string[] } {
  const names = [...new Set(study.groups.flatMap((g) => g.buckets.map((b) => b.match.field)))];
  const found: FoundField[] = [],
    missing: string[] = [];
  for (const name of names) {
    const field = map.fields.find((f) => f.name === name);
    if (field) found.push({ name, field, probes: probesFor(field) });
    else missing.push(name);
  }
  return { found, missing };
}

/** The probes inside one group: codes listed in `match.in`, or numbers between `match.min` and `match.max`. */
export function probesInside<P extends { code: string; value?: unknown }>(
  match: Pick<Match, "in" | "min" | "max">,
  probes: P[],
): P[] {
  return probes.filter((p) =>
    match.in
      ? match.in.map(String).includes(p.code)
      : typeof p.value === "number" && p.value >= (match.min ?? -Infinity) && p.value <= (match.max ?? Infinity),
  );
}

/** The groups scored for a study: a published share, and 30 or more of the original draw. */
export const scoredBuckets = (group: StudyGroup): ScoredBucket[] =>
  group.buckets.filter((b): b is ScoredBucket => Boolean(b.real) && b.drawn >= MIN_DRAWN);

/** The clear differences of one dimension: every pair of scored groups 10 points or more apart on an answer. */
export function clearGaps(study: Study, group: StudyGroup): Gap[] {
  const buckets = scoredBuckets(group),
    gaps: Gap[] = [];
  for (let i = 0; i < buckets.length; i++)
    for (let j = i + 1; j < buckets.length; j++)
      study.options.forEach((option, o) => {
        const realGap = buckets[i].real[o] - buckets[j].real[o];
        if (Math.abs(realGap) >= CLEAR) gaps.push({ a: buckets[i].label, b: buckets[j].label, o, option, realGap });
      });
  return gaps;
}

/**
 * One request as scripts/scan.ts builds it: the person is only their country; for a field, one Choice question for
 * each value and option order, each naming the one fact in its instruction; with no field, the answer with nothing
 * known. Returns { body, index: [{ key, r, id, names (what each option of the study is called in this order) }] }.
 */
export function requestFor(
  study: Study,
  field: Field | null,
  probes: { code: string; value?: unknown }[],
  model: string,
): { body: SurveyRequest; index: Asked[] } {
  const long = study.options.some((text) => text.length > LONG_OPTION);
  const state: SurveyState = {
    respondent: { profile: { country: study.country } },
    survey: {
      context: [study.surveyed && `It is ${study.surveyed}.`, study.context].filter(Boolean).join(" "),
      questions: {},
    },
  };
  const questions: Record<string, SurveyQuestion> = {},
    index: Asked[] = [];
  for (let r = 0; r < ORDERS; r++) {
    const order = rotate(study.options, r);
    state.survey.questions[`q${r}`] = { text: study.question, options: order };
    const criteria = Object.fromEntries(order.map((text, i) => (long ? [`Option ${i + 1}`, text] : [text, null])));
    const pointed = INSTRUCTION.replaceAll("survey.questions.q.", `survey.questions.q${r}.`);
    const names = study.options.map((text) => (long ? `Option ${order.indexOf(text) + 1}` : text));
    (field ? probes : [{ code: "base" }]).forEach((probe, n) => {
      const instructions = field
        ? pointed.replace(
            "Based on `respondent.profile`,",
            `${ONE_FACT} \`${field.path}\`: ${JSON.stringify(probe.value)},`,
          )
        : pointed;
      questions[`v${n}_o${r}`] = { type: "choice", instructions, criteria };
      index.push({ key: `v${n}_o${r}`, r, id: field ? `${field.path}=${probe.code}` : "base", names });
    });
  }
  return { body: { model, state, questions }, index };
}

/**
 * Every request of the plan: [{ study, field, probes, request, tokens }], 30 values a request at most, as the scan
 * sends them. `tokens` is a high estimate: each question counted with the whole state it is asked about.
 */
export function planFor(
  studies: Study[],
  maps: Maps,
  model = "gemini-decision-1",
): { jobs: Job[]; problems: string[] } {
  const jobs: Job[] = [],
    problems: string[] = [];
  for (const study of studies) {
    const { found, missing } = fieldsFor(study, maps[study.country]);
    for (const name of missing) problems.push(`${study.id}: no field ${name} in maps/${study.country}.json`);
    const add = (field: Field | null, probes: Probe[]) => {
      const request = requestFor(study, field, probes, model);
      const state = JSON.stringify(request.body.state);
      const tokens = Object.values(request.body.questions).reduce(
        (sum, q) => sum + tokensIn(state + JSON.stringify(q)),
        0,
      );
      jobs.push({ study, field, probes, request, tokens });
    };
    add(null, []);
    for (const { field, probes } of found)
      for (let at = 0; at < probes.length; at += 30) add(field, probes.slice(at, at + 30));
    for (const group of study.groups)
      for (const bucket of scoredBuckets(group)) {
        const entry = found.find((f) => f.name === bucket.match.field);
        if (!entry) continue;
        if (bucket.match.in)
          for (const code of bucket.match.in.map(String))
            if (!entry.probes.some((p) => p.code === code))
              problems.push(
                `${study.id} / ${group.dimension} / ${bucket.label}: ${bucket.match.field}=${code} is not asked`,
              );
        if (!probesInside(bucket.match, entry.probes).length)
          problems.push(`${study.id} / ${group.dimension} / ${bucket.label}: no value asked falls inside`);
      }
  }
  return { jobs, problems };
}

// ---------- scoring ----------

/**
 * The saved answers by "study|id", averaged over the option orders (probabilities in the study's option order), and
 * the gap between the two orders in points (the mean over options of the absolute difference) by study.
 */
export function averaged(rows: AnswerRow[]): { answers: Map<string, number[]>; noise: Map<string, number[]> } {
  const by = new Map<string, AnswerRow[]>();
  for (const row of rows) {
    const key = `${row.study}|${row.id}`;
    if (!by.has(key)) by.set(key, []);
    by.get(key)!.push(row);
  }
  const answers = new Map<string, number[]>(),
    noise = new Map<string, number[]>();
  for (const [key, list] of by) {
    const ps = list.map((row) => row.p);
    // Each key has a row at least, so each mean is a number.
    answers.set(
      key,
      ps[0].map((_, o) => mean(ps.map((p) => p[o])) as number),
    );
    const first = list.find((row) => row.r === 0),
      second = list.find((row) => row.r === 1);
    if (first && second) {
      const study = key.slice(0, key.indexOf("|"));
      // Every answer has options, so the mean over them is a number.
      if (!noise.has(study)) noise.set(study, []);
      noise.get(study)!.push(100 * (mean(first.p.map((x, o) => Math.abs(x - second.p[o]))) as number));
    }
  }
  return { answers, noise };
}

/** A group's answer in points: the answers for the values inside it, weighted by their share of adults (1 if none). */
export function groupAnswer(
  study: Study,
  match: Match,
  probes: Probe[],
  path: string,
  answers: Map<string, number[]>,
): number[] | null {
  const got = probesInside(match, probes)
    .map((p) => ({ p: answers.get(`${study.id}|${path}=${p.code}`), w: p.share ?? 1 }))
    .filter((x): x is { p: number[]; w: number } => Boolean(x.p));
  if (!got.length) return null;
  const total = got.reduce((s, x) => s + x.w, 0);
  return study.options.map((_, o) => (100 * got.reduce((s, x) => s + x.w * x.p[o], 0)) / total);
}

/**
 * The measures over some groups and differences. records: [{ dim, n, real, scan }]; gaps: [{ realGap, scanGap }].
 * - error as answered: the mean distance, in points per answer, between a group's answer and its published one;
 * - error on differences only: the same after each answer is moved so that the groups of a dimension average (weighted
 *   by n) what the published groups average, so only the differences between groups count;
 * - right: clear differences whose scan difference has the same sign; size: the median of |scan| / |real| difference.
 */
export function measures(records: GroupRecord[], gaps: { realGap: number; scanGap: number }[]): Measures {
  // Every answer has options, so each mean over them is a number.
  const centred: number[] = [];
  for (const dim of new Set(records.map((r) => r.dim))) {
    const recs = records.filter((r) => r.dim === dim),
      total = recs.reduce((s, r) => s + r.n, 0),
      k = recs[0].real.length;
    const own = Array.from({ length: k }, (_, i) => recs.reduce((s, r) => s + r.n * r.scan[i], 0) / total);
    const real = Array.from({ length: k }, (_, i) => recs.reduce((s, r) => s + r.n * r.real[i], 0) / total);
    for (const rec of recs)
      centred.push(
        mean(
          rec.scan.map((p, i) => Math.abs(Math.min(100, Math.max(0, real[i] + p - own[i])) - rec.real[i])),
        ) as number,
      );
  }
  const right = gaps.filter((g) => Math.sign(g.scanGap) === Math.sign(g.realGap)).length;
  return {
    groups: records.length,
    gaps: gaps.length,
    right,
    size: median(gaps.map((g) => Math.abs(g.scanGap) / Math.abs(g.realGap))),
    errorAnswered: mean(records.map((rec) => mean(rec.scan.map((p, i) => Math.abs(p - rec.real[i]))) as number)),
    errorDifferences: mean(centred),
  };
}

/**
 * Every study scored against its published groups. Returns { studies: [per study], total, base, unanswered }, where
 * `base` is the error as answered if every group were given the answer with nothing known, and `unanswered` names
 * scored groups with no saved answer (left out of every measure).
 */
export function score(studies: Study[], maps: Maps, rows: AnswerRow[]): ScoreResult {
  const { answers, noise } = averaged(rows);
  const all: { records: GroupRecord[]; gaps: (Gap & { scanGap: number })[]; base: number[] } = {
    records: [],
    gaps: [],
    base: [],
  };
  const per: StudyScore[] = [],
    unanswered: string[] = [];
  for (const study of studies) {
    const base = answers.get(`${study.id}|base`);
    if (!base) {
      unanswered.push(`${study.id}: nothing known`);
      continue;
    }
    const { found } = fieldsFor(study, maps[study.country]);
    const records: GroupRecord[] = [],
      gaps: (Gap & { scanGap: number })[] = [],
      baseErrors: number[] = [];
    for (const group of study.groups) {
      const of = new Map<string, number[]>();
      for (const bucket of scoredBuckets(group)) {
        const entry = found.find((f) => f.name === bucket.match.field);
        const scan = entry ? groupAnswer(study, bucket.match, entry.probes, entry.field.path, answers) : null;
        if (!scan) {
          unanswered.push(`${study.id} / ${group.dimension} / ${bucket.label}`);
          continue;
        }
        of.set(bucket.label, scan);
        records.push({ dim: `${study.id}|${group.dimension}`, n: bucket.drawn, real: bucket.real, scan });
        // The answer with nothing known has options, so its mean distance is a number.
        baseErrors.push(mean(base.map((p, i) => Math.abs(100 * p - bucket.real[i]))) as number);
      }
      for (const gap of clearGaps(study, group))
        if (of.has(gap.a) && of.has(gap.b))
          gaps.push({ ...gap, scanGap: of.get(gap.a)![gap.o] - of.get(gap.b)![gap.o] });
    }
    per.push({
      id: study.id,
      country: study.country,
      ...measures(records, gaps),
      noise: mean(noise.get(study.id) ?? []),
    });
    all.records.push(...records);
    all.gaps.push(...gaps);
    all.base.push(...baseErrors);
  }
  const total = all.records.length
    ? { studies: per.length, ...measures(all.records, all.gaps), noise: mean([...noise.values()].flat()) }
    : null;
  return { studies: per, total, base: mean(all.base), unanswered };
}

// ---------- sending ----------

/**
 * Sends the requests the saved answers lack (scripts/decision-send.ts), appending each answer's rows to `file` as it
 * comes; a request's first row carries its cost. The limit is for this run: what earlier runs spent is in the file.
 */
function send(setup: RoutedSetup, todo: Job[], { maxUsd, file }: { maxUsd: number; file: string }): Promise<Sent<Job>> {
  return sendJobs(setup, todo, {
    maxUsd,
    requestOf: (job) => job.request.body,
    estimateOf: (job) => (setup.charged ? (job.tokens * setup.usdPerMillion) / 1e6 : 0),
    answered: (job, json, wire, price) => {
      const cost = {
        usd: price.usd,
        tokens: price.tokens,
        cost: price.reported ? "reported" : "tokens x published price",
      };
      const rows = job.request.index.map((q, n) => {
        const p = q.names.map((name) => wire.probability(json, q.key, name));
        if (!p.every((x) => x !== undefined && x >= 0 && x <= 1))
          throw new Error(`No answer for ${job.study.id} ${q.id}`);
        return { study: job.study.id, id: q.id, r: q.r, p, m: setup.model, ...(n === 0 ? cost : {}) };
      });
      appendFileSync(file, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
    },
  });
}

// ---------- printing ----------

const f1 = (x: number | null | undefined) => (x === null || x === undefined ? "–" : x.toFixed(1));
const f2 = (x: number | null | undefined) => (x === null || x === undefined ? "–" : x.toFixed(2));
const pc = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : "–");
// A request costs a fraction of a cent: dollars to three places, or to four under a cent.
const dollars = (usd: number) => money(usd, usd < 0.01 ? 4 : 3);
const via = (setup: RoutedSetup) => (setup.route === "custom" ? setup.url : ROUTES[setup.route].name);

function printPlan(
  print: Print,
  studies: Study[],
  maps: Maps,
  { jobs, problems }: { jobs: Job[]; problems: string[] },
  saved: AnswerRow[],
  setup: DecisionSetup,
): { todo: Job[]; usd: number } {
  const buckets = studies.flatMap((s) => s.groups.flatMap((g) => g.buckets));
  const scored = studies.flatMap((s) => s.groups.flatMap((g) => scoredBuckets(g)));
  const gaps = studies.flatMap((s) => s.groups.flatMap((g) => clearGaps(s, g)));
  const questions = jobs.reduce((sum, job) => sum + job.request.index.length, 0);
  const done = new Set(saved.map((row) => `${row.study}|${row.id}|${row.r}`));
  const todo = jobs.filter((job) => job.request.index.some((q) => !done.has(`${job.study.id}|${q.id}|${q.r}`)));
  const tokens = todo.reduce((sum, job) => sum + job.tokens, 0);
  print(
    [
      `${studies.length} studies; ${buckets.length} published groups, ${scored.length} scored`,
      `(a published share, and ${MIN_DRAWN} or more of the original 300 drawn); ${buckets.length - scored.length} left out as in the original.`,
    ].join(" "),
  );
  print(
    `${gaps.length} clear differences: two scored groups of one dimension ${CLEAR} points or more apart on one answer.`,
  );
  print("");
  print("Fields, by the name the studies give them, as found in the shipped maps:");
  const seen = new Map<string, string>();
  for (const study of studies)
    for (const { name, field, probes } of fieldsFor(study, maps[study.country]).found) {
      const key = `${study.country} ${name}`;
      if (!seen.has(key))
        seen.set(
          key,
          `  ${study.country}: ${name} -> ${field.path}, ${probes.length} values asked${name === "age_years" ? ` (ages ${AGES.join(", ")})` : ""}`,
        );
    }
  for (const line of seen.values()) print(line);
  print(
    problems.length
      ? `\nProblems (each group named is left out):\n${problems.map((p) => `  ${p}`).join("\n")}`
      : "\nEvery field is in the map, every code a group names is one of its values, and every group has a value asked inside it.",
  );
  print("");
  const facts = jobs.reduce((sum, job) => sum + Math.max(1, job.probes.length), 0);
  print(
    [
      `${facts} facts asked about (${studies.length} with nothing known), in ${ORDERS} option orders:`,
      `${questions.toLocaleString("en-GB")} questions in ${jobs.length} requests (one a study and field, both orders in one request, as the scan sends them).`,
    ].join(" "),
  );
  print(
    `Saved: ${saved.length.toLocaleString("en-GB")} answers. To send: ${todo.length} requests, ${todo.reduce((s, j) => s + j.request.index.length, 0).toLocaleString("en-GB")} questions.`,
  );
  if (!setup.route) print(`Decision model: none reachable. ${setup.reason}`);
  else {
    const tier =
      setup.route === "google" ? `, ${setup.tier ? setup.limits?.label : "no tier set: Free Tier limits"}` : "";
    print(`Decision model: ${setup.model} through ${via(setup)}${tier}; key from ${setup.from}.`);
    const usd = setup.charged ? (tokens * setup.usdPerMillion) / 1e6 : 0;
    print(
      setup.charged
        ? `Estimate: at most about ${dollars(usd)} (${tokens.toLocaleString("en-GB")} tokens, each question counted with its whole state, at $${setup.usdPerMillion} a million input tokens).`
        : "Estimate: no charge on Google's Free Tier.",
    );
    return { todo, usd };
  }
  return { todo, usd: Infinity };
}

const mapsCache: Record<string, PeopleMap> = {};
function mapsOf(studies: Study[]) {
  for (const country of new Set(studies.map((s) => s.country))) mapsCache[country] ??= loadMap(country);
  return mapsCache;
}

function printScore(print: Print, result: ScoreResult, rows: AnswerRow[]) {
  const { total, studies, base, unanswered } = result;
  if (!total) {
    print("No saved answers to score.");
    return;
  }
  const charged = rows.filter((row): row is AnswerRow & { usd: number } => row.usd !== undefined);
  const usd = charged.reduce((s, row) => s + row.usd, 0),
    tokens = charged.reduce((s, row) => s + (row.tokens ?? 0), 0);
  const models = [...new Set(rows.map((row) => modelOf(row)))].join(", ");
  print(
    `Answers: ${rows.length.toLocaleString("en-GB")} saved from ${models}, ${charged.length} requests, ${tokens.toLocaleString("en-GB")} tokens reported, ${dollars(usd)}.`,
  );
  if (unanswered.length)
    print(
      `Scored groups with no saved answer, left out: ${unanswered.length} (${unanswered.slice(0, 5).join("; ")}${unanswered.length > 5 ? "; ..." : ""}).`,
    );
  print("");
  print(
    "| Study | Groups | Differences the right way | Size against the real one | Error as answered | Error on differences only | Option-order noise |",
  );
  print("| --- | ---: | ---: | ---: | ---: | ---: | ---: |");
  const line = (name: string, x: Measures & { noise: number | undefined }) =>
    print(
      `| ${name} | ${x.groups} | ${x.gaps ? `${x.right} of ${x.gaps} (${pc(x.right, x.gaps)})` : "none"} | ${f2(x.size)} | ${f1(x.errorAnswered)} | ${f1(x.errorDifferences)} | ${f1(x.noise)} |`,
    );
  for (const s of studies) line(`${s.id} (${s.country.toUpperCase()})`, s);
  line(`**All ${total.studies} studies**`, total);
  print("");
  print(
    `Errors are in points per answer. With nothing known (the same answer for every group) the error as answered would be ${f1(base)}.`,
  );
}

/** The scores rounded for the results file. */
function scoresDocument(result: ScoreResult, rows: AnswerRow[], setup: DecisionSetup) {
  const round = (x: number | null | undefined, d: number) =>
    x === null || x === undefined ? null : Math.round(x * 10 ** d) / 10 ** d;
  const tidy = (x: Measures & { noise: number | undefined }) => ({
    ...x,
    size: round(x.size, 3),
    errorAnswered: round(x.errorAnswered, 2),
    errorDifferences: round(x.errorDifferences, 2),
    noise: round(x.noise, 2),
  });
  const charged = rows.filter((row): row is AnswerRow & { usd: number } => row.usd !== undefined);
  return {
    what: "The scan against 22 official surveys: one fact known about a person, each value of each published dimension, two option orders averaged (evals/surveys/README.md).",
    model: [...new Set(rows.map((row) => modelOf(row)))],
    route: setup.route ? via(setup) : null,
    answers: rows.length,
    requests: charged.length,
    tokens: charged.reduce((s, row) => s + (row.tokens ?? 0), 0),
    usd: round(
      charged.reduce((s, row) => s + row.usd, 0),
      5,
    ),
    // Written only when there is a total (main).
    total: tidy(result.total as TotalScore),
    nothingKnown: round(result.base, 2),
    studies: result.studies.map(tidy),
    unanswered: result.unanswered,
  };
}

// ---------- the command ----------

export async function main(
  argv: string[],
  { print = console.log, env = process.env }: { print?: Print; env?: NodeJS.ProcessEnv } = {},
): Promise<number> {
  const { flags } = argsOf(argv);
  if (!("plan" in flags || "run" in flags || "score" in flags)) {
    print(usage(import.meta.url));
    return 1;
  }
  let studies = loadStudies();
  if (flags.studies) {
    const ids = String(flags.studies).split(",");
    const unknown = ids.filter((id) => !studies.some((s) => s.id === id));
    if (unknown.length) {
      print(`Not in studies.json: ${unknown.join(", ")}`);
      return 1;
    }
    studies = studies.filter((s) => ids.includes(s.id));
  }
  const maps = mapsOf(studies);
  const setup = decisionSetup(env);
  const all = readRows();
  const saved = setup.route ? all.filter((row) => modelOf(row) === setup.model) : all;

  if ("plan" in flags || "run" in flags) {
    const plan = planFor(studies, maps, setup.wire ?? "gemini-decision-1");
    const { todo, usd } = printPlan(print, studies, maps, plan, saved, setup);
    if ("plan" in flags) return 0;
    if (!setup.route) return 1;
    const maxUsd = Number(flags["max-usd"] ?? 0.1);
    if (todo.length) {
      if (usd > maxUsd) {
        print(`That estimate passes the limit of ${dollars(maxUsd)}: nothing sent.`);
        return 1;
      }
      print(`Sending, limit ${dollars(maxUsd)}...`);
      const sent = await send(setup, todo, { maxUsd, file: ANSWERS_FILE });
      print(`Spent ${dollars(sent.spent)} on this run.${sent.stop ? ` Stopped: ${sent.stop}` : ""}`);
      if (sent.lost.length)
        print(
          `${sent.lost.length} requests failed twice and saved nothing (last error: ${sent.lastError}); run again to send only those.`,
        );
      if (sent.stop || sent.lost.length) return 1;
    }
    print("");
  }
  const rows = readRows().filter((row) => !setup.route || modelOf(row) === setup.model);
  const result = score(studies, maps, rows);
  printScore(print, result, rows);
  if (flags.out && result.total) {
    writeFileSync(String(flags.out), `${JSON.stringify(scoresDocument(result, rows, setup), null, 1)}\n`);
    print(`\nScores written to ${relative(process.cwd(), String(flags.out)) || flags.out}.`);
  }
  return 0;
}

if (isMain(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
