// Grading one session: the files it delivered, what the judge reads, the judge, and every grader of a case. A
// session's delivered files are kept with the results, so a page can be judged again after its folder is gone.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { filesIn, hash, scoreOf, type Case, type FileTarget, type Grader, type Scored } from "./cases.ts";
import { blocksOf, entriesOf } from "./lib.ts";
import { QUIET, run, type Judge, type ResultEvent, type Runner } from "./setup.ts";

// What nxk writes in a project (its records, scans, data and the files its tools save), not something delivered to the
// owner, and left out of what the judge reads.
export const NXK_FILES =
  /(^|\/)(\.nxk\/|(nxk|suggestions|terms|open|clashes|not-clashes|pays)\.json$|(request|reply|asked)\.md$)/;
const SKIP = /(^|\/)(\.git|\.claude|node_modules)\//;
const MOST_FILES = 30;

/** A file a session delivered: its path in the work folder, and its text. */
export interface Delivered {
  path: string;
  text: string;
}

/** What a judge said of one text (judge): the majority's verdict, what it cost, and the reasons behind it. */
export interface Verdict {
  passed: boolean;
  cost: number;
  /** The model IDs that judged. */
  judgedBy: string[];
  /** Each vote: PASS, FAIL, or NONE for one that gave no verdict. */
  explanation: string;
  /** The reasons of a vote that agreed with the verdict. */
  why: string;
}

/**
 * One grader's result on a session: whether it passed and why, whether it counts in the score (`scored`) and how much
 * (`weight`); for an llm grader, the rubric it was judged under and the judge's verdict.
 */
export interface GraderResult extends Scored {
  name: string;
  type: string | undefined;
  explanation: string;
  /** What judging it cost: an llm grader's, 0 when its saved verdict stood. */
  cost?: number;
  /** An llm grader's: the rubric it was judged under, the model IDs that judged, and the reasons for the verdict. */
  rubricHash?: string;
  judgedBy?: string[];
  why?: string;
}

/** What the graders read of a session: its reply, and its transcript lines (null when they were not kept). */
export interface Graded {
  reply: string;
  trace: string[] | null;
}

/** Each file in the work folder and a hash of it, taken after the seed: what the session found there. */
export function snapshot(work: string): Record<string, string> {
  if (!existsSync(work)) return {};
  return Object.fromEntries(
    filesIn(work)
      .filter((f) => !SKIP.test(f))
      .map((f) => [
        f,
        createHash("sha256")
          .update(readFileSync(join(work, f)))
          .digest("hex")
          .slice(0, 16),
      ]),
  );
}

const textOf = (file: string) => {
  const b = readFileSync(file);
  return b.subarray(0, 8000).includes(0) ? `(a binary file of ${b.length} bytes)` : b.toString("utf8");
};

/**
 * What the session delivered, as it ended up: { path, text } with paths inside the work folder, leaving out nxk's own
 * files. That is every file it wrote with Write or Edit, and, given what the seed left (`before`, from snapshot), every
 * file it added or changed some other way (a shell command). A grader with `focus: files` (llm) or `target: files`
 * (regex) reads the reply with them; the prompt is not in it, so a figure the owner gave only passes if the session kept
 * it.
 */
export function deliveredFiles(
  lines: string[],
  work: string,
  before: Record<string, string> | null = null,
): Delivered[] | null {
  if (!existsSync(work)) return null;
  const root = realpathSync(work),
    files = new Set<string>();
  for (const e of entriesOf(lines))
    for (const p of blocksOf(e))
      if (p?.type === "tool_use" && ["Write", "Edit", "MultiEdit"].includes(p.name) && p.input?.file_path)
        files.add(resolve(work, p.input.file_path));
  if (before) for (const [f, h] of Object.entries(snapshot(work))) if (before[f] !== h) files.add(join(work, f));
  return [...new Set([...files].filter((f) => existsSync(f)).map((f) => realpathSync(f)))]
    .map((f) => ({ path: relative(root, f), file: f }))
    .filter(({ path }) => !path.startsWith("..") && !NXK_FILES.test(path) && !SKIP.test(path))
    .sort((a, b) => a.path.localeCompare(b.path))
    .slice(0, MOST_FILES)
    .map(({ path, file }) => ({ path, text: textOf(file) }));
}

/** The delivered files, kept with the results under files/<run>/ as they were. */
export function keepFiles(dir: string, files: Delivered[] | null): void {
  for (const f of files ?? []) {
    mkdirSync(dirname(join(dir, f.path)), { recursive: true });
    writeFileSync(join(dir, f.path), f.text);
  }
}
/** Delivered files kept with the results, or null when none were kept for that run. */
export const keptFiles = (dir: string): Delivered[] | null =>
  existsSync(dir) ? filesIn(dir).map((path) => ({ path, text: readFileSync(join(dir, path), "utf8") })) : null;

/**
 * Text with the work folder's path taken out, so that a path reads as the owner would see it, from the project's root,
 * and the same reply reads the same to the judge whichever temporary folder it ran in.
 */
export function blind(text: string, work: string | null): string {
  if (!work) return text;
  const paths = [work, existsSync(work) ? realpathSync(work) : null, work.replace(/^\/private(?=\/)/, "")];
  let out = String(text);
  for (const p of [...new Set(paths.filter((x): x is string => Boolean(x)))].sort((a, b) => b.length - a.length))
    out = out.split(p).join(".");
  return out;
}

/**
 * Said before a reply the owner answered during the work (evals/owner.ts), and only then, so that every judge prompt
 * for a reply in one turn reads as it did before the owner was simulated.
 */
export const CONVERSATION = [
  "The owner answered during the work: the reply below is the assistant's replies in order,",
  'with each of the owner\'s messages between lines of ---, starting "The owner replied:".',
  "What the owner said yes to there, and every fact they gave there, is theirs, as if it were in their request or their own notes;",
  "a blank they said they would fill in is theirs to fill.",
  "The files are as they stand at the end.",
].join(" ");

/** What a judge reads: the reply, and for `focus: files` each file the session delivered, by its path. */
export function judged(reply: string, files: Delivered[] | null, work: string | null = null): string {
  return blind(
    [
      ...(/^The owner replied: /m.test(reply) ? [CONVERSATION] : []),
      `<reply>\n${reply}\n</reply>`,
      ...(files ?? []).map((f) => `<file path="${f.path}">\n${f.text.slice(0, 60000)}\n</file>`),
    ].join("\n\n"),
    work,
  );
}

// Each call once: Claude Code also logs every request it sent ("api-request-blob"), holding copies of earlier calls.
export const toolsUsed = (lines: string[]): string[] => [
  ...new Map(
    entriesOf(lines)
      .filter((e) => e.type === "assistant")
      .flatMap((e) =>
        blocksOf(e)
          .filter((p) => p?.type === "tool_use")
          .map((p): [string, string] => [p.id, p.name]),
      ),
  ).values(),
];

// The judge is told what it reads and how to answer, never that nxk wrote it (evals/run.test.ts checks this).
export const JUDGE_INTRO =
  "You are grading an AI assistant's work for a business owner against a rubric: its final reply and, where they are given, the files it wrote.";
export const JUDGE_ASK =
  "Take each condition of the rubric in turn: quote the words of the reply that meet or miss it, in at most six sentences in all. " +
  "Judge the reply against the rubric as written, not against what you would have liked. Then, on the last line, write VERDICT: PASS or VERDICT: FAIL.";
const parse = (out: string): ResultEvent | null => {
  try {
    return JSON.parse(out);
  } catch {
    return null;
  }
};

/**
 * A judge's verdict on one text: `votes` judges, each giving reasons before a verdict; the majority passes. The judge
 * has no tools (one that tried to open a file named in the rubric used its only turn and gave no verdict). A vote that
 * still comes back with no verdict is asked again, up to twice; one with none after that counts as a fail and is shown.
 * A judge that did not answer at all (an error such as a usage limit, not an answer without a verdict) is no vote: it
 * throws, so the run is an error that can be filled in, never a false fail. `call` is the command runner (tests pass
 * their own).
 */
export async function judge(
  rubric: string,
  text: string,
  { model, votes }: Judge,
  call: Runner = run,
): Promise<Verdict> {
  const prompt = `${JUDGE_INTRO}\n\n<rubric>\n${rubric}\n</rubric>\n\n${text}\n\n${JUDGE_ASK}`;
  const cwd = join(tmpdir(), "nxk-evals-judge");
  mkdirSync(cwd, { recursive: true });
  const said: { pass: boolean; none: boolean; why: string }[] = [],
    models = new Set<string>();
  let cost = 0;
  const ask = async () => {
    const r = await call(
      "claude",
      [
        "-p",
        "--setting-sources",
        "project",
        "--model",
        model,
        "--tools",
        "",
        "--max-turns",
        "1",
        "--output-format",
        "json",
      ],
      { cwd, input: prompt, timeoutMs: 300000, env: { ...process.env, ...QUIET } },
    );
    const out = parse(r.out);
    cost += out?.total_cost_usd ?? 0;
    for (const m of Object.keys(out?.modelUsage ?? {})) models.add(m);
    const error = !out
      ? String(r.err || (r.timedOut ? "timed out" : "no output")).trim()
      : out.is_error
        ? String(out.result || out.api_error || out.subtype || "error")
        : null;
    // The verdict comes last, after the reasons, so that the judge does not argue for a verdict it has already given.
    const text1 = error ? "" : (out?.result ?? "");
    return { text1, error, verdict: [...text1.matchAll(/VERDICT:\s*(PASS|FAIL)/gi)].at(-1)?.[1]?.toUpperCase() };
  };
  for (let i = 0; i < votes; i++) {
    let v = await ask();
    for (let again = 0; !v.verdict && again < 2; again++) v = await ask();
    if (!v.verdict && v.error) throw new Error(`the judge did not answer: ${v.error.slice(0, 200)}`);
    said.push({
      pass: v.verdict === "PASS",
      none: !v.verdict,
      why: v.text1
        .replace(/\s*VERDICT:\s*(PASS|FAIL)\s*$/i, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(-600),
    });
  }
  const passed = said.filter((v) => v.pass).length * 2 > votes;
  return {
    passed,
    cost,
    judgedBy: [...models].sort(),
    explanation: `judge votes: ${said.map((v) => (v.none ? "NONE" : v.pass ? "PASS" : "FAIL")).join(" ")}`,
    why: said.find((v) => v.pass === passed)?.why ?? "",
  };
}

/** What an llm grader asks, as a hash: a saved verdict stands while it is unchanged. */
export const rubricHash = (g: Grader): string => hash(g.focus ?? "last_message", g.rubric);

/**
 * Every grader of a case on one session (`s`: its reply and transcript lines; `files`: what it delivered, or null when
 * that is not known). `saved` holds an earlier run's verdicts: an llm verdict whose rubric is unchanged is kept, not
 * paid for again. A grader that needs the work folder when it is gone keeps its saved verdict, or says so.
 */
export async function grade(
  c: Pick<Case, "graders">,
  work: string,
  s: Graded,
  opts: Judge,
  saved: GraderResult[] = [],
  files: Delivered[] | null = null,
): Promise<GraderResult[]> {
  const results: GraderResult[] = [],
    here = Boolean(work && existsSync(work));
  for (const g of c.graders) {
    // Only graders of the result count in the score; process graders (how nxk ran) are shown apart.
    const base = {
      name: g.name,
      type: g.type,
      weight: Number(g.weight ?? 1),
      scored: !g.process,
      process: Boolean(g.process),
    };
    const before = saved.find((x) => x.name === g.name && x.type === g.type);
    const gone = () =>
      results.push(
        before ? { ...before, ...base } : { ...base, passed: false, explanation: "the work folder is gone" },
      );
    if (g.type === "llm") {
      const asks = rubricHash(g);
      if (before?.rubricHash === asks) results.push({ ...before, ...base, cost: 0 });
      else if (g.focus === "files" && files === null) gone();
      else
        results.push({
          ...base,
          rubricHash: asks,
          ...(await judge(g.rubric, judged(s.reply, g.focus === "files" ? files : [], work), opts)),
        });
      continue;
    }
    // What a grader reads (the transcript, the work folder or the kept files) may be gone from an earlier run.
    const t = g.target ?? "last_message";
    const fromFile = typeof t === "object" && t.source === "file";
    const keptText = fromFile ? files?.find((f) => f.path === t.path)?.text : undefined;
    const needs =
      g.type === "tool_used" || t === "trace"
        ? s.trace
        : g.type === "file_exists" || (fromFile && keptText === undefined)
          ? here
          : t === "files"
            ? files
            : true;
    if (!needs) {
      gone();
      continue;
    }
    if (g.type === "file_exists") {
      // A file_exists grader names its file (case data).
      const path = g.path as string;
      results.push({ ...base, passed: existsSync(join(work, path)), explanation: path });
      continue;
    }
    if (g.type === "regex") {
      // What it reads is there (`needs`, above).
      const text =
        t === "trace"
          ? (s.trace as string[]).join("\n")
          : t === "files"
            ? [s.reply, ...(files as Delivered[]).map((f) => f.text)].join("\n\n")
            : fromFile
              ? here && existsSync(join(work, t.path))
                ? readFileSync(join(work, t.path), "utf8")
                : (keptText ?? null)
              : s.reply;
      const passed = text !== null && new RegExp(String(g.pattern), String(g.flags ?? "")).test(text);
      results.push({
        ...base,
        passed,
        // Only a file read can find nothing.
        explanation: text === null ? `no file ${(t as FileTarget).path}` : passed ? "matched" : "pattern not found",
      });
      continue;
    }
    if (g.type === "tool_used") {
      const n = toolsUsed(s.trace as string[]).filter((name) => name === g.tool).length,
        min = Number(g.min ?? 1),
        max = g.max === undefined ? Infinity : Number(g.max);
      results.push({ ...base, passed: n >= min && n <= max, explanation: `${g.tool} called ${n}x` });
      continue;
    }
    results.push({ ...base, scored: false, passed: false, explanation: `grader type ${g.type} not supported here` });
  }
  return results;
}

/** The code that grades, as a hash: a saved verdict was given under it. */
export const judgeCode = (): string =>
  hash(JUDGE_INTRO, JUDGE_ASK, CONVERSATION, judge.toString(), grade.toString(), judged.toString(), scoreOf.toString());

export const failed = (graders: GraderResult[]): string =>
  graders
    .filter((g) => g.scored && !g.passed)
    .map((g) => ` | ${g.name}: ${g.explanation}`)
    .join("");
