// How the engine's scripts run. Each exports run(argv, out, { folder, env }): it prints only through `out`, which is
// { print, sinks } (print takes a line; scripts/log.ts openLog takes both, so a tool's lines and records go where
// `out` says), finds every file it is given in `folder` and never in the process's own working folder, and ends a
// refusal or a usage error by throwing an Exit with the exit code, never with process.exit. The MCP server calls run in
// its own process (mcp/common.ts runScript) with `out` collecting the text and the records; from a shell, the
// script's last line, cli(import.meta.url, run), runs it with `out` writing to stdout and the folder's log.
import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { scriptSinks, type Sink } from "./log.ts";

/** Where a script's run prints: `print` takes a line, and each of `sinks` takes a record (scripts/log.ts openLog). */
export interface Out {
  print: (text: string) => void;
  sinks: Sink[];
}

/** Where a script's run works: the folder it finds the files it is given in, and the environment it reads. */
export interface RunContext {
  folder: string;
  /** process.env when not given. */
  env?: NodeJS.ProcessEnv;
}

/** A script's run. What it returns is not used: it ends a refusal or a usage error by throwing an Exit. */
export type Run = (argv: string[], out: Out, context: RunContext) => unknown;

/** A command line, as argsOf reads it. */
export interface Args {
  /** The arguments that do not start with --, in order. */
  positionals: string[];
  /** Each --name=value as { name: "value" }, the last kept. */
  flags: Record<string, string>;
  /** Every value of each flag. */
  lists: Record<string, string[]>;
}

/** The end of a script with an exit code (0 included); its message, when there is one, follows what it printed. */
export class Exit extends Error {
  readonly code: number;

  constructor(code: number, message = "") {
    super(message);
    this.code = code;
  }
}

/**
 * A script's usage: the whole comment at the top of its file, without the comment marks.
 * @param url  the script's import.meta.url
 */
export function usage(url: string): string {
  const lines = readFileSync(new URL(url), "utf8").split("\n");
  const start = lines[0].startsWith("#!") ? 1 : 0;
  const end = lines.findIndex((line, i) => i >= start && !line.startsWith("//"));
  return lines
    .slice(start, end < 0 ? lines.length : end)
    .map((line) => line.replace(/^\/\/ ?/, ""))
    .join("\n");
}

/**
 * The end of a run given too little to go on: prints the script's usage, and returns the Exit to throw, with code 0
 * when it was given nothing at all (which asks for the usage) and `code` otherwise. A script whose exit code 1 is a
 * verdict (the reply must be fixed, the words are not on the page) passes 2, its code for an error.
 * @param url  the script's import.meta.url
 */
export function usageExit(url: string, out: Out, argv: string[], code = 1): Exit {
  out.print(usage(url));
  return new Exit(argv.length ? code : 0);
}

/**
 * A command line, the scripts' and the eval runners': `positionals`, the arguments that do not start with --, in
 * order; `flags`, each --name=value as { name: "value" }, the last kept when a name is given twice; and `lists`, every
 * value of each flag, for one given once for each thing (--delivered=a --delivered=b). A bare --name is "" (set, with
 * no value), as --name= is: a switch is tested with `"read" in flags`, and a flag that needs a value finds none.
 * Everything after a bare -- is a positional, so text that starts with dashes (words copied from a page) is never read
 * as a flag.
 */
export function argsOf(argv: string[]): Args {
  const positionals: string[] = [],
    flags: Record<string, string> = Object.create(null),
    lists: Record<string, string[]> = Object.create(null);
  const end = argv.indexOf("--");
  for (const [i, arg] of argv.entries()) {
    if (end >= 0 && i >= end) {
      if (i > end) positionals.push(arg);
      continue;
    }
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    const [name, ...value] = arg.slice(2).split("=");
    flags[name] = value.join("=");
    (lists[name] ??= []).push(flags[name]);
  }
  return { positionals, flags, lists };
}

/** Whether `url`, a module's import.meta.url, is the script node was started with (and not a module it imported). */
export const isMain = (url: string): boolean =>
  Boolean(process.argv[1]) && realpathSync(fileURLToPath(url)) === realpathSync(process.argv[1]);

/** Reads a file a script was given, found in its folder; an error names the file as it was given, as from a shell there. */
export function readIn(folder: string, path: string, encoding: BufferEncoding): string;
export function readIn(folder: string, path: string): Buffer;
export function readIn(folder: string, path: string, encoding?: BufferEncoding): string | Buffer {
  const at = resolve(folder, String(path));
  try {
    return readFileSync(at, encoding);
  } catch (error) {
    if (error instanceof Error && at !== String(path)) error.message = error.message.split(at).join(String(path));
    throw error;
  }
}

/**
 * Runs a script's run from a shell, when `url` is the script node was started with: it prints to stdout, writes its
 * records to the log in the working folder (and to NXK_RECORDS when set: mcp/common.ts background reads a detached
 * script's records there), and ends with the exit code; an error that is not an Exit ends it with `fails`, its message
 * on stderr. With `orphaned`, a message, the process says it and ends when whatever started it has gone.
 * @param url  the script's import.meta.url
 */
export function cli(
  url: string,
  run: Run,
  { fails = 1, orphaned = null }: { fails?: number; orphaned?: string | null } = {},
): void {
  if (!isMain(url)) return;
  if (orphaned) {
    const parent = process.ppid;
    setInterval(() => {
      if (process.ppid !== parent) {
        console.error(orphaned);
        process.exit(1);
      }
    }, 2000).unref();
  }
  const folder = process.cwd(),
    out: Out = { print: (text) => console.log(text), sinks: scriptSinks(process.env, folder) };
  Promise.resolve()
    .then(() => run(process.argv.slice(2), out, { folder, env: process.env }))
    .catch((error) => {
      if (error?.message) console.error(error.message);
      process.exitCode = error instanceof Exit ? error.code : fails;
    });
}
