#!/usr/bin/env node
// Who is each idea for? EXPERIMENTAL. Several ideas are put to the whole generated population at once. For each
// idea the scan asks where a person stands a year after it went on offer, one fact about the person at a time; every
// generated person then gets a score for every idea. From that it prints whether the ideas are wanted by the same
// people, the corner of the population that prefers each idea most to the others (with its counted size), and the
// big corners nothing on the list is for.
//
//   node scripts/discover.ts <dir> <ideas.json> --country=uk [--max-usd=0.20]
//   node scripts/discover.ts <dir> <ideas.json> --country=uk --read
//
//   ideas.json  [{ "key": "renewal_radar",
//                  "offer": "a service called Renewal Radar. You forward your renewal letters and it tracks every end
//                            date. It costs £4.99 a month and you can cancel at any time.",
//                  "fields": ["home_tenure", "vehicles_in_household", "compares_prices_before_buying", ...] }, ...]
//               offer   the idea as a person would meet it, with its real price
//               fields  optional: facts specific to this idea, ten to twenty, to ask about those and ten general
//                       ones only, for about a fifth of the cost. With no fields named, every field is asked about.
//               buying_category  for an offer sold to organisations, what they buy it as (software_and_saas,
//                       facilities_and_office, ...: businesses.ts CATEGORIES): it is asked at work, and read by each
//                       person's part in buying that. "household" asks it where people live. An offer written as
//                       sold to businesses must say which, or nothing is sent.
//               Three ideas at least; eight or more is better, because a corner is read against the other ideas.
//               Every idea is asked about every field named for any idea, and about ten general ones: a group can
//               only be called unserved if each idea was asked about it.
//   --fields    more facts to ask about, when ideas name theirs; --all asks about every field whatever is named
//   --read      print again from the saved answers; no request
//   --floor     the smallest group counted as "nothing is for them", as a share of adults (default 0.05)
//   --json      also write the result to this file
//
// Answers are saved under <dir>/<ideas file name>.spec/, so adding ideas to the file and running again sends only
// what is missing. Every field: about 18 cents for ten ideas and 36 for twenty; named fields: about 7 and 17. The
// cost is printed before anything is sent.
// Needs the decision-model key that scan.ts uses. Reading takes about a minute for 20 ideas.
import { decisionSetup, modelOf } from "./decision-model.ts";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { CATEGORIES, PEOPLE_NOT_BUSINESSES, ROLE_NOTE, sellsToBusinesses } from "./businesses.ts";
import { argsOf, cli, Exit, readIn, usageExit, type Args, type Out, type RunContext } from "./cli.ts";
import {
  alike,
  leanBy,
  ownCorners,
  reached,
  roomOf,
  scoresOf,
  whiteSpace,
  workersOf,
  type Corner,
  type EmptyCorner,
  type KeenCorner,
  type Likeness,
  type OwnCorner,
  type OwnCorners,
  type Room,
  type ScoredIdea,
} from "./corners.ts";
import { percent, plural } from "./format.ts";
import { marked, profile } from "./groups.ts";
import { openLog, type Log } from "./log.ts";
import { ADULTS as OFFICIAL, loadPeople, type Country, type Field, type PeopleMap, type Row } from "./population.ts";
import type { KeenBy, ScanIdea } from "./product.ts";
import { fieldsToScan, membersOf, missingAnswers, probesOf } from "./scan-answers.ts";
import { run as scan, type SavedAnswer, type ScanSpec, type SpecQuestion } from "./scan.ts";

// Asked this way, and not "you see an advert, would you sign up": against published figures for 32 existing products
// the advert question leaned towards the young, and this one put groups the right way round more often.
const LEAD = "This has been on offer where you live for the past year:";
// An offer sold to organisations is asked at work, from the person's own seat: asked as a thing on offer where people
// live, its corner would be named by facts about their homes. Not checked against published figures, as the household
// question was.
const WORK_LEAD =
  "This has been on offer to organisations like the one you work for, and to people's own businesses, for the past year:";
const WORK_TAIL =
  "Answer for where you work: if it is used there, you have it or use it. If you are not in work, you have never had or used it.";
const QUESTION: SpecQuestion = {
  type: "choice",
  text: "Which of these is true of you today?",
  options: ["I have it or use it", "I tried it and gave it up", "I have never had or used it"],
};
const ADULTS: Record<Country, number> = { uk: OFFICIAL.uk.n, us: OFFICIAL.us.n }; // the official adult populations, to turn a share into people
// What to do when a scan stopped for a reason no rescan gets past (scan.ts exits 3 or 4).
const STOPPED: Record<number, string> = {
  3: [
    "No answers can be had for now: the decision-model account has no credit left.",
    "Tell the owner a scan needs the account topped up, and do not scan again until they say it is.",
    "Counts on the generated people still work (labelled counted); say nothing about how keen anyone is.",
  ].join(" "),
  4: [
    "The decision model's daily quota is used up (Google's resets at midnight Pacific time).",
    "The answers so far are saved: tell the owner, and scan the same offers again once it has reset; only the rest is sent.",
  ].join(" "),
};
// What else is asked about an offer sold to organisations, besides the person's part in buying its category.
const AT_WORK = [
  "organisation_size",
  "organisation_purchasing_process",
  "employer_sector",
  "job_level",
  "management_responsibility",
];

/** An idea as an ideas file gives it, each part checked as ideasOf reads it; `text` is an older name for the offer. */
export interface GivenIdea {
  key?: unknown;
  offer?: unknown;
  text?: unknown;
  fields?: unknown;
  buying_category?: unknown;
  own?: unknown;
}

/** An idea as ideasOf reads it: its key safe for file names, and the fields named for it ([] for none). */
export interface Idea extends ScanIdea {
  fields: string[];
}

/** An idea asked at work: it names what organisations buy it as. */
export type WorkIdea = ScanIdea & { buying_category: string };

/**
 * The ideas file, a list of ideas or { key: offer }, with keys made safe for file names. `buying_category` is one of
 * the organisation purchases people's buying roles are recorded for (CATEGORIES), for an offer sold to organisations,
 * or "household". Throws on a missing offer, a repeat or an unknown category.
 */
export function ideasOf(json: GivenIdea[] | Record<string, unknown>): Idea[] {
  const list: GivenIdea[] = Array.isArray(json) ? json : Object.entries(json).map(([key, offer]) => ({ key, offer }));
  const seen = new Set<string>();
  return list.map((idea): Idea => {
    const key = String(idea.key ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40);
    const offer = String(idea.offer ?? idea.text ?? "").trim();
    if (!key || !offer)
      throw new Error(`Every idea needs a "key" and an "offer": ${JSON.stringify(idea).slice(0, 80)}`);
    if (seen.has(key)) throw new Error(`Two ideas share the key "${key}"`);
    seen.add(key);
    const category = idea.buying_category ? String(idea.buying_category).trim().toLowerCase() : null;
    if (category && category !== "household" && !CATEGORIES.includes(category))
      throw new Error(`${key}: buying_category is "household" or one of ${CATEGORIES.join(", ")}, not "${category}"`);
    return {
      key,
      offer,
      fields: Array.isArray(idea.fields) ? idea.fields.map(String) : [],
      ...(category ? { buying_category: category } : {}),
      // The owner's own offer, as they wrote it: research reports who wants it first (printYours).
      ...(idea.own === true ? { own: true } : {}),
    };
  });
}

/** Whether an idea is sold to organisations, and so asked at work. */
export const atWork = (idea: ScanIdea): idea is WorkIdea =>
  idea.buying_category !== undefined && CATEGORIES.includes(idea.buying_category);

/** The words an idea is asked under: the same offer asked at home and at work are different questions. */
export const wordsOf = (idea: ScanIdea): string =>
  atWork(idea) ? `${idea.offer} [asked at work: ${idea.buying_category}]` : idea.offer;

/**
 * Ideas with no buying_category. Whether an offer is asked at home or at work is said for each, from whom it is sold
 * to, not guessed from its words: a landlord can be one person with a flat to let, or a firm.
 */
export const undeclared = (ideas: ScanIdea[]): ScanIdea[] => ideas.filter((idea) => !idea.buying_category);
/** Ideas said to be bought at home whose offer reads as sold to businesses (businesses.ts sellsToBusinesses): a hint, often wrong. */
export const homeButBusiness = (ideas: ScanIdea[]): ScanIdea[] =>
  ideas.filter((idea) => idea.buying_category === "household" && sellsToBusinesses(idea.offer));
/** Why nothing was sent when ideas have no buying_category. */
export const undeclaredNote = (ideas: ScanIdea[]): string => {
  const have = ideas.length > 1 ? "have" : "has";
  return [
    `Nothing was sent. ${ideas.map((idea) => idea.key).join(", ")} ${have} no buying_category.`,
    'Give every idea one: "household" to ask it where people live',
    "(a person buying for themselves or their home, such as a landlord with one flat to let),",
    `or what organisations buy it as (${CATEGORIES.join(", ")}) to ask it at work,`,
    "from each person's part in buying that for their organisation.",
  ].join(" ");
};

/** The scan spec for a list of ideas: one version for each, the same question for all. */
export function specOf(ideas: ScanIdea[], surveyed: string): ScanSpec {
  const words = (idea: ScanIdea) =>
    atWork(idea) ? `${WORK_LEAD} ${idea.offer} ${WORK_TAIL}` : `${LEAD} ${idea.offer}`;
  return {
    surveyed,
    versions: Object.fromEntries(ideas.map((idea) => [idea.key, words(idea)])),
    questions: { act: QUESTION },
    watch: ["act", QUESTION.options[0]],
  };
}

/** A value of a field and the people who hold it, by their positions. */
interface ValueGroup {
  code: string;
  label: string;
  members: number[];
}

// A field's groups of people, by value, or null when the map does not hold the field.
function peopleByValue(fields: Field[], people: Row[], name: string, skip: string[] = []): ValueGroup[] | null {
  const f = fields.findIndex((field) => field.name === name);
  if (f < 0) return null;
  const field = fields[f],
    values = probesOf(field);
  return membersOf(field, f, people)
    .map((group, v) => ({
      code: String(values[v].code),
      label: field.values?.[v]?.label ?? String(values[v].code).replace(/_/g, " "),
      members: group.members,
    }))
    .filter((row) => row.members.length && !skip.includes(row.code));
}
// A buying category in words: "software and SaaS", "IT hardware".
export const categoryWords = (category: string): string => {
  const written: Record<string, string> = { saas: "SaaS", it: "IT" };
  return String(category)
    .split("_")
    .map((w) => written[w] ?? w)
    .join(" ");
};
// The parts a person plays in buying, in a word each.
export const PART: Record<string, string> = {
  gives_final_sign_off_on_this: "signs off",
  approves_purchases_within_a_budget: "approves within a budget",
  recommends_or_evaluates_suppliers: "recommends",
  uses_or_requests_this: "uses or asks for it",
  no_involvement_in_buying_this: "no part",
  organisation_does_not_buy_this: "not bought there",
};

/** A value's share of the people at one size of organisation. */
export interface SizeShare {
  code: string;
  label: string;
  share: number;
}

/** The people holding one part in buying at one size: how many, and their seats as shares of them, most first. */
export interface PartSeats {
  code: string;
  n: number;
  seats: { seat: string; share: number }[];
}

/** Who decides at one size of organisation (whoDecides). */
export interface SizeDecides {
  code: string;
  label: string;
  /** The share of adults who work at one (counted). */
  share: number;
  how: SizeShare[];
  parts: SizeShare[];
  /** Null without the fields that say who each person is at work. */
  who: PartSeats[] | null;
}

/**
 * Who decides a purchase of `category`, by the size of the organisation: for each size, how many adults work at one
 * (`share`, counted), how those organisations buy (`how`: the owner alone, quotes, a departmental budget, procurement,
 * tender) and what part the people there play in buying it (`parts`), as shares of the people at that size; and who
 * the people holding each part are (`who`, shares of those holding it). All counted on the generated people; how
 * organisations buy and who signs off are tier C. Null without the fields.
 */
export function whoDecides(fields: Field[], people: Row[], category: string): SizeDecides[] | null {
  const sizes = peopleByValue(fields, people, "organisation_size", ["not_in_employment"]),
    how = peopleByValue(fields, people, "organisation_purchasing_process"),
    parts = peopleByValue(fields, people, `purchasing_role_${category}`);
  if (!sizes || !how || !parts) return null;
  const within = (size: Set<number>, groups: ValueGroup[]): SizeShare[] =>
    groups
      .map((g) => {
        let k = 0;
        for (const i of g.members) if (size.has(i)) k++;
        return { code: g.code, label: g.label, share: k / size.size };
      })
      .filter((g) => g.share > 0);
  const seat = seatsOf(fields, people);
  const who = (size: Set<number>) =>
    seat
      ? parts
          .map((g): PartSeats | null => {
            const counts = SEATS.map(() => 0);
            for (const i of g.members) if (size.has(i)) counts[seat[i]]++;
            const n = counts.reduce((a, b) => a + b, 0);
            return n
              ? {
                  code: g.code,
                  n,
                  seats: counts
                    .map((k, j) => ({ seat: SEATS[j], share: k / n }))
                    .filter((x) => x.share > 0)
                    .sort((a, b) => b.share - a.share),
                }
              : null;
          })
          .filter((x) => x !== null)
      : null;
  return sizes.map((s) => {
    const size = new Set(s.members);
    return {
      code: s.code,
      label: s.label,
      share: s.members.length / people.length,
      how: within(size, how),
      parts: within(size, parts),
      who: who(size),
    };
  });
}

/**
 * Who each person is at work, to name who holds each part in buying: the owner (self-employed), directors and
 * executives, managers, supervisors and team leaders, or staff, the first that fits. How firms buy ("formal
 * procurement is 41%") does not tell the owner whom to reach; the people who sign off and take part do. Null without
 * the fields.
 */
export const SEATS: string[] = [
  "the owner",
  "directors and executives",
  "managers",
  "supervisors and team leaders",
  "staff",
];
function seatsOf(fields: Field[], people: Row[]): Uint8Array | null {
  const type = peopleByValue(fields, people, "employment_type"),
    level = peopleByValue(fields, people, "job_level"),
    manage = peopleByValue(fields, people, "management_responsibility");
  if (!type || !level || !manage) return null;
  const seat = new Uint8Array(people.length).fill(SEATS.length - 1);
  const mark = (groups: ValueGroup[], test: (code: string) => boolean, k: number) => {
    for (const g of groups) if (test(g.code)) for (const i of g.members) if (seat[i] > k) seat[i] = k;
  };
  mark(manage, (code) => code === "supervisor_or_team_leader", 3);
  mark(manage, (code) => code === "manager", 2);
  mark(level, (code) => code === "director_or_executive", 1);
  mark(type, (code) => code.startsWith("self_employed"), 0);
  return seat;
}

/** How keen the people holding one value are, at work: their mean score. */
export interface KeenGroup {
  code: string;
  label: string;
  keen: number;
}

/**
 * How keen people are on an offer sold to organisations, at work (simulated): `work`, the mean of the scores of everyone
 * in work (people not in work answered that they never had it, so all adults is the wrong yardstick); and against it,
 * the mean for each part in buying its category (`parts`) and each size of organisation (`sizes`).
 * `idea` is its buying category and its scores (scoresOf). Null without the fields.
 */
export function keenAtWork(
  fields: Field[],
  people: Row[],
  idea: { buying_category: string; p: ArrayLike<number> },
): { work: number; parts: KeenGroup[]; sizes: KeenGroup[] } | null {
  const sizes = peopleByValue(fields, people, "organisation_size", ["not_in_employment"]),
    parts = peopleByValue(fields, people, `purchasing_role_${idea.buying_category}`);
  if (!sizes || !parts) return null;
  const mean = (list: number[]) => list.reduce((s, i) => s + idea.p[i], 0) / list.length;
  const keen = (groups: ValueGroup[]) => groups.map((g) => ({ code: g.code, label: g.label, keen: mean(g.members) }));
  return { work: mean(sizes.flatMap((s) => s.members)), parts: keen(parts), sizes: keen(sizes) };
}

/** A corner by the facts that name it: "Rents privately + Aged 25 to 34". */
const named = (corner: Pick<Corner, "facts">) => corner.facts.map((fact) => fact.label).join(" + ");

/** The command line's flags (scripts/cli.ts argsOf). */
type Flags = Args["flags"];

/** The scan planned (planScan): the ideas, the spec, and which fields every idea is asked about. */
interface Plan {
  country: Country;
  ideas: Idea[];
  /** The spec's name as scan.ts is given it, in the folder as `dir` is. */
  specFile: string;
  /** The decision model in use: only its answers are read. */
  model: string;
  /** An idea's saved answers, from the model in use. */
  rowsOf: (key: string) => SavedAnswer[];
  /** The fields named for the ideas and asked at work; none when every field is asked about. */
  picked: string[];
  everyField: boolean;
  map: PeopleMap;
  people: Row[];
}

/**
 * The ideas scored (scoreIdeas), with what the printing steps read: `pool` is the people read (those in work, as
 * `workers` marks them, when every idea is asked at work), `scale` their share of all adults and `whom` their name;
 * `everyIdea` the fields every scored idea was asked about; `adults` a share of adults in words, and `sized` a corner's
 * size as one.
 */
interface Reading {
  country: Country;
  ideas: Idea[];
  model: string;
  map: PeopleMap;
  people: Row[];
  workers: Uint8Array | null;
  pool: Row[];
  scale: number;
  whom: string;
  room: Room;
  scored: ScoredIdea[];
  /** The ideas with no saved answers yet, and those not yet asked about every field. */
  missing: string[];
  unfinished: string[];
  everyIdea: Set<string>;
  adults: (share: number) => string;
  sized: (corner: { share: number }) => string;
}

export async function run(argv: string[], out: Out, { folder, env = process.env }: RunContext): Promise<void> {
  const {
    positionals: [dir, ideasFile],
    flags,
  } = argsOf(argv);
  const country = flags.country;
  if (!dir || !ideasFile || (country !== "uk" && country !== "us")) throw usageExit(import.meta.url, out, argv);
  // How keen people are is simulated; how many they are (a corner's size, who decides at work) is counted.
  const log = openLog("discover", argv, { label: "simulated", ...out });
  const plan = planScan(log, { country, dir, ideasFile, flags, folder, env });
  const stopped = "read" in flags ? 0 : await sendScan(plan, { dir, flags, out, folder, env });
  const reading = scoreIdeas(plan, { stopped, flags });
  const likeness = printLikeness(log, reading);
  const by = printYours(log, reading, likeness.own);
  printOwnCorners(log, reading, likeness.own);
  printAtWork(log, reading);
  const space = printWhiteSpace(log, reading, flags);
  if (flags.json) writeJson(resolve(folder, flags.json), reading, { ...likeness, ...space, by });
}

/**
 * The ideas read and checked, and the scan spec written for them: which fields every idea is asked about, and where the
 * answers are kept. Refuses an idea with no buying_category before anything is sent.
 */
function planScan(
  log: Log,
  {
    country,
    dir,
    ideasFile,
    flags,
    folder,
    env,
  }: { country: Country; dir: string; ideasFile: string; flags: Flags; folder: string; env: NodeJS.ProcessEnv },
): Plan {
  const written: GivenIdea[] | Record<string, unknown> = JSON.parse(readIn(folder, ideasFile, "utf8"));
  const ideas = ideasOf(written);
  if (ideas.length < 3) throw new Error("Give three ideas or more: an idea's corner is read against the other ideas");
  mkdirSync(resolve(folder, dir), { recursive: true });
  const name = `${basename(ideasFile).replace(/\.json$/, "")}.spec`;
  // The spec's name as scan.ts is given it (in the folder, as `dir` is), and the files as read here.
  const specFile = join(dir, `${name}.json`),
    specAt = resolve(folder, specFile),
    fileOf = (key: string) => resolve(folder, dir, name, `scan-${key}.jsonl`);
  // Only the answers of the decision model in use (decision-model.ts): another model's are kept but not read.
  const model = decisionSetup(env).model;
  const rowsOf = (key: string) =>
    existsSync(fileOf(key))
      ? readFileSync(fileOf(key), "utf8")
          .split("\n")
          .filter(Boolean)
          .map((line): SavedAnswer => JSON.parse(line))
          .filter((row) => modelOf(row) === model)
      : [];
  // Keep the date of an earlier run, so that ideas added later are asked under the same words.
  const saved: ScanSpec | null = existsSync(specAt) ? JSON.parse(readFileSync(specAt, "utf8")) : null;
  const surveyed =
    saved?.surveyed ?? (flags.surveyed || new Date().toLocaleString("en-GB", { month: "long", year: "numeric" }));
  const extra = (flags.fields ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const unsure = undeclared(ideas);
  if (unsure.length && !("read" in flags)) throw new Error(undeclaredNote(unsure));
  const home = homeButBusiness(ideas);
  if (home.length && !("read" in flags))
    log.line(
      [
        `${home.map((idea) => idea.key).join(", ")} may be sold to businesses (a hint from word patterns, often wrong),`,
        `and ${plural(home.length, "is", "are")} asked where people live, as given (household).`,
        `If an organisation buys ${plural(home.length, "it", "them")}, scan again with its buying_category under a new key.`,
      ].join(" "),
    );
  // An offer sold to organisations is also asked about the person's part in buying its category and about where they work.
  const work = ideas.filter(atWork).flatMap((idea) => [`purchasing_role_${idea.buying_category}`, ...AT_WORK]);
  // Every idea is asked about every field named for any idea. On saved scans, asking each idea only about its own
  // fields named groups as unserved that an idea did serve, through a fact that idea had not been asked about.
  const given = [...new Set([...ideas.flatMap((idea) => idea.fields), ...extra])];
  const picked = given.length ? [...new Set([...given, ...work])] : [];
  // With no facts named for any idea, every idea is asked about every field: the agent does not choose where to look.
  const everyField = "all" in flags || !picked.length;
  const { map, people } = loadPeople(country);
  writeFileSync(specAt, JSON.stringify(specOf(ideas, surveyed), null, 1));
  return { country, ideas, specFile, model, rowsOf, picked, everyField, map, people };
}

/** The scan sent, in this process. Returns 0, or the code of a stop no rescan gets past (scan.ts exits 3 or 4). */
async function sendScan(
  { country, specFile, everyField, picked }: Plan,
  { dir, flags, out, folder, env }: { dir: string; flags: Flags; out: Out; folder: string; env: NodeJS.ProcessEnv },
): Promise<number> {
  // The scan prints and records through the same `out`, in this process: discover.ts that sends runs apart from the
  // MCP server (mcp/common.ts background), so it is not stopped with a cancelled call.
  const args = [
    dir,
    specFile,
    `--country=${country}`,
    "--quiet",
    `--max-usd=${flags["max-usd"] ?? (everyField ? 0.6 : 0.2)}`,
  ];
  if (everyField) args.push("--all");
  else args.push(`--fields=${picked.join(",")}`);
  if (flags.orders !== undefined) args.push(`--orders=${flags.orders}`);
  try {
    await scan(args, out, { folder, env });
  } catch (error) {
    // 3 and 4: the account is out of credit, or its daily quota is used up. What was answered is still read.
    if (!(error instanceof Exit) || (error.code !== 3 && error.code !== 4)) throw error;
    return error.code;
  }
  return 0;
}

/**
 * Every idea scored on the people from its saved answers, among everyone or, when every idea is asked at work, among
 * the people in work. An idea not asked about every field read is left out. Refuses with fewer than three scored, and
 * says why. Returns what the printing steps read, with the figures written as they print.
 */
function scoreIdeas(
  { country, ideas, model, rowsOf, picked, everyField, map, people }: Plan,
  { stopped, flags }: { stopped: number; flags: Flags },
): Reading {
  // When every offer is asked at work, the reading is among the people in work (corners.ts workersOf); sizes are
  // still given as shares of all adults.
  const workers = ideas.length && ideas.every(atWork) ? workersOf(map.fields, people) : null;
  const pool = workers ? people.filter((_, i) => workers[i]) : people,
    scale = pool.length / people.length;
  const whom = workers ? "people in work" : "all adults";
  const room = roomOf(map.fields, pool);
  const askable = new Set(map.fields.filter((field) => probesOf(field).length >= 2).map((field) => field.name));
  // A field that does not split the people read here (among the people in work, everyone is in employment) cannot be
  // scored, and is not counted as missing.
  const splits = new Set(room.fields.filter((_, f) => room.groups[f].length >= 2).map((field) => field.name));
  const wanted = (everyField ? [...askable] : fieldsToScan(map.fields, { picked }).names).filter(
    (field) => askable.has(field) && splits.has(field),
  );
  const scored: ScoredIdea[] = [],
    missing: string[] = [],
    unfinished: string[] = [];
  for (const idea of ideas) {
    const by = new Map<string, number[]>();
    for (const row of rowsOf(idea.key)) {
      if (!by.has(row.id)) by.set(row.id, []);
      by.get(row.id)!.push(row.p);
    }
    if (!by.has("base")) {
      missing.push(idea.key);
      continue;
    }
    const answers = new Map(
      [...by].map(([id, ps]): [string, number] => [id, ps.reduce((a, b) => a + b, 0) / ps.length]),
    );
    const s = scoresOf(room, answers);
    // An idea that was not asked about every field, or lost some of a long field's values to a failed request, would
    // look average wherever it has no answer: leave it out.
    const partly = missingAnswers(
      { [idea.key]: answers },
      [idea.key],
      map.fields.filter((field) => wanted.includes(field.name)).map((field) => ({ field, probes: probesOf(field) })),
    );
    if (wanted.some((field) => !s.scanned.includes(field)) || partly.length) {
      unfinished.push(idea.key);
      continue;
    }
    scored.push({ key: idea.key, ...s });
  }
  // A stop no rescan gets past (no credit, a spent daily quota) is named, not answered with "scan again".
  if (scored.length < 3) {
    const again =
      "read" in flags
        ? [
            "The scan that was to save them stopped first (its own output says why, when there is any).",
            "Scanning again with max_usd sends only what is missing,",
            "unless the decision-model account is out of credit or its daily quota is used up: then tell the owner instead.",
          ].join(" ")
        : "The scan above stopped before they were all asked; scanning the same offers again sends only what is missing.";
    throw new Error(`Only ${scored.length} of the ideas have answers for every field. ${STOPPED[stopped] ?? again}`);
  }
  const everyIdea = new Set(
    map.fields.map((field) => field.name).filter((field) => scored.every((idea) => idea.scanned.includes(field))),
  );
  const count = (share: number) => {
    const n = share * ADULTS[country];
    return n >= 1e6 ? `${(n / 1e6).toFixed(1)}m` : `${Math.round(n / 1e3)}k`;
  };
  const adults = (share: number) => `${percent(share, 1)} of adults, about ${count(share)}`,
    sized = (corner: { share: number }) => adults(corner.share * scale);
  return {
    country,
    ideas,
    model,
    map,
    people,
    workers,
    pool,
    scale,
    whom,
    room,
    scored,
    missing,
    unfinished,
    everyIdea,
    adults,
    sized,
  };
}

/** What was read, and whether the ideas are wanted by the same people, with who is keen and cold on all of them. */
function printLikeness(
  log: Log,
  { country, model, map, people, workers, room, scored, missing, unfinished, everyIdea, sized }: Reading,
): { same: Likeness; own: OwnCorners } {
  const atWorkNote = workers
    ? [
        ` Every idea was asked at work, so what follows is read among the ${room.N} in work`,
        "(people not in work answered that they never had any); sizes are still shares of all adults.",
      ].join(" ")
    : "";
  log.line(
    [
      `\nEXPERIMENTAL. ${scored.length} ideas put to ${people.length} generated ${country.toUpperCase()} adults`,
      `through the decision model ${model},`,
      `each asked about the same ${everyIdea.size} of the map's ${map.fields.length} fields.${atWorkNote}`,
    ].join(" "),
  );
  log.line(
    "The size of a group is counted on the generated people. How keen a group is comes from a model and is simulated: read who and where, never how many would buy.",
  );
  if (missing.length) log.line(`No saved answers yet for: ${missing.join(", ")}.`);
  if (unfinished.length)
    log.line(
      `Left out, because not yet asked about every field (run again to send what is missing): ${unfinished.join(", ")}.`,
    );
  const same = alike(scored),
    own = ownCorners(room, scored);
  log.line(
    `\nAre these ideas for the same people? Average likeness ${same.average.toFixed(2)} (1 = the same people want every idea; near 0 = different people).`,
  );
  if (same.average >= 0.6)
    log.line(
      "  Most of this list is one idea for one kind of person. The ideas a model writes unprompted usually are.",
    );
  log.line(
    `  Most alike: ${same.pairs
      .slice(0, 3)
      .map((pair) => `${pair.a} / ${pair.b} ${pair.r.toFixed(2)}`)
      .join("; ")}`,
  );
  log.line(
    `  Least alike: ${same.pairs
      .slice(-3)
      .reverse()
      .map((pair) => `${pair.a} / ${pair.b} ${pair.r.toFixed(2)}`)
      .join("; ")}`,
  );
  log.line(
    `  Keen on all of them: ${named(own.keen)} (${sized(own.keen)}; x${own.keen.odds.toFixed(2)} the room's odds on the average idea)`,
    "simulated",
    { counted: [sized(own.keen)] },
  );
  log.line(
    `  Cold on all of them: ${named(own.cold)} (${sized(own.cold)}; x${own.cold.odds.toFixed(2)})`,
    "simulated",
    { counted: [sized(own.cold)] },
  );
  return { same, own };
}

/**
 * The owner's own offers (own: true): the people keenest on each against everyone, whatever they think of the other
 * versions, and how keen each age band and gender is. This is who wants the offer; a corner is only who prefers one
 * version to the others, and research that led with corners named groups that wanted none of it.
 * Returns how keen by age and gender, for each own offer by key.
 */
function printYours(
  log: Log,
  { ideas, scored, room, whom, sized }: Reading,
  own: OwnCorners,
): Record<string, KeenBy[]> {
  const by: Record<string, KeenBy[]> = {};
  const yours = ideas
    .filter((idea) => idea.own)
    .flatMap((idea) => {
      const score = scored.find((x) => x.key === idea.key),
        corner = own.ideas.find((x) => x.key === idea.key);
      return score && corner?.keenest ? [{ key: idea.key, score, corner }] : [];
    });
  if (!yours.length) return by;
  log.line(
    [
      `\nYour offer as you wrote it: the people keenest on it (how many times their odds on it are the odds of ${whom}),`,
      "counted, and how keen by age and gender (simulated).",
      "This is who wants it; the corners below are only who prefers one version to the others.",
    ].join(" "),
  );
  for (const { key, score, corner } of yours) {
    const k = corner.keenest;
    log.line(
      `  ${key}: x${k.odds.toFixed(2)} | ${sized(k)} | ${named(k)} | ${percent(k.keen)} there against ${percent(k.room)}`,
      "simulated",
      { counted: [sized(k)] },
    );
    by[key] = leanBy(room, score);
    for (const lean of by[key])
      log.line(
        `    by ${lean.by}: ${lean.groups.map((g) => `${g.label.toLowerCase()} ${percent(g.keen)}`).join(", ")}`,
        "simulated",
      );
  }
  return by;
}

/** Each idea's own corner, strong, faint or none, and for an idea with none, the people keenest on it. */
function printOwnCorners(log: Log, { scored, whom, sized }: Reading, own: OwnCorners) {
  const byOdds = [...own.ideas].sort((a, b) => b.odds - a.odds),
    width = Math.max(...scored.map((idea) => idea.key.length));
  const line = (idea: OwnCorner) =>
    `  x${idea.odds.toFixed(2)}  ${idea.key.padEnd(width)}  ${sized(idea)} | ${named(idea)} | ${percent(idea.keen)} there against ${percent(idea.room)}`;
  log.line(
    `\nEach idea's own corner: the people who prefer it most to the other ideas (how many times more than their average idea), its counted size, and how keen it is there against ${whom} (simulated).`,
  );
  // On saved scans of every field, a corner shown at x2 or more was the full scan's corner 19 times in 22; a weaker one about two times in three.
  log.line("Strong (x2 or more):");
  for (const idea of byOdds.filter((x) => x.odds >= 2)) log.line(line(idea), "simulated", { counted: [sized(idea)] });
  if (!byOdds.some((x) => x.odds >= 2)) log.line("  none");
  log.line("Faint (a lead to check, not a finding):");
  for (const idea of byOdds.filter((x) => x.odds >= 1.15 && x.odds < 2))
    log.line(line(idea), "simulated", { counted: [sized(idea)] });
  const none = byOdds.filter((x) => x.odds < 1.15);
  if (none.length) {
    log.line(`No corner of its own: ${none.map((idea) => idea.key).join(", ")}`);
    log.record("no_corner", { ideas: none.map((idea) => idea.key) });
  }
  // Still who each is for, with how many: the people keenest on it, who are mostly those keen on the whole list.
  if (none.some((idea) => idea.keenest)) {
    log.line(
      "  Who each would still be for: the people keenest on it (its odds there against its odds across everyone), counted, and how keen (simulated). Mostly the people keen on the whole list.",
    );
    for (const idea of none.filter((x) => x.keenest))
      log.line(
        `  x${idea.keenest.odds.toFixed(2)}  ${idea.key.padEnd(width)}  ${sized(idea.keenest)} | ${named(idea.keenest)} | ${percent(idea.keenest.keen)} there against ${percent(idea.keenest.room)}`,
        "simulated",
        { counted: [sized(idea.keenest)] },
      );
  }
}

/** Offers sold to organisations, read by the seats that decide them: who decides at each size of firm, and how keen. */
function printAtWork(log: Log, { ideas, map, people, pool, scored, adults }: Reading) {
  // The ideas asked at work, scored, each with what organisations buy it as.
  const working = scored.flatMap((score) => {
    const idea = ideas.find((x) => x.key === score.key);
    return idea && atWork(idea) ? [{ ...score, category: idea.buying_category }] : [];
  });
  if (!working.length) return;
  const short = (list: SizeShare[], top = 3) =>
    [...list]
      .sort((a, b) => b.share - a.share)
      .slice(0, top)
      .map((g) => `${g.label.replace(/ \(how their organisation buys\)$/, "").toLowerCase()} ${percent(g.share)}`)
      .join(", ");
  log.line(
    `\nAsked at work: ${working.map((idea) => idea.key).join(", ")}. Each person answered for where they work; people not in work answered that they never had it.`,
  );
  log.record("at_work", { ideas: working.map((idea) => idea.key) });
  log.keep(PEOPLE_NOT_BUSINESSES);
  // The parts in buying that someone takes, from signing off to using it.
  const taken = [
    "gives_final_sign_off_on_this",
    "approves_purchases_within_a_budget",
    "recommends_or_evaluates_suppliers",
    "uses_or_requests_this",
  ];
  for (const category of new Set(working.map((idea) => idea.category))) {
    const table = whoDecides(map.fields, people, category);
    if (!table) continue;
    log.line(
      [
        `\nWho decides on ${categoryWords(category)}, by the size of the organisation:`,
        "counted on the generated people in work at each size, with no decision model asked.",
        "How firms buy and who signs off are PersonaGen's modelling (tier C), not a survey:",
        "label these counted and read them as a lead, not as simulated.",
      ].join(" "),
      "counted",
    );
    for (const s of table) {
      const part = (code: string) => s.parts.find((p) => p.code === code)?.share ?? 0;
      log.line(`  ${s.label.padEnd(32)} ${adults(s.share)}`, "counted");
      log.line(`      how their organisation buys (of the people who work at one): ${short(s.how)}`, "counted");
      const shares = taken.map((code) => `${PART[code]} ${percent(part(code))}`).join(", ");
      log.line(`      their part in buying it (of the same people): ${shares}`, "counted");
      // Who they are: the one or two seats most of those holding each part hold, where 50 or more hold it.
      const seats = (code: string) =>
        (s.who?.find((w) => w.code === code && w.n >= 50)?.seats ?? [])
          .filter((x, k) => k === 0 || x.share >= 0.15)
          .slice(0, 2)
          .map((x) => `${x.seat} ${percent(x.share)}`)
          .join(", ");
      const holders = taken.filter((code) => seats(code)).map((code) => `${PART[code]}: ${seats(code)}`);
      if (holders.length) log.line(`      who they are (of those with each part): ${holders.join("; ")}`, "counted");
    }
  }
  log.line(
    "\nHow keen, at work (simulated; the mean of everyone in work, then by their part in buying it and by the size of organisation):",
  );
  for (const idea of working) {
    const keen = keenAtWork(map.fields, pool, { buying_category: idea.category, p: idea.p });
    if (!keen) continue;
    const parts = keen.parts.map((g) => `${PART[g.code] ?? g.label} ${percent(g.keen)}`).join(", ");
    const sizes = keen.sizes.map((g) => `${g.label.toLowerCase()} ${percent(g.keen)}`).join(", ");
    log.line(`  ${idea.key}: ${percent(keen.work)} of people in work | ${parts} | ${sizes}`);
  }
  log.line(
    [
      '\nIn the reply, name the people at each size of firm you put forward, from "who they are" above:',
      "who signs off (the owner, a director), who approves within a budget, and who recommends and uses it",
      "(staff, supervisors); how the firms buy is not enough.",
      "When you rank sizes, the test with real firms puts the same offer, the same way and for the same spend,",
      "to firms of each size (the same pitch to 15 solo owners and to 15 crew owners), with take-up recorded in each:",
      "talking to one size cannot say which to sell to first.",
      ROLE_NOTE,
    ].join(" "),
  );
}

/** A big group nothing on the list is for (whiteSpace), with what else marks it out, as printed. */
interface EmptyGroup extends EmptyCorner {
  also?: string[];
}

/**
 * The big groups nothing on the list is for, each with what else marks it out, then the reach of the whole list and how
 * to use the reading. Returns the groups, with what marks each out kept on it as `also`, and the reach.
 */
function printWhiteSpace(
  log: Log,
  { map, pool, workers, whom, room, scored, everyIdea, sized }: Reading,
  flags: Flags,
): { empty: EmptyGroup[]; reach: number } {
  const empty: EmptyGroup[] = whiteSpace(room, scored, {
    floor: Number(flags.floor ?? 0.05),
    among: everyIdea,
  });
  log.line(
    "\nNothing here is for them: big groups where even the best idea does worse than its own average. Only groups named by a fact that was asked about can appear.",
  );
  for (const corner of empty) {
    const inGroup = new Uint8Array(room.N);
    for (const i of corner.list) inGroup[i] = 1;
    const lines = profile(
      map.fields,
      pool,
      pool.map((_, i) => inGroup[i] === 1),
    );
    const age = lines.find((line) => line.numeric && line.path === "identity.age_years");
    const paths = new Set(corner.facts.map((fact) => fact.path));
    corner.also = marked(
      lines.filter((line) => !paths.has(line.path)),
      { gap: 0.1, top: 6, perField: 1 },
    ).map(
      (line) => `${line.gap > 0 ? "more" : "less"} ${line.label} (${percent(line.group)} against ${percent(line.all)})`,
    );
    log.line(
      `  ${sized(corner)} | ${named(corner)} | best idea ${corner.best} at x${corner.lift.toFixed(2)} of its own average`,
      "simulated",
      { counted: [sized(corner)] },
    );
    log.line(`      ${age ? `middle age ${age.group} against ${age.all}; ` : ""}${corner.also.join("; ")}`);
  }
  if (!empty.length) log.line(`  None of 5% of ${whom} or more.`);
  const reach = reached(room, scored);
  log.line(
    `\nReach: ${percent(reach)} of ${workers ? "people in work" : "adults"} are at least a fifth keener than average on at least one idea.`,
  );
  log.line(
    [
      "\nHow to use this:",
      "- An idea with no corner of its own is competing for the people who like everything. Change it or drop it.",
      "- Write the next ideas for the groups nothing is for, as those people would meet them, add them to the file and run again; only the new ideas are sent.",
      "- Do not rank the ideas by how many would take them, and do not use these scores for price: the order of ideas changed when the question was reworded, and the model barely reacts to price.",
      "- Before spending on a corner, work out how many customers the idea needs (the sums tool) and compare that with the corner's counted size. Then go and talk to people in it.",
    ].join("\n"),
  );
  return { empty, reach };
}

/** A corner as the JSON writes it: without its list of people, and with its share of all adults. */
type WrittenCorner = Omit<Corner, "list"> & { keenest?: WrittenCorner };

/** The reading as JSON: shares of all adults, and each corner without its list of people (a keenest group's too). */
function writeJson(
  file: string,
  { country, model, room, whom, missing, unfinished, scale }: Reading,
  {
    same,
    own,
    empty,
    reach,
    by = {},
  }: { same: Likeness; own: OwnCorners; empty: EmptyGroup[]; reach: number; by?: Record<string, KeenBy[]> },
) {
  const strip = ({ list, keenest, ...rest }: Corner & { keenest?: KeenCorner }): WrittenCorner => ({
    ...rest,
    share: rest.share * scale,
    ...(keenest ? { keenest: strip(keenest) } : {}),
  });
  writeFileSync(
    file,
    JSON.stringify(
      {
        experimental: true,
        country,
        model,
        people: room.N,
        room_of: whom,
        likeness: same.average,
        keen_on_all: strip(own.keen),
        cold_on_all: strip(own.cold),
        ideas: own.ideas.map((idea) => ({ ...strip(idea), ...(by[idea.key] ? { own: true, by: by[idea.key] } : {}) })),
        nothing_for: empty.map(strip),
        reach,
        missing,
        unfinished,
      },
      null,
      1,
    ),
  );
}

cli(import.meta.url, run);
