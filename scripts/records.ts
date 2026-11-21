// Reading the tools' log (scripts/log.ts writes it): the runs in it and what the tools said they meant. Shared by
// note_check's checks (scripts/checks/), the hooks and the server; none of it reads a tool's text.
//
// A resolution ({ type: "resolution", key, outcome, text }) is what a step that looked further found, with the line the
// reply keeps (scripts/log.ts). probe writes one for each group it looks at ("probe:<group>|<among>"), the options
// scan one for each read ("scan:<label>|<groups>"), the explorer one once a move was made since its first call
// ("explore"), and corner_split one for each group it splits ("split:<segment>").
//
// Records with no text of their own, by the tool that writes them:
//   terms     { type: "open", topic }         a fact the work needs that only the owner can say, as the agent listed it
//             { type: "owner_term", id, kind, quotes } a term the owner fixed, in their words, as the agent listed it
//   suggest   { type: "raise", suggestion, line } an item worth raising in the note, with its line
//             { type: "weighted" }            counts were given among people like the owner's customers
//             { type: "close_call" }          a count close to the figure in its rule
//   note      { type: "verdict", ready, pays } note_check's verdict, with what the reply was declared to ask people to pay
//   scan      { type: "paced", minutes }      how long the scan is paced to take
//             { type: "spent", usd, total }   what this scan spent, and the spec's total (printed when it finished sending)
//             { type: "fact", field, low, high } a fact that matters, with its two ends as printed
//   discover  { type: "no_corner", ideas }    offers with no corner of their own
//             { type: "at_work", ideas }      offers asked at work
//   people    { type: "marked", field, gap }  a fact that marks a group out, with the gap in points as printed
//             { type: "firms", value }        a number of firms, or a share of firms in every 100, as printed (unit firms)
// and, in ideas_scan's answer only (never logged: it is for the next move, mcp/nudge.ts):
//   server    { type: "running" }             a scan is left running in the background: nothing was read
import { existsSync, readFileSync } from "node:fs";
import type { Clash, FigureKind, KeptResolution, Label, LogRecord, Pay, RecordData, RecordOf, Via } from "./log.ts";
import { numbersIn } from "./reply.ts";

/** A run in the log: the tool, how it ran and what it was given, the kind its figures are, and its own records. */
export interface LogRun {
  /** The run's id. */
  run: string;
  tool: string;
  via: Via;
  args: string[];
  label: Label;
  /** The run's records after its run record, in order. */
  records: LogRecord[];
}

/**
 * A log's runs, in the order they started: [{ run, tool, via, args, label, records }], `records` being the run's own
 * records after its run record. A torn last line (a write cut short) is left out; any other line that is not a record
 * is an error.
 */
export function parseLog(text: string, name = "the log"): LogRun[] {
  const lines = String(text).split("\n");
  if (lines.at(-1) === "") lines.pop();
  const runs = new Map<string, LogRun>();
  lines.forEach((line, i) => {
    // Every record in the log carries the id of its run.
    let record: LogRecord & { run: string };
    try {
      record = JSON.parse(line);
    } catch {
      if (i === lines.length - 1) return;
      throw new Error(`${name}, line ${i + 1}: not a record`);
    }
    if (record.type === "run") {
      const { type, run, ...rest } = record;
      runs.set(run, { run, label: null, ...rest, records: [] });
    } else if (runs.has(record.run)) runs.get(record.run)!.records.push(record);
    else throw new Error(`${name}, line ${i + 1}: a record of no run`);
  });
  return [...runs.values()];
}

/** The runs in a log file ([] when there is none). */
export const readLog = (file: string | null | undefined): LogRun[] =>
  file && existsSync(file) ? parseLog(readFileSync(file, "utf8"), file) : [];

/** Every record of the runs, in order, of one type. */
export const recordsOf = <T extends LogRecord["type"]>(runs: LogRun[], type: T): RecordOf<T>[] =>
  runs.flatMap((run) => run.records.filter((r): r is RecordOf<T> => r.type === type));

/** The last run of one of the engine's scripts, or null. */
export const lastRun = (runs: LogRun[], tool: string): LogRun | null =>
  runs.findLast((run) => run.via === "script" && run.tool === tool) ?? null;

/**
 * The numbers each kind of label may be traced to: every number in a line goes to the line's label, except the
 * numbers in its parts, which go to theirs. Returns { counted, computed, simulated, measured }.
 */
export function loggedNumbers(runs: LogRun[]): Record<FigureKind, number[]> {
  const out: Record<FigureKind, number[]> = { counted: [], computed: [], simulated: [], measured: [] };
  for (const line of recordsOf(runs, "line")) {
    const values = numbersIn(line.text).map((n) => n.value);
    for (const [label, parts] of Object.entries(line.parts ?? {}) as [FigureKind, string[]][])
      for (const part of parts)
        for (const { value } of numbersIn(part)) {
          out[label].push(value);
          const at = values.indexOf(value);
          if (at >= 0) values.splice(at, 1);
        }
    if (line.label) out[line.label].push(...values);
  }
  return out;
}

/** The lines the tools said to keep in the reply, each once. */
export const keptLines = (runs: LogRun[]): string[] => [...new Set(recordsOf(runs, "keep").map((r) => r.text))];

/**
 * What each step that looked further found, as the reply keeps it: the latest resolution of each key.
 * [{ key, outcome, text }].
 */
export function resolutionsOf(runs: LogRun[]): KeptResolution[] {
  const latest = new Map<string, KeptResolution>();
  for (const run of runs) {
    for (const { key, outcome, text } of run.records.filter((r) => r.type === "resolution"))
      latest.set(key, { key, outcome, text });
  }
  return [...latest.values()];
}

/** The places the last terms printed the request contradicting itself, as the agent listed them: [{ a, b }]. */
export const clashesOf = (runs: LogRun[]): Clash[] =>
  (lastRun(runs, "terms")?.records ?? []).filter((r) => r.type === "clash").map(({ a, b }) => ({ a, b }));

/** What the last terms was told only the owner can say, as the agent listed it in open: [topic]. */
export const openOf = (runs: LogRun[]): string[] =>
  (lastRun(runs, "terms")?.records ?? []).filter((r) => r.type === "open").map((r) => r.topic);

/** The owner's terms as the session listed them for the last terms: [{ id, kind, quotes }]. */
export const ownerTermsOf = (runs: LogRun[]): RecordData<"owner_term">[] =>
  (lastRun(runs, "terms")?.records ?? [])
    .filter((r) => r.type === "owner_term")
    .map(({ id, kind, quotes }) => ({ id, kind, quotes }));

/** The note's items the last suggest found worth raising: [{ suggestion, line }]. */
export const raisedOf = (runs: LogRun[]): RecordData<"raise">[] =>
  (lastRun(runs, "suggest")?.records ?? [])
    .filter((r) => r.type === "raise")
    .map(({ suggestion, line }) => ({ suggestion, line }));

/** Whether a run had a reply pass note_check. */
export const passed = (run: LogRun): boolean => run.records.some((r) => r.type === "verdict" && r.ready);

/** What the last note check was told the reply asks people to pay, or null when it was told nothing. */
export const paysOf = (runs: LogRun[]): Pay[] | null =>
  lastRun(runs, "note")?.records.find((r) => r.type === "verdict")?.pays ?? null;

/** The minutes a scan said it is paced to take, from a list of records (not runs), or null. */
export const pacedIn = (records: LogRecord[]): number | null =>
  records.find((r) => r.type === "paced")?.minutes ?? null;
