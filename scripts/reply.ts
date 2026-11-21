// Reading a reply: the figures and labels in its lines, its drafts and blocks. Shared by note_check's checks
// (scripts/checks/) and the hooks; it judges nothing itself. What the tools printed is read from their log, as records
// (scripts/records.ts).
import type { FigureKind } from "./log.ts";

/**
 * A number as written in text: its value, the decimals it was written with, and, for a count written short ("6.2m"),
 * the full number each unit of it stands for (1e6).
 */
export interface WrittenNumber {
  value: number;
  decimals: number;
  scale?: number;
}

/** The form a number is given in: a percentage, money, or a plain number. */
export type NumberForm = "%" | "money" | "plain";

/** A number the owner gave, with its form: the owner's "$29" is not a reply's "29%". */
export interface GivenNumber {
  value: number;
  kind: NumberForm;
}

/** A run of the reply's lines read together: the line it starts at, and its lines. */
export interface Block {
  start: number;
  lines: string[];
}

/** A draft in the reply for the owner to use: where it is, and its text. */
export interface Draft {
  name: string;
  text: string;
}

/** A line of the reply that can carry claims (rowsOf). */
export interface ReplyRow {
  i: number;
  line: string;
  /** "line 12", for messages. */
  where: string;
  /** The line's own labels, or its lead-in's when it has none. */
  labels: Set<string>;
  /** Figures in digits. */
  figures: string[];
  /** Figures in words. */
  worded: string[];
}

// A figure: money, a percentage, "N in every N", "N of N", or a count written short ("6.2m", "2.4 million", "40k"),
// which may stand for a full number a tool printed and so needs a label like any other.
export const FIGURE =
  /[£$€]\s?\d(?:[\d,]*\d)?(?:\.\d+)?(?:\s?(?:m|bn|k|million|billion|thousand)\b)?|\b\d(?:[\d,]*\d)?(?:\.\d+)?\s?%|\b\d(?:[\d,]*\d)?(?:\.\d+)?\s+in\s+(?:every\s+)?[\d,]+\b|\b\d(?:[\d,]*\d)?(?:\.\d+)?\s+of\s+(?:the\s+|every\s+)?\d(?:[\d,]*\d)?\b|\b\d(?:[\d,]*\d)?(?:\.\d+)?\s?(?:m|bn|k|million|billion|thousand)\b/g;
// Figures about people written in words ("about a third of the people who could buy", "four times as many dog
// owners"). They take a label as figures in digits do, and are easier to leave without one.
const WHO =
  "(?:people|adults|customers|households|members|users|families|parents|students|owners|buyers|clients|residents|patients|subscribers|visitors|them)";
export const WORDS = new RegExp(
  [
    String.raw`\b(?:(?:a|one|two|three|four)\s+(?:half|third|quarter|fifth|tenth)s?|half)\s+of\s+(?:(?:the|your|all|those|these|their)\s+)?(?:[\w-]+\s+){0,3}?${WHO}\b`,
    String.raw`\b(?:one|two|three|four|five|six|seven|eight|nine)\s+in\s+(?:every\s+)?(?:two|three|four|five|six|seven|eight|nine|ten)\b`,
    String.raw`\b(?:twice|(?:two|three|four|five|six|seven|eight|nine|ten)\s+times)\s+as\s+(?:many|large|big)\b`,
  ].join("|"),
  "gi",
);
export const LABEL = /\b(given|counted|computed|simulated|measured|sourced|guess(?:ed)?|imagined)\b/gi;
export const TRACED: FigureKind[] = ["counted", "computed", "simulated", "measured"];
export const labelsIn = (line: string): Set<string> =>
  new Set((line.match(LABEL) ?? []).map((l) => l.toLowerCase().replace(/^guessed$/, "guess")));
/** Text compared as words: lower case, letters and digits only. */
export const plain = (s: string): string =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9£$€%]+/g, " ")
    .trim();

/** The numbers inside a piece of text, as { value, decimals }. Commas in thousands are read as such. */
export function numbersIn(text: string): WrittenNumber[] {
  return [...String(text).matchAll(/\d(?:[\d,]*\d)?(?:\.\d+)?/g)]
    .map((m) => {
      const raw = m[0].replace(/,(?=\d{3}\b)/g, "");
      return { value: Number(raw), decimals: raw.includes(".") ? raw.split(".")[1].length : 0 };
    })
    .filter((n) => Number.isFinite(n.value));
}

const ONES =
  "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split(
    " ",
  );
const TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split(" ");
const NUMBER_WORD = new RegExp(
  String.raw`\b(?:(${TENS.slice(2).join("|")})(?:[\s-](${ONES.slice(1, 10).join("|")}))?|(${ONES.join("|")}))\b`,
  "gi",
);
/** A text with its number words written as digits ("twelve-month" as "12-month", "twenty-five" as "25"): a format. */
export const withDigits = (text: string): string =>
  String(text).replace(NUMBER_WORD, (_: string, tens: string | undefined, unit: string | undefined, one: string) =>
    String(
      tens
        ? 10 * TENS.indexOf(tens.toLowerCase()) + (unit ? ONES.indexOf(unit.toLowerCase()) : 0)
        : ONES.indexOf(one.toLowerCase()),
    ),
  );

/** Whether a figure in a reply is one the owner gave, in the same form (a plain number on either side matches). */
export function ownersFigure(figure: string, owner: (number | GivenNumber)[]): boolean {
  const n = numbersIn(figure)[0];
  if (!n) return false;
  const kind = /%/.test(figure) ? "%" : /[£$€]/.test(figure) ? "money" : "plain";
  return owner.some((o) => {
    const f: GivenNumber = typeof o === "number" ? { value: o, kind: "plain" } : o;
    return Math.abs(f.value - n.value) < 1e-9 && (f.kind === kind || f.kind === "plain" || kind === "plain");
  });
}

/**
 * Whether a number appears among the logged numbers, or rounds one ("8.4" for 8.43, "8" for 8.4). Letting whole numbers
 * round makes the trace looser, since a long log holds many figures; that is the price of directional figures, and the
 * label and the group named beside the figure still have to fit.
 */
export function traced(number: WrittenNumber, logged: number[]): boolean {
  // A figure stands for anything that rounds to it: nxk is directional, so "about 27 in every 100" quotes a printed
  // 27.2, and a whole number is as good a quote as the decimals a tool printed.
  const tolerance = 0.5 * 10 ** -(number.decimals ?? 0) + 1e-9;
  if (logged.some((value) => Math.abs(value - number.value) <= tolerance)) return true;
  // A count written short ("17m", "2.4 million") may stand for the full number a tool printed (17,000,000), within
  // its rounding (17m is 16.5m to 17.5m).
  const scale = number.scale ?? 1;
  return (
    scale > 1 &&
    logged.some((value) => Math.abs(value - number.value * scale) <= 0.5 * 10 ** -number.decimals * scale + 1e-9)
  );
}

/** What each unit of a count written short stands for: "m" is 1e6. */
const SCALES: Record<string, number> = { m: 1e6, million: 1e6, bn: 1e9, billion: 1e9, k: 1e3, thousand: 1e3 };

/** The first number in a figure, with its scale when written short: "6.2m" is { value: 6.2, decimals: 1, scale: 1e6 }. */
export function figureNumber(figure: string): WrittenNumber | null {
  const n = numbersIn(figure)[0];
  if (!n) return null;
  const unit = /\d\s?(m|million|bn|billion|k|thousand)\b/i.exec(figure)?.[1]?.toLowerCase();
  return unit ? { ...n, scale: SCALES[unit] } : n;
}

/** The lines of the reply that are a draft for the owner to use: inside a fenced block, or quoted with ">". */
export function draftLines(lines: string[]): Set<number> {
  const out = new Set<number>();
  let fenced = false;
  lines.forEach((line, i) => {
    if (/^\s*```/.test(line)) {
      fenced = !fenced;
      out.add(i);
      return;
    }
    if (fenced || /^\s*>/.test(line)) out.add(i);
  });
  return out;
}

/**
 * The reply's blocks outside drafts, as [{ start, lines }]: a paragraph, or a top-level bullet or numbered point with
 * the indented lines under it. A blank line, a heading or a new top-level point starts a block.
 */
export function blocksOf(lines: string[], drafts: Set<number> = new Set()): Block[] {
  const out: (Block | null)[] = [];
  lines.forEach((line, i) => {
    if (drafts.has(i) || !line.trim()) {
      out.push(null);
      return;
    }
    const top = /^(?:[-*+]|\d+[.)])\s/.test(line) || line.startsWith("#") || /^\*\*[^*]+\*\*\s*$/.test(line);
    if (top || !out.length || out.at(-1) === null) out.push({ start: i, lines: [line] });
    else out.at(-1)!.lines.push(line);
  });
  return out.filter((block) => block !== null);
}

/**
 * The reply's points outside drafts, each read with the line that introduces it: a block (blocksOf), each table row on
 * its own, and for a list item or a row, its lead-in (leadIn). [{ start, lines }], the lead-in first.
 */
export function pointsOf(lines: string[], drafts: Set<number> = new Set()): Block[] {
  return blocksOf(lines, drafts).flatMap((block) => {
    const parts: Block[] = [];
    block.lines.forEach((line, k) => {
      const i = block.start + k;
      if (ROW.test(line) || !parts.length || ROW.test(lines[parts.at(-1)!.start]))
        parts.push({ start: i, lines: [line] });
      else parts.at(-1)!.lines.push(line);
    });
    return parts.map((p) => ({
      start: p.start,
      lines: [
        ...leadIn(lines, p.start)
          .filter((j) => !drafts.has(j))
          .map((j) => lines[j]),
        ...p.lines,
      ],
    }));
  });
}

/** The drafts in a reply, as [{ name, text }], one for each run of draft lines. */
export function draftsOf(lines: string[], drafts: Set<number>): Draft[] {
  const out: Draft[] = [];
  lines.forEach((line, i) => {
    if (!drafts.has(i)) return;
    const text = line.replace(/^\s*>\s?/, "").replace(/^\s*```.*$/, "");
    if (i > 0 && drafts.has(i - 1) && out.length) out[out.length - 1].text += `\n${text}`;
    else out.push({ name: `the draft at line ${i + 1}`, text });
  });
  return out.filter((d) => d.text.trim());
}

/**
 * The reply's lines that can carry claims, as [{ i, line, where, labels, figures, worded }]: not drafts or headings.
 * `figures` are in digits and `worded` in words; `labels` are the line's own, or its lead-in's when it has none
 * (bullets under a labelled lead-in such as "**Draws (simulated):**" take its label).
 */
export function rowsOf(lines: string[], drafts: Set<number>): ReplyRow[] {
  const out: ReplyRow[] = [];
  lines.forEach((line, i) => {
    if (drafts.has(i)) return;
    if (/^\s*#/.test(line)) return;
    const own = labelsIn(line),
      from = own.size ? [] : leadIn(lines, i);
    const labels = from.length
      ? new Set(from.filter((j) => !drafts.has(j)).flatMap((j) => [...labelsIn(lines[j])]))
      : own;
    out.push({
      i,
      line,
      where: `line ${i + 1}`,
      labels,
      figures: line.match(FIGURE) ?? [],
      worded: line.match(WORDS) ?? [],
    });
  });
  return out;
}

const ITEM = /^(\s*)(?:[-*+]|\d+[.)])\s/,
  ROW = /^\s*\|/;
/**
 * The lines that introduce line `i` when it is a list item or a table row, whose labels it takes when it has none of
 * its own: for an item, the line above the list or the item it is nested in (back over sibling items, their indented
 * continuations and blank lines); for a row, the table's header row and the line above the table. [] otherwise.
 */
export function leadIn(lines: string[], i: number): number[] {
  if (ROW.test(lines[i])) {
    let top = i;
    while (top > 0 && ROW.test(lines[top - 1])) top--;
    let above = top - 1;
    while (above >= 0 && !lines[above].trim()) above--;
    return [...(top < i ? [top] : []), ...(above >= 0 ? [above] : [])];
  }
  const item = ITEM.exec(lines[i]);
  if (!item) return [];
  const indent = item[1].length;
  for (let j = i - 1; j >= 0; j--) {
    if (!lines[j].trim()) continue;
    const other = ITEM.exec(lines[j]);
    if (other && other[1].length >= indent) continue;
    if (!other && lines[j].length - lines[j].trimStart().length > indent) continue;
    return [j];
  }
  return [];
}
