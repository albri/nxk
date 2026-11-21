// Counting for suggest.ts: the audience, each of the owner's terms, each option, and the groups a probe can name.
import { biggerDraw } from "./decision-model.ts";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { per100, shorten, unbracketed } from "./format.ts";
import {
  conditionsOf,
  describeConditions,
  effectiveN,
  giveOrTake,
  marked,
  matches,
  profile,
  rakeWhatFits,
  weightedShare,
  type ShareLine,
} from "./groups.ts";
import { logFile, type Log } from "./log.ts";
import type { Field, Row } from "./population.ts";
import { FILE, knownShares, type KnownShare, type Product } from "./product.ts";
import { readRecords, sourceProblems, sourcesFile, type SourceRecord } from "./source.ts";
import { countFits, kindOf, NO_OWN_TERMS, ownTerms, unlistedTerms, type Term } from "./terms.ts";
import {
  LEAVES_OUT,
  nearestThreshold,
  termProblems,
  termsOfSpec,
  type SuggestionOption,
  type SuggestionsSpec,
  type TermEntry,
} from "./suggest-form.ts";

/** A group an option bears on, counted: in words, how many, who (audience positions) and the facts that define it. */
export interface CountedGroup {
  text: string;
  n: number;
  members: number[];
  paths: string[];
}

/** One option counted on the audience. */
export interface OptionCount {
  /** Who its needs rule out, by position in the audience. */
  out: Set<number>;
  groups: CountedGroup[];
  /** Everyone it loses: ruled out, or in a group it is harder for. */
  lost: Set<number>;
  /** The audience's size. */
  n: number;
  /** The facts its needs read, and its needs in words. */
  needPaths: string[];
  needText: string;
}

/** An option with its count. */
export interface CountedOption extends OptionCount {
  option: SuggestionOption;
}

/**
 * A count a suggestion's rule can be held against, as "count" names it (`key`): its value in every 100 of the
 * audience and among the owner's customers, who is in it, and the words the probe and the note give it.
 */
export interface Count {
  key: string;
  label: string;
  value: number;
  /** In every 100 of people like the owner's customers, or null when the owner has said nothing usable. */
  customers: number | null;
  n: number;
  inGroup: Uint8Array;
  /** The facts that define the group, which a probe leaves out. */
  skip: Set<string>;
  /** Who is counted, in the probe's words ("those it rules out"). */
  counted: string;
  /** What does it, for the note ('"Online only" rules out'). */
  verb: string;
  /** What stops them, for the note ('are ruled out by "Online only"'). */
  barrier: string;
  /** Who they are, in the count's own words, or null. */
  who: string | null;
  /** How the people tool would count the same group, or null. */
  how: string | null;
}

/** A term's count, with how a probe names those it leaves out among other groups. */
export interface TermCount extends Count {
  other: string;
}

/** Another group of the same build, for a probe to name when it holds the same people. */
export interface OtherGroup {
  label: string;
  inGroup: Uint8Array;
  paths: Set<string>;
}

/** What the rules say about a commitment: the term, and the page's own words or that it was not looked up. */
export interface RulesOn {
  name: string;
  says: string;
}

/** The audience every count is of, as printed (weightedAudience). */
export interface WeightedAudience {
  audience: Row[];
  /** Whom the counts are of, for the reply. */
  whom: string;
  /** Weights that make the audience match what the owner said of their customers, or null when none apply. */
  w: Float64Array | null;
  /** A count among people like the owner's customers, in every 100, or null when the owner has said nothing usable. */
  ofCustomers: (members: Uint8Array) => number | null;
}

/** What suggest.ts counts from: the suggestions file, what nxk.json knows, the people's facts and the audience. */
export interface SuggestContext extends WeightedAudience {
  spec: SuggestionsSpec;
  product: Product;
  fields: Field[];
}

/** The owner's terms, counted (countTerms). */
export interface CountedTerms {
  /** The ids of the terms the owner set, without the ones that are always there. */
  own: Set<string>;
  termCounts: Map<string, TermCount>;
  ruleLines: RulesOn[];
}

/** Everything a suggestion is counted with: the context, the terms counted and the other groups of the build. */
export interface CountingContext extends SuggestContext, CountedTerms {
  others: OtherGroup[];
}

/**
 * One option counted on the audience: who its needs rule out, the size of each group it bears on, and everyone it
 * loses (either).
 */
export function countOption(fields: Field[], audience: Row[], option: SuggestionOption): OptionCount {
  const needs = conditionsOf(fields, option.needs ?? []);
  const out = new Set(audience.flatMap((row, i) => (matches(needs, row) ? [] : [i])));
  const lost = new Set(out);
  const groups = (option.bears_on ?? []).map((text) => {
    const conditions = conditionsOf(fields, text.split(","));
    const members = audience.flatMap((row, i) => (matches(conditions, row) ? [i] : []));
    for (const i of members) lost.add(i);
    return {
      text: describeConditions(conditions),
      n: members.length,
      members,
      paths: conditions.map((c) => c.path),
    };
  });
  return {
    out,
    groups,
    lost,
    n: audience.length,
    needPaths: needs.map((c) => c.path),
    needText: describeConditions(needs),
  };
}

/** A list of audience positions as a mask, for scripts/probe.ts. */
export const maskOf = (positions: Iterable<number>, n: number): Uint8Array => {
  const mask = new Uint8Array(n);
  for (const i of positions) mask[i] = 1;
  return mask;
};

/**
 * The audience every count is of, as printed: the people who meet "among" (or the audience nxk.json keeps), weighted
 * to what the owner said of their customers where that fits, with what the owner measured after earlier suggestions of
 * the same name.
 */
export function weightedAudience(
  log: Log,
  {
    spec,
    product,
    fields,
    everyone,
    env,
  }: { spec: SuggestionsSpec; product: Product; fields: Field[]; everyone: Row[]; env: NodeJS.ProcessEnv },
): WeightedAudience {
  const amongText = spec.among || product.audience?.among || "";
  const among = conditionsOf(fields, amongText ? String(amongText).split(",") : []);
  const audience = everyone.filter((row) => matches(among, row));
  // Conditions that keep every adult (age 18 to 120) name no one in particular: the reply says "adults".
  const whom =
    spec.audience || (among.length && audience.length < everyone.length ? describeConditions(among) : "adults");
  if (!spec.among && product.audience?.among)
    log.line(
      `Audience from ${FILE} (${product.audience.source}${product.audience.why ? `: ${product.audience.why}` : ""}).`,
    );
  if (!among.length)
    log.line(
      `Counted among all ${spec.country.toUpperCase()} adults. If the owner named who this is for, put it in "among"; otherwise say "of adults" in the reply.`,
    );
  else
    log.line(
      `Audience: ${whom} (${describeConditions(among)}): ${audience.length} generated people, ${per100(audience.length / everyone.length)} in every 100 adults.`,
    );
  const w = customerWeights(log, fields, audience, product);
  // What the owner measured after earlier suggestions of the same name: what was picked then, and how it did.
  const names = new Set(spec.suggestions.map((d) => String(d.suggestion).toLowerCase()));
  for (const o of product.outcomes.filter((x) => x.about?.suggestion && names.has(x.about.suggestion.toLowerCase()))) {
    const arms = o.arms.map((a) => `${a.name} ${a.took} of ${a.shown}`).join(", ");
    const pick = o.comparisons.map((c) => `against ${c.b}: ${c.verdict}`).join(", ");
    log.line(
      `Measured before (${FILE}, ${o.id}): "${o.about?.suggestion}", ${o.what}: ${arms}; the pick ${pick}. Weigh this above the counts below: it is what happened.`,
    );
  }
  // A count among people like the owner's customers, in every 100, or null when the owner has said nothing usable.
  const ofCustomers = (members: Uint8Array) => (w ? 100 * weightedShare(w, members) : null);
  if (audience.length < 300)
    log.line(
      `Only ${audience.length} people in the audience: figures are rough (a figure of 10 in 100 is give or take ${giveOrTake(0.1, audience.length)}). ${biggerDraw(env)}`,
    );
  return { audience, whom, w, ofCustomers };
}

/** Weights that make the audience match what the owner said of their customers, as printed; null when none apply. */
function customerWeights(log: Log, fields: Field[], audience: Row[], product: Product): Float64Array | null {
  const shares = knownShares(product);
  if (!shares.length) return null;
  const fitted = rakeWhatFits(
    audience,
    conditionsOf(
      fields,
      shares.map((s) => s.fact),
    ),
    shares.map((s) => s.share / 100),
  );
  const w = fitted.w;
  const said = (s: KnownShare) => `${conditionsOf(fields, [s.fact])[0].text}: ${s.share} in 100 (${s.source})`;
  if (w)
    log.line(
      [
        `The owner's customers (${FILE}): ${fitted.kept.map((k) => said(shares[k])).join("; ")}.`,
        `Each count is also given among people like them: the audience weighted to match (worth ${Math.round(effectiveN(w))} people unweighted).`,
      ].join(" "),
    );
  for (const { k, why } of fitted.left)
    log.line(`${w ? "Left out of that" : `Not used from ${FILE}`}: ${said(shares[k])}: ${why}.`);
  if (!w) log.line("So nothing is counted among people like the owner's customers.");
  return w;
}

/**
 * The owner's terms, each counted on the audience: whom it suits and leaves out. Refuses a quote that is not in the
 * request, a term with no fits, and a term that leaves out 10 in 100 or more (or close to it) when no suggestion
 * answers it.
 */
export function countTerms(
  log: Log,
  ctx: SuggestContext,
  { folder, file, env }: { folder: string; file: string; env: NodeJS.ProcessEnv },
): CountedTerms {
  const { spec, whom } = ctx;
  const requestText = readFileSync(resolve(folder, dirname(file), spec.request), "utf8");
  const { terms: requested, problems: quoted } = termsOfSpec(spec, requestText);
  const records = readRecords(sourcesFile(logFile(env, folder), folder));
  const wrong = [...quoted, ...termProblems(spec, requested, records)];
  if (wrong.length) throw new Error(`Fix the suggestions first:\n- ${wrong.join("\n- ")}`);
  log.line(`\n=== The owner's terms (${spec.request}): whom each suits, in every 100 of ${whom}`);
  const answered = new Set(spec.suggestions.flatMap((suggestion) => suggestion.terms ?? []));
  const own = new Set(ownTerms(requested).map((term) => term.id));
  if (!own.size) {
    log.line(
      [
        `${NO_OWN_TERMS}, only the ${requested.length} that are always there: every choice below is yours to make.`,
        "Take the option that turns away the fewest, at no cost to the owner's goals; what only the owner can say stays a [placeholder] or a question.",
      ].join(" "),
    );
  }
  const unlisted = unlistedTerms(requested, requestText);
  if (unlisted.length) {
    const quotes = unlisted.map((u) => `"${shorten(u.quote, 70)}" (${u.kind})`).join("; ");
    log.line(
      `Not in "terms", and may be terms the owner fixed (word patterns, often wrong; add one with terms if the owner fixed it): ${quotes}`,
    );
  }
  const unanswered: string[] = [],
    ruleLines: RulesOn[] = [],
    termCounts = new Map<string, TermCount>();
  for (const term of requested) {
    // termProblems has refused any term the file gives no entry.
    const entry = spec.terms?.find((t) => t.term === term.id);
    if (!entry) continue;
    if (kindOf(term)?.rules) ruleLines.push(rulesOn(term, entry, records));
    const counted = countTerm(log, term, entry, ctx);
    if (!counted) continue;
    if (counted.unanswered && !answered.has(term.id) && !String(entry.no_suggestion ?? "").trim())
      unanswered.push(counted.unanswered);
    termCounts.set(term.id, counted.count);
  }
  if (unanswered.length) throw new Error(`\nFix the suggestions first:\n- ${unanswered.join("\n- ")}`);
  return { own, termCounts, ruleLines };
}

/**
 * What the rules say about a commitment: the page's own words or that it was not looked up. Commitments the same rules
 * cover share a line (scripts/suggest-print.ts ruleLine).
 */
function rulesOn(term: Term, entry: TermEntry, records: SourceRecord[] | null): RulesOn {
  const name = `"${shorten(term.quotes[0], 40)}"`;
  if (entry.rules_not_found) return { name, says: `not looked up (${entry.rules_not_found}). For you to check.` };
  // termProblems has refused a commitment with neither rules nor rules_not_found.
  const { words } = sourceProblems(String(entry.rules), records);
  return { name, says: `${entry.rules} (sourced; the page says "${words.join('"; "')}")` };
}

/**
 * One term counted, as printed: whom it suits and leaves out, among the audience and the owner's customers, and what
 * is more common among those it leaves out. Returns null for a term that suits everyone; otherwise its count (for a
 * suggestion's rule and the probe), and what to do when it leaves out 10 in 100 or close to it.
 */
function countTerm(
  log: Log,
  term: Term,
  entry: TermEntry,
  { fields, audience, whom, ofCustomers }: SuggestContext,
): { count: TermCount; unanswered: string | null } | null {
  const says = shorten(term.quotes.join(" "), 90);
  if (!entry.fits?.length) {
    log.line(`\n[${term.id}] "${says}"\n  suits everyone, you said: ${entry.fits_everyone}`);
    return null;
  }
  const counted = countFits(fields, audience, entry.fits);
  const left = 1 - counted.fits;
  const outside = counted.inFit.map((x) => !x);
  const outsideMask = Uint8Array.from(outside, (x) => (x ? 1 : 0)),
    leftCustomers = ofCustomers(outsideMask);
  const theirs =
    leftCustomers === null ? "" : `; among the owner's customers it leaves out ${leftCustomers.toFixed(1)}`;
  log.line(
    `\n[${term.id}] "${says}"\n  suits ${per100(counted.fits)}, leaves out ${per100(left)} in every 100 of ${whom} (give or take ${giveOrTake(left, counted.n)})${theirs}. Suits: ${counted.text}`,
  );
  const fitPaths = new Set(
    entry.fits.flatMap((g) => String(g).split(",")).map((text) => conditionsOf(fields, [text])[0].path),
  );
  let lines: ShareLine[] = [];
  if (outside.filter(Boolean).length >= 30 && counted.inFit.filter(Boolean).length >= 30) {
    // Only what is more common among them, and no value that only says a field does not apply.
    lines = marked(
      profile(fields, audience, outside).filter(
        (line) =>
          !fitPaths.has(line.path) &&
          !line.numeric &&
          line.gap > 0 &&
          !/^(not_applicable|not_in_employment|self_employed_or_not)/.test(String(line.code)),
      ),
      { top: 4 },
    );
    if (lines.length)
      log.line(
        `  more common among those it leaves out than among all of ${whom}: ${lines.map((line) => `${unbracketed(line.label)} (${per100(line.group)} against ${per100(line.all)})`).join("; ")}`,
      );
  }
  const near = nearestThreshold([{ value: 100 * left, n: counted.n }], [100 * LEAVES_OUT])!;
  const over = left >= LEAVES_OUT ? "" : `, close to the ${100 * LEAVES_OUT} in 100 at which a term must be answered`;
  const unanswered =
    left >= LEAVES_OUT || near.close
      ? [
          `term "${term.id}" leaves out ${per100(left)} in every 100 of ${whom}${over}:`,
          `put "${term.id}" in the "terms" of a suggestion (the owner's term as asked, kept, and what you would offer those people instead),`,
          `or give the term "no_suggestion": "why" (the owner chose it for a reason they gave, the law requires it, or nothing would let those people in)`,
        ].join(" ")
      : null;
  const count: TermCount = {
    key: `term ${term.id}`,
    label: `the term "${shorten(term.quotes[0], 40)}" leaves out`,
    value: 100 * left,
    customers: leftCustomers,
    n: counted.n,
    inGroup: outsideMask,
    skip: fitPaths,
    counted: "those it leaves out",
    other: `left out by the term ${term.id} ("${shorten(term.quotes[0], 40)}")`,
    verb: `"${shorten(term.quotes[0], 60)}" leaves out`,
    barrier: `are left out by "${shorten(term.quotes[0], 60)}"`,
    who: lines[0] ? `more often than others: ${unbracketed(lines[0].label).toLowerCase()}` : null,
    how: entry.fits.length === 1 ? `--lacking="${entry.fits[0]}"` : null,
  };
  return { count, unanswered };
}

/**
 * The groups a probe can name as holding the same people: those each term leaves out, each option rules out and each
 * option is harder for. A group defined by the same facts as the one probed only restates it (closeCall leaves it out).
 */
export function othersOf(termCounts: Map<string, TermCount>, countedAll: CountedOption[][], N: number): OtherGroup[] {
  return [
    ...[...termCounts.values()].map((count) => ({ label: count.other, inGroup: count.inGroup, paths: count.skip })),
    ...countedAll.flatMap((options) =>
      options.flatMap(({ option, out, groups, needPaths }) => [
        ...((option.needs ?? []).length
          ? [{ label: `ruled out by "${option.name}"`, inGroup: maskOf(out, N), paths: new Set(needPaths) }]
          : []),
        ...groups.map((group) => ({
          label: `"${option.name}" is harder for: ${group.text}`,
          inGroup: maskOf(group.members, N),
          paths: new Set(group.paths),
        })),
      ]),
    ),
  ];
}

/** The counts a rule can be held against for one option, as "count" names them, each also among the customers. */
export function optionCounts(
  { option, out, groups, lost, n, needPaths, needText }: CountedOption,
  ofCustomers: WeightedAudience["ofCustomers"],
): Count[] {
  const harder = "those it is harder for";
  const needs = option.needs ?? [],
    bearsOn = option.bears_on ?? [];
  const counts: Omit<Count, "customers">[] = [];
  if (needs.length)
    counts.push({
      key: `${option.name}: rules out`,
      label: `${option.name} rules out`,
      value: (100 * out.size) / n,
      n,
      inGroup: maskOf(out, n),
      skip: new Set(needPaths),
      counted: "those it rules out",
      verb: `"${option.name}" rules out`,
      barrier: `are ruled out by "${option.name}"`,
      who: `who are not: ${needText.toLowerCase()}`,
      how: `--lacking="${needs.join(",")}"`,
    });
  groups.forEach((group, k) =>
    counts.push({
      key: `${option.name}: harder for ${bearsOn[k]}`,
      label: `${option.name} is harder for ${group.text}:`,
      value: (100 * group.n) / n,
      n,
      inGroup: maskOf(group.members, n),
      skip: new Set(group.paths),
      counted: harder,
      verb: `"${option.name}" is harder for`,
      barrier: `find "${option.name}" harder`,
      who: group.text.toLowerCase(),
      how: `--who="${bearsOn[k]}"`,
    }),
  );
  if (groups.length > 1)
    counts.push({
      key: `${option.name}: harder for any`,
      label: `${option.name} is harder for, any of these,`,
      value: (100 * (lost.size - out.size)) / n,
      n,
      inGroup: maskOf(
        [...lost].filter((i) => !out.has(i)),
        n,
      ),
      skip: new Set(groups.flatMap((group) => group.paths)),
      counted: harder,
      verb: `"${option.name}" is harder for`,
      barrier: `find "${option.name}" harder`,
      who: groups.map((group) => group.text.toLowerCase()).join("; or "),
      how: null,
    });
  return counts.map((count) => ({ ...count, customers: ofCustomers(count.inGroup) }));
}
