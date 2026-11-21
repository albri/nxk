#!/usr/bin/env node
// Claude Code Stop and SubagentStop hook for nxk. nxk runs only when the owner asks: /nxk:look hands work to the
// second look (agents/second-look.md), /nxk:research a question to the researcher (agents/researcher.md), /nxk:meet a
// group to the panel (agents/panel.md), each in its own context. The main session is never held for nxk. Everything
// below holds the agents (SubagentStop, read from their own transcripts), and the main
// session only if it used nxk's tools itself, which it is told never to do.
// A session that used nxk does not end on one look: when it read a scan and asked
// nothing after, or never scanned and looked at the people fewer than three times (scripts/depth.ts), it is told to
// dig one more round, with the last next step a tool named.
// Nor does a session end while suggestions have been counted (the suggest tool ran) but the reply to the owner has
// not passed note_check since; nor while the owner's terms were counted (terms) and nothing sized after them, even
// for a page asked to be simple; nor while the explorer (explore_next) has named a move Claude can make itself and
// its last call found progress since the one before; nor, in advice, a plan or discovery with no suggest, while
// figures a tool printed (a count, a scan, a sum) have not been through note_check in a reply that passed. It reads
// the runs in the .nxk/log.jsonl files in the project written in the last six hours (scripts/records.ts), and holds
// only a session that counted suggestions itself (read from its transcript). It
// blocks once: when Claude tries to stop again after being told (stop_hook_active), it lets it, so a session can
// never be held for good.
import { type Dirent, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { isMain } from "../scripts/cli.ts";
import { callsOf, depthOf, nudgeLine, shallow, type TranscriptEntry } from "../scripts/depth.ts";
import { answeredTopics, check, ownerFigures, unchecked, unnoted } from "../scripts/note.ts";
import { findProduct, readProduct, runningScan, studyOf, type ExploreState, type Product } from "../scripts/product.ts";
import { paysOf, readLog, type LogRun } from "../scripts/records.ts";
import { readRecords, sourcesFile } from "../scripts/source.ts";

/** What a Stop or SubagentStop hook is given, as far as this one reads it. */
interface StopInput {
  /** Set when Claude is stopping again after being held once. */
  stop_hook_active?: boolean;
  hook_event_name?: string;
  /** The subagent's type, on SubagentStop. */
  agent_type?: string;
  cwd?: string;
  /** The session's transcript, and on SubagentStop the agent's own. */
  transcript_path?: string;
  agent_transcript_path?: string;
  last_assistant_message?: unknown;
}

/** The move the explorer named next. */
type ExploreMove = NonNullable<ExploreState["next"]>;

const RECENT = 6 * 3600 * 1000;
const SKIP = new Set([".git", "node_modules", "dist", "build", ".next"]);

/** The .nxk/log.jsonl files under a folder, at most `depth` folders down, changed since `since`. */
export function recentLogs(root: string, since: number, depth = 4): string[] {
  const out: string[] = [];
  const walk = (dir: string, d: number) => {
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (e.name === ".nxk") {
        const log = join(dir, ".nxk", "log.jsonl");
        if (existsSync(log) && statSync(log).mtimeMs >= since) out.push(log);
        continue;
      }
      if (d < depth && !SKIP.has(e.name)) walk(join(dir, e.name), d + 1);
    }
  };
  walk(root, 0);
  return out;
}

export { unchecked };

const ran = (tool: string) => (run: LogRun) => run.via === "script" && run.tool === tool;
/** Whether a log's runs end with the owner's terms counted and no suggestion counted after them. */
export function unsuggested(runs: LogRun[]): boolean {
  const lastTerms = runs.findLastIndex(ran("terms"));
  return lastTerms >= 0 && !runs.slice(lastTerms + 1).some(ran("suggest"));
}

/** Whether this session itself called an nxk tool (not merely read about it). */
export function ranTool(transcript: string, tool: string): boolean {
  const name = new RegExp(`(^|__)${tool}$`);
  for (const line of transcript.split("\n")) {
    if (!line.includes(tool)) continue;
    let entry: TranscriptEntry | null;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    // Only the session's own messages: Claude Code also logs each request it sent ("api-request-blob"), with copies.
    if (entry?.type !== "assistant") continue;
    for (const part of [entry?.message?.content ?? []].flat())
      if (typeof part !== "string" && part?.type === "tool_use" && name.test(part.name ?? "")) return true;
  }
  return false;
}
export const ranSuggest = (transcript: string): boolean => ranTool(transcript, "suggest");
/** Whether this session itself called any nxk tool. */
export function ranAnyTool(transcript: string): boolean {
  for (const line of transcript.split("\n")) {
    if (!line.includes("nxk__")) continue;
    let entry: TranscriptEntry | null;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry?.type !== "assistant") continue;
    for (const part of [entry?.message?.content ?? []].flat())
      if (typeof part !== "string" && part?.type === "tool_use" && /(^|_)nxk__/.test(part.name ?? "")) return true;
  }
  return false;
}

/**
 * The text of the transcript's last assistant message, from after its last tool call: the reply the owner reads.
 * Null when it has none.
 */
export function lastReply(transcript: string): string | null {
  const lines = transcript.split("\n"),
    texts: string[] = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    let entry: TranscriptEntry | null;
    try {
      entry = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    if (entry?.type === "user") break;
    if (entry?.type !== "assistant") continue;
    // A message of plain text holds no block.
    const parts = [entry.message?.content ?? []].flat().filter((p) => typeof p !== "string");
    if (parts.some((p) => p?.type === "tool_use")) break;
    texts.unshift(...parts.flatMap((p) => (p?.type === "text" && p.text?.trim() ? [p.text.trim()] : [])));
  }
  return texts.length ? texts.join("\n\n") : null;
}

/** note_check's failures on a reply, against a folder's log and the pages opened beside it; [] when it passes. */
export function replyFails(reply: string, logPath: string): string[] {
  const runs = readLog(logPath),
    folder = resolve(logPath, "..", "..");
  // The files the reply delivers are not known here: what is checked in them was checked when the reply passed.
  const findings = check(reply, runs, {
    delivered: null,
    sources: readRecords(sourcesFile(logPath, folder)),
    owner: ownerFigures(folder),
    pays: paysOf(runs),
    answered: answeredTopics(folder),
  });
  return findings.filter((f) => f.level === "FAIL").map((f) => f.message);
}

/** The explorer's named move when Claude can make it (not the owner's, not a stop) and the last call found progress; else null. */
export function exploring(product: Product | null): ExploreMove | null {
  // The explorer runs only while research is open, and keeps its state on that question (scripts/product.ts studyOf).
  const e = product ? studyOf(product)?.explore : null;
  return e?.next && ["free", "paid"].includes(e.next.kind) && e.progress ? e.next : null;
}

/**
 * Whether a session that used nxk stopped digging, and the move to make: the last next step a tool named, or a
 * general one. A scan still running in the background is waited for, not dug around. Null when it went far enough.
 */
export function shallowNote(lines: (string | TranscriptEntry)[], running = false): string | null {
  const calls = callsOf(lines);
  if (running || !calls.some((c) => c.nxk)) return null;
  const d = depthOf(lines);
  if (!shallow(d)) return null;
  const said = calls
    .filter((c) => c.nxk && !c.error)
    .map((c) => nudgeLine(c.text))
    .findLast(Boolean);
  // Each number of looks is said in words that fit it: no look is not "one look".
  const done = d.scans
    ? "read a scan and asked nothing after it, so the answer rests on one look"
    : d.looks === 0
      ? "did not look at the people, so the answer rests on no look at them"
      : d.looks === 1
        ? "looked at the people once, so the answer rests on one look"
        : `looked at the people ${d.looks === 2 ? "twice" : `${d.looks} times`}, so the answer rests on few looks`;
  const move =
    said ??
    "count the groups the answer turns on side by side (people count, groups separated by ;), profile the one you lean to, and split it by what marks it out";
  return `you ${done}. Dig one more round before you answer: ${move}. If the answer would not change whatever that shows, say why in a line.`;
}

/** The agent types nxk's agents run as: the plugin's name, then the agent's (hooks.json matches the same). */
export const ADVISOR = /^nxk:(second-look|researcher|panel)$/;
function main() {
  let input: StopInput = {};
  try {
    input = JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    /* no input: check anyway */
  }
  if (input.stop_hook_active) return;
  // nxk's agents are held on their own transcripts; any other subagent is not nxk's to hold.
  const advisor = input.hook_event_name === "SubagentStop";
  if (advisor && !ADVISOR.test(String(input.agent_type ?? ""))) return;
  const root = resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
  const path = advisor ? input.agent_transcript_path : input.transcript_path;
  let transcript: string | null = null;
  if (path)
    try {
      transcript = readFileSync(path, "utf8");
    } catch {
      /* unreadable: an agent is checked on the logs alone */
    }
  // nxk's own agent that never loaded its tools answered from what it already knew, with nothing counted: it is held
  // once to load them and look, as its steps say.
  if (advisor && transcript !== null && !ranAnyTool(transcript)) {
    const reason = [
      "nxk: you answered without nxk's tools, so nothing in it was counted.",
      "Load them (the ToolSearch line in your steps), then product and guide, and look at the people before you answer.",
      "End with the whole note or the whole findings: your last message is what goes back to the session.",
    ].join(" ");
    console.log(JSON.stringify({ decision: "block", reason }));
    return;
  }
  // Every reason below is about nxk's tools run in this session, so a session that ran none is let go before the
  // project is searched. The main session's is the only transcript that says so: unread, it is let go too.
  if (transcript === null ? !advisor : !ranAnyTool(transcript)) return;
  // A session is held once, so every reason goes into the one note, the one about digging further first.
  const reasons: string[] = [];
  const running = scanDirs(root).some((dir) => runningScan(dir)?.alive);
  // The panel counts its group once and draws from it: digging further is research's job, not a panel's.
  const panel = advisor && String(input.agent_type) === "nxk:panel";
  const thin = transcript === null || panel ? null : shallowNote(transcript.split("\n").filter(Boolean), running);
  if (thin) reasons.push(thin);
  // Only a session that explored itself is held for the explorer.
  if (transcript !== null && ranTool(transcript, "explore_next")) {
    let next: ExploreMove | null = null;
    try {
      next = exploring(readProduct(findProduct(root)));
    } catch {
      /* no knowledge base: nothing to hold for */
    }
    if (next)
      reasons.push(
        `the explorer named a next move you can make (${next.step}: ${next.tool}), and the last round made progress. Make it and call explore_next again, or tell the owner why you are stopping here.`,
      );
  }
  // A log that cannot be read (written by another version, or cut short) holds no one.
  const logs = recentLogs(root, Date.now() - RECENT).flatMap((file) => {
    try {
      return [{ file, log: readLog(file) }];
    } catch {
      return [];
    }
  });
  // Where the figures were printed, said in words (the project itself is "this project", never "."), and the folder to
  // give note_check, in full.
  const folders = (list: { file: string }[]) => list.map(({ file }) => resolve(file, "..", ".."));
  const at = (list: { file: string }[]) =>
    folders(list)
      .map((folder) => relative(root, folder) || "this project")
      .join(", ");
  const folderOf = (list: { file: string }[]) => folders(list).join(", ");
  // A session that counted the owner's terms itself and then sized nothing is held once.
  const terms =
    transcript !== null && ranTool(transcript, "terms") && !ranSuggest(transcript)
      ? logs.filter(({ log }) => unsuggested(log))
      : [];
  if (terms.length)
    reasons.push(
      [
        `the owner's terms in ${at(terms)} were counted (terms), but nothing was sized after them (suggest),`,
        "so it is not known whether a term shuts out a big group.",
        "Run suggest with the terms that may (suggestions: [] when none does: guide topic second-look),",
        "however short the request; or say in one line why not.",
      ].join(" "),
    );
  // Only a session that counted suggestions itself is held for them; for an agent whose transcript cannot be read, any
  // recent log counts.
  const open = transcript === null || ranSuggest(transcript) ? logs.filter(({ log }) => unchecked(log)) : [];
  if (open.length)
    reasons.push(
      [
        `the suggestions in ${at(open)} were counted (suggest) but the reply to the owner has not passed note_check since.`,
        `Check the reply with note_check, with folder ${folderOf(open)}, and fix what it reports,`,
        "or tell the user why it cannot be checked.",
      ].join(" "),
    );
  // Advice, a plan or discovery with no suggest: a session that printed figures itself (a count, a scan, a sum) is held
  // once until its reply passes note_check, which catches a simulated share given as how many would buy.
  const quiet =
    !open.length && transcript !== null && ranAnyTool(transcript) ? logs.filter(({ log }) => unnoted(log)) : [];
  if (quiet.length)
    reasons.push(
      [
        `figures were printed in ${at(quiet)} (counts, scans or sums), and the reply to the owner has not passed note_check since.`,
        `Check the reply with note_check, with folder ${folderOf(quiet)}: each figure needs its label,`,
        "and a simulated share is never how many would buy.",
        "Fix what it reports, or tell the user why it cannot be checked.",
      ].join(" "),
    );
  // The reply that passed note_check is not always the one sent: a reply rewritten after the check is what the owner
  // reads, so the last message is checked against the same log.
  if (!open.length && !quiet.length && transcript !== null && ranTool(transcript, "note_check")) {
    const reply =
      typeof input.last_assistant_message === "string" ? input.last_assistant_message : lastReply(transcript);
    const checked = logs
      .filter(({ log }) => log.some(ran("note")))
      .sort((a, b) => statSync(b.file).mtimeMs - statSync(a.file).mtimeMs)[0];
    const fails = reply && checked ? replyFails(reply, checked.file) : [];
    if (fails.length)
      reasons.push(
        `your last message is the reply the owner reads, and it is not the one that passed note_check: it fails it (${fails
          .slice(0, 5)
          .map((m) => `FAIL ${m}`)
          .join(" ")}). Fix these in the reply you end with.`,
      );
  }
  if (!reasons.length) return;
  const listed = reasons.length === 1 ? reasons[0] : reasons.map((r, i) => `(${i + 1}) ${r}`).join(" ");
  const end = advisor
    ? "Either way, end with the whole note or the whole findings, since your last message is what goes back to the session: not only an answer to this."
    : "Either way, the owner reads everything you write this turn: your reply above stands, so add only what is new, and do not write it out again.";
  console.log(JSON.stringify({ decision: "block", reason: `nxk: ${listed} ${end}` }));
}

/** The folders under `dir` (a few levels down) that hold nxk scans. */
function scanDirs(dir: string, depth = 4): string[] {
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
        } else if (n < depth && !SKIP.has(e.name)) walk(join(d, e.name), n + 1);
      }
  };
  walk(dir, 0);
  return out;
}

if (isMain(import.meta.url)) main();
