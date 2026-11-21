// Holding a suggestion's rule against its count: whether the other option is worth raising with the owner, and on a
// close call where the count crosses the rule and which fact about the owner's customers would settle it.

import { conditionsOf } from "./groups.ts";
import type { Log } from "./log.ts";
import { askOf, probeLines, probeOf } from "./probe.ts";
import type { Count, CountingContext } from "./suggest-count.ts";
import { nearestThreshold, thresholdsOf, type NearestThreshold, type Suggestion } from "./suggest-form.ts";

/** A count held against its rule: the figure in the rule, whether it is worth raising, and whether it was close. */
export interface RuledCount extends Count {
  /** The figure in the rule nearest the count, to one decimal. */
  threshold: number;
  raise: boolean;
  /** Among the owner's customers, or null when their shares are not known. */
  customersRaise: boolean | null;
  close: boolean;
}

/**
 * The rule held against its count: ruled is null when the rule states no figure or its count has none; condition is
 * what a close call turns on, for the note, or null.
 */
export interface Held {
  ruled: RuledCount | null;
  condition: string | null;
}

/**
 * The rule held against the count it names, as printed: whether the other option is worth raising, among the audience
 * and among the owner's customers.
 */
export function holdRule(log: Log, suggestion: Suggestion, counts: Count[], ctx: CountingContext): Held {
  const { whom } = ctx;
  const thresholds = thresholdsOf(suggestion.rule),
    chosen = counts.find((count) => count.key === suggestion.count);
  const none: Held = { ruled: null, condition: null };
  if (!thresholds.length) {
    log.line(
      `\nThe rule states no "N in 100" to hold a count against: raise it only if it would change what the owner does.`,
    );
    return none;
  }
  if (!chosen) {
    log.line(
      `\nThe count the rule is about ("${suggestion.count}") has no figure here: the term suits everyone, you said. Nothing to raise.`,
    );
    return none;
  }
  const threshold = thresholds.reduce((best, x) =>
    Math.abs(x - chosen.value) < Math.abs(best - chosen.value) ? x : best,
  );
  const t = +threshold.toFixed(1);
  const ruled: RuledCount = {
    ...chosen,
    threshold: t,
    raise: chosen.value >= threshold,
    customersRaise: chosen.customers === null ? null : chosen.customers >= threshold,
    close: false,
  };
  const verdict = (raise: boolean | null) => (raise ? "worth raising" : "not worth raising");
  log.line(
    `\nThe rule: ${suggestion.count}, ${chosen.value.toFixed(1)} in every 100 of ${whom}, against the ${t} in it: ${verdict(ruled.raise)}.`,
  );
  if (chosen.customers !== null)
    log.line(
      `Among the owner's customers: ${chosen.customers.toFixed(1)} in every 100: ${verdict(ruled.customersRaise)}.`,
    );
  const near = nearestThreshold([chosen], [threshold])!;
  if (!near.close) {
    log.line(
      `Not a close call: ${near.gap.toFixed(1)} from the ${t} in the rule${chosen.customers === null ? "" : " (among all of the audience)"}.`,
    );
    return { ruled, condition: null };
  }
  return closeCall(log, ruled, { threshold, t, near }, ctx);
}

/**
 * A count close to its rule, as printed. Whether it is over or under depends on whose customers they are: the probe
 * shows where it crosses, and the one fact about the owner's customers that would settle it. What the owner has said
 * of their customers settles it; otherwise the close call is raised, with that fact as its condition, so that the
 * owner reads one suggestion and no extra question.
 */
function closeCall(
  log: Log,
  ruled: RuledCount,
  { threshold, t, near }: { threshold: number; t: number; near: NearestThreshold<Count> },
  { fields, audience, whom, product, others }: CountingContext,
): Held {
  log.record("close_call");
  log.line(
    `\nA close call: ${ruled.value.toFixed(1)} against ${t} (within ${near.within.toFixed(1)}). Among the owner's customers it may be well over or under. Where it crosses:`,
  );
  const result = probeOf(fields, audience, ruled.inGroup, {
    skip: ruled.skip,
    others: others.filter(
      (other) => other.inGroup !== ruled.inGroup && ![...other.paths].some((path) => ruled.skip.has(path)),
    ),
  });
  for (const line of probeLines(result, { rule: threshold, whom, counted: ruled.counted })) log.line(line);
  const ask = askOf(result);
  const answer =
    ask && product.customers.find((entry) => entry.source !== "guess" && entry.fact.split(/!?=/)[0] === ask.field);
  // "aged 65 or over" reads as it is; "household income before tax per year: up to £34,999" needs a subject.
  const who =
    ask &&
    (ask.text.includes(": ")
      ? ask.text.replace(/^(.*?): /, (_, label: string) => `people whose ${label.toLowerCase()} is `)
      : ask.text);
  const close = { ...ruled, close: true };
  if (!ask) {
    log.line(
      "  Who the owner's customers are does not move it: it rests on this count. Being this close, it is worth raising.",
    );
    return { ruled: { ...close, raise: true }, condition: null };
  }
  if (!answer || answer.share === null) {
    log.line(
      `  It turns on how many of the owner's customers are ${who}${answer ? " (they do not know)" : ""}. Being this close, it is worth raising: the note says what it turns on and asks nothing more.`,
    );
    return { ruled: { ...close, raise: true }, condition: `more so if many of your customers are ${who}` };
  }
  const fact = conditionsOf(fields, [answer.fact])[0].text;
  log.line(
    `  The owner said ${answer.share} in every 100 of their customers are ${fact} (${answer.source}): the count among the owner's customers above is weighted to it, and settles it.`,
  );
  return { ruled: close, condition: null };
}
