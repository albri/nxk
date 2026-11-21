#!/usr/bin/env node
// What the owner set, and the choices left to the session, in work that settles things for people (a page, a policy,
// a price, a plan, a message), counted: whom each leaves out, and whether the other option is worth raising with the
// owner. The work keeps the owner's terms as given; what is worth raising goes in a short note beside it, with how many
// it affects and an alternative the owner can take with a word. So the figures in the reply come from a tool and bear
// on a choice, and the owner makes it.
//
//   node scripts/suggest.ts suggestions.json
//
// suggestions.json, written by the agent before anything is counted:
//   {
//     "country": "uk",
//     "among": "fitness_or_sports_club_membership=member_of_a_gym_or_fitness_club_only|member_of_both", the audience the owner named; omit for all adults
//     "audience": "gym members",                                          what to call them in the reply
//     "request": "request.md",                                            the owner's request, saved as written
//     "terms": [ { "term": "commitment-1", "kind": "commitment", "quote": "Twelve-month contract", "fits": ["managing_financially=living_comfortably|doing_alright"], "rules": "..." },
//                { "term": "price-1", "kind": "price", "quote": "£29 a month", "fits_everyone": "the price is the owner's; who it is a lot for is a suggestion" } ],
//     "suggestions": [{
//       "suggestion": "A way out of the twelve months",
//       "as_asked": "Locked 12 months",                                    the owner's option: kept in what is built
//       "rule": "Worth raising if 20 in 100 or more find it hard to be sure of money for a year",
//       "count": "Locked 12 months: harder for managing_financially=finding_it_difficult|just_about_getting_by",
//       "options": [
//         { "name": "Locked 12 months", "needs": [], "bears_on": ["managing_financially=finding_it_difficult|just_about_getting_by"] },
//         { "name": "Early exit for moving, job loss or illness", "needs": [], "bears_on": [] }
//       ],
//       "offer": "add an early exit with 30 days' notice for moving away, losing a job or a doctor's advice",
//       "watch": "sign-ups a week, and early exits by reason",
//       "terms": ["commitment-1"]                                          the owner's terms it answers
//     }, {
//       "suggestion": "Email on the form",                                 no as_asked: a choice the owner left to you
//       "options": [ { "name": "Email required", "needs": ["internet_use_frequency=daily_or_almost_daily"] }, { "name": "Email optional", "needs": [] } ]
//     }]
//   }
//
// `needs` are what a person must have or be to get through at all (a smartphone, a driving licence, English); people
// who do not meet them are ruled out. `bears_on` are groups an option is harder for, each a set of conditions joined
// by commas: who they are is your judgement (or a scan's), how many they are is counted. `sums` are figures for
// scripts/sums.ts, which every option of a suggestion must have for a comparison.
//
// A suggestion about something the owner set (it answers one of their terms, or names their option in `as_asked`)
// needs `as_asked`, `offer` and `rule`: the figure, said before counting, at which the other option is worth raising
// ("N in 100"), and in `count` which count it is about (suggest.ts lists the names it accepts: "term commitment-1",
// "Online only: rules out", "Online only: harder for <a bears_on group>", "Online only: harder for any"). The owner's
// option stays in what is built; the other is offered in the note, never made.
//
// A choice the owner left to the session (a field, a check, a payment method, an account to pay; no `as_asked`) is
// the session's to make: suggest.ts names the option that turns away the fewest, to build unless it costs the
// owner's goals.
//
// `terms` come from scripts/terms.ts, given the terms you read in the request: every term the owner fixed, each with
// its kind, the owner's words (checked against the request again here), and `fits`, the groups it suits (any of them),
// or `fits_everyone` and why. A term that leaves out 10 in every 100 or more must be answered by a suggestion (its id
// in that suggestion's "terms") or given "no_suggestion": "why". A commitment also needs `rules`: what the rules where
// the owner sells say about it, looked up, with the publisher, the year and the link; or `rules_not_found` with what
// was searched or why it could not be. Each link in `rules` must have been opened with scripts/source.ts, and each
// figure in it must be in the words checked.
//
// The owner's customers. What the owner has said of their customers (scripts/product.ts, kept in nxk.json) weights
// the audience to match, and every count is also given among people like the owner's customers. A count close to the
// rule (within 2 in 100, a tenth of the figure, or twice its margin) is a close call: suggest.ts prints where it
// crosses the rule (scripts/probe.ts). The owner's shares settle it; without them it is raised, with the fact it
// turns on. Each suggestion is added to nxk.json.

import { join } from "node:path";
import { argsOf, cli, readIn, usageExit, type Out, type RunContext } from "./cli.ts";
import { per100 } from "./format.ts";
import { logFile, openLog, type Log } from "./log.ts";
import { loadPeople, type Field, type Row } from "./population.ts";
import { addSuggestion, FILE, findProduct, productHome, readProduct, writeProduct, type Product } from "./product.ts";
import {
  countOption,
  countTerms,
  maskOf,
  optionCounts,
  othersOf,
  weightedAudience,
  type CountedOption,
  type CountedTerms,
  type CountingContext,
  type SuggestContext,
} from "./suggest-count.ts";
import { ownersOf, problems, type Suggestion, type SuggestionsSpec } from "./suggest-form.ts";
import { noteLine, printNote, printOption, printSums, suggestionRecord, type NoteItem } from "./suggest-print.ts";
import { holdRule, type RuledCount } from "./suggest-rule.ts";

/** One suggestion counted: its note item when worth raising, quiet when not, and what settled it. */
interface SuggestionDone {
  raised?: NoteItem;
  quiet?: true;
  /** For a choice left to the session: the option that turns away the fewest. */
  fewest?: string;
  ruled: RuledCount | null;
}

// The work is in four modules: suggest-form.ts (the suggestions file and its terms, checked), suggest-count.ts (the
// audience, the terms and the options counted), suggest-rule.ts (a rule held against its count, and a close call)
// and suggest-print.ts (what is printed and what nxk.json keeps). This file reads the file and puts them in order.
export async function run(argv: string[], out: Out, { folder, env = process.env }: RunContext): Promise<void> {
  const {
    positionals: [file],
  } = argsOf(argv);
  if (!file) throw usageExit(import.meta.url, out, argv);
  const { spec, productFile, product, fields, everyone } = readSuggestions(folder, file);
  const recording = Boolean(logFile(env, folder));
  // Its figures are counted on the people, but for the sums it works (computed) and the rules it quotes (sourced).
  const log = openLog("suggest", argv, { label: "counted", ...out });
  const ctx: SuggestContext = {
    spec,
    product,
    fields,
    ...weightedAudience(log, { spec, product, fields, everyone, env }),
  };
  const terms = countTerms(log, ctx, { folder, file, env });
  const counted = countSuggestions(log, { ...ctx, ...terms }, folder);
  // What was counted is kept with the product, for the next piece of work and for when real numbers come in.
  if (recording)
    writeProduct(productFile ?? join(productHome(folder), FILE), {
      ...counted.product,
      country: counted.product.country ?? spec.country,
    });
  printNote(log, { ...counted, ruleLines: terms.ruleLines, country: spec.country });
}

/**
 * The suggestions file, checked, with what nxk.json knows of the product and the people to count on. All of it is
 * refused before anything is printed.
 */
function readSuggestions(
  folder: string,
  file: string,
): { spec: SuggestionsSpec; productFile: string | null; product: Product; fields: Field[]; everyone: Row[] } {
  const spec: SuggestionsSpec = JSON.parse(readIn(folder, file, "utf8"));
  const early = problems(spec, null);
  if (early.length) throw new Error(`Fix the suggestions first:\n- ${early.join("\n- ")}`);
  // What is known of the product from earlier work: its country, the audience, and what the owner said of their customers.
  const productFile = findProduct(folder);
  const product = readProduct(productFile);
  if (product.country && product.country !== spec.country)
    throw new Error(
      [
        `nxk.json records this product in the ${product.country.toUpperCase()}, but the suggestions say "country": "${spec.country}".`,
        "Count the product's own country; if the product has moved, change its country in nxk.json first.",
      ].join(" "),
    );
  const { map, people: everyone, drawnFor } = loadPeople(spec.country, { people: spec.people || undefined, folder });
  if (drawnFor && !spec.audience)
    throw new Error(
      `These people were drawn for an audience (${drawnFor}): name it in "audience" so the reply says whom each figure is of`,
    );
  const fields = map.fields;
  const found = problems(spec, fields);
  if (found.length) throw new Error(`Fix the suggestions first:\n- ${found.join("\n- ")}`);
  return { spec, productFile, product, fields, everyone };
}

/**
 * Every suggestion counted, as printed: what each option rules out and is harder for, the rule held against its count
 * and the sums. Returns the note's items, the names not worth raising, and the product with each suggestion added.
 */
function countSuggestions(
  log: Log,
  ctx: SuggestContext & CountedTerms,
  folder: string,
): { raised: NoteItem[]; quiet: string[]; product: Product } {
  const { spec, fields, audience } = ctx;
  // Every option of every suggestion is counted first, so that a probe can say which other groups hold the same people.
  const countedAll = spec.suggestions.map((suggestion) =>
    suggestion.options.map((option): CountedOption => ({ option, ...countOption(fields, audience, option) })),
  );
  const others = othersOf(ctx.termCounts, countedAll, audience.length);
  let product = ctx.product;
  const raised: NoteItem[] = [],
    quiet: string[] = [];
  for (const [d, suggestion] of spec.suggestions.entries()) {
    const done = countSuggestion(log, suggestion, countedAll[d], { ...ctx, product, others });
    if (done.raised) raised.push(done.raised);
    if (done.quiet) quiet.push(suggestion.suggestion);
    if (done.ruled) product = addSuggestion(product, suggestionRecord(suggestion, { ruled: done.ruled }, folder));
    else if (done.fewest)
      product = addSuggestion(product, suggestionRecord(suggestion, { ruled: null, fewest: done.fewest }, folder));
  }
  return { raised, quiet, product };
}

/** One suggestion, as printed. */
function countSuggestion(
  log: Log,
  suggestion: Suggestion,
  counted: CountedOption[],
  ctx: CountingContext,
): SuggestionDone {
  const { fields, audience, whom, w, termCounts, ofCustomers } = ctx;
  const owners = ownersOf(suggestion);
  const whose = owners
    ? [
        `As asked: "${suggestion.as_asked}", the owner's: it stays in the work. The other is offered in the note when it is worth raising, never made.`,
        `Rule (written before counting): ${suggestion.rule}`,
      ].join("\n")
    : "The owner set none of this: the choice is yours.";
  log.line(`\n=== ${suggestion.suggestion}\n${whose}`);
  for (const option of counted) printOption(log, option, { fields, audience, whom });
  const counts = [
    ...(suggestion.terms ?? []).flatMap((id) => (termCounts.has(id) ? [termCounts.get(id)!] : [])),
    ...counted.flatMap((option) => optionCounts(option, ofCustomers)),
  ];
  const ruledOut = counted.map(({ option, out, n }) => `${option.name} ${per100(out.size / n)}`);
  const harder = counted.map(({ option, out, lost, n }) => `${option.name} ${per100((lost.size - out.size) / n)}`);
  log.line(`\nRuled out: ${ruledOut.join(", ")}. Harder for: ${harder.join(", ")}. In every 100 of ${whom} (counted).`);
  if (w) log.record("weighted");
  // With weights, ofCustomers gives a number for any group.
  if (w)
    log.line(
      `Among the owner's customers: ruled out: ${counted.map(({ option, out, n }) => `${option.name} ${ofCustomers(maskOf(out, n))?.toFixed(1)}`).join(", ")}. Harder for: ${counted
        .map(
          ({ option, out, lost, n }) =>
            `${option.name} ${ofCustomers(
              maskOf(
                [...lost].filter((i) => !out.has(i)),
                n,
              ),
            )?.toFixed(1)}`,
        )
        .join(", ")}. In every 100 (counted, weighted to what the owner said).`,
    );
  printSums(log, suggestion);
  if (!owners) return chooseFewest(log, suggestion, counted, ctx);
  const { ruled, condition } = holdRule(log, suggestion, counts, ctx);
  if (!ruled) {
    // A rule with no figure: the session judges it, so its line is printed for the note with the count it would give.
    const own = counts.filter(
      (count) => count.verb.startsWith(`"${suggestion.as_asked}"`) || count.key.startsWith("term "),
    );
    const largest = [...own].sort((a, b) => b.value - a.value)[0];
    if (!largest) return { quiet: true, ruled: null };
    const line = noteLine(suggestion, { ruled: largest, condition: null, whom });
    log.line(`For the note, if it would change what the owner does:\n${line}`);
    return { raised: { name: suggestion.suggestion, size: largest.value, line }, ruled: null };
  }
  if (!(ruled.customersRaise ?? ruled.raise)) return { quiet: true, ruled };
  return {
    raised: {
      name: suggestion.suggestion,
      size: ruled.customers ?? ruled.value,
      line: noteLine(suggestion, { ruled, condition, whom }),
    },
    ruled,
  };
}

/**
 * A choice the owner left to the session: the option that turns away the fewest (ruled out or finding it harder), as
 * printed, to build unless it costs the owner's goals.
 */
function chooseFewest(
  log: Log,
  suggestion: Suggestion,
  counted: CountedOption[],
  { whom }: Pick<CountingContext, "whom">,
): SuggestionDone {
  const [best, ...rest] = [...counted].sort((a, b) => a.lost.size - b.lost.size);
  const share = ({ lost, n }: CountedOption) => per100(lost.size / n);
  const others = rest.map((c) => `${share(c)} for "${c.option.name}"`).join(", ");
  log.line(
    [
      `\n${suggestion.suggestion}: the owner set none of this, so it is yours to choose.`,
      `"${best.option.name}" turns away the fewest, ${share(best)} in every 100 of ${whom}, against ${others} (counted).`,
      "Build it unless it costs the owner's goals; it needs no line in the reply unless it changes what the owner gets.",
    ].join(" "),
  );
  return { fewest: best.option.name, ruled: null };
}

cli(import.meta.url, run);
