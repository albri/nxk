// How far a session dug, read from its transcript: how many nxk calls it made, how many of them looked at the people
// or put something to them, whether it went on asking after the first scan, how often it switched between looking,
// testing and keeping, whether it ran its own scripts on the raw files, whether it took the next step nxk named, and
// what each step that looked further came to (changed the choice, confirmed it, or could not tell).
// The Stop hook holds a session that stopped digging (shallow) once; evals/depth.ts prints it for eval runs.

import { OUTCOMES, type ResolutionOutcome } from "./log.ts";

/** A tool call in an assistant message. */
export interface ToolUse {
  type: "tool_use";
  id: string;
  name: string;
  input?: Record<string, unknown>;
}

/** A tool's result in a user message: the call it answers, what the tool said, and whether it failed. */
export interface ToolResult {
  type: "tool_result";
  tool_use_id: string;
  content?: string | (string | { text?: string } | null)[];
  is_error?: boolean;
}

/** Text in a message. */
export interface TextBlock {
  type: "text";
  text: string;
}

/** A block Claude Code also writes, which nothing here reads. */
export interface OtherBlock {
  type: "thinking" | "redacted_thinking" | "image" | "document";
}

export type Block = ToolUse | ToolResult | TextBlock | OtherBlock;

/** A line of a Claude Code transcript (JSONL), as far as nxk reads one. */
export interface TranscriptEntry {
  type?: string;
  /** A line of a subagent's, in the session's own transcript. */
  isSidechain?: boolean;
  /** A note Claude Code added in the person's turn. */
  isMeta?: boolean;
  message?: { role?: string; content?: string | (Block | null)[] };
}

/** A tool call in a transcript, with what it said; `nxk` for one of nxk's own tools, named without its prefix. */
export interface Call {
  name: string;
  input: Record<string, unknown>;
  text: string;
  error: boolean;
  nxk: boolean;
}

/** The steps that looked further, by what they came to. */
export type Resolutions = Record<ResolutionOutcome, number>;

/** How deep one session went (depthOf). */
export interface Depth extends Resolutions {
  calls: number;
  nxk: number;
  distinct: number;
  looks: number;
  tests: number;
  scans: number;
  after: number;
  switches: number;
  shell: number;
  raw: number;
  scripts: number;
  web: number;
  nudges: number;
  followed: number;
  errors: number;
}

// What each call is for. Looking: at the people, the saved answers or the raw files. Testing: putting options to the
// people, or sizing a suggestion. Keeping: what is learned, written into nxk.json. Checking: the reply and its sources.
const KIND: Record<string, string[]> = {
  look: ["people", "sweep", "terms", "probe", "people_pull", "corner_split", "segments"],
  test: ["options_scan", "ideas_scan", "ideas_deal", "suggest", "sums"],
  keep: ["segment_add", "segment_rival", "research_start", "outcome_record", "owner_answer"],
  check: ["note_check", "source_check", "WebSearch", "WebFetch"],
  steer: ["product", "guide", "explore_next", "owner_ask"],
};
const kindOf = (name: string) => Object.keys(KIND).find((k) => KIND[k].includes(name)) ?? null;
const SCANS = ["options_scan", "ideas_scan"];
// A shell command or file read that touches the raw files nxk writes, or the scans' saved answers.
const RAW = /\.nxk\/(?:data|scans)\b|people-(?:uk|us)[^\s'"]*\.csv/;
const SCRIPT_FILE = /\.(?:py|mjs|js|cjs|ts|sh|r|sql)$/i;

/**
 * The tool calls in a transcript, in order: { name, input, text, error }, nxk's own without their prefix. A subagent's
 * lines (isSidechain) are another agent's calls, left out of a session's own transcript unless `agents` asks for them.
 * A subagent's own transcript, every line of it a sidechain (nxk's advisor, held by SubagentStop), is read whole.
 */
export function callsOf(
  lines: (string | TranscriptEntry)[],
  { agents = null }: { agents?: boolean | null } = {},
): Call[] {
  const calls = new Map<string, Omit<Call, "nxk">>(),
    order: string[] = [];
  const entries = lines.flatMap((line): TranscriptEntry[] => {
    try {
      return [typeof line === "string" ? JSON.parse(line) : line];
    } catch {
      return [];
    }
  });
  const sidechains = agents ?? !entries.some((e) => e?.type === "assistant" && !e.isSidechain);
  for (const e of entries) {
    if (e?.isSidechain && !sidechains) continue;
    for (const b of [e?.message?.content ?? []].flat()) {
      // A message of plain text holds no tool call.
      if (typeof b === "string") continue;
      if (e.type === "assistant" && b?.type === "tool_use" && !calls.has(b.id)) {
        calls.set(b.id, { name: String(b.name), input: b.input ?? {}, text: "", error: false });
        order.push(b.id);
      }
      if (e.type === "user" && b?.type === "tool_result" && calls.has(b.tool_use_id)) {
        const c = calls.get(b.tool_use_id)!;
        c.text = [b.content ?? []]
          .flat()
          .map((x) => (typeof x === "string" ? x : (x?.text ?? "")))
          .join("");
        c.error = Boolean(b.is_error);
      }
    }
  }
  // Every id in `order` was set in `calls` with it.
  return order
    .map((id) => calls.get(id)!)
    .map((c) => ({
      ...c,
      nxk: c.name.startsWith("mcp__plugin_nxk_nxk__"),
      name: c.name.replace(/^mcp__plugin_nxk_nxk__/, ""),
    }));
}

/**
 * What the steps that looked further came to, as the tools printed it: each distinct "Looked further at ... Result: ..."
 * line in nxk's answers, by outcome. { changed, confirmed, unclear }.
 */
export function resolutionsIn(calls: Pick<Call, "nxk" | "error" | "text">[]): Resolutions {
  // Each outcome by its words: the keys of OUTCOMES are the outcomes.
  const outcome: Record<string, ResolutionOutcome> = Object.fromEntries(
    Object.entries(OUTCOMES).map(([k, words]) => [words, k as ResolutionOutcome]),
  );
  const seen = new Map<string, ResolutionOutcome>();
  for (const c of calls.filter((c) => c.nxk && !c.error))
    for (const m of c.text.matchAll(/Looked further at [^\n]*?\bResult: (changed|confirmed|could not tell)\b[^\n"]*/g))
      seen.set(m[0], outcome[m[1]]);
  const out: Resolutions = { changed: 0, confirmed: 0, unclear: 0 };
  for (const k of seen.values()) out[k]++;
  return out;
}

/** Whether a call ran or read something of the raw files: a shell command, a file read, or a script written to do so. */
const rawUse = (c: Pick<Call, "name" | "input">) =>
  ["Bash", "Read", "Write", "Edit"].includes(c.name) && RAW.test(JSON.stringify(c.input));
/** The tool a nudge names: "Next: <tool> ..." (or "Next (<step>): <tool> ...") on a line of its own in an nxk tool's output. */
export const nudgeOf = (text: string): string | null => {
  const m = /^Next(?: \(([a-z]+)\))?: ([a-z_]+)/m.exec(String(text));
  return m ? m[2] : null;
};
/** The whole nudge line, for repeating it. */
export const nudgeLine = (text: string): string | null => /^Next(?: \([a-z]+\))?: .*$/m.exec(String(text))?.[0] ?? null;

/**
 * How deep one session went. calls: every tool call but loading tools; nxk: calls to nxk's tools, distinct: how many
 * of them; looks and tests: calls that looked at people (the raw files too) or put something to them; scans; after:
 * looks and tests made after the first scan, not counting reading that scan again for everyone; switches: changes between looking, testing, keeping and
 * checking, in order (more is more back and forth); shell: shell commands, raw: calls on the raw files or saved
 * answers, scripts: script files written; web: searches and pages opened; nudges: nxk outputs that named a next step,
 * followed: how many of those were taken (the next nxk call is the tool named); errors: nxk calls that failed;
 * changed, confirmed and unclear: the steps that looked further, by what they came to (resolutionsIn).
 */
export function depthOf(
  lines: (string | TranscriptEntry)[],
  { agents = null }: { agents?: boolean | null } = {},
): Depth {
  const calls = callsOf(lines, { agents }).filter((c) => c.name !== "ToolSearch");
  const kinds = calls.map((c) => (rawUse(c) ? "look" : kindOf(c.name))).filter(Boolean);
  const firstScan = calls.findIndex((c) => SCANS.includes(c.name) && !c.error);
  // Reading the same scan again for everyone (it was left running, or printed once more) asks nothing new; a read for
  // a group does.
  const label = (c: Call) => String(c.input?.label ?? "");
  const again = (c: Call, i: number) =>
    SCANS.includes(c.name) &&
    !c.input?.who &&
    calls.slice(0, i).some((b) => SCANS.includes(b.name) && label(b) === label(c));
  const looksOrTests = (list: Call[], from: number) =>
    list.filter((c, k) => {
      const kind = rawUse(c) ? "look" : kindOf(c.name);
      return !again(c, from + k) && (kind === "look" || kind === "test");
    }).length;
  const nxk = calls.filter((c) => c.nxk);
  let nudges = 0,
    followed = 0;
  calls.forEach((c, i) => {
    const named = c.nxk ? nudgeOf(c.text) : null;
    if (!named) return;
    nudges++;
    if (calls.slice(i + 1).find((b) => b.nxk)?.name === named) followed++;
  });
  return {
    calls: calls.length,
    nxk: nxk.length,
    distinct: new Set(nxk.map((c) => c.name)).size,
    looks: kinds.filter((k) => k === "look").length,
    tests: kinds.filter((k) => k === "test").length,
    scans: calls.filter((c) => SCANS.includes(c.name)).length,
    after: firstScan < 0 ? 0 : looksOrTests(calls.slice(firstScan + 1), firstScan + 1),
    switches: kinds.filter((k, i) => i > 0 && k !== kinds[i - 1]).length,
    shell: calls.filter((c) => c.name === "Bash").length,
    raw: calls.filter(rawUse).length,
    scripts: calls.filter((c) => c.name === "Write" && SCRIPT_FILE.test(String(c.input.file_path ?? ""))).length,
    web: calls.filter((c) => ["WebSearch", "WebFetch", "source_check"].includes(c.name)).length,
    nudges,
    followed,
    errors: nxk.filter((c) => c.error).length,
    ...resolutionsIn(calls),
  };
}

/** A session that stopped digging: it scanned and asked nothing after, or never scanned and looked fewer than three times. */
export const shallow = (d: Pick<Depth, "scans" | "after" | "looks">): boolean =>
  d.scans ? d.after === 0 : d.looks < 3;
