#!/usr/bin/env node
// Which facts about a person matter to a decision, and what a change does across the population, without asking
// about anyone in particular. For each field you name from the country's map (maps/<country>.json: each fact
// recorded about people, its values and the share of adults holding each), and for ten general ones, one request
// asks the decision model about a person of whom only that fact is known, once for each value. Then every one of
// the generated people shipped with the map (maps/<country>-people.bin.gz) is given an answer built from the
// facts they hold, so the result can be read for the whole population or any group, with each person counted once.
//
//   node scripts/scan.ts <dir> <spec.json> --country=uk [--max-usd=0.10]      every field of the map
//   node scripts/scan.ts <dir> <spec.json> --country=uk --fields=home_tenure,household_type,...   ten general + named
//   node scripts/scan.ts <dir> <spec.json> --country=uk --read [--who=field=value,field=value] [--level=0.12]
//
//   --fields=a,b      ask only about ten general facts and these (list the names: node scripts/people.ts fields --country=uk)
//   --only=a,b        ask about exactly these and add nothing; with neither, every field is asked about
//   --orders=2        ask each question with the options in two orders (default 1)
//   --read            print again from the saved answers; no request
//   --among           the audience to count within, in place of all adults, such as age_years=18..44
//   --who             a group to read off: conditions joined by commas, such as
//                     financial_risk_tolerance=not_willing_to_take_any_financial_risk,age_years=18..44
//   --level           the real share who act today under the first version, if you know it; groups are shown around it
//   --top, --ladders  how many lines to print
//   --damping=0.1     how strongly a person's facts add up; by default 1.2 over the square root of the fields read
//                     (scan-answers.ts dampingFor; guide topic scan)
//   --map, --people   another map and its people file
//
// The spec holds the situation in one or more versions, the question and the answer to watch. Every version is
// scanned: about 150 requests and 2 cents each for every field; about 25 and a fifth of a cent with ten general and
// fifteen named fields. Answers are saved under <dir>/<spec name>/, so a second run sends only what is missing.
// The answers come from a decision model, on your own account: decision-model.ts says which model, by which route and with
// which key (never printed). Each saved answer records its model, and a scan reads and asks only for its own model's
// answers. See mcp/guides/scan.md.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { argsOf, cli, Exit, readIn, usageExit, type Out, type RunContext } from "./cli.ts";
import {
  decisionSetup,
  minutesFor,
  modelOf,
  ROUTES,
  type DecisionSetup,
  type RoutedSetup,
  type SavedRow,
} from "./decision-model.ts";
import { mostAtOnce, sendJobs } from "./decision-send.ts";
import { fileURLToPath } from "node:url";
import { percent, per100, plural, tierLabel } from "./format.ts";
import type { SystemOneQuestion, SystemOneRequest } from "./google.ts";
import { conditionsOf, describeConditions, marked, matches, profile, type Condition } from "./groups.ts";
import { openLog, type Log, type Resolution } from "./log.ts";
import { keptFile, loadMap, placeLists, readPeopleFile, type Field, type PeopleMap, type Row } from "./population.ts";
import {
  fieldsToScan,
  logOdds,
  missingAnswers,
  peopleAnswers,
  probesOf,
  scanField,
  splitOfChange,
  type PeopleAnswers,
  type Probe,
  type ProbeValue,
} from "./scan-answers.ts";

/** A Choice question in a scan's spec: its text and its options. */
export interface SpecQuestion {
  type: string;
  text: string;
  options: string[];
}

/** A scan's spec file: the situation in one or more versions, the question, and the answer to watch. */
export interface ScanSpec {
  /** When the person is asked, such as "November 2026". */
  surveyed?: string;
  /** Each version's situation as the person meets it, by key; the first is the baseline. */
  versions: Record<string, string>;
  questions: Record<string, SpecQuestion>;
  /** The question and the option followed; by default the first Choice and its first option. */
  watch?: [string, string];
}

/** One saved answer (a line of scan-<version>.jsonl): the decision model's probability for the answer watched. */
export interface SavedAnswer extends SavedRow {
  /** "path=code" for a person of whom one fact is known, or "base" for nothing known. */
  id: string;
  /** The option order it was asked in. */
  r: number;
  p: number;
  /** What its request cost, on the first answer of each request; missing on answers saved before it was recorded. */
  usd?: number;
}

/** A field the map lists with two or more values to ask about, and those values. */
interface Asked {
  field: Field;
  probes: Probe[];
}

/** What a scan needs before it sends or reads (setUp). */
interface ScanContext {
  setup: DecisionSetup;
  model: string;
  orders: number;
  map: PeopleMap;
  country: string;
  spec: ScanSpec;
  label: string;
  versions: string[];
  question: SpecQuestion;
  watchOption: string;
  /** Every field that can be read; `toAsk`, the ones asked about. */
  fields: Asked[];
  toAsk: Asked[];
  fileOf: (version: string) => string;
  rowsOf: (file: string) => SavedAnswer[];
}

/** The state a request sends: the person (only their country, until a fact is named) and the survey they meet. */
interface ScanState {
  respondent: { profile: { country: string } };
  survey: { context: string; questions: Record<string, { text: string; options: string[] }> };
}

/** One question of a request, to read its answer: its key, option order, the answer it is for and the option followed. */
interface Asking {
  key: string;
  r: number;
  id: string;
  name: string;
}

/** A request the scan sends, and how to read each question's answer. */
interface ScanRequest {
  body: SystemOneRequest;
  index: Asking[];
}

/** A request still to send: its version, the values it asks about, and the request. */
interface Job {
  version: string;
  probes: Probe[];
  request: ScanRequest;
}

/** One version's level in a group read. */
interface Level {
  version: string;
  p: number;
}

/** What one group read found: each version's level in it; `all` for everyone read (all adults, or the audience). */
export interface GroupRead {
  name: string;
  levels: Level[];
  all?: boolean;
}

/** The answers added up on the people, as printPeople reads them for the movers and the groups. */
interface Reading {
  placed: Field[];
  pool: Row[];
  /** The audience, as positions among the people. */
  everyone: number[];
  among: Condition[];
  answers: Record<string, Map<string, number>>;
  per: Record<string, PeopleAnswers>;
  damping: number;
  known: number | null;
  versions: string[];
}

const LONG_OPTION = 100;
// The instruction sent with every request: answer as this person would, in their circumstances.
export const DEFAULT_INSTRUCTION = [
  "Based on `respondent.profile`, which answer would this person give to `survey.questions.q.text`",
  "in the situation described in `survey.context`? The available answers are in `survey.questions.q.options`.",
  "Apply the person's stated circumstances; predict their response rather than recommending the best option in general.",
].join(" ");
// A request with one fact known opens with this in place of the instruction's first words, then names the fact.
export const ONE_FACT = "Based on `respondent.profile` and one more fact about this person,";
/** The options starting at `index`, wrapping round, so that each order puts a different option first. */
const rotate = (options: string[], index: number) => {
  const start = ((index % options.length) + options.length) % options.length;
  return [...options.slice(start), ...options.slice(0, start)];
};
const mean = (xs: number[]) => xs.reduce((sum, x) => sum + x, 0) / xs.length;
/** Every answer saved in a file, from any decision model. */
const allRows = (file: string): SavedAnswer[] =>
  existsSync(file)
    ? readFileSync(file, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line): SavedAnswer => JSON.parse(line))
    : [];
// A question's share of a request's tokens, to price a scan before it is sent.
export const TOKENS_PER_QUESTION = 175;
// The exit code when sending stopped for a reason no rescan gets past (decision-send.ts FATAL).
const STOPPED: Partial<Record<string, number>> = { NO_CREDIT: 3, DAILY: 4 };

export async function run(argv: string[], out: Out, { folder, env = process.env }: RunContext): Promise<void> {
  const {
    positionals: [dir, specFile],
    flags,
  } = argsOf(argv);
  if (!dir || !specFile || (!flags.map && !["uk", "us"].includes(flags.country)))
    throw usageExit(import.meta.url, out, argv);
  const scan = setUp(out, { dir, specFile, flags, folder, env });
  // What a scan prints is simulated: the decision model's view of people.
  const log = openLog("scan", argv, { label: "simulated", ...out });
  // 3 or 4 when sending stopped for a reason no rescan gets past: no credit, or the daily quota used up.
  const stopped = "read" in flags ? 0 : await send(log, scan, flags);
  if (!("quiet" in flags)) read(log, scan, flags, folder); // --quiet: send and save only (discover.ts reads the answers itself)
  if (stopped) throw new Exit(stopped);
}

/**
 * What a scan needs before it sends or reads: the decision model and how fast it may be asked, the map, the spec and
 * the answer it follows, where the answers are saved, and the fields to ask about. Refuses a bad --orders, a spec with
 * no Choice to follow, and fields not in the map, before anything is sent.
 */
function setUp(
  out: Out,
  {
    dir,
    specFile,
    flags,
    folder,
    env,
  }: { dir: string; specFile: string; flags: Record<string, string>; folder: string; env: NodeJS.ProcessEnv },
): ScanContext {
  // The decision model, its route, key, limits and price (decision-model.ts). On Google the requests keep to the
  // tier's published limits (the Free Tier's when no tier is set) and nothing is charged on the Free Tier; elsewhere no
  // limit is published, so they go as fast as the service takes them (decision-send.ts).
  const setup = decisionSetup(env);
  // One option order by default: on saved scans a second order changed who stood out for almost no idea.
  const orders = flags.orders === undefined ? 1 : Number(flags.orders);
  if (orders !== 1 && orders !== 2) throw new Exit(1, "--orders is 1 or 2");

  const map = loadMap(flags.country, { map: flags.map || undefined, folder });
  const spec: ScanSpec = JSON.parse(readIn(folder, specFile, "utf8"));
  const versions = Object.keys(spec.versions ?? {});
  const [watchKey, watchOption] =
    spec.watch ??
    ((): [string, string] => {
      const choice = Object.entries(spec.questions).find(([, candidate]) => candidate.type === "choice");
      if (!choice) throw new Error("The scan follows one answer of a Choice question: add one, or name it in `watch`");
      const [key, q] = choice;
      return [key, q.options[0]];
    })();
  const question = spec.questions[watchKey];
  if (question?.type !== "choice" || !question.options.includes(watchOption))
    throw new Error("`watch` must name a Choice question and one of its options");
  const saved = resolve(folder, dir, basename(specFile).replace(/\.json$/, ""));
  mkdirSync(saved, { recursive: true });

  // Reading uses every field that has saved answers. Asking uses the ten general fields and the ones named for this
  // decision: on saved scans of the whole map that found the same kinds of person at about a sixteenth of the cost.
  const fields = map.fields
    .map((field) => ({ field, probes: probesOf(field) }))
    .filter((entry) => entry.probes.length >= 2);
  const names = (text: string | undefined) =>
    (text ?? "")
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
  // With no fields named, every field is asked about: the agent does not choose where to look. Naming fields is the
  // cheap way, for a second pass or a tight budget.
  const everyField = "all" in flags || (!flags.only && !names(flags.fields).length);
  const chosen = fieldsToScan(map.fields, {
    picked: names(flags.fields),
    all: everyField,
    only: flags.only ? names(flags.only) : null,
  });
  const listFields = "the people tool, action fields";
  if (!("read" in flags)) {
    if (chosen.unknown.length)
      throw new Exit(1, `Not in the map: ${chosen.unknown.join(", ")}. List the names with: ${listFields}`);
    // The cost itself is worked out from the requests and the model's price, and printed before anything is sent.
    if (everyField)
      out.print(
        [
          `Asking about every one of the map's fields (about ${map.fields.length} requests a version).`,
          "Naming fields asks about ten general facts and the ones you name instead, for about a fifth of the cost.",
        ].join(" "),
      );
  }
  const asking = new Set(chosen.names);
  return {
    setup,
    model: setup.model,
    orders,
    map,
    country: map.country,
    spec,
    label: basename(specFile).replace(/\.json$/, ""),
    versions,
    question,
    watchOption,
    fields,
    toAsk: fields.filter(({ field }) => asking.has(field.name)),
    fileOf: (version) => join(saved, `scan-${version}.jsonl`),
    // Answers from another decision model are kept but never read or counted as asked here.
    rowsOf: (file) => allRows(file).filter((row) => modelOf(row) === setup.model),
  };
}

/** One request for one field, or for the answer with nothing known when `field` is null: a Choice for each value in each option order. */
function requestFor(
  { setup, spec, question, watchOption, country, orders }: ScanContext,
  version: string,
  field: Field | null,
  probes: Probe[],
): ScanRequest {
  const long = question.options.some((text) => text.length > LONG_OPTION);
  const state: ScanState = {
    respondent: { profile: { country } },
    survey: {
      context: [spec.surveyed && `It is ${spec.surveyed}.`, spec.versions[version]].filter(Boolean).join(" "),
      questions: {},
    },
  };
  const questions: Record<string, SystemOneQuestion> = {},
    index: Asking[] = [];
  for (let r = 0; r < orders; r++) {
    const order = rotate(question.options, r);
    state.survey.questions[`q${r}`] = { text: question.text, options: order };
    const criteria: Record<string, string | null> = Object.fromEntries(
      order.map((text, i): [string, string | null] => (long ? [`Option ${i + 1}`, text] : [text, null])),
    );
    const pointed = DEFAULT_INSTRUCTION.replaceAll("survey.questions.q.", `survey.questions.q${r}.`);
    // With no field, one question: the answer with nothing known.
    const asked: { code: string; value?: ProbeValue }[] = field ? probes : [{ code: "base" }];
    asked.forEach((probe, n) => {
      const instructions = field
        ? pointed.replace(
            "Based on `respondent.profile`,",
            `${ONE_FACT} \`${field.path}\`: ${JSON.stringify(probe.value)},`,
          )
        : pointed;
      questions[`v${n}_o${r}`] = { type: "choice", instructions, criteria };
      index.push({
        key: `v${n}_o${r}`,
        r,
        id: field ? `${field.path}=${probe.code}` : "base",
        name: long ? `Option ${order.indexOf(watchOption) + 1}` : watchOption,
      });
    });
  }
  return { body: { model: setup.wire, state, questions }, index };
}

/**
 * Sends the requests the saved answers still lack, after printing what they cost and how long they take; nothing is
 * sent past the spending limit (--max-usd). Returns 0, or 3 (no credit) or 4 (daily quota used up) when sending
 * stopped for a reason no rescan gets past.
 */
async function send(log: Log, scan: ScanContext, flags: Record<string, string>): Promise<number> {
  const { setup } = scan;
  if (!setup.route) throw new Error(setup.reason);
  const maxUsd = Number(flags["max-usd"] ?? 0.1);
  const spent = scan.versions.reduce(
    (sum, version) => sum + allRows(scan.fileOf(version)).reduce((s, row) => s + (row.usd ?? 0), 0),
    0,
  );
  const todo = jobsOf(scan);
  if (!todo.length) return 0;
  printPlan(log, scan, setup, todo, { spent, maxUsd });
  const sent = await sendJobs(setup, todo, {
    spent,
    maxUsd,
    estimateOf: (job) => estimateOf(setup, scan.orders, [job]).usd,
    requestOf: (job) => job.request.body,
    answered: (job, json, wire, price) => {
      const lines = job.request.index.map((q, n) => {
        const p = wire.probability(json, q.key, q.name);
        if (p === undefined || !(p >= 0 && p <= 1)) throw new Error(`No answer for ${q.id}`);
        return JSON.stringify({ id: q.id, r: q.r, p, usd: n === 0 ? price.usd : 0, m: scan.model });
      });
      appendFileSync(scan.fileOf(job.version), `${lines.join("\n")}\n`);
    },
  });
  const stop =
    sent.fatal === "DAILY"
      ? `${sent.stop} The answers so far are saved: run the same scan again once it has reset, and it sends only the rest.`
      : sent.stop;
  const spentNow = spentNote(spent, sent.spent, stop);
  log.line(spentNow.line);
  log.record("spent", spentNow.record);
  if (sent.lost.length)
    log.line(
      [
        `${sent.lost.length} of ${todo.length} requests failed twice and saved nothing (the last error: ${sent.lastError}).`,
        "Their facts are missing from what follows: run the same scan again to send only those.",
      ].join(" "),
    );
  log.line("");
  // A stop no rescan gets past says so in the exit code, so discover.ts tells the owner instead of asking for a rescan.
  return sent.fatal ? (STOPPED[sent.fatal] ?? 0) : 0;
}

/**
 * What a scan says it spent. Sending counts from what the spec's saved answers already cost, so that its limit holds
 * across scans; the line and the record give this scan's own charge, so that adding up a folder's records counts each
 * answer once. `total` is the whole spec's.
 */
export function spentNote(before: number, after: number, stop: string | null) {
  const now = after - before;
  const all = before > 0 ? ` ($${after.toFixed(3)} on this spec in all)` : "";
  return {
    line: `Spent $${now.toFixed(3)} on this scan${all}.${stop ? ` Stopped: ${stop}` : ""}`,
    record: { usd: now, total: after },
  };
}

/**
 * The requests this model has not answered, each with its request: the answer with nothing known, and each field's
 * values, 30 a request.
 */
function jobsOf(scan: ScanContext): Job[] {
  const { versions, toAsk, fileOf, rowsOf } = scan;
  const todo: Job[] = [];
  const add = (version: string, field: Field | null, probes: Probe[]) =>
    todo.push({ version, probes, request: requestFor(scan, version, field, probes) });
  for (const version of versions) {
    const done = new Set(rowsOf(fileOf(version)).map((row) => row.id));
    if (!done.has("base")) add(version, null, []);
    // A long field is asked in requests of 30 values.
    for (const { field, probes } of toAsk)
      for (let at = 0; at < probes.length; at += 30) {
        const chunk = probes.slice(at, at + 30);
        if (!chunk.every((probe) => done.has(`${field.path}=${probe.code}`))) add(version, field, chunk);
      }
  }
  return todo;
}

/** What some requests are expected to cost before they are sent: { questions, tokens, usd }. */
function estimateOf(
  setup: RoutedSetup,
  orders: number,
  jobs: Job[],
): { questions: number; tokens: number; usd: number } {
  const questions = jobs.reduce((sum, job) => sum + Math.max(1, job.probes.length) * orders, 0);
  const tokens = questions * TOKENS_PER_QUESTION;
  return { questions, tokens, usd: setup.charged ? (tokens * setup.usdPerMillion) / 1e6 : 0 };
}

/** What the requests cost and how long they take, as printed; refuses (exit 1) when they would pass the limit. */
function printPlan(
  log: Log,
  scan: ScanContext,
  setup: RoutedSetup,
  todo: Job[],
  { spent, maxUsd }: { spent: number; maxUsd: number },
): void {
  const { model, versions } = scan;
  const { questions: asked, tokens, usd: estimate } = estimateOf(setup, scan.orders, todo);
  const most = mostAtOnce(setup);
  const money = (usd: number) => (usd < 0.1 ? `${(100 * usd).toFixed(1)} cents` : `$${usd.toFixed(2)}`);
  const via = setup.route === "custom" ? setup.url : ROUTES[setup.route].name;
  // There are requests, so there is a version at least.
  const across = `${versions.length} ${plural(versions.length, "version")}`;
  const cost = setup.charged ? `about ${money(estimate)}` : "no charge on Google's Free Tier";
  log.line(
    `${todo.length} requests (${asked} questions) across ${across} to ${model} through ${via}, ${cost}; limit ${money(maxUsd)}.`,
  );
  const minutes = minutesFor(setup, todo.length, tokens);
  const paced = minutes ?? Math.max(1, Math.ceil((todo.length * 1.5) / most / 60));
  if (minutes !== null && setup.limits) {
    const { label, tpm, rpm } = setup.limits;
    const tier = setup.tier ? "" : " (no tier set)";
    log.line(
      `Kept to the ${label}${tier} limits of ${tpm.toLocaleString("en-GB")} tokens and ${rpm.toLocaleString("en-GB")} requests a minute: about ${minutes} ${plural(minutes, "minute")}.`,
    );
  } else {
    log.line(`No published limit: up to ${most} requests at a time, about ${paced} minutes if the service keeps up.`);
  }
  log.record("paced", { minutes: paced });
  if (spent + estimate > maxUsd) {
    log.line("That would pass the limit. Nothing was sent; raise --max-usd, or name fewer fields.");
    throw new Exit(1);
  }
}

const signed = (x: number, digits = 0) => `${x >= 0 ? "+" : ""}${x.toFixed(digits)}`;
const share = (v: { share: number | null }) =>
  v.share ? ` (${v.share < 0.01 ? "under 1" : per100(v.share, 0)}% of adults)` : "";
const named = (v: { code: string; label: string }) => (/^[\d.]+$/.test(v.code) && v.label ? v.label : v.code); // a numeric code is shown by its title

/**
 * The saved answers read: which facts matter, where each change between versions lands, and the answers added up on
 * the generated people, for everyone and for the groups in --who.
 */
function read(log: Log, scan: ScanContext, flags: Record<string, string>, folder: string): void {
  const { country, map, versions, watchOption, fields } = scan;
  const answers = answersOf(scan);
  const first = answers[versions[0]];
  const base = first.get("base");
  if (base === undefined) throw new Error("No saved answers yet");
  log.line(
    `Map: ${country}, ${map.source?.generator_version ?? "no version"}. "${watchOption}", ${versions[0]}: ${percent(base)} with nothing known about the person.`,
  );
  const gaps = missingAnswers(answers, versions, fields);
  if (gaps.length) {
    const more = gaps.length > 8 ? `; and ${gaps.length - 8} more` : "";
    log.line(
      [
        `Missing answers, from requests that failed: ${gaps.slice(0, 8).join("; ")}${more}.`,
        "Until the same scan is run again (it sends only these),",
        "these facts add nothing to anyone's answer and are left out of the comparisons below.",
      ].join(" "),
    );
  }
  // Reading saved answers for a group prints the group, not the whole reading again: that does not change with the
  // group, and printing it for each group fills the agent's context with the same text.
  const groupsOnly = "read" in flags && Boolean(flags.who);
  if (groupsOnly)
    log.line(
      [
        "The groups asked for, from the saved answers.",
        "The reading for everyone (which facts matter, where each change lands, who moves most) does not depend on the group:",
        "read again without who to print it.",
      ].join(" "),
    );
  if (!groupsOnly) {
    printFacts(log, fields, first, base, flags);
    for (const version of versions.slice(1)) printChange(log, scan, answers, version, flags);
  }
  const found = printPeople(log, scan, answers, { flags, folder, groupsOnly });
  // How to read the first two lists, when they were printed.
  const ofLists = groupsOnly
    ? []
    : [
        "a lone fact carries everything that usually goes with it,",
        "so the first two lists show differences between kinds of person, not the effect of a fact itself.",
        "One value's figure is rough; trust a field when its levels line up in order.",
      ];
  log.line(
    [
      "\nHow to read this:",
      ...ofLists,
      "The counts on people say who is affected and roughly how many;",
      "how large each difference is depends on how strongly the facts are added up, so do not quote a size as a finding.",
      "All of it is the decision model's view of people, not a measurement of them.",
      'Label anything you repeat from here "simulated", and keep its sizes out of sums.',
    ].join(" "),
  );
  if (found) log.resolve(found.key, found.r);
}

/** Each version's answers by "path=code", averaged over the option orders: { version: Map }. */
function answersOf({ versions, fileOf, rowsOf }: ScanContext): Record<string, Map<string, number>> {
  return Object.fromEntries(
    versions.map((version) => {
      const by = new Map<string, number[]>();
      for (const row of rowsOf(fileOf(version))) {
        if (!by.has(row.id)) by.set(row.id, []);
        by.get(row.id)!.push(row.p);
      }
      return [version, new Map([...by].map(([id, ps]) => [id, mean(ps)]))];
    }),
  );
}

/** The facts that matter most to the first version and those that hardly matter, each read off a one-fact person. */
function printFacts(
  log: Log,
  fields: Asked[],
  first: Map<string, number>,
  base: number,
  flags: Record<string, string>,
): void {
  log.line(
    "Each line is a person of whom only that one fact is known. Percentages are model support, not shares of real people.",
  );
  const scanned = fields
    .map(({ field, probes }) => scanField(field, probes, first, base))
    .filter((s) => s !== null)
    .sort((a, b) => b.spread - a.spread);
  log.line(
    scanned.length < fields.length
      ? `Asked about ${scanned.length} of the map's ${fields.length} fields. A fact that was not asked about cannot show up below; name it in fields and scan again.\n`
      : "",
  );
  log.line(
    `Facts that matter most (${scanned.filter((s) => s.spread >= 0.1).length} of ${scanned.length} fields differ by 10 points or more between common values):`,
  );
  for (const s of scanned.slice(0, Number(flags.top ?? 20))) {
    log.line(
      `  ${per100(s.spread, 0).padStart(3)} points  ${s.path}: ${named(s.low)} ${signed(100 * s.low.shift)}${share(s.low)} | ${named(s.high)} ${signed(100 * s.high.shift)}${share(s.high)}`,
    );
    // The fact that matters most, for the next step the server names (mcp/nudge.ts): its two ends as printed.
    log.record("fact", { field: s.path.split(".")[1], low: named(s.low), high: named(s.high) });
  }
  log.line(
    `Facts that hardly matter (under 3 points): ${
      scanned
        .filter((s) => s.spread < 0.03)
        .map((s) => s.path.split(".")[1])
        .join(", ") || "none"
    }`,
  );
}

/** How the answers change from the first version to another: with nothing known, then where it lands most unevenly. */
function printChange(
  log: Log,
  { versions, fields }: ScanContext,
  answers: Record<string, Map<string, number>>,
  version: string,
  flags: Record<string, string>,
): void {
  const first = answers[versions[0]],
    other = answers[version];
  // read() has refused a first version with no answer with nothing known.
  const baseBefore = first.get("base"),
    baseAfter = other.get("base");
  if (baseBefore === undefined || baseAfter === undefined) return;
  const change = (from: number, to: number) => logOdds(to) - logOdds(from);
  log.line(
    `\n${versions[0]} -> ${version}: ${signed(100 * (baseAfter - baseBefore), 1)} points (${signed(change(baseBefore, baseAfter), 2)} log-odds) with nothing known.`,
  );
  const ladders = fields
    .map(({ field, probes }) => {
      const steps = probes.flatMap((probe) => {
        const id = `${field.path}=${probe.code}`;
        const before = first.get(id),
          after = other.get(id);
        return (probe.share === null || probe.share >= 0.02) && before !== undefined && after !== undefined
          ? [{ code: probe.code, label: probe.label, share: probe.share, before, after, change: change(before, after) }]
          : [];
      });
      // Fields with many unordered values (interests, occupations) are left out here: their range is mostly noise.
      return steps.length >= 3 && steps.length <= 8
        ? {
            path: field.path,
            list: field.kind === "list",
            steps,
            range: Math.max(...steps.map((s) => s.change)) - Math.min(...steps.map((s) => s.change)),
          }
        : null;
    })
    .filter((ladder) => ladder !== null)
    .sort((a, b) => b.range - a.range);
  log.line(
    "Fields where the change lands most unevenly (before -> after, change in log-odds; more negative is hit harder; then the level's share of the field's whole change):",
  );
  for (const ladder of ladders.slice(0, Number(flags.ladders ?? 6))) {
    log.line(`  ${ladder.path}`);
    const sorted = [...ladder.steps].sort((a, b) => a.change - b.change);
    // A person can hold several values of a list field (interests, conditions), so its change cannot be shared out.
    const split = ladder.list ? null : splitOfChange(sorted);
    sorted.forEach((step, i) => {
      const ofChange = split ? `  about ${percent(split[i])} of the change` : "";
      log.line(
        `    ${per100(step.before, 0).padStart(3)}% -> ${per100(step.after, 0).padStart(3)}%  ${signed(step.change, 2).padStart(6)}  ${named(step)}${share(step)}${ofChange}`,
      );
    });
  }
}

/**
 * The answers added up on the generated people: each person's answer is built from every fact they hold. Prints each
 * version's level within the audience, who moves most between versions, and the groups in --who. Returns what the read
 * found, for the reply ({ key, r }: scanResolution), or null when fewer than two versions have answers.
 */
function printPeople(
  log: Log,
  { country, map, versions, label, watchOption }: ScanContext,
  answers: Record<string, Map<string, number>>,
  { flags, folder, groupsOnly }: { flags: Record<string, string>; folder: string; groupsOnly: boolean },
): { key: string; r: Resolution } | null | undefined {
  const peopleFile = flags.people || fileURLToPath(new URL(`../maps/${country}-people.bin.gz`, import.meta.url));
  if (!existsSync(resolve(folder, peopleFile)) || (!flags.people && flags.map)) {
    if (flags.who) throw new Error("Groups are read on the generated people, and this map has no people file");
    return;
  }
  const file = keptFile(peopleFile, readPeopleFile, folder),
    pool: Row[] = file.people;
  // The map's fields with the packed file's lists placed (a copy: the map read once stays as it was).
  const placed = file.packed ? placeLists(map.fields, file) : map.fields;
  // With no --damping, the facts add up by how many fields are read (scan-answers.ts dampingFor).
  const given = flags.damping === undefined ? undefined : Number(flags.damping),
    known = flags.level === undefined ? null : Number(flags.level);
  // The audience: all adults, or the people who meet --among. Everything is counted within it.
  const among = flags.among ? conditionsOf(placed, flags.among.split(",")) : [];
  const everyone = pool.map((_, i) => i).filter((i) => matches(among, pool[i]));
  if (everyone.length < 100)
    throw new Error(`Only ${everyone.length} of the ${pool.length} people fit --among: too few to count on`);
  const one = (version: string, options: { target?: number | null; shift?: number; damping?: number }) =>
    peopleAnswers(placed, pool, answers[version], { damping: given, over: everyone, ...options });
  // Every version is added up as the first was, so that each keeps the same footing.
  const start = one(versions[0], { target: known }),
    damping = start.damping;
  const per: Record<string, PeopleAnswers> = Object.fromEntries(
    versions.map((version, n) => [version, n ? one(version, { shift: start.shift, damping }) : start]),
  );
  const reading: Reading = { placed, pool, everyone, among, answers, per, damping, known, versions };
  const within = among.length
    ? `: ${describeConditions(among)}, ${per100(everyone.length / pool.length)}% of adults`
    : "";
  const setTo = known !== null ? `, with ${versions[0]} set to the ${per100(known)}% you gave` : "";
  log.line(
    `\nSimulated: the model's answers added up on ${everyone.length} generated people, each person once${within}${setTo}.`,
  );
  const whom = among.length ? "in this audience" : "adults";
  const byVersion = versions.map((version) => `${per100(avg(per[version].p, everyone))} ${version}`).join(", ");
  log.line(
    `Simulated, of every 100 ${whom} (the model's answer, to compare versions and groups; not how many would act): ${byVersion}.`,
  );
  for (const version of groupsOnly ? [] : versions.slice(1)) printMovers(log, reading, version);
  const groups = printGroups(log, reading, flags);
  // What this read found, for the reply: which version comes first for everyone read and in each group.
  const asked = versions.filter((version) => answers[version].has("base"));
  const levels = (list: number[]) => asked.map((version) => ({ version, p: avg(per[version].p, list) }));
  const read: GroupRead[] = [
    ...(groupsOnly ? [] : [{ name: among.length ? "this audience" : "adults", levels: levels(everyone), all: true }]),
    ...groups.map((g) => ({ name: g.name, levels: levels(g.members) })),
  ];
  return asked.length >= 2 && read.length
    ? {
        key: `scan:${label}|${groupsOnly ? flags.who : ""}`,
        r: scanResolution({ watchOption, base: versions[0], read }),
      }
    : null;
}

/**
 * What a read of an options scan found, as a resolution (scripts/log.ts resolutionText): which version gets the
 * watched answer most, for everyone read and in each group, against the first version (the baseline). The first
 * version first wherever one leads confirms it; another first anywhere changes it; versions within 1 in every 100 of
 * each other everywhere cannot tell. Simulated: the order of the versions, not how many would act.
 */
export function scanResolution({
  watchOption,
  base,
  read,
}: {
  watchOption: string;
  base: string;
  read: GroupRead[];
}): Resolution {
  const CLOSE = 0.01;
  const each = read.map((r) => {
    const [first, second] = [...r.levels].sort((a, b) => b.p - a.p);
    return { ...r, lead: first.version, close: first.p - second.p < CLOSE };
  });
  const where = (r: GroupRead) => (r.all ? `for ${r.name}` : `among ${r.name}`);
  // The scan's label is nxk's name for it, not the owner's: the answer followed says which scan it was.
  const checked = `which version gets the answer "${watchOption}" most`;
  const clear = each.filter((r) => !r.close);
  if (!clear.length)
    return {
      checked,
      found: `the versions come within 1 in every 100 of each other ${each.length > 1 ? "in every group read" : where(each[0])} (simulated)`,
      outcome: "unclear",
      why: "too close to choose on",
    };
  // Groups are counted by the version that comes first, not named: their conditions run long.
  const everyone = each.find((r) => r.all),
    groups = each.filter((r) => !r.all);
  const firsts = new Map<string, number>();
  for (const g of groups.filter((g) => !g.close)) firsts.set(g.lead, (firsts.get(g.lead) ?? 0) + 1);
  const close = groups.filter((g) => g.close).length;
  const inGroups =
    groups.length === 1
      ? groups[0].close
        ? "too close to call in the group read"
        : `"${groups[0].lead}" first in the group read`
      : `in ${groups.length} groups, ${[
          ...[...firsts].sort((a, b) => b[1] - a[1]).map(([version, n]) => `"${version}" first in ${n}`),
          ...(close ? [`too close to call in ${close}`] : []),
        ].join(", ")}`;
  const found = `${[
    ...(everyone
      ? [everyone.close ? `too close to call ${where(everyone)}` : `"${everyone.lead}" first ${where(everyone)}`]
      : []),
    ...(groups.length ? [inGroups] : []),
  ].join("; ")} (simulated)`;
  const others = [...new Set(clear.map((r) => r.lead).filter((v) => v !== base))];
  if (!others.length) return { checked, found, outcome: "confirmed", why: `"${base}" stays` };
  return {
    checked,
    found,
    outcome: "changed",
    why:
      others.length === 1 && clear.every((r) => r.lead === others[0])
        ? `"${others[0]}" over "${base}"`
        : "it depends on the group",
  };
}

const avg = (p: number[], list: number[]) => mean(list.map((i) => p[i]));

/**
 * Who moves most from the first version to another: the fifth of the audience whose answer changes most, what marks
 * them out, and whether the same people stand out when the facts are added up half and one and a half times as
 * strongly.
 */
function printMovers(
  log: Log,
  { placed, pool, everyone, among, answers, per, damping, known, versions }: Reading,
  version: string,
): void {
  const start = per[versions[0]],
    first = answers[versions[0]];
  const rows = everyone.map((i) => pool[i]);
  // How far each person in the audience falls from a to b: every one of `everyone` is a key.
  const fall = (a: PeopleAnswers, b: PeopleAnswers) =>
    new Map(everyone.map((i): [number, number] => [i, a.p[i] - b.p[i]]));
  const total = (d: Map<number, number>) => mean([...d.values()]);
  const drop = fall(start, per[version]),
    way = Math.sign(total(drop)) || 1;
  const hardest = (d: Map<number, number>) =>
    new Set([...everyone].sort((i, j) => way * (d.get(j)! - d.get(i)!)).slice(0, Math.floor(everyone.length / 5)));
  // The fifth are people in the audience, so each is a key of `drop`.
  const fifth = hardest(drop),
    list = [...fifth];
  const ofChange = percent(list.reduce((sum, i) => sum + drop.get(i)!, 0) / (total(drop) * everyone.length));
  log.line(
    [
      `\n${versions[0]} -> ${version}: ${signed(-100 * total(drop), 1)} in every 100.`,
      `The fifth moved most go from ${per100(avg(start.p, list))}% to ${per100(avg(per[version].p, list))}%`,
      `and make up ${ofChange} of the change.`,
      `Against ${among.length ? "the audience" : "all adults"} they are:`,
    ].join(" "),
  );
  const lines = profile(
    placed,
    rows,
    everyone.map((i) => fifth.has(i)),
  );
  const age = lines.find((line) => line.numeric && line.path === "identity.age_years");
  if (age && age.group !== age.all) log.line(`  age: middle value ${age.group} against ${age.all}`);
  for (const line of marked(lines, { gap: 0.08, top: 10, perField: 1 }))
    log.line(
      `  ${line.gap > 0 ? "more" : "less"}  ${per100(line.group, 0).padStart(3)}% against ${per100(line.all, 0).padStart(3)}%  ${line.path.split(".")[1]}: ${line.label}  [${tierLabel(line.tier)}]`,
    );
  // The same reading with the facts added up less and more strongly: who is affected should hardly change.
  const again = [0.5 * damping, 1.5 * damping].map((k) => {
    const a = peopleAnswers(placed, pool, first, { damping: k, target: known, over: everyone }),
      b = peopleAnswers(placed, pool, answers[version], { damping: k, shift: a.shift });
    const d = fall(a, b);
    return { total: total(d), same: [...hardest(d)].filter((i) => fifth.has(i)).length / fifth.size };
  });
  const totals = again.map((x) => signed(-100 * x.total, 1)).join(" and ");
  const same = again.map((x) => percent(x.same)).join(" and ");
  log.line(
    `  With the facts added up half and one and a half times as strongly: ${totals} in every 100, and ${same} of the same people in that fifth.`,
  );
}

/**
 * Each group in --who, read off the people: its size within the audience and each version's level in it. Returns the
 * groups with enough people to read: [{ name, members }].
 */
function printGroups(
  log: Log,
  { placed, pool, everyone, among, per, versions }: Reading,
  flags: Record<string, string>,
): { name: string; members: number[] }[] {
  const who = among.length ? "this audience" : "adults",
    read: { name: string; members: number[] }[] = [];
  // Several groups at once, separated by semicolons: each read is otherwise a turn of its own.
  for (const text of (flags.who ?? "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)) {
    const conditions = conditionsOf(placed, text.split(","));
    const group = everyone.filter((i) => matches(conditions, pool[i]));
    log.line(
      `\n${describeConditions(conditions)}: ${group.length} of ${everyone.length} people, ${per100(group.length / everyone.length)}% of ${who}.`,
    );
    if (group.length < 30) log.line("  Too few people to read.");
    else {
      log.line(
        `  ${versions.map((version) => `${per100(avg(per[version].p, group))}% ${version}`).join(", ")}${group.length < 100 ? "  (under 100 people: a lead)" : ""}`,
      );
      read.push({ name: describeConditions(conditions), members: group });
    }
  }
  return read;
}

// From a shell, a scan stops when whatever started it has gone (killed, or timed out): nobody is left to read what it
// would send.
cli(import.meta.url, run, { orphaned: "Stopped: what started this scan has ended." });
