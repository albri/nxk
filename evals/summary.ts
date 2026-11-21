// The run's summary, case by case and by kind (which of nxk's ways in a case uses), and what a run is expected to cost
// before it starts. run.ts prints both.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { WAYS_IN, type Case, type Kind } from "./cases.ts";
import { decisionStop } from "./decision.ts";
import { runName, traceOf, type NxkSplit } from "./depth.ts";
import type { GraderResult } from "./grade.ts";
import { blocksOf, entriesOf, mean, median, money } from "./lib.ts";
import type { OwnerRound } from "./owner.ts";
import type { Results, RunRecord, ScoredRun } from "./run.ts";

/** The kinds of output, in the order the summary prints them: one for each of nxk's ways in (WAYS_IN). */
export const KINDS = Object.keys(WAYS_IN) as Kind[];

/** Whether a case's grader is serious: `seriousOf(case, grader)`. */
export type SeriousOf = (caseName: string, grader: string) => boolean;

/** The share of runs with at least one serious miss, and its range across repeats. */
export interface SeriousShare {
  share: number;
  low: number;
  high: number;
}

/** One kind's figures (kindFigures): each undefined when there are no runs to take it from. */
export interface KindFigures {
  cases: number;
  mean: number | undefined;
  low: number | undefined;
  high: number | undefined;
  serious: SeriousShare | undefined;
  words: number | undefined;
}

/** What a run should cost (expectedCost). */
export interface ExpectedCost {
  usd: number;
  /** The scans' part of usd. */
  scans: number;
  /** How many runs were priced at the median session, with no paid run of their case. */
  guessed: number;
  runs: number;
  /** Each case's total, costliest first. */
  byCase: number[];
}

/** One run graded twice afresh (agreementLines): its name, its saved graders, and each grading's. */
export interface AgreementRow {
  run: string;
  saved?: GraderResult[];
  first: GraderResult[];
  second: GraderResult[];
}

// What a run costs where no saved run says, from the latest run of each of the 11 cases, all on claude-opus-5-5, on
// 19 November 2026: a session's median cost, and the judge's mean cost for one llm grader at 3 votes, with no tools
// (23 verdicts).
export const SESSION_PER_RUN = 0.74;
export const JUDGE_PER_GRADER = 0.03;

export const words = (text: string | null | undefined): number =>
  String(text ?? "")
    .split(/\s+/)
    .filter(Boolean).length;
const f2 = (x: number | undefined) => (x === undefined ? "  -  " : x.toFixed(2));
const pct = (x: number) => `${Math.round(100 * x)}`;
/** What a run cost in all: its session, its judges, its scans and the simulated owner. */
export const costOf = (r: RunRecord): number =>
  (r.cost ?? 0) + (r.judgeCost ?? 0) + (r.scans?.usd ?? 0) + (r.ownerCost ?? 0);

/** Whether a run failed a serious grader that is scored: `seriousOf(case, grader)` says which are serious. */
export const seriousMiss = (r: RunRecord, seriousOf: SeriousOf): boolean =>
  (r.graders ?? []).some((g) => g.scored && !g.process && !g.passed && seriousOf(r.case, g.name));

/**
 * One kind's figures from scored runs: the mean score (each case weighed once, as the mean of its repeats), its range
 * across repeats (the kind's mean in each repeat), the share of runs with at least one serious miss and its range across
 * repeats, and the median words per reply.
 */
export function kindFigures(runs: ScoredRun[], seriousOf: SeriousOf = () => false): KindFigures {
  const cases = [...new Set(runs.map((r) => r.case))];
  const byCase = cases
    .map((c) => mean(runs.filter((r) => r.case === c).map((r) => r.score)))
    .filter((x) => x !== undefined);
  const repsOf = [...new Set(runs.map((r) => r.rep ?? 1))].map((k) => runs.filter((r) => (r.rep ?? 1) === k));
  // Every repeat holds a run, and the share missed is taken only of runs there are, so these means are numbers.
  const reps = repsOf.map((rs) => mean(rs.map((r) => r.score)) as number);
  const missed = (rs: ScoredRun[]) => mean(rs.map((r) => (seriousMiss(r, seriousOf) ? 1 : 0))) as number;
  const serious = repsOf.map(missed);
  return {
    cases: cases.length,
    mean: mean(byCase),
    low: reps.length ? Math.min(...reps) : undefined,
    high: reps.length ? Math.max(...reps) : undefined,
    serious: runs.length ? { share: missed(runs), low: Math.min(...serious), high: Math.max(...serious) } : undefined,
    words: median(runs.map((r) => words(r.reply))),
  };
}

/**
 * The summary lines: one per kind, then every case together. Beside each mean, its range across repeats, and the share
 * of runs with at least one serious miss (`seriousOf(case, grader)`), with its range across repeats.
 */
export function byKind(
  runs: RunRecord[],
  outputOf: (caseName: string) => string | undefined,
  seriousOf: SeriousOf = () => false,
): string[] {
  const scored = runs.filter((r): r is ScoredRun => r.score !== undefined);
  const head = `${"KIND".padEnd(12)}${"CASES".padStart(5)}  ${"SCORE (range)".padEnd(19)}${"SERIOUS (range)".padEnd(18)}WORDS`;
  const line = (label: string, of: ScoredRun[]) => {
    const k = kindFigures(of, seriousOf);
    // A line is drawn only for runs there are, so the serious share is always there.
    const s = k.serious as SeriousShare;
    const score = `${f2(k.mean)} (${f2(k.low)}-${f2(k.high)})`;
    const serious = `${pct(s.share)}% (${pct(s.low)}-${pct(s.high)})`;
    return `${label.padEnd(12)}${String(k.cases).padStart(5)}  ${score.padEnd(19)}${serious.padEnd(18)}${k.words ?? "-"}`;
  };
  const out = [head];
  for (const kind of KINDS) {
    const of = scored.filter((r) => outputOf(r.case) === kind);
    if (of.length) out.push(line(kind, of));
  }
  if (scored.length) out.push(line("all", scored));
  return out;
}

/** The graders shown apart from the score (the process graders), by kind: how many passed of how many were run. */
export function processLines(runs: RunRecord[], outputOf: (caseName: string) => string | undefined): string[] {
  const out: string[] = [];
  for (const kind of KINDS) {
    const gs = runs.filter((r) => outputOf(r.case) === kind).flatMap((r) => (r.graders ?? []).filter((g) => !g.scored));
    if (gs.length) out.push(`${kind.padEnd(12)} ${gs.filter((g) => g.passed).length} of ${gs.length} passed`);
  }
  return out;
}

/** Whether a saved run's scans were stopped by the decision model's account or key, read from its kept trace. */
function stoppedRun(dir: string, r: RunRecord) {
  if (!((r.depth?.scans ?? 0) > 0)) return false;
  const trace = traceOf(dir, r);
  return trace !== null && decisionStop(trace) !== null;
}

/**
 * What a run should cost, from earlier results: each job ({ case, llm: its llm graders }) at its case's latest paid
 * run. Its session counts at what it cost, and so does its judging when it ran on `model`; a run on another model has
 * its judging priced at today's cost for each llm grader. A case with no paid run takes the median session (and with no
 * results at all, SESSION_PER_RUN). Scans are the decision model's, priced apart: at the latest run's spend, or, where
 * the account stopped that run's scans (a failure, not a price), at the median cost of a scan call that got answers (a
 * stopped one's answers included), for each scan it called. byCase: each case's total, costliest first; scans: the
 * scans' part of usd.
 */
export function expectedCost(
  jobs: { case: string; llm?: number }[],
  resultsDir: string,
  { model = null, votes = 3 }: { model?: string | null; votes?: number } = {},
): ExpectedCost {
  const latest = new Map<string, { session: number; judge: number | null }>(),
    scansOf = new Map<string, { usd?: number; calls?: number }>(),
    perCall: number[] = [],
    sessions: number[] = [];
  const dirs = existsSync(resultsDir) ? readdirSync(resultsDir).sort() : [];
  for (const d of dirs) {
    let saved: Results;
    try {
      saved = JSON.parse(readFileSync(join(resultsDir, d, "results.json"), "utf8"));
    } catch {
      continue;
    }
    for (const r of saved.runs ?? []) {
      if (r.score === undefined || r.reusedFrom || !((r.cost ?? 0) > 0)) continue;
      if (r.scans && r.scans.answers > 0) perCall.push(r.scans.usd / Math.max(1, r.depth?.scans ?? 1));
      if (stoppedRun(join(resultsDir, d), r)) {
        scansOf.set(r.case, { calls: r.depth?.scans });
        continue;
      }
      scansOf.set(r.case, { usd: r.scans?.usd ?? 0 });
      // A paid run (above): its cost is a number.
      const x = { session: r.cost as number, judge: model && r.tools?.model === model ? (r.judgeCost ?? 0) : null };
      latest.set(r.case, x);
      sessions.push(x.session);
    }
  }
  const call = median(perCall) ?? 0;
  let usd = 0,
    scans = 0,
    guessed = 0;
  const perCase = new Map<string, number>();
  for (const job of jobs) {
    const known = latest.get(job.case),
      scanned = scansOf.get(job.case);
    if (known === undefined) guessed++;
    const session = known?.session ?? median(sessions) ?? SESSION_PER_RUN;
    const scan = scanned?.usd ?? (scanned?.calls ?? 0) * call;
    const x = session + scan + (known?.judge ?? ((job.llm ?? 0) * JUDGE_PER_GRADER * votes) / 3);
    usd += x;
    scans += scan;
    perCase.set(job.case, (perCase.get(job.case) ?? 0) + x);
  }
  return { usd, scans, guessed, runs: jobs.length, byCase: [...perCase.values()].sort((a, b) => b - a) };
}

/**
 * One line a case: its kind, its score (the mean of its repeats), how many runs missed a serious grader, words per
 * reply, how many runs handed the work to the subagent its command calls (WAYS_IN), nxk's calls in the work's own
 * context (should be none), and what it cost.
 */
export function caseLines(
  cases: Pick<Case, "name" | "output">[],
  runs: RunRecord[],
  seriousOf: SeriousOf = () => false,
): string[] {
  const out = [`${"CASE".padEnd(30)} ${"KIND".padEnd(9)} SCORE  SERIOUS  WORDS  ${"RAN".padEnd(10)}IN WORK  COST`];
  for (const c of cases) {
    const rs = runs.filter((r): r is ScoredRun => r.case === c.name && r.score !== undefined);
    if (!rs.length) {
      out.push(`${c.name.padEnd(30)} ${String(c.output).padEnd(9)}  -`);
      continue;
    }
    // A case tagged with no kind of output has no subagent to look for.
    const agent = WAYS_IN[c.output as Kind]?.agent,
      ran = rs.filter((r): r is ScoredRun & { nxk: NxkSplit } => Boolean(r.nxk));
    // The case has scored runs (above), so both means are numbers.
    const score = mean(rs.map((r) => r.score)) as number;
    const replyWords = mean(rs.map((r) => words(r.reply))) as number;
    const cells = [
      score.toFixed(2).padEnd(6),
      `${rs.filter((r) => seriousMiss(r, seriousOf)).length} of ${rs.length}`.padEnd(8),
      String(Math.round(replyWords)).padEnd(6),
      (agent && ran.length ? `${ran.filter((r) => r.nxk[agent]).length} of ${ran.length}` : "-").padEnd(9),
      String(ran.length ? ran.reduce((a, r) => a + (r.nxk.main ?? 0), 0) : "-").padEnd(8),
      money(rs.reduce((a, r) => a + costOf(r), 0)),
    ];
    out.push(`${c.name.padEnd(30)} ${String(c.output).padEnd(9)} ${cells.join(" ")}`);
  }
  return out;
}

/** replies.md: the prompt and the reply (or the failure) of every run of every case. */
export function repliesOf(cases: Pick<Case, "name" | "prompt">[], runs: RunRecord[]): string {
  return cases
    .map((c) => {
      const rs = runs.filter((d) => d.case === c.name).sort((a, b) => (a.rep ?? 0) - (b.rep ?? 0));
      return [
        `## ${c.name}`,
        `> ${c.prompt.replace(/\n/g, "\n> ")}`,
        ...(rs.length ? rs : [null]).map((r) => {
          const title = r?.rep ? `Repeat ${r.rep}` : "Reply";
          const score = r?.score !== undefined ? ` (${r.score.toFixed(2)})` : "";
          const failure = r?.failure ? ` · ${r.failure}: ${r.error}` : "";
          const reused = r?.reusedFrom ? ` · from ${r.reusedFrom}` : "";
          return `### ${title}${score}${failure}${reused}\n\n${r?.reply ?? r?.skipped ?? ""}`;
        }),
      ].join("\n\n");
    })
    .join("\n\n---\n\n");
}

/** Tool calls in a transcript that came back as errors, each counted once. */
export function toolErrors(lines: string[]): number {
  const ids = new Set<string>();
  for (const e of entriesOf(lines)) {
    if (e.type !== "user") continue;
    for (const p of blocksOf(e)) if (p?.type === "tool_result" && p.is_error) ids.add(p.tool_use_id);
  }
  return ids.size;
}

/**
 * What a run came to: every failure (error, time-out, contamination, skipped), then one line with the runs scored, tool
 * errors and words per reply, and a last line with how many there are to fill in.
 */
export function failureLines(runs: RunRecord[]): string[] {
  const out: string[] = [];
  for (const r of runs.filter((x) => x.failure || x.skipped))
    out.push(`${runName(r)} ${r.failure ?? "skipped"}: ${r.error ?? r.skipped}`);
  const scored = runs.filter((r) => r.score !== undefined);
  if (scored.length) {
    const errs = scored.reduce((a, r) => a + (r.toolErrors ?? 0), 0);
    out.push(
      `${scored.length} runs scored · ${errs} tool errors (${scored.filter((r) => r.toolErrors).length} runs) · words per reply: median ${median(scored.map((r) => words(r.reply)))}`,
    );
  }
  const count = (k: RunRecord["failure"]) => runs.filter((r) => r.failure === k).length;
  const bad = runs.filter((r) => r.failure || r.skipped).length;
  out.push(
    `${bad} to fill in: ${count("error")} errors, ${count("timeout")} time-outs, ${count("contamination")} contaminated, ${runs.filter((r) => r.skipped).length} skipped, of ${runs.length} runs`,
  );
  return out;
}

/**
 * How often a judge agrees with itself: rows of { run, saved, first, second } (each a run's graders), compared on the
 * llm graders. Lines: verdicts the same both times, the same as the saved verdict given under the same rubric, and runs
 * whose score did not move.
 */
export function agreementLines(rows: AgreementRow[]): string[] {
  let same = 0,
    n = 0,
    withSaved = 0,
    nSaved = 0,
    scores = 0;
  const differ: string[] = [];
  const score = (gs: GraderResult[]) => {
    const counted = gs.filter((g) => g.scored && !g.process);
    const total = counted.reduce((a, g) => a + (g.weight ?? 1), 0);
    return total ? counted.reduce((a, g) => a + (g.passed ? (g.weight ?? 1) : 0), 0) / total : 1;
  };
  for (const row of rows) {
    for (const g of row.first.filter((x) => x.type === "llm")) {
      const again = row.second.find((x) => x.name === g.name),
        // The saved verdict counts only if it was given under the same rubric.
        before = (row.saved ?? []).find((x) => x.name === g.name && x.type === "llm" && x.rubricHash === g.rubricHash);
      n++;
      if (again?.passed === g.passed) same++;
      else differ.push(`${row.run} ${g.name}`);
      for (const v of before ? [g, again] : []) {
        nSaved++;
        if (v?.passed === before?.passed) withSaved++;
      }
    }
    if (Math.abs(score(row.first) - score(row.second)) < 1e-9) scores++;
  }
  const share = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : "-");
  const agreed = [
    `AGREEMENT: ${same} of ${n} llm verdicts the same both times (${share(same, n)});`,
    `${withSaved} of ${nSaved} the same as the saved verdict (${share(withSaved, nSaved)});`,
    `${scores} of ${rows.length} runs scored the same both times.`,
  ].join(" ");
  return [agreed, ...(differ.length ? [`Changed between the two: ${differ.join(", ")}`] : [])];
}

/**
 * What the simulated owner did over the scored runs: replies that put something to the owner, exchanges, offers taken
 * and turned down, and questions answered from what the owner knows or not. Answers with no grounding were replaced
 * with "I don't know".
 */
export function ownerLines(runs: RunRecord[]): string[] {
  const scored = runs.filter(
    (r): r is RunRecord & { owner: OwnerRound[] } => r.score !== undefined && !r.failure && Boolean(r.owner),
  );
  if (!scored.length) return [];
  const s = scored.reduce(
    (a, r) => {
      const t = r.ownerTally;
      a.asked += r.owner.some((x) => x.asked) ? 1 : 0;
      for (const k of ["exchanges", "yes", "no", "known", "unknown", "fill", "ungrounded"] as const)
        a[k] += t?.[k] ?? 0;
      return a;
    },
    { asked: 0, exchanges: 0, yes: 0, no: 0, known: 0, unknown: 0, fill: 0, ungrounded: 0 },
  );
  const offers = `offers ${s.yes} yes / ${s.no} no`;
  const answers = `answers ${s.known} known / ${s.fill} theirs to fill in / ${s.unknown - s.fill} left to judgement`;
  const ungrounded = s.ungrounded ? ` (${s.ungrounded} ungrounded)` : "";
  return [
    `${scored.length} runs  ${s.asked} put to the owner  ${s.exchanges} exchanges  ${offers}  ${answers}${ungrounded}`,
  ];
}
