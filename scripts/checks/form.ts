// The reply's form: the short note of what is worth considering, the lines a tool said to keep, what each step that
// looked further found, and the length. All are text nxk defines or prints, looked for as written.
import { clashesOf, keptLines, openOf, raisedOf, resolutionsOf } from "../records.ts";
import { blocksOf, labelsIn, leadIn, plain, type Block, type ReplyRow } from "../reply.ts";
import { legendLines } from "./legend.ts";
import { OPEN_MARK } from "../terms.ts";
import { NOTE_ITEMS, NOTE_LEAD } from "../suggest-print.ts";
import type { Check, CheckContext } from "./index.ts";
/**
 * The words a reply is asked to keep within. Without nxk, replies to the same requests ran to about 300 words; the
 * owner skims anything much longer. The length check fails the session's own prose over it (requiredLines), and warns
 * when the whole reply is.
 */
export const REPLY_WORDS = 400;

/** The longest a note's item may run, in words: one or two lines. */
export const ITEM_WORDS = 50;
const LOOKED = /^\s*(?:[-*+]\s+)?Looked further at\b/;
const LINK = /https?:\/\/\S+/;
/** Words as the length check counts them: anything with a letter, a digit or a currency sign. */
export const wordCount = (text: string): number =>
  String(text)
    .split(/\s+/)
    .filter((w) => /[A-Za-z0-9£$€]/.test(w)).length;

/** The note in the reply: the line its lead is on, and the points under it. */
export interface Note {
  lead: number;
  items: Block[];
}

/**
 * The note in the reply, outside drafts: the line that starts with its lead ("Worth considering:", bold or as a heading
 * allowed) and the points under it, or null when there is none.
 */
export function noteOf(ctx: Pick<CheckContext, "lines" | "drafts">): Note | null {
  const lead = plain(NOTE_LEAD);
  const at = ctx.lines.findIndex(
    (line, i) =>
      !ctx.drafts.has(i) && plain(line.replace(/^\s*(?:#+\s*|\*\*)/, "")).startsWith(lead) && !/^\s*[-*+]\s/.test(line),
  );
  if (at < 0) return null;
  const items: Block[] = [];
  // Its items are the points that follow it, up to the first block that is not a point.
  for (const block of blocksOf(ctx.lines, ctx.drafts).filter((b) => b.start > at)) {
    if (!/^\s*(?:[-*+]|\d+[.)])\s/.test(ctx.lines[block.start])) break;
    items.push(block);
  }
  return { lead: at, items };
}

/**
 * The reply's lines that the other checks, a reader's question or the request ask for, as a set of line numbers:
 * drafts (what the request asked for), the note and its items, each line a tool said to keep and each "Looked further"
 * line, the line that says what the labels mean, a sourced line with its link, and each point that puts something to
 * the owner (marked theirs to confirm, or a question naming an open fact or both sides of a contradiction). The rest is
 * the session's own prose: the length check never makes a session cut these to fit.
 */
export function requiredLines(
  ctx: Pick<CheckContext, "lines" | "drafts" | "runs"> & { rows?: ReplyRow[] },
): Set<number> {
  const out = new Set(ctx.drafts);
  const runs = ctx.runs ?? [];
  const kept = [...keptLines(runs), ...resolutionsOf(runs).map((r) => r.text)].map(plain).filter(Boolean);
  ctx.lines.forEach((line, i) => {
    if (out.has(i) || !line.trim()) return;
    const p = plain(line);
    if (LOOKED.test(line) || kept.some((k) => p.includes(k)) || (labelsIn(line).has("sourced") && LINK.test(line)))
      out.add(i);
  });
  const note = noteOf(ctx);
  if (note) {
    out.add(note.lead);
    for (const item of note.items) item.lines.forEach((_, k) => out.add(item.start + k));
  }
  for (const i of legendLines(ctx).keys()) out.add(i);
  const mark = plain(OPEN_MARK);
  const topics = openOf(runs).map(plain);
  const clashes = clashesOf(runs).map(({ a, b }) => [plain(a), plain(b)]);
  for (const block of blocksOf(ctx.lines, ctx.drafts)) {
    // A point under a lead-in ("Yours to confirm:") is read with it.
    const text = [...leadIn(ctx.lines, block.start).map((j) => ctx.lines[j]), ...block.lines].join(" ");
    const p = plain(text);
    const named = topics.some((t) => p.includes(t)) || clashes.some(([a, b]) => p.includes(a) && p.includes(b));
    if (p.includes(mark) || (named && text.includes("?"))) block.lines.forEach((_, k) => out.add(block.start + k));
  }
  return out;
}

export const FORM: Check[] = [
  {
    // The owner reads two or three short points beside the work, not a list: each item says who it affects, about how
    // many, and the alternative they can take with a word.
    id: "note",
    kind: "format",
    why: `The note of what is worth considering (its lead "${NOTE_LEAD}") has at most ${NOTE_ITEMS} items, each one or two lines.`,
    run(ctx, { fail, warn }) {
      const note = noteOf(ctx);
      if (!note) {
        const raised = ctx.runs === null ? [] : raisedOf(ctx.runs);
        if (ctx.suggested && raised.length)
          warn(
            [
              `suggest found ${raised.length} worth raising (${raised.map((r) => r.suggestion).join(", ")}), and the reply has no "${NOTE_LEAD}" note.`,
              `After what you built, give the largest, at most ${NOTE_ITEMS}, as suggest printed them, unless none would change what the owner does.`,
            ].join(" "),
          );
        return;
      }
      if (note.items.length > NOTE_ITEMS)
        fail(
          `"${NOTE_LEAD}" has ${note.items.length} items: keep at most ${NOTE_ITEMS}, the ones that would change what the owner does, and leave the rest out.`,
        );
      // The line that says what the labels mean is not part of a point, even with no blank line before it.
      const legend = legendLines(ctx);
      for (const item of note.items) {
        const words = wordCount(item.lines.filter((_, k) => !legend.has(item.start + k)).join(" "));
        if (words > ITEM_WORDS)
          fail(
            `line ${item.start + 1}: a note item of ${words} words, over ${ITEM_WORDS}. One or two lines: who, about how many, why it matters to this owner, and what you would do if they say yes.`,
          );
      }
    },
  },
  {
    id: "brackets",
    kind: "format",
    why: "After suggest, nothing in the reply's own lines is left in [brackets]: placeholders go in the page or draft.",
    run(ctx, { fail }) {
      if (!ctx.suggested) return;
      ctx.lines.forEach((line, i) => {
        if (!ctx.drafts.has(i) && /\[[^\]]{3,}\]/.test(line) && !/\]\(/.test(line))
          fail(`line ${i + 1}: something is still in [brackets]: ${line.trim().slice(0, 90)}`);
      });
    },
  },
  {
    id: "kept-line",
    kind: "format",
    why: 'A line a tool said to keep in the reply ("Keep in the reply, outside any draft") is there, outside any draft.',
    run(ctx, { fail }) {
      if (ctx.runs === null) return;
      const said = ctx.lines
        .filter((line, i) => !ctx.drafts.has(i))
        .map(plain)
        .join(" ");
      for (const text of keptLines(ctx.runs))
        if (!plain(said).includes(plain(text)))
          fail(`a tool said to keep this line in the reply, outside any draft, and it is not there: "${text}"`);
    },
  },
  {
    // A step that looked further (a close call, a probe, a scan read, the explorer's moves, a split) ends with what it
    // found: without the line, the owner never learns that it was looked at, or what came of it.
    id: "looked-further",
    kind: "format",
    why: 'Each step that looked further has its "Looked further at ... Result: ..." line in the reply, outside any draft, as the tool printed it.',
    run(ctx, { fail }) {
      if (ctx.runs === null) return;
      const said = plain(
        ctx.lines
          .filter((line, i) => !ctx.drafts.has(i))
          .map(plain)
          .join(" "),
      );
      for (const { text } of resolutionsOf(ctx.runs))
        if (!said.includes(plain(text)))
          fail(
            `a tool looked further and printed what it found, and the reply leaves it out. Put this line in the reply, outside any draft, as written: "${text}"`,
          );
    },
  },
  {
    id: "length",
    kind: "format",
    why: "The session's own prose, outside the lines the other checks ask for, is about as long as asked: the owner skims anything much longer.",
    run(ctx, { fail, warn }) {
      const count = wordCount(ctx.text);
      const required = requiredLines(ctx);
      const prose = wordCount(ctx.lines.filter((_, i) => !required.has(i)).join("\n"));
      const keep =
        "keep every line the other checks ask for (the note, lines a tool said to keep, what is yours to confirm, drafts)";
      if (prose > ctx.words)
        fail(
          `${prose} words of your own prose (the reply is ${count}): the owner skims anything over about ${ctx.words}. Say your own part in fewer words, and ${keep}.`,
        );
      else if (count > ctx.words)
        warn(
          `${count} words, over the ${ctx.words} asked for (${prose} of them your own prose): say your part in fewer words.`,
        );
    },
  },
];
