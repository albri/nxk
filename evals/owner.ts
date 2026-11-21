// The owner, simulated, so that a session is measured on what the owner ends up with, not on a reply that stops at a
// question or an offer. After each reply, a model that knows only what the case says the owner knows (the request,
// graders/source/owner.md for their goals, and graders/source/owner-knows.md for facts only they would know) answers
// what the reply puts to them: a question is answered only with words from those, quoted, or "I don't know"; an offer
// is taken only when it serves one of their goals and breaks none of their limits. The harness writes the owner's
// message from those decisions, so the model never adds a request of its own, and resumes the session with it, at most
// OWNER_TURNS times. Its calibration examples (owner-calibration/) are judged like the graders' before a run relies
// on it.
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HERE, OWNER_GOALS } from "./cases.ts";
import { QUIET, run, type ResultEvent, type Runner } from "./setup.ts";

/** The facts only the owner knows, beside their goals: what they would answer from. */
export const OWNER_KNOWS = "graders/source/owner-knows.md";
/** At most this many times the owner answers, after the session's first reply. */
export const OWNER_TURNS = 2;
/** What the owner says to a call the assistant could make, when nothing they know settles it. */
export const DONT_KNOW = "I don't know; use your judgement.";
/**
 * What the owner says to a fact about their business only they could give (a name, a price, a date, a rule of theirs)
 * that the case does not say: they will fill it in themselves. Telling the session to use its judgement there had it
 * make up payment and refund terms in a customer email.
 */
export const FILL_IN = "That's mine to fill in; leave it as a blank.";
/** How an owner's message is set between the session's replies in what the graders and the judge read. */
export const OWNER_MARK = "The owner replied:";
export const CALIBRATION = join(HERE, "owner-calibration");

/** What the owner knows in a case beside their request: their goals and the facts only they know, each or null. */
export interface OwnerFiles {
  goals: string | null;
  knows: string | null;
}

/**
 * What the owner reads in a turn: their request, what they know, the reply, the blanks left in the work, and what they
 * told the session before, oldest first.
 */
export interface OwnerReads extends OwnerFiles {
  request: string;
  reply: string;
  placeholders?: string[];
  said?: string[];
}

/**
 * The owner's answer to a question or a blank: a fact of theirs or a call the assistant could make (`kind`), and the
 * words of what they know it rests on (`quote`). Once grounded, `known` says whether those words are in what they know;
 * `ungrounded`, that the owner model answered from words that are not.
 */
export interface Answer {
  question: string;
  kind: "fact" | "choice";
  answer: string;
  quote: string;
  known?: boolean;
  ungrounded?: boolean;
}

/** The owner's yes or no to an offer, and why. */
export interface Offer {
  offer: string;
  yes: boolean;
  why: string;
}

/** What the owner decided about a reply: their answers and their yes or no to each offer. */
export interface Decisions {
  answers: Answer[];
  offers: Offer[];
}

/** One turn of the owner (ownerTurn). */
export interface OwnerTurn {
  decisions: Decisions;
  /** What they say, or null when they have nothing to say. */
  message: string | null;
  /** Whether the session is resumed with it: only when it gives the session something to do. */
  resume: boolean;
  cost: number;
  models: string[];
  error: string | null;
  /** Whether the owner model was asked at all. */
  asked: boolean;
}

/** What a run keeps of each owner turn. */
export type OwnerRound = Pick<OwnerTurn, "asked" | "decisions" | "message" | "cost">;

/** What the owner did in a run (ownerTally). */
export interface OwnerTally {
  exchanges: number;
  yes: number;
  no: number;
  known: number;
  unknown: number;
  fill: number;
  ungrounded: number;
}

/** What a turn came after: the owner's request, the owner coming back to a scan that has finished, or their answer. */
export type After = "request" | "come-back" | "owner";

/** A turn of the conversation: what it came after, what the owner said to start it, and the session's reply. */
export interface Exchange {
  after: After;
  said?: string;
  reply: string;
}

/**
 * The decisions an owner calibration example expects: a few words of each offer taken (`yes`) and turned down (`no`),
 * of each question answered from what the owner knows (`known`) or not (`unknown`), of each blank the owner fills in
 * (`fill`) and each call left to the session (`judgement`); words that are no offer (`notOffers`); and `quiet`, nothing
 * to say.
 */
export interface Expected {
  yes?: string[];
  no?: string[];
  known?: string[];
  unknown?: string[];
  fill?: string[];
  judgement?: string[];
  notOffers?: string[];
  quiet?: boolean;
}

/** An owner calibration example (owner-calibration/<name>.json): what the owner reads, and what they should decide. */
export interface CalibrationExample extends OwnerReads {
  name: string;
  expect: Expected;
}

/** The owner model's answer, as far as it is read: each field is checked or turned into text before it is used. */
interface OwnerJson {
  answers?: { question?: unknown; kind?: unknown; answer?: unknown; quote?: unknown }[];
  offers?: { offer?: unknown; yes?: unknown; why?: unknown }[];
}

/** A file the owner reads, by its path (or name) and text: what deliveredFiles gives. */
interface ReadFile {
  path?: string;
  name?: string;
  text?: string;
}

/** What the owner knows in a case: { goals, knows }, each the file's text or null. */
export function ownerFiles(dir: string): OwnerFiles {
  const read = (f: string) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), "utf8").trim() || null : null);
  return { goals: read(OWNER_GOALS), knows: read(OWNER_KNOWS) };
}

// Files a person reads, where a [blank] is the owner's to fill. In code, brackets are code: a CSS selector, a regex
// class, an array.
const PROSE = /\.(md|markdown|txt|html?|eml)$/i;
const prose = (f: ReadFile) =>
  String(f.text ?? "")
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/^\s*```[\s\S]*?^\s*```/gm, "");
// A blank reads as words: no code marks, no dotted names, no character ranges, no list of single letters.
const BLANK = /^[A-Za-z][A-Za-z0-9 ,'’/&()?:-]{2,79}$/;
const codeLike = (p: string) =>
  /\w\.\w|[A-Za-z0-9]-[A-Za-z0-9]\b(?![a-z])/.test(p) || p.split(",").every((x) => x.trim().length <= 2);

/** The [placeholders] left in the delivered files a person reads, each once: blanks the owner sees in the work. */
export function placeholdersIn(files: ReadFile[] | null): string[] {
  const found = (files ?? [])
    .filter((f) => PROSE.test(String(f.path ?? f.name ?? "")))
    .flatMap((f) => [...prose(f).matchAll(/\[([^\]\n]{3,80})\](?!\()/g)].map((m) => m[1].trim()));
  return [...new Set(found)].filter((p) => BLANK.test(p) && !codeLike(p)).slice(0, 12);
}

// A reply that asks or offers nothing, and leaves no blank, needs no answer: the owner is not asked (nothing is paid).
const ASKS =
  /\?|\bsay yes\b|\blet me know\b|\b(shall|should|can|could) I\b|\bwant me to\b|\bwould you like\b|\bdo you want\b|\bif you'?d like\b|\bhappy to\b|\bI can also\b/i;
export const putsToOwner = (reply: string | null | undefined, placeholders: string[] = []): boolean =>
  ASKS.test(String(reply ?? "")) || placeholders.length > 0;

export const OWNER_INTRO = [
  "You are playing a business owner.",
  "An AI assistant did a piece of work you asked for, and its reply is below.",
  "You know only what is written about you here: nothing else about your business, and nothing from the reply that is not also written here.",
].join(" ");
export const OWNER_ASK = [
  "Decide, as this owner:",
  [
    "1. Each question the reply puts to you, and each blank left in the work for you to fill:",
    'answer it only with a fact written above under "you" or "what you know", and copy the words you rely on into quote.',
    'If nothing there answers it, the answer is "I don\'t know" and quote is empty.',
    "Never guess, and never take a fact from the reply.",
    "Say of each whether it is a fact about your business that only you could give",
    '(kind "fact": a name, an address, a price, a date, a rule or policy of yours)',
    'or a call the assistant could make for you (kind "choice").',
  ].join(" "),
  [
    '2. Each offer to do something more or different ("Say yes and I\'ll ...", "Want me to ...?", "I can also ..."):',
    "yes only if it clearly serves one of your goals as written, not a wider version of it",
    "(an offer that would help the business in general, but not with that goal, is a no),",
    "and goes against none of your limits; otherwise no.",
    "Who you picture as your customers is what you expect, not a goal or a limit:",
    "an offer that brings in more of what a goal counts (households, bookings, members), from people you did not picture, serves that goal.",
    "A confident or flattering offer is no more likely to be yes.",
    "Name the goal it serves, or why not.",
    'An invitation to tell the assistant more ("tell me if any of this is wrong", "if you share your figures I can ...")',
    "is not an offer: leave it out.",
  ].join(" "),
  "3. Ask for nothing new.",
  [
    "Answer with JSON only, in this shape:",
    '{"answers":[{"question":"the question or blank, in a few words","kind":"fact","answer":"...","quote":"exact words from above, or empty"}],' +
      '"offers":[{"offer":"what it would do, in the reply\'s words","yes":true,"why":"..."}]}.',
    "Empty lists when the reply asks or offers nothing.",
  ].join(" "),
].join("\n");

/** The prompt the owner model reads. `said` is what the owner told the session before, oldest first. */
export function ownerPrompt({ request, goals, knows, reply, placeholders = [], said = [] }: OwnerReads): string {
  return [
    OWNER_INTRO,
    `<you>\n${goals ?? "(nothing written: you have no goals written down)"}\n</you>`,
    `<what you know>\n${knows ?? "(nothing beyond your request)"}\n</what you know>`,
    `<your request>\n${request}\n</your request>`,
    ...(said.length ? [`<what you said before>\n${said.join("\n\n")}\n</what you said before>`] : []),
    `<the reply>\n${reply}\n</the reply>`,
    ...(placeholders.length
      ? [`<blanks left in the work>\n${placeholders.map((p) => `[${p}]`).join("\n")}\n</blanks left in the work>`]
      : []),
    OWNER_ASK,
  ].join("\n\n");
}

/** The owner model's decisions from its answer: { answers, offers }, or null when there is no JSON in it. */
export function parseOwner(text: string | null | undefined): Decisions | null {
  const s = String(text ?? "");
  for (let i = s.indexOf("{"); i >= 0; i = s.indexOf("{", i + 1))
    for (let j = s.lastIndexOf("}"); j > i; j = s.lastIndexOf("}", j - 1)) {
      try {
        const o: OwnerJson | null = JSON.parse(s.slice(i, j + 1));
        if (o && typeof o === "object" && (Array.isArray(o.answers) || Array.isArray(o.offers)))
          return {
            answers: (o.answers ?? [])
              .filter((a) => a && a.question)
              .map((a) => ({
                question: String(a.question).trim(),
                kind: a.kind === "choice" ? "choice" : "fact",
                answer: String(a.answer ?? "").trim(),
                quote: String(a.quote ?? "").trim(),
              })),
            offers: (o.offers ?? [])
              .filter((x) => x && x.offer)
              .map((x) => ({
                offer: String(x.offer).trim(),
                yes: x.yes === true,
                why: String(x.why ?? "").trim(),
              })),
          };
      } catch {
        /* not this span */
      }
    }
  return null;
}

const flat = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[‘’“”"']/g, "")
    .replace(/\s+/g, " ")
    .trim();
const dontKnow = (a: Answer) => /^i (do not|don'?t) know\b/i.test(a.answer) || !a.answer;

/**
 * The owner's answers held to what they know: an answer whose quote is not in the request, the goals or the facts, word
 * for word, is not known (ungrounded: true). So the owner model can never hand the session a fact the case never gave.
 * What is not known is the owner's to fill in when it is a fact of theirs, and the session's call when it is a choice.
 */
export function grounded(
  decisions: Decisions,
  { request = "", goals = "", knows = "" }: { request?: string; goals?: string | null; knows?: string | null },
): Decisions {
  const known = flat([request, goals, knows].join("\n"));
  const unknown = (a: Answer) => ({ ...a, answer: a.kind === "choice" ? DONT_KNOW : FILL_IN, known: false });
  return {
    ...decisions,
    answers: decisions.answers.map((a) => {
      if (dontKnow(a)) return unknown(a);
      if (a.quote && known.includes(flat(a.quote))) return { ...a, known: true };
      return { ...unknown(a), ungrounded: true };
    }),
  };
}

/** Whether the owner's decisions give the session something to do: an offer taken, a fact given, a call left to it. */
export const actionable = ({ answers, offers }: Decisions): boolean =>
  offers.some((o) => o.yes) || answers.some((a) => a.known || a.answer === DONT_KNOW);

/**
 * The owner's message, written from their decisions, or null when it needs none: only offers turned down, or nothing
 * asked. The work then stands as it is. Blanks the owner will fill in themselves are said in one line. When that is
 * all (nothing for the session to do), the message closes the conversation rather than asking for changes.
 */
export function ownerMessage(decisions: Decisions): string | null {
  const { answers, offers } = decisions;
  if (!offers.some((o) => o.yes) && !answers.length) return null;
  const strip = (s: string) => s.replace(/[.?!\s]+$/, "");
  const fill = answers.filter((a) => a.answer === FILL_IN),
    calls = answers.filter((a) => a.answer === DONT_KNOW);
  return [
    ...offers.map((o) =>
      o.yes ? `Yes, please: ${strip(o.offer)}.` : `No to this, leave it as it is: ${strip(o.offer)}.`,
    ),
    ...answers.filter((a) => a.known).map((a) => `About "${strip(a.question)}": ${a.answer}`),
    ...(fill.length
      ? [`Mine to fill in, so leave these as blanks: ${fill.map((a) => strip(a.question)).join("; ")}.`]
      : []),
    ...(calls.length
      ? [`I don't know; use your judgement on: ${calls.map((a) => strip(a.question)).join("; ")}.`]
      : []),
    actionable(decisions)
      ? "Make those changes and nothing else, then tell me where it stands."
      : "That's all for now.",
  ].join("\n");
}

/**
 * One turn of the owner: { decisions, message, cost, models, error }. `message` is null when the owner has nothing to
 * say (the reply asks and offers nothing, or every offer is turned down). `call` is the command runner (tests pass
 * their own). An owner model that does not answer, after two tries, is an error: the run fails rather than go on with
 * an owner who said nothing.
 */
export async function ownerTurn(
  input: OwnerReads,
  { model }: { model: string },
  call: Runner = run,
): Promise<OwnerTurn> {
  const placeholders = input.placeholders ?? [];
  if (!putsToOwner(input.reply, placeholders))
    return {
      decisions: { answers: [], offers: [] },
      message: null,
      resume: false,
      cost: 0,
      models: [],
      error: null,
      asked: false,
    };
  const cwd = join(tmpdir(), "nxk-evals-owner");
  mkdirSync(cwd, { recursive: true });
  const models = new Set<string>();
  let cost = 0;
  let error: string | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await call(
      "claude",
      [
        "-p",
        "--setting-sources",
        "project",
        "--model",
        model,
        "--tools",
        "",
        "--max-turns",
        "1",
        "--output-format",
        "json",
      ],
      { cwd, input: ownerPrompt({ ...input, placeholders }), timeoutMs: 300000, env: { ...process.env, ...QUIET } },
    );
    let out: ResultEvent | undefined;
    try {
      out = JSON.parse(r.out);
    } catch {
      /* no answer: asked again */
    }
    cost += out?.total_cost_usd ?? 0;
    for (const m of Object.keys(out?.modelUsage ?? {})) models.add(m);
    error = !out
      ? String(r.err || (r.timedOut ? "timed out" : "no output"))
          .trim()
          .slice(0, 200)
      : out.is_error
        ? String(out.result || out.subtype || "error").slice(0, 200)
        : null;
    const parsed = error ? null : parseOwner(out?.result);
    if (parsed) {
      const decisions = grounded(parsed, input);
      const message = ownerMessage(decisions);
      return {
        decisions,
        message,
        resume: Boolean(message) && actionable(decisions),
        cost,
        models: [...models],
        error: null,
        asked: true,
      };
    }
    error ??= "no decisions in the owner's answer";
  }
  throw Object.assign(new Error(`the owner did not answer: ${error}`), { cost });
}

/**
 * What the graders and the judge read as the reply: the session's replies in order, with the owner's messages between
 * them. Within one stretch the last reply stands, as now: a reply after the owner came back for a scan replaces the one
 * that said it was running. With no owner message it is the last reply, as before the owner was simulated.
 */
export function conversationOf(turns: Exchange[]): string {
  const parts: string[] = [];
  for (const t of turns) {
    if (t.after === "owner") parts.push(`---\n${OWNER_MARK} ${t.said}\n---`, ...(t.reply ? [t.reply] : []));
    else if (parts.length && t.after === "come-back") parts[parts.length - 1] = t.reply ?? "";
    else parts.push(t.reply ?? "");
  }
  return parts.join("\n\n");
}

/** A tally of what the owner did in a run, for the summary: exchanges, offers taken and turned down, answers. */
export function ownerTally(rounds: Pick<OwnerRound, "decisions" | "message">[] = []): OwnerTally {
  const offers = rounds.flatMap((r) => r.decisions?.offers ?? []),
    answers = rounds.flatMap((r) => r.decisions?.answers ?? []);
  return {
    exchanges: rounds.filter((r) => r.message).length,
    yes: offers.filter((o) => o.yes).length,
    no: offers.filter((o) => !o.yes).length,
    known: answers.filter((a) => a.known).length,
    unknown: answers.filter((a) => !a.known).length,
    fill: answers.filter((a) => a.answer === FILL_IN).length,
    ungrounded: answers.filter((a) => a.ungrounded).length,
  };
}

/** The owner's calibration examples: { name, request, goals, knows, reply, placeholders, expect }. */
export function calibrationExamples(dir = CALIBRATION): CalibrationExample[] {
  return existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith(".json"))
        .sort()
        .map((f) => ({ name: f.replace(/\.json$/, ""), ...JSON.parse(readFileSync(join(dir, f), "utf8")) }))
    : [];
}

/**
 * Whether the owner's decisions on an example are the ones expected: each `yes` and `no` offer (a few of its words) is
 * found and decided so, each `known` question is answered from the files and each `unknown` one is "I don't know", and
 * `quiet` means nothing to say. Returns the misses, [] when right.
 */
export function calibrationMisses(
  expect: Expected,
  { decisions, message }: Pick<OwnerTurn, "decisions" | "message">,
): string[] {
  const misses: string[] = [];
  const find = <T>(list: T[], words: string, key: keyof T) => list.find((x) => flat(x[key]).includes(flat(words)));
  for (const [words, want] of [
    ...(expect.yes ?? []).map((w): [string, boolean] => [w, true]),
    ...(expect.no ?? []).map((w): [string, boolean] => [w, false]),
  ]) {
    const o = find(decisions.offers, words, "offer");
    if (!o) misses.push(`no offer about "${words}" was decided`);
    else if (o.yes !== want) misses.push(`"${words}": ${o.yes ? "yes" : "no"}, expected ${want ? "yes" : "no"}`);
  }
  for (const [words, want] of [
    ...(expect.known ?? []).map((w): [string, boolean] => [w, true]),
    ...(expect.unknown ?? []).map((w): [string, boolean] => [w, false]),
  ]) {
    const a = find(decisions.answers, words, "question");
    if (!a) misses.push(`no answer about "${words}"`);
    else if (Boolean(a.known) !== want)
      misses.push(
        `"${words}": ${a.known ? `answered "${a.answer}"` : "I don't know"}, expected ${want ? "an answer from the files" : "I don't know"}`,
      );
  }
  for (const [words, want] of [
    ...(expect.fill ?? []).map((w): [string, string] => [w, FILL_IN]),
    ...(expect.judgement ?? []).map((w): [string, string] => [w, DONT_KNOW]),
  ]) {
    const a = find(decisions.answers, words, "question");
    if (!a) misses.push(`no answer about "${words}"`);
    else if (a.answer !== want) misses.push(`"${words}": "${a.answer}", expected "${want}"`);
  }
  for (const words of expect.notOffers ?? [])
    if (find(decisions.offers, words, "offer")) misses.push(`"${words}" was taken as an offer`);
  if (expect.quiet && message) misses.push(`expected nothing to say, said: ${message.slice(0, 120)}`);
  return misses;
}
