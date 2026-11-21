// The plumbing the eval code shares: the figures its summaries print, and the lines of a transcript or of any other
// file of JSON lines. A runner reads its command line as the scripts do (scripts/cli.ts argsOf, isMain, usage).
import { readFileSync } from "node:fs";

/** A block of a message as Claude Code keeps it, of the kinds the evals read: text, a tool's call, or its result. */
export type Block = TextBlock | ToolUseBlock | ToolResultBlock;

export interface TextBlock {
  type: "text";
  text: string;
}

/** What a tool call's input holds, as far as the evals read it: the file it wrote, or the subagent it started. */
export interface ToolInput {
  file_path?: string;
  subagent_type?: string;
  [key: string]: unknown;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input?: ToolInput;
}

/** A part of a tool's result, when it came back as a list: its text, if it is text. */
export interface ResultPart {
  type: string;
  text?: string;
}

export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content?: string | ResultPart[];
  is_error?: boolean;
}

/**
 * A line of a transcript, or of a session's stream-json output, as far as the evals read it: what kind it is, and for
 * a message, its content (text the owner typed, or blocks). `isSidechain` marks a subagent's line, `isMeta` one Claude
 * Code added itself (a hook's feedback, a reminder, a command's instructions).
 */
export interface Entry {
  type?: string;
  subtype?: string;
  message?: { role?: string; content?: string | Block[] };
  isSidechain?: boolean;
  isMeta?: boolean;
}

/** The mean of some numbers; undefined for none. */
export const mean = (xs: number[]): number | undefined =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined;

/** The median of some numbers; undefined for none. */
export function median(xs: number[]): number | undefined {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : undefined;
}

/** US dollars, to cents unless `digits` says otherwise. */
export const money = (usd: number, digits = 2): string => `$${usd.toFixed(digits)}`;

/** A file's lines, leaving out empty ones. */
export const linesOf = (file: string): string[] => readFileSync(file, "utf8").split("\n").filter(Boolean);

/**
 * The entries of a transcript, or of a session's stream-json output, from its lines: each line that holds a JSON
 * object, in order. Any other line (cut off, or not JSON) is skipped.
 */
export const entriesOf = (lines: string[] | null | undefined): Entry[] =>
  (lines ?? []).flatMap((line) => {
    try {
      const entry: unknown = JSON.parse(line);
      return entry !== null && typeof entry === "object" ? [entry as Entry] : [];
    } catch {
      return [];
    }
  });

/** The blocks of an entry's message: none when it has no message, or when its content is text the owner typed. */
export const blocksOf = (entry: Entry): Block[] => (Array.isArray(entry.message?.content) ? entry.message.content : []);
