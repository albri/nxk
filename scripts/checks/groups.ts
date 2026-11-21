// Groups the reply puts forward. After a discovery read, a corner goes with how many people it is (a corner is nxk's
// own word, printed with its size). A group the people do not hold goes with a published count.
import { FIGURE, labelsIn } from "../reply.ts";
import type { Check, CheckContext } from "./index.ts";

// The tools that print corners with their sizes: discover.ts, and the server's discovery tools.
const DISCOVERED = new Set(["discover", "explore_next", "corner_split", "segment_add", "segments"]);
// A reply saying a group cannot be counted: "I can't size them", "no field for landlords", "haven't looked up how many",
// "that needs a published count" (and then gives none).
const UNCOUNTED =
  /\b(?:can[’']?t|cannot|could(?:n[’']?t| not)|unable to)\s+(?:size|count)\b|\bunsized\b|\bno (?:field|fact)\b[^.\n]{0,40}\b(?:for|records?|about)\b|\bhaven[’']?t (?:looked up|counted|checked) how many\b|\bneeds? a published (?:[a-z-]+\s+){0,2}count\b/i;

/**
 * The points after a discovery read that give how keen a group is (simulated) with no size (counted or sourced), as
 * [{ start, text }]. What draws people, fact by fact, and an idea with no corner are not a group put forward.
 */
function unsized(ctx: CheckContext): { start: number; text: string }[] {
  if (ctx.runs === null || !ctx.runs.some((run) => DISCOVERED.has(run.tool))) return [];
  return ctx.blocks
    .map((block) => ({ start: block.start, text: block.lines.join(" ") }))
    .filter(({ text }) => {
      const labels = labelsIn(text);
      if (!labels.has("simulated") || !text.match(FIGURE) || labels.has("counted") || labels.has("sourced"))
        return false;
      return !/\bdraws?\b|\bputs?\s+(?:\w+\s+)?off\b|\bdrivers?\b|\bno corner\b/i.test(text);
    });
}

export const GROUPS: Check[] = [
  {
    // How keen a corner is says nothing of how many people it is: a corner put forward on keenness alone may be tiny,
    // and the tools print its size beside it.
    id: "corner-size",
    kind: "format",
    why: "After a discovery read, a corner given with how keen it is also gives how many people it is.",
    run(ctx, { fail }) {
      for (const { start, text } of unsized(ctx))
        if (/\bcorners?\b/i.test(text))
          fail(
            [
              `line ${start + 1}: a corner with how keen it is (simulated) but not how many people it is.`,
              `Give its size as the tool printed it ("about 2.8m US adults, counted"). A corner with no size cannot be weighed.`,
            ].join(" "),
          );
    },
  },
  {
    id: "keen-size",
    kind: "hint",
    why: "After a discovery read, another group given with how keen it is gives its size nearby.",
    run(ctx, { warn }) {
      for (const { start, text } of unsized(ctx))
        if (!/\bcorners?\b/i.test(text) && /\bkeen/i.test(text))
          warn(
            `line ${start + 1}: how keen a group is (simulated), with no size in the same point. Say how many they are (counted), unless the reply already does nearby.`,
          );
    },
  },
  {
    // "I can't size this group" is often said of a group with a published count, which one search would find. The
    // words people's searches found no fact for are often words the reply uses for other things ("learner",
    // "laundry", "payment"), so they cannot fire this.
    id: "uncounted",
    kind: "hint",
    why: 'A group the reply says it cannot count goes with a published count, or with "no published count" once a page was opened in looking for one.',
    run(ctx, { warn }) {
      if (ctx.runs === null) return;
      const opened = ctx.runs.some((run) => run.via === "script" && run.tool === "source");
      for (const block of ctx.blocks) {
        const text = block.lines.join(" ");
        if (!UNCOUNTED.test(text) || /\bsourced\b.{0,160}?https?:\/\//i.test(text)) continue;
        if (/\bno published count\b/i.test(text) && opened) continue;
        warn(
          [
            `line ${block.start + 1}: reads as a group the reply cannot count, with no published count.`,
            "If it is put forward, look one up (guide topic look_up): open the page with source_check, and give the figure labelled sourced, with the publisher, the year and the link.",
            `If you looked and found none, say "no published count", and do not put the group forward on a size you do not have.`,
          ].join(" "),
        );
      }
    },
  },
];
