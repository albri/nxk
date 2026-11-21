#!/usr/bin/env node
// Opens a page and checks that words copied from it are on it, so that a figure labelled sourced was read on the page
// it links to. A figure taken from a search summary is often not on the page the summary links to.
//
//   node scripts/source.ts [--] <link> "<words copied from the page, with the figure>"
//
// Words that start with dashes ("-20% off") go after --, so they are not read as an option.
//
// It fetches the page, follows redirects, reads its text and looks for the words, ignoring case, spacing, quote marks
// and other punctuation. Found: it keeps a record in .nxk/sources.jsonl, beside the log, and suggest.ts and note.ts
// accept a sourced figure only when a record for its link holds that figure. Not found: it says where the link went
// and prints the lines on the page that have the figure, to find the right words or the right page.
// A page whose text needs a browser is opened in one when Playwright and Chromium are found (PLAYWRIGHT_CORE and
// CHROMIUM point at them when they are not where they usually are); a PDF is read with pdftotext when it is installed. Exit code 1 when the words are not on the page.

/// <reference lib="dom" />
// The dom lib is for the one callback that runs in the page a browser opens (browserPage).
import { execFileSync } from "node:child_process";
import {
  type Dirent,
  accessSync,
  appendFileSync,
  constants,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { walk } from "./html.ts";
import { argsOf, cli, Exit, usageExit, type Out, type RunContext } from "./cli.ts";
import { plural } from "./format.ts";
import { logFile, openLog } from "./log.ts";

/**
 * A page opened with source_check, as sources.jsonl keeps it: the link, where it went, the words found on it, how it
 * was read and the day.
 */
export interface SourceRecord {
  url: string;
  page?: string;
  words: string;
  how?: string;
  checked?: string;
}

/** A sourced text against the records (sourceProblems). */
export interface SourceProblems {
  /** The links in it that no record checked. */
  unopened: string[];
  /** The figures in it that the checked words of its links do not hold. */
  missing: number[];
  /** The words checked on its links' pages. */
  words: string[];
}

/** A way of opening the page that read it: where the link went, and its lines (null for a PDF that was not read). */
interface Opened {
  how: "fetch" | "pdf" | "browser";
  page: string;
  lines: string[] | null;
  status?: number;
  /** Why a PDF's lines could not be read. */
  note?: string;
  error?: undefined;
}

/** A way of opening the page that failed, and why. */
interface Failed {
  how: "fetch" | "browser";
  error: string;
  page?: undefined;
  lines?: undefined;
  status?: undefined;
  note?: undefined;
}

type Attempt = Opened | Failed;

/** The part of Playwright the check uses: a headless Chromium launched, a page opened and its text read. */
interface Chromium {
  launch(options: { executablePath?: string; headless: boolean; timeout: number }): Promise<Browser>;
}
interface Browser {
  newPage(): Promise<Tab>;
  close(): Promise<void>;
}
interface Tab {
  goto(url: string, options: { waitUntil: "load"; timeout: number }): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  url(): string;
  evaluate<T>(callback: () => T): Promise<T>;
}

export const MIN_WORDS = 3;
export const MAX_WORDS = 40;

/** Text for matching: lower case, no quote marks, other punctuation as spaces except a point or comma inside a number. */
export function squash(text: string): string {
  const plain = String(text)
    .toLowerCase()
    .replace(/[‘’‛“”'"`]/g, "")
    .replace(/(\d),(?=\d{3}\b)/g, "$1")
    .replace(/[^\p{L}\p{N}£$€%.]+/gu, " ")
    .replace(/\.(?!\d)|(?<!\d)\./g, " ")
    .replace(/([£$€]) (?=\d)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return ` ${plain} `;
}

/** Whether the words are in the text, as squash reads both. */
export const holds = (text: string, words: string): boolean => squash(text).includes(squash(words));

const MONTHS =
  "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const REFERENCE_WORDS =
  "regs?|regulations?|sections?|sec|conditions?|clauses?|rules?|articles?|paragraphs?|para|schedules?|parts?";

/** Whether a bare number is a figure to check, not part of a reference (C1.14, reg 30) or a date (2021-22, 1 April). */
function isFigure(text: string, at: number, raw: string): boolean {
  const before = text.slice(Math.max(0, at - 20), at),
    after = text.slice(at + raw.length, at + raw.length + 12);
  if (/[A-Za-z]$/.test(before)) return false;
  if (new RegExp(String.raw`\b(?:${REFERENCE_WORDS})\.?\s*$`, "i").test(before)) return false;
  if (/\b(?:19|20)\d\d\s?[-\u2013\u2014/]\s?$/.test(before) && raw.length === 2) return false;
  if (
    (new RegExp(String.raw`^\s+(?:${MONTHS})\b`, "i").test(after) || /^\s+May\b/.test(after)) &&
    Number(raw) >= 1 &&
    Number(raw) <= 31
  )
    return false;
  return true;
}

/** The numbers in a text, leaving out its links and a year standing alone (2026), which a citation carries. */
export function figuresOf(text: string): number[] {
  const plain = String(text).replace(/https?:\/\/\S+/g, " ");
  const out: number[] = [];
  for (const m of plain.matchAll(/([£$€]\s?)?(\d(?:[\d,]*\d)?(?:\.\d+)?)(\s?%)?/g)) {
    if (!m[1] && !m[3] && !isFigure(plain, m.index, m[0])) continue;
    const raw = m[2].replace(/,+$/, "").replace(/,(?=\d{3}\b)/g, "");
    if (!m[1] && !m[3] && /^(19|20)\d\d$/.test(raw)) continue;
    if (Number.isFinite(Number(raw))) out.push(Number(raw));
  }
  return out;
}

/** The links in a text, without the punctuation that follows them. */
export const linksIn = (text: string): string[] =>
  [...String(text).matchAll(/https?:\/\/[^\s<>"']+/g)].map((m) => m[0].replace(/[).,;:\]]+$/, ""));
const sameLink = (a: string | undefined, b: string) => String(a).replace(/\/+$/, "") === String(b).replace(/\/+$/, "");

/** Where source.ts keeps its records: sources.jsonl beside the log, or in `folder`'s .nxk when there is no log. */
export const sourcesFile = (log: string | null | undefined, folder: string): string =>
  resolve(dirname(log ?? resolve(folder, ".nxk/log.jsonl")), "sources.jsonl");

/** The records source.ts kept, or null when there is no file. */
export function readRecords(file: string): SourceRecord[] | null {
  if (!existsSync(file)) return null;
  return readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .flatMap((line): SourceRecord[] => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

/**
 * A sourced text (a "rules" answer or a line of the reply) against the records: the links in it that no record
 * checked, and the figures in it that the checked words of its links do not hold. Returns { unopened, missing, words }.
 */
export function sourceProblems(text: string, records: SourceRecord[] | null): SourceProblems {
  const unopened: string[] = [],
    words: string[] = [];
  for (const link of linksIn(text)) {
    const found = (records ?? []).filter((record) => sameLink(record.url, link));
    if (!found.length) unopened.push(link);
    words.push(...found.map((record) => record.words));
  }
  const held = words.flatMap(figuresOf);
  const missing = words.length ? [...new Set(figuresOf(text))].filter((value) => !held.includes(value)) : [];
  return { unopened, missing, words };
}

/** The problems as sentences for the agent. */
export function describeProblems({ unopened, missing }: Pick<SourceProblems, "unopened" | "missing">): string[] {
  const are = plural(missing.length, "is", "are"),
    them = plural(missing.length, "it", "them");
  return [
    ...unopened.map(
      (link) =>
        `${link} was not opened: run source_check with ${link} and "words copied from the page, with the figure" (a search summary is not the page)`,
    ),
    ...(missing.length
      ? [
          `${missing.join(", ")} ${are} not in the words checked on the page: check words that hold ${them} with source_check, or keep your own figures out of this line`,
        ]
      : []),
  ];
}

const lineList = (text: string) =>
  String(text)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

/** Each line of a page that has one of the figures, with the lines either side, which say what the figure is of. */
export function around(lines: string[], figures: number[], { most = 4 }: { most?: number } = {}): string[] {
  const out: string[] = [];
  lines.forEach((line, i) => {
    if (out.length < most && figuresOf(line).some((value) => figures.includes(value)))
      out.push(
        lines
          .slice(Math.max(0, i - 1), i + 2)
          .map((l) => l.slice(0, 160))
          .join(" | "),
      );
  });
  return out;
}

/** A PDF's lines, or { why } it could not be read: pdftotext missing is one reason, a PDF it cannot read another. */
function pdfLines(buffer: Buffer): string[] | { why: string } {
  const dir = mkdtempSync(join(tmpdir(), "nxk-source-"));
  try {
    writeFileSync(join(dir, "page.pdf"), buffer);
    return lineList(
      execFileSync("pdftotext", [join(dir, "page.pdf"), "-"], {
        encoding: "utf8",
        maxBuffer: 64e6,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 60000,
      }),
    );
  } catch (error) {
    const failed = error as NodeJS.ErrnoException & { stderr?: string };
    return {
      why:
        failed.code === "ENOENT"
          ? "pdftotext is not installed"
          : `pdftotext could not read it (${String(failed.stderr || failed.message)
              .trim()
              .split("\n")[0]
              .slice(0, 120)})`,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function fetchPage(url: string): Promise<Opened> {
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(20000) });
  const page = response.url || url;
  if (/pdf/i.test(response.headers.get("content-type") ?? "") || /\.pdf(?:$|[?#])/i.test(page)) {
    const read = pdfLines(Buffer.from(await response.arrayBuffer())),
      lines = Array.isArray(read) ? read : null;
    return {
      how: "pdf",
      status: response.status,
      page,
      lines,
      note: Array.isArray(read) ? "" : `a PDF, and ${read.why}`,
    };
  }
  const html = await response.text();
  return {
    how: "fetch",
    status: response.status,
    page,
    lines: walk(html)
      .texts.filter((t) => !t.skip)
      .map((t) => t.text.replace(/\s+/g, " ").trim())
      .filter(Boolean),
  };
}

/** Playwright's chromium, from the project, a global install or PLAYWRIGHT_CORE. Throws when there is none. */
async function loadPlaywright(env: NodeJS.ProcessEnv): Promise<Chromium> {
  const tries = ["playwright", "playwright-core"];
  if (env.PLAYWRIGHT_CORE)
    for (const f of ["index.ts", "index.js"]) tries.push(pathToFileURL(join(env.PLAYWRIGHT_CORE, f)).href);
  for (const name of tries)
    try {
      const m: { chromium?: Chromium; default?: { chromium?: Chromium } } = await import(name);
      const c = m.chromium ?? m.default?.chromium;
      if (c) return c;
    } catch {
      /* the next */
    }
  throw new Error("Playwright not found");
}

/** Chromium builds to try: CHROMIUM alone when set, else Playwright's default, its caches and the usual places. */
function chromiumCandidates(env: NodeJS.ProcessEnv): (string | undefined)[] {
  if (env.CHROMIUM) return [env.CHROMIUM];
  const out: (string | undefined)[] = [undefined];
  const look = (dir: string, depth: number) => {
    let entries: Dirent[] = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory() && depth > 0) look(p, depth - 1);
      else if (e.isFile() && ["Chromium", "chrome", "chrome-headless-shell"].includes(e.name))
        try {
          accessSync(p, constants.X_OK);
          out.push(p);
        } catch {
          /* not runnable */
        }
    }
  };
  for (const root of [join(homedir(), "Library/Caches/ms-playwright"), join(homedir(), ".cache/ms-playwright")])
    look(root, 5);
  out.push(
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  );
  return out.filter((p) => p === undefined || existsSync(p));
}

// Every browser tried gives up after its own timeouts; past this, no other is tried.
const BROWSER_MS = 90000;
async function browserPage(url: string, env: NodeJS.ProcessEnv): Promise<Opened | null> {
  const chromium = await loadPlaywright(env),
    until = Date.now() + BROWSER_MS;
  for (const executablePath of chromiumCandidates(env)) {
    if (Date.now() > until) break;
    let browser: Browser | undefined;
    try {
      browser = await chromium.launch({ executablePath, headless: true, timeout: 30000 });
      const tab = await browser.newPage();
      await tab.goto(url, { waitUntil: "load", timeout: 30000 });
      await tab.waitForTimeout(3000);
      return {
        how: "browser",
        page: tab.url(),
        lines: lineList(await tab.evaluate(() => globalThis.document.body?.innerText ?? "")),
      };
    } catch {
      continue;
    } finally {
      await browser?.close();
    }
  }
  return null;
}

export async function run(argv: string[], out: Out, { folder, env = process.env }: RunContext): Promise<void> {
  const {
    positionals: [url, ...rest],
  } = argsOf(argv);
  const words = rest.join(" ").replace(/\s+/g, " ").trim();
  // Exit code 1 says the words are not on the page, so a call without them ends as any other error does, with 2.
  if (!url || !words) throw usageExit(import.meta.url, out, argv, 2);
  if (!/^https?:\/\//.test(url))
    throw new Error("Give the link as it will be in the reply, starting http:// or https://");
  const count = words.split(" ").length;
  if (count < MIN_WORDS || count > MAX_WORDS)
    throw new Error(
      `Copy ${MIN_WORDS} to ${MAX_WORDS} words from the page (${count} given): enough to show what the figure is of, not the whole page.`,
    );
  const log = openLog("source", [url, JSON.stringify(words)], out);

  const tries: Attempt[] = [];
  try {
    tries.push(await fetchPage(url));
  } catch (error) {
    const failed = error as Error & { cause?: { code?: string } };
    tries.push({ how: "fetch", error: String(failed.cause?.code ?? failed.message) });
  }
  const on = (attempt: Attempt | undefined): attempt is Opened & { lines: string[] } =>
    Boolean(attempt?.lines && holds(attempt.lines.join(" "), words));
  if (!on(tries[0]) && tries[0].how !== "pdf") {
    try {
      const opened = await browserPage(url, env);
      if (opened) tries.push(opened);
    } catch {
      tries.push({ how: "browser", error: "no browser found" });
    }
  }
  const found = tries.find(on);
  const figures = figuresOf(words);
  if (found) {
    const record = { url, page: found.page, words, how: found.how, checked: new Date().toISOString().slice(0, 10) };
    const file = sourcesFile(logFile(env, folder), folder);
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, `${JSON.stringify(record)}\n`);
    log.line(
      `On the page (${found.how}${sameLink(found.page, url) ? "" : `; the link now opens ${found.page}`}): "${words}"`,
    );
    const at = found.lines.findIndex((_, i) => holds(found.lines.slice(Math.max(0, i - 1), i + 2).join(" "), words));
    if (at >= 0)
      log.line(
        `  around it: ${found.lines
          .slice(Math.max(0, at - 1), at + 2)
          .map((line) => line.slice(0, 160))
          .join(" | ")}`,
      );
    log.line(
      "Kept for suggest.ts and note.ts. In the reply, give the publisher, the year and this link, and say what the page says the figure is for (members only, one area, one year).",
    );
    return;
  }
  for (const attempt of tries) {
    if (attempt.error !== undefined) {
      log.line(`Could not open it (${attempt.how}): ${attempt.error}`);
      continue;
    }
    const moved = sameLink(attempt.page, url) ? "" : `; the link now opens ${attempt.page}`;
    log.line(
      `Opened (${attempt.how}${attempt.status ? `, status ${attempt.status}` : ""}${moved}): ${attempt.note || `${(attempt.lines ?? []).join(" ").length} characters of text`}`,
    );
    const near = around(attempt.lines ?? [], figures);
    if (near.length)
      log.line(
        `  lines with ${figures.join(", ")}, and the lines either side:\n${near.map((line) => `    ${line}`).join("\n")}`,
      );
    else if (figures.length) log.line(`  no line has ${figures.join(", ")}`);
  }
  const browserHint = tries.some((t) => t.how === "pdf" || (t.how === "browser" && t.error === undefined))
    ? ""
    : " If the page needs a browser to show its text, install Playwright, or set PLAYWRIGHT_CORE (its folder) and CHROMIUM (the browser).";
  log.line(
    `Not on the page. Copy the words as the page has them, find the page that has them, or write "rules_not_found" (in the reply, label a figure you could not check guess).${browserHint}`,
  );
  throw new Exit(1);
}

cli(import.meta.url, run, { fails: 2 });
