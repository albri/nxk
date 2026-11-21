// An offer bought by organisations. nxk's people are adults, so its counts are of people, not businesses: the line
// saying so is one terms and discover print for the reply to keep (form.ts, kept-line). After an offer is asked at
// work (discover's at_work record), the reply says who decides it, from discover's "Who decides" table. That is said
// in prose, so these are hints: a trace of the table's shares would pass by chance, as the table holds so many
// figures that a reply's own ("$29", "17%") are usually among them.
import { recordsOf } from "../records.ts";
import type { Check, CheckContext } from "./index.ts";

// Who decides a purchase at a firm, and what they do in it (note: "no procurement" decides nothing).
const DECIDER = /\b(?:owners?|managers?|directors?|procurement|finance|office|operations|founders?|partners?)\b/i;
const DECIDING =
  /\b(?:signs?[- ]off|signed off|sign-off|decides?|decided|deciding|approves?|approved|approval|budget holders?|decision[- ]makers?|(?<!\bno )procurement)\b/i;
// The sizes of firm a reply may put forward, in the words replies use.
const FIRM_SIZES = {
  "one-person":
    /\b(?:solos?|one-person|sole traders?|owner-operators?|no employees|work(?:s|ing)? alone|self-employed)\b/i,
  small: /\b(?:crews?|2 to 10|2-10|under 10|fewer than 10|small (?:firms?|shops?|businesses|teams?))\b/i,
  "mid-sized": /\b(?:10 to 49|50 to 99|mid-?sized?|medium-sized)\b/i,
  large: /\b(?:bigger|larger|large (?:firms?|contractors?|employers?)|1,000|enterprise|250 or more|500 or more)\b/i,
};
// A test with real firms, and one that sets sizes against each other: "run the same pitch to 15 solo operators to
// compare". Talking only to owners of 3 to 8 person shops cannot say which size to sell to first.
const FIRM_TEST =
  /\b(?:talk(?:ing)? to|interview|calls?|demos?|pilot|trial|free month|offer|pitch|outreach|landing page|adverts?|ads?|sign-?ups?|emails?|cold[- ]call|visit|take-?up|convert(?:s|ing)?)\b/i;
// A size the reply puts first, second or later: only a reply that ranks sizes is choosing between them.
const RANKED =
  /\b(?:first|second|third|later|start(?:ing)? with|lead with|leave|skip|prioriti[sz]e|go after|sell to|put\b[^.]{0,40}\b(?:first|second|last))\b/i;
const COMPARED =
  /\bcompar(?:e|es|ed|ing|ison)\b|\bside by side\b|\beach (?:size|group)\b|\bboth\b|\bsame (?:offer|pitch|trial|price|advert|ad|page|way|spend|email|script)\b|\bin each\b|\bfor each\b|\bagainst\b|\bsplit by\b|\bversus\b|\bvs\.?\b/i;

const atWork = (ctx: CheckContext) => ctx.runs !== null && recordsOf(ctx.runs, "at_work").length > 0;
const points = (ctx: CheckContext) => ctx.blocks.map((block) => block.lines.join(" "));
// Someone named, and what they do in the purchase, in one sentence.
const decides = (text: string) =>
  text.split(/[.;!?]\s/).some((sentence) => DECIDER.test(sentence) && DECIDING.test(sentence));

export const BUSINESS: Check[] = [
  {
    // How firms of each size buy is counted, so the reply can name who decides at each size. "The owner is the buyer,
    // so there is no procurement" names no one.
    id: "who-decides",
    kind: "hint",
    why: "After an offer is asked at work, the reply says who decides it.",
    run(ctx, { warn }) {
      if (!atWork(ctx) || points(ctx).some(decides)) return;
      warn(
        [
          "an offer was asked at work, and the reply seems not to say who decides it.",
          "For each size of firm the reply puts forward, say who decides (the owner alone, a manager within a budget, procurement) and who else takes part,",
          `from "Who decides" in the scan's reading (counted on the people in work).`,
        ].join(" "),
      );
    },
  },
  {
    id: "who-decides-each-size",
    kind: "hint",
    why: "Each size of firm the reply puts forward says who decides there.",
    run(ctx, { warn }) {
      if (!atWork(ctx)) return;
      const blocks = points(ctx);
      const left = Object.entries(FIRM_SIZES)
        .filter(([, re]) => blocks.some((b) => re.test(b)) && !blocks.some((b) => re.test(b) && decides(b)))
        .map(([size]) => size);
      if (left.length)
        warn(
          [
            `an offer was asked at work, and the reply seems to name ${left.join(", ")} firms without saying who decides there.`,
            `Say who decides at each size you put forward, from "Who decides" in the scan's reading.`,
          ].join(" "),
        );
    },
  },
  {
    // A sentence quoting the scan is not a test, and neither is one size of firm on its own: sizes are ranked only
    // against each other.
    id: "firm-test",
    kind: "hint",
    why: "A reply that ranks sizes of firm tests them against each other with real firms.",
    run(ctx, { warn }) {
      if (!atWork(ctx)) return;
      const sentences = points(ctx).flatMap((b) => b.split(/(?<=[.;!?])\s+/));
      const ranked = Object.entries(FIRM_SIZES)
        .filter(([, re]) => sentences.some((sentence) => re.test(sentence) && RANKED.test(sentence)))
        .map(([size]) => size);
      if (ranked.length < 2) return;
      const tests = sentences.filter(
        (sentence) => FIRM_TEST.test(sentence) && !/\bsimulated\b|\bscan\b/i.test(sentence),
      );
      const sized = (sentence: string) => Object.values(FIRM_SIZES).filter((re) => re.test(sentence)).length;
      if (tests.some((sentence) => COMPARED.test(sentence) || sized(sentence) >= 2)) return;
      const test = tests.length ? "its test with real firms reaches one size" : "it names no test with real firms";
      warn(
        [
          `the reply seems to rank ${ranked.join(", ")} firms, but ${test}: a test on one size cannot say which to sell to first.`,
          "Put the same offer, the same way and for the same spend, to firms of each size it ranks (the same pitch to 15 solo owners and to 15 crew owners),",
          "and record take-up in each with outcome_record.",
        ].join(" "),
      );
    },
  },
];
