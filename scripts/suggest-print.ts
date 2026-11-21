// What suggest.ts prints for one option, a suggestion's sums, and the note's lines, and the record nxk.json keeps of it.

import { relative } from "node:path";
import { asWords, per100, tierLabel } from "./format.ts";
import { conditionsOf, giveOrTake, marked, profile } from "./groups.ts";
import type { Log } from "./log.ts";
import type { Country } from "./population.ts";
import { productHome, today, type CountedSuggestion } from "./product.ts";
import { describeOptions, parseOption } from "./sums.ts";
import { legendFor } from "./checks/legend.ts";
import type { Count, CountedOption, RulesOn, SuggestContext } from "./suggest-count.ts";
import type { Suggestion } from "./suggest-form.ts";
import type { RuledCount } from "./suggest-rule.ts";

/** An item worth raising in the note: the suggestion, its count in every 100 (for the order), and its line. */
export interface NoteItem {
  name: string;
  size: number;
  line: string;
}

/**
 * What a suggestion came to, for nxk.json: its rule held against its count, or, for a choice the owner left to the
 * session, the option that turns away the fewest.
 */
export type Settled = { ruled: RuledCount; fewest?: undefined } | { ruled: null; fewest: string };

/** One option of a suggestion, as printed: whom it rules out, whom it is harder for, and what marks those it loses. */
export function printOption(
  log: Log,
  { option, out, groups, lost, n }: CountedOption,
  { fields, audience, whom }: Pick<SuggestContext, "fields" | "audience" | "whom">,
): void {
  log.line(`\n${option.name}`);
  if (option.needs?.length)
    log.line(
      `  rules out ${per100(out.size / n)} in every 100 of ${whom} (give or take ${giveOrTake(out.size / n, n)}): they do not meet ${conditionsOf(
        fields,
        option.needs,
      )
        .map((c) => `${c.text} (${asWords(c.path.split(".")[1])})`)
        .join(", and ")}`,
    );
  if (!(option.needs ?? []).length) log.line("  rules out no one");
  for (const group of groups) log.line(`  harder for ${per100(group.n / n)} in every 100: ${group.text}`);
  if (groups.length > 1)
    log.line(
      `  harder for, any of these: ${per100((lost.size - out.size) / n)} in every 100 of ${whom} (who, your judgement; how many, counted)`,
    );
  if (lost.size < 30 || n - lost.size < 30) return;
  // Across every fact: what the people this option loses have in common, beyond the conditions that define them.
  const skip = new Set(
    [...(option.needs ?? []), ...(option.bears_on ?? []).flatMap((g) => g.split(","))].map(
      (text) => conditionsOf(fields, [text])[0].path,
    ),
  );
  const lines = marked(
    profile(
      fields,
      audience,
      audience.map((_, i) => lost.has(i)),
    ).filter((line) => !skip.has(line.path)),
    { top: 6 },
  );
  if (!lines.length) return;
  log.line(`  who they are, beyond what defines them, against all of ${whom}:`);
  for (const line of lines)
    log.line(
      `    ${line.gap > 0 ? "more" : "less"} ${per100(line.group).padStart(5)} against ${per100(line.all).padStart(5)}  ${line.label} (${asWords(line.path.split(".")[1])})  [${tierLabel(line.tier)}]`,
    );
}

/** A suggestion's sums, as printed, when every option has them; returns the line that states the trade, or null. */
export function printSums(log: Log, suggestion: Suggestion): string | null {
  if (!suggestion.options.every((option) => option.sums)) return null;
  const lines = describeOptions(suggestion.options.map((option) => parseOption(`${option.name}: ${option.sums}`)));
  log.line(`\nSums (computed from the figures in the suggestions; label each input given or guess):`, "computed");
  for (const line of lines) log.line(`  ${line}`, "computed");
  return lines.find((line) => line.startsWith("Break-even") || line.startsWith("At the middle")) ?? null;
}

/** A count as the note gives it: rounded, since the owner reads "about 39", not "39.1". */
export const about = (value: number): string => (value >= 1 ? `about ${Math.round(value)}` : "under 1");

/**
 * The note's line for a suggestion worth raising: the people first (roughly how many, of whom, and who they are), then
 * what in the work stops them, then the change the owner can take with a word. Whom a count is of is said once; who
 * they are is the count's own words, which the reply may put plainly but not widen.
 */
export function noteLine(
  suggestion: Pick<Suggestion, "suggestion" | "offer">,
  {
    ruled,
    condition,
    whom,
  }: { ruled: Pick<Count, "value" | "customers" | "who" | "barrier">; condition: string | null; whom: string },
): string {
  const customers = ruled.customers === null ? "" : ` (${about(ruled.customers)} among people like your customers)`;
  const who = ruled.who ? `, ${ruled.who},` : "";
  return `- ${suggestion.suggestion}: ${about(ruled.value)} in every 100 of ${whom}${customers}${who} ${ruled.barrier} (counted)${condition ? `, ${condition}` : ""}. Say yes and I'll ${String(
    suggestion.offer,
  )
    .trim()
    .replace(/[.\s]+$/, "")}.`;
}

/** The other option a suggestion offers: the first that is not the owner's. */
export const otherOf = (suggestion: Suggestion): string | null =>
  (suggestion.options ?? []).find((option) => option.name !== suggestion.as_asked)?.name ?? null;

/**
 * A suggestion as nxk.json keeps it: what the owner set, whether the other option was worth raising, and the option
 * the counts favour (pick), among the audience and among the owner's customers. A choice the owner left to the session
 * keeps the option that turns away the fewest.
 */
export function suggestionRecord(
  suggestion: Suggestion,
  { ruled, fewest }: Settled,
  folder: string,
): CountedSuggestion {
  const favoured = (raise: boolean | null) => (raise ? otherOf(suggestion) : (suggestion.as_asked ?? null));
  return {
    date: today(),
    folder: relative(productHome(folder), folder) || ".",
    suggestion: suggestion.suggestion,
    rule: suggestion.rule ?? null,
    ...(suggestion.as_asked ? { as_asked: suggestion.as_asked, offer: suggestion.offer ?? null } : {}),
    ...(ruled
      ? {
          count: suggestion.count,
          value: +ruled.value.toFixed(1),
          threshold: ruled.threshold,
          raised: ruled.customersRaise ?? ruled.raise,
          pick: favoured(ruled.raise),
          ...(ruled.customers === null
            ? {}
            : { customersValue: +ruled.customers.toFixed(1), customersPick: favoured(ruled.customersRaise) }),
        }
      : { pick: fewest }),
    watch: suggestion.watch ?? null,
  };
}

/** The reply's line for what the rules say about commitments the same rules cover. */
export const ruleLine = (r: { names: string[]; says: string }): string =>
  `- What the rules say about ${r.names.join(", ")}: ${r.says}`;

/** Items that say the same thing, as one line each: the first item with every name, in the order first seen. */
function together<T extends { name: string }>(items: T[], keyOf: (item: T) => string): (T & { names: string[] })[] {
  const out = new Map<string, T & { names: string[] }>();
  for (const item of items) {
    const key = keyOf(item);
    if (out.has(key)) out.get(key)!.names.push(item.name);
    else out.set(key, { ...item, names: [item.name] });
  }
  return [...out.values()];
}

/** At most this many items in the note: the owner reads two or three, not a list. */
export const NOTE_ITEMS = 3;
/** The words the note starts with, which note_check finds it by. */
export const NOTE_LEAD = "Worth considering:";

/**
 * What the reply takes from suggest: the note's lines, largest first and at most three, and what the rules say, for the
 * session to judge whether a term the owner set goes against them.
 */
export function printNote(
  log: Pick<Log, "line" | "record">,
  {
    raised,
    quiet,
    ruleLines,
    country = null,
  }: { raised: NoteItem[]; quiet: string[]; ruleLines: RulesOn[]; country?: Country | null },
): void {
  log.line("\n--- For the reply ---");
  if (ruleLines.length) {
    const rules = together(ruleLines, (r) => r.says)
      .map(ruleLine)
      .join("\n");
    const lead = [
      "If a term the owner set likely goes against them, open the reply with that: the law by name, what it says,",
      "and whether you built as asked with this warning or held that part back to ask, whichever is safer for the owner.",
      "Never change it quietly. If it does not, leave the rules out of the reply.",
    ].join(" ");
    log.line(
      `\nWhat the rules say about the owner's commitments (for you to judge, not for the reply as it stands):\n${rules}\n${lead}`,
      null,
    );
  }
  const sorted = [...raised].sort((a, b) => b.size - a.size);
  if (!sorted.length) {
    const under = quiet.length ? ` (${quiet.join(", ")}: under the figure in each rule)` : "";
    log.line(
      [
        `\nNothing here is worth raising${under}. The owner's terms stand as given: give no note about them, no figures, no list.`,
        "A note is still right for a group the sweep showed the work could reach, if it serves the work or the owner's goal.",
      ].join(" "),
      null,
    );
    return;
  }
  const notRaised = quiet.length ? ` Not worth raising, under the figure in each rule: ${quiet.join(", ")}.` : "";
  log.line(
    [
      "\nThe owner's terms stand in the work as given.",
      "The note, as printed (put who they are plainly if you like, never wider than counted;",
      "where an official figure for the same group exists, such as the census, ONS or Ofcom, give it instead, sourced).",
      "A group from the sweep the work could reach comes first, and the note has three points at most in all.",
      `Leave out any item that would not change what the owner does.${notRaised}\n`,
    ].join(" "),
    null,
  );
  log.line(NOTE_LEAD, null);
  for (const item of sorted.slice(0, NOTE_ITEMS)) {
    log.line(item.line);
    log.record("raise", { suggestion: item.name, line: item.line });
  }
  if (sorted.length > NOTE_ITEMS)
    log.line(
      `\nSmaller, and left out of the note (at most ${NOTE_ITEMS}): ${sorted
        .slice(NOTE_ITEMS)
        .map((item) => item.name)
        .join(", ")}.`,
      null,
    );
  log.line(
    `\nAnd once in the reply, outside any draft, what the label means: "${legendFor(["counted"], country)}" (with any other label you use: note_check prints the line).`,
    null,
  );
  log.line(
    "\nCounted on generated people (PersonaGen), fitted to official statistics where the tier is A. Who a group is, is your judgement; how many they are is counted.",
    null,
  );
}
