#!/usr/bin/env node
// Checks the reply to the owner before it is sent (the note_check tool runs it), and what it delivers: files the
// reply hands over (a page, an email, a policy) and drafts inside it. An agent told to label every figure and keep to
// the form can still send bare figures, counts no tool printed, conclusions about everyone from twelve people, and
// notes three times the length asked for. This catches those.
//
//   node scripts/note.ts reply.md [--pays=pays.json] [--delivered=<each file the reply hands over>] [--log=log.jsonl]
//
// The checks are in scripts/checks/, one record each with its kind (index.ts says what each kind may do): the note of
// what is worth considering, a label on every figure and a trace for every tool's figure, the owner's terms kept in
// what is delivered and no rule added that the owner gave nowhere, what the request left for the owner to say, an
// offer bought by organisations, the groups put forward, and what is delivered (each file named, each draft in the
// reply, a fenced block or lines quoted with >, or with neither, the reply itself). A draft's figures are the owner's
// terms, not claims to the owner: they need no label. Word patterns on the reply's own prose only warn.
// Exit code 1 when something must be fixed.
import { existsSync, readdirSync, readFileSync, statSync, type Dirent } from "node:fs";
import { extname, join, resolve } from "node:path";
import { argsOf, cli, Exit, readIn, usageExit, type Out, type RunContext } from "./cli.ts";
import { REPLY_WORDS } from "./checks/form.ts";
import { runChecks, type Delivered, type Finding } from "./checks/index.ts";
import { logFile, openLog, type Pay } from "./log.ts";
import { askedFiles, ownerAnswers, productHome, productOrNull, type ProductSummary, type Source } from "./product.ts";
import { loggedNumbers, passed, readLog, type LogRun } from "./records.ts";
import { blocksOf, draftLines, draftsOf, numbersIn, rowsOf, type GivenNumber } from "./reply.ts";
import { readRecords, sourcesFile, type SourceRecord } from "./source.ts";

/** What the owner gave in their own words, and what nxk.json keeps from them (ownerGiven). */
interface OwnerGiven {
  written: string[];
  product: ProductSummary | null;
  answers: string[];
  figures: string[];
  shares: string[];
}

/**
 * What the owner gave in their own words: the request as terms saved it (request.md) and what they typed in the
 * session (`written`), and what nxk.json keeps of the product (`product`) and from the owner (`answers`, `figures` and
 * `shares`, with source owner). An nxk.json that cannot be read gives nothing.
 */
function ownerGiven(folder: string): OwnerGiven {
  const p = productOrNull(folder);
  const theirs = <T extends { source: Source }>(entries: T[] = []) =>
    entries.filter((entry) => entry.source === "owner");
  return {
    written: [requestFile(folder), ...askedFiles(folder)]
      .filter((file) => existsSync(file))
      .map((file) => readFileSync(file, "utf8")),
    product: p?.product ?? null,
    answers: theirs(p?.facts).map((f) => String(f.answer ?? "")),
    figures: theirs(p?.money).map((m) => String(m.value)),
    shares: theirs(p?.customers)
      .filter((c) => c.share !== null)
      .map((c) => String(c.share)),
  };
}

/**
 * The owner's numbers with their form: { value, kind }, kind "%" (85%), "money" ($29) or "plain" (100 accounts, or a
 * figure nxk.json keeps as a bare number). A reply's "29%" is not the owner's "$29".
 */
export function ownerFigures(folder: string): GivenNumber[] {
  const { written, product, answers, figures, shares } = ownerGiven(folder);
  const texts = [...written, product?.name ?? "", product?.description ?? "", ...answers];
  return [
    ...texts.flatMap((text) => formsIn(text)),
    ...[...figures, ...shares].flatMap((text) =>
      numbersIn(text).map((n): GivenNumber => ({ value: n.value, kind: "plain" })),
    ),
  ];
}
// The project's own files that may hold the owner's terms: text a person writes (notes, pages, config), never a key.
const TEXT_FILES = new Set([
  ".md",
  ".txt",
  ".html",
  ".htm",
  ".json",
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".jsx",
  ".yml",
  ".yaml",
  ".toml",
  ".csv",
  ".vue",
  ".svelte",
  ".php",
  ".py",
  ".rb",
]);
const SKIP_DIRS = new Set([".git", "node_modules", ".nxk", "dist", "build", ".next", "vendor", "coverage", ".claude"]);
// What nxk's tools save in a folder, and the knowledge base: written by the session, not given by the owner.
const NXK_FILES = new Set([
  "nxk.json",
  "reply.md",
  "pays.json",
  "terms.json",
  "open.json",
  "clashes.json",
  "not-clashes.json",
  "suggestions.json",
]);

/** The owner's request as the terms tool saved it: in .nxk, or at the top of a project nxk ran in before. */
export const requestFile = (folder: string): string =>
  [join(folder, ".nxk", "request.md"), join(folder, "request.md")].find((path) => existsSync(path)) ??
  join(folder, ".nxk", "request.md");

/**
 * What the owner gave, as texts: the request (request.md), what they typed in the session, what nxk.json keeps in their
 * words, the project's own files, and the words checked on pages opened with source_check. A project file written
 * after the request was saved, or one the reply delivers, is the session's, not the owner's. Files are read up to a
 * limit, and no file whose name starts ".env" is read.
 * @param options.delivered  the paths of the files the reply delivers
 */
export function ownerTexts(
  folder: string,
  { delivered = [], sources = null }: { delivered?: string[]; sources?: SourceRecord[] | null } = {},
): string[] {
  const request = requestFile(folder);
  const since = existsSync(request) ? statSync(request).mtimeMs : Infinity;
  const { written, answers, figures } = ownerGiven(folder);
  const texts = [...written, ...answers, ...figures, ...(sources ?? []).map((record) => String(record.words ?? ""))];
  const root = productHome(folder),
    skip = new Set(
      delivered.map((path) => {
        const at = resolve(folder, path);
        return existsSync(at) && statSync(at).isDirectory() ? join(at, "index.html") : at;
      }),
    );
  let files = 0,
    bytes = 0;
  const walk = (dir: string) => {
    let entries: Dirent[] = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files >= 400 || bytes >= 3e6) return;
      const at = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(at);
        continue;
      }
      if (!entry.isFile() || entry.name.startsWith(".env") || NXK_FILES.has(entry.name) || at === request) continue;
      if (!TEXT_FILES.has(extname(entry.name).toLowerCase()) || skip.has(at)) continue;
      const stat = statSync(at);
      if (stat.size > 2e5 || stat.mtimeMs > since) continue;
      files++;
      bytes += stat.size;
      texts.push(readFileSync(at, "utf8"));
    }
  };
  walk(root);
  return texts;
}

/** The topics the owner has answered (nxk.json), which close a fact listed as open for terms. */
export function answeredTopics(folder: string): string[] {
  const product = productOrNull(folder);
  return product ? ownerAnswers(product).map((a) => a.topic) : [];
}

const formsIn = (text: string): GivenNumber[] =>
  [...String(text).matchAll(/([£$€]\s?)?\d(?:[\d,]*\d)?(?:\.\d+)?(\s?%)?/g)]
    .map((m): GivenNumber => ({ value: numbersIn(m[0])[0]?.value, kind: m[2] ? "%" : m[1] ? "money" : "plain" }))
    .filter((f) => Number.isFinite(f.value));
/**
 * Whether figures were printed (a count, a scan, a sum: a script that opened its log with the kind its figures are) and
 * no reply passed note_check after the last of them. `runs` are the log's runs (scripts/records.ts).
 */
export function unnoted(runs: LogRun[]): boolean {
  const last = runs.findLastIndex((run) => run.via === "script" && run.label);
  return last >= 0 && !runs.slice(last + 1).some(passed);
}

/** Whether a log ends with suggestions counted and no passing note check after them: the reply still owes its check. */
export function unchecked(runs: LogRun[]): boolean {
  const last = runs.findLastIndex((run) => run.via === "script" && run.tool === "suggest");
  return last >= 0 && !runs.slice(last + 1).some(passed);
}

/** What check reads beside the reply and the log. */
export interface CheckOptions {
  /** The words the reply is asked to keep within. */
  words?: number;
  /** The records of pages opened with source_check (scripts/source.ts), or null. */
  sources?: SourceRecord[] | null;
  /** The files the reply hands over, or null when they are not known. */
  delivered?: Delivered[] | null;
  /** The owner's figures (ownerFigures); a bare number stands for any form. */
  owner?: (number | GivenNumber)[];
  /** What the owner gave, as texts (ownerTexts), or null. */
  ownerTexts?: string[] | null;
  /** What the agent declared the reply and what it delivers ask a person to pay, or null when it declared nothing. */
  pays?: Pay[] | null;
  /** The topics the owner has answered (answeredTopics). */
  answered?: string[];
}

/**
 * Every finding about a reply, from the checks in scripts/checks/. `runs` are the runs in the tools' log
 * (scripts/records.ts), or null when there is none.
 */
export function check(
  text: string,
  runs: LogRun[] | null,
  {
    words = REPLY_WORDS,
    sources = null,
    delivered = [],
    owner = [],
    ownerTexts = null,
    pays = null,
    answered = [],
  }: CheckOptions = {},
): Finding[] {
  const lines = text.split("\n");
  const drafts = draftLines(lines);
  const given = [...(delivered ?? []), ...draftsOf(lines, drafts)];
  return runChecks({
    text,
    lines,
    drafts,
    runs,
    owner,
    ownerTexts,
    sources,
    words,
    pays,
    answered,
    logged: runs === null ? null : loggedNumbers(runs),
    // Suggestions were counted and have not gone to the owner in a reply that passed.
    suggested: runs !== null && unchecked(runs),
    blocks: blocksOf(lines, drafts),
    rows: rowsOf(lines, drafts),
    // What is delivered: each file and each draft, or with neither, the reply itself (advice in a chat).
    items: given.length ? given : [{ name: "the reply", text }],
    replyDelivered: !given.length,
    // null when the files the reply delivers are not known (the Stop hook's check of the last message).
    deliveredKnown: delivered !== null,
  });
}

/** A delivered file, found in `folder`: a folder stands for its index.html. */
export function readDelivered(path: string, folder: string): Delivered {
  const at = resolve(folder, path),
    file = existsSync(at) && statSync(at).isDirectory() ? join(at, "index.html") : at;
  if (!existsSync(file))
    throw new Error(
      `Not found: ${path}, looked for at ${file}. Name each file the reply delivers as a path in the folder (${resolve(folder)}).`,
    );
  return { name: path, text: readFileSync(file, "utf8") };
}

export async function run(argv: string[], out: Out, { folder, env = process.env }: RunContext): Promise<void> {
  const {
    positionals: [file],
    flags,
    lists,
  } = argsOf(argv);
  // Exit code 1 says the reply must be fixed, so a call without one ends as any other error does, with 2.
  if (!file) throw usageExit(import.meta.url, out, argv, 2);
  const given = flags.log,
    path = given
      ? resolve(folder, given)
      : (given ?? logFile({ ...env, NXK_LOG: env.NXK_LOG === "off" ? "" : env.NXK_LOG }, folder));
  const runs = path && existsSync(path) ? readLog(path) : null;
  // --delivered is given once for each file the reply hands over.
  const deliveredPaths = lists.delivered ?? [];
  const delivered = deliveredPaths.map((named) => readDelivered(named, folder));
  const paysFile = flags.pays;
  const pays: Pay[] | null = paysFile ? JSON.parse(readIn(folder, paysFile, "utf8")) : null;
  if (pays !== null && !Array.isArray(pays))
    throw new Error(
      `${paysFile}: pays is a list, [{ "kind": "free_trial", "says": "..." }], or [] when nothing is asked`,
    );
  const sources = readRecords(sourcesFile(path || logFile(env, folder), folder));
  const findings = check(readIn(folder, file, "utf8"), runs, {
    // The length asked for is the owner's, not the agent's: a session that set its own limit gave itself 600 to
    // 1,500 words.
    words: REPLY_WORDS,
    sources,
    delivered,
    owner: ownerFigures(folder),
    ownerTexts: ownerTexts(folder, { delivered: deliveredPaths, sources }),
    pays,
    answered: answeredTopics(folder),
  });
  // The verdict goes to the log too (after it was read), so that the Stop hook can see the reply passed, and check
  // the reply it ends on against the same declared payments.
  const log = openLog("note", [file, ...(paysFile ? [`--pays=${paysFile}`] : [])], out);
  for (const finding of findings) log.line(`${finding.level}  ${finding.message}`);
  const fails = findings.filter((f) => f.level === "FAIL").length;
  log.line(
    fails
      ? `\n${fails} to fix before the reply goes to the owner.`
      : `\nReady to send${findings.length ? " (read the warnings)" : ""}.${runs === null ? " No log was found, so no figure was traced." : ""}`,
  );
  log.record("verdict", { ready: !fails, pays });
  if (fails) throw new Exit(1);
}

cli(import.meta.url, run, { fails: 2 });
