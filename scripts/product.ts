// What nxk has learned about one product, kept between steps and between builds: what the product is, who it is for,
// what the owner said (shares of their customers, and answers in words), the owner's figures, the questions asked,
// the segments found by discovery, the suggestions made, and what happened (the owner's results, set against what nxk
// said: scripts/outcome.ts). It is `nxk.json` at the root of the owner's project (the folder holding .git), found
// from any folder below. Every entry says where it came from: owner (the owner said so), measured (the owner's own
// records), counted, sourced, simulated, or guess (yours). Shares only, never a customer.
//
// suggest.ts reads it: the audience when suggestions.json names none, and the owner's shares, which it uses to count
// among people like the owner's customers. It adds each suggestion it counts (kept under "suggestions": what the owner
// set, and whether another option was worth raising). A guess is kept and printed as a guess;
// it is never used as what the owner said. The MCP tools (mcp/knowledge.ts) read and write it.
import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { labelled, type Line, type LogRecord } from "./log.ts";
import { trackRecord } from "./outcome.ts";
import type { Country } from "./population.ts";
import { pacedIn, readLog } from "./records.ts";
import { plain } from "./reply.ts";

// ---------------------------------------------------------------------------------------------------------------
// nxk.json, part by part

/** Where an entry of the owner's came from: the owner said so, their own records, or a guess (yours, never used as theirs). */
export type Source = "owner" | "measured" | "guess";

/** How far along the product is. */
export type Stage = "none" | "idea" | "defined" | "live";

/** What the product is: its name, a one-paragraph description as a customer would meet it, and its stage. */
export interface ProductSummary {
  name?: string;
  description?: string;
  stage?: Stage;
  date?: string;
}

/** A place as place conditions, counted: where the owner sells, or where a research question is about. */
export interface Place {
  /** The conditions (region=..., county_or_local_authority=...). */
  among: string;
  /** The conditions in words. */
  text: string;
  /** Its share of all adults (counted). */
  share: number;
  date: string;
}

/** Who the product is for, as conditions the tools read, where that came from, and why. */
export interface Audience {
  among: string;
  /** Where it came from: owner, measured, counted, sourced, simulated or guess. */
  source: string;
  why?: string;
  date: string;
}

/** A share of the owner's customers: how many in every 100 are in a group, or null when the owner does not know. */
export interface CustomerShare {
  /** The group, as one condition (age_years=65..120). */
  fact: string;
  share: number | null;
  source: Source;
  note?: string;
  date: string;
}

/** A share of the owner's customers that can weight the people: not a guess, and a number (knownShares). */
export type KnownShare = CustomerShare & { share: number };

/** What addCustomers is given: the share as a number or text, "unknown" or null when not known; `source` is checked. */
export interface NewCustomerShare {
  fact: string;
  share: number | string | null;
  source: string;
  note?: string | null;
}

/** What the owner said in words on a topic (a contact, a policy, a price), or null when they do not know. */
export interface OwnerFact {
  topic: string;
  answer: string | null;
  source: Source;
  note?: string;
  date: string;
}

/** What addFact is given; `source` is checked. */
export interface NewFact {
  topic: string | null;
  answer?: string | null;
  source: string;
  note?: string | null;
}

/** One of the owner's figures, by name: a price, a margin, a budget for scans. */
export interface MoneyFigure {
  name: string;
  value: number;
  source: Source;
  date: string;
}

/** What addMoney is given; `source` is checked. */
export interface NewMoneyFigure {
  name: string;
  value: number;
  source: string;
}

/** What the owner has answered by name, a fact in words or a figure (ownerAnswers). */
export interface OwnerAnswer {
  topic: string;
  answer: string;
}

/** What a question to the owner asks for: a share of their customers, words, or a figure. */
export type QuestionKind = "share" | "words" | "figure";

/** Where a question stands: open, answered, not known to the owner, or declined. */
export type QuestionStatus = "open" | "answered" | "unknown" | "declined";

/** A question put to the owner, kept so that nothing is asked twice. Ids run q1, q2, ... */
export interface Question {
  id: string;
  question: string;
  topic: string | null;
  kind: QuestionKind;
  /** For a share: the group, as a condition. */
  fact?: string;
  /** What the answer changes. */
  why?: string;
  status: QuestionStatus;
  asked: string;
  /** What was said, once it is closed, and when. */
  answer?: string;
  answered?: string;
}

/** What addQuestion is given: the question, and what it is about. */
export interface NewQuestion {
  question: string;
  topic?: string | null;
  kind?: QuestionKind;
  fact?: string | null;
  why?: string | null;
}

/** How clearly a corner prefers its offer to their average one: x2 or more is strong, x1.15 faint, below that none. */
export type Strength = "strong" | "faint" | "none";

/** An offer put to the people in a scan. */
export interface ScanIdea {
  key: string;
  /** The offer as a person would meet it, with its price. */
  offer: string;
  /** The fields it was asked about besides the general ones. */
  fields?: string[];
  /** What organisations buy it as, for an offer asked at work. */
  buying_category?: string;
  /** The owner's own offer. */
  own?: boolean;
  /** How people do the job now without buying an offer (by hand, a spreadsheet, a free template), never going without. */
  now?: boolean;
}

/** How keen people are on one offer by age band or by gender (simulated), each group with its share of the people. */
export interface KeenBy {
  by: "age" | "gender";
  groups: { label: string; share: number; keen: number }[];
}

/** An offer's corner: the group that prefers it most to the other offers (for the owner's own, its keenest people). */
export interface ScanCorner {
  /** The offer's key. */
  key: string;
  among: string;
  label: string;
  /** The group's share of all adults (counted). */
  share: number;
  /** How many times more the group prefers the offer than their average offer. */
  odds: number;
  strength: Strength;
  /** How keen the group is on it, against how keen everyone is (`room`), simulated. */
  keen: number;
  room: number;
  /** Whom `room` is of, when not all adults (people in work). */
  room_of?: string;
  own?: boolean;
  /** For the owner's own offer: how keen by age and gender. */
  by?: KeenBy[];
}

/** A big group keen on doing the job themselves that none of a scan's offers serves, and the offer that came nearest. */
export interface ScanGap {
  among: string;
  label: string;
  share: number;
  best: string;
  /** The way of doing it now they are keenest on (absent on scans saved before it was read). */
  now?: string;
}

/** A scan of offers, saved once read. Ids run scan1, scan2, ... */
export interface Scan {
  id: string;
  kind: "ideas";
  /** The name it was started with, used for its files. */
  label: string;
  /** The research question it was started for. */
  study?: string;
  /** The decision model that answered it; missing on scans saved before the model was recorded. */
  model?: string;
  ideas: ScanIdea[];
  /** The spending limit it was sent with, in US dollars; missing when it was only read. */
  max_usd?: number;
  /** How alike the people wanting each offer are: 1 the same people, near 0 different people. */
  likeness?: number;
  corners: ScanCorner[];
  nothing_for: ScanGap[];
  date: string;
}

/** What addScan is given: the scan without its id and date. */
export type NewScan = Omit<Scan, "id" | "date">;

/**
 * How keen a kept segment's group is, from the scan it was kept from (simulated): the corner's figures, the scan and
 * idea alone when they cannot be read, or the best offer for a group none serves.
 */
export interface Intent {
  scan: string;
  idea?: string;
  odds?: number;
  keen?: number;
  room?: number;
  room_of?: string;
  none_serves?: boolean;
  best?: string;
}

/** A business already serving a segment, with words copied from its page (sourced). */
export interface Rival {
  name: string;
  offer: string | null;
  link: string;
  words: string;
  source: "sourced";
  date: string;
}

/** A segment's standing: a candidate until it is dropped. */
export type SegmentStatus = "candidate" | "dropped";

/** A group kept as a candidate audience. Ids run s1, s2, ... */
export interface Segment {
  id: string;
  /** How the owner would say it. */
  label: string;
  /** The group, as conditions. */
  among: string;
  /** Its share of all adults, and how many adults that is (counted). */
  share: number;
  people: number;
  intent: Intent | null;
  /** The scanned offer it was kept for, and what organisations buy it as when it was asked at work. */
  offer?: string;
  at_work?: string;
  why?: string;
  rivals: Rival[];
  /** What was searched when no rival was found. */
  rivals_none: string | null;
  status: SegmentStatus;
  date: string;
}

/** What addSegment is given: the group and what is known of it. Its id, rivals and status are kept, or start fresh. */
export type NewSegment = Omit<Segment, "id" | "rivals" | "rivals_none" | "status" | "date">;

/** What discovery found: the scans run, and the segments kept. */
export interface Discovery {
  scans: Scan[];
  segments: Segment[];
}

/** A suggestion counted by suggest.ts (suggest-print.ts suggestionRecord); one a folder and name, the latest kept. */
export interface CountedSuggestion {
  date: string;
  /** The folder it was counted in, relative to the project's root ("." for the root). */
  folder: string;
  suggestion: string;
  /** The rule written before counting, for a term the owner set. */
  rule: string | null;
  /** The owner's option as asked, and what could be offered if they say yes. */
  as_asked?: string;
  offer?: string | null;
  /** For a rule with a figure: the count it is about, its value in every 100, and the figure it was held against. */
  count?: string;
  value?: number;
  threshold?: number;
  /** Whether the other option was worth raising. */
  raised?: boolean;
  /**
   * The option the counts favour; for a choice left to the session, the one that turns away the fewest. Null when no
   * option differs from the one kept as asked.
   */
  pick: string | null;
  /** The value and the option favoured among people like the owner's customers, when their shares are known. */
  customersValue?: number;
  customersPick?: string | null;
  /** The number to watch once it is built. */
  watch: string | null;
}

/** What a result measures: one offer's take-up by group, one choice tried two or more ways, or who the customers were. */
export type OutcomeKind = "groups" | "options" | "customers";

/** The claims nxk makes, as the track record counts them (scripts/outcome.ts CLAIMS). */
export type Claim = "scan_groups" | "segment_customers" | "decision_pick" | "scan_order";

/** How a result compares with what nxk said beforehand (scripts/outcome.ts). */
export type Verdict = "agrees" | "disagrees" | "too few to tell" | "nothing to compare";

/** One arm of a result: a group or an option, how many saw it and how many took it up. */
export interface OutcomeArm {
  name: string;
  /** The group, as conditions (groups and customers). */
  among: string | null;
  /** How many saw it (groups and options). */
  shown: number | null;
  /** How many took it up; for customers, how many customers are in the group. */
  took: number;
}

/**
 * One comparison: two arms (a against b), or a group's share of the customers against its share of adults (no b). The
 * difference with its interval, the lean nxk said and its direction (1, -1, or 0 for none), and the verdict.
 */
export interface Comparison {
  a: string;
  b?: string;
  d: number;
  lo: number;
  hi: number;
  lean: number | null;
  direction: number;
  verdict: Verdict;
}

/** What a result is set against: a scan's offer, a segment or a suggestion, or why it is set against none. */
export interface OutcomeAbout {
  scan?: string;
  idea?: string;
  segment?: string;
  suggestion?: string;
  unscanned?: string;
}

/** A result the owner measured, set against what nxk said beforehand. Ids run o1, o2, ... */
export interface Outcome {
  id: string;
  source: "measured";
  /** What was measured, where and when. */
  what: string;
  kind: OutcomeKind;
  claim: Claim;
  about?: OutcomeAbout;
  arms: OutcomeArm[];
  /** For customers: all the customers counted. */
  total?: number;
  comparisons: Comparison[];
  date: string;
}

/** What addOutcome is given: the result without its id, source and date. */
export type NewOutcome = Omit<Outcome, "id" | "source" | "date">;

/** What the explorer knew at a call: the lead, and how much was known, to tell later what the moves since found. */
export interface ExploreLook {
  lead: { key: string; label: string } | null;
  kept: number;
  splits: number;
  rivals: number;
  scans: number;
  answers: number;
}

/** One explore_next call: when, a fingerprint of what was known, and the step it named. */
export interface ExploreRound {
  date: string;
  fingerprint: string;
  step: string;
}

/** The explorer's state on a research question (mcp/explore.ts), built up call by call. */
export interface ExploreState {
  /** The segments split by who is keenest. */
  splits?: string[];
  /** The groups new offers were scanned for (groupOf). */
  widened?: string[];
  /** Widening rounds in a row that found no strong corner. */
  dry?: number;
  /** A widen named and not settled yet: the group, and how many scans there were when it was named. */
  pending?: { gap: string; scans: number } | null;
  /** What was known at the first call that had a scan to read. */
  first?: ExploreLook;
  /** The last 30 calls. */
  rounds?: ExploreRound[];
  /** The last move named. */
  next?: { kind: string; step: string; tool: string };
  /** Whether the last call found anything changed since the one before. */
  progress?: boolean;
}

/** Whether a research question is the one being worked on. Opening one closes any other. */
export type StudyStatus = "open" | "closed";

/** A research question, opened by research_start. Ids run r1, r2, ... */
export interface Study {
  id: string;
  /** The owner's question, in their words. */
  question: string;
  where: Place | null;
  /** The most to spend on scans, in US dollars, when the owner gave it. */
  budget: number | null;
  /** The ids or labels of saved scans it reads. */
  include: string[];
  /** The scans and segments made from here on are this study's: how many there were when it opened. */
  scans_from: number;
  segments_from: number;
  status: StudyStatus;
  explore: ExploreState | null;
  date: string;
}

/** What addStudy is given: the owner's question, its place and budget, and the saved scans it reads. */
export interface NewStudy {
  question: string;
  where?: Place | null;
  budget?: number | null;
  include?: string[];
}

/** nxk.json, as readProduct gives it: every part there, empty when the file leaves it out. */
export interface Product {
  version: number;
  country: Country | null;
  product: ProductSummary | null;
  where: Place | null;
  audience: Audience | null;
  customers: CustomerShare[];
  facts: OwnerFact[];
  money: MoneyFigure[];
  questions: Question[];
  discovery: Discovery;
  suggestions: CountedSuggestion[];
  outcomes: Outcome[];
  /**
   * Null as kept: explore_next keeps its state on the open research question (Study.explore), and the explorer's view
   * of that question (mcp/explorer.ts scoped) puts it here.
   */
  explore: ExploreState | null;
  research: Study[];
}

/** What a scan left running in the background was started with, as `<label>.run.json` keeps it (mcp/common.ts). */
export interface ScanRun {
  pid: number;
  /** When it started, as an ISO date and time. */
  started: string;
  label: string;
  /** The offers it was started with, to read it with once it has finished. */
  ideas?: ScanIdea[];
  /** The research question it was started for. */
  study?: string | null;
}

/** A scan left running in a folder, as it now stands (runningScan). */
export interface RunningScan extends ScanRun {
  /** Its `.run.json` file. */
  file: string;
  /** What it has printed so far. */
  log: string;
  /** What it has meant so far. */
  records: LogRecord[];
  alive: boolean;
  /** How long it is paced to take, in minutes, or null when it has not said. */
  minutes: number | null;
  /** Minutes since it started. */
  ago: number;
}

// ---------------------------------------------------------------------------------------------------------------
// Where it is, and reading and writing it

export const FILE = "nxk.json";
export const SOURCES: Source[] = ["owner", "measured", "guess"];

/** The nxk.json above `from`, or null. The search stops at the project's root (the folder holding .git). */
export function findProduct(from: string): string | null {
  for (let dir = resolve(from); ; dir = dirname(dir)) {
    if (existsSync(join(dir, FILE))) return join(dir, FILE);
    if (existsSync(join(dir, ".git")) || dirname(dir) === dir) return null;
  }
}

/** Where a new nxk.json goes: the project's root (the folder holding .git), or `from` when there is none. */
export function productHome(from: string): string {
  for (let dir = resolve(from); ; dir = dirname(dir)) {
    if (existsSync(join(dir, ".git"))) return dir;
    if (dirname(dir) === dir) return resolve(from);
  }
}

/**
 * Where the owner's own requests are kept (hooks/asked.ts saves a session's prompts once nxk is used): beside nxk.json,
 * then where a new one would go. The first is where the hook writes; note_check reads every one that exists, so a
 * figure the owner typed is given even when no tool saved the request.
 */
export function askedFiles(from: string): string[] {
  const file = findProduct(from);
  const beside = file ? [join(dirname(file), ".nxk", "asked.md")] : [];
  return [...new Set([...beside, join(productHome(from), ".nxk", "asked.md")])];
}

/** Where a product's scans are kept: beside its nxk.json, so two products in one repository keep theirs apart. */
export const scansDir = (from: string): string => {
  const file = findProduct(from);
  return join(file ? dirname(file) : productHome(from), ".nxk", "scans");
};

/**
 * The script left running by background in a folder, if any: what it was started with, whether it still runs, what it
 * has printed (`log`) and meant so far (`records`, from `<label>.run.jsonl`), with the pace it recorded (`minutes`).
 */
export function runningScan(dir: string): RunningScan | null {
  const file = existsSync(dir) ? readdirSync(dir).find((f) => f.endsWith(".run.json")) : null;
  if (!file) return null;
  const at = join(dir, file),
    log = at.replace(/\.json$/, ".log");
  let run: ScanRun,
    records: LogRecord[] = [];
  try {
    run = JSON.parse(readFileSync(at, "utf8"));
  } catch {
    return null;
  }
  try {
    records = readLog(at.replace(/\.json$/, ".jsonl")).flatMap((r) => r.records);
  } catch {
    /* none read: no pace known */
  }
  let alive = true;
  try {
    process.kill(run.pid, 0);
  } catch {
    alive = false;
  }
  const said = existsSync(log) ? readFileSync(log, "utf8") : "";
  return {
    ...run,
    file: at,
    log: said,
    records,
    alive,
    minutes: pacedIn(records),
    ago: Math.round((Date.now() - Date.parse(run.started)) / 60000),
  };
}

/** One line on a scan left in the background in `dir`, or null: still running (start no other), or finished and unread. */
export function scanNote(dir: string): string | null {
  const run = runningScan(dir);
  if (!run) return null;
  const paced = run.minutes ? `, paced to about ${run.minutes} minutes` : "";
  return run.alive
    ? [
        `A scan (${run.label}) is running in the background: started ${run.ago} minutes ago${paced}.`,
        `Start no other scan; once it has finished, ideas_scan with label "${run.label}" alone reads it (sends nothing, needs no key).`,
      ].join(" ")
    : `A scan (${run.label}) has finished in the background and is not read yet: call ideas_scan with label "${run.label}" alone to read it. Reading sends nothing and needs no key.`;
}

export const emptyProduct = (): Product => ({
  version: 2,
  country: null,
  product: null,
  where: null,
  audience: null,
  customers: [],
  facts: [],
  money: [],
  questions: [],
  discovery: { scans: [], segments: [] },
  suggestions: [],
  outcomes: [],
  explore: null,
  research: [],
});

export function readProduct(file: string | null): Product {
  if (!file || !existsSync(file)) return emptyProduct();
  // As written, any part may be missing (an older file, or one written by hand), discovery's lists among them.
  const read: Partial<Omit<Product, "discovery">> & { discovery?: Partial<Discovery> } = JSON.parse(
    readFileSync(file, "utf8"),
  );
  return { ...emptyProduct(), ...read, discovery: { scans: [], segments: [], ...read.discovery } };
}

/**
 * The product above `from` (an empty one when there is no nxk.json), or null when its nxk.json cannot be read: that is
 * the product tool's to report, and a check that only reads it, such as the Stop hook's, must not break on it.
 */
export function productOrNull(from: string): Product | null {
  try {
    return readProduct(findProduct(from));
  } catch {
    return null;
  }
}

export function writeProduct(file: string, product: Product): void {
  writeFileSync(`${file}.tmp`, `${JSON.stringify(product, null, 1)}\n`);
  renameSync(`${file}.tmp`, file);
}

const sourceOk: (source: string) => asserts source is Source = (source) => {
  if (!(SOURCES as string[]).includes(source)) throw new Error(`source must be one of ${SOURCES.join(", ")}`);
};

/** The owner's shares that can weight the people: given by the owner or measured, with a number. */
export const knownShares = (product: Product): KnownShare[] =>
  product.customers.filter((entry): entry is KnownShare => entry.source !== "guess" && typeof entry.share === "number");

/** Record a share of the owner's customers; a later entry for the same fact replaces the earlier one. */
export function addCustomers(
  product: Product,
  { fact, share, source, note = null }: NewCustomerShare,
  date = today(),
): Product {
  sourceOk(source);
  const value = share === "unknown" || share === null ? null : Number(share);
  if (value !== null && !(value >= 0 && value <= 100))
    throw new Error("A share is how many in every 100 of the customers (0 to 100), or unknown");
  const customers = product.customers.filter((entry) => entry.fact !== fact);
  customers.push({ fact, share: value, source, ...(note ? { note } : {}), date });
  return { ...product, customers };
}

/** Record what the owner said in words on a topic (a contact, a policy, a price); a later answer replaces it. */
export function addFact(product: Product, { topic, answer, source, note = null }: NewFact, date = today()): Product {
  sourceOk(source);
  if (!String(topic ?? "").trim() || answer === undefined) throw new Error("a fact needs a topic and an answer");
  const key = String(topic).trim().toLowerCase();
  const facts = product.facts.filter((entry) => entry.topic.toLowerCase() !== key);
  facts.push({
    topic: String(topic).trim(),
    answer: answer === null ? null : String(answer),
    source,
    ...(note ? { note } : {}),
    date,
  });
  return { ...product, facts };
}

/**
 * What the owner has answered by name: each fact in words and each figure they gave or measured, as { topic, answer }.
 * A guess and "does not know" are not answers. A fact listed as open for terms is closed by an answer on its topic.
 */
export const ownerAnswers = (product: Product): OwnerAnswer[] => [
  ...product.facts
    .filter((f) => f.source !== "guess" && f.answer !== null && f.answer !== undefined)
    .map((f) => ({ topic: f.topic, answer: String(f.answer) })),
  ...product.money.filter((m) => m.source !== "guess").map((m) => ({ topic: m.name, answer: String(m.value) })),
];
/** The owner's answer on a topic, the names compared as words ("Return window" is "return window"), or null. */
export const answerOn = (answers: OwnerAnswer[], topic: string): OwnerAnswer | null =>
  answers.find((a) => plain(a.topic) === plain(topic)) ?? null;

/** Record one of the owner's figures; a later value under the same name replaces it. */
export function addMoney(product: Product, { name, value, source }: NewMoneyFigure, date = today()): Product {
  sourceOk(source);
  return { ...product, money: [...product.money.filter((m) => m.name !== name), { name, value, source, date }] };
}

/** A question put to the owner. The same question, or the same share asked about, is not added twice. */
export function addQuestion(
  product: Product,
  { question, topic = null, kind = "words", fact = null, why = null }: NewQuestion,
  date = today(),
): { product: Product; question: Question; repeated: boolean } {
  const same = product.questions.find(
    (q) =>
      (fact && q.fact === fact) || (!fact && topic && q.topic === topic && q.kind === kind) || q.question === question,
  );
  if (same) return { product, question: same, repeated: true };
  const entry: Question = {
    id: `q${product.questions.length + 1}`,
    question,
    topic,
    kind,
    ...(fact ? { fact } : {}),
    ...(why ? { why } : {}),
    status: "open",
    asked: date,
  };
  return { product: { ...product, questions: [...product.questions, entry] }, question: entry, repeated: false };
}

/** Mark a question answered (or not known) with what was said. */
export function closeQuestion(
  product: Product,
  id: string,
  { status, answer }: { status: QuestionStatus; answer: string },
  date = today(),
): Product {
  return {
    ...product,
    questions: product.questions.map((q) => (q.id === id ? { ...q, status, answer, answered: date } : q)),
  };
}

/**
 * What came of a suggestion, in a few words: the owner's option kept and whether another was raised, or for a choice
 * left to the session, the option built, or the one its rule picked.
 */
export function outcomeOf(d: CountedSuggestion): string {
  if (d.as_asked) return `kept "${d.as_asked}" as asked${d.raised ? `; raised "${d.pick}"` : ""}`;
  if (d.rule === null || d.rule === undefined || d.value === undefined) return `built "${d.pick}"`;
  return `the rule picked ${d.pick}${d.customersPick ? `, among the owner's customers ${d.customersPick}` : ""}`;
}

/** A suggestion counted by suggest.ts; one entry a folder and name, the latest kept. */
export function addSuggestion(product: Product, entry: CountedSuggestion): Product {
  const kept = product.suggestions.filter((s) => !(s.folder === entry.folder && s.suggestion === entry.suggestion));
  return { ...product, suggestions: [...kept, entry] };
}

/** A segment is its group: the same conditions in any order are the same segment, whatever it is called. */
export const groupOf = (among: string | null | undefined): string =>
  String(among ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean)
    .sort()
    .join(",");

/** A candidate segment. The same group (or label) again updates the one kept: its id, rivals and status stay. */
export function addSegment(
  product: Product,
  segment: NewSegment,
  date = today(),
): { product: Product; segment: Segment; was: Segment | null } {
  const { segments } = product.discovery;
  const old =
    segments.find((s) => groupOf(s.among) === groupOf(segment.among)) ??
    segments.find((s) => s.label === segment.label);
  const id = old?.id ?? `s${segments.length + 1}`;
  const entry: Segment = {
    id,
    rivals: old?.rivals ?? [],
    rivals_none: old?.rivals_none ?? null,
    status: old?.status ?? "candidate",
    ...segment,
    date,
  };
  const next = old ? segments.map((s) => (s.id === id ? entry : s)) : [...segments, entry];
  return {
    product: { ...product, discovery: { ...product.discovery, segments: next } },
    segment: entry,
    was: old ?? null,
  };
}

/** A segment changed by `change`, which gives the fields that change; throws listing the segments when there is none. */
export function updateSegment(product: Product, id: string, change: (segment: Segment) => Partial<Segment>): Product {
  if (!product.discovery.segments.some((s) => s.id === id))
    throw new Error(
      `No segment "${id}": the segments are ${product.discovery.segments.map((s) => s.id).join(", ") || "none yet"}`,
    );
  return {
    ...product,
    discovery: {
      ...product.discovery,
      segments: product.discovery.segments.map((s) => (s.id === id ? { ...s, ...change(s) } : s)),
    },
  };
}

/** The research question being worked on: the last one research_start opened and nothing has closed, or null. */
export const studyOf = (product: Product | null): Study | null =>
  [...(product?.research ?? [])].reverse().find((s) => s.status === "open") ?? null;

/**
 * A research question, opened: { id, question, where, budget, include, scans_from, segments_from, status, explore }.
 * The scans and segments made from here on are this study's, with the saved scans it names in include; any study
 * still open is closed, so two questions never mix their leads.
 */
export function addStudy(
  product: Product,
  { question, where = null, budget = null, include = [] }: NewStudy,
  date = today(),
): { product: Product; study: Study } {
  const research = (product.research ?? []).map((s): Study => (s.status === "open" ? { ...s, status: "closed" } : s));
  const entry: Study = {
    id: `r${research.length + 1}`,
    question,
    where,
    budget,
    include,
    scans_from: product.discovery.scans.length,
    segments_from: product.discovery.segments.length,
    status: "open",
    explore: null,
    date,
  };
  return { product: { ...product, research: [...research, entry] }, study: entry };
}

/** A scan, saved once read. Ids run scan1, scan2, ... */
export function addScan(product: Product, scan: NewScan, date = today()): { product: Product; scan: Scan } {
  const entry: Scan = { id: `scan${product.discovery.scans.length + 1}`, ...scan, date };
  return {
    product: { ...product, discovery: { ...product.discovery, scans: [...product.discovery.scans, entry] } },
    scan: entry,
  };
}

/** A result the owner measured, with how it compared with what nxk said (scripts/outcome.ts). Ids run o1, o2, ... */
export function addOutcome(
  product: Product,
  outcome: NewOutcome,
  date = today(),
): { product: Product; outcome: Outcome } {
  const entry: Outcome = { id: `o${product.outcomes.length + 1}`, source: "measured", ...outcome, date };
  return { product: { ...product, outcomes: [...product.outcomes, entry] }, outcome: entry };
}

const tally = (comparisons: Comparison[]) => {
  const n = (v: Verdict) => comparisons.filter((c) => c.verdict === v).length;
  return `${n("agrees")} agreed, ${n("disagrees")} disagreed, ${n("too few to tell")} too few to tell${n("nothing to compare") ? `, ${n("nothing to compare")} nothing to compare` : ""}`;
};

export const today = (): string => new Date().toISOString().slice(0, 10);

// What the owner measured is a measured figure; what they said or guessed is theirs, traced from nxk.json.
const ofSource = (entry: { source: Source }) => (entry.source === "measured" ? "measured" : null);
/** What is known, as lines to print: text, or labelled lines (scripts/log.ts said). */
export function describe(product: Product, file: string): (string | Line | null)[] {
  const out: (string | Line | null)[] = [`${file}`];
  const p = product.product;
  out.push(
    p
      ? `Product: ${p.name ?? "(no name)"}, stage ${p.stage ?? "?"}${p.description ? `: ${p.description}` : ""}`
      : "Product: not recorded",
  );
  // The country is said at the start, so that the first count is not refused for leaving it out.
  out.push(
    product.country
      ? `Country: ${product.country.toUpperCase()}`
      : "Country: not recorded, and never assumed: give country (uk or us) on the first call that counts people (terms, people, sweep, research_start); later calls in this folder can leave it out",
  );
  out.push(
    product.where
      ? `Where the owner sells: ${product.where.text} (${product.where.among}, ${product.where.date}); discovery counts every lead there as well as nationwide`
      : "Where the owner sells: not recorded, so sizes are nationwide",
  );
  if (product.audience)
    out.push(
      `Audience: ${product.audience.among} (${product.audience.source}${product.audience.why ? `: ${product.audience.why}` : ""}, ${product.audience.date})`,
    );
  else out.push("Audience: not recorded");
  if (product.customers.length) {
    out.push("The owner's customers:");
    for (const c of product.customers)
      out.push(
        labelled(
          ofSource(c),
          `  ${c.fact}: ${c.share === null ? "not known" : `${c.share} in every 100`} (${c.source}${c.source === "guess" ? ", not used" : ""}${c.note ? `, ${c.note}` : ""}, ${c.date})`,
        ),
      );
  } else out.push("The owner's customers: nothing recorded");
  if (product.facts.length) {
    out.push("What the owner said:");
    for (const f of product.facts)
      out.push(
        labelled(
          ofSource(f),
          `  ${f.topic}: ${f.answer === null ? "does not know" : f.answer} (${f.source}, ${f.date})`,
        ),
      );
  }
  for (const m of product.money)
    out.push(labelled(ofSource(m), `Money: ${m.name} = ${m.value} (${m.source}, ${m.date})`));
  const open = product.questions.filter((q) => q.status === "open");
  if (open.length) out.push(`Open questions for the owner: ${open.map((q) => `[${q.id}] ${q.question}`).join(" ")}`);
  if (product.discovery.segments.length) {
    out.push("Segments:");
    for (const s of product.discovery.segments) {
      const size = s.share !== undefined ? `${(100 * s.share).toFixed(1)} in 100 adults` : null;
      out.push(
        labelled(
          null,
          `  [${s.id}] ${s.label} (${s.status}): ${s.among}; ${size ? `${size} (counted)` : "size not counted"}; rivals ${s.rivals.length}${s.rivals_none ? " (none found)" : ""}`,
          size ? { counted: [size] } : null,
        ),
      );
    }
  }
  if (product.suggestions.length) {
    out.push("Suggestions made:");
    for (const d of product.suggestions) {
      const among = d.customersValue !== undefined ? `, ${d.customersValue} among the owner's customers` : "";
      const counted = d.value === undefined ? "" : ` (${d.count} ${d.value}${among}, against ${d.threshold})`;
      out.push(`  [${d.folder}] ${d.suggestion}: ${outcomeOf(d)}${counted}. Watch: ${d.watch ?? "-"}`);
    }
  }
  if (product.outcomes.length) {
    out.push("Measured (the owner's results against what nxk said):");
    for (const o of product.outcomes) out.push(`  [${o.id}] ${o.what} (${o.date}): ${tally(o.comparisons)}`);
    const record = trackRecord(product.outcomes);
    if (record.lines.length)
      out.push(
        `Track record, by what nxk said: ${record.lines.join("; ")}. A handful of comparisons describes this product; it is not a rate.`,
      );
  }
  return out;
}
