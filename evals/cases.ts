// The eval cases as run.ts reads them: each folder's prompt, settings and graders, the hashes that say what a session
// saw and what a judge reads, and which cases a run takes. Every case sends one of nxk's commands (WAYS_IN), since nxk
// runs only when the owner asks.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const HERE = dirname(fileURLToPath(import.meta.url));

/** How every session runs (SESSION). */
export interface Session {
  /** The model alias asked for, or null for Claude Code's own default. */
  model: string | null;
  permissionMode: string;
  maxTurns: number;
  timeoutSeconds: number;
  /** The plugin's scan_budget setting, in US dollars. */
  scanBudget: number;
}

/** The kinds of output a case can be tagged with (output-<kind>): one for each of nxk's ways in (WAYS_IN). */
export type Kind = "research" | "look" | "meet";
/** nxk's subagents, by the name a session's work is split by (NXK_AGENTS, and evals/depth.ts nxkSplit). */
export type NxkAgent = "secondLook" | "research" | "panel";

/** One of nxk's ways in: the command the owner types, and the subagent it hands the work to. */
export interface WayIn {
  command: string;
  agent: NxkAgent;
}

/** A value in front matter: a word or a quoted string, a number, a list [a, b] or a map { k: v }. */
export type FrontValue = string | number | FrontValue[] | { [key: string]: FrontValue };
/** Front matter, by key. */
export type Front = Record<string, FrontValue>;

/** prompt.md's front matter as the runner reads it: its tags (output-<kind>, serious-<grader>, no-key) above all. */
export interface CaseMeta {
  tags?: string[];
  [key: string]: FrontValue | undefined;
}

/** What a regex grader reads from one file: `target: { source: file, path: ... }`. */
export interface FileTarget {
  source: string;
  path: string;
}

/** A grader file's front matter: its type, and what that type reads. */
export interface GraderMeta {
  /** llm, regex, tool_used or file_exists. */
  type?: string;
  weight?: number;
  /** For an llm grader, files: the judge reads the delivered files with the reply. */
  focus?: string;
  /** What a regex or tool grader reads: the reply (last_message), the trace, the delivered files, or one file. */
  target?: string | FileTarget;
  /** A regex grader's pattern and flags. */
  pattern?: string;
  flags?: string;
  /** A tool grader's tool, and how many calls to it pass. */
  tool?: string;
  min?: number;
  max?: number;
  /** A file_exists grader's file. */
  path?: string;
}

/**
 * A case's grader, from its file under graders/: its front matter (its type, and what that type reads: a rubric, a
 * pattern, a target, a tool), whether it judges how the work was made (process), and whether a miss is serious.
 */
export interface Grader extends GraderMeta {
  name: string;
  process: boolean;
  serious: boolean;
  rubric: string;
}

/** One case folder, as readCase reads it. */
export interface Case {
  name: string;
  dir: string;
  prompt: string;
  meta: CaseMeta;
  /** The kind of output it is tagged with (output-<kind>), or null. */
  output: string | null;
  graders: Grader[];
  /** Its seed script, or null. */
  seed: string | null;
  /** The case as a whole: what the session saw, what the owner answers from, and what the judges read. */
  hash: string;
  /** What the session saw. */
  askHash: string;
}

/** What the score reads of a grader's result (grade.ts). */
export interface Scored {
  scored: boolean;
  process: boolean;
  weight: number;
  passed: boolean;
}

// One setup for every case, as near a real Claude Code session as a run with nobody at the keyboard can be: every
// built-in tool, in auto mode, where a classifier approves or blocks each action as a careful person would. A list of
// tools for each case would refuse whatever asks for permission (Python, most shell commands, web pages), which a
// person at the keyboard would allow. The model is Claude Code's own default (null: no --model is chosen), resolved to
// its exact model ID when a run starts and pinned for every session of the run. A case that sets any of this is refused
// (readCase).
// scanBudget: the plugin's scan_budget setting, in US dollars, as someone who installed nxk with a key would set it once,
// so that a request never has to grant a budget for scans itself (a prompt never asks nxk's question for it).
export const SESSION: Session = {
  model: null,
  permissionMode: "auto",
  maxTurns: 80,
  timeoutSeconds: 2400,
  scanBudget: 1,
};
// The judge is the grader, not what is tested: one fixed model ID, so scores stay comparable from run to run.
export const JUDGE_MODEL = "claude-sonnet-5-5";
const PER_CASE = ["model", "max_turns", "timeout_seconds", "allowed_tools"];
/**
 * nxk's subagents, as a session hands work to them, each started only by the owner's command (WAYS_IN): the second
 * look, the researcher and the panel.
 */
export const NXK_AGENTS: Record<NxkAgent, string> = {
  secondLook: "nxk:second-look",
  research: "nxk:researcher",
  panel: "nxk:panel",
};
/**
 * nxk's three ways in, by the kind of output a case that uses one is tagged with (output-<kind>): the command the owner
 * types, which the case's prompt starts with, and the subagent it hands the work to (a key of NXK_AGENTS).
 */
export const WAYS_IN: Record<Kind, WayIn> = {
  research: { command: "/nxk:research", agent: "research" },
  look: { command: "/nxk:look", agent: "secondLook" },
  meet: { command: "/nxk:meet", agent: "panel" },
};
/** The command a prompt starts with (/nxk:look, say), or null. */
export const commandOf = (prompt: string | null | undefined): string | null =>
  /^\/[\w:.-]+(?=\s|$)/.exec(String(prompt ?? "").trim())?.[0] ?? null;
/**
 * A case's owner's goals: a short paragraph the simulated owner decides offers by (evals/owner.ts). It is part of the
 * case's hash, since the owner's answers change what a session does.
 */
export const OWNER_GOALS = "graders/source/owner.md";

/** The value of one frontmatter line: a list [a, b], a map { k: v }, a quoted string, a number or a bare word. */
export function valueOf(raw: string): FrontValue {
  const v = raw.trim();
  if (v.startsWith("[") && v.endsWith("]"))
    return v
      .slice(1, -1)
      .split(",")
      .map((s) => valueOf(s))
      .filter((s) => s !== "");
  if (v.startsWith("{") && v.endsWith("}"))
    return Object.fromEntries(
      v
        .slice(1, -1)
        .split(",")
        .map((s) => s.split(":"))
        .map(([k, ...rest]) => [k.trim(), valueOf(rest.join(":"))]),
    );
  if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
  if (v.startsWith('"') && v.endsWith('"')) return JSON.parse(v);
  return v !== "" && Number.isFinite(Number(v)) ? Number(v) : v;
}

/** A markdown file with frontmatter: { meta, body }. */
export function readFront(text: string): { meta: Front; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  if (!m) return { meta: {}, body: text.trim() };
  const meta: Front = {};
  for (const line of m[1].split("\n")) {
    const at = line.indexOf(":");
    if (at > 0 && !/^\s/.test(line)) meta[line.slice(0, at).trim()] = valueOf(line.slice(at + 1));
  }
  return { meta, body: m[2].trim() };
}

export const hash = (...parts: string[]): string =>
  createHash("sha256").update(parts.join("\0")).digest("hex").slice(0, 16);

/** The files under `dir`, sorted, as paths relative to it. */
export function filesIn(dir: string, base = dir): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? filesIn(join(dir, e.name), base) : [relative(base, join(dir, e.name))]))
    .sort();
}

/**
 * A hash of every file in a folder, names and contents: any change to a case changes it.
 * @param keep  which files count, by their path relative to `dir`
 */
export const folderHash = (dir: string, keep: (file: string) => boolean = () => true): string =>
  hash(
    ...filesIn(dir)
      .filter(keep)
      .flatMap((f) => [f, readFileSync(join(dir, f), "latin1")]),
  );

/** One case folder: its prompt and settings, its graders, its seed script if any, and the hash of all of it. */
export function readCase(dir: string): Case {
  // The front matter as the runner reads it: tags are a list of words.
  const { meta, body } = readFront(readFileSync(join(dir, "prompt.md"), "utf8")) as { meta: CaseMeta; body: string };
  const own = PER_CASE.filter((key) => key in meta);
  if (own.length)
    throw new Error(
      `${dir.split("/").pop()}: ${own.join(", ")} ${own.length > 1 ? "are" : "is"} the same for every case (SESSION in evals/cases.ts), not set in prompt.md`,
    );
  const caseFile = join(dir, "case.yaml"),
    seed = existsSync(caseFile) && /scaffold_script:\s*(\S+)/.exec(readFileSync(caseFile, "utf8"))?.[1];
  // graders/ judge the result (the score); graders/process/ judge how it was made (shown apart).
  const gradersIn = (sub: string, process: boolean) =>
    existsSync(join(dir, sub))
      ? readdirSync(join(dir, sub))
          .filter((f) => f.endsWith(".md"))
          .sort()
          .map((f) => {
            const g = readFront(readFileSync(join(dir, sub, f), "utf8"));
            return { name: f.replace(/\.md$/, ""), ...(g.meta as GraderMeta), process, rubric: g.body };
          })
      : [];
  // A serious miss: an outcome grader whose failure means the owner would act on something that misleads them or the
  // people they serve (a badly wrong figure about people, a forecast passed off as known, a change made to their work
  // without their yes). Tagged serious-<grader> in prompt.md: `claude plugin eval` takes no keys in a grader's front
  // matter but its own, and takes any tag.
  const serious = (meta.tags ?? []).map(String).filter((t) => t.startsWith("serious-"));
  const graders: Grader[] = [...gradersIn("graders", false), ...gradersIn(join("graders", "process"), true)].map(
    (g) => ({
      ...g,
      serious: !g.process && serious.includes(`serious-${g.name}`),
    }),
  );
  const stray = serious.filter((t) => !graders.some((g) => g.serious && t === `serious-${g.name}`));
  if (stray.length) throw new Error(`${dir.split("/").pop()}: ${stray.join(", ")} names no grader of the result`);
  const output = (meta.tags ?? []).find((t) => String(t).startsWith("output-"))?.slice("output-".length) ?? null;
  // What the session saw: every file but the graders, and prompt.md without its description and tags, which are for the
  // reader and for --tag (only no-key, which hides the keys, reaches the session). A reply can be judged again under new
  // graders only while this is unchanged.
  const front = readFileSync(join(dir, "prompt.md"), "utf8").replace(/^(?:description|tags):.*\n/gm, "");
  const askHash = hash(
    folderHash(dir, (f) => !f.startsWith("graders/") && f !== "prompt.md"),
    front,
    (meta.tags ?? []).includes("no-key") ? "no-key" : "",
  );
  // The case as a whole: what the session saw, what the simulated owner answers from (their goals and what they know,
  // evals/owner.ts) and what the judges of one result read; not the examples that calibrate the judges.
  const caseHash = hash(
    askHash,
    folderHash(dir, (f) => f.startsWith("graders/") && !f.startsWith("graders/calibration/")),
  );
  return {
    name: dir.split("/").pop()!,
    dir,
    prompt: body,
    meta,
    output,
    graders,
    seed: seed ? join(dir, seed) : null,
    hash: caseHash,
    askHash,
  };
}

/** The share of the score a run earns: the weighted graders of the result that are scored (grade.ts). */
export function scoreOf(results: Scored[]): number {
  const counted = results.filter((r) => r.scored && !r.process);
  const total = counted.reduce((s, r) => s + r.weight, 0);
  return total ? counted.reduce((s, r) => s + (r.passed ? r.weight : 0), 0) / total : 1;
}

/** The cases a run takes: --case takes one glob or several, comma-separated; --tag keeps the cases with that tag. */
export function selectCases(
  { case: pattern = "*", tag = null }: { case?: string; tag?: string | null } = {},
  dir = HERE,
): Case[] {
  const globs = String(pattern)
    .split(",")
    .map(
      (g) =>
        new RegExp(
          `^${g
            .trim()
            .replace(/[.+^${}()|[\]\\]/g, "\\$&")
            .replace(/\*/g, ".*")
            .replace(/\?/g, ".")}$`,
        ),
    );
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(dir, e.name, "prompt.md")) && globs.some((g) => g.test(e.name)))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => readCase(join(dir, e.name)))
    .filter((c) => !tag || (c.meta.tags ?? []).includes(String(tag)));
}
