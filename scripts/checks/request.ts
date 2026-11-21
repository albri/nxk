// What the owner's request settled, as the tools read it: the owner's terms kept in what is delivered, no rule in it
// that the owner gave nowhere, the places the request contradicts itself, and what it leaves for the owner to say
// (as the agent listed them for terms).
import { plural } from "../format.ts";
import { textOf } from "../html.ts";
import { clashesOf, openOf, ownerTermsOf } from "../records.ts";
import { numbersIn, plain, pointsOf, withDigits } from "../reply.ts";
import { OPEN_MARK } from "../terms.ts";
import type { Check } from "./index.ts";

// The kinds of term whose figures what is delivered states: a price, hours, a commitment, a limit, an age, a later
// charge, a requirement. A size ("we manage 400 flats"), a place or a name is about the business, not a term a page
// repeats.
const STATED = new Set(["price", "hours", "commitment", "limit", "age", "later", "requirement"]);

// A figure that makes a rule: money, a share, or a length of time. Written as a format (a currency sign, "p" after
// pence, "%" or "per cent", and a unit of time), never as a phrase.
const RULE_FIGURE =
  /[£$€]\s?\d(?:[\d,]*\d)?(?:\.\d+)?|\b\d+(?:\.\d+)?p\b|\b\d+(?:\.\d+)?\s?(?:%|per ?cent\b)|\b\d+(?:\.\d+)?(?:[\s-]+|\s?)(?:working[\s-]+|business[\s-]+|calendar[\s-]+)?(?:minutes?|mins?|hours?|hrs?|days?|weeks?|months?|years?|yrs?)\b/gi;
// A length of time in hours, so that "two weeks" and "14 days", or "12 months" and "1 year", are the same figure.
const HOURS: Record<string, number> = {
  min: 1 / 60,
  hour: 1,
  hr: 1,
  day: 24,
  week: 168,
  month: 730,
  year: 8760,
  yr: 8760,
};
const unitOf = (figure: string) => /(min|hour|hr|day|week|month|year|yr)/i.exec(figure)?.[1].toLowerCase() ?? "";

/** What a figure that makes a rule is: money, a share, or a length of time. */
export type RuleKind = "money" | "share" | "time";

/** A figure that makes a rule, as what it is: its kind, and its value (time in hours; money in pounds or dollars). */
export interface RuleFigure {
  kind: RuleKind;
  value: number;
  /** For an amount written in pence, the pence. */
  pence?: number;
}

/** A figure as what it is (time in hours). */
export function ruleFigure(figure: string): RuleFigure {
  const value = numbersIn(figure)[0]?.value;
  if (/[£$€]/.test(figure)) return { kind: "money", value };
  if (/\dp\b/i.test(figure)) return { kind: "money", value: value / 100, pence: value };
  if (/%|per ?cent/i.test(figure)) return { kind: "share", value };
  return { kind: "time", value: value * HOURS[unitOf(figure)] };
}

/** The rule figures in a text, with their words, number words read as digits and [placeholders] left out. */
export function ruleFiguresIn(text: string): (RuleFigure & { text: string })[] {
  const bare = withDigits(String(text).replace(/\[[^\]\n]{1,120}\]|\{\{[^}\n]{1,120}\}\}/g, " "));
  return [...bare.matchAll(RULE_FIGURE)].map((m) => ({ text: m[0].trim(), ...ruleFigure(m[0]) }));
}

// A period the owner names with no number ("£60 a year", "paid monthly"): one of that unit, so a page that says a
// permit lasts 12 months is not taken for a rule of its own. Read on the owner's side only.
const PERIOD =
  /\b(?:(?:a|an|per|each|every)\s+(?:working\s+|business\s+|calendar\s+)?(minute|hour|day|week|month|year)|(hour|dai|week|month|year)ly|(annual)(?:ly)?)\b/gi;
const periodsIn = (text: string) =>
  [...String(text).matchAll(PERIOD)].map((m): RuleFigure & { text: string } => {
    const unit = (m[1] ?? m[2] ?? m[3])
      .toLowerCase()
      .replace(/^dai$/, "day")
      .replace(/^annual$/, "year");
    return { text: m[0], kind: "time", value: HOURS[unit] };
  });

/** The figures a rule could be made of that the owner gave, by kind: money to the penny, time in hours. */
export type GivenFigures = Record<RuleKind, Set<number>>;

/**
 * What the owner gave, as the figures a rule could be made of: money, shares and lengths of time in their texts, and
 * what follows from their own amounts (a sum of two, or one taken up to 24 times or as often as one of their counts,
 * and a sum of that and another: a year of £29 a month with a £20 fee is £368). A figure in a page opened with
 * source_check is the law's or a publisher's, not the session's, and counts as given too.
 */
export function givenFigures(texts: string[]): GivenFigures {
  const figures = texts.flatMap((text) => [...ruleFiguresIn(text), ...periodsIn(text)]);
  const plainCounts = texts
    .flatMap((text) => numbersIn(withDigits(text)).map((n) => n.value))
    .filter((v) => v > 0 && v <= 100 && Number.isInteger(v));
  const money = [...new Set(figures.filter((f) => f.kind === "money").map((f) => f.value))].slice(0, 40);
  const times = new Set([...new Set(plainCounts), ...Array.from({ length: 24 }, (_, i) => i + 1)]);
  const derived = new Set(money);
  for (const a of money) {
    for (const k of times) derived.add(+(a * k).toFixed(2));
    for (const b of money) {
      derived.add(+(a + b).toFixed(2));
      derived.add(+Math.abs(a - b).toFixed(2));
      for (const k of times) derived.add(+(a * k + b).toFixed(2));
    }
  }
  return {
    money: derived,
    share: new Set(figures.filter((f) => f.kind === "share").map((f) => f.value)),
    time: new Set(figures.filter((f) => f.kind === "time").map((f) => +f.value.toFixed(4))),
  };
}

/** Whether a rule figure is among what the owner gave (givenFigures). */
export const isGiven = (figure: RuleFigure, given: GivenFigures): boolean =>
  figure.kind === "time"
    ? given.time.has(+figure.value.toFixed(4))
    : given[figure.kind].has(figure.kind === "money" ? +figure.value.toFixed(2) : figure.value);

/** The sentences of a delivered text, as read by a person: tags gone, split at a full stop, a line break or a bullet. */
const sentencesIn = (text: string): string[] =>
  textOf(text)
    .split(/(?<=[.!?])\s+|\n+|\s+[•·]\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

/** The [placeholders] and {{placeholders}} in a text, as words: a link's [text](url) is not one. */
export const placeholdersIn = (text: string): string[] =>
  [...String(text).matchAll(/\[([^[\]\n]{2,80})\](?!\()|\{\{([^{}\n]{2,80})\}\}/g)].map((m) => plain(m[1] ?? m[2]));

export const REQUEST: Check[] = [
  {
    // The deliverable is the owner's: a price, a contract or a requirement they set is built as they set it. A change
    // nxk finds worth making goes in the note as an offer, never into the work.
    id: "terms-kept",
    kind: "quote",
    why: "Each figure in a term the owner set (a price, hours, a commitment, a limit, an age, a later charge, a requirement), as the session listed it for terms, is in what is delivered.",
    run(ctx, { fail }) {
      if (ctx.runs === null || ctx.deliveredKnown === false) return;
      const said = ctx.items.flatMap((item) => numbersIn(withDigits(textOf(item.text))).map((n) => n.value));
      const names = ctx.items.map((item) => item.name).join(", ");
      for (const term of ownerTermsOf(ctx.runs)) {
        if (!STATED.has(term.kind)) continue;
        for (const quote of term.quotes ?? []) {
          const missing = numbersIn(withDigits(quote)).filter((n) => !said.some((v) => Math.abs(v - n.value) < 1e-9));
          if (!missing.length) continue;
          const are = plural(missing.length, "is", "are");
          fail(
            [
              `The owner set "${quote}" (as you listed it for terms), and ${missing.map((n) => n.value).join(", ")} ${are} in nothing delivered (${names}).`,
              `Build the owner's terms as they set them; offer a change in the note ("Worth considering"), never make it.`,
              "If it is a figure the work need not state, it is not a term: leave it out of terms.",
            ].join(" "),
          );
        }
      }
    },
  },
  {
    // A rule the owner never gave (a notice period, an age limit, a fee, a deadline) written into a page reads as
    // theirs. Code cannot read a rule from its words, so this looks only at figures a rule is made of, by their form:
    // money, a share, a length of time. A rule with no figure ("members can leave early if they move away") is not
    // seen. It warns: a figure the law sets, or one worked out from the owner's, is often right to state.
    id: "rule-given",
    kind: "trace",
    why: [
      "A figure in what is delivered that makes a rule (money, a share, a length of time) and that the owner gave nowhere",
      "(the request, what they typed, nxk.json, the project's own files, a page opened with source_check) is pointed out with its line.",
    ].join(" "),
    run(ctx, { warn }) {
      if (ctx.replyDelivered || !ctx.ownerTexts) return;
      const given = givenFigures(ctx.ownerTexts);
      for (const item of ctx.items) {
        const seen = new Set();
        for (const sentence of sentencesIn(item.text)) {
          const added = ruleFiguresIn(sentence).filter((f) => !isGiven(f, given) && !seen.has(f.text.toLowerCase()));
          for (const f of added) seen.add(f.text.toLowerCase());
          if (!added.length) continue;
          const are = plural(added.length, "is", "are");
          warn(
            [
              `${item.name}: "${sentence.slice(0, 140)}": ${added.map((f) => f.text).join(", ")} ${are} in nothing the owner gave.`,
              "If it is a rule of yours, take it out and offer it in the note, or leave a [placeholder] for the owner; if the law sets it, open that page with source_check.",
            ].join(" "),
          );
        }
      }
    },
  },
  {
    // A request that contradicts itself (fees fixed for the year, and reviewed every term) cannot be drafted from as
    // written: only the owner can say which side holds. Listing both sides is not putting it to them: the point asks
    // which holds, or gives the reading written and marks it theirs to confirm, as an open fact is.
    id: "clash",
    kind: "quote",
    why: [
      "A place the request contradicts itself, as the agent listed it for terms, is put to the owner outside any draft:",
      `both sides in the owner's words in one point, asked (a question) or marked "${OPEN_MARK}".`,
    ].join(" "),
    run(ctx, { fail }) {
      if (ctx.runs === null) return;
      const mark = plain(OPEN_MARK);
      const points = pointsOf(ctx.lines, ctx.drafts).map((p) => p.lines.join(" "));
      for (const { a, b } of clashesOf(ctx.runs)) {
        const both = points.filter((p) => plain(p).includes(plain(a)) && plain(p).includes(plain(b)));
        if (both.some((p) => p.includes("?") || plain(p).includes(mark))) continue;
        fail(
          both.length
            ? [
                `The request contradicts itself ("${a}" against "${b}", as you listed it for terms), and the reply gives both sides without putting them to the owner.`,
                `In that point, ask which holds, or say which reading you wrote and end with "${OPEN_MARK}".`,
              ].join(" ")
            : [
                `The request contradicts itself ("${a}" against "${b}", as you listed it for terms), and no point of the reply outside a draft gives both.`,
                `In one point, quote both in the owner's words and ask which holds, or say which reading you wrote and end with "${OPEN_MARK}".`,
              ].join(" "),
        );
      }
    },
  },
  {
    // A vague request ("sort out a returns policy for us") leaves the business's own facts unsaid: how long people
    // have, who pays the postage, how to reach the shop. Written as settled, they read as the owner's when they are
    // the agent's guesses, so each goes back to the owner until they answer it.
    id: "open-fact",
    kind: "quote",
    why: [
      "Each fact the agent listed for terms as only the owner's to say, and the owner has not answered, is asked or marked in one point of the reply outside any draft,",
      "named as listed (a question, or what was written ending with the open mark), or left as a [placeholder] naming it in what is delivered.",
    ].join(" "),
    run(ctx, { fail }) {
      if (ctx.runs === null) return;
      const answered = new Set((ctx.answered ?? []).map(plain));
      const points = pointsOf(ctx.lines, ctx.drafts).map((p) => p.lines.join(" "));
      const holes = ctx.items.flatMap((item) => placeholdersIn(textOf(item.text)));
      const mark = plain(OPEN_MARK);
      for (const topic of openOf(ctx.runs)) {
        const name = plain(topic);
        if (answered.has(name)) continue;
        const put = points.some((p) => plain(p).includes(name) && (p.includes("?") || plain(p).includes(mark)));
        if (put || holes.some((hole) => hole.includes(name))) continue;
        fail(
          [
            `"${topic}" is the owner's to say (you listed it in open for terms), and the reply neither asks it nor marks it.`,
            `In one point outside any draft, name it as "${topic}" and ask the owner, or say what you wrote and end with "${OPEN_MARK}"; or leave a [placeholder] naming it in what you deliver.`,
            `If the owner has answered, record it with owner_answer, topic "${topic}".`,
          ].join(" "),
        );
      }
    },
  },
];
