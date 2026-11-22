// The explorer's tools (the explorer itself is explorer.ts). explore_next lays out the open research question's leads,
// both sides of each and what is missing, and names the one move worth making next; the tool that makes a move writes
// its result back, and the next call re-reads everything. Once a move has been made since its first call, each call
// ends with what the moves found: whether the lead it started with still leads (a resolution, scripts/log.ts).
// corner_split splits a corner kept as a segment by every fact its scan asked about.
import type { Fact } from "../scripts/corners.ts";
import { labelled, named, resolved, said, type Line } from "../scripts/log.ts";
import type { Country } from "../scripts/population.ts";
import { groupOf, studyOf, today, type ExploreState, type Place } from "../scripts/product.ts";
import {
  COUNTRY,
  FOLDER,
  checked,
  countryOf,
  findSegment,
  folderOf,
  kb,
  one,
  people_,
  type NxkTool,
  type ToolArgs,
} from "./common.ts";
import {
  businessOf,
  call,
  exploreResolution,
  fingerprint,
  flat,
  lookOf,
  missingOf,
  moneyOf,
  ordered,
  planOf,
  preferenceIn,
  rivalsText,
  scanRecord,
  scoped,
  sizeOf,
  withExplore,
  type CornerLead,
  type Money,
  type Move,
  type MoveKind,
} from "./explorer.ts";

/** corner_split's arguments: the segment, and the smallest sub-group shown, in every 100 adults. */
interface CornerSplitArgs extends ToolArgs {
  segment: string;
  min?: number;
}

/** A part of a segment, by one fact its scan asked about: its people, and how they lean towards the offer. */
interface Part {
  fact: Fact;
  list: number[];
  odds: number;
  keen: number;
}

/**
 * One lead as lines (scripts/log.ts said): the customer's side, the business's, and what is missing.
 * @param where  product.where, or null
 */
function leadLines(
  c: CornerLead,
  i: number,
  explore: ExploreState,
  money: Money,
  country: Country,
  where: Place | null = null,
): (string | Line | null)[] {
  const s = c.segment,
    cut = (t: string) => (String(t).length > 110 ? `${String(t).slice(0, 109)}…` : String(t));
  const share = s?.share ?? c.share,
    among = s?.among ?? c.among,
    size = sizeOf(among, share, where, country);
  const business = businessOf({ ...c, among, share: where ? size.local : share }, money, country, {
    where: where?.text,
  });
  const missing = missingOf(s, s ? [!(explore.splits ?? []).includes(s.id) && "not split"] : ["not kept"]);
  const lean = c.own
    ? `x${c.odds.toFixed(2)} the odds of ${c.room_of} on it`
    : `prefer it x${c.odds.toFixed(2)} over their average offer`;
  const keen = `${(100 * c.keen).toFixed(0)}% keen against ${(100 * c.room).toFixed(0)}% of ${c.room_of}`;
  return [
    `${i + 1}. ${s ? `[${s.id}] ${s.label}` : c.label}: ${c.own ? "who wants the owner's offer," : "the corner of"} ${c.key} (${c.scan})${c.offer ? `, "${cut(c.offer)}"` : ""}`,
    labelled("counted", `   ${size.line}`),
    labelled(
      "simulated",
      `   customer: ${lean} (${c.strength === "lead" ? "a lead to test" : c.strength}); ${keen} (simulated); rivals: ${rivalsText(s, (r) => r.name, ", ")}`,
    ),
    ...(c.own ? byLines(c) : []),
    // How many must buy is worked out from the owner's figures; with none, the line has no figure of nxk's.
    labelled(business.needed === undefined ? null : "computed", `   business: ${business.line}`),
    missing ? `   ${missing}` : null,
  ];
}

/** How keen on the owner's offer by age band and by gender (simulated), one line each. */
const byLines = (c: Pick<CornerLead, "by">) =>
  (c.by ?? []).map((lean) =>
    labelled(
      "simulated",
      `   by ${lean.by}: ${lean.groups.map((g) => `${String(g.label).toLowerCase()} ${(100 * g.keen).toFixed(0)}%`).join(", ")} (simulated)`,
    ),
  );

const AGAIN = "Make this move, then call explore_next again.";
/** What to do with the move named, by its kind. A web move also names the move after it, for a session with no search. */
const HOW: Record<MoveKind, (after: Move | null) => string | Line | null> = {
  free: () => AGAIN,
  paid: () => AGAIN,
  wait: () =>
    "Make the move: it waits for the scan and reads it. If it is still running after that, tell the owner when to come back; start no other scan.",
  stop: () =>
    "This ends the exploring: report what the research found, as guide topic research says. Nothing is chosen for the owner.",
  owner: () =>
    [
      "Only the owner can say this. If they have already said it in this conversation (a spending limit),",
      "record their words with owner_answer and call explore_next again;",
      "otherwise put it to them, with the cost, and do not answer for them.",
    ].join(" "),
  web: (after) =>
    after &&
    labelled(
      null,
      [
        "Make this move if you can search the web and open pages here, then call explore_next again.",
        "If you cannot, tell the owner the rivals are not looked up yet, and go on to the move after it:",
        `${call(after)} (${after.kind}). ${after.why}`,
      ].join(" "),
      after.figures,
    ),
};

export const EXPLORE: NxkTool[] = [
  {
    name: "explore_next",
    logs: true,
    title: "Where to dig next",
    description: [
      "The explorer, for research the owner started (research_start first):",
      "lays out every lead of the open question",
      "(each scanned version's corner of people, and the big groups no version serves)",
      "with the people's side (keenness, simulated; rivals, sourced), the business's side",
      "(size, counted; how many must buy to reach the owner's target when they gave one, computed)",
      "and what is missing, then names the one move worth making next, with its tool and inputs.",
      "Make that move, then call this again: each result is written back and the leads re-read.",
      "Moves that cost nothing come first, then paid scans within the budget",
      "(asking the owner for one only when none is set), until it says report:",
      "then report the findings (guide topic research). It never asks the owner to choose.",
    ].join(" "),
    inputSchema: { type: "object", properties: { folder: FOLDER, country: COUNTRY } },
    run: async (args: ToolArgs) => {
      const folder = folderOf(args),
        { product: stored, save } = kb(folder);
      // Research only: the leads are the open question's, never every scan the folder has seen.
      const study = studyOf(stored);
      if (!study)
        return said([
          "No research is open here, so there is nothing to explore.",
          "",
          named("Next (stop): research_start"),
          [
            "Why: the explorer reads one research question at a time.",
            "research_start records the owner's question (with its place and budget when they gave them),",
            "then guide topic research says what to scan.",
          ].join(" "),
        ]);
      if (!args.country && !stored.country)
        return said([
          "Research is open, but no country is recorded, so nothing is counted yet.",
          "",
          named("Next (stop): research_start"),
          "Why: research_start again with the country (uk or us). Ask the owner which country if they have not said.",
        ]);
      const country = countryOf(args, stored);
      const { view: product, spend, run, leads, move, after } = planOf(stored, folder, country);
      const explore = product.explore,
        now = fingerprint(product),
        rounds = explore.rounds ?? [];
      const stalled = !run && rounds.length > 0 && rounds.at(-1)!.fingerprint === now;
      const money = moneyOf(product);
      const promising = ordered(leads.corners);
      // What is known now, against the first call that had a scan to read: what the moves since found.
      const look = lookOf(product, promising[0]),
        first = explore.first ?? (look.scans ? look : null);
      const found = explore.first ? exploreResolution(explore.first, look) : null;
      const next = {
        ...explore,
        ...(first ? { first } : {}),
        rounds: [...rounds, { date: today(), fingerprint: now, step: move.step }].slice(-30),
        next: { kind: move.kind, step: move.step, tool: move.tool },
        progress: !stalled,
        ...(move.step === "widen" ? { pending: { gap: move.gap, scans: product.discovery.scans.length } } : {}),
      };
      save(withExplore({ ...stored, country }, next));
      const record = scanRecord(product);
      const waiting = run ? " (one in the background is counted once read)" : "";
      const spent = spend.offers
        ? `Its scans so far cost ${(100 * spend.usd).toFixed(1)} US cents for ${spend.offers} versions`
        : `No scan of its own has answers yet${waiting}`;
      const budget = money.budget !== null ? `, of a budget of $${money.budget}` : "; no budget set";
      return said([
        `Research ${study.id}: "${study.question}" (${country.toUpperCase()}). ${spent}${budget}.`,
        record.lines.length
          ? labelled(
              "measured",
              `Measured, against what scans said: ${record.lines.join("; ")}. Where measured and simulated disagree, the measured result stands.`,
            )
          : null,
        product.where
          ? `Where: ${product.where.text}; every lead is counted there as well as nationwide.`
          : [
              "Sizes are of adults nationwide. If the question is about one area (a trade, a shop, a local service),",
              "research_start again with its where (place conditions, such as region=georgia)",
              "and every lead is counted there too.",
            ].join(" "),
        "Leads: who wants the owner's offer first, then strong corners, then by counted size:",
        ...(promising.length
          ? promising.flatMap((c, i) => leadLines(c, i, explore, money, country, product.where))
          : ["  none yet: no offer has a corner keener on it than everyone"]),
        // The owner's offer when nobody in particular wants it more than everyone: said, with its lean by age and gender.
        ...leads.corners
          .filter((c) => c.own && c.strength === "none")
          .flatMap((c) => [
            labelled(
              "simulated",
              [
                `  The owner's offer, ${c.key}: nobody in particular is keener on it than everyone`,
                `(its keenest group, ${c.label}, x${c.odds.toFixed(2)};`,
                `${(100 * c.room).toFixed(0)}% of ${c.room_of} keen) (simulated).`,
              ].join(" "),
            ),
            ...byLines(c),
          ]),
        ...leads.corners
          .filter(flat)
          .map((c) =>
            labelled(
              "simulated",
              [
                `  Not followed: ${c.key}'s corner (${c.label})`,
                `prefers it x${c.odds.toFixed(2)} over their other offers but is barely keener on it than everyone,`,
                `${(100 * c.keen).toFixed(0)}% against ${(100 * c.room).toFixed(0)}% of ${c.room_of} (simulated):`,
                "a group cold on the whole list.",
              ].join(" "),
            ),
          ),
        leads.gaps.length ? "Groups no offer serves (latest scan):" : null,
        ...leads.gaps.map((g) => {
          const tried = (explore.widened ?? []).includes(groupOf(g.among)) ? "; new offers tried" : "";
          return labelled(
            "counted",
            [
              `  - ${g.label}: ${one(g.share)} in every 100 adults nationwide (counted);`,
              `the best offer, ${g.best}, did worse than its own average there (simulated)${tried}`,
            ].join(" "),
          );
        }),
        "",
        stalled
          ? `Nothing has changed since the last call: its move (${rounds.at(-1)?.step}) was not made. Make it, or tell the owner why not.`
          : null,
        named(`Next (${move.kind}): ${call(move)}`),
        labelled(null, `Why: ${move.why}`, move.figures),
        HOW[move.kind](after),
        found ? resolved("explore", found) : null,
      ]);
    },
  },
  {
    name: "corner_split",
    logs: true,
    needsCountry: true,
    title: "Split a corner: who in it is keenest",
    description: [
      "Sends nothing: reads the saved answers again. For a segment kept from a scan's corner,",
      "splits its people by every fact the scan asked about and prints the sub-groups that prefer the offer most",
      "and least, with their counted size and how much more they prefer it (simulated).",
      "A sub-group worth keeping can be kept with segment_add (among, as printed).",
    ].join(" "),
    inputSchema: {
      type: "object",
      properties: {
        folder: FOLDER,
        country: COUNTRY,
        segment: { type: "string" },
        min: { type: "number", description: "The smallest sub-group shown, in every 100 adults (default 1)" },
      },
      required: ["segment"],
    },
    run: async (args: CornerSplitArgs) => {
      const folder = folderOf(args),
        { product, save } = kb(folder);
      const country = countryOf(args, product);
      const s = findSegment(product, args.segment);
      const scan = product.discovery.scans.find((x) => x.id === s.intent?.scan);
      if (!scan || !s.intent?.idea)
        throw new Error(
          `${s.id} was not kept from a scan's corner: there is no offer to split it by. Keep a corner with segment_add (from_scan, idea).`,
        );
      const own = Boolean((scan.corners ?? []).find((c) => c.key === s.intent?.idea)?.own);
      const pref = preferenceIn({ folder, scan, idea: s.intent.idea, country, own });
      const as = own ? "as keen as everyone" : "over their average offer";
      if (!pref) throw new Error(`The saved answers for ${scan.id} are not here (.nxk/scans): nothing to split by.`);
      const { room, N, mine, lean, keen } = pref;
      const members = pref.members(s.among),
        conditions = checked(country, s.among);
      if (!members.length) throw new Error(`Nobody in the generated people is in ${s.id} (${s.among})`);
      const inCorner = new Set(conditions.map((c) => room.fields.find((f) => f.path === c.path)?.name));
      const min = (args.min ?? 1) / 100;
      const subs = room.facts
        .filter((f) => mine.scanned.includes(f.field) && !inCorner.has(f.field))
        .map((f): Part | null => {
          const list = members.filter((p) => f.members[p]);
          return (list.length * room.scale) / N >= min ? { fact: f, list, odds: lean(list), keen: keen(list) } : null;
        })
        .filter((sub) => sub !== null)
        .sort((a, b) => b.odds - a.odds);
      // Sizes are shares of all adults, also when the scan was read among the people in work.
      const of = (list: number[]) => (list.length * room.scale) / N;
      const size = (list: number[]) => `${one(of(list))} in every 100 adults`;
      const line = (sub: Part) =>
        labelled(
          "simulated",
          [
            `  ${sub.fact.label}: ${size(sub.list)}, about ${people_(of(sub.list), country)} (counted);`,
            `x${sub.odds.toFixed(2)}, ${(100 * sub.keen).toFixed(0)}% keen (simulated).`,
            `among: ${s.among},${sub.fact.field}=${sub.fact.code}`,
          ].join(" "),
          { counted: [`${size(sub.list)}, about ${people_(of(sub.list), country)}`] },
        );
      const was = scoped(product).explore ?? {};
      save(withExplore(product, { ...was, splits: [...new Set([...(was.splits ?? []), s.id])] }));
      // What the split found: whether a part of the group prefers the offer clearly more than the whole of it.
      const whole = lean(members),
        top = subs[0];
      const looked = `who inside ${s.label} prefers "${s.intent.idea}" most`;
      const split = !top
        ? resolved(`split:${s.id}`, {
            checked: looked,
            found: "no fact splits it into groups big enough to compare",
            outcome: "unclear",
          })
        : top.odds >= 1.25 * whole
          ? resolved(
              `split:${s.id}`,
              {
                checked: looked,
                found: `${top.fact.label}, ${size(top.list)} (counted), prefer it x${top.odds.toFixed(2)}, against x${whole.toFixed(2)} for the whole group (simulated)`,
                outcome: "changed",
                why: "a narrower group is the stronger lead",
              },
              "simulated",
              { counted: [size(top.list)] },
            )
          : resolved(
              `split:${s.id}`,
              {
                checked: looked,
                found: "no part of it prefers it much more than the whole group (simulated)",
                outcome: "confirmed",
              },
              "simulated",
            );
      const odds = whole.toFixed(2);
      const prefers = own ? `x${odds} ${as} on ${s.intent.idea}` : `prefer ${s.intent.idea} x${odds} ${as}`;
      return said([
        labelled(
          "simulated",
          [
            `${s.id} (${s.label}): ${size(members)} (counted), ${prefers},`,
            `${(100 * keen(members)).toFixed(0)}% keen against`,
            `${(100 * mine.mean).toFixed(0)}% of ${room.whom} (simulated).`,
          ].join(" "),
          { counted: [size(members)] },
        ),
        subs.length
          ? "Keenest inside it:"
          : `No fact the scan asked about splits it into groups of ${one(min)} in every 100 adults or more.`,
        ...subs.slice(0, 4).map(line),
        subs.length > 4 ? "Least keen inside it:" : null,
        ...(subs.length > 4 ? subs.slice(-2).reverse().map(line) : []),
        "",
        [
          "A tighter group is worth keeping only if it is big enough to be a business",
          "and clearly keener than the corner as a whole.",
          `Keep one with segment_add (among as printed, with from_scan "${scan.id}" and idea "${s.intent.idea}"`,
          "so it carries its own keenness); then call explore_next.",
        ].join(" "),
        split,
      ]);
    },
  },
];
