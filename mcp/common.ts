// What every nxk tool shares: where the project and its knowledge base are, the generated people (read once, with the
// engine's scripts: scripts/population.ts loadPeople), the engine's scripts (run in the server's own process, printing
// into the answer and recording into the folder's log, which note_check reads; a paid scan apart from it, so that a
// cancelled call or a closed session does not stop it), and the small helpers the tools' replies use.
import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Exit, type Out, type Run } from "../scripts/cli.ts";
import { fileSink, keepOutOfGit, logFile, type LogRecord } from "../scripts/log.ts";
import { ADULTS as OFFICIAL, loadPeople, type Country, type LoadedPeople } from "../scripts/population.ts";
import {
  FILE,
  findProduct,
  productHome,
  readProduct,
  runningScan,
  writeProduct,
  type Intent,
  type Product,
  type RunningScan,
  type Scan,
  type ScanRun,
  type Segment,
  strengthOf,
} from "../scripts/product.ts";
import { pacedIn, readLog } from "../scripts/records.ts";

export { runningScan };
import { CATEGORIES } from "../scripts/businesses.ts";
import { roomOf, workersOf, type Room } from "../scripts/corners.ts";
import { ideasOf } from "../scripts/discover.ts";
import { conditionsOf, type Condition } from "../scripts/groups.ts";
import type { Schema, Tool, ToolContext, ToolOutput } from "./protocol.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPTS = join(ROOT, "scripts");
// The official adult populations, to turn a share into people (population.ts says where each comes from).
export const ADULTS: Record<Country, number> = { uk: OFFICIAL.uk.n, us: OFFICIAL.us.n };
// Characters of a script's output passed back; the rest is cut with a note. Claude Code saves a longer text result to
// a file instead of showing it (over 50,000 characters), so this stays under that.
const LIMIT = 45000;

// ---------------------------------------------------------------------------------------------------------------
// The tools

/** What every tool's arguments may hold, read around each tool (tools.ts): the folder it works in, and the country. */
export interface ToolArgs {
  /** Relative to the project, or absolute. */
  folder?: string;
  country?: Country;
}

/**
 * What one of nxk's tools returns: its text, whether it is an error, and what it meant as it printed (scripts/log.ts
 * records), which stay in the server, for the log and the next move (tools.ts).
 */
export interface ToolResult extends ToolOutput {
  records?: LogRecord[];
}

/** One of nxk's tools, as the server lists and runs it. */
export interface NxkTool extends Tool {
  /** Writes what it prints to the folder's log as a run of its own (tools.ts logged). */
  logs?: boolean;
  /** Counts or scans people, so refuses to run without a country (tools.ts placed). */
  needsCountry?: boolean;
  /**
   * A method, so that each tool takes its own arguments: an interface of what its inputSchema promises, which coerce
   * has typed. The server checks nothing more; a tool refuses what it cannot use.
   */
  run(args: ToolArgs, context: ToolContext): Promise<ToolResult>;
}

/** What one of the engine's scripts printed and meant, as runScript and background return it once it has ended. */
export interface ScriptResult extends ToolResult {
  /** Whether it ended with an exit code other than 0. */
  error: boolean;
  records: LogRecord[];
  running?: false;
}

/** A script background left running at the end of the wait: what it has printed and meant so far. */
export interface StillRunning extends ToolResult {
  running: true;
  records: LogRecord[];
}

/** The knowledge base for a folder: its nxk.json (found, or where a new one goes), the product in it, and a writer. */
export interface KnowledgeBase {
  file: string;
  product: Product;
  save: (product: Product) => void;
}

/** The people as a room for reading scans (corners.ts roomOf): whom it holds, and the share of all adults they are. */
export interface ScanRoom extends Room {
  whom: string;
  scale: number;
}

/** A group's keenness on one offer, as a corner holds it (simulated): what keenness prints. */
export interface Keenness {
  idea: string;
  /** How many times more the group prefers the offer than their average offer. */
  odds: number;
  /** How keen the group is, against how keen everyone in `room_of` is. */
  keen: number;
  room: number;
  room_of?: string;
}

// ---------------------------------------------------------------------------------------------------------------
// Where things are

/** The project the session works in: CLAUDE_PROJECT_DIR when Claude Code started the server, else the server's folder. */
export const projectDir = (env: NodeJS.ProcessEnv = process.env): string =>
  resolve(env.CLAUDE_PROJECT_DIR || process.cwd());

/** The folder a tool works in: `folder` relative to the project (or absolute), created if missing. */
export function folderOf(args: ToolArgs, env: NodeJS.ProcessEnv = process.env): string {
  const project = projectDir(env);
  const folder = args.folder ? resolve(project, String(args.folder)) : project;
  // A folder inside the project may be new (one for a piece of work). One outside it that does not exist is a slip in
  // the path (a "/" copied as "-"), and making it would put the work where the owner never looks.
  const inside = relative(project, folder);
  if (!existsSync(folder) && (inside.startsWith("..") || isAbsolute(inside)))
    throw new Error(`No folder ${folder}. Give the project folder, ${project}, or a folder inside it.`);
  mkdirSync(folder, { recursive: true });
  return folder;
}

/** The knowledge base for a folder. */
export function kb(folder: string): KnowledgeBase {
  const file = findProduct(folder) ?? join(productHome(folder), FILE);
  const product = readProduct(file);
  return { file, product, save: (next) => writeProduct(file, next) };
}

/**
 * A scan saved in nxk.json, by its id or by the label it was started with (a later scan under the same label wins).
 * Throws when there is none: `unsaved(ref)`, when given, may say why (a scan not read yet), else the saved scans are
 * listed.
 */
export function findScan(product: Product, ref: string, unsaved: ((ref: string) => string | null) | null = null): Scan {
  const scans = product.discovery.scans;
  const scan = scans.find((s) => s.id === ref) ?? scans.findLast((s) => s.label === ref);
  if (scan) return scan;
  throw new Error(
    unsaved?.(ref) ?? `No scan "${ref}": ${scans.map((s) => `${s.id} (${s.label})`).join(", ") || "none yet"}`,
  );
}

/** A segment kept in nxk.json, by its id; throws listing the segments when there is none. */
export function findSegment(product: Product, id: string): Segment {
  const segments = product.discovery.segments;
  const segment = segments.find((s) => s.id === id);
  if (!segment) throw new Error(`No segment "${id}": ${segments.map((s) => s.id).join(", ") || "none yet"}`);
  return segment;
}

/** The generated people of a country, as the scripts read them: once, and again only when the files change. */
export const peopleOf = (country: Country): LoadedPeople => loadPeople(country);

const rooms = new WeakMap<LoadedPeople, Map<boolean, ScanRoom>>();
/**
 * The people as a room for reading scans (corners.ts), built once for the people as read: it takes a few seconds. With
 * `work`, only the people in work, as discover.ts reads a scan whose every offer was asked at work; `whom` names the
 * room and `scale` turns a share of it into a share of all adults.
 */
export function roomFor(country: Country, work = false): ScanRoom {
  const loaded = peopleOf(country);
  let built = rooms.get(loaded);
  if (!built) rooms.set(loaded, (built = new Map()));
  let room = built.get(work);
  if (!room) {
    const { map, people: rows } = loaded,
      mask = work ? workersOf(map.fields, rows) : null;
    const pool = mask ? rows.filter((_, i) => mask[i]) : rows;
    room = {
      ...roomOf(map.fields, pool),
      whom: mask ? "people in work" : "all adults",
      scale: pool.length / rows.length,
    };
    built.set(work, room);
  }
  return room;
}
/** Whether every offer in a saved scan was asked at work, so that it is read among the people in work. */
export const workScan = (scan: Scan): boolean =>
  Boolean(scan?.ideas?.length) &&
  scan.ideas.every((i) => i.buying_category !== undefined && CATEGORIES.includes(i.buying_category));

/** Conditions checked against the country's map; throws with the tools' own message when one is wrong. */
export function checked(country: Country, text: string): Condition[] {
  const { map } = peopleOf(country);
  return conditionsOf(
    map.fields,
    String(text)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/** The share of adults meeting every condition, counted on the generated people. */
export function shareOf(country: Country, text: string): number {
  const conditions = checked(country, text);
  const { people: rows } = peopleOf(country);
  return rows.reduce((n, row) => n + (conditions.every((c) => c.test(row)) ? 1 : 0), 0) / rows.length;
}

/**
 * Run one of the engine's scripts (its run: scripts/cli.ts) in a folder, in this process, as it runs from a shell
 * there; returns { text, error, records }: what it printed, with an error's message after it, whether it ended with an
 * exit code other than 0, and what it meant as it printed (scripts/log.ts), whether or not the folder logs. Its records
 * also go to the folder's log. `script` is a file name in scripts/ or a path.
 */
export async function runScript(
  script: string,
  argv: (string | number)[],
  folder: string,
  { env = process.env }: { env?: NodeJS.ProcessEnv } = {},
): Promise<ScriptResult> {
  const { run }: { run: Run } = await import(pathToFileURL(resolve(SCRIPTS, script)).href);
  // The folder as the script's own process found it (a symbolic link such as /tmp followed), so that paths print the same.
  const at = realpathSync(folder),
    printed: string[] = [],
    said: LogRecord[] = [];
  const out: Out = {
    print: (text) => {
      printed.push(`${text}\n`);
    },
    sinks: [
      fileSink(logFile(env, at)),
      (record: LogRecord) => {
        said.push(JSON.parse(JSON.stringify(record)));
      },
    ].filter((sink) => sink !== null),
  };
  let code = 0,
    message = "";
  try {
    await run(argv.map(String), out, { folder: at, env });
  } catch (error) {
    code = error instanceof Exit ? error.code : 1;
    message = error instanceof Error && error.message ? `${error.message}\n` : "";
  }
  const stdout = printed.join("");
  const text = `${stdout}${message ? `${stdout ? "\n" : ""}${message}` : ""}`.trim();
  return { text: cut(text) || "(no output)", error: code !== 0, records: inRuns(said) };
}

/** Records as a log's runs hold them (scripts/records.ts parseLog): each run's in order, the runs' own left out. */
function inRuns(records: LogRecord[]): LogRecord[] {
  const runs = new Map<string | undefined, LogRecord[]>();
  for (const record of records) {
    if (record.type === "run") runs.set(record.run, []);
    else runs.get(record.run)?.push(record);
  }
  return [...runs.values()].flat();
}

/** Every record in a file of runs, in order, without the runs' own; [] when it is missing or cannot be read. */
const recordsIn = (file: string): LogRecord[] => {
  try {
    return readLog(file).flatMap((run) => run.records);
  } catch {
    return [];
  }
};

const cut = (text: string) =>
  text.length > LIMIT ? `${text.slice(0, LIMIT)}\n[... cut at ${LIMIT} characters: ask for less at once]` : text;

// How long one call waits on a scan. Every "has it finished?" call a model makes instead is a turn that re-reads the
// whole session; Claude Code drops a stdio tool call that is silent for 30 minutes.
export const MOST_WAIT = 10 * 60000;
/** When a scan paced to `minutes` should be done: half as long again, and a minute, for slow answers. */
const doneBy = (started: number, minutes: number) => started + (1.5 * minutes + 1) * 60000;

/**
 * Runs a script that can take long (a paid scan, paced to the decision model's rate) apart from the server, so that
 * nothing kills it half-way: recorded in `<base>.json` with `about` (see runningScan), it keeps going if the call is
 * cancelled or the session ends. What it prints goes to `<base>.log` and what it meant to `<base>.jsonl`. The call
 * waits for it as long as the pace it records says (up to `most` ms) and then returns its output as runScript does.
 * One paced to take longer, or still going at the end of the wait, is left running: { running: true, text, records }
 * with what it has printed and meant so far.
 */
export async function background(
  script: string,
  argv: (string | number)[],
  folder: string,
  base: string,
  { most = MOST_WAIT, about = {} }: { most?: number; about?: Partial<ScanRun> } = {},
): Promise<ScriptResult | StillRunning> {
  const log = `${base}.log`,
    fd = openSync(log, "w"),
    records = `${base}.jsonl`;
  writeFileSync(records, "");
  const child = spawn(process.execPath, [resolve(SCRIPTS, script), ...argv.map(String)], {
    cwd: folder,
    detached: true,
    stdio: ["ignore", fd, fd],
    env: { ...process.env, NXK_RECORDS: records },
  });
  closeSync(fd);
  const started = Date.now();
  writeFileSync(
    `${base}.json`,
    `${JSON.stringify({ pid: child.pid, started: new Date(started).toISOString(), ...about })}\n`,
  );
  const code = await new Promise<number | null>((done) => {
    const tick = setInterval(() => {
      const minutes = pacedIn(recordsIn(records));
      // Paced to run past the wait: left at once, so the owner hears how long it will be.
      if (minutes !== null && doneBy(started, minutes) > started + most) {
        clearInterval(tick);
        done(null);
      } else if (Date.now() >= Math.min(started + most, minutes === null ? Infinity : doneBy(started, minutes))) {
        clearInterval(tick);
        done(null);
      }
    }, 250);
    child.on("exit", (status) => {
      clearInterval(tick);
      done(status ?? 1);
    });
  });
  const printed = cut(readFileSync(log, "utf8").trim()),
    said = recordsIn(records);
  if (code === null) {
    child.unref();
    return { running: true, text: printed, records: said };
  }
  rmSync(`${base}.json`, { force: true });
  return { text: printed || "(no output)", error: code !== 0, records: said };
}

/**
 * Waits, up to `most` ms, for the scan running in `dir` to finish, and returns runningScan(dir) as it then stands. A
 * scan paced to run well past the wait is not waited for: the caller says how long it has left.
 */
export async function waitForScan(
  dir: string,
  { most = MOST_WAIT, every = 5000 }: { most?: number; every?: number } = {},
): Promise<RunningScan | null> {
  const start = Date.now();
  let run = runningScan(dir);
  while (run?.alive) {
    if ((run.minutes && doneBy(Date.parse(run.started), run.minutes) > start + most) || Date.now() - start >= most)
      break;
    await new Promise((resume) => setTimeout(resume, every));
    run = runningScan(dir);
  }
  return run;
}

/** Minutes a running scan has left by its pace, or null when it printed none. */
export const minutesLeft = (run: RunningScan | null): number | null =>
  run?.minutes ? Math.max(1, Math.round((Date.parse(run.started) + run.minutes * 60000 - Date.now()) / 60000)) : null;

/** A share as "N.N" in every 100, rounded half up. */
export const one = (x: number): string => (Math.round(1000 * x) / 10).toFixed(1);
/** An idea's key as discover.ts writes it in its corners: "free-ads" is free_ads. */
export const keyOf = (key: string): string => ideasOf([{ key, offer: "-" }])[0].key;
// discover.ts's bars for a corner (scripts/product.ts): x2 or more is strong, x1.5 a lead to test, x1.15 faint, below
// that the idea has no corner of its own.
export { strengthOf };
/**
 * Whether a kept segment's intent holds its corner's keenness: not a group none serves, nor a group kept when its
 * scan's saved answers could not be read.
 */
export const keenIn = (intent: Intent | null): intent is Intent & Keenness => intent?.odds !== undefined;
export const keenness = (i: Keenness): string => {
  const strength = {
    strong: "strong",
    lead: "a lead to test",
    faint: "faint: not a lead",
    none: "no corner of its own",
  }[strengthOf(i.odds)];
  return [
    `they prefer ${i.idea} x${i.odds.toFixed(2)} over their average idea (${strength});`,
    `${(100 * i.keen).toFixed(0)}% keen there against`,
    `${(100 * i.room).toFixed(0)}% of ${i.room_of ?? "all adults"} (simulated)`,
  ].join(" ");
};
export const people_ = (share: number, country: Country): string => {
  const n = share * ADULTS[country];
  return n >= 1e6 ? `${(n / 1e6).toFixed(1)}m` : `${Math.round(n / 1e3)}k`;
};

// ---------------------------------------------------------------------------------------------------------------
// What tools' inputs share

export const FOLDER: Schema = {
  type: "string",
  description:
    "The folder to work in, relative to the project (default: the project root). The tools run there and log to its .nxk/ folder.",
};
export const COUNTRY: Schema = {
  type: "string",
  enum: ["uk", "us"],
  description:
    "Country (default: the one in nxk.json, or given by an earlier call in this folder; asked for when none says)",
};
export const NO_COUNTRY =
  "Which country are these people in? Give country: uk or us. Once a call in this folder has given it, later calls can leave it out.";
// Never a default: a guessed country counts the wrong population, and explore_next would save the count to nxk.json.
export const countryOf = (args: ToolArgs, product: Product): Country => {
  const country = args.country || product.country;
  if (!country) throw new Error(NO_COUNTRY);
  return country;
};
export const CODES =
  "Field and value codes: the people tool, with action find and a word (mortgage) or several at once (mortgage,landlord,student), or action values and a field (home_tenure).";
/** What a paid scan asked to send without a spending limit says: it sends nothing. */
export const NO_LIMIT =
  "Give max_usd: the most this scan may spend, in US dollars. The cost is printed before anything is sent.";

/** A script's arguments with --country from the tool's country, else nxk.json's (else it asks which). */
export function withCountry(argv: string[], folder: string, country: Country | undefined): string[] {
  return [...argv, `--country=${country || countryOf({}, kb(folder).product)}`];
}

/**
 * Where a tool keeps a working file (the owner's request, a reply to check, suggestions): in the project's .nxk folder,
 * beside the log, never loose at the top of the owner's project.
 */
export const work = (name: string): string => join(".nxk", name);

/** Write text to a file in the folder (a request, a reply, a suggestions file) and return its name there. */
export function saveIn(folder: string, name: string, content: string): string {
  mkdirSync(dirname(join(folder, name)), { recursive: true });
  keepOutOfGit(dirname(join(folder, name)));
  writeFileSync(join(folder, name), content.endsWith("\n") ? content : `${content}\n`);
  return name;
}
