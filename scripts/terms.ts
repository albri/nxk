#!/usr/bin/env node
// Every term the owner fixed, and whom it fits. A request settles things before anything is built: sizes, hours,
// prices, a contract, how to pay, what the product can see, where it reaches, what a plan is called. Each one suits
// some people and leaves others out, and a builder rarely counts whom. You list the terms, each in the owner's own
// words with its kind; this checks every quote is in the request, adds the two that are always there (the words are in
// English; it is opened on whatever the person has), and counts, for each, the facts that say whom it fits. No request
// is made and it costs nothing.
//
//   node scripts/terms.ts request.md --country=us --buyer=people --terms=terms.json --open=open.json
//   node scripts/terms.ts request.md --country=uk --buyer=people --terms=terms.json --open=open.json --clashes=clashes.json --among=fitness_or_sports_club_membership=member_of_a_gym_or_fitness_club_only|member_of_both
//
//   request.md  the owner's request, saved as they wrote it
//   --buyer     who pays: people (a person or a household) or businesses (an organisation)
//   --terms     the terms the owner fixed: [{ "quote": "Twelve-month contract", "kind": "commitment" }], or []
//   --open      what the work needs that the request does not say and only the owner can: [{ "topic": "return
//               window" }], a short name each, as the reply will name it; [] when the request gives all of it
//   --clashes   where the request contradicts itself: [{ "a": "Fees are fixed for the year", "b": "we review them
//               every term" }], each side in the owner's words; none when it does not
//   --not-clashes  places word patterns read as a contradiction that are not one: [{ "quote": the words, "why": ... }].
//               Each place the patterns read is put back until it is in one list or the other.
//   --among     the audience the owner named, in place of all adults
//   --people    another people file of the same form (from scripts/pull.ts)
//
// It ends with a "terms" block for suggestions.json. For each term write `fits`, the groups it suits (any of them,
// each a set of conditions joined by commas), or `fits_everyone` with the reason. For a commitment also write `rules`:
// what the rules where you sell say about it, as the page says it, with the publisher, the year and the link, each link
// opened with scripts/source.ts; or `rules_not_found` with what you searched or why you could not. suggest.ts will
// not run until every term has these. Each term the owner fixed is kept as an "owner_term" record, which note_check
// reads to see that the owner's terms are kept in what is delivered. Rivals' prices are not asked for: two or three rivals of other kinds are not a
// market, and they seldom change a decision.
import { BUSINESS_NOTE, PEOPLE_NOT_BUSINESSES, sellsToBusinesses } from "./businesses.ts";
import { argsOf, cli, readIn, usageExit, type Out, type RunContext } from "./cli.ts";
import { asWords, per100, plural, shorten, tierLabel, valueName } from "./format.ts";
import { conditionsOf, describeConditions, giveOrTake, matches } from "./groups.ts";
import { openLog, type Clash, type Log } from "./log.ts";
import { loadPeople, valueCounts, type Field, type FieldValue, type Row } from "./population.ts";
import { answerOn, FILE, ownerAnswers, productOrNull } from "./product.ts";
import { plain } from "./reply.ts";
import { groupsOf } from "./sweep.ts";

/** A kind of term: the facts that say whom it fits, and the question to settle. */
export interface TermKind {
  kind: string;
  title: string;
  fields: string[];
  question: string;
  /** Every sentence of this kind is gathered into one term (prices, ways to pay, ways in). */
  merge?: boolean;
  /** The fields to count for a term's words in place of `fields`, or null when none is for them. */
  fieldsFor?: (quotes: string[]) => string[] | null;
  /** The groups a term of this kind likely suits, as conditions, or null. */
  suggest?: (fields: Field[], quotes: string[]) => string[] | null;
  /** What to look up in the rules where it is sold. */
  rules?: string;
}

/** A kind the request's words can point at: `find` is the pattern for a sentence holding one. */
export interface FoundKind extends TermKind {
  find: RegExp;
}

/** A term that is always there, whether or not the request says so, with the words it is quoted by. */
export interface StandingKind extends TermKind {
  quote: string;
}

/** A term: its id ("price-1", or the kind for one gathered or always there), its kind and the owner's words. */
export interface Term {
  id: string;
  kind: string;
  quotes: string[];
}

/** A term as the model listed it, read from JSON: the owner's words and the kind, either of which may be missing. */
export interface ListedTerm {
  quote?: string;
  kind?: string;
}

/** A place the patterns read as a contradiction that the agent set aside, and why it is not one. */
export interface NotClash {
  quote?: string;
  why?: string;
}

/** A place a request contradicts itself by the patterns, with a sentence from either side (one when both are in it). */
export interface PatternClash {
  what: string;
  quotes: string[];
}

/** Who fits a term among the audience: the share, each person's fit, how many were counted, and the groups in words. */
export interface FitCount {
  fits: number;
  inFit: boolean[];
  n: number;
  text: string;
}

/** The facts that count who has what a requirement asks for, and what nothing here counts. */
interface Requirement {
  find: RegExp;
  fields: string[];
  missing?: string;
}

/** A term as the "terms" block for suggestions.json starts it. */
interface BlockEntry {
  term: string;
  kind?: string;
  quote?: string;
  fits: string[];
  rules?: string;
}

const NUMBERS: Partial<Record<string, number>> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

/** The codes of a field's values that match a pattern, or none if the map has no such field. */
export function codes(fields: Field[], name: string, pattern: RegExp): string[] {
  const field = fields.find((f) => f.name === name);
  return field ? (field.values ?? []).map((value) => value.code).filter((code) => pattern.test(code)) : [];
}

/** "2 or 4 people" suits households of 2 and of 4; "up to five people" suits households of one to five. */
export function sizeFits(fields: Field[], quotes: string[]): string[] | null {
  const match = KINDS[0].find.exec(quotes.join(" "));
  if (!match) return null;
  const numbers = [...match[0].matchAll(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/gi)].map(
    (m) => NUMBERS[m[1].toLowerCase()] ?? Number(m[1]),
  );
  const upTo = /up to|at most|maximum of/i.test(
    quotes.join(" ").slice(Math.max(0, match.index - 12), match.index + match[0].length),
  );
  const sizes = upTo ? Array.from({ length: Math.max(...numbers) }, (_, i) => i + 1) : numbers;
  const available = new Set(codes(fields, "people_in_household", /./));
  const wanted = [...new Set(sizes.map((n) => (n >= 8 ? "8_or_more" : String(n))))].filter((code) =>
    available.has(code),
  );
  return wanted.length ? [`people_in_household=${wanted.join("|")}`] : null;
}

/** Who is free in the working day: not in work, part time, on shifts, or working from home. */
export function hoursFits(fields: Field[]): string[] {
  const shifts = codes(fields, "shift_work", /shift|irregular/).filter((code) => !/^no_|regular_daytime/.test(code));
  return [
    "full_time_or_part_time=part_time|not_in_employment",
    shifts.length ? `shift_work=${shifts.join("|")}` : null,
    "usual_work_location=works_only_from_home",
  ].filter((fit) => fit !== null);
}

/** The kinds of term a request fixes, each with the facts that say whom it fits and the question to settle. */
export const KINDS: FoundKind[] = [
  {
    kind: "size",
    title: "A size: how many people it is for",
    find: /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b[^.;\n]{0,25}?\b(people|persons?|adults|users|servings|seats)\b/i,
    fields: ["people_in_household", "household_type"],
    question:
      "Which households does each size fit? What is offered to the ones between the sizes, below the smallest and above the largest?",
    suggest: sizeFits,
  },
  {
    kind: "hours",
    title: "Hours: when it is open, runs or arrives",
    find: /\b\d{1,2}(:\d{2})?\s?(am|pm)\b|\b(weekdays?|weekends?|evenings?|mornings?|off-peak|peak hours|opening hours|overnight|24\/7|working hours|business hours)\b/i,
    fields: [
      "full_time_or_part_time",
      "shift_work",
      "economic_activity_status",
      "usual_work_location",
      "unpaid_care_hours_per_week",
    ],
    question:
      "Who is free at these times, and who is at work or caring then? They are who an option tied to these hours suits.",
    suggest: hoursFits,
  },
  {
    kind: "price",
    title: "The prices",
    merge: true,
    find: /[£$€]\s?\d/,
    fields: [
      "could_cover_an_unexpected_expense",
      "managing_financially",
      "household_income_before_tax_per_year",
      "compares_prices_before_buying",
    ],
    question:
      "Who is each amount a lot for, when is it taken, and what does the difference between two options come to in money?",
  },
  {
    kind: "commitment",
    title: "Commitments: a term, notice, renewal, pause or trial",
    merge: true,
    find: /\b(contract|minimum term|notice|subscription|auto-?renew\w*|renews? automatically|automatic renewal|rolls? on|trial|skip|freeze|pause|non-?refundable|no refunds?|deposit|cancellation fee|lock-?in|pay(?:ment)? (?:up ?front|in advance)|upfront|prepaid|prepay)\b/i,
    fields: [
      "financial_planning_horizon",
      "employment_contract_type",
      "managing_financially",
      "financial_risk_tolerance",
    ],
    question:
      "Who cannot be sure of their money or plans for this long, and what does leaving, pausing or forgetting cost them?",
    rules: [
      "What do the rules where you sell say about this (ending it, notice, renewal reminders, a charge for a missed or late change)?",
      "Look at the regulator's or the government's guidance, or the law itself.",
    ].join(" "),
  },
  {
    kind: "payment",
    title: "How people pay",
    merge: true,
    // "card" alone is a library card or an ID card as often as a way to pay, and "credit" a credit check.
    find: /\b((?:credit|debit|bank|payment) cards?|card (?:details|payments?|on file|number|only)|(?:pay|paying|pays|paid) (?:by|with|in) (?:card|cash|cheque|check)|direct debit|paypal|apple pay|google pay|bank transfer|cash|cashless|invoice|cheques?|standing order|venmo|zelle)\b/i,
    fields: ["online_activities_last_3_months", "could_cover_an_unexpected_expense", "financial_risk_tolerance"],
    question: "Who does not pay this way, or would not hand these details over before they have seen what they get?",
  },
  {
    kind: "access",
    title: "What it can see or do for the person",
    merge: true,
    find: /\b(links? to your|linked accounts?|connects? to your|access to your|bank accounts?|open banking|your data|your location|your contacts)\b/i,
    fields: [
      "financial_risk_tolerance",
      "changes_online_privacy_settings",
      "new_technology_adoption",
      "confidence_using_digital_devices_and_apps",
    ],
    question: "Who would worry about what this can see or do? Is it said plainly what it can and cannot do?",
    suggest: (fields) =>
      codes(fields, "financial_risk_tolerance", /not_willing/).length
        ? [`financial_risk_tolerance!=${codes(fields, "financial_risk_tolerance", /not_willing/).join("|")}`]
        : null,
  },
  {
    kind: "place",
    title: "Where it reaches",
    find: /\b(deliver\w* to|lower 48|nationwide|\d+ states|in the north|in the south|across the uk|postcode|zip code|branches|gyms|stores|shops|clinics|surgeries|offices|centres|centers|venues|sites|locations)\b/i,
    fields: ["region", "settlement_size", "vehicles_in_household", "main_travel_mode_for_everyday_trips"],
    question: "Who is outside the area, or cannot easily get to it? What do they see when they try?",
  },
  {
    kind: "label",
    title: "A name that says who it is for",
    find: /\b(famil(y|ies)|couples?|parents?|kids|children|students?|seniors?|retirees?|professionals?|singles?|teams?|individuals?)\b/i,
    fields: ["household_type", "couple_status", "own_dependent_children_at_home", "life_stage"],
    question: "Who does the name take in, and who would use it but read the name as not for them?",
  },
  {
    kind: "age",
    title: "An age limit",
    find: /\b\d{2}\s?\+|\b(over|under|aged?)\s\d{2}\b/i,
    fields: ["age_years"],
    question: "Who is outside the ages, and what do they see?",
  },
  {
    kind: "channel",
    title: "How it is reached: online, an app, a phone call, in person",
    merge: true,
    find: /\b(online|app|website|member area|email|text message|sms|phone|call|chat|in person|in store)\b/i,
    fields: [
      "internet_use_frequency",
      "devices_used_to_go_online",
      "digital_skill_level",
      "preferred_way_for_companies_to_contact_them",
    ],
    question: "Who does not do this the way it assumes? What other way in, or out, is there?",
    suggest: (fields) =>
      codes(fields, "internet_use_frequency", /daily|weekly_not/).length
        ? [`internet_use_frequency=${codes(fields, "internet_use_frequency", /daily|weekly_not/).join("|")}`]
        : null,
  },
  // Found missing in 20 scenarios: what a person must have or show, what is chosen for them, a limit, and what happens
  // to them later. Each shut people out while the request named no price, hours or channel.
  {
    kind: "requirement",
    title: "What a person must have or show",
    find: /\b((?:photo |government |valid )?(?:id|identification|passport|driving licen[cs]e|driver'?s licen[cs]e)|proof of (?:address|identity|income|id|residence|age)|utility bill|bank statements?|pay ?stubs?|payslips?|credit (?:check|score|history|report)|social security(?: number)?|ssn|references?|referral|voucher|r[ée]sum[ée]s?|cvs?|cover letter|own (?:car|transport|vehicle)|(?:a |your own )?(?:car|vehicle)|email address|mobile (?:number|phone)|smartphone|upload|online (?:test|assessment|account)|(?:income|earn) (?:of )?(?:at least |\d)|times the rent|guarantor)\b/i,
    fieldsFor: (quotes) => requirementFields(quotes.join(" ")),
    fields: ["devices_used_to_go_online", "confidence_using_digital_devices_and_apps"],
    question: "Who does not have this, or cannot show it easily? What other way in is there for them?",
  },
  {
    kind: "default",
    title: "What is chosen for the person: a default, a selection, an opt-out",
    merge: true,
    find: /\b(pre-?selected|pre-?ticked|ticked|selected by default|have it selected|by default|defaults? to|opted in|opt[- ]out|automatically (?:added|included|enrolled|selected|charged))\b/i,
    fields: [
      "financial_risk_tolerance",
      "managing_financially",
      "confidence_using_digital_devices_and_apps",
      "literacy_proficiency",
    ],
    question:
      "Who ends up with this without meaning to, and what does it cost them? A paid extra or a consent is chosen by the person, never for them.",
  },
  {
    kind: "limit",
    title: "A limit: how much, how many or how often",
    // A count of things or uses, not of people (a size) or of days before something (a notice, under commitments).
    find: /\b(?:(?:up to|no more than|maximum of|max(?:imum)?|at most|only|limit(?:ed)? (?:to|of))\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:[a-z]+\s+)?(?:parcels?|visits?|requests?|bookings?|items?|sessions?|times|uses|tickets?|guests?|bags?|claims?|appointments?|changes?|transfers?|withdrawals?|downloads?|devices?)|once (?:a|per|every)\s+\w+|(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten) (?:times|visits|parcels|requests|bookings|items|sessions|claims) (?:a|per|in|every))\b/i,
    fields: [
      "people_in_household",
      "household_type",
      "managing_financially",
      "unpaid_care_hours_per_week",
      "day_to_day_activities_limited_by_health",
    ],
    question: "Who needs more than this, or more often, and what happens to them at the limit?",
  },
  {
    kind: "later",
    title: "What happens later: a fee, a penalty, a settle-up or what is lost",
    merge: true,
    find: /\b(late (?:fee|payment|charge)s?|penalt(?:y|ies)|settle-?up|true-?up|catch-?up (?:bill|payment)|fine[ds]?|forfeit\w*|lien|(?:sold|auctioned) (?:at|after|off)|repossess\w*|debt collect\w*|interest (?:of|at)|missed[- ](?:appointment[- ])?fee|no-?show fee|admin(?:istration)? fee|charged? (?:if|when|for missing))\b/i,
    fields: [
      "could_cover_an_unexpected_expense",
      "managing_financially",
      "financial_planning_horizon",
      "day_to_day_activities_limited_by_health",
    ],
    question: "Who is caught by this later, how much is it to them, and do they see it coming?",
    rules:
      "What do the rules where you sell say about this (fair fees, notice before a charge or a sale, limits on penalties)? Look at the regulator's or the government's guidance, or the law itself.",
  },
];

/** The facts that count who has what a requirement asks for, and what nothing here counts. */
const REQUIRES: Requirement[] = [
  {
    find: /\b(id|identification|passport|licen[cs]e|proof of (?:identity|id|age))\b/i,
    fields: ["has_full_driving_licence", "citizenship", "migrant_generation"],
  },
  {
    find: /\b(proof of (?:address|residence)|utility bill|bank statement)/i,
    fields: ["years_at_current_address", "home_tenure", "accommodation_type"],
  },
  {
    find: /\b(pay ?stubs?|payslips?|proof of income|income|earn|times the rent|guarantor)\b/i,
    fields: ["employment_contract_type", "main_source_of_personal_income", "economic_activity_status"],
  },
  { find: /\b(car|vehicle|own transport|driv)/i, fields: ["has_full_driving_licence", "vehicles_in_household"] },
  {
    find: /\b(email|mobile|smartphone|upload|online (?:test|assessment|account)|r[ée]sum[ée]|cv|cover letter)/i,
    fields: ["devices_used_to_go_online", "digital_skill_level", "literacy_proficiency"],
  },
  {
    find: /\b(credit (?:check|score|history|report))/i,
    fields: ["unsecured_debt_excluding_student_loans", "managing_financially"],
    missing: "credit scores",
  },
  {
    find: /\b(social security|ssn)\b/i,
    fields: ["citizenship", "migrant_generation"],
    missing: "who has a Social Security number",
  },
  {
    find: /\b(references?|referral|voucher)\b/i,
    fields: ["economic_activity_status", "years_at_current_address"],
    missing: "who can get a reference or a referral",
  },
];

/** The fields for a requirement's words, with a line for what the people do not record. */
export function requirementFields(text: string): string[] | null {
  const hits = REQUIRES.filter((r) => r.find.test(text));
  return hits.length ? [...new Set(hits.flatMap((r) => r.fields))] : null;
}
export function requirementMissing(text: string): string[] {
  return REQUIRES.flatMap((r) => (r.missing && r.find.test(text) ? [r.missing] : []));
}

/** Terms that are always there, whether or not the request says so. For a choice no one opens on a screen (a plan, a phone line), the device term is answered fits_everyone. */
export const STANDING: StandingKind[] = [
  {
    kind: "english",
    title: "It is written in English",
    quote: "(always) The words are in English.",
    fields: ["english_speaking_ability", "main_language"],
    question:
      "Who reads English with difficulty, and what is done for them: plainer words, another language, a person to ask?",
    suggest: (fields) =>
      codes(fields, "english_speaking_ability", /not_well|does_not/).length
        ? [`english_speaking_ability!=${codes(fields, "english_speaking_ability", /not_well|does_not/).join("|")}`]
        : null,
  },
  {
    kind: "device",
    title: "It is opened on whatever the person has",
    quote: "(always) It is opened on whatever device the person has.",
    fields: [
      "devices_used_to_go_online",
      "confidence_using_digital_devices_and_apps",
      "serious_functional_difficulties",
    ],
    question: "Who has only a phone, who is not confident with one, and who cannot see or handle small controls?",
  },
];

/** A term the owner fixed that is none of the kinds above. */
export const OTHER: TermKind = {
  kind: "other",
  title: "Another term the owner fixed",
  fields: [],
  question: "Whom does it suit, whom does it leave out, and what is offered to them?",
};

const KIND = new Map([...KINDS, OTHER, ...STANDING].map((k): [string, TermKind] => [k.kind, k]));
export const kindOf = (term: { kind: string }): TermKind | undefined => KIND.get(term.kind);
/** The kinds a listed term can be. */
export const TERM_KINDS: string[] = [...KINDS, OTHER].map((k) => k.kind);
/** Who pays, as terms takes it: a person or household, or an organisation. */
export const BUYERS: string[] = ["people", "businesses"];
/** The terms the owner set, without the ones that are always there. */
export const ownTerms = <T extends { kind: string }>(terms: T[]): T[] =>
  terms.filter((t) => !STANDING.some((s) => s.kind === t.kind));
// What suggest prints when the owner's request settles nothing of its own: every choice is the session's.
export const NO_OWN_TERMS = "The request sets no terms of its own";
// The words that mark a value the reply wrote for a fact only the owner can give (how long people have, who pays the
// postage) as theirs to settle: a fixed form to keep, not a phrasing to recognise.
export const OPEN_MARK = "yours to confirm";

/**
 * What the work needs that the request does not say and only the owner can, as the model listed it ([{ topic }], a
 * short name each): { open: [topic], problems }. Each is the owner's to say until they answer it (nxk.json), and
 * note_check looks for it in the reply, asked or marked.
 */
export function listedOpen(listed: unknown): { open: string[]; problems: string[] } {
  if (!Array.isArray(listed))
    return {
      open: [],
      problems: [
        [
          "List in open what the work needs that the request does not say and only the owner can (how long people have, who pays, what is excluded, how to reach them),",
          'each as { "topic": a short name }, or [] when the request gives all of it.',
        ].join(" "),
      ],
    };
  const problems: string[] = [],
    open: string[] = [];
  listed.forEach((entry: { topic?: string } | null, i) => {
    const topic = String(entry?.topic ?? "").trim();
    if (!plain(topic)) problems.push(`open ${i + 1} has no "topic": a short name for it, such as "return window"`);
    else if (topic.length > 60)
      problems.push(
        `open ${i + 1}, "${shorten(topic, 60)}": a short name of a few words, as the reply will name it, not a sentence`,
      );
    else if (open.some((t) => plain(t) === plain(topic))) problems.push(`open ${i + 1}, "${topic}", is listed twice`);
    else open.push(topic);
  });
  return { open, problems };
}

/** The sentences of a request: bullets and lines split, then sentences split where a full stop is followed by a capital. */
export function sentencesOf(text: string): string[] {
  return String(text)
    .split(/\n+/)
    .flatMap((line) => line.replace(/^\s*(?:[-*•]|\d+\.)\s+/, "").split(/(?<=[.!?])\s+(?=[A-Z£$€"(])/))
    .map((s) => s.trim())
    .filter(Boolean);
}

// Which terms a request fixes is read by the model, in the owner's words, and checked here: each quote must be in the
// request as written. The patterns in KINDS only point at sentences the list may have missed, and never decide: word
// patterns find a term in some wordings and miss it in others.
const plainQuote = (s: string) =>
  String(s)
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.;:,!?]+$/, "");

/** What is wrong with one listed term ({ quote, kind }) against the request, or null. */
export function quoteProblem(
  entry: ListedTerm,
  request: string,
  name = `"${shorten(String(entry?.quote ?? ""), 60)}"`,
): string | null {
  const quote = String(entry?.quote ?? "").trim();
  if (!quote) return `${name} has no "quote": copy the owner's words that set it, as they wrote them`;
  if (!TERM_KINDS.includes(entry.kind ?? ""))
    return `${name} has kind "${entry.kind ?? ""}", which is not one of: ${TERM_KINDS.join(", ")}`;
  if (!plainQuote(request).includes(plainQuote(quote)))
    return `${name} is not in the request as written: copy the owner's words exactly (a part of one sentence is enough)`;
  return null;
}

/**
 * The owner's terms as the model listed them ([{ quote, kind }]), with the two that are always there:
 * { terms: [{ id, kind, quotes }], problems }. Ids number each kind in the order listed.
 */
export function listedTerms(listed: unknown, request: string): { terms: Term[]; problems: string[] } {
  if (!Array.isArray(listed))
    return {
      terms: [],
      problems: [
        `List the terms the owner fixed, each as { "quote": their words, "kind": one of ${TERM_KINDS.join(", ")} }, or [] when they fixed none.`,
      ],
    };
  const entries: ListedTerm[] = listed;
  const problems: string[] = [],
    terms: Term[] = [],
    counts = new Map<string, number>();
  for (const entry of entries) {
    const problem = quoteProblem(entry, request);
    if (problem) {
      problems.push(problem);
      continue;
    }
    // quoteProblem has checked the kind is one of TERM_KINDS.
    const kind = String(entry.kind);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
    terms.push({
      id: `${kind}-${counts.get(kind)}`,
      kind,
      quotes: [String(entry.quote).trim()],
    });
  }
  return { terms: [...terms, ...STANDING.map((s) => ({ id: s.kind, kind: s.kind, quotes: [s.quote] }))], problems };
}

/**
 * Sentences of the request that the patterns take for a term no listed term covers: [{ kind, quote }]. A sentence is
 * covered by a listed quote of its kind (or "other") that overlaps it. A hint to look again, never a finding.
 */
export function unlistedTerms(
  terms: Pick<Term, "kind" | "quotes">[],
  request: string,
): { kind: string; quote: string }[] {
  const seen = new Set<string>();
  return ownTerms(termsIn(request)).flatMap((candidate) =>
    candidate.quotes.flatMap((sentence) => {
      const s = plainQuote(sentence),
        key = `${candidate.kind}|${s}`;
      const covered = terms.some(
        (t) =>
          (t.kind === candidate.kind || t.kind === "other") &&
          t.quotes.some((q) => s.includes(plainQuote(q)) || plainQuote(q).includes(s)),
      );
      if (covered || seen.has(key)) return [];
      seen.add(key);
      return [{ kind: candidate.kind, quote: sentence }];
    }),
  );
}

/**
 * Sentences the patterns take for terms, in a fixed order: [{ id, kind, quotes }]. A sentence gives one term of each
 * kind it holds; prices, ways to pay and ways in are each gathered into one. Used only to point at what a list missed.
 */
export function termsIn(text: string): Term[] {
  const sentences = sentencesOf(text);
  const out: Term[] = [];
  for (const kind of KINDS) {
    const hits = sentences.filter((s) => kind.find.test(s));
    if (!hits.length) continue;
    if (kind.merge) out.push({ id: kind.kind, kind: kind.kind, quotes: hits });
    else hits.forEach((s, i) => out.push({ id: `${kind.kind}-${i + 1}`, kind: kind.kind, quotes: [s] }));
  }
  for (const standing of STANDING) out.push({ id: standing.kind, kind: standing.kind, quotes: [standing.quote] });
  return out;
}

// Pairs of lines that pull against each other in one request: a rule and the exception that undoes it (fees fixed for
// the year, and reviewed every term), which only the owner can settle. The agent lists the clashes it reads
// (--clashes); these patterns only point out ones it may have missed.
export const CLASHES = [
  {
    a: /\bfixed (?:for|until|through)\b|\bprice (?:freeze|lock)|\bwon'?t (?:go up|rise|change)/i,
    b: /\breview(?:ed)? (?:every|each|them|it)|\b(?:rise|go up|increase|change)s? (?:every|each|from time)/i,
    what: "a price fixed and a price reviewed",
  },
  {
    a: /\bno (?:refunds?|discounts?|credit|reductions?)\b|\bnon-refundable\b/i,
    b: /\bwithout paying\b|\bfree of charge\b|\b(?:refund|discount|credit)(?:ed)? (?:if|when|for)\b|\bdon'?t (?:have to )?pay (?:for|during)\b/i,
    what: "no refunds or discounts, and a time that is not paid for",
  },
  {
    a: /\b(?:are|is|it'?s|they'?re) free\b|\bfree of charge\b|\bat no cost\b/i,
    b: /\bevery(?:one| child| member| customer| person)? (?:pays|must pay|is charged)\b|\bcompulsory (?:charge|fee)\b/i,
    what: "something free, and a charge everyone pays",
  },
];

/**
 * The clashes the agent listed ([{ a, b }], each side in the owner's words), checked against the request:
 * { clashes, problems }.
 */
export function listedClashes(listed: unknown, request: string): { clashes: Clash[]; problems: string[] } {
  if (!Array.isArray(listed))
    return {
      clashes: [],
      problems: [
        'List where the request contradicts itself, each as { "a": the owner\'s words on one side, "b": on the other }, or [] when it does not.',
      ],
    };
  const problems: string[] = [],
    clashes: Clash[] = [];
  listed.forEach((entry: Partial<Clash> | null, i) => {
    const sides = (["a", "b"] as const).map((side) => String(entry?.[side] ?? "").trim());
    const wrong = ["a", "b"].filter((side, k) => !sides[k] || !plainQuote(request).includes(plainQuote(sides[k])));
    if (!wrong.length) {
      clashes.push({ a: sides[0], b: sides[1] });
      return;
    }
    const are = plural(wrong.length, "is", "are");
    problems.push(
      [
        `clash ${i + 1}: ${wrong.map((side) => `"${side}"`).join(" and ")} ${are} not in the request as written:`,
        "copy the owner's words on each side exactly (a part of one sentence is enough)",
      ].join(" "),
    );
  });
  return { clashes, problems };
}

/**
 * The places the patterns read a contradiction (clashesIn) that the agent neither listed in clashes nor set aside in
 * notClashes ([{ quote, why }]). A pattern cannot say a request contradicts itself, nor can the agent be left to miss
 * one: the nursery owner's "no refunds ... but two weeks' holiday without paying" went unraised when it was only a
 * hint. So each is put back to the agent to answer, either way, and a wrong one costs a line of why.
 */
export function unansweredClashes(
  request: string,
  clashes: Clash[],
  notClashes: NotClash[] | null = [],
): PatternClash[] {
  const covers = (quote: string, words: string) => {
    const q = plainQuote(quote),
      w = plainQuote(words);
    return Boolean(w) && (q.includes(w) || w.includes(q));
  };
  const set = (notClashes ?? []).filter((n) => String(n?.why ?? "").trim());
  return clashesIn(request).filter(
    (c) =>
      !c.quotes.some(
        (quote) =>
          clashes.some((x) => covers(quote, x.a) || covers(quote, x.b)) ||
          set.some((n) => covers(quote, String(n.quote ?? ""))),
      ),
  );
}

/** The places a request contradicts itself by the patterns: [{ what, quotes }], each with a line from either side. */
export function clashesIn(text: string): PatternClash[] {
  const sentences = sentencesOf(text);
  return CLASHES.flatMap(({ a, b, what }) => {
    const left = sentences.find((s) => a.test(s)),
      right = sentences.find((s) => b.test(s));
    return left && right ? [{ what, quotes: left === right ? [left] : [left, right] }] : [];
  });
}

/** The share of the audience in any of the groups (each a set of conditions joined by commas). */
export function countFits(fields: Field[], audience: Row[], fits: string[]): FitCount {
  const groups = fits.map((text) => conditionsOf(fields, String(text).split(",")));
  const inFit = audience.map((row) => groups.some((conditions) => matches(conditions, row)));
  const k = inFit.filter(Boolean).length;
  return {
    fits: audience.length ? k / audience.length : 0,
    inFit,
    n: audience.length,
    text: groups.map(describeConditions).join("; or "),
  };
}

/** How a field's values divide the audience: [{ label, share }], largest first among values held by 2 in 100 or more. */
export function spread(field: Field, f: number, audience: Row[]): { label: string; share: number }[] {
  // A long label is cut short on the line, so it is replaced by its code, which says the same in fewer words.
  const name = (value: FieldValue) => valueName(value, 50);
  // A listed field is counted in one pass; a numeric field's bands are tested one by one.
  const counts = field.quantiles ? null : valueCounts(field, f, audience);
  const groups: ({ label: string; count: number } | { label: string; test: (row: Row) => boolean })[] = counts
    ? (field.values ?? []).map((value, v) => ({ label: name(value), count: counts[v] }))
    : groupsOf(field, f);
  // Values that are numbers (people in the household) stay in their order; the rest go largest first.
  const ordered = field.quantiles || (field.values ?? []).every((value) => /^\d/.test(String(value.code)));
  return groups
    .map((g) => ({
      label: g.label,
      share: audience.length ? ("count" in g ? g.count : audience.filter(g.test).length) / audience.length : 0,
    }))
    .filter((line) => line.share >= 0.02)
    .sort((a, b) => (ordered ? 0 : b.share - a.share))
    .slice(0, 8);
}

/**
 * What the work needs that only the owner can say, as listed, each with the owner's answer when nxk.json keeps one (an
 * answered fact is theirs, no longer open), and what the reply must do with the rest. Each is kept as an "open" record,
 * which note_check reads. A request that fixes nothing, with nothing listed open, gets a line to look again.
 */
function printOpen(log: Log, open: string[], { folder, fixed }: { folder: string; fixed: number }): void {
  const product = productOrNull(folder),
    answers = product ? ownerAnswers(product) : [];
  if (!open.length) {
    if (!fixed)
      log.line(
        [
          `\nThe request fixes no terms, and you listed nothing in open, so what you write will settle all of it.`,
          `If it needs anything only the owner can say (how long, who pays, what is excluded, how to reach them), call terms again with it in open.`,
        ].join(" "),
        null,
      );
    return;
  }
  log.line(`\nWhat the work needs that only the owner can say, as you listed it in open:`, null);
  for (const topic of open) {
    const answer = answerOn(answers, topic);
    log.line(
      answer
        ? `  "${topic}": the owner said "${shorten(answer.answer, 80)}" (${FILE}). Use it as theirs.`
        : `  "${topic}"`,
      null,
    );
    log.record("open", { topic });
  }
  if (open.every((topic) => answerOn(answers, topic))) return;
  const contact = [
    `- A name, or a way to reach the business (its name, address, phone, email, company or FCA number, opening hours):`,
    `put a [placeholder] in the page or draft, in the words named here ("[shop phone]"). It needs no line in the reply.`,
  ].join(" ");
  const mark = `${OPEN_MARK.charAt(0).toUpperCase()}${OPEN_MARK.slice(1)}`;
  const term = [
    `- What a person pays, gets, must do or agrees to (how long they have, who pays the postage, what cannot be returned):`,
    `never write a value of yours as the owner's rule.`,
    `Leave a [placeholder] naming it in the page or draft, with the usual value inside if it helps ("[return window: 30 days?]"),`,
    `and name what to fill in one short line of the reply; or write the value and mark it there: "${mark}: return window, 30 days."`,
  ].join(" ");
  log.line(
    [
      `Do not write one as settled. If the owner can answer now, ask with owner_ask (topic as written here): the answer is kept, and closes it. Otherwise:`,
      contact,
      term,
      `Brackets go in the page or draft, never in the reply's own lines. note_check looks for each.`,
    ].join("\n"),
    null,
  );
}

export async function run(argv: string[], out: Out, { folder }: RunContext): Promise<void> {
  const {
    positionals: [file],
    flags,
  } = argsOf(argv);
  if (!file || !["uk", "us"].includes(flags.country)) throw usageExit(import.meta.url, out, argv);
  // Its figures are counted on the people; the owner's own words it repeats (quotes, the terms block) carry none.
  const log = openLog("terms", argv, { label: "counted", ...out });
  const { map, people: everyone, drawnFor } = loadPeople(flags.country, { people: flags.people || undefined, folder });
  const fields = map.fields;
  const among = conditionsOf(fields, flags.among ? flags.among.split(",") : []);
  const audience = everyone.filter((row) => matches(among, row));
  const whom = among.length ? "the audience" : drawnFor ? `the audience (${drawnFor})` : "adults";
  const request = readIn(folder, file, "utf8");
  if (!flags.terms)
    throw new Error(
      `List the terms the owner fixed (terms.json: [{ "quote": their words, "kind": one of ${TERM_KINDS.join(", ")} }], or [] when they fixed none).`,
    );
  if (!BUYERS.includes(flags.buyer))
    throw new Error(`Say who pays: --buyer=people (a person or a household) or --buyer=businesses (an organisation).`);
  const { terms, problems } = listedTerms(JSON.parse(readIn(folder, flags.terms, "utf8")), request);
  const { clashes, problems: unquoted } = flags.clashes
    ? listedClashes(JSON.parse(readIn(folder, flags.clashes, "utf8")), request)
    : { clashes: [], problems: [] };
  const { open, problems: unopened } = listedOpen(flags.open ? JSON.parse(readIn(folder, flags.open, "utf8")) : null);
  if (problems.length || unquoted.length || unopened.length)
    throw new Error(`Fix the terms first:\n- ${[...problems, ...unquoted, ...unopened].join("\n- ")}`);
  const unanswered = unansweredClashes(
    request,
    clashes,
    flags["not-clashes"] ? JSON.parse(readIn(folder, flags["not-clashes"], "utf8")) : [],
  );
  if (unanswered.length) {
    const places = plural(unanswered.length, "place");
    const why = [
      `Nothing was counted. Word patterns read ${unanswered.length} more ${places} the request may contradict itself, which you have not answered.`,
      "They are often wrong, so it is yours to say: list each that is one in clashes, each side in the owner's words;",
      'give each that is not in not_clashes, as { "quote": its words, "why": why it does not contradict itself }.',
    ].join(" ");
    const listed = unanswered.map((c) => `- ${c.what}: ${c.quotes.map((q) => `"${q}"`).join(" against ")}`);
    throw new Error(`${why}\n${listed.join("\n")}`);
  }
  const found = ownTerms(terms).length;
  for (const term of ownTerms(terms)) log.record("owner_term", { id: term.id, kind: term.kind, quotes: term.quotes });
  const narrowed = among.length ? ` (${describeConditions(among)}: ${audience.length} generated people)` : "";
  log.line(
    `${found} terms the owner fixed in ${file}, as you listed them, and the ${STANDING.length} that are always there. Counted in every 100 of ${whom}${narrowed}.`,
    null,
  );
  if (audience.length < 300)
    log.line(
      `Only ${audience.length} people: a figure of 10 in 100 is give or take ${giveOrTake(0.1, audience.length)}.`,
      null,
    );

  const block: BlockEntry[] = [];
  for (const term of terms) {
    // listedTerms keeps only the kinds listed, and the ones always there.
    const kind = kindOf(term)!;
    log.line(`\n[${term.id}] ${kind.title}`, null);
    for (const quote of term.quotes.slice(0, 4)) log.line(`  "${shorten(quote)}"`, null);
    if (term.quotes.length > 4) log.line(`  and ${term.quotes.length - 4} more`, null);
    log.line(`  Ask: ${kind.question}`, null);
    for (const name of kind.fieldsFor?.(term.quotes) ?? kind.fields) {
      const f = fields.findIndex((field) => field.name === name);
      if (f < 0) continue;
      const lines = spread(fields[f], f, audience);
      // In a small audience a share is one or two people: say so, rather than print a share that reads as exact.
      const shown = (share: number) =>
        audience.length < 100 ? `${Math.round(share * audience.length)} of ${audience.length}` : per100(share);
      if (lines.length)
        log.line(
          `  ${asWords(name)} [${tierLabel(fields[f].tier)}]: ${lines.map((l) => `${l.label} ${shown(l.share)}`).join(" | ")}`,
        );
    }
    if (term.kind === "requirement")
      for (const what of requirementMissing(term.quotes.join(" ")))
        log.line(`  Nothing here counts ${what}: a figure for it is sourced, with the page, or a guess.`, null);
    const suggested = kind.suggest?.(fields, term.quotes) ?? null;
    if (suggested) {
      const counted = countFits(fields, audience, suggested);
      log.line(
        [
          `  Suggested fits ${JSON.stringify(suggested)}: suits ${per100(counted.fits)}, leaves out ${per100(1 - counted.fits)} in every 100 of ${whom} (counted).`,
          "Change it if the term means something else.",
        ].join(" "),
      );
    }
    if (kind.rules)
      log.line(
        [
          `  Look up: ${kind.rules} Open each page with source_check, the link and words copied from the page with the figure (a search summary is not the page).`,
          `Write in "rules" what the page says, with the publisher, the year and the link; or "rules_not_found": "what you searched, or why you could not".`,
        ].join(" "),
        null,
      );
    const own = STANDING.some((s) => s.kind === term.kind) ? {} : { kind: term.kind, quote: term.quotes[0] };
    block.push({ term: term.id, ...own, fits: suggested ?? [], ...(kind.rules ? { rules: "" } : {}) });
  }
  const unlisted = unlistedTerms(terms, request);
  if (unlisted.length) {
    log.line(
      `\nNot in your list, and may be terms the owner fixed (a hint from word patterns, often wrong): add one if the owner fixed it, and leave it out if not.`,
      null,
    );
    // An unlisted term's kind is one of KINDS.
    for (const u of unlisted) log.line(`  ${kindOf(u)!.title.split(":")[0]}: "${shorten(u.quote, 100)}"`, null);
  }
  if (clashes.length) {
    log.line(
      [
        `\nThe request contradicts itself in ${clashes.length} ${plural(clashes.length, "place")}, as you listed them.`,
        "Do not settle one yourself: ask the owner which holds (owner_answer keeps it), or write one reading and mark it in the reply as the owner's to confirm.",
        "Either way, put each to the owner in one point of the reply, outside any draft, with both sides in their words as below (note_check looks for them).",
      ].join(" "),
      null,
    );
    for (const c of clashes) log.clash(c);
  }
  printOpen(log, open, { folder, fixed: found });
  // A request sold to businesses (HR software at £8 per employee) is paid for by firms, so shares of adults at small
  // employers do not say how hard a price is for its buyers.
  if (flags.buyer === "businesses") {
    log.line(`\n${BUSINESS_NOTE}`, null);
    log.keep(PEOPLE_NOT_BUSINESSES);
  } else if (sellsToBusinesses(request))
    log.line(
      `\nThe request may be sold to businesses (a hint from word patterns, often wrong): if an organisation pays, call terms again with buyer businesses.`,
      null,
    );
  log.line(
    [
      "\nThese are the owner's terms: build them as given, and offer any change in the note, never make it.",
      `Copy into suggest's suggestions, beside "request": "${file}", keeping each "kind" and "quote" (suggest checks the quotes against the request again).`,
      'Fill every empty "fits" with the groups the term suits (any of them; conditions joined by commas), or replace it with "fits_everyone": "why".',
      'Fill every "rules" from what you look up, or replace it with "rules_not_found".',
      "suggest counts who each term leaves out;",
      `one that leaves out 10 in every 100 or more must be named in a suggestion's "terms" (the owner's option as asked, and what you would offer), or given "no_suggestion": "why".\n`,
    ].join(" "),
    null,
  );
  log.line(`"terms": [\n${block.map((b) => `  ${JSON.stringify(b)}`).join(",\n")}\n]`, null);
}

cli(import.meta.url, run);
