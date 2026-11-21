// What is delivered: what the owner gives a person to use (a page, an email, a letter, a policy, a contract, a support
// reply). It is each file the reply names, each draft in it, or with neither, the reply itself, which is then what the
// owner takes away (ctx.items). These checks look at what a person agrees to and what they are told, not at how a page
// is built: whom a choice suits is counted by the other tools.
//   - What a person is asked to pay is declared to note_check (ctx.pays), with the words that tell them: what a free
//     trial turns into, what a renewal costs, how a repeating payment stops. The words are found in what is delivered.
//   - Word patterns that read a trial, a renewal or a repeating payment the agent did not declare only warn.
//   - On a page, no paid extra or consent is ticked for the person.
//   - Proof the owner did not give ("most popular", ratings, "trusted by 2,000") is flagged as invented.
import { fragmentText, looksLikeHtml, textOf } from "../html.ts";
import { labelsIn, plain } from "../reply.ts";
import type { Check } from "./index.ts";

const CLAIMS = [
  /most popular|best value|best seller|bestseller|recommended|trusted by|\brated\b|\breviews\b|reviewed by|[★⭐☆]|\b\d(\.\d)?\s*(\/|out of)\s*5\b/gi,
  /\b\d+(\.\d+)?\s*%\s*of\s+(our\s+)?(customers|members|users|people)\b/gi,
  /\bjoin\s+(over\s+)?[\d,]{2,}|\b[\d,]{2,}\+?\s+(happy\s+)?(customers|members|users)\b/gi,
  /[“"][^”"]{25,220}[”"]\s*[—–-]+\s*[A-Z]/g,
];
/** Proof a person would take as fact: the words that make it, and the words around them. */
export interface Claim {
  match: string;
  snippet: string;
}

/** Proof a person would take as fact. Invented unless the owner gave it. */
export function findClaims(text: string): Claim[] {
  const seen = new Set<string>(),
    out: Claim[] = [];
  for (const re of CLAIMS)
    for (const m of text.matchAll(re)) {
      const s = text
        .slice(Math.max(0, m.index - 20), m.index + m[0].length + 25)
        .replace(/^\S*\s/, "")
        .replace(/\s\S*$/, "")
        .trim();
      const k = m[0].toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        out.push({ match: m[0], snippet: s });
      }
    }
  return out;
}

// What a person agrees to pay. A free trial says what is charged when it ends; a paid extra or a marketing consent is
// never ticked for them; a repeating payment says how to stop it. UK consumer and subscription rules and the US FTC's
// rules on negative options ask the same.
const MONEY = /[£$€]\s?\d/;
const TRIAL = /free trial|trial (period|month|week)|\d+[- ]day (free )?trial|try (it )?(for )?free/i;
const AFTER = /\b(then|after|ends?|end of|once|when|from|renews?|converts?|charged|billed|starts? at)\b/i;
const NO_CHARGE =
  /\b(no (card|payment) (needed|required)|back to (the )?free|not (be )?charged|nothing (is )?(charged|taken)|stays? free)\b/i;
const OPT_IN = /insurance|protect|cover|donat|add[- ]?on|extra|upgrade|newsletter|marketing|offers|news\b|partners/i;
const REPEATS = /(per|a|\/)\s?(month|mo|year|yr|week)\b|monthly|yearly|annually|renews|subscription|membership/i;
const STOP = /cancel|stop (your|the|paying)|end (your|the) (plan|subscription|membership)|leave any time/i;
// A paid renewal (not a library card renewed at no cost), and the price it would show: a figure or a slot for one.
const RENEWS =
  /\b(renewal (premium|price|notice|quote)|(policy|subscription|plan|contract|insurance|cover) (renews|will renew|auto-?renews)|renews? automatically|auto-?renew\w*|automatically (charged|renewed|taken)|will be charged again)\b/i;
const PRICE_SLOT =
  /\[[^\]]*(price|premium|cost|amount|fee|£|\$)[^\]]*\]|\{\{[^}]*(price|premium|cost|amount|fee)[^}]*\}\}/i;
const strip = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

/** What a person can be asked to pay, as note_check takes it in pays. */
export type PayKind = "free_trial" | "renewal" | "repeating";

/** What note_check takes in pays, and what the words given for each must do. */
export const PAY_KINDS: PayKind[] = ["free_trial", "renewal", "repeating"];
export const PAY_NEEDS: Record<PayKind, string> = {
  free_trial: "say what is charged when the trial ends (the price, or that nothing is charged)",
  renewal: "give what it will cost (a figure, or a [placeholder] for one)",
  repeating: "say how to stop it",
};
/** Whether a kind declared in pays is one note_check takes. */
const isPayKind = (kind: unknown): kind is PayKind => PAY_KINDS.some((k) => k === kind);

/** Whether the words given for a payment do what its kind needs. */
export function settles(kind: PayKind, says: string): boolean {
  if (kind === "free_trial") return MONEY.test(says) || PRICE_SLOT.test(says) || NO_CHARGE.test(says);
  if (kind === "renewal") return MONEY.test(says) || PRICE_SLOT.test(says);
  return kind === "repeating";
}

/** A payment a text reads as asking for, and what it lacks. */
export interface PaymentRead {
  kind: PayKind;
  message: string;
}

/**
 * The payments a text reads as asking for, by word patterns, where it does not already say what they need. Often
 * wrong either way, so these are hints for the agent to declare in pays, never failures.
 */
export function paymentsRead(input: string): PaymentRead[] {
  const text = textOf(input),
    out: PaymentRead[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  if (
    TRIAL.test(text) &&
    !sentences.some((s) => /trial/i.test(s) && ((MONEY.test(s) && AFTER.test(s)) || NO_CHARGE.test(s)))
  )
    out.push({ kind: "free_trial", message: "reads as a free trial with no line saying what is charged when it ends" });
  // A renewal says what it will cost, or leaves a slot for the price: pointing to an attachment does not.
  if (RENEWS.test(text) && !MONEY.test(text) && !PRICE_SLOT.test(text))
    out.push({ kind: "renewal", message: "reads as a payment that renews, with no word on what it will cost" });
  if (MONEY.test(text) && REPEATS.test(text) && !STOP.test(text))
    out.push({ kind: "repeating", message: "reads as a repeating payment with no word on how to cancel it" });
  return out;
}

/** The boxes ticked already beside a payment or a consent, on a page: one message each. */
export function tickedBoxes(input: string): string[] {
  if (!looksLikeHtml(input)) return [];
  const out: string[] = [];
  for (const m of input.matchAll(/<input\b[^>]*>/gi)) {
    if (!/type\s*=\s*["']?checkbox/i.test(m[0]) || !/\schecked(?=[\s=/>])/i.test(m[0])) continue;
    const near = strip(input.slice(Math.max(0, m.index - 160), m.index + m[0].length + 220));
    if (MONEY.test(near) || OPT_IN.test(near))
      out.push(
        `a box ticked already beside "${near.trim().slice(0, 90)}": a payment or consent is opted into by the person, never ticked for them`,
      );
  }
  return out;
}

const short = (text: string, max = 90) => (text.length > max ? `${text.slice(0, max - 3)}...` : text);

export const DELIVERED: Check[] = [
  {
    id: "pays",
    kind: "quote",
    why: "What a person is asked to pay, as declared to note_check, is told in what is delivered: what a free trial turns into, what a renewal costs, how a repeating payment stops.",
    run(ctx, { fail }) {
      const texts = ctx.items.map((item) => plain(textOf(item.text)));
      for (const p of ctx.pays ?? []) {
        if (!isPayKind(p?.kind)) {
          fail(`pays: "${p?.kind ?? ""}" is not one of ${PAY_KINDS.join(", ")}`);
          continue;
        }
        const says = String(p.says ?? "").trim();
        if (!says) {
          fail(`pays: a ${p.kind} with no "says". Copy the words in what is delivered that ${PAY_NEEDS[p.kind]}.`);
          continue;
        }
        // Words copied from a page may keep its tags and entities ("<strong>$12.99 a month</strong>"): read as text.
        if (!texts.some((text) => text.includes(plain(fragmentText(says))))) {
          fail(
            `pays: "${short(says)}" is not in what is delivered (${ctx.items.map((item) => item.name).join(", ")}). Copy the words exactly as they are there, or add them.`,
          );
          continue;
        }
        if (!settles(p.kind, says))
          fail(
            `pays: a ${p.kind}, and "${short(says)}" does not ${PAY_NEEDS[p.kind]}. Add that to what is delivered and give its words.`,
          );
      }
    },
  },
  {
    id: "ticked-box",
    kind: "format",
    why: "On a page, no box beside a payment or a consent is ticked for the person.",
    run(ctx, { fail }) {
      for (const item of ctx.items) for (const message of tickedBoxes(item.text)) fail(`${item.name}: ${message}`);
    },
  },
  {
    id: "payments-read",
    kind: "hint",
    why: "A trial, renewal or repeating payment that word patterns read in what is delivered, and the agent did not declare, is pointed out.",
    run(ctx, { warn }) {
      const declared = new Set((ctx.pays ?? []).map((p) => p?.kind));
      for (const item of ctx.items)
        for (const read of paymentsRead(item.text)) {
          if (!declared.has(read.kind))
            warn(
              `${item.name}: ${read.message}. If it asks that of a person, ${PAY_NEEDS[read.kind]}, and give note_check pays: { "kind": "${read.kind}", "says": the words that do }.`,
            );
        }
    },
  },
  {
    // In the reply, proof on a line that names its source is the owner's own.
    id: "invented-proof",
    kind: "hint",
    why: 'Proof the owner did not give ("most popular", ratings, "trusted by 2,000") is invented.',
    run(ctx, { warn }) {
      if (ctx.replyDelivered) {
        ctx.lines.forEach((line, i) => {
          if (labelsIn(line).size) return;
          for (const c of findClaims(line))
            warn(`line ${i + 1}: "${c.snippet}": invented unless the owner gave it. Say so (given), or leave it out.`);
        });
        return;
      }
      for (const item of ctx.items)
        for (const c of findClaims(textOf(item.text)))
          warn(`${item.name}: "${c.snippet}": invented unless the owner gave it`);
    },
  },
];
