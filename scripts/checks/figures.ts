// Figures and their sources, line by line (a reply line is the unit the owner reads). A draft's figures are the owner's
// terms (the price in the email), not claims to the owner, so drafts are left out (ctx.rows).
import { plural } from "../format.ts";
import { describeProblems, figuresOf, sourceProblems } from "../source.ts";
import { recordsOf } from "../records.ts";
import {
  FIGURE,
  TRACED,
  blocksOf,
  figureNumber,
  numbersIn,
  ownersFigure,
  traced,
  type WrittenNumber,
} from "../reply.ts";
import type { FigureKind } from "../log.ts";
import type { Check, CheckContext } from "./index.ts";

const LINK = /https?:\/\/\S+/;
// "Of your users" on a count is a count of the owner's own people, which only suggest's weighted counts are.
const THEIRS =
  /\b(?:of|among)\s+(?:your|their|our)\s+(?:existing\s+|current\s+|own\s+|paying\s+)?(?:users|customers|members|subscribers|clients|patients|tenants|students|guests|donors|buyers)\b/i;
const LIKE_THEIRS = /\blike (?:your|their|our|the owner'?s)\b/i;
// "How many would buy" is the question a scan leaves to a real test, not an answer to it.
const TAKE_UP =
  /(?<!\bhow many\s+)\b(?:would|will)\s+(?:book|buy|order|sign up|subscribe|pay|join|switch|enrol|enroll|purchase|convert|take (?:it|this|them) up|try it)\b|\b(?:take-up|uptake|conversion) (?:rate|of)\b/i;
// A count of people given as a count of businesses: "6.2m small businesses", "small businesses: about 6.2m". A people
// word before the business word ("6.2m adults who run businesses") is a count of people, as it should be. Not a figure
// about people where they work ("11% (simulated) at firms under 10"), nor a size that says it is of adults.
const WHO_WORDS =
  "(?:people|adults|persons|customers|households|members|users|families|parents|students|owners|buyers|residents|patients|subscribers|visitors|workers|employees|managers|men|women)\\b";
const BUSINESSES =
  "(?:businesses|business customers|firms|companies|employers|shops|stores|restaurants|offices|landlords|practices|clinics|contracts)";
const COUNT = String.raw`\d(?:[\d,]*\d)?(?:\.\d+)?\s?(?:%|m|bn|k|million|billion|thousand)?`;
const FIGURE_WHOLE = String.raw`\d(?:[\d,]*\d)?(?:\.\d+)?(?![\d.,]*\d)\s?(?:%|m|bn|k|million|billion|thousand)?(?![a-z%])`;
// "6.2m small businesses": the figure, then up to two other words (no people word, and not at, in, among, across or
// for), then the business word.
const FIGURE_FIRST = String.raw`\b${COUNT}\s+(?:in\s+(?:every\s+)?[\d,]+\s+)?(?:\([^)]*\)\s+)?(?:(?!${WHO_WORDS}|(?:at|in|among|across|for)\b)[a-z-]+\s+){0,2}${BUSINESSES}\b`;
// "small businesses: about 6.2m": the business word, then the figure, with no people word after it.
const BUSINESSES_FIRST = String.raw`\b${BUSINESSES}[^.;:\n]{0,25}?:\s*(?:about\s+|around\s+|some\s+)?${FIGURE_WHOLE}(?!\s+(?:[A-Za-z-]+\s+)?${WHO_WORDS})`;
const AS_BUSINESSES = new RegExp(`(?:${FIGURE_FIRST})|(?:${BUSINESSES_FIRST})`, "i");

/**
 * Which label fits figures that have none, or one no tool backs, as a sentence to add to a finding (or ""): a figure
 * in the owner's own words is given, and one a tool printed takes that tool's label. A tool's label is named only for
 * a figure of three significant digits or more, which hardly matches by chance (a scan's cost of $0.10 would match
 * "give or take 0.1" in a count), and never "counted" for money: counts are of people.
 */
function fits(ctx: CheckContext, figures: string[], skip: FigureKind[] = []): string {
  const digits = (n: WrittenNumber) => {
    const s = n.value.toFixed(n.decimals).replace(".", "").replace(/^0+/, "");
    return (n.decimals ? s : s.replace(/0+$/, "")).length;
  };
  const { logged } = ctx;
  const by = new Map<string, number[]>();
  for (const figure of figures) {
    const n = numbersIn(figure)[0];
    if (!n) continue;
    const kinds = TRACED.filter((l) => !skip.includes(l) && !(/[£$€]/.test(figure) && l === "counted"));
    const label = ownersFigure(figure, ctx.owner)
      ? "given"
      : logged && digits(n) >= 3
        ? kinds.find((l) => traced(n, logged[l]))
        : null;
    if (label) by.set(label, [...(by.get(label) ?? []), n.value]);
  }
  return by.size
    ? ` Which fits: ${[...by].map(([label, values]) => `${values.join(", ")} ${label === "given" ? "the owner gave" : `a tool printed as ${label}`}, so ${label}`).join("; ")}.`
    : "";
}

/** An amount of money that is nothing ("$0", "£0.00"): there is no figure to trace. */
const nothing = (figure: string) => /[£$€]/.test(figure) && figureNumber(figure)?.value === 0;

const labelled = (ctx: CheckContext) =>
  ctx.rows.filter((row) => row.labels.size && (row.figures.length || row.worded.length));

// A passage marked imagined: "(imagined)", as in "Walk-through (imagined):". The words "anything marked imagined" in
// a sentence, and the legend's "imagined: written by Claude ...", are about the label, not marked with it.
const IMAGINED = /\(imagined\)/i;

export const FIGURES: Check[] = [
  {
    // Words written in a made-up person's voice are colour. A figure inside them, quoted or not, would read as
    // evidence that no tool counted, so the facts stay on the card and the figures in the counted lines.
    id: "imagined",
    kind: "format",
    why: "A passage marked imagined (written in a made-up person's voice) carries no figure.",
    run(ctx, { fail }) {
      for (const block of blocksOf(ctx.lines)) {
        if (!block.lines.some((line) => IMAGINED.test(line))) continue;
        block.lines.forEach((line, k) => {
          const found = line.match(FIGURE);
          if (found)
            fail(
              [
                `line ${block.start + k + 1}: ${found.slice(0, 3).join(", ")} in a passage marked imagined.`,
                "Imagined words carry no figures: keep the person's facts on their card and the group's figures in counted lines.",
              ].join(" "),
            );
        });
      }
    },
  },
  {
    id: "sourced-page",
    kind: "trace",
    why: "A sourced line links a page opened with source_check whose checked words hold its figures.",
    run(ctx, { fail, warn }) {
      for (const row of ctx.rows) {
        if (!row.labels.has("sourced") || !LINK.test(row.line)) continue;
        const found = sourceProblems(row.line, ctx.sources);
        for (const problem of describeProblems({ ...found, missing: [] })) fail(`${row.where}: ${problem}`);
        // Other labels in the line may carry figures the page does not: then a missing one is only a warning.
        const mixed = row.labels.size > 1 && found.missing.length < new Set(figuresOf(row.line)).size;
        for (const problem of describeProblems({ ...found, unopened: [] }))
          (mixed ? warn : fail)(`${row.where}: ${problem}`);
      }
    },
  },
  {
    // The owner's own figures (their price, their target, from the request and nxk.json) are given, labelled or not:
    // nearly every reply repeats the owner's price, and asking for its source would cost a check each time.
    id: "label",
    kind: "format",
    why: "Every figure in digits carries one of nxk's labels (given, counted, computed, simulated, measured, sourced, guess), unless the owner gave it.",
    run(ctx, { fail }) {
      for (const row of ctx.rows) {
        if (row.labels.size) continue;
        const bare = row.figures.filter((figure) => !ownersFigure(figure, ctx.owner) && !nothing(figure));
        if (bare.length)
          fail(
            `${row.where}: ${bare.slice(0, 3).join(", ")} with no source. Add given, counted, computed, simulated, measured, sourced or guess.${fits(ctx, bare)}`,
          );
      }
    },
  },
  {
    // A figure in words ("about a third of the people who could buy") is as much a claim as one in digits, and is
    // easier to leave unlabelled.
    id: "label-words",
    kind: "hint",
    why: 'A figure written in words ("a third of the people", "four times as many") takes a label too.',
    run(ctx, { warn }) {
      for (const row of ctx.rows)
        if (!row.labels.size && row.worded.length)
          warn(
            `${row.where}: ${row.worded.slice(0, 3).join(", ")} reads as a figure with no source. If it is one, add its label (given, counted, computed, simulated, measured, sourced or guess).`,
          );
    },
  },
  {
    id: "sourced-link",
    kind: "format",
    why: "A sourced figure has its link in the same line.",
    run(ctx, { fail }) {
      for (const row of labelled(ctx))
        if (row.labels.has("sourced") && !LINK.test(row.line))
          fail(
            `${row.where}: a sourced figure with no link. Give the publisher, the year and the link in the same line.`,
          );
    },
  },
  {
    id: "traced",
    kind: "trace",
    why: "A figure labelled counted, computed, simulated or measured is one a tool printed under that label, as printed.",
    run(ctx, { fail, warn }) {
      const { logged } = ctx;
      for (const row of labelled(ctx)) {
        const tool = TRACED.filter((l) => row.labels.has(l));
        if (!tool.length) continue;
        if (logged === null) {
          fail(
            `${row.where}: figures labelled ${tool.join("/")}, but there is no log of what the tools printed. Give note_check the folder the tools ran in.`,
          );
          continue;
        }
        // The owner's own figures beside the ones the label is for are given ("at $29 a user, $14,500 a month
        // (computed)"); a line of only the owner's figures labelled otherwise is told they are given.
        const figures = [...row.figures, ...row.worded];
        const others = figures.some((figure) => !ownersFigure(figure, ctx.owner));
        const pairs = figures.flatMap((figure) => {
          const n = figureNumber(figure);
          return n && n.value !== 100 && !(others && ownersFigure(figure, ctx.owner)) ? [{ figure, n }] : [];
        });
        const numbers = pairs.map((p) => p.n);
        const missing = numbers.filter(
          (n) =>
            !traced(
              n,
              tool.flatMap((label) => logged[label]),
            ),
        );
        const mixed = row.labels.has("given") || row.labels.has("guess");
        if (!missing.length || (mixed && missing.length !== numbers.length)) continue;
        const them = plural(missing.length, "it", "them");
        const sums = tool.includes("computed")
          ? [
              " Work your own arithmetic with sums and quote what it prints, rather than dropping it:",
              'the share of a counted group a number of customers would be is unit "customers=250, size=160000".',
            ].join(" ")
          : "";
        const fit = fits(
          ctx,
          pairs.filter((p) => missing.includes(p.n)).map((p) => p.figure),
          tool,
        );
        (mixed ? warn : fail)(
          `${row.where}: ${missing.map((n) => n.value).join(", ")} labelled ${tool.join("/")} but no tool printed ${them}. Quote a figure as the tool printed it.${sums}${fit}`,
        );
      }
    },
  },
  {
    // "24.5 in every 100 of your existing users (counted)", from a count of adults, claims a share no tool measured.
    id: "owners-share",
    kind: "hint",
    why: "A count of generated adults is not a share of the owner's own customers.",
    run(ctx, { warn }) {
      // suggest gave its counts among people like the owner's customers too.
      if (ctx.runs && recordsOf(ctx.runs, "weighted").length) return;
      for (const row of labelled(ctx)) {
        const theirs = row.labels.has("counted") && THEIRS.exec(row.line);
        if (!theirs || LIKE_THEIRS.test(row.line)) continue;
        const whom = theirs[0].split(/\s+/).pop();
        warn(
          [
            `${row.where}: reads as a count of generated adults given as a share of the owner's own ${whom}.`,
            "If it is, say whom it is of (US adults, adults in Leeds), or, once the owner says who their customers are, count among people like them (suggest).",
          ].join(" "),
        );
      }
    },
  },
  {
    id: "take-up",
    kind: "hint",
    why: "A scan compares versions and groups: a simulated share is not how many would act.",
    run(ctx, { warn }) {
      for (const row of labelled(ctx)) {
        const takeUp = row.labels.has("simulated") && TAKE_UP.exec(row.line);
        if (takeUp)
          warn(
            `${row.where}: reads as a simulated figure taken for how many would act ("${takeUp[0]}"). A scan compares versions and groups: say which leans in, and leave how many to a real test.`,
          );
      }
    },
  },
  {
    id: "as-businesses",
    kind: "hint",
    why: "nxk counts adults: those who run or buy for a business are not businesses, unless it counted firms.",
    run(ctx, { warn }) {
      // A number of firms the people tool printed counting firms (unit firms) is a count of businesses, as said.
      const counted = ctx.runs ? recordsOf(ctx.runs, "firms").map((r) => r.value) : [];
      for (const row of labelled(ctx)) {
        const firms = (row.labels.has("counted") || row.labels.has("simulated")) && AS_BUSINESSES.exec(row.line);
        const n = firms && row.labels.has("counted") ? figureNumber(firms[0]) : null;
        if (firms && !(n && traced(n, counted)))
          warn(
            [
              `${row.where}: reads as a count of people given as a count of businesses ("${firms[0].trim()}").`,
              "nxk counts adults: those who run or buy for a business are not businesses (one business has several, many have none).",
              "Say adults, count firms with the people tool (unit firms) and quote that, or give a published count of businesses, sourced.",
            ].join(" "),
          );
      }
    },
  },
  {
    id: "of-whom",
    kind: "hint",
    why: "A counted figure says whom it is of.",
    run(ctx, { warn }) {
      for (const row of labelled(ctx))
        if (
          row.labels.has("counted") &&
          !/\bof\s+(?:all\s+|every\s+\d+\s+|the\s+)?[a-z][a-z-]*(?:\s+[a-z][a-z-]*)?/i.test(
            row.line.replace(FIGURE, ""),
          )
        )
          warn(`${row.where}: a counted figure that does not say whom it is of ("of adults", "of gym members").`);
    },
  },
  {
    id: "everyone",
    kind: "hint",
    why: "A count of some people does not show anything of everyone or no one.",
    run(ctx, { warn }) {
      ctx.lines.forEach((line, i) => {
        if (ctx.drafts.has(i)) return;
        if (/\b(nobody|no one|everyone|every one of them|all of them)\b/i.test(line.replace(/rules out no one/gi, "")))
          warn(`line ${i + 1}: a claim about everyone or no one. A count of some people does not show it.`);
      });
    },
  },
];
