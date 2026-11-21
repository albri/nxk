// The product's knowledge base as tools: what is known and which path fits, the owner's answers, and what happened.
import { existsSync } from "node:fs";
import { describeSetup } from "../scripts/decision-model.ts";
import { relative } from "node:path";
import {
  addCustomers,
  addFact,
  addMoney,
  addOutcome,
  addQuestion,
  closeQuestion,
  describe,
  FILE,
  scanNote,
  scansDir,
  SOURCES,
  addStudy,
  studyOf,
  today,
  type Claim,
  type OutcomeAbout,
  type OutcomeArm,
  type OutcomeKind,
  type Place,
  type Product,
  type Question,
  type QuestionKind,
  type Scan,
  type Source,
} from "../scripts/product.ts";
import { soldToOrganisations } from "../scripts/businesses.ts";

import { labelled, said, type Label, type Parts } from "../scripts/log.ts";
import {
  compareArms,
  compareCustomers,
  directionOf,
  savedAnswers,
  scanSays,
  trackRecord,
  type Arm,
  type Compared,
} from "../scripts/outcome.ts";
import type { Country } from "../scripts/population.ts";
import {
  CODES,
  COUNTRY,
  FOLDER,
  checked,
  countryOf,
  findScan,
  findSegment,
  folderOf,
  kb,
  keyOf,
  one,
  people_,
  roomFor,
  shareOf,
  workScan,
  type NxkTool,
  type ToolArgs,
} from "./common.ts";
import { spendOf } from "./explorer.ts";
import type { Schema } from "./protocol.ts";

// Each tool's arguments, as its inputSchema gives them.

interface ResearchStartArgs extends ToolArgs {
  question: string;
  where?: string;
  budget?: number;
  include?: string[];
}

interface OwnerAskArgs extends ToolArgs {
  question: string;
  kind: QuestionKind;
  fact?: string;
  topic?: string;
  why?: string;
}

/** owner_answer: the reply to a question by its id, or something said unprompted (kind, and fact or topic). */
interface OwnerAnswerArgs extends ToolArgs, Answer {
  id?: string;
  kind?: QuestionKind;
  question?: string;
  fact?: string;
  topic?: string;
  source?: Source;
}

/** outcome_record: the owner's results, arm by arm, and what nxk said beforehand that they are set against. */
interface OutcomeRecordArgs extends ToolArgs {
  what: string;
  kind: OutcomeKind;
  arms: { name: string; among?: string; shown?: number; took: number }[];
  total?: number;
  from_scan?: string;
  idea?: string;
  segment?: string;
  suggestion?: string;
  unscanned?: string;
}

/** An answer to record: a share (0 to 100), words or a figure, or that the owner does not know; its source and a note. */
interface Answer {
  share?: number;
  answer?: string;
  value?: number;
  unknown?: boolean;
  source?: string;
  note?: string;
}

/** Which way in fits, and the next steps. */
export interface WayIn {
  path: "research" | "second-look";
  next: string[];
}

// ---------------------------------------------------------------------------------------------------------------
// Which path fits

/**
 * Which way in fits, and the next steps, as { path, next }: research while one research_start opened is going, the
 * second look otherwise.
 */
export function route(product: Product): WayIn {
  const study = studyOf(product);
  const open = product.questions.filter((q) => q.status === "open");
  const next: string[] = [];
  let path: WayIn["path"];
  if (study) {
    path = "research";
    next.push(
      [
        `Research ${study.id}, as the owner asked it: "${study.question}".`,
        "Follow guide topic research: write the versions to whoever pays, each with its price,",
        "put them to the people with ideas_scan, then explore_next until it says report,",
        "and report the findings as the guide says. Nothing here is chosen for the owner.",
      ].join(" "),
    );
    // An offer sold to organisations is still put to the people, at work: its buyers are people in their jobs.
    if (soldToOrganisations({ offer: study.question }))
      next.push(
        [
          "Sold to organisations: put it to the people with ideas_scan anyway,",
          "two or more ways to offer it (another size of firm, another way to charge),",
          "each with a buying_category (what firms buy it as).",
          "Each is asked at work, and the reading says who decides at each size of firm, counted on the people,",
          "with how keen people in work are (simulated).",
          "The number of firms: count them with people (unit firms) by their size, sector, industry and place,",
          "or give a published count, sourced.",
        ].join(" "),
      );
    if (!study.where && !product.where)
      next.push(
        [
          "If the question is about one area (a trade, a shop, a local service),",
          "give research_start its where (region=..., or county_or_local_authority=...):",
          "every lead is then counted there, not only nationwide.",
        ].join(" "),
      );
  } else {
    path = "second-look";
    next.push(
      [
        "For a page, a policy, a plan, a message or an answer: read guide topic second-look and follow it.",
        "Read the work as delivered, with the owner's terms; then sweep, to see who else the work could reach;",
        "terms and suggest only when a term the owner set may shut out a big group",
        "(suggest reads the audience and the owner's shares from nxk.json);",
        "then the note, opportunity first, and note_check on it with every file the work delivers.",
      ].join(" "),
      "If you are nxk's researcher, the owner asked for research: research_start with their question first, then guide topic research.",
    );
  }
  if (open.length) next.push(`Open questions for the owner: ${open.map((q) => `[${q.id}] ${q.question}`).join(" ")}`);
  const measured = new Set(product.outcomes.map((o) => o.about?.suggestion).filter(Boolean));
  const waiting = product.suggestions.filter((d) => d.watch && !measured.has(d.suggestion));
  if (waiting.length)
    next.push(
      [
        "Suggestions with a number to watch and no result recorded:",
        `${waiting.map((d) => `"${d.suggestion}" (watch: ${d.watch})`).join("; ")}.`,
        "When the owner has the numbers, record them with outcome_record.",
      ].join(" "),
    );
  return { path, next };
}

/** What a question to the owner asks for: a share of their customers, words, or a figure. */
const KINDS: QuestionKind[] = ["share", "words", "figure"];

/** Record an answer in the knowledge base. Returns the next product and a line saying what was recorded. */
function record(
  product: Product,
  question: Question,
  { share, answer, value, unknown, source = "owner", note }: Answer,
): { product: Product; line: string } {
  const said = unknown ? "does not know" : null;
  if (question.kind === "share") {
    if (!unknown && !(Number(share) >= 0 && Number(share) <= 100))
      throw new Error("A share is how many in every 100 of the owner's customers (0 to 100), or unknown");
    // A share question always names its group (owner_ask and owner_answer refuse one without).
    product = addCustomers(product, {
      fact: question.fact as string,
      share: unknown ? "unknown" : Number(share),
      source,
      note,
    });
    return {
      product: closeQuestion(product, question.id, {
        status: unknown ? "unknown" : "answered",
        answer: said ?? `${share} in 100`,
      }),
      line: `${question.fact}: ${said ?? `${share} in every 100 of the owner's customers`} (${source})`,
    };
  }
  if (question.kind === "figure") {
    if (!unknown && !Number.isFinite(Number(value))) throw new Error("A figure needs a number in value, or unknown");
    // A figure question always has its topic (owner_ask and owner_answer refuse one without).
    if (!unknown) product = addMoney(product, { name: question.topic as string, value: Number(value), source });
    else product = addFact(product, { topic: question.topic, answer: null, source, note });
    return {
      product: closeQuestion(product, question.id, {
        status: unknown ? "unknown" : "answered",
        answer: said ?? String(value),
      }),
      line: `${question.topic}: ${said ?? value} (${source})`,
    };
  }
  if (!unknown && !String(answer ?? "").trim()) throw new Error("An answer in words is needed, or unknown");
  product = addFact(product, { topic: question.topic, answer: unknown ? null : String(answer), source, note });
  return {
    product: closeQuestion(product, question.id, {
      status: unknown ? "unknown" : "answered",
      answer: said ?? String(answer),
    }),
    line: `${question.topic}: ${said ?? answer} (${source})`,
  };
}

/** What the knowledge base already holds for a question, or null. */
function known(
  product: Product,
  { kind, fact, topic }: { kind?: QuestionKind; fact?: string; topic?: string },
): string | null {
  if (kind === "share") {
    const c = product.customers.find((e) => e.fact === fact && e.source !== "guess");
    return c ? `${c.share === null ? "does not know" : `${c.share} in every 100`} (${c.source}, ${c.date})` : null;
  }
  if (kind === "figure") {
    const m = product.money.find((e) => e.name === topic);
    if (m) return `${m.value} (${m.source}, ${m.date})`;
  }
  const f = product.facts.find((e) => e.topic.toLowerCase() === String(topic).toLowerCase() && e.source !== "guess");
  return f ? `${f.answer === null ? "does not know" : f.answer} (${f.source}, ${f.date})` : null;
}

/** A place given as conditions (region, county_or_local_authority, settlement_name), checked and counted. */
function placeOf(country: Country, where: string): Place {
  const conditions = checked(country, where);
  const off = conditions.filter((c) => !c.path.startsWith("place."));
  if (off.length)
    throw new Error(
      `where takes places only (region, county_or_local_authority, settlement_name): ${off.map((c) => c.text).join(", ")} is who, not where. Put who in audience.`,
    );
  return {
    among: where,
    text: conditions.map((c) => c.text).join(", and "),
    share: shareOf(country, where),
    date: today(),
  };
}

/** What research costs a version, for the second look to quote when it offers research: it never scans itself. */
function researchPrice(folder: string, product: Product): string {
  const country = product.country ?? "uk";
  const { perOffer, offers } = spendOf(scansDir(folder), country);
  const from = offers
    ? `the average of the ${offers} versions scanned here`
    : "nxk's estimate: nothing scanned here yet";
  return [
    `Research: about ${(100 * perOffer).toFixed(1)} US cents a version on the decision-model key (${from});`,
    `a study of six versions costs about ${(600 * perOffer).toFixed(0)} cents.`,
    "A second look offers it only when a scan is saved here or the owner asked for research;",
    "only nxk's researcher runs it.",
  ].join(" ");
}

/** Every pair of arms, each once, in the order given, for outcome_record to compare. */
const pairsOf = <A>(arms: A[]): [A, A][] => arms.flatMap((a, i) => arms.slice(i + 1).map((b): [A, A] => [a, b]));

export const KNOWLEDGE: NxkTool[] = [
  {
    name: "product",
    logs: true,
    title: "What is known about this product",
    description: [
      "Start here, and again whenever unsure. Reads nxk.json (the product's knowledge base):",
      "the product, its audience, what the owner said, open questions, research and its segments, suggestions made.",
      "Says which way in fits (second-look after the work, research while one is open), what to do next,",
      "and what research costs a version on this key.",
    ].join(" "),
    inputSchema: { type: "object", properties: { folder: FOLDER } },
    annotations: { readOnlyHint: true },
    run: async (args: ToolArgs) => {
      const folder = folderOf(args),
        { file, product } = kb(folder);
      const { path, next } = route(product),
        scan = scanNote(scansDir(folder));
      return said([
        existsSync(file) ? null : `No ${FILE} yet: it will be made at ${file}.`,
        ...describe(product, relative(folder, file) || FILE),
        "",
        scan,
        `Path: ${path}`,
        ...(scan ? [`- First: ${scan}`] : []),
        ...next.map((n) => `- ${n}`),
        "",
        ...describeSetup(),
        researchPrice(folder, product),
      ]);
    },
  },
  {
    name: "research_start",
    logs: true,
    needsCountry: true,
    title: "Open the owner's research question",
    description: [
      "For nxk's researcher, first: records the question the owner asked with /nxk:research, in their words,",
      "and opens it as a study. From here the scans and segments made are this study's,",
      "and explore_next reads only them, so two questions in one folder never mix their leads;",
      "opening one closes any other.",
      "where: the place the question is about, as place conditions",
      "(region=georgia, county_or_local_authority=<codes joined by |>), so every lead is counted there too.",
      "budget: the most to spend on scans, in US dollars, when the owner gave one",
      "(otherwise the scan_budget setting holds).",
      "include: ids or labels of scans already saved here that this question should read",
      "(a scan the owner started before).",
    ].join(" "),
    inputSchema: {
      type: "object",
      properties: {
        folder: FOLDER,
        country: COUNTRY,
        question: { type: "string", description: "The owner's question, in their words" },
        where: { type: "string" },
        budget: { type: "number" },
        include: { type: "array", items: { type: "string" } },
      },
      required: ["question"],
    },
    run: async (args: ResearchStartArgs) => {
      const folder = folderOf(args),
        { file, product, save } = kb(folder);
      const country = countryOf(args, product);
      const question = String(args.question ?? "").trim();
      if (!question) throw new Error("The owner's question, in their words, is needed");
      const saved = new Set(product.discovery.scans.flatMap((s) => [s.id, s.label].filter(Boolean)));
      const missing = (args.include ?? []).filter((l) => !saved.has(l));
      if (missing.length)
        throw new Error(
          `No saved scan ${missing.join(", ")} in ${FILE}: the saved scans are ${[...saved].join(", ") || "none"}`,
        );
      const where = args.where ? placeOf(country, args.where) : null;
      const budget = args.budget !== undefined && Number.isFinite(args.budget) && args.budget >= 0 ? args.budget : null;
      const { product: next, study } = addStudy(
        { ...product, country },
        { question, where, budget, include: args.include ?? [] },
      );
      save(next);
      const { next: steps } = route(next);
      return said([
        `Research ${study.id} opened: "${question}" (kept in ${relative(folder, file) || FILE}).`,
        where
          ? labelled(
              "counted",
              [
                `Where: ${where.text}, ${one(where.share)} in every 100 ${country.toUpperCase()} adults (counted),`,
                `about ${people_(where.share, country)}. Every lead is counted there as well as nationwide.`,
              ].join(" "),
            )
          : "Where: nationwide.",
        `Budget for scans: ${budget !== null ? `$${budget}, as the owner gave it` : "the scan_budget setting, if one is set; with none, ask the owner once, with the cost"}.`,
        study.include.length ? `It reads the saved scans ${study.include.join(", ")} as part of it.` : null,
        "",
        "Path now: research",
        ...steps.map((n) => `- ${n}`),
      ]);
    },
  },
  {
    name: "owner_ask",
    title: "Ask the owner one question",
    description: [
      "Put one question to the owner and record the answer in nxk.json, so that it is never asked twice.",
      "kind share: how many in every 100 of their customers are in a group",
      "(give fact, a condition such as age_years=65..120);",
      "kind words: anything else (give topic, such as 'reception phone' or 'who your customers are');",
      "kind figure: a number (give topic, such as 'price per month').",
      "When the client can show the owner a form, it does;",
      "otherwise this returns the question to ask in chat, and owner_answer records the reply.",
      "Never answer for the owner.",
    ].join(" "),
    inputSchema: {
      type: "object",
      properties: {
        folder: FOLDER,
        question: { type: "string" },
        kind: { type: "string", enum: KINDS },
        fact: { type: "string" },
        topic: { type: "string" },
        why: { type: "string", description: "What the answer changes, in one line" },
        country: COUNTRY,
      },
      required: ["question", "kind"],
    },
    run: async (args: OwnerAskArgs, { elicit }) => {
      const folder = folderOf(args),
        { product, save } = kb(folder);
      if (args.kind === "share") {
        if (!args.fact)
          throw new Error("A share question needs fact: the group as a condition, such as age_years=65..120");
        checked(countryOf(args, product), args.fact);
      } else if (!args.topic)
        throw new Error(
          "A words or figure question needs topic: a short name for what is asked, such as 'reception phone'",
        );
      const already = known(product, args);
      if (already)
        return {
          text: `Already answered, not asked again: ${args.kind === "share" ? args.fact : args.topic}: ${already}.`,
        };
      const {
        product: withQ,
        question,
        repeated,
      } = addQuestion(product, {
        question: args.question,
        topic: args.topic ?? null,
        kind: args.kind,
        fact: args.fact ?? null,
        why: args.why ?? null,
      });
      save(withQ);
      const schemas: Record<QuestionKind, Record<string, Schema>> = {
        share: {
          share: { type: "integer", title: "How many in every 100 of your customers", minimum: 0, maximum: 100 },
          note: { type: "string", title: "Where the figure comes from (optional)" },
        },
        words: { answer: { type: "string", title: "Your answer" } },
        figure: {
          value: { type: "number", title: "The figure" },
          note: { type: "string", title: "Where it comes from (optional)" },
        },
      };
      const asked = await elicit(
        `${args.question}${args.why ? `\n\n(${args.why})` : ""}\n\nLeave it empty and tick "I don't know" if you are not sure.`,
        {
          type: "object",
          properties: { ...schemas[args.kind], unknown: { type: "boolean", title: "I don't know", default: false } },
        },
      );
      if (asked === null) {
        const again = repeated ? "Asked before and still open. " : "";
        // A share only sharpens a suggestion, and the work never waits on it: the note says what the suggestion turns on,
        // and the answer, once given, is recorded and suggest run again.
        if (args.kind === "share")
          return {
            text: [
              `${again}No form here: do not hold up the work for it, and send no separate question.`,
              `Record unknown now with owner_answer (id ${question.id}, unknown true, note "not asked");`,
              "the note's item says what it turns on.",
              `When the owner answers, record it with owner_answer (id ${question.id}) and run suggest again.`,
            ].join(" "),
          };
        return {
          text: [
            `${again}Ask the owner in chat, as written: "${args.question}"`,
            `Then record the reply with owner_answer (id ${question.id}). If they do not know, record unknown.`,
            "If the owner cannot be asked now, record unknown with a note saying why;",
            "the reply then carries the question.",
          ].join(" "),
        };
      }
      if (asked.action !== "accept") {
        save(closeQuestion(withQ, question.id, { status: "declined", answer: asked.action }));
        return {
          text: `The owner did not answer (${asked.action}). Go on with the count you have; ask again only if the answer would change what you suggest.`,
        };
      }
      // What the owner entered, in the fields asked for.
      const c: Answer = asked.content ?? {};
      const blank =
        (args.kind === "share" && c.share === undefined) ||
        (args.kind === "words" && !String(c.answer ?? "").trim()) ||
        (args.kind === "figure" && c.value === undefined);
      const done = record(withQ, question, {
        share: c.share,
        answer: c.answer,
        value: c.value,
        unknown: Boolean(c.unknown) || blank,
        note: c.note,
      });
      save(done.product);
      return { text: `The owner answered. Recorded: ${done.line}.` };
    },
  },
  {
    name: "owner_answer",
    title: "Record what the owner said",
    description: [
      "Record the owner's reply to a question asked in chat (id from owner_ask),",
      "or something the owner said unprompted (give kind and fact or topic).",
      "share: 0 to 100; answer: words; value: a figure; unknown: true when they do not know.",
      "source: owner (default), measured (from their records), or guess (yours; kept, never used as theirs).",
    ].join(" "),
    inputSchema: {
      type: "object",
      properties: {
        folder: FOLDER,
        id: { type: "string" },
        kind: { type: "string", enum: KINDS },
        question: { type: "string" },
        fact: { type: "string" },
        topic: { type: "string" },
        share: { type: "number" },
        answer: { type: "string" },
        value: { type: "number" },
        unknown: { type: "boolean" },
        source: { type: "string", enum: SOURCES },
        note: { type: "string" },
        country: COUNTRY,
      },
    },
    run: async (args: OwnerAnswerArgs) => {
      const folder = folderOf(args),
        { product, save } = kb(folder);
      let question = args.id ? product.questions.find((q) => q.id === args.id) : null;
      let next = product;
      if (args.id && !question)
        throw new Error(
          `No question "${args.id}": the questions are ${product.questions.map((q) => q.id).join(", ") || "none yet"}`,
        );
      if (!question) {
        if (!args.kind) throw new Error("Give id (from owner_ask), or kind with fact (share) or topic (words, figure)");
        if (args.kind === "share") {
          if (!args.fact) throw new Error("A share needs fact");
          checked(countryOf(args, product), args.fact);
        } else if (!args.topic) throw new Error("Words or a figure need topic");
        ({ product: next, question } = addQuestion(product, {
          question: args.question ?? `(said unprompted) ${args.topic ?? args.fact}`,
          topic: args.topic ?? null,
          kind: args.kind,
          fact: args.fact ?? null,
        }));
      }
      const done = record(next, question, args);
      save(done.product);
      return { text: `Recorded: ${done.line}.` };
    },
  },
  {
    name: "outcome_record",
    logs: true,
    title: "Record what happened, against what nxk said",
    description: [
      "When the owner has real results, record them here.",
      "They are kept in nxk.json as measured, set beside what nxk said beforehand,",
      "and added to the product's track record,",
      "which product, segments and later scans show beside every simulated figure.",
      "Kinds: groups (one offer, take-up in each group, such as an advert's results by age band or region:",
      "give from_scan and idea, or segment, so the scan's view of each group is compared),",
      "options (one choice tried two or more ways, an A/B split:",
      "give suggestion, its name as recorded in nxk.json, to test the option its counts favoured;",
      "or from_scan with offers as arm names),",
      "customers (who the customers turned out to be: in each arm how many customers are in that group, with total;",
      "each group is set against its counted share of adults).",
      "Numbers come only from the owner's own records: ask with owner_ask if you do not have them,",
      "never estimate them. Only directions are compared, and a difference counts only when it is clear of chance.",
    ].join(" "),
    inputSchema: {
      type: "object",
      properties: {
        folder: FOLDER,
        country: COUNTRY,
        what: {
          type: "string",
          description: "What was measured, where and when: 'Sign-ups from the Meta advert, 1 to 14 December'",
        },
        kind: { type: "string", enum: ["groups", "options", "customers"] },
        arms: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "The group or option as the owner calls it" },
              among: {
                type: "string",
                description: "groups and customers: the group as conditions, such as age_years=65..120",
              },
              shown: {
                type: "integer",
                description: "groups and options: how many saw it (visitors, people reached, emails delivered)",
              },
              took: {
                type: "integer",
                description: "How many took it up; for customers, how many customers are in the group",
              },
            },
            required: ["name", "took"],
          },
        },
        total: { type: "integer", description: "customers: all the customers counted" },
        from_scan: { type: "string" },
        idea: { type: "string" },
        segment: { type: "string" },
        suggestion: { type: "string", description: "options: the suggestion's name as recorded in nxk.json" },
        unscanned: {
          type: "string",
          description: "When the product has scans but these results are for none of their offers: say so, and why",
        },
      },
      required: ["what", "kind", "arms"],
    },
    run: async (args: OutcomeRecordArgs) => {
      const folder = folderOf(args),
        { product, save } = kb(folder);
      const country = countryOf(args, product),
        kind = args.kind;
      if (!String(args.what ?? "").trim()) throw new Error("Say what was measured, where and when (what)");
      const whole = (x: number | null): x is number => x !== null && Number.isInteger(x) && x >= 0;
      const arms = (args.arms ?? []).map((a): OutcomeArm => ({
        name: String(a.name).trim(),
        among: a.among
          ? String(a.among)
              .split(",")
              .map((c) => c.trim())
              .filter(Boolean)
              .join(",")
          : null,
        shown: a.shown ?? null,
        took: a.took,
      }));
      // customers: all the customers counted (refused just below unless a whole number over 0).
      const total = args.total ?? 0;
      if (kind === "customers") {
        if (!(Number.isInteger(total) && total > 0))
          throw new Error("customers needs total: how many customers were counted in all");
        for (const a of arms)
          if (!a.among || !whole(a.took) || a.took > total)
            throw new Error(
              `${a.name}: give the group as conditions (among) and how many of the ${total} customers are in it (took). ${CODES}`,
            );
      } else {
        if (arms.length < 2) throw new Error(`${kind} needs two arms or more`);
        for (const a of arms)
          if (!(whole(a.shown) && a.shown > 0) || !whole(a.took) || a.took > a.shown)
            throw new Error(
              `${a.name}: give how many saw it (shown) and how many of them took it (took, no more than shown)`,
            );
        if (kind === "groups")
          for (const a of arms)
            if (!a.among) throw new Error(`${a.name}: give the group as conditions (among). ${CODES}`);
      }
      for (const a of arms) if (a.among) checked(country, a.among);
      // The arms compareArms compares: those that say how many saw them, which is every arm of groups and of options
      // (checked above) and none of customers. The same objects as in arms, so keenOf finds each there.
      const compared = arms.filter((a): a is OutcomeArm & Arm => a.shown !== null);
      // Results for an offer that was scanned are worth most against what the scan said: never recorded unlinked by default.
      const scanned = product.discovery.scans.flatMap((s) =>
        (s.ideas ?? []).map((i) => `${s.id} ${keyOf(i.key)}: "${String(i.offer).slice(0, 90)}"`),
      );
      if (kind !== "options" && !args.from_scan && !args.segment && !args.unscanned && scanned.length) {
        const list = scanned.map((x) => `  ${x}`).join("\n");
        return {
          text: [
            "Not recorded yet. This product has scanned offers, and results for one of them can be set against what",
            `its scan said of each group:\n${list}\nIf the results are for one of these offers`,
            "(or one close enough that the owner would call it the same), call again with from_scan and idea.",
            "If not, call again with unscanned saying why.",
          ].join(" "),
          error: true,
        };
      }

      // What nxk said beforehand: a scan's view of the offer, or the option a suggestion's counts favoured.
      const scans = scansDir(folder);
      let scan: Scan | null | undefined = null;
      let key: string | null = null;
      let about: OutcomeAbout = args.unscanned ? { unscanned: String(args.unscanned) } : {};
      let saidText = args.unscanned
          ? `nothing: ${args.unscanned}`
          : "nothing: no scan, segment or suggestion was named",
        saidFrom: Label = null;
      if (args.segment) {
        const s = findSegment(product, args.segment);
        about.segment = s.id;
        if (s.intent?.scan && s.intent.idea) {
          scan = product.discovery.scans.find((x) => x.id === s.intent?.scan);
          key = s.intent.idea;
        }
      }
      if (args.from_scan) {
        scan = findScan(product, args.from_scan);
        key = args.idea ? keyOf(args.idea) : null;
      }
      const room = scan ? roomFor(country, workScan(scan)) : null;
      const answersOf = (from: Scan, k: string) => {
        const a = savedAnswers(scans, from, k, country);
        if (!a)
          throw new Error(
            `No saved answers for ${k} in ${from.id}: the offer keys are ${from.ideas.map((i) => keyOf(i.key)).join(", ")}`,
          );
        return a;
      };
      let result: { lines: string[]; comparisons: Compared[]; parts?: (Parts | null)[] },
        claim: Claim,
        notes: string[] = [];
      if (kind === "groups" || kind === "customers") {
        if (scan) {
          if (!key)
            throw new Error("Name the offer the results are for: idea (with from_scan), or a segment kept from a scan");
          about = { ...about, scan: scan.id, idea: key };
          saidText = `${scan.id}, the offer ${key} (simulated)`;
          saidFrom = "simulated";
        }
        // Every arm of groups and customers names its group (checked above).
        const groups = arms.map((a) => a.among as string);
        const said = scan && room && key ? scanSays(room, answersOf(scan, key), groups) : null;
        if (said)
          for (const [i, g] of said.groups.entries())
            if (g.keen === null)
              notes.push(
                [
                  `${arms[i].name}: the scan did not ask about ${g.unasked.join(", ")},`,
                  "so it said nothing about this group.",
                  `To compare it, scan the offer again with ${g.unasked.join(", ")} among its fields`,
                  "(only what is missing is sent).",
                ].join(" "),
              );
        if (kind === "groups") {
          claim = "scan_groups";
          const keenOf = (a: OutcomeArm) => said?.groups[arms.indexOf(a)].keen ?? null;
          result = compareArms(compared, pairsOf(compared), (a, b) => {
            const keenA = keenOf(a),
              keenB = keenOf(b);
            const lean = keenA !== null && keenB !== null ? keenA / keenB : null;
            return {
              lean,
              direction: directionOf(lean),
              text:
                lean === null
                  ? "the scan said nothing about these two"
                  : `the scan said ${a.name} x${lean.toFixed(2)} ${b.name}`,
            };
          });
        } else {
          claim = "segment_customers";
          result = compareCustomers(
            arms.map((a, i) => ({
              name: a.name,
              took: a.took,
              share: shareOf(country, groups[i]),
              lean:
                said && said.overall !== null && said.groups[i].keen !== null
                  ? said.groups[i].keen / said.overall
                  : null,
            })),
            total,
          );
        }
      } else if (args.suggestion) {
        const d = product.suggestions.find(
          (x) => x.suggestion.toLowerCase() === String(args.suggestion).trim().toLowerCase(),
        );
        if (!d)
          throw new Error(
            `No suggestion "${args.suggestion}" in ${FILE}: ${product.suggestions.map((x) => `"${x.suggestion}"`).join(", ") || "none yet"}`,
          );
        const favoured = d.pick,
          top = compared.find((a) => a.name.toLowerCase() === String(favoured).toLowerCase());
        if (!top)
          throw new Error(
            `The counts for "${d.suggestion}" favoured "${favoured}": name that arm so, to compare the others with it`,
          );
        claim = "decision_pick";
        about = { suggestion: d.suggestion };
        saidText = `the counts for "${d.suggestion}" favoured ${favoured}`;
        result = compareArms(
          compared,
          compared.filter((a) => a !== top).map((b): [Arm & OutcomeArm, Arm & OutcomeArm] => [top, b]),
          () => ({ lean: null, direction: 1, text: `the counts favoured ${top.name}` }),
        );
      } else if (scan && room) {
        claim = "scan_order";
        about = { scan: scan.id };
        saidText = `${scan.id}, how keen ${room.whom} were on each offer (simulated; nxk does not claim this order, it is kept to measure it)`;
        saidFrom = "simulated";
        // How keen everyone is on each arm's offer: its answers are there (answersOf throws otherwise).
        const overall = new Map(
          compared.map((a): [OutcomeArm, number] => [
            a,
            scanSays(room, answersOf(scan, keyOf(a.name)), []).overall as number,
          ]),
        );
        result = compareArms(compared, pairsOf(compared), (a, b) => {
          const lean = overall.get(a)! / overall.get(b)!;
          return { lean, direction: directionOf(lean), text: `the scan said ${a.name} x${lean.toFixed(2)} ${b.name}` };
        });
      } else {
        claim = "decision_pick";
        result = compareArms(compared, pairsOf(compared), () => ({
          lean: null,
          direction: 0,
          text: "nxk said nothing about these two",
        }));
      }

      let { product: next, outcome } = addOutcome(product, {
        what: String(args.what).trim(),
        kind,
        claim,
        about,
        arms,
        ...(kind === "customers" ? { total } : {}),
        comparisons: result.comparisons.map(({ line, ...c }) => c),
      });
      // Who the customers turned out to be is what suggest weights by: a single fact becomes a measured share.
      const kept: string[] = [];
      if (kind === "customers")
        for (const a of arms)
          if (a.among && !a.among.includes(",")) {
            const before = next.customers.find((c) => c.fact === a.among);
            next = addCustomers(next, {
              fact: a.among,
              share: Math.round((1000 * a.took) / total) / 10,
              source: "measured",
              note: `${outcome.what} (${outcome.id}), ${a.took} of ${total}`,
            });
            kept.push(
              `${a.among}: ${Math.round((1000 * a.took) / total) / 10} in 100${before ? ` (replaces ${before.share === null ? "not known" : `${before.share} in 100`}, ${before.source})` : ""}`,
            );
          }
      save({ ...next, country });
      const record = trackRecord(next.outcomes);
      // What the owner recorded is measured; what a scan said beforehand, simulated; a group's share of adults, counted.
      return said(
        [
          `Recorded ${outcome.id} (measured): ${outcome.what}`,
          labelled(saidFrom ?? "measured", `What nxk said beforehand: ${saidText}.`),
          ...result.lines.map((line, i) => labelled("measured", line, result.parts?.[i])),
          ...notes,
          kept.length
            ? `Kept as the owner's customers (measured), which suggest weights its counts by: ${kept.join("; ")}.`
            : null,
          kind === "customers"
            ? "If the offer was shown mostly to some groups, their share of customers says where it was shown, not who was keener."
            : null,
          "",
          `Track record for this product: ${record.lines.join("; ") || "nothing compared yet"}. A handful of comparisons describes this product; it is not a rate.`,
          "Clear means the interval of the difference does not cross zero. Too few to tell is not a no: the difference may be real and too small for these numbers.",
        ],
        "measured",
      );
    },
  },
];
