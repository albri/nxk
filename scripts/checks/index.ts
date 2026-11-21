// note_check's checks, one record each: { id, kind, why, run(ctx, { fail, warn }) }. A check's kind says what fires it
// and what it asks for, and so how far it can be trusted on a reply no one has seen:
//   format  text nxk defines or a tool prints (a label, a Decision's lines, a line a tool said to keep), found as written;
//   trace   a figure in the reply, found among what a tool printed;
//   quote   words the agent declared to a tool (a clash in the request, a fact only the owner can say, what a trial
//           costs), found where it said;
//   hint    a word pattern on the reply's own prose. Patterns fitted to a few dozen saved replies misread new ones (on
//           176 saved replies, the owner's-share pattern flagged 21 and was right once), so a hint only ever warns:
//           runChecks turns its failures into warnings.
// ctx is built by note.ts check(): the reply's lines, drafts, blocks and rows, the runs in the tools' log and what
// they traced, the owner's figures, the pages opened, what is delivered and what the agent declared it asks people to
// pay.
import type { FigureKind, Pay } from "../log.ts";
import type { LogRun } from "../records.ts";
import type { Block, Draft, GivenNumber, ReplyRow } from "../reply.ts";
import type { SourceRecord } from "../source.ts";
import { BUSINESS } from "./business.ts";
import { DELIVERED } from "./delivered.ts";
import { FIGURES } from "./figures.ts";
import { FORM } from "./form.ts";
import { GROUPS } from "./groups.ts";
import { LEGEND } from "./legend.ts";
import { REQUEST } from "./request.ts";

/** What fires a check and what it asks for (above). */
export type CheckKind = "format" | "trace" | "quote" | "hint";
export const CHECK_KINDS: CheckKind[] = ["format", "trace", "quote", "hint"];

/** Something delivered, read as a draft is: a file the reply hands over, a draft inside it, or the reply itself. */
export type Delivered = Draft;

/** A reply as the checks read it, with what the session around it left (note.ts check builds it). */
export interface CheckContext {
  /** The reply, whole. */
  text: string;
  lines: string[];
  /** The positions of the lines inside drafts. */
  drafts: Set<number>;
  /** The runs in the tools' log, or null when there is none. */
  runs: LogRun[] | null;
  /** The owner's figures, with their form (a bare number stands for any form). */
  owner: (number | GivenNumber)[];
  /** What the owner gave, as texts, or null when not known. */
  ownerTexts: string[] | null;
  /** The pages opened with source_check, or null when none were kept. */
  sources: SourceRecord[] | null;
  /** The words the reply is asked to keep within. */
  words: number;
  /** What the agent declared the reply and what it delivers ask a person to pay, or null when it declared nothing. */
  pays: Pay[] | null;
  /** The topics the owner has answered. */
  answered: string[];
  /** Every figure the tools printed, by its kind, or null when there is no log. */
  logged: Record<FigureKind, number[]> | null;
  /** Suggestions were counted and have not gone to the owner in a reply that passed. */
  suggested: boolean;
  blocks: Block[];
  rows: ReplyRow[];
  /** What is delivered: each file and each draft, or with neither, the reply itself. */
  items: Delivered[];
  /** The reply itself is what is delivered: it names no file and holds no draft. */
  replyDelivered: boolean;
  /** Whether the files the reply delivers are known (not on the Stop hook's check of the last message). */
  deliveredKnown: boolean;
}

/** How a check says what it found: one message a finding. */
export type Report = (message: string) => void;

/** A check: what it is for, of what kind, and how it reads a reply. */
export interface Check {
  id: string;
  kind: CheckKind;
  why: string;
  run(ctx: CheckContext, report: { fail: Report; warn: Report }): void;
}

/** A finding on a reply: whether it must be fixed, what it says, and the check that found it. */
export interface Finding {
  level: "FAIL" | "WARN";
  message: string;
  check: string;
}

export const CHECKS: Check[] = [...FORM, ...FIGURES, ...LEGEND, ...REQUEST, ...BUSINESS, ...GROUPS, ...DELIVERED];

/** Every finding of every check on a reply. A hint never fails. */
export function runChecks(ctx: CheckContext, checks: Check[] = CHECKS): Finding[] {
  const out: Finding[] = [];
  for (const c of checks) {
    const level = (wanted: Finding["level"]) => (c.kind === "hint" ? "WARN" : wanted);
    c.run(ctx, {
      fail: (message) => out.push({ level: level("FAIL"), message, check: c.id }),
      warn: (message) => out.push({ level: "WARN", message, check: c.id }),
    });
  }
  return out;
}
