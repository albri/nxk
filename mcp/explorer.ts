// The explorer: where research digs next. It reads the open research question (its own scans and segments: scoped)
// as leads (an offer and the corner of people that prefers it, or a big group no offer serves), says what is known and
// missing for each on the customer's side and the business's, and names the one move worth making next, with its tool
// and inputs. Free moves come first (keep a corner, split it, look up rivals), then the one thing only the owner can
// say (a budget for scans, when none is set), then paid ones (new offers for a group nothing serves) within that budget.
// It stops when the owner must answer, when the budget is spent, or when widening has stopped finding anything. Leads
// are never given one made-up score: they are ordered by the corner's strength, then counted size. explore_next
// (explore.ts) prints it all; the nudge after other tools (nudge.ts) names the same move, both from planOf.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CATEGORIES, roleIn, soldToOrganisations, type SavedOffer } from "../scripts/businesses.ts";
import { scoresOf, type ScoredIdea } from "../scripts/corners.ts";
import { scanBudget } from "../scripts/decision-model.ts";
import type { Parts, Resolution } from "../scripts/log.ts";
import { savedAnswers, trackRecord } from "../scripts/outcome.ts";
import type { Country } from "../scripts/population.ts";
import {
  groupOf,
  runningScan,
  scansDir,
  studyOf,
  type ExploreLook,
  type ExploreState,
  type KeenBy,
  type Place,
  type Product,
  type Rival,
  type RunningScan,
  type Scan,
  type Segment,
  type Strength,
  type Study,
} from "../scripts/product.ts";
import {
  ADULTS,
  checked,
  keyOf,
  one,
  people_,
  roomFor,
  shareOf,
  strengthOf,
  workScan,
  type ScanRoom,
} from "./common.ts";

const PER_OFFER = 0.007; // US dollars an offer when nothing spent yet says otherwise (ten offers cost about 7 cents)
const GAP = 0.05; // a group none serves is worth new offers when it holds 5 in every 100 adults or more
const DRY = 2; // widening stops after this many rounds in a row that found no strong corner

/** What the country's scans have cost so far: US dollars, the offers answered, and the cost an offer. */
export interface Spend {
  usd: number;
  offers: number;
  perOffer: number;
}

/** The owner's figures the explorer uses: margin (%), target profit a month, and the budget for scans (US dollars). */
export interface Money {
  margin: number | null;
  target: number | null;
  budget: number | null;
}

/** The product as the explorer reads it while research is open (scoped): the question's own, and the question. */
export interface Scoped extends Product {
  study?: Study;
}

/** The open question as planOf reads it: scoped, with its explore state settled after a widen. */
export interface View extends Scoped {
  explore: ExploreState;
}

/** How often a price is paid. */
export type Per = "year" | "month" | "week" | "once";

/** The price an offer states: as written, how often, and as a month's (null for a one-off). */
export interface Price {
  text: string;
  per: Per;
  monthly: number | null;
}

/** What businessOf reads of a lead or a segment: its offer, its group, and the group's share where it is counted. */
export interface Sized extends SavedOffer {
  among?: string;
  share: number | null;
}

/** The business's side of a lead: its price, the paying customers the owner's target needs, and their take-up. */
export interface Business {
  price?: Price;
  needed?: number;
  takeUp?: number;
  line: string;
}

/** A lead: an offer's latest corner, with the offer's words and the segment kept for it, if any. */
export interface CornerLead {
  kind: "corner";
  key: string;
  scan: string;
  among: string;
  label: string;
  share: number;
  odds: number;
  strength: Strength;
  keen: number;
  room: number;
  room_of: string;
  own: boolean;
  by: KeenBy[] | null;
  offer: string | null;
  at_work?: string;
  segment: Segment | null;
}

/** A lead kept as a segment. */
type KeptLead = CornerLead & { segment: Segment };

/** A lead: a big group the latest scan found no offer serves, and the offer that came nearest. */
export interface GapLead {
  kind: "gap";
  scan: string;
  /** Its place in the scan's list, from 1 (segment_add's idea "nothing:<n>"). */
  n: number;
  among: string;
  label: string;
  share: number;
  best: string;
  segment: Segment | null;
}

/** Every lead of what is read. */
export interface Leads {
  corners: CornerLead[];
  gaps: GapLead[];
}

/** What ordered and flat read of a corner. */
export type Ranked = Pick<CornerLead, "strength" | "keen" | "room" | "share"> & { own?: boolean };

/** What kind of move: free, a web search, the owner's to answer, paid, waiting on a scan, or the end of exploring. */
export type MoveKind = "free" | "web" | "owner" | "paid" | "wait" | "stop";

/** The steps the explorer names, in the order it looks for them; a scan in the background is waited for or read. */
export type Step = "start" | "keep" | "split" | "rivals" | "budget" | "widen" | "report" | "scan" | "read";

/** What every move says: its kind, the tool and its inputs, why, and the figures in why by their kind. */
interface MoveBase {
  kind: MoveKind;
  tool: string;
  inputs: Record<string, string | number>;
  why: string;
  figures?: Parts;
}

/** Any move but a widen. */
export interface PlainMove extends MoveBase {
  step: Exclude<Step, "widen">;
}

/** New offers for a group nothing serves: a paid scan, with its cost in US dollars and the group (groupOf). */
export interface WidenMove extends MoveBase {
  kind: "paid";
  step: "widen";
  cost: number;
  gap: string;
}

/** The one next move. */
export type Move = PlainMove | WidenMove;

/** The open research question as the explorer reads it, and the move it names (planOf). */
export interface Plan {
  view: View;
  spend: Spend;
  run: RunningScan | null;
  leads: Leads;
  move: Move;
  /** The move after a web move, for a session that cannot search; null after any other. */
  after: Move | null;
}

/** How the people in a group lean towards one scanned offer (preferenceIn). */
export interface Preference {
  room: ScanRoom;
  N: number;
  /** The offer's own scores. */
  mine: ScoredIdea;
  /** For a list of people (positions in the room): x, how many times more they prefer it, and how keen they are. */
  lean: (list: number[]) => number;
  keen: (list: number[]) => number;
  /** The people in a group, as positions in the room. */
  members: (among: string) => number[];
}

/** A group whose customers are businesses: why it is not set against adults, and what its customers are set against. */
export interface Firms {
  why: string;
  against: string;
}

/**
 * What the country's scans have cost so far, from the saved answers: { usd, offers, perOffer }. `keys`: only these
 * offers' answers (a study's own), or every offer when null.
 */
export function spendOf(scans: string, country: string, keys: Set<string> | null = null): Spend {
  const dir = join(scans, `ideas-${country}.spec`);
  if (!existsSync(dir)) return { usd: 0, offers: 0, perOffer: PER_OFFER };
  let usd = 0,
    offers = 0;
  const mine = (file: string) => !keys || keys.has(file.replace(/^scan-/, "").replace(/\.jsonl$/, ""));
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".jsonl") && mine(f))) {
    offers++;
    for (const line of readFileSync(join(dir, file), "utf8").split("\n").filter(Boolean))
      usd += (JSON.parse(line) as { usd?: number }).usd ?? 0;
  }
  return { usd, offers, perOffer: offers && usd ? usd / offers : PER_OFFER };
}

/**
 * The owner's figures the explorer uses, never a guess: margin (%), target profit a month, and the budget for scans.
 * With no budget given for this product, the plugin's scan budget (set once, for any request) stands in.
 */
export function moneyOf(product: Scoped, standing: number | null = scanBudget()): Money {
  const find = (re: RegExp) => {
    const m = product.money.find((e) => re.test(e.name) && e.source !== "guess");
    return m ? Number(m.value) : null;
  };
  return {
    margin: find(/margin/i),
    target: find(/target|profit/i),
    budget: product.study?.budget ?? find(/budget/i) ?? standing,
  };
}

/** Where the owner sells, as place conditions counted: the open question's place, else the product's, else null. */
export const whereOf = (product: Product): Place | null => studyOf(product)?.where ?? product.where ?? null;

/**
 * What the explorer reads while research is open (studyOf): only that question's scans and segments, those made since
 * research_start and the saved scans it named in include, with its own explore state, place and budget. With none
 * open, the product as it is.
 */
export function scoped(product: Product): Scoped {
  const study = studyOf(product);
  if (!study) return product;
  const include = new Set(study.include ?? []);
  // A scan read while this question is open but started for another stays with that one.
  const scans = product.discovery.scans.filter(
    (s, i) =>
      (i >= study.scans_from && (s.study ?? study.id) === study.id) || include.has(s.id) || include.has(s.label),
  );
  // Looked up by a segment's scan, which a segment written as conditions does not have.
  const ids = new Set<string | undefined>(scans.map((s) => s.id));
  const segments = product.discovery.segments.filter((s, i) => i >= study.segments_from || ids.has(s.intent?.scan));
  return {
    ...product,
    discovery: { ...product.discovery, scans, segments },
    explore: study.explore ?? null,
    where: whereOf(product),
    study,
  };
}

/** The offers a study scanned itself (not those of the saved scans it reads), to count its spend against its budget. */
export const ownOffers = (view: Scoped): Set<string> | null =>
  view.study
    ? new Set(
        view.discovery.scans
          .filter((s) => !(view.study?.include ?? []).some((l) => l === s.id || l === s.label))
          .flatMap((s) => (s.ideas ?? []).map((i) => keyOf(i.key))),
      )
    : null;

/**
 * The product with the explorer's state written back to the open study; unchanged when none is open, as the explorer
 * runs only while research is.
 */
export function withExplore(product: Product, explore: ExploreState): Product {
  const study = studyOf(product);
  if (!study) return product;
  return { ...product, research: product.research.map((s) => (s.id === study.id ? { ...s, explore } : s)) };
}

/** The price an offer states, as { text, per, monthly }, or null. A one-off price has no monthly figure. */
export function priceOf(offer: string | null | undefined): Price | null {
  const m = /([£$€])\s?(\d(?:[\d,]*\d)?(?:\.\d+)?)/.exec(String(offer ?? ""));
  if (!m) return null;
  const value = Number(m[2].replace(/,/g, "")),
    after = String(offer).slice(m.index, m.index + 40);
  const per: Per = /year|annual|annum/i.test(after)
    ? "year"
    : /month/i.test(after)
      ? "month"
      : /week/i.test(after)
        ? "week"
        : "once";
  const monthly: Partial<Record<Per, number>> = { month: value, year: value / 12, week: (value * 52) / 12 };
  return { text: m[0], per, monthly: monthly[per] ?? null };
}

/**
 * The business's side of a lead: how many paying customers the owner's target needs, and that as a share of the group,
 * counted where the owner sells (`where`, from research_start) or else nationwide. An offer sold to businesses, or a group
 * cut by a role at work, is not set against adults: its customers are businesses, and their number is a count of firms
 * (the people tool, unit firms) or a published count, not a count of the adults who run one.
 */
export function businessOf(
  lead: Sized,
  money: Pick<Money, "margin" | "target">,
  country: Country,
  { where = null }: { where?: string | null } = {},
): Business {
  const price = priceOf(lead.offer);
  const firms = firmsInstead(lead, where, country);
  const against = firms ? `; ${firms.why}: set paying customers ${firms.against}` : "";
  if (!price) return { line: `no price in the offer${against}` };
  if (!price.monthly) return { price, line: `${price.text} once: no monthly figure to set against a target${against}` };
  if (!money.margin || !money.target)
    return {
      price,
      line: `${price.text} a ${price.per}; the owner's margin and target profit are not known yet${against}`,
    };
  const needed = Math.ceil(money.target / ((price.monthly * money.margin) / 100));
  const make = `at ${price.text} a ${price.per} and ${money.margin}% margin, ${needed.toLocaleString("en-GB")} paying customers make ${money.target} a month`;
  if (firms) return { price, needed, line: `${make} (computed)${against}` };
  if (!lead.share)
    return {
      price,
      needed,
      line: `${make} (computed): nobody in this group ${where ? `in ${where} ` : ""}among the generated people`,
    };
  const takeUp = needed / (lead.share * ADULTS[country]);
  const per =
    takeUp >= 0.01
      ? `${(100 * takeUp).toFixed(1)} in every 100`
      : takeUp >= 0.001
        ? `${(1000 * takeUp).toFixed(1)} in every 1,000`
        : `1 in every ${Math.round(1 / takeUp).toLocaleString("en-GB")}`;
  return {
    price,
    needed,
    takeUp,
    line: `${make}: ${per} of this group ${where ? `in ${where}` : "nationwide"} (computed)`,
  };
}

/** A group's share of all the people that is also where the owner sells: null with no place recorded. */
export function localShare(among: string, where: Place, country: Country): number;
export function localShare(among: string, where: Place | null, country: Country): number | null;
export function localShare(among: string, where: Place | null, country: Country): number | null {
  return where ? shareOf(country, `${among},${where.among}`) : null;
}

/** A scanned offer's words, and what organisations buy it as when it was asked at work. */
const offerOf = (scan: Scan, key: string): { offer: string | null; at_work?: string } => {
  const idea = (scan.ideas ?? []).find((i) => keyOf(i.key) === key),
    category = idea?.buying_category;
  return {
    offer: idea?.offer ?? null,
    ...(category !== undefined && CATEGORIES.includes(category) ? { at_work: category } : {}),
  };
};

/** Every lead: the latest corner of each scanned offer, and the groups the latest scan found no offer serves. */
export function leadsOf(product: Product): Leads {
  const scans = product.discovery.scans.filter((s) => s.kind === "ideas"),
    segments = product.discovery.segments;
  const latest = new Map<string, { scan: Scan; c: Scan["corners"][number] }>();
  for (const scan of scans) for (const c of scan.corners ?? []) latest.set(c.key, { scan, c });
  const corners = [...latest.values()].map(({ scan, c }): CornerLead => ({
    kind: "corner",
    key: c.key,
    scan: scan.id,
    among: c.among,
    label: c.label,
    share: c.share,
    odds: c.odds,
    strength: strengthOf(c.odds),
    keen: c.keen,
    room: c.room,
    room_of: c.room_of ?? "all adults",
    // The owner's own offer: its lead is who wants it (keenest against everyone), with how keen by age and gender.
    own: Boolean(c.own),
    by: c.own ? (c.by ?? []) : null,
    ...offerOf(scan, c.key),
    segment:
      segments.find((s) => s.intent?.idea === c.key) ??
      segments.find((s) => groupOf(s.among) === groupOf(c.among)) ??
      null,
  }));
  const last = scans.at(-1);
  const gaps = !last
    ? []
    : (last.nothing_for ?? []).map((g, i): GapLead => ({
        kind: "gap",
        scan: last.id,
        n: i + 1,
        among: g.among,
        label: g.label,
        share: g.share,
        best: g.best,
        segment: segments.find((s) => groupOf(s.among) === groupOf(g.among)) ?? null,
      }));
  return { corners, gaps };
}

/**
 * A corner that prefers its offer to their other offers but is barely keener on it than everyone is not worth
 * following: it is a group cold on the whole list, which research otherwise leads with (a corner 8% keen against 8% of
 * all adults, another 15% against 13%). A quarter keener than everyone at least, or it is set aside. The owner's own
 * offer is never set aside: its lead is who wants it.
 */
export const flat = (c: Ranked): boolean => !c.own && c.strength !== "none" && c.keen < 1.25 * c.room;

/** The corners worth following: the owner's own offer first, then strong before faint, then the bigger first. */
export function ordered<C extends Ranked>(corners: C[]): C[] {
  const rank: Record<string, number> = { strong: 0, faint: 1 };
  return corners
    .filter((c) => c.strength !== "none" && !flat(c))
    .sort(
      (a, b) =>
        Number(Boolean(b.own)) - Number(Boolean(a.own)) || rank[a.strength] - rank[b.strength] || b.share - a.share,
    );
}

/** Whether anyone has looked for a segment's rivals: some recorded, or none found with what was searched. */
export const lookedUp = (s: Segment): boolean => s.rivals.length > 0 || Boolean(s.rivals_none);

/** What has changed in what is known, to tell a move made from one that was not. */
export const fingerprint = (product: Product): string =>
  JSON.stringify([
    product.discovery.scans.length,
    product.discovery.segments.map((s) => [s.id, s.rivals.length, Boolean(s.rivals_none), s.status]),
    product.explore?.splits ?? [],
    product.outcomes.length,
    product.questions.filter((q) => q.status !== "open").length,
    product.money.length,
  ]);

const asked = (product: Product, topic: string) =>
  product.questions.some((q) => (q.topic ?? "").toLowerCase() === topic && q.status !== "open");

/**
 * The one next move, as { kind: free | web | owner | paid | stop, step, tool, inputs, why, figures, cost }, `figures`
 * being the figures in why by their kind ({ counted: [words in why] }: scripts/log.ts parts). Pure: everything it
 * reads is in its argument. `spend` is spendOf's; `leads` leadsOf's. `skip` names steps this session cannot make
 * (["rivals"] without a web search): the move after them is returned instead.
 */
export function nextMove({
  product,
  country,
  spend,
  leads,
  skip = [],
}: {
  product: Scoped;
  country: Country;
  spend: Spend;
  leads: Leads;
  skip?: string[];
}): Move {
  const explore: ExploreState = product.explore ?? {},
    money = moneyOf(product);
  if (!product.discovery.scans.some((s) => s.kind === "ideas"))
    return {
      kind: "stop",
      step: "start",
      tool: "product",
      inputs: {},
      why: [
        "Nothing has been scanned in this research yet: write the versions to whoever pays, each with its price,",
        "and put them to the people with ideas_scan (guide topic research). Its first scan starts the map.",
      ].join(" "),
    };
  const promising = ordered(leads.corners);
  const kept = promising.filter((c): c is KeptLead => c.segment !== null);
  for (const c of promising)
    if (!c.segment)
      return {
        kind: "free",
        step: "keep",
        tool: "segment_add",
        inputs: { from_scan: c.scan, idea: c.key, label: "<how the owner would say it>" },
        why: `${c.key}'s corner (${c.label}) is ${c.strength}: ${one(c.share)} in every 100 adults (counted). Keep it to size it, split it and look for rivals.`,
        figures: { counted: [`${one(c.share)} in every 100 adults`] },
      };
  for (const c of kept)
    if (!(explore.splits ?? []).includes(c.segment.id))
      return {
        kind: "free",
        step: "split",
        tool: "corner_split",
        inputs: { segment: c.segment.id },
        why: `Who inside ${c.segment.id} (${c.segment.label}) is keenest, and who is not: a tighter group may carry the corner, and a cold part is people to leave out.`,
      };
  const all = [
    ...kept.map((c) => c.segment),
    ...product.discovery.segments.filter((s) => !kept.some((c) => c.segment === s)),
  ];
  if (!skip.includes("rivals"))
    for (const s of all)
      if (s.status !== "dropped" && !lookedUp(s))
        return {
          kind: "web",
          step: "rivals",
          tool: "segment_rival",
          inputs: { segment: s.id, name: "<the business>", link: "<its page>", words: "<words copied from it>" },
          why: [
            `Nobody has looked for businesses already serving ${s.id} (${s.label}).`,
            "Search for the kind of product, open what you find, and record each rival,",
            "or none_found with what you searched.",
          ].join(" "),
        };
  // Research asks the owner nothing first but a budget: their margin and target, when known, size each lead's
  // business side; when not, the report names them as what would sharpen the findings.
  const gap = leads.gaps
    .filter((g) => g.share >= GAP && !(explore.widened ?? []).includes(groupOf(g.among)))
    .sort((a, b) => b.share - a.share)[0];
  if (gap && (explore.dry ?? 0) < DRY) {
    const cost = 3 * spend.perOffer,
      left = money.budget === null ? null : money.budget - spend.usd;
    if (left === null && !asked(product, "exploration budget"))
      return {
        kind: "owner",
        step: "budget",
        tool: "owner_ask",
        inputs: {
          kind: "figure",
          topic: "exploration budget",
          question: `Scanning new offers costs about ${(100 * spend.perOffer).toFixed(1)} US cents an offer on your decision-model key. What is the most nxk may spend on exploring, in US dollars?`,
          why: "new offers for the groups nothing serves are paid scans",
        },
        why: `${gap.label} (${one(gap.share)} in every 100 adults, counted) prefer none of the offers. New offers for them are a paid scan, and no budget is set.`,
        figures: { counted: [`${one(gap.share)} in every 100 adults`] },
      };
    if (left !== null && left >= cost)
      return {
        kind: "paid",
        step: "widen",
        tool: "ideas_scan",
        cost,
        gap: groupOf(gap.among),
        inputs: {
          label: `widen${(explore.widened ?? []).length + 1}`,
          ideas:
            "<every offer scanned so far, as it was (with its buying_category), and two to four new offers for this group, each with its price>",
          max_usd: Number(left.toFixed(2)),
        },
        why: [
          `${gap.label}: ${one(gap.share)} in every 100 adults, about ${people_(gap.share, country)} (counted),`,
          `prefer none of the offers (the best, ${gap.best}, did worse than its own average there: simulated).`,
          `Only the new offers are sent: about ${(100 * cost).toFixed(1)} cents.`,
        ].join(" "),
        figures: { counted: [`${one(gap.share)} in every 100 adults, about ${people_(gap.share, country)}`] },
      };
  }
  const strong = promising.filter((c) => c.strength === "strong");
  // Who wants the owner's own offer leads the findings, whatever its strength (guide topic research).
  const yours = leads.corners.some((c) => c.own)
    ? "First, who wants the owner's own offer: its keenest group, sized, and which way it leans by age and gender. "
    : "";
  const skipped = skip.includes("rivals") ? " (rivals not looked up here)" : "";
  return {
    kind: "stop",
    step: "report",
    tool: "guide",
    inputs: { topic: "research" },
    why: strong.length
      ? [
          `${strong.length} strong lead(s), kept, split and looked up${skipped}.`,
          'Report the findings as guide topic research says ("What you return").',
          `${yours}Then strong leads, each sized (counted) among who pays, faint ones marked faint,`,
          "the groups no version serves, what the owner's own figures would sharpen,",
          "what the scans cannot say and what they cost. Nothing is chosen for the owner.",
        ].join(" ")
      : [
          "No version has a strong corner of its own. Report that plainly, as guide topic research says.",
          `${yours}Then that nothing else stood out, the faint leads marked faint, the groups no version serves,`,
          "and that the choice rests on what the owner can test with real buyers.",
        ].join(" "),
  };
}

/** The move while a scan runs in the background (wait for it), or once it has finished unread (read it). */
const scanMove = (run: RunningScan): Move => {
  const paced = run.minutes ? ` and paced to about ${run.minutes} minutes` : "";
  return run.alive
    ? {
        kind: "wait",
        step: "scan",
        tool: "ideas_scan",
        inputs: { label: run.label },
        why: [
          `The scan ${run.label} is running in the background, started ${run.ago} minutes ago${paced}.`,
          "ideas_scan with that label alone waits for it (up to ten minutes a call) and then reads it, sending nothing.",
        ].join(" "),
      }
    : {
        kind: "free",
        step: "read",
        tool: "ideas_scan",
        inputs: { label: run.label },
        why: `The scan ${run.label} has finished in the background: read it with ideas_scan and that label alone (it sends nothing).`,
      };
};

/**
 * The open research question as the explorer reads it, and the move it names: { view, spend, run, leads, move, after }.
 * `view` is the question's own scans and segments (scoped), its explore state settled after a widen; `run` a scan in
 * the background (runningScan); `after` the move after a web move, for a session that cannot search. explore_next and
 * the nudge after other tools both name `move`.
 */
export function planOf(stored: Product, folder: string, country: Country): Plan {
  const question = scoped(stored);
  const scans = scansDir(folder),
    spend = spendOf(scans, country, ownOffers(question)),
    run = runningScan(scans);
  const view: View = { ...question, explore: settleWiden(question) };
  const leads = leadsOf(view);
  const plan = (skip: string[]) => nextMove({ product: view, country, spend, leads, skip });
  const own = plan([]);
  // The folder runs one scan at a time. This question's own scan is waited for or read before anything else; another
  // question's holds only this one's next scan (its first, or a widen), and its other moves go on.
  const theirs = Boolean(run?.study) && run?.study !== question.study?.id;
  const move = run && (!theirs || own.kind === "paid" || own.step === "start") ? scanMove(run) : own;
  return { view, spend, run, leads, move, after: move.kind === "web" ? plan(["rivals"]) : null };
}

/** The lead a call starts from, and how much is known, to tell later what the moves since found. */
export function lookOf(product: Product, top: CornerLead | undefined): ExploreLook {
  const segments = product.discovery.segments;
  return {
    lead: top ? { key: top.key, label: top.segment?.label ?? top.label } : null,
    kept: segments.length,
    splits: (product.explore?.splits ?? []).length,
    rivals: segments.filter(lookedUp).length,
    scans: product.discovery.scans.filter((s) => s.kind === "ideas").length,
    answers: product.questions.filter((q) => q.status !== "open").length,
  };
}

/**
 * What the moves made since the explorer's first call found, as a resolution (scripts/log.ts resolutionText), or null
 * when none was made: the lead now against the lead then. The same offer's group leading confirms it; another
 * changes it; none standing out cannot tell.
 */
export function exploreResolution(first: ExploreLook, now: ExploreLook): Resolution | null {
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const done = [
    now.kept > first.kept && `kept ${plural(now.kept - first.kept, "group")}`,
    now.splits > first.splits && `split ${now.splits - first.splits} by who is keenest`,
    now.rivals > first.rivals && `looked up competitors for ${now.rivals - first.rivals}`,
    now.scans > first.scans && `ran ${plural(now.scans - first.scans, "more scan")} of offers`,
    now.answers > first.answers && `asked you ${plural(now.answers - first.answers, "question")}`,
  ].filter(Boolean);
  if (!done.length) return null;
  const checked = `who it is for (${done.length > 1 ? `${done.slice(0, -1).join(", ")} and ${done.at(-1)}` : done[0]})`;
  if (!now.lead)
    return { checked, found: "no group stands out yet", outcome: "unclear", why: "no group prefers one offer clearly" };
  const found = `the lead is ${now.lead.label}, for "${now.lead.key}"`;
  if (!first.lead) return { checked, found, outcome: "changed", why: "at the first look no group stood out" };
  if (first.lead.key === now.lead.key) return { checked, found, outcome: "confirmed", why: "as at the first look" };
  return {
    checked,
    found,
    outcome: "changed",
    why: `at the first look it was ${first.lead.label}, for "${first.lead.key}"`,
  };
}

/** A move as its tool and inputs. */
export const call = (move: Move): string =>
  `${move.tool}${Object.keys(move.inputs).length ? ` ${JSON.stringify(move.inputs)}` : ""}`;

/** After a widen, whether it found anything: a new strong corner among the offers first scanned since. */
export function settleWiden(product: Product): ExploreState {
  const explore: ExploreState = { ...product.explore },
    pending = explore.pending,
    last = product.discovery.scans.at(-1);
  if (!pending || !last || product.discovery.scans.length <= pending.scans) return explore;
  const before = new Set(
    product.discovery.scans.slice(0, pending.scans).flatMap((s) => (s.ideas ?? []).map((i) => keyOf(i.key))),
  );
  const found = (last.corners ?? []).some((c) => !before.has(c.key) && strengthOf(c.odds) === "strong");
  return {
    ...explore,
    widened: [...(explore.widened ?? []), pending.gap],
    dry: found ? 0 : (explore.dry ?? 0) + 1,
    pending: null,
  };
}

/**
 * How the people in a group lean towards one scanned offer, read from the scan's saved answers the way the scan's own
 * corners are (ownCorners in scripts/corners.ts): x, how many times more they prefer it than their own average offer,
 * and how keen they are on it. For the owner's own offer (`own`), x is against everyone instead, as its lead is
 * (keenestOn). Null when fewer than two offers' answers are saved here.
 */
export function preferenceIn({
  folder,
  scan,
  idea,
  country,
  own = false,
}: {
  folder: string;
  scan: Scan;
  idea: string;
  country: Country;
  own?: boolean;
}): Preference | null {
  const dir = scansDir(folder),
    room = roomFor(country, workScan(scan)),
    N = room.N;
  const ideas = (scan.ideas ?? [])
    .map((i) => ({ key: keyOf(i.key), answers: savedAnswers(dir, scan, keyOf(i.key), country) }))
    .filter((i): i is { key: string; answers: Map<string, number> } => i.answers !== null);
  if (ideas.length < 2 || !ideas.some((i) => i.key === idea)) return null;
  const scored: ScoredIdea[] = ideas.map((i) => ({ key: i.key, ...scoresOf(room, i.answers) }));
  const general = new Float64Array(N);
  for (const i of scored) for (let p = 0; p < N; p++) general[p] += i.l[p] / scored.length;
  const all = general.reduce((a, b) => a + b, 0) / N,
    mine = scored.find((i) => i.key === idea);
  if (!mine) return null; // never: ideas holds this one (above)
  const mean = mine.l.reduce((a, b) => a + b, 0) / N;
  const x = Float64Array.from(mine.l, (l, p) => l - mean - (own ? 0 : general[p] - all));
  return {
    room,
    N,
    mine,
    lean: (list: number[]) => Math.exp(list.reduce((a, p) => a + x[p], 0) / list.length),
    keen: (list: number[]) => list.reduce((a, p) => a + mine.p[p], 0) / list.length,
    members: (among: string) => {
      const conditions = checked(country, among),
        list: number[] = [];
      room.people.forEach((row, p) => {
        if (conditions.every((c) => c.test(row))) list.push(p);
      });
      return list;
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// What a lead (explore_next) and a segment (segments, segment_add) print alike

/** A group's size where the owner sells (`where`), from its share of all adults that is there (`local`: localShare). */
export const sizeThere = (local: number, where: Place, country: Country): string =>
  `${one(local / where.share)} in every 100 adults there, about ${people_(local, country)} (counted)`;

/**
 * A group's size, counted, as { local, line }: the line gives it nationwide, and where the owner sells when that is one
 * place (`where`), and says when it counts adults by their work; `local` is localShare's.
 */
export function sizeOf(
  among: string,
  share: number,
  where: Place | null,
  country: Country,
): { local: number | null; line: string } {
  const local = localShare(among, where, country);
  const there = where && local !== null ? `; in ${where.text}: ${sizeThere(local, where, country)}` : "";
  return {
    local,
    line: `size: ${one(share)} in every 100 adults nationwide, about ${people_(share, country)} (counted)${there}${roleIn(among) ? "; adults by their work, not businesses" : ""}`,
  };
}

/**
 * A group whose customers are businesses, not adults (sold to businesses, or cut by a role at work), as { why, against }:
 * why it is not set against adults, and what its paying customers are set against instead, where the owner sells
 * (`where`, the place's words) or in their area. Null for any other group.
 */
export function firmsInstead(
  group: SavedOffer & { among?: string | null },
  where: string | null | undefined,
  country: Country,
): Firms | null {
  const sold = soldToOrganisations(group);
  if (!sold && !roleIn(group.among)) return null;
  const counts = country === "uk" ? "ONS UK Business Counts" : "Census Bureau County Business Patterns";
  const place = where ? `in ${where}` : "in the owner's area";
  return {
    why: sold ? "sold to businesses" : "a group cut by its work",
    against: [
      `against a count of that kind of business ${place}, not against this group of adults:`,
      "firms counted with people (unit firms) by their size, sector, industry and place,",
      `or a published count (sourced: ${counts}, opened with source_check)`,
    ].join(" "),
  };
}

/** A segment's rivals, each written by `each` and joined by `sep`; or none found, with what was searched; or "-". */
export function rivalsText(segment: Segment | null, each: (rival: Rival) => string, sep: string): string {
  if (segment?.rivals.length) return segment.rivals.map(each).join(sep);
  return segment?.rivals_none ? `none found (${segment.rivals_none})` : "-";
}

/**
 * What a lead or a segment still lacks, as "missing: ..." text, or null when it lacks nothing: the caller's `lacks`
 * (false where it has it), then rivals not looked up.
 */
export function missingOf(segment: Segment | null, lacks: (string | false)[]): string | null {
  const list = [...lacks, segment && !lookedUp(segment) && "rivals not looked up"].filter(Boolean);
  return list.length ? `missing: ${list.join("; ")}` : null;
}

/** The product's track record on what its scans said: the outcomes set against a scan's view (scripts/outcome.ts). */
export const scanRecord = (product: Product): ReturnType<typeof trackRecord> =>
  trackRecord(product.outcomes.filter((o) => o.claim.startsWith("scan") || o.claim === "segment_customers"));
