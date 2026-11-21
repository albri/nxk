#!/usr/bin/env node
// Runs the eval cases as real Claude Code sessions with nxk, on your own keys, and grades them. nxk runs only when the
// owner asks, so every case sends one of its commands (/nxk:research, /nxk:look or /nxk:meet) and checks that nxk
// behaves when asked. Each session is `claude -p` in an empty folder outside this repository, with project settings only
// (your own plugins, skills and MCP servers stay out, and so do claude.ai connectors), and this repository loaded with
// `--plugin-dir`. A scan still running when a turn ends is waited for, and the session is resumed once it has finished,
// as a person coming back would; then a simulated owner (owner.ts) answers what the reply puts to them, and the session
// is resumed with that, at most twice. evals/README.md says what each part of a case does and what a run reports.
//
//   node evals/run.ts [--case=<glob>[,<glob>...]] [--tag=<tag>] [--repeat=3] [--jobs=3] [--max-usd=25] [--judge=<model>]
//                      [--votes=3] [--plan] [--costs-from=<dir>] [--no-owner] [--allow-uncommitted]
//   node evals/run.ts --fill=evals/results/<time>      rerun only the runs that failed there, keep the rest
//   node evals/run.ts --reuse=evals/results/<time>     take unchanged runs from there instead of paying again
//   node evals/run.ts --rejudge=evals/results/<time>   grade the saved replies and files again under today's graders
//   node evals/run.ts --agreement=evals/results/<time> [--sample=12]   regrade a sample twice: do the verdicts agree?
//   node evals/run.ts --calibrate [--graders=<case>/<grader>,...]   judge each llm grader's pass and fail examples
//   node evals/run.ts --calibrate=owner          check only the simulated owner's decisions on its examples
//
// Before any session the run finds Claude Code's default model and pins its exact ID for every session (the judge is
// fixed, JUDGE_MODEL), prints what the run should cost on it (--plan stops there), and refuses to start while the
// plugin or the people files have uncommitted changes (allow it for development with --allow-uncommitted). Jobs go case
// by case, each case's repeats together in time; the spending limit is checked only when a case starts, so every case
// keeps every repeat it started.
//
// A run that errored, timed out, whose session could see what it should not (no nxk tools or subagents, a connector,
// another model), or whose scans the decision model's account or key stopped (no credit, the daily quota, a refused key)
// is recorded as a failure, not a score. --fill reruns those failures and the runs a spending limit skipped, on the same
// setup, and writes one combined result. So that a run with research does not start on an account or key that cannot
// answer, it asks the decision model for one test answer first (a fraction of a cent).
//
// Sessions, judges and scans are paid on your account, and all three count towards --max-usd. Results go to
// evals/results/<time>/ (git ignores it): results.json, with the setup every run had; replies.md, every case's reply;
// traces/, each session's transcript; and files/, the files each session delivered, so a page can be judged again after
// its work folder is gone. The setup records this repository's commit, the people files, Claude Code's version at the
// start and the end, the model IDs, the decision model and tier (never a key), the judge, and hashes of the code that
// runs and grades a session. --reuse takes a run from an earlier result when nothing it depends on has changed: the
// case, Claude Code, the session model and code, the judge, this repository, the people files and the decision model.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, type Dirent } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { argsOf, isMain } from "../scripts/cli.ts";
import type { Route } from "../scripts/decision-model.ts";
import { runningScan, type RunningScan } from "../scripts/product.ts";
import type { SavedAnswer } from "../scripts/scan.ts";
import { commandOf, filesIn, HERE, hash, JUDGE_MODEL, scoreOf, selectCases, SESSION, type Case } from "./cases.ts";
import { decisionStop, preflight } from "./decision.ts";
import {
  depthOf,
  handedOf,
  nxkLine,
  nxkSplit,
  repeats,
  runName,
  shallow,
  table,
  traceFile,
  traceOf,
  type Depth,
  type DepthRow,
  type NxkSplit,
} from "./depth.ts";
import {
  deliveredFiles,
  failed,
  grade,
  judge,
  judgeCode,
  keepFiles,
  keptFiles,
  snapshot,
  type Delivered,
  type GraderResult,
} from "./grade.ts";
import { entriesOf, linesOf, money, type Block, type Entry } from "./lib.ts";
import {
  calibrationExamples,
  calibrationMisses,
  conversationOf,
  ownerFiles,
  ownerTally,
  ownerTurn,
  OWNER_TURNS,
  placeholdersIn,
  type After,
  type Exchange,
  type OwnerRound,
  type OwnerTally,
  type OwnerTurn,
} from "./owner.ts";
import {
  claudeVersion,
  contamination,
  envFor,
  eventsOf,
  resolveModel,
  ROOT,
  run,
  setupOf,
  toolsOf,
  unlike,
  type InitEvent,
  type Judge,
  type Plain,
  type Setup,
  type Tools,
} from "./setup.ts";
import {
  agreementLines,
  byKind,
  caseLines,
  costOf,
  expectedCost,
  failureLines,
  JUDGE_PER_GRADER,
  ownerLines,
  processLines,
  repliesOf,
  toolErrors,
  type AgreementRow,
  type SeriousOf,
} from "./summary.ts";

const NXK_TOOLS = "mcp__plugin_nxk_nxk__*";
const COME_BACK = "I'm back. Has it finished? Carry on, and give me your answer.";
// The flags a run takes; any other stops it before anything is paid for.
const FLAGS = [
  "case",
  "tag",
  "repeat",
  "jobs",
  "max-usd",
  "judge",
  "votes",
  "plan",
  "costs-from",
  "no-owner",
  "allow-uncommitted",
  "fill",
  "reuse",
  "rejudge",
  "agreement",
  "sample",
  "calibrate",
  "graders",
];

/** What the scans saved under a folder cost and hold (scanSpend), and the lines that could not be read. */
export interface ScanSpend {
  usd: number;
  answers: number;
  unreadable: number;
}

/**
 * One turn of a session: what it came after and what the owner said, the reply and where it was read from (the
 * transcript, or Claude Code's result when the transcript holds no such turn), what it cost and how many turns it
 * took, whether it timed out or broke off, and the tools auto mode blocked.
 */
export interface Turn extends Exchange {
  replyFrom?: "transcript" | "result";
  cost: number;
  turns: number;
  timedOut: boolean;
  error: string | null;
  denied: string[];
}

/**
 * A turn as the session's transcript holds it (messagesOf): the message that started it, what the session did in its
 * own context until the next one, and the text it wrote there, block by block.
 */
export interface Message {
  text: string;
  entries: Entry[];
  texts: string[];
}

/** What one session came to (session). */
interface SessionResult {
  turns: Turn[];
  /** The conversation, as the graders and the judge read it (conversationOf). */
  reply: string;
  owner: OwnerRound[];
  ownerCost: number;
  cost: number;
  scans: ScanSpend;
  models: string[];
  trace: string[];
  init: InitEvent | null;
  files: Delivered[] | null;
}

/** Why a run is a failure, not a score. */
export type Failure = "error" | "timeout" | "contamination";

/** A failed run's failure, and what it said. */
interface Failed {
  failure: Failure;
  error: string;
}

/**
 * A run as results.json keeps it. Only its case is always there: a skipped run has none of a session's fields, a run
 * that broke off none of its grading, and a run kept from an earlier version of this runner may lack the newer ones.
 */
export interface RunRecord {
  case: string;
  /** Which repeat, when a case ran more than once. */
  rep?: number;
  /** Which attempt, when --fill ran it again. */
  attempt?: number;
  caseHash?: string;
  askHash?: string;
  /** "hidden" for a case tagged no-key, else "yours". */
  keys?: "hidden" | "yours";
  /** The share of the score it earned (scoreOf); none for a failure. */
  score?: number;
  failure?: Failure;
  error?: string;
  /** Why it was not run (the spending limit). */
  skipped?: string;
  tools?: Tools | null;
  /** What the session cost, its judges, its scans and the simulated owner. */
  cost?: number;
  judgeCost?: number;
  scans?: ScanSpend;
  ownerCost?: number;
  models?: string[];
  seconds?: number;
  turns?: Omit<Turn, "reply">[];
  reply?: string;
  owner?: OwnerRound[];
  ownerTally?: OwnerTally;
  nxk?: NxkSplit;
  /** The work folder it ran in. */
  work?: string;
  graders?: GraderResult[];
  depth?: Depth;
  toolErrors?: number;
  /** The results folder it was taken from by --reuse. */
  reusedFrom?: string;
}

/** A run with a score. */
export type ScoredRun = RunRecord & { score: number };

/** The flags a run started with, kept in its setup: a fill runs with the same. */
export interface RunFlags {
  case?: string;
  tag?: string | null;
  maxUsd: number;
  reuse?: string | null;
  repeat?: number;
  /** The results a fill filled in. */
  fill?: string;
}

/** A fill of an earlier result: from which, when, what was spent before, and the runs it ran again and why. */
export interface Fill {
  from: string;
  at: string;
  spentBefore: number;
  rerun: { run: string; why: string; error?: string }[];
}

/** The setup a run keeps (setupOf), with what the run adds as it goes. */
export interface RunSetup extends Setup {
  /** The decision model's test answer before any session. */
  preflight?: { model: string; route: Route; usd: number };
  flags?: RunFlags;
  fills?: Fill[];
  /** Claude Code's version at the end, and whether it changed during the run. */
  claudeAtEnd?: string;
  versionChanged?: boolean;
  /** When the runs were last judged again (--rejudge). */
  rejudged?: string;
}

/** results.json: the run's time stamp, its work folders, its setup, what it spent, and its runs. */
export interface Results {
  stamp: string;
  works: string;
  setup?: RunSetup;
  spent: number;
  runs: RunRecord[];
}

/** One job of a run: a case, and which repeat. */
export interface Job<C = Case> {
  c: C;
  rep: number | undefined;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Where a run's delivered files are kept in a results folder. */
const filesDir = (dir: string, r: Pick<RunRecord, "case" | "rep">) =>
  join(dir, "files", traceFile(r).replace(/\.jsonl$/, ""));

/** The folders under `dir` (a few levels down) that hold nxk scans. */
function scanDirs(dir: string, depth = 4) {
  const out: string[] = [];
  const walk = (d: string, n: number) => {
    let entries: Dirent[];
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries)
      if (e.isDirectory()) {
        if (e.name === ".nxk") {
          if (existsSync(join(d, ".nxk", "scans"))) out.push(join(d, ".nxk", "scans"));
        } else if (n < depth && e.name !== ".git" && e.name !== "node_modules") walk(join(d, e.name), n + 1);
      }
  };
  walk(dir, 0);
  return out;
}

/** What the scans saved under `dir` cost and how many answers they hold: each request's cost is on its first row. */
export function scanSpend(dir: string): ScanSpend {
  const spend = { usd: 0, answers: 0, unreadable: 0 };
  for (const scans of scanDirs(dir))
    for (const f of filesIn(scans).filter((name) => /(^|\/)scan-[^/]*\.jsonl$/.test(name))) {
      for (const line of linesOf(join(scans, f))) {
        let row: SavedAnswer;
        try {
          row = JSON.parse(line);
        } catch {
          spend.unreadable++;
          continue;
        }
        spend.usd += Number(row.usd ?? 0);
        spend.answers++;
      }
    }
  return spend;
}

/**
 * The session's transcript lines, found by id under ~/.claude/projects, then those of each subagent it ran (nxk's
 * second look, researcher and panel among them), which Claude Code keeps beside it in <id>/subagents/. Their lines say
 * isSidechain.
 */
export function transcriptOf(ids: string[], base = join(homedir(), ".claude", "projects")): string[] {
  const lines: string[] = [],
    agents: string[] = [];
  for (const project of existsSync(base) ? readdirSync(base) : [])
    for (const id of ids) {
      const file = join(base, project, `${id}.jsonl`);
      if (existsSync(file)) lines.push(...linesOf(file));
      const sub = join(base, project, id, "subagents");
      if (existsSync(sub))
        for (const f of readdirSync(sub).sort()) if (f.endsWith(".jsonl")) agents.push(...linesOf(join(sub, f)));
    }
  return [...new Set([...lines, ...agents])];
}

/** The parts of a transcript entry's message: its content as a list. */
const partsOf = (e: Entry): Block[] => {
  const c = e.message?.content;
  return typeof c === "string" ? [{ type: "text", text: c }] : ([] as Block[]).concat(c ?? []);
};
const textOf = (e: Entry) =>
  partsOf(e)
    .filter((p) => p?.type === "text")
    .map((p) => p.text)
    .join("\n");
/**
 * Whether a transcript entry is a message that starts a turn: one the owner sent (the request, an answer, coming back
 * to a scan), in the session's own context. Not a tool's result, nor what Claude Code adds itself: a Stop hook's
 * feedback, a reminder or a command's instructions (all isMeta), nor a background agent's notice (<task-notification>).
 */
const startsTurn = (e: Entry) =>
  e.type === "user" &&
  !e.isMeta &&
  !partsOf(e).some((p) => p?.type === "tool_result") &&
  !/^\s*<task-notification>/.test(textOf(e));

/**
 * The session's turns as its transcript holds them, in order: the message that started each (`text`), what the session
 * did in its own context until the next one (`entries`), and the text it wrote there, block by block (`texts`). A Stop
 * hook's continuation, a tool's result or a background agent's notice stays in the turn it came in. Subagents' lines
 * (isSidechain) are left out: what nxk's subagents write reaches the owner only through the session.
 */
export function messagesOf(lines: string[]): Message[] {
  const out: Message[] = [];
  for (const e of entriesOf(lines)) {
    if (e.isSidechain || (e.type !== "user" && e.type !== "assistant")) continue;
    if (startsTurn(e)) out.push({ text: textOf(e), entries: [], texts: [] });
    else if (out.length) {
      const turn = out[out.length - 1];
      turn.entries.push(e);
      if (e.type === "assistant")
        for (const p of partsOf(e)) if (p?.type === "text" && p.text.trim()) turn.texts.push(p.text.trim());
    }
  }
  return out;
}

/**
 * The first words of a message as its transcript holds them: the first line, up to 80 characters. A slash command
 * (/nxk:research ...) is kept as its name and arguments apart, so its arguments are what is looked for.
 */
export const headOf = (input: string | null | undefined): string =>
  String(input ?? "")
    .trim()
    .replace(/^\/[\w:.-]+\s+/, "")
    .split("\n")[0]
    .slice(0, 80)
    .trim();

/**
 * A turn's reply: all the text the session wrote in its own context in the turn that `input` started, in order, as
 * the owner reads it in Claude Code. Claude Code's result holds only the last text block, so it misses an answer
 * written before the session hands it to one of nxk's subagents, and is empty when a turn ends waiting on a background
 * agent and the session answers once it reports. Text written after a Stop hook sent the session back is part of the
 * turn. A slash command's turn is only ever the one that names the command: a later message that repeats its arguments
 * (an owner's answer naming the same file) is not taken for it. Empty when the input is not found, so an earlier turn's
 * words are never taken for this one's.
 */
export function turnText(lines: string[], input: string): string {
  const head = headOf(input),
    command = commandOf(input);
  const messages = messagesOf(lines).filter(
    (m) => !command || m.text.includes(`<command-name>${command}</command-name>`),
  );
  // A command whose arguments are not found as typed (kept escaped, say) is found by its name.
  const turn = (head ? messages.findLast((m) => m.text.includes(head)) : null) ?? (command ? messages.at(-1) : null);
  return (turn?.texts ?? []).join("\n\n");
}

/**
 * One case: seed the folder, run the session on the pinned model with nxk (and come back once a background scan ends),
 * let the simulated owner answer, keep the trace and what the session could use.
 * @param owner  the simulated owner's model; null when no owner answers
 */
async function session(
  c: Case,
  work: string,
  model: string,
  owner: { model: string } | null = null,
): Promise<SessionResult> {
  mkdirSync(work, { recursive: true });
  if (c.seed) {
    const s = await run("bash", [c.seed], { cwd: work });
    if (s.code !== 0) throw new Error(`${c.name}: seed failed: ${s.err.slice(0, 300)}`);
  } else await run("git", ["init", "-q"], { cwd: work });
  const seeded = snapshot(work);
  const base = [
    "-p",
    "--setting-sources",
    "project",
    "--model",
    model,
    "--permission-mode",
    SESSION.permissionMode,
    "--max-turns",
    String(SESSION.maxTurns),
    "--output-format",
    "stream-json",
    "--verbose",
    "--allowedTools",
    NXK_TOOLS,
    "--plugin-dir",
    ROOT,
  ];
  const timeoutMs = 1000 * SESSION.timeoutSeconds,
    env = envFor(c.meta);
  const turns: Turn[] = [],
    ids: string[] = [],
    models = new Set<string>(),
    before = scanSpend(work);
  let init: InitEvent | null = null;
  // The owner comes back only for a scan the session started: a scan the seed left running is the case's state (one
  // that tests the session says it is still running), and waiting it out would grade a later reply than the case meant.
  const idOf = (s: RunningScan) => `${s.file}:${s.pid}`,
    already = new Set(
      scanDirs(work)
        .map(runningScan)
        .filter((s) => s !== null)
        .map(idOf),
    );
  const started = () =>
    scanDirs(work)
      .map(runningScan)
      .filter((s): s is RunningScan => s !== null && !already.has(idOf(s)));
  // What the owner knows, for the simulated owner's answers (evals/owner.ts): their request as they typed it, command
  // and all, their goals and the facts only they know.
  const knows = owner ? { request: c.prompt, ...ownerFiles(c.dir) } : null,
    rounds: OwnerTurn[] = [];
  let r = await run("claude", base, { cwd: work, input: c.prompt, timeoutMs, env }),
    after: After = "request",
    said: string | null = null,
    input = c.prompt,
    comeBacks = 0;
  for (;;) {
    const { init: first, result: out } = eventsOf(r.out);
    init ??= first;
    // The reply is all the session wrote in its own context this turn, from its transcript (turnText): Claude Code's
    // result holds only the last block, which misses what was written before a hand-off to a subagent and is empty when
    // the turn ended waiting on a background agent. The result stands in only when the transcript holds no such turn.
    const whole = out?.session_id ? turnText(transcriptOf([...ids, out.session_id]), input) : "";
    // An error that ends the session before it answers is a failure; running out of turns is the session's own result.
    const broke = !out || (out.is_error && out.subtype !== "error_max_turns");
    // What auto mode blocked is kept with the turn: a blocked action changes what a session could do.
    turns.push({
      after,
      ...(said ? { said } : {}),
      reply: whole || out?.result || "",
      replyFrom: whole ? "transcript" : "result",
      cost: out?.total_cost_usd ?? 0,
      turns: out?.num_turns ?? 0,
      timedOut: r.timedOut,
      error: broke ? String(out?.result || out?.subtype || r.err || "no result").slice(0, 300) : null,
      denied: (out?.permission_denials ?? []).map((d) => d.tool_name),
    });
    for (const m of Object.keys(out?.modelUsage ?? {})) models.add(m);
    if (out?.session_id) ids.push(out.session_id);
    if (r.timedOut || broke || !out?.session_id) break;
    const id = out.session_id;
    const resume = (input: string) => run("claude", [...base, "--resume", id], { cwd: work, input, timeoutMs, env });
    // A scan the session started comes first: the owner comes back once it has finished, at most twice.
    if (started().length && comeBacks < 2) {
      comeBacks++;
      const until = Date.now() + timeoutMs;
      while (started().some((s) => s.alive) && Date.now() < until) await sleep(15000);
      [r, after, said, input] = [await resume(COME_BACK), "come-back", null, COME_BACK];
      continue;
    }
    // Then the owner reads the reply and the work, and answers what it puts to them (evals/owner.ts).
    if (!owner || !knows || rounds.filter((x) => x.message).length >= OWNER_TURNS) break;
    const files = deliveredFiles(transcriptOf(ids), work, seeded);
    const turn = await ownerTurn(
      {
        ...knows,
        reply: turns[turns.length - 1].reply,
        placeholders: placeholdersIn(files),
        said: rounds.map((x) => x.message).filter((m): m is string => Boolean(m)),
      },
      owner,
    );
    rounds.push(turn);
    if (!turn.message) break;
    // Only blanks the owner will fill in themselves: said, with nothing for the session to do, so no turn is paid for.
    if (!turn.resume) {
      turns.push({
        after: "owner",
        said: turn.message,
        reply: "",
        cost: 0,
        turns: 0,
        timedOut: false,
        error: null,
        denied: [],
      });
      break;
    }
    [r, after, said, input] = [await resume(turn.message), "owner", turn.message, turn.message];
  }
  // Scans a seed saved before the session are not the session's spending.
  const spentAfter = scanSpend(work),
    scans = {
      usd: spentAfter.usd - before.usd,
      answers: spentAfter.answers - before.answers,
      unreadable: spentAfter.unreadable,
    };
  const trace = transcriptOf(ids);
  return {
    turns,
    reply: conversationOf(turns),
    owner: rounds.map(({ decisions, message, cost, asked }) => ({ asked, decisions, message, cost })),
    ownerCost: rounds.reduce((a, x) => a + (x.cost ?? 0), 0),
    cost: turns.reduce((s, t) => s + t.cost, 0),
    scans,
    models: [...models].sort(),
    trace,
    init,
    files: deliveredFiles(trace, work, seeded),
  };
}

/** A run whose scans the decision model's account or key stopped measured nxk without them: an error, not a score. */
const scanStopped = (trace: string[]): Failed | null => {
  const said = decisionStop(trace);
  return said ? { failure: "error", error: `the decision model stopped the scans: ${said}` } : null;
};

/**
 * Why a session's run is a failure, not a score: it timed out, broke off, could see what it should not, or had its
 * scans stopped by the decision model's account or key.
 */
function failureOf(s: SessionResult, model: string, plain: Plain | null = null): Failed | null {
  if (s.turns.some((t) => t.timedOut))
    return { failure: "timeout", error: `timed out after ${SESSION.timeoutSeconds} s` };
  const broke = s.turns.find((t): t is Turn & { error: string } => Boolean(t.error));
  if (broke) return { failure: "error", error: broke.error };
  const seen = contamination(s.init, model, plain);
  if (seen.length) return { failure: "contamination", error: seen.join("; ") };
  return scanStopped(s.trace);
}

const sessionCode = () =>
  hash(
    NXK_TOOLS,
    COME_BACK,
    readFileSync(new URL("./owner.ts", import.meta.url), "utf8"),
    linesOf.toString(),
    entriesOf.toString(),
    transcriptOf.toString(),
    messagesOf.toString(),
    headOf.toString(),
    commandOf.toString(),
    turnText.toString(),
    session.toString(),
    failureOf.toString(),
    decisionStop.toString(),
    scanSpend.toString(),
    envFor.toString(),
  );
const setupNow = (opts: Judge, sessionModel: string): RunSetup =>
  setupOf(opts, envFor({}), homedir(), {
    sessionModel,
    code: {
      session: sessionCode(),
      judge: judgeCode(),
      runner: hash(readFileSync(fileURLToPath(import.meta.url), "utf8")),
    },
  });

/** The judge model's exact ID, for the judge-only commands: { ...opts, model }. */
async function pinJudge(opts: Judge): Promise<Judge> {
  const { model } = await resolveModel(opts.model);
  if (model !== opts.model) console.log(`Judge: ${opts.model} is ${model}`);
  console.log(`Judge: ${model}, ${opts.votes} votes`);
  return { ...opts, model };
}

/** The files a saved run delivered: kept with the results, else read again from its work folder while it is there. */
function filesOf(dir: string, r: RunRecord, trace: string[] | null) {
  const kept = keptFiles(filesDir(dir, r));
  if (kept) return kept;
  const found = r.work && trace && existsSync(r.work) ? deliveredFiles(trace, r.work) : null;
  if (found) keepFiles(filesDir(dir, r), found);
  return found;
}

/**
 * Grade the saved replies of an earlier run again under the current graders. What each session did is kept: an llm
 * verdict whose rubric is unchanged stands, any other is judged again, and graders read the delivered files kept with
 * the results (or the work folder while it is there). A run whose prompt or seed changed since is left as it was.
 */
async function rejudge(dir: string, cases: Case[], opts: Judge) {
  const saved: Results = JSON.parse(readFileSync(join(dir, "results.json"), "utf8"));
  let cost = 0;
  for (const r of saved.runs) {
    const c = cases.find((x) => x.name === r.case);
    if (!r.graders || !c) continue;
    if (r.askHash && r.askHash !== c.askHash) {
      console.log(`${runName(r)} not judged again: its prompt or seed changed since the run`);
      continue;
    }
    const trace = traceOf(dir, r);
    // A saved run whose scans the decision model stopped is a failure, as it would be now: --fill runs it again.
    const stopped = trace && scanStopped(trace);
    if (stopped) {
      delete r.score;
      delete r.graders;
      Object.assign(r, stopped);
      console.log(`${runName(r)} ${stopped.failure}: ${stopped.error}`);
      continue;
    }
    const s = { reply: r.reply ?? "", trace };
    r.graders = await grade(c, r.work ?? "", s, opts, r.graders, filesOf(dir, r, trace));
    const paid = r.graders.reduce((a, g) => a + (g.cost ?? 0), 0);
    cost += paid;
    Object.assign(r, { score: scoreOf(r.graders), judgeCost: (r.judgeCost ?? 0) + paid, caseHash: c.hash });
    console.log(`${runName(r)} ${r.score!.toFixed(2)} (${money(paid)})${failed(r.graders)}`);
  }
  if (saved.setup)
    saved.setup = { ...saved.setup, judge: { ...opts, code: judgeCode() }, rejudged: new Date().toISOString() };
  writeFileSync(join(dir, "results.json"), JSON.stringify(saved, null, 1));
  summarise(saved.runs, cases);
  console.log(`Judged again: ${money(cost)}`);
}

/**
 * The simulated owner's calibration (evals/owner-calibration/*.json): a reply, what the owner knows, and the decisions
 * expected (offers that serve a goal taken, others turned down, questions answered only from what they know). An owner
 * that gets one wrong is not fit to answer for owners in a run.
 */
async function calibrateOwner(opts: Judge) {
  let cost = 0,
    wrong = 0;
  const examples = calibrationExamples();
  for (const ex of examples) {
    const said = await ownerTurn(ex, opts);
    const misses = calibrationMisses(ex.expect ?? {}, said);
    cost += said.cost;
    if (misses.length) wrong++;
    console.log(
      `${misses.length ? "WRONG" : "ok   "} owner/${ex.name} (${money(said.cost)})${misses.length ? ` | ${misses.join("; ")}` : ""}`,
    );
  }
  console.log(`${examples.length} owner examples, ${wrong} wrong, ${money(cost)}`);
}

/**
 * Each llm grader's calibration (graders/calibration/<grader>.pass.md and .fail.md: what the judge would read, a
 * result that should pass and one with a defect planted): a grader that cannot tell the two apart is rewritten.
 * @param only  the graders to calibrate, as <case>/<grader>; null for every one
 */
async function calibrate(cases: Case[], opts: Judge, only: string[] | null = null) {
  let cost = 0,
    wrong = 0,
    judgedN = 0;
  const missing: string[] = [];
  for (const c of cases)
    for (const g of c.graders.filter((x) => x.type === "llm" && (!only || only.includes(`${c.name}/${x.name}`)))) {
      // <grader>.pass.md and <grader>.fail.md, and any more of either as <grader>.pass-<what>.md.
      const at = join(c.dir, "graders", "calibration");
      const examples = (existsSync(at) ? readdirSync(at) : [])
        .sort((a, b) => a.localeCompare(b))
        .flatMap((f) => {
          const m = new RegExp(`^${g.name}\\.(pass|fail)(-[a-z0-9-]+)?\\.md$`).exec(f);
          return m ? [{ want: m[1], file: join(at, f) }] : [];
        });
      if (!["pass", "fail"].every((w) => examples.some((e) => e.want === w))) missing.push(`${c.name}/${g.name}`);
      for (const { want, file } of examples) {
        const j = await judge(g.rubric, readFileSync(file, "utf8").trim(), opts);
        const ok = j.passed === (want === "pass");
        cost += j.cost;
        judgedN++;
        if (!ok) wrong++;
        console.log(
          `${ok ? "ok   " : "WRONG"} ${c.name}/${basename(file, ".md")} should ${want}: ${j.explanation} (${money(j.cost)})${ok ? "" : ` | ${j.why.slice(-400)}`}`,
        );
      }
    }
  if (missing.length) console.log(`No pair of examples: ${missing.join(", ")}`);
  console.log(`${judgedN} examples judged, ${wrong} wrong, ${money(cost)}`);
}

/**
 * How far to trust one judging: a sample of saved runs (`size`, the same sample every time for the same results),
 * each llm grader judged twice afresh on the kept reply and files. Prints the expected cost first; --plan stops there.
 */
async function agreement(dir: string, cases: Case[], opts: Judge, size: number, planOnly: boolean) {
  const saved: Results = JSON.parse(readFileSync(join(dir, "results.json"), "utf8"));
  const usable = saved.runs.filter((r) => {
    const c = cases.find((x) => x.name === r.case);
    // Only runs whose case is as the session saw it, with an llm grader to judge.
    return c && (!r.askHash || r.askHash === c.askHash) && r.graders && c.graders.some((g) => g.type === "llm");
  });
  const sample = usable.sort((a, b) => hash(runName(a)).localeCompare(hash(runName(b)))).slice(0, size);
  const llm = (r: RunRecord) => cases.find((c) => c.name === r.case)?.graders.filter((g) => g.type === "llm") ?? [];
  const calls = sample.reduce((a, r) => a + llm(r).length, 0) * 2 * opts.votes;
  const perVote = JUDGE_PER_GRADER / 3;
  console.log(
    `Agreement: ${sample.length} runs, ${calls} judge calls (each llm grader twice, ${opts.votes} votes), about ${money(calls * perVote)}.`,
  );
  if (planOnly) return;
  const pinned = await pinJudge(opts),
    rows: AgreementRow[] = [];
  for (const r of sample) {
    const c = cases.find((x) => x.name === r.case),
      trace = traceOf(dir, r),
      files = filesOf(dir, r, trace);
    // Every run sampled has its case (usable, above).
    if (!c) continue;
    const s = { reply: r.reply ?? "", trace };
    const twice: GraderResult[][] = [];
    for (let k = 0; k < 2; k++) twice.push(await grade(c, r.work ?? "", s, pinned, [], files));
    rows.push({ run: runName(r), saved: r.graders, first: twice[0], second: twice[1] });
    console.log(
      `${runName(r)}: ${twice.map((gs) => scoreOf(gs).toFixed(2)).join(" then ")} (saved ${r.score?.toFixed(2)})`,
    );
  }
  writeFileSync(join(dir, "agreement.json"), JSON.stringify(rows, null, 1));
  console.log(agreementLines(rows).join("\n"));
}

/** Whether a case's grader is serious (tagged serious-<grader> in its prompt.md). */
const seriousIn =
  (cases: Case[]): SeriousOf =>
  (name, grader) =>
    Boolean(cases.find((c) => c.name === name)?.graders.some((g) => g.name === grader && g.serious));

/** The summary by kind (graders of the result only), where nxk ran, the graders shown apart, and the owner. */
function summarise(runs: RunRecord[], cases: Case[]) {
  const outputOf = (name: string) => cases.find((c) => c.name === name)?.output ?? "unknown";
  const legend = [
    "graders of the result; a case's score is the mean of its repeats, the range is the kind's mean in each repeat;",
    "serious: the share of runs with at least one serious miss, with its range across repeats; words: median per reply",
  ].join(" ");
  console.log(`\nBY KIND (${legend})\n${byKind(runs, outputOf, seriousIn(cases)).join("\n")}`);
  const where = nxkLine(runs);
  if (where) console.log(`\nWHERE NXK RAN (its calls in the work's own context should be none)\n${where}`);
  const apart = processLines(runs, outputOf);
  if (apart.length) console.log(`\nSHOWN APART (process graders: how nxk ran, not scored)\n${apart.join("\n")}`);
  const owned = ownerLines(runs);
  if (owned.length) console.log(`\nTHE OWNER (simulated, evals/owner.ts: shown, not scored)\n${owned.join("\n")}`);
}

/** The jobs of a run, case by case, each case's repeats together in time. `has` holds the runs (by name) a fill keeps. */
export const jobsOf = <C extends Pick<Case, "name">>(cases: C[], reps: number, has = new Set<string>()): Job<C>[] =>
  cases
    .flatMap((c) => Array.from({ length: reps }, (_, k) => ({ c, rep: reps > 1 ? k + 1 : undefined })))
    .filter((x) => !has.has(runName({ case: x.c.name, rep: x.rep })));

/** Of an earlier result's runs, those a fill keeps (scored) and those it runs again (failed or skipped). */
export const keptOf = (runs: RunRecord[]): { kept: RunRecord[]; failures: RunRecord[] } => ({
  kept: runs.filter((r) => r.score !== undefined && !r.failure),
  failures: runs.filter((r) => r.score === undefined || r.failure),
});

/** An earlier result to fill in: its cases and repeats, the runs kept, and the jobs to run again. */
function fillFrom(dir: string, setup: RunSetup) {
  const earlier: Results = JSON.parse(readFileSync(join(dir, "results.json"), "utf8"));
  const f: Partial<RunFlags> = earlier.setup?.flags ?? {};
  const cases = selectCases(f),
    reps = Number(f.repeat ?? 1);
  // A fill measures what the run measured: the same setup on every count a reused run is checked on.
  const why = unlike({ caseHash: "" }, earlier.setup, { hash: "" }, setup);
  if (why.length) throw new Error(`--fill needs the setup that run had: ${why.join("; ")}.`);
  const { kept, failures } = keptOf(earlier.runs);
  for (const r of kept) {
    const c = cases.find((x) => x.name === r.case);
    if (c && r.caseHash !== c.hash)
      throw new Error(`${r.case} changed since that run: --rejudge it first if only its graders changed.`);
  }
  const has = new Set(kept.map((r) => runName(r)));
  // Results with no setup record were refused (unlike, above).
  return { earlier: earlier as Results & { setup: RunSetup }, cases, reps, kept, has, failures };
}

async function main(argv: string[]) {
  const { positionals, flags } = argsOf(argv);
  const unknown = [
    ...positionals,
    ...Object.keys(flags)
      .filter((k) => !FLAGS.includes(k))
      .map((k) => `--${k}`),
  ];
  if (unknown.length)
    throw new Error(`No such option: ${unknown.join(", ")}. The options are at the top of evals/run.ts.`);
  let opts: Judge = { model: String(flags.judge ?? JUDGE_MODEL), votes: Number(flags.votes ?? 3) };
  let cases = selectCases(flags);
  if (!cases.length) throw new Error("No case matches --case and --tag.");
  let reps = Number(flags.repeat ?? 1);
  const j = Number(flags.jobs ?? 3),
    maxUsd = Number(flags["max-usd"] ?? 25);
  if (flags.rejudge) return rejudge(resolve(String(flags.rejudge)), cases, await pinJudge(opts));
  // --calibrate=owner checks only the owner; --graders=<case>/<grader>[,...] calibrates only those graders.
  if ("calibrate" in flags) {
    if (flags.calibrate !== "" && flags.calibrate !== "owner")
      throw new Error(`--calibrate takes no value, or =owner: not ${flags.calibrate}.`);
    const pinned = await pinJudge(opts);
    if (flags.calibrate === "owner") return calibrateOwner(pinned);
    await calibrate(cases, pinned, flags.graders ? String(flags.graders).split(",") : null);
    if (!flags.graders) await calibrateOwner(pinned);
    return;
  }
  if (flags.agreement)
    return agreement(resolve(String(flags.agreement)), cases, opts, Number(flags.sample ?? 12), "plan" in flags);
  if (!(reps >= 1)) throw new Error("--repeat takes a whole number of runs, 1 or more.");
  if (reps > 1 && flags.reuse) throw new Error("--reuse takes one run a case: leave out --repeat, or --reuse.");
  // Pin the models, then take the setup: a fill must match the run it fills on all of it.
  // Sessions run on Claude Code's default model, found once here and pinned for the whole run; the judge is fixed.
  const pinned = await resolveModel(SESSION.model);
  opts = { ...opts, model: (await resolveModel(opts.model)).model };
  const setup = setupNow(opts, pinned.model);
  // What a plain session here loads, found by the same probe: every session is held to it (contamination). Anything in
  // it that is not part of Claude Code itself (your own plugin or MCP server) would be in every session: refuse to start.
  const outside = [...pinned.plain.plugins.filter((p) => p.includes(" (")), ...pinned.plain.mcp];
  if (outside.length)
    throw new Error(
      `A plain session here loads ${outside.join(", ")}, which is not part of Claude Code: every session would have it. Turn it off for project-only settings, then run again.`,
    );
  setup.plain = pinned.plain;
  // The simulated owner answers each reply on the judge's model (evals/owner.ts); --no-owner leaves it out.
  const owner = "no-owner" in flags ? null : { model: opts.model };
  setup.owner = owner ? { model: owner.model, turns: OWNER_TURNS } : null;
  const fill = flags.fill ? fillFrom(resolve(String(flags.fill)), setup) : null;
  if (fill) ({ cases, reps } = fill);
  const jobs = jobsOf(cases, reps, fill?.has);
  // What this should cost, from the latest paid run of each case; --plan stops here.
  const costsFrom = resolve(String(flags["costs-from"] ?? join(HERE, "results")));
  const expect = expectedCost(
    jobs.map((x) => ({
      case: x.c.name,
      llm: x.c.graders.filter((g) => g.type === "llm").length,
    })),
    costsFrom,
    { model: pinned.model, votes: opts.votes },
  );
  const over = expect.byCase.slice(0, j).reduce((a, x) => a + x, 0);
  console.log(
    [
      `Sessions on Claude Code's default model, ${pinned.model}, pinned for the run.`,
      `Expected cost about ${money(expect.usd)} for ${jobs.length} runs (sessions priced for ${pinned.model}, judges and scans;`,
      `${expect.guessed} priced at the median session, having no paid run in ${relative(process.cwd(), costsFrom) || "."}).`,
      `No case starts past --max-usd=${maxUsd}; cases already started finish, which can pass it by up to about ${money(over)}.`,
    ].join(" "),
  );
  console.log(
    `Of that, scans on the decision model's account (${setup.decision.route ? `${setup.decision.model} via ${setup.decision.route}` : "no key"}): about ${money(expect.scans)}.`,
  );
  if (owner)
    console.log(
      [
        `The simulated owner (${owner.model}) answers each reply that asks or offers something, at most ${OWNER_TURNS} times a session:`,
        "its calls cost cents, and the turns it resumes are priced in once a run with the owner is saved.",
        "--no-owner leaves it out.",
      ].join(" "),
    );
  if ("plan" in flags) return;
  if (setup.nxk.uncommitted.length && !("allow-uncommitted" in flags))
    throw new Error(
      `The plugin or the people files have uncommitted changes (${setup.nxk.uncommitted.join(", ")}): commit them, so the result says what it measured, or pass --allow-uncommitted for development.`,
    );
  // One test answer from the decision model before any session, when a run has research that could scan: an account or
  // key that cannot answer would have every scan of the run stopped. The second look and the panel never scan.
  if (jobs.some((x) => x.c.output === "research" && !(x.c.meta.tags ?? []).includes("no-key"))) {
    const check = await preflight(envFor({}));
    setup.preflight = { model: check.model, route: check.route, usd: check.usd };
    console.log(
      `Decision model: one test answer from ${check.model} via ${check.route}, $${check.usd.toFixed(6)}: the key and the account answer.`,
    );
  }
  setup.flags = fill
    ? { ...fill.earlier.setup.flags, fill: fill.earlier.stamp, maxUsd }
    : { case: flags.case ?? "*", tag: flags.tag ?? null, maxUsd, reuse: flags.reuse ?? null, repeat: reps };
  const earlier: Results | null = flags.reuse
    ? JSON.parse(readFileSync(join(resolve(String(flags.reuse)), "results.json"), "utf8"))
    : null;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-"),
    out = join(HERE, "results", stamp),
    works = join(tmpdir(), "nxk-evals", stamp);
  mkdirSync(join(out, "traces"), { recursive: true });
  const done: RunRecord[] = [];
  /** Copy a run's trace and delivered files from an earlier results folder into this one. */
  const carry = (from: string, r: RunRecord) => {
    for (const [sub, name] of [
      ["traces", traceFile(r)],
      ["files", traceFile(r).replace(/\.jsonl$/, "")],
    ])
      if (existsSync(join(from, sub, name))) cpSync(join(from, sub, name), join(out, sub, name), { recursive: true });
  };
  if (fill) {
    const from = resolve(String(flags.fill));
    for (const r of fill.kept) {
      carry(from, r);
      done.push(r);
    }
    setup.fills = [
      ...(fill.earlier.setup.fills ?? []),
      {
        from: fill.earlier.stamp,
        at: stamp,
        spentBefore: fill.earlier.spent,
        rerun: fill.failures.map((r) => ({
          run: runName(r),
          why: r.failure ?? (r.skipped ? "skipped" : "error"),
          error: r.error ?? r.skipped,
        })),
      },
    ];
    console.log(`Filling in ${fill.earlier.stamp}: ${fill.kept.length} runs kept, ${jobs.length} to run.`);
  }
  console.log(
    `${cases.length} cases${reps > 1 ? ` x ${reps} repeats` : ""}, ${j} at a time, no case starting past ${money(maxUsd)}. Folders: ${works}`,
  );
  const uncommitted = setup.nxk.uncommitted.length ? ` + ${setup.nxk.uncommitted.length} uncommitted` : "";
  const sessions = `${setup.sessionModel}, ${SESSION.permissionMode} mode, ${SESSION.maxTurns} turns, ${SESSION.timeoutSeconds} s`;
  const tier = setup.decision.tier ? ` (${setup.decision.tier})` : "";
  const scansOn = setup.decision.route ? `${setup.decision.model} via ${setup.decision.route}${tier}` : "none (no key)";
  console.log(
    `nxk ${setup.nxk.commit.slice(0, 7)}${uncommitted} · ${setup.claude} · ${sessions} · scans: ${scansOn} · judge ${opts.model} x${opts.votes}`,
  );
  const startedCases = new Set<string>(),
    fresh: RunRecord[] = [];
  let spent = 0,
    next = 0;
  const save = () =>
    writeFileSync(join(out, "results.json"), JSON.stringify({ stamp, works, setup, spent, runs: done }, null, 1));
  const worker = async () => {
    while (next < jobs.length) {
      const { c, rep } = jobs[next++];
      const name = runName({ case: c.name, rep });
      const old = earlier?.runs.find((r): r is ScoredRun => r.case === c.name && r.score !== undefined && !r.failure);
      const why = old ? unlike(old, earlier?.setup, c, setup) : [];
      if (old && !why.length) {
        const from = resolve(String(flags.reuse));
        carry(from, old);
        const trace = old.depth ? null : traceOf(from, old);
        const depth = old.depth ?? (trace ? depthOf(trace) : undefined);
        done.push({ ...old, depth, reusedFrom: old.reusedFrom ?? earlier?.stamp });
        console.log(`${name} ${old.score.toFixed(2)} (from ${old.reusedFrom ?? earlier?.stamp})`);
        save();
        continue;
      }
      if (old) console.log(`${name} not reused: ${why.join("; ")}`);
      // The limit is checked when a case starts: a case once started keeps every repeat.
      if (!startedCases.has(c.name)) {
        if (spent >= maxUsd) {
          done.push({ case: c.name, rep, caseHash: c.hash, skipped: `spend limit ${money(maxUsd)} reached` });
          continue;
        }
        startedCases.add(c.name);
      }
      const work = join(works, c.name, rep ? `run-${rep}` : "run"),
        began = Date.now();
      const attempt =
        1 + (fill?.failures.filter((r) => runName(r) === name).reduce((a, r) => Math.max(a, r.attempt ?? 1), 0) ?? 0);
      const head = {
        case: c.name,
        ...(rep ? { rep } : {}),
        ...(attempt > 1 ? { attempt } : {}),
        caseHash: c.hash,
        askHash: c.askHash,
      };
      try {
        const s = await session(c, work, setup.sessionModel, owner);
        writeFileSync(join(out, "traces", traceFile({ case: c.name, rep })), s.trace.join("\n"));
        keepFiles(filesDir(out, { case: c.name, rep }), s.files);
        const seconds = Math.round((Date.now() - began) / 1000);
        const common = {
          tools: toolsOf(s.init),
          cost: s.cost,
          scans: s.scans,
          models: s.models,
          seconds,
          turns: s.turns.map(({ reply, ...t }) => t),
          reply: s.reply,
          owner: s.owner,
          ownerTally: ownerTally(s.owner),
          ownerCost: s.ownerCost,
          nxk: nxkSplit(s.trace),
          work,
        };
        const failure = failureOf(s, setup.sessionModel, setup.plain);
        if (failure) {
          const r = { ...head, ...failure, ...common, judgeCost: 0 };
          spent += costOf(r);
          done.push(r);
          fresh.push(r);
          console.log(`${name} ${failure.failure}: ${failure.error} (${money(costOf(r))})`);
          save();
          continue;
        }
        const graders = await grade(c, work, s, opts, [], s.files);
        const r = {
          ...head,
          keys: (c.meta.tags ?? []).includes("no-key") ? ("hidden" as const) : ("yours" as const),
          score: scoreOf(graders),
          judgeCost: graders.reduce((a, g) => a + (g.cost ?? 0), 0),
          ...common,
          graders,
          depth: depthOf(s.trace),
          toolErrors: toolErrors(s.trace),
        };
        spent += costOf(r);
        done.push(r);
        fresh.push(r);
        const scanned = r.scans.answers ? ` + scans ${money(r.scans.usd)} (${r.scans.answers} answers)` : "";
        const d = r.depth;
        const nudged = d.nudges ? `, ${d.followed} of ${d.nudges} nudges taken` : "";
        const further =
          d.changed + d.confirmed + d.unclear
            ? `, looked further: ${d.changed} changed, ${d.confirmed} confirmed, ${d.unclear} could not tell`
            : "";
        const dug = `${d.nxk} nxk calls, ${d.looks} looks, ${d.tests} tests, ${d.after} after the first scan, ${d.raw} on raw files${nudged}${further}${shallow(d) ? ", shallow" : ""}`;
        const o = r.ownerTally,
          ownerSaid = o.exchanges
            ? ` · owner: ${o.exchanges} exchange${o.exchanges > 1 ? "s" : ""}, ${o.yes} yes, ${o.no} no, ${o.known} answered, ${o.fill} theirs to fill in, ${o.unknown - o.fill} left to judgement`
            : "",
          where = ` · handed to ${handedOf(r.nxk)}, ${r.nxk.main} nxk calls in the work's context`;
        console.log(
          `${name} ${r.score.toFixed(2)} ${money(r.cost)}${scanned} · ${dug}${where}${ownerSaid}${failed(graders)}`,
        );
      } catch (error) {
        const r: RunRecord = {
          ...head,
          failure: "error",
          error: String(error instanceof Error ? error.message : error),
        };
        done.push(r);
        fresh.push(r);
        console.log(`${name} error: ${r.error}`);
      }
      save();
    }
  };
  await Promise.all(Array.from({ length: j }, worker));
  // Claude Code's version at the end: a run it changed under is flagged, with the runs on each version.
  setup.claudeAtEnd = claudeVersion();
  const versionOf = (v: string | undefined) => /[\d.]+/.exec(String(v ?? ""))?.[0];
  const moved = done.filter((r) => r.tools?.claude && r.tools.claude !== versionOf(setup.claude));
  setup.versionChanged = setup.claudeAtEnd !== setup.claude || moved.length > 0;
  save();
  console.log(`\n${caseLines(cases, done, seriousIn(cases)).join("\n")}`);
  summarise(done, cases);
  // Only scored runs have a depth.
  const dug = done
    .filter((r): r is RunRecord & DepthRow => Boolean(r.depth))
    .sort((a, b) => a.case.localeCompare(b.case) || (a.rep ?? 0) - (b.rep ?? 0));
  if (dug.length) console.log(`\nDEPTH (evals/depth.ts says what each column counts)\n${table(dug).join("\n")}`);
  const spread = repeats(dug);
  if (spread.length)
    console.log(
      `\nREPEATS (each repeat's score and depth; a difference inside the range is noise)\n${spread.join("\n")}`,
    );
  const refill = done.some((r) => r.failure || r.skipped) ? `: --fill=${relative(process.cwd(), out)} reruns them` : "";
  console.log(
    `\nRUNS (errors, time-outs, contamination and scans the account stopped are failures, not scores${refill})\n${failureLines(done).join("\n")}`,
  );
  if (setup.versionChanged)
    console.log(
      `\nFLAGGED: Claude Code changed during the run (${setup.claude} at the start, ${setup.claudeAtEnd} at the end; ${moved.length} runs on another version).`,
    );
  // Spending this time; runs kept or taken from earlier results cost nothing now and are counted apart.
  const sum = (f: (r: RunRecord) => number) => fresh.reduce((a, r) => a + f(r), 0);
  const reused = done.filter((r) => r.reusedFrom),
    answers = sum((r) => r.scans?.answers ?? 0);
  const scans = `scans ${money(sum((r) => r.scans?.usd ?? 0))}${answers ? ` (${answers} answers, priced as nxk prices them)` : ""}`;
  const carried = reused.length
    ? ` · ${reused.length} ${reused.length === 1 ? "run" : "runs"} reused (first paid ${money(reused.reduce((a, r) => a + costOf(r), 0))})`
    : "";
  const spentOn = [
    `sessions ${money(sum((r) => r.cost ?? 0))}`,
    `judges ${money(sum((r) => r.judgeCost ?? 0))}`,
    `owner ${money(sum((r) => r.ownerCost ?? 0))}`,
    scans,
  ].join(", ");
  console.log(`\n${cases.length} cases · spent ${money(spent)}: ${spentOn}${carried}\nResults: ${out}`);
  writeFileSync(join(out, "replies.md"), repliesOf(cases, done));
}

if (isMain(import.meta.url))
  main(process.argv.slice(2)).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
