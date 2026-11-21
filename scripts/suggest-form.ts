// The suggestions form: reading suggestions.json, checking it, and the terms it lists. No people are counted here.

import { shorten } from "./format.ts";
import { conditionsOf, margin } from "./groups.ts";
import type { Country, Field } from "./population.ts";
import { describeProblems, sourceProblems, type SourceRecord } from "./source.ts";
import { kindOf, quoteProblem, STANDING, type Term } from "./terms.ts";

/** One way a suggestion could go, as suggestions.json gives it. */
export interface SuggestionOption {
  name: string;
  /** What a person must have or be to get through at all, as conditions; people who do not meet them are ruled out. */
  needs?: string[];
  /** Groups it is harder for, each a set of conditions joined by commas. */
  bears_on?: string[];
  /** Figures for scripts/sums.ts ("visitors=1000, start=4%"), which every option of a suggestion must have, or none. */
  sums?: string;
}

/** A choice in the work, as suggestions.json gives it: something the owner set, or a choice left to the session. */
export interface Suggestion {
  /** What it is about, in a few words. */
  suggestion: string;
  /** The owner's option, kept in what is built; none for a choice the owner left to the session. */
  as_asked?: string;
  /** The figure, said before counting, at which the other option is worth raising ("N in 100"). */
  rule?: string;
  /** Which count the rule is about (countKeys). */
  count?: string;
  options: SuggestionOption[];
  /** What the session would do if the owner says yes, as words that follow "Say yes and I'll". */
  offer?: string;
  /** The number to watch once it is built. */
  watch?: string;
  /** The owner's terms it answers, by id. */
  terms?: string[];
}

/** A term the owner fixed, as suggestions.json lists it (terms prints each block to copy). */
export interface TermEntry {
  term: string;
  kind?: string;
  /** The owner's words that set it, as they wrote them. */
  quote?: string;
  /** The groups it suits (any of them), each a set of conditions joined by commas. */
  fits?: string[];
  /** Why it suits everyone, instead of `fits`. */
  fits_everyone?: string;
  /** Why a term that leaves out many is answered by no suggestion. */
  no_suggestion?: string;
  /** For a commitment: what the rules where the owner sells say about it, with the publisher, the year and the link. */
  rules?: string;
  /** Or what was searched, or why it could not be. */
  rules_not_found?: string;
}

/** suggestions.json, written by the agent before anything is counted (suggest.ts says what each part is). */
export interface SuggestionsSpec {
  country: Country;
  /** The audience the owner named, as conditions; none for all adults. */
  among?: string;
  /** What to call them in the reply. */
  audience?: string;
  /** The owner's request, saved as written. */
  request: string;
  /** Other people to count on than the country's own (loadPeople). */
  people?: string;
  terms?: TermEntry[];
  suggestions: Suggestion[];
}

/** A count a rule can be held against: its value in every 100, counted on `n` people. */
export interface ThresholdCount {
  value: number;
  n: number;
}

/** The count nearest a threshold, how far it is, and how near counts as close. */
export type NearestThreshold<C extends ThresholdCount> = C & {
  threshold: number;
  gap: number;
  within: number;
  close: boolean;
};

/** A term that leaves out this share of the audience or more must be answered by a suggestion, or say why not. */
export const LEAVES_OUT = 0.1;

/** The thresholds a rule states as "N in 100", "N in every 100" or "1 in 3", as figures in every 100. */
export function thresholdsOf(rule: string | undefined): number[] {
  return [...String(rule).matchAll(/(\d+(?:\.\d+)?)\s+in\s+(?:every\s+)?(\d+)\b/g)]
    .map((m) => (100 * Number(m[1])) / Number(m[2]))
    .filter((t) => t > 0 && t < 100);
}

/**
 * The count nearest a threshold, and whether it is a close call: within 2 in 100, a tenth of the threshold, or twice
 * the count's margin. Returns null when there is no threshold.
 */
export function nearestThreshold<C extends ThresholdCount>(
  counts: C[],
  thresholds: number[],
): NearestThreshold<C> | null {
  const pairs = counts.flatMap((count) =>
    thresholds.map((threshold) => ({ ...count, threshold, gap: Math.abs(count.value - threshold) })),
  );
  if (!pairs.length) return null;
  // The first of the nearest, when two are as near.
  const best = pairs.reduce((nearest, pair) => (pair.gap < nearest.gap ? pair : nearest));
  const within = Math.max(2, 0.1 * best.threshold, 200 * margin(best.value / 100, best.n));
  return { ...best, within, close: best.gap <= within };
}

/** The counts a suggestion's rule can be about, as "count" names them. */
export function countKeys(suggestion: Suggestion): string[] {
  return [
    ...(suggestion.terms ?? []).map((id) => `term ${id}`),
    ...(suggestion.options ?? []).flatMap((option) => [
      ...((option.needs ?? []).length ? [`${option.name}: rules out`] : []),
      ...(option.bears_on ?? []).map((group) => `${option.name}: harder for ${group}`),
      ...((option.bears_on ?? []).length > 1 ? [`${option.name}: harder for any`] : []),
    ]),
  ];
}

/** Whether a suggestion is about something the owner set: it names the owner's option, or answers one of their terms. */
export const ownersOf = (suggestion: Suggestion): boolean =>
  Boolean(suggestion.as_asked) || (suggestion.terms ?? []).some((id) => !STANDING.some((s) => s.kind === id));

/** Check a suggestions file and say everything wrong with it at once. Returns the list of problems. */
export function problems(spec: SuggestionsSpec, fields: Field[] | null): string[] {
  const out: string[] = [];
  if (!["uk", "us"].includes(spec.country)) out.push('"country" must be "uk" or "us"');
  if (!Array.isArray(spec.suggestions))
    out.push('"suggestions" must be a list: [] when nothing the owner set or you chose turns people away');
  if (!spec.request)
    out.push(
      '"request" is missing: save the owner\'s request as they wrote it (request.md), name it here and run the terms tool on it',
    );
  for (const entry of spec.terms ?? []) {
    for (const text of (entry.fits ?? []).flatMap((group) => String(group).split(","))) {
      try {
        if (fields) conditionsOf(fields, [text]);
      } catch (error) {
        out.push(`term "${entry.term}": ${(error as Error).message}`);
      }
    }
  }
  for (const [d, suggestion] of (Array.isArray(spec.suggestions) ? spec.suggestions : []).entries()) {
    const name = suggestion.suggestion || `suggestion ${d + 1}`;
    if (!suggestion.suggestion) out.push(`suggestion ${d + 1} has no "suggestion": what it is about, in a few words`);
    if (!Array.isArray(suggestion.options) || suggestion.options.length < 2)
      out.push(`"${name}" needs two or more options`);
    const names = (suggestion.options ?? []).map((option) => option.name);
    const withSums = (suggestion.options ?? []).filter((option) => option.sums).length;
    if (withSums && withSums < (suggestion.options ?? []).length)
      out.push(`"${name}": give "sums" for every option or none`);
    if (suggestion.as_asked !== undefined && !names.includes(suggestion.as_asked))
      out.push(
        `"${name}": "as_asked" must be the name of the option that is what the owner set: ${names.map((n) => `"${n}"`).join(" or ")}`,
      );
    if (ownersOf(suggestion)) {
      if (!suggestion.as_asked)
        out.push(
          `"${name}" answers the owner's terms: name their option in "as_asked" (it stays in the work; the other is offered)`,
        );
      if (!String(suggestion.rule ?? "").trim())
        out.push(
          `"${name}" has no "rule". Write it before counting: the figure at which the other option is worth raising ("worth raising if 10 in 100 or more ...")`,
        );
      if (!String(suggestion.offer ?? "").trim())
        out.push(
          `"${name}" has no "offer": what you would do if the owner says yes, as words that follow "Say yes and I'll" ("add a phone number beside the form")`,
        );
    }
    if (thresholdsOf(suggestion.rule).length) {
      const keys = countKeys(suggestion);
      if (!suggestion.count || !keys.includes(suggestion.count))
        out.push(
          `"${name}": say in "count" which count the rule is about, one of: ${keys.map((key) => `"${key}"`).join(", ") || "none yet (give an option needs or bears_on, or answer a term)"}`,
        );
    }
    for (const option of suggestion.options ?? []) {
      if (!option.name) out.push(`"${name}" has an option with no "name"`);
      for (const text of [...(option.needs ?? []), ...(option.bears_on ?? []).flatMap((group) => group.split(","))]) {
        try {
          if (fields) conditionsOf(fields, [text]);
        } catch (error) {
          out.push(`"${name}" / "${option.name}": ${(error as Error).message}`);
        }
      }
    }
  }
  return out;
}

/**
 * The owner's terms as suggestions.json lists them, each quote checked against the request, with the two that are always
 * there, and what is wrong with the list.
 */
export function termsOfSpec(spec: SuggestionsSpec, request: string): { terms: Term[]; problems: string[] } {
  const problems: string[] = [],
    terms: Term[] = [];
  for (const entry of spec.terms ?? []) {
    if (STANDING.some((s) => s.kind === entry.term)) continue;
    const problem = quoteProblem(entry, request, `term "${entry.term}"`);
    if (problem) problems.push(`${problem} (terms prints each term's block with its kind and quote)`);
    // quoteProblem has checked the kind is one of TERM_KINDS.
    else terms.push({ id: entry.term, kind: String(entry.kind), quotes: [String(entry.quote).trim()] });
  }
  return { terms: [...terms, ...STANDING.map((s) => ({ id: s.kind, kind: s.kind, quotes: [s.quote] }))], problems };
}

/**
 * What is wrong with the "terms" of a suggestions file, given the terms found in the request and the pages opened with
 * scripts/source.ts (its records, or null when none were kept).
 */
export function termProblems(spec: SuggestionsSpec, found: Term[], records: SourceRecord[] | null = null): string[] {
  const out: string[] = [];
  const given = new Map((spec.terms ?? []).map((entry) => [entry.term, entry]));
  for (const term of found) {
    const entry = given.get(term.id);
    if (!entry || (!(entry.fits ?? []).length && !String(entry.fits_everyone ?? "").trim()))
      out.push(
        `term "${term.id}" ("${shorten(term.quotes[0], 70)}") has no "fits": write the groups it suits, or "fits_everyone": "why" (terms prints the block)`,
      );
    const rules = kindOf(term)?.rules;
    if (!entry || !rules || String(entry.rules_not_found ?? "").trim()) continue;
    const said = String(entry.rules ?? "");
    if (!/https?:\/\/\S+/.test(said))
      out.push(
        `term "${term.id}" has no "rules" with a link. ${rules} Write what the page says with the publisher, the year and the link, or "rules_not_found": "what you searched, or why you could not"`,
      );
    else
      for (const problem of describeProblems(sourceProblems(said, records)))
        out.push(`term "${term.id}" "rules": ${problem}`);
  }
  const ids = new Set(found.map((term) => term.id));
  for (const suggestion of spec.suggestions ?? [])
    for (const id of suggestion.terms ?? [])
      if (!ids.has(id)) out.push(`"${suggestion.suggestion}" names term "${id}", which is not in "terms"`);
  return out;
}
