// What the tests share: logs as the tools write them (scripts/log.ts), from a line or two a run.
import { lineRecords, type Label, type LineRecord, type LogRecord, type Parts } from "./log.ts";
import type { LogRun } from "./records.ts";

let runs = 0;
/**
 * A run of one of the engine's scripts, as scripts/records.ts reads it: `label` is the kind its figures are (null for
 * none); each item is text it printed (a line each, under the run's label), a record ({ type, ... }), or a list of
 * them. line() gives a line with a label of its own.
 */
export const run = (tool: string, label: Label, ...items: (string | LogRecord | LogRecord[])[]): LogRun => ({
  run: `r${++runs}`,
  tool,
  via: "script",
  args: [],
  label,
  records: items.flat().flatMap((item) => (typeof item === "string" ? lineRecords(item, label) : [item])),
});
/** A run of one of the server's own tools: its lines carry their own labels (line()). */
export const served = (tool: string, ...items: (string | LogRecord | LogRecord[])[]): LogRun => ({
  ...run(tool, null, ...items),
  via: "server",
});
/** A line with its own label, and parts of other labels: { counted: ["words in it"] }. */
export const line = (text: string, label: Label = null, parts: Parts | null = null): LineRecord[] =>
  lineRecords(text, label, parts);

/** Runs as the text of a log file, one record a line. */
export const logText = (list: LogRun[]): string =>
  list
    .flatMap(({ records, ...run }) => [{ type: "run", ...run }, ...records.map((r) => ({ ...r, run: run.run }))])
    .map((record) => `${JSON.stringify(record)}\n`)
    .join("");
