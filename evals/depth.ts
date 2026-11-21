#!/usr/bin/env node
// How far each eval session dug (scripts/depth.ts says what each column counts), beside its score: a score says
// whether the reply was right, this how much discovery happened on the way. run.ts keeps it with every run, and this
// prints it for earlier results:
//
//   node evals/depth.ts evals/results/<time> [...]     (the transcripts kept in each folder's traces/)
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { isMain } from "../scripts/cli.ts";
import { depthOf as depthIn, shallow, type Depth } from "../scripts/depth.ts";
import { NXK_AGENTS } from "./cases.ts";
import { blocksOf, entriesOf, linesOf, mean, median, type Block } from "./lib.ts";
import type { Results, RunRecord, ScoredRun } from "./run.ts";

export { shallow } from "../scripts/depth.ts";
export type { Depth } from "../scripts/depth.ts";

/**
 * Where nxk's tools ran in a session (nxkSplit): its calls in the work's own context (`main`) and in its subagents
 * (`agents`), and whether the session handed work to each of nxk's subagents.
 */
export interface NxkSplit {
  main: number;
  agents: number;
  secondLook: boolean;
  research: boolean;
  panel: boolean;
}

/** A run as the depth tables read it: its case and repeat, its score, how far it dug, and where nxk ran. */
export interface DepthRow {
  case: string;
  rep?: number;
  score: number;
  depth: Depth;
  nxk?: NxkSplit;
}

/**
 * How far a session dug, counting its subagents' calls too: the digging is nxk's subagents', the second look's and the
 * panel's counts and the researcher's scans (NXK_AGENTS in cases.ts).
 */
export const depthOf = (lines: string[]): Depth => depthIn(lines, { agents: true });

export const COLUMNS: (keyof Depth)[] = [
  "calls",
  "nxk",
  "distinct",
  "looks",
  "tests",
  "scans",
  "after",
  "switches",
  "shell",
  "raw",
  "scripts",
  "web",
  "nudges",
  "followed",
  "errors",
  "changed",
  "confirmed",
  "unclear",
];

/** A run as the tables name it: its case, and which repeat when a case ran more than once. */
export const runName = (r: Pick<RunRecord, "case" | "rep">): string => (r.rep ? `${r.case} [${r.rep}]` : r.case);
/** Where a run's transcript is kept in a results folder. */
export const traceFile = (r: Pick<RunRecord, "case" | "rep">): string =>
  `${[r.case, r.rep].filter(Boolean).join(".")}.jsonl`;
/** The transcript lines kept with a run in a results folder, or null when none were kept. */
export const traceOf = (dir: string, r: Pick<RunRecord, "case" | "rep">): string[] | null => {
  const kept = join(dir, "traces", traceFile(r));
  return existsSync(kept) ? linesOf(kept) : null;
};

/** The subagent a part of an assistant message hands work to (Agent, or Task before it), or null. */
export const handedTo = (p: Block): string | null =>
  p?.type === "tool_use" && /^(Task|Agent)$/.test(p.name ?? "") ? String(p.input?.subagent_type ?? "") : null;

/**
 * Where nxk's tools ran in a session, and which of nxk's subagents it handed work to: { main, agents, secondLook,
 * research, panel }. `main` counts nxk's calls in the context the work is done in, `agents` those in nxk's subagents
 * (lines that say isSidechain); secondLook, research and panel say whether the session handed work to nxk:second-look,
 * nxk:researcher and nxk:panel. The session never calls nxk's tools itself, so main should be 0.
 */
export function nxkSplit(lines: string[]): NxkSplit {
  const out: NxkSplit = { main: 0, agents: 0, secondLook: false, research: false, panel: false },
    seen = new Set<string>();
  for (const e of entriesOf(lines)) {
    if (e.type !== "assistant") continue;
    for (const p of blocksOf(e)) {
      if (p?.type !== "tool_use" || seen.has(p.id)) continue;
      seen.add(p.id);
      if (/(^|_)nxk__/.test(p.name ?? "")) out[e.isSidechain ? "agents" : "main"]++;
      const to = handedTo(p);
      if (to === NXK_AGENTS.secondLook) out.secondLook = true;
      if (to === NXK_AGENTS.research) out.research = true;
      if (to === NXK_AGENTS.panel) out.panel = true;
    }
  }
  return out;
}

/** Which of nxk's subagents a run handed work to: look, research, panel, several joined by +, or none. */
export const handedOf = (n: NxkSplit | undefined): string =>
  !n ? "" : [n.secondLook && "look", n.research && "research", n.panel && "panel"].filter(Boolean).join("+") || "none";

/**
 * One line on where nxk ran: nxk's calls in its subagents and in the work's own context, and how many runs handed work
 * to each of its subagents.
 */
export function nxkLine(runs: Partial<RunRecord>[]): string | null {
  const split = runs.filter((r): r is { nxk: NxkSplit } => Boolean(r.nxk));
  if (!split.length) return null;
  const sum = (f: (x: NxkSplit) => number) => split.reduce((a, r) => a + (f(r.nxk) ?? 0), 0),
    n = (k: keyof NxkSplit) => split.filter((r) => r.nxk[k]).length;
  return [
    `nxk's calls: ${sum((x) => x.agents)} in its subagents, ${sum((x) => x.main)} in the work's own context;`,
    `of ${split.length} runs, the second look ran in ${n("secondLook")}, research in ${n("research")}, the panel in ${n("panel")}`,
  ].join(" ");
}

/**
 * Lines: one per session, then the median of each column and how many were shallow. Each run also says which of nxk's
 * subagents it handed work to (its `nxk`, from nxkSplit).
 */
export function table(rows: Omit<DepthRow, "score">[]): string[] {
  const out = [
    `${"SESSION".padEnd(40)} ${COLUMNS.map((c) => c.padStart(9)).join("")}  ${"handed to".padEnd(20)}shallow`,
  ];
  for (const r of rows)
    out.push(
      `${runName(r).slice(0, 40).padEnd(40)} ${COLUMNS.map((c) => String(r.depth[c] ?? "-").padStart(9)).join("")}  ${handedOf(r.nxk).padEnd(20)}${shallow(r.depth) ? "yes" : ""}`,
    );
  if (rows.length) {
    const n = (k: keyof NxkSplit) => rows.filter((r) => r.nxk?.[k]).length;
    const handed = rows.some((r) => r.nxk)
      ? `${n("secondLook")} look, ${n("research")} research, ${n("panel")} panel`
      : "";
    out.push(
      `${`median, ${rows.length} sessions`.padEnd(40)} ${COLUMNS.map((c) =>
        String(median(rows.map((r) => r.depth[c]).filter(Number.isFinite)) ?? 0).padStart(9),
      ).join("")}  ${handed.padEnd(20)}${rows.filter((r) => shallow(r.depth)).length} of ${rows.length}`,
    );
  }
  return out;
}

/**
 * Lines for a case run several times: for each case, every repeat's score and depth, their mean and range. A difference
 * between versions smaller than the range of one version's repeats is not a difference.
 */
export function repeats(rows: DepthRow[]): string[] {
  const by = new Map<string, DepthRow[]>();
  for (const r of rows) {
    if (!by.has(r.case)) by.set(r.case, []);
    by.get(r.case)!.push(r);
  }
  const out = [
    `${"CASE".padEnd(40)} ${"scores".padEnd(16)} mean  range  ${["nxk", "looks", "after", "raw"].map((c) => c.padEnd(10)).join("")}${"followed".padEnd(16)}shallow`,
  ];
  for (const [key, of] of by) {
    if (of.length < 2) continue;
    const scores = of.map((r) => r.score),
      each = (c: keyof Depth) =>
        of
          .map((r) => r.depth?.[c] ?? "-")
          .join("/")
          .padEnd(10);
    const listed = scores.map((s) => s.toFixed(2)).join(" ");
    // A case here ran twice at least, so its scores have a mean.
    const average = (mean(scores) as number).toFixed(2);
    const range = (Math.max(...scores) - Math.min(...scores)).toFixed(2);
    const depths = (["nxk", "looks", "after", "raw"] as const).map(each).join("");
    const followed = of.map((r) => (r.depth?.nudges ? `${r.depth.followed}/${r.depth.nudges}` : "-")).join(" ");
    const shallows = of.filter((r) => r.depth && shallow(r.depth)).length;
    out.push(
      `${key.slice(0, 40).padEnd(40)} ${listed.padEnd(16)} ${average}  ${range}   ${depths}${followed.padEnd(16)}${shallows} of ${of.length}`,
    );
  }
  return out.length > 1 ? out : [];
}

function main(dirs: string[]) {
  const rows: DepthRow[] = [];
  for (const dir of dirs.map((d) => resolve(d))) {
    const saved: Results = JSON.parse(readFileSync(join(dir, "results.json"), "utf8"));
    for (const run of saved.runs.filter((r): r is ScoredRun => r.score !== undefined)) {
      const lines = traceOf(dir, run);
      if (lines)
        rows.push({
          case: run.case,
          rep: run.rep,
          score: run.score,
          depth: run.depth ?? depthOf(lines),
          nxk: run.nxk ?? nxkSplit(lines),
        });
      else console.log(`${runName(run)}: no transcript found`);
    }
  }
  const sorted = rows.sort((a, b) => a.case.localeCompare(b.case) || (a.rep ?? 0) - (b.rep ?? 0));
  const where = nxkLine(sorted);
  console.log([...table(sorted), ...(where ? ["", where] : []), "", ...repeats(sorted)].join("\n"));
}

if (isMain(import.meta.url)) main(process.argv.slice(2));
