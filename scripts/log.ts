// What a tool prints, and what it means, as records. Every tool that prints a figure writes a record of each line it
// prints with the kind its figures are, so that `scripts/note.ts` can check that each figure in the reply to the owner
// was printed by a tool under that label and not made up; and it writes what else it meant (a line the reply keeps, a
// clash in the request, the scan's pace, note_check's verdict) as records too, so that the checks, the hooks and the
// server read what the tool meant and never read its text back. The log is `.nxk/log.jsonl` in the folder the agent is
// working in, one JSON record a line (scripts/records.ts reads it); NXK_LOG names another file, and NXK_LOG=off turns
// it off. Nothing is sent anywhere.
//
// Each record carries the id of its run (a scan in the background writes while other tools run):
//   { type: "run", tool, via, args, label? }  a tool started: via is script (the engine's scripts) or server (the MCP
//                                             server's own tools);
//                                             label is the kind its figures are, when it prints figures
//   { type: "line", text, label?, parts? }    a line it printed, with the kind its figures are (counted, computed,
//                                             simulated, measured); parts: { label: [words in the line of another kind] }
//   { type: "keep", text }                    a line the reply keeps as it is, outside any draft
//   { type: "resolution", key, outcome, text } what a step that looked further found, as the reply keeps it: outcome
//                                             changed, confirmed or unclear; the latest of each key is the one kept
//   { type: "clash", a, b }                   a place the request contradicts itself, as the agent listed it for terms
//   { type: "next", text }                    the next move the tool named itself
// and records with no text of their own, written with record(): scripts/records.ts lists the ones read.
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

/** The kinds of figure a tool prints, which a line in the reply can be traced to. */
export type FigureKind = "counted" | "computed" | "simulated" | "measured";

/** The kind a line's figures are; null for a line with no figures. */
export type Label = FigureKind | null;

/** Words in a line whose figures are of another kind than the line's, by that kind: { counted: ["6.6% of adults"] }. */
export type Parts = Partial<Record<FigureKind, string[]>>;

/** Where a run came from: the engine's scripts, or the MCP server's own tools. */
export type Via = "script" | "server";

/** What a step that looked further came to: it changed the choice, confirmed it, or could not tell. */
export type ResolutionOutcome = "changed" | "confirmed" | "unclear";

/** What a step that looked further found: what it checked, what it found, the outcome and why, when it says. */
export interface Resolution {
  checked: string;
  found: string;
  outcome: ResolutionOutcome;
  why?: string | null;
}

/** A resolution as the reply keeps it: its key (the latest of each is kept), its outcome and its line. */
export interface KeptResolution {
  key: string;
  outcome: ResolutionOutcome;
  text: string;
}

/** Two places in the request that contradict each other. */
export interface Clash {
  a: string;
  b: string;
}

/** Something the reply asks a person to pay, as the agent declared it to note_check. */
export interface Pay {
  kind: string;
  says: string;
}

/** What every record has: the id of its run, added as it is written. */
interface RecordBase {
  run?: string;
}

/** A tool started. */
export interface RunRecord extends RecordBase {
  type: "run";
  tool: string;
  via: Via;
  /** What it was given. */
  args: string[];
  /** The kind its figures are, when it prints figures. */
  label?: Label;
}

/** A line it printed, with the kind its figures are, and the words in it of another kind. */
export interface LineRecord extends RecordBase {
  type: "line";
  text: string;
  label?: FigureKind;
  parts?: Parts;
}

/** A line the reply keeps as it is, outside any draft. */
export interface KeepRecord extends RecordBase {
  type: "keep";
  text: string;
}

/** What a step that looked further found, as the reply keeps it. */
export interface ResolutionRecord extends RecordBase, KeptResolution {
  type: "resolution";
}

/** A place the request contradicts itself, as the agent listed it for terms. */
export interface ClashRecord extends RecordBase, Clash {
  type: "clash";
}

/** The next move the tool named itself. */
export interface NextRecord extends RecordBase {
  type: "next";
  text: string;
}

/** terms: a fact the work needs that only the owner can say, as the agent listed it. */
export interface OpenRecord extends RecordBase {
  type: "open";
  topic: string;
}

/** terms: a term the owner fixed, in their words, as the agent listed it. */
export interface OwnerTermRecord extends RecordBase {
  type: "owner_term";
  id: string;
  kind: string;
  quotes: string[];
}

/** suggest: an item worth raising in the note, with its line. */
export interface RaiseRecord extends RecordBase {
  type: "raise";
  suggestion: string;
  line: string;
}

/** suggest: counts were given among people like the owner's customers. */
export interface WeightedRecord extends RecordBase {
  type: "weighted";
}

/** suggest: a count close to the figure in its rule. */
export interface CloseCallRecord extends RecordBase {
  type: "close_call";
}

/** note: note_check's verdict, with what the reply was declared to ask people to pay (null when nothing was). */
export interface VerdictRecord extends RecordBase {
  type: "verdict";
  ready: boolean;
  pays: Pay[] | null;
}

/** scan: how long the scan is paced to take. */
export interface PacedRecord extends RecordBase {
  type: "paced";
  minutes: number;
}

/** scan: what this scan spent, in US dollars, and the spec's total with answers saved earlier (printed when it finished sending). */
export interface SpentRecord extends RecordBase {
  type: "spent";
  usd: number;
  total: number;
}

/** scan: a fact that matters, with its two ends as printed. */
export interface FactRecord extends RecordBase {
  type: "fact";
  field: string;
  low: string;
  high: string;
}

/** discover: the offers with no corner of their own, by key. */
export interface NoCornerRecord extends RecordBase {
  type: "no_corner";
  ideas: string[];
}

/** discover: the offers asked at work, by key. */
export interface AtWorkRecord extends RecordBase {
  type: "at_work";
  ideas: string[];
}

/** people: a fact that marks a group out, with the gap in points as printed. */
export interface MarkedRecord extends RecordBase {
  type: "marked";
  field: string;
  gap: number;
}

/** people: a number of firms, or a share of firms in every 100, as printed (unit firms). */
export interface FirmsRecord extends RecordBase {
  type: "firms";
  value: number;
}

/** server: a scan is left running in the background, so nothing was read (in ideas_scan's answer only, never logged). */
export interface RunningRecord extends RecordBase {
  type: "running";
}

/** A record as the log holds it, by its type. */
export type LogRecord =
  | RunRecord
  | LineRecord
  | KeepRecord
  | ResolutionRecord
  | ClashRecord
  | NextRecord
  | OpenRecord
  | OwnerTermRecord
  | RaiseRecord
  | WeightedRecord
  | CloseCallRecord
  | VerdictRecord
  | PacedRecord
  | SpentRecord
  | FactRecord
  | NoCornerRecord
  | AtWorkRecord
  | MarkedRecord
  | FirmsRecord
  | RunningRecord;

/** The record of one type: RecordOf<"paced"> is PacedRecord. */
export type RecordOf<T extends LogRecord["type"]> = Extract<LogRecord, { type: T }>;

/** A record's own fields, without its type and run: what record() is given. */
export type RecordData<T extends LogRecord["type"]> = Omit<RecordOf<T>, "type" | "run">;

/** Where records go: a file, or a list the caller reads. */
export type Sink = (record: LogRecord) => void;

/** A line for said(), as labelled(), named() and resolved() make it, or a plain line of text. */
export interface Line {
  /** The line, or several. */
  text: string;
  label?: Label;
  /** Words in it of another kind. */
  parts?: Parts | null;
  /** The next move the tool names, written as a record of its own. */
  next?: boolean;
  /** Written as a resolution record too. */
  resolution?: KeptResolution;
}

/** A line resolved() makes: one to keep, written as a resolution too. */
export interface ResolvedLine extends Line {
  resolution: KeptResolution;
}

/** What one of the server's own tools prints: the lines joined, and a record of each. */
export interface Said {
  text: string;
  records: LogRecord[];
}

/** The writer a tool prints through (openLog). Each method prints its text and writes its record to every sink. */
export interface Log {
  /** A line or several, its figures of `as`. */
  line(text?: string, as?: Label, parts?: Parts | null): void;
  /** A line the reply keeps as it is, outside any draft. */
  keep(text: string): void;
  /** A place the request contradicts itself. */
  clash(clash: Clash): void;
  /** The next move the tool names. */
  next(text: string): void;
  /** What a step that looked further found. */
  resolve(key: string, r: Resolution, as?: Label, parts?: Parts | null): void;
  /** A record with no text. */
  record<T extends LogRecord["type"]>(type: T, data?: RecordData<T>): void;
}

/** How openLog writes: where its records go and how its lines print, and what its run says of the tool. */
export interface LogOptions {
  /** The kind of the tool's figures. */
  label?: Label;
  via?: Via;
  sinks: Sink[];
  print: (text: string) => void;
}

/** The log file in use for a folder, or null when logging is off. */
export function logFile(env: NodeJS.ProcessEnv, folder: string): string | null {
  if (env.NXK_LOG === "off") return null;
  return resolve(folder, env.NXK_LOG || ".nxk/log.jsonl");
}

/**
 * A .nxk folder holds what the tools wrote in the owner's project (the log, scans, pages opened, a reply checked): it
 * keeps itself out of git, so none of it turns up in the owner's changes. Any other folder is left as it is.
 */
export function keepOutOfGit(dir: string): void {
  const ignore = join(dir, ".gitignore");
  if (basename(dir) !== ".nxk" || existsSync(ignore)) return;
  try {
    writeFileSync(ignore, "# What nxk's tools wrote in this project: kept out of git.\n*\n");
  } catch {
    // A folder that cannot be written to is no reason to stop the tool.
  }
}

/** A sink that appends each record to a file as a line of JSON, or null for no file. */
export function fileSink(file: string | null | undefined): Sink | null {
  if (!file) return null;
  return (record) => {
    try {
      mkdirSync(dirname(file), { recursive: true });
      keepOutOfGit(dirname(file));
      appendFileSync(file, `${JSON.stringify(record)}\n`);
    } catch {
      /* a folder that cannot be written to must not stop the tool */
    }
  };
}

/**
 * Where the records of a script run from a shell go (scripts/cli.ts): the log in its folder, and the file NXK_RECORDS
 * names when the process that started it collects them (the MCP server's detached scans: mcp/common.ts background).
 */
export const scriptSinks = (env: NodeJS.ProcessEnv, folder: string): Sink[] =>
  [fileSink(logFile(env, folder)), fileSink(env.NXK_RECORDS)].filter((sink) => sink !== null);

/** The line a tool prints to have a line kept in the reply, outside any draft (the words in JSON quotes). */
const keepLine = (text: string) => `Keep in the reply, outside any draft: ${JSON.stringify(text)}`;

/**
 * What a step that looked further came to, in the words the reply says it: it changed the choice, confirmed it, or
 * could not tell. Each resolution's line ends "Result: " and one of these.
 */
export const OUTCOMES: Record<ResolutionOutcome, string> = {
  changed: "changed",
  confirmed: "confirmed",
  unclear: "could not tell",
};
/** A resolution's line: what was checked, what it found, the outcome and why, in one line. */
export const resolutionText = ({ checked, found, outcome, why }: Resolution): string =>
  `Looked further at ${checked}: ${found}. Result: ${OUTCOMES[outcome]}${why ? `; ${why}` : ""}.`;
/** The line terms prints for a place the request contradicts itself. */
const clashLine = ({ a, b }: Clash) => `  Clash: ${JSON.stringify(a)} against ${JSON.stringify(b)}`;

/** Line records for text: one a line, with its label, and each part of another label in the first line that holds it. */
export function lineRecords(text: string, label: Label = null, parts: Parts | null = null): LineRecord[] {
  const left: { as: FigureKind; part: string; done?: boolean }[] = (
    Object.entries(parts ?? {}) as [FigureKind, string[]][]
  ).flatMap(([as, texts]) => texts.map((part) => ({ as, part: String(part) })));
  return String(text)
    .split("\n")
    .map((line) => {
      const own: Parts = {};
      for (const p of left)
        if (!p.done && line.includes(p.part)) {
          (own[p.as] ??= []).push(p.part);
          p.done = true;
        }
      return {
        type: "line",
        text: line,
        ...(label ? { label } : {}),
        ...(Object.keys(own).length ? { parts: own } : {}),
      };
    });
}

/** A line with the kind its figures are, and parts of other kinds, for said(); null when there is no text. */
export const labelled = (label: Label, text: string | null | undefined, parts: Parts | null = null): Line | null =>
  text === null || text === undefined ? null : { text: String(text), label, parts };
/** The next move a tool names, for said(). */
export const named = (text: string): Line => ({ text, next: true });
/**
 * What a step that looked further found, for said(): printed as a line to keep, its figures of `label` (and `parts`),
 * and written as a resolution under `key`.
 */
export const resolved = (key: string, r: Resolution, label: Label = null, parts: Parts | null = null): ResolvedLine => {
  const text = resolutionText(r);
  return { text: keepLine(text), label, parts, resolution: { key, outcome: r.outcome, text } };
};

/**
 * What one of the server's own tools prints, as { text, records }: the lines joined as the tool returns them, and a
 * record of each, labelled where the line is made. Items: text (a line or several, of `label`), null or undefined
 * (left out), labelled(...) or named(...). mcp/tools.ts writes the records to the log as the tool's run.
 * @param label  the kind of the plain lines' figures
 */
export function said(items: (string | Line | null | undefined)[], label: Label = null): Said {
  const kept: Line[] = items
    .filter((item) => item !== null && item !== undefined)
    .map((item) => (typeof item === "string" ? { text: item, label } : item));
  return {
    text: kept.map((item) => item.text).join("\n"),
    records: kept.flatMap((item): LogRecord[] =>
      item.next
        ? [{ type: "next", text: item.text }]
        : [
            ...lineRecords(item.text, item.label, item.parts),
            ...(item.resolution ? [{ type: "resolution" as const, ...item.resolution }] : []),
          ],
    ),
  };
}

/**
 * Opens a tool's log and writes its run. Returns the writer the tool prints through: each method prints its text with
 * `print` and writes its record to every sink (for a script, both are its `out`: scripts/cli.ts).
 *   line(text, label, parts)  a line (or several), its figures of `label`: the tool's own unless given, null for none
 *   keep(text), clash({ a, b }), next(text)  the lines keepLine and clashLine print, and a next move named
 *   resolve(key, r, as, parts) what a step that looked further found (resolved), printed as a line to keep
 *   record(type, data)        a record with no text
 * @param tool  the tool's name
 * @param args  what it was given
 */
export function openLog(
  tool: string,
  args: string[] = [],
  { label = null, via = "script", sinks, print }: LogOptions,
): Log {
  const run = randomBytes(4).toString("hex");
  const write: Sink = (record) => {
    for (const sink of sinks) sink({ ...record, run });
  };
  write({ type: "run", tool, via, args, ...(label ? { label } : {}) });
  return {
    line(text = "", as = label, parts = null) {
      print(String(text));
      for (const record of lineRecords(text, as, parts)) write(record);
    },
    keep(text) {
      print(keepLine(text));
      write({ type: "keep", text });
    },
    clash(c) {
      print(clashLine(c));
      write({ type: "clash", a: c.a, b: c.b });
    },
    next(text) {
      print(text);
      write({ type: "next", text });
    },
    resolve(key, r, as = label, parts = null) {
      const item = resolved(key, r, as, parts);
      print(item.text);
      for (const record of lineRecords(item.text, as, parts)) write(record);
      write({ type: "resolution", ...item.resolution });
    },
    // Log.record checks the fields given against the record of that type; here they are written as given.
    record(type: LogRecord["type"], data: object = {}) {
      write({ type, ...data } as LogRecord);
    },
  };
}
