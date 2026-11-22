// Research as tools: versions put to the population, the corners kept as segments, rivals checked. The findings are
// reported side by side; nxk never chooses for the owner: research returns findings, not choices.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  addScan,
  addSegment,
  groupOf,
  scansDir,
  studyOf,
  today,
  updateSegment,
  type Intent,
  type KeenBy,
  type Product,
  type ScanCorner,
  type ScanGap,
  type ScanIdea,
  type Segment,
} from "../scripts/product.ts";
import { CATEGORIES, roleIn } from "../scripts/businesses.ts";
import type { Corner, EmptyCorner, KeenCorner } from "../scripts/corners.ts";
import { atWork, ideasOf, undeclared, undeclaredNote, wordsOf } from "../scripts/discover.ts";
import { plural } from "../scripts/format.ts";
import { labelled, said, type Line } from "../scripts/log.ts";
import { pacedIn } from "../scripts/records.ts";
import {
  firmsInstead,
  localShare,
  missingOf,
  preferenceIn,
  rivalsText,
  scanRecord,
  sizeOf,
  sizeThere,
  whereOf,
} from "./explorer.ts";
import {
  ADULTS,
  COUNTRY,
  FOLDER,
  NO_LIMIT,
  background,
  countryOf,
  findScan,
  folderOf,
  kb,
  keenIn,
  keenness,
  keyOf,
  minutesLeft,
  one,
  people_,
  runningScan,
  runScript,
  waitForScan,
  shareOf,
  strengthOf,
  withCountry,
  type NxkTool,
  type ToolArgs,
} from "./common.ts";

// Each tool's arguments, as its inputSchema gives them.

interface IdeasDealArgs extends ToolArgs {
  area: string;
  n?: number;
  seed?: number;
  for?: string[];
}

interface IdeasScanArgs extends ToolArgs {
  label?: string;
  ideas?: ScanIdea[];
  max_usd?: number;
  read_only?: boolean;
}

interface SegmentAddArgs extends ToolArgs {
  label: string;
  among?: string;
  from_scan?: string;
  idea?: string;
  why?: string;
}

interface SegmentRivalArgs extends ToolArgs {
  segment: string;
  name?: string;
  offer?: string;
  link?: string;
  words?: string;
  none_found?: string;
}

/** segments: the owner's figures, to set the customers each segment needs against its size. */
interface SegmentsArgs extends ToolArgs {
  price?: number;
  margin?: number;
  target?: number;
  cac?: number;
  churn?: number;
}

/**
 * discover.ts's reading as it writes it (--json), as far as ideas_scan reads it: each corner without its people, with
 * its share of all adults; each offer's own corner, with its keenest people and, for the owner's own, how keen by age
 * and gender; and the big groups none serves.
 */
interface DiscoverResult {
  model: string;
  room_of: string;
  likeness: number;
  ideas: (Omit<KeenCorner, "list"> & {
    key: string;
    keenest?: Omit<KeenCorner, "list">;
    own?: boolean;
    by?: KeenBy[];
  })[];
  nothing_for: Omit<EmptyCorner, "list">[];
  /** Absent from readings written before it was read. */
  left_out?: Omit<EmptyCorner, "list">[];
}

/** The owner's results about a segment's group (or recorded against the segment), one line each. */
function measuredFor(product: Product, segment: Segment): string[] {
  const group = groupOf(segment.among),
    out: string[] = [];
  for (const o of product.outcomes) {
    const arm = o.arms.find((a) => a.among && groupOf(a.among) === group);
    if (!arm && o.about?.segment !== segment.id) continue;
    const mine = o.comparisons.filter((c) => !arm || c.a === arm.name || c.b === arm.name);
    const seen = arm
      ? o.kind === "customers"
        ? `${arm.took} of ${o.total} customers`
        : `${arm.took} of ${arm.shown} took it`
      : "";
    out.push(
      `[${o.id}] ${o.what}${seen ? `: ${seen}` : ""}; against what nxk said: ${mine.map((c) => c.verdict).join(", ") || "nothing compared"}`,
    );
  }
  return out;
}

/** The track record as one line for the top of a scan, or null when nothing has been compared. */
function recordLine(product: Product): string | null {
  const record = scanRecord(product);
  return record.lines.length
    ? `Measured for this product so far, against what earlier scans said: ${record.lines.join("; ")}. Read this scan with that in mind.\n`
    : null;
}

export const DISCOVERY: NxkTool[] = [
  {
    name: "ideas_deal",
    needsCountry: true,
    title: "Deal combinations for new ideas",
    annotations: { readOnlyHint: true },
    description: [
      "Asked for ideas, a model writes them for one kind of person:",
      "confident, well-off and online (twenty ideas from a plain request were wanted by the same people).",
      "This deals out, for an area, who it is for (groups counted on the generated people), who pays,",
      "how it is charged, how it reaches them, who does the work and what starts it, so that every option turns up.",
      "Write each combination that makes sense as an offer a person would meet, with its price,",
      "and put them to the population with ideas_scan.",
      "for: groups to deal for, such as the ones a scan found nothing serves (retired, carers).",
    ].join(" "),
    inputSchema: {
      type: "object",
      properties: {
        folder: FOLDER,
        country: COUNTRY,
        area: { type: "string" },
        n: { type: "integer", description: "How many combinations (default 16)" },
        seed: { type: "integer" },
        for: { type: "array", items: { type: "string" } },
      },
      required: ["area"],
    },
    run: async (a: IdeasDealArgs) => {
      const folder = folderOf(a);
      return runScript(
        "deal.ts",
        withCountry(
          [
            `--area=${a.area}`,
            ...(a.n ? [`--n=${a.n}`] : []),
            ...(a.seed ? [`--seed=${a.seed}`] : []),
            ...(a.for?.length ? [`--for=${a.for.join(",")}`] : []),
          ],
          folder,
          a.country,
        ),
        folder,
      );
    },
  },
  {
    name: "ideas_scan",
    needsCountry: true,
    title: "Put three or more offers to the population",
    description: [
      "Discovery: who is each offer for?",
      "Puts three or more offers (each as a person would meet it, with its price) to the generated population",
      "through a decision model, and prints who wants the owner's own offer",
      "(own: true: the people keenest on it against everyone, and how keen by age and gender),",
      "each offer's own corner (the people who prefer it most to the others, with its counted size)",
      "and the big groups nobody serves: keener than most on the way they do it now (now: true), and cold on every offer.",
      "Use for a product with no audience (the product beside two or more alternatives),",
      "a rough idea (written three to eight ways), or no product (ideas from ideas_deal).",
      "PAID, on the user's decision-model key: max_usd is required and the cost is printed before anything is sent.",
      "Saved answers are reused, so adding offers sends only the new ones.",
      "The call waits for the scan, up to ten minutes; a longer one carries on in the background, one at a time,",
      "with its offers kept, and calling again with its label alone waits for it again and then reads it",
      "(sends nothing). Keenness is simulated: it gives who and where, never how many would buy.",
    ].join(" "),
    inputSchema: {
      type: "object",
      properties: {
        folder: FOLDER,
        label: { type: "string", description: "A short name for this scan, used for its files" },
        ideas: {
          type: "array",
          minItems: 3,
          items: {
            type: "object",
            properties: {
              key: { type: "string" },
              offer: { type: "string" },
              fields: { type: "array", items: { type: "string" } },
              buying_category: {
                type: "string",
                enum: ["household", ...CATEGORIES],
                description: [
                  'Who buys it. "household": a person, for themselves or their home; it is asked where people live.',
                  "For an offer sold to organisations (businesses, property firms, schools, practices):",
                  "what they buy it as; it is then asked at work, from each person's part in buying that for their",
                  "organisation, and read by who signs off, approves, recommends and uses it.",
                ].join(" "),
              },
              own: {
                type: "boolean",
                description: [
                  "true for the owner's own offer, as they described it.",
                  "Its lead is who wants it (the people keenest on it against everyone,",
                  "and how keen by age and gender), not the group that prefers it to the versions you wrote.",
                ].join(" "),
              },
              now: {
                type: "boolean",
                description: [
                  "true for the way people do it now without buying an offer: by hand, a spreadsheet, a free template,",
                  "asking someone. Never going without: people who would go without do not want the job done.",
                  "Who nobody serves is read from it (people keener than most on doing it themselves, whom every offer",
                  "misses); with no version marked now, it is not read.",
                ].join(" "),
              },
            },
            required: ["key", "offer", "buying_category"],
          },
        },
        max_usd: { type: "number", description: "The most this scan may spend, in US dollars" },
        read_only: { type: "boolean", description: "Print again from saved answers; send nothing" },
        country: COUNTRY,
      },
      required: [],
    },
    annotations: { openWorldHint: true },
    run: async (args: IdeasScanArgs) => {
      const folder = folderOf(args),
        { product, save } = kb(folder);
      const country = countryOf(args, product);
      const label = String(args.label || `scan${product.discovery.scans.length + 1}`).replace(/[^a-z0-9_-]+/gi, "-");
      const dir = scansDir(folder);
      mkdirSync(dir, { recursive: true });
      // Every scan of a country reads and adds to one set of saved answers, so a later scan sends only offers not
      // asked before. An offer is known by its key: a key scanned before under other words would reuse answers to
      // those words, so it is refused.
      const ideasFile = join(dir, `ideas-${country}.json`),
        offersFile = join(dir, `offers-${country}.json`),
        out = join(dir, `${label}.result.json`);
      // A paid scan runs one at a time. A call while it runs sends nothing and waits for it (up to ten minutes); the
      // first call after it has finished reads its answers.
      let run = runningScan(dir);
      if (run?.alive) run = await waitForScan(dir);
      if (run?.alive) {
        const left = minutesLeft(run);
        const which = run.label === label ? `This scan (${label})` : `Another scan (${run.label})`,
          paced = run.minutes ? `, paced to about ${run.minutes} minutes` : "",
          more = left ? `, so about ${left} more` : "";
        return {
          text: [
            `${which} is still running in the background: started ${run.ago} minutes ago${paced}${more}.`,
            "Nothing new was sent: one scan runs at a time.",
            `Calling ideas_scan with label "${run.label}" waits for it (up to ten minutes a call) and then reads it,`,
            "sending nothing: there is no need to sleep or to check its files.",
            "If it has a while to go, tell the owner it is running and when to come back.",
          ].join(" "),
          records: [{ type: "running" }],
        };
      }
      // A finished scan not yet read is read first: starting another would drop its record unread.
      if (run && run.label !== label)
        throw new Error(
          `The scan ${run.label} has finished and is not read yet: read it first with ideas_scan and label "${run.label}" alone (it sends nothing), then start ${label}.`,
        );
      // A finished background scan is read with its own offers (and the fields each was asked about), kept when it began.
      const finished = run?.label === label;
      const given = args.ideas?.length ? args.ideas : finished ? run?.ideas : null;
      if (!given || given.length < 3)
        throw new Error(
          "Give three or more offers in ideas, each with a key and the offer as a person would meet it, with its price.",
        );
      if (!finished && !args.read_only && !(Number(args.max_usd) > 0)) throw new Error(NO_LIMIT);
      const ideas = ideasOf(given); // keys as discover.ts writes them: "free-ads" is free_ads
      if (run) rmSync(run.file, { force: true });
      // The words each offer was scanned with, by key.
      const known: Record<string, string> = existsSync(offersFile) ? JSON.parse(readFileSync(offersFile, "utf8")) : {};
      // An offer asked at work and the same offer asked at home are different questions, with different answers.
      const changed = ideas.filter((i) => known[i.key] !== undefined && known[i.key] !== wordsOf(i));
      if (changed.length) {
        const keys = changed.map((i) => i.key).join(", ");
        throw new Error(
          [
            `Nothing was sent. ${keys} ${plural(changed.length, "was", "were")} scanned before with other words,`,
            "and the saved answers are to those words. Give a changed offer a new key; to read an earlier scan again,",
            "give its offers as they were, each with the buying_category it had.",
          ].join(" "),
        );
      }
      const reading = args.read_only || finished;
      const unsure = reading ? [] : undeclared(ideas);
      if (unsure.length) throw new Error(undeclaredNote(unsure));
      writeFileSync(ideasFile, `${JSON.stringify(ideas, null, 1)}\n`);
      // Research about one place reads the scan among the people there (scripts/discover.ts --among).
      const place = studyOf(product)?.where ?? product.where ?? null;
      const argv = [
        dir,
        ideasFile,
        `--country=${country}`,
        `--json=${out}`,
        ...(place ? [`--among=${place.among}`] : []),
        ...(reading ? ["--read"] : [`--max-usd=${Number(args.max_usd)}`]),
      ];
      const ran = reading
        ? await runScript("discover.ts", argv, folder)
        : await background("discover.ts", argv, folder, join(dir, `${label}.run`), {
            about: { label, ideas, study: studyOf(product)?.id ?? null },
          });
      if (ran.running) {
        const minutes = pacedIn(ran.records);
        const paced = minutes
          ? `: paced to about ${minutes} ${plural(minutes, "minute")}, longer than one call waits`
          : "";
        return {
          records: [...ran.records, { type: "running" }],
          text: [
            `${ran.text}\n\nRunning in the background${paced}.`,
            "It keeps going if this session ends, and its answers are saved as they come.",
            `Calling ideas_scan again with label "${label}" waits for it (up to ten minutes a call)`,
            "and then reads the answers, sending nothing: there is no need to sleep or to check its files.",
            "Tell the owner it is running and when to come back, and start no other scan.",
          ].join(" "),
        };
      }
      // A background scan whose process was stopped (the computer slept, or it was ended) never said what it spent (no
      // spent record). Its record is gone once read, so the offers are given back for a rescan.
      if (run && finished && ran.error) {
        const stopped = run.records.some((r) => r.type === "spent")
          ? ""
          : [
              "\nIt ended before it finished, without saying what it spent:",
              "its process was stopped (the computer slept, or it was ended). What it answered is saved.\n",
            ].join(" ");
        const offers = `Its offers, to scan again with max_usd (only what is missing is sent): ${JSON.stringify(given)}`;
        ran.text = `The background scan said:\n${run.log.trim()}\n${stopped}\n${ran.text}\n\n${offers}`;
      }
      const answered = ideas.filter((i) => existsSync(join(dir, `ideas-${country}.spec`, `scan-${i.key}.jsonl`)));
      if (answered.length)
        writeFileSync(
          offersFile,
          `${JSON.stringify({ ...known, ...Object.fromEntries(answered.map((i) => [i.key, wordsOf(i)])) }, null, 1)}\n`,
        );
      if (ran.error || !existsSync(out)) return ran;
      const result: DiscoverResult = JSON.parse(readFileSync(out, "utf8"));
      // A scan whose every offer was asked at work is read among the people in work, and one for a place among the
      // people there: its groups say so, so that a group kept from it is counted among them too.
      const inWork = result.room_of.startsWith("people in work");
      const roomed = result.room_of !== "all adults";
      const placed = place && roomed ? place : null;
      const among = (corner: Pick<Corner, "facts">) =>
        [
          ...corner.facts.map((f) => `${f.field}=${f.code}`),
          ...(inWork ? ["organisation_size!=not_in_employment"] : []),
          ...(placed ? [placed.among] : []),
        ].join(",");
      const groupLabel = (corner: Pick<Corner, "facts">) =>
        `${corner.facts.map((f) => f.label).join(" + ")}${inWork ? ", in work" : ""}${placed ? `, in ${placed.text}` : ""}`;
      // The owner's own offer is led by who wants it (its keenest people against everyone); a version written beside it
      // by its corner, the people who prefer it to the other versions.
      const summary = result.ideas.map((idea): ScanCorner => {
        const lead = idea.own && idea.keenest ? idea.keenest : idea;
        return {
          key: idea.key,
          among: among(lead),
          label: groupLabel(lead),
          share: lead.share,
          odds: lead.odds,
          strength: strengthOf(lead.odds),
          keen: lead.keen,
          room: lead.room,
          ...(idea.own ? { own: true, by: idea.by ?? [] } : {}),
          ...(roomed ? { room_of: result.room_of } : {}),
        };
      });
      const gapOf = (c: Omit<EmptyCorner, "list">): ScanGap => ({
        among: among(c),
        label: groupLabel(c),
        share: c.share,
        best: c.best,
        now: c.now,
      });
      const nothing = result.nothing_for.map(gapOf),
        left = (result.left_out ?? []).map(gapOf);
      // A scan belongs to the research question it was started for, which may not be the one open now.
      const study = (finished ? run?.study : undefined) ?? studyOf(product)?.id ?? null;
      const { product: next, scan } = addScan(product, {
        kind: "ideas",
        label,
        ...(study ? { study } : {}),
        model: result.model,
        ideas: ideas.map((i) => ({
          key: i.key,
          offer: i.offer,
          ...(i.fields?.length ? { fields: i.fields } : {}),
          ...(i.buying_category ? { buying_category: i.buying_category } : {}),
          ...(i.own ? { own: true } : {}),
          ...(i.now ? { now: true } : {}),
        })),
        max_usd: args.max_usd,
        likeness: result.likeness,
        corners: summary,
        nothing_for: nothing,
        ...(left.length ? { left_out: left } : {}),
      });
      save({ ...next, country });
      return {
        records: ran.records,
        text: [
          `${recordLine(next) ?? ""}${ran.text}\n\nSaved in nxk.json as ${scan.id}.`,
          `Keep a corner as a candidate segment with segment_add (from_scan "${scan.id}", idea "<key>"),`,
          'or a group none serves with idea "nothing:<n>" (counting from 1).',
        ].join(" "),
      };
    },
  },
  {
    name: "segment_add",
    logs: true,
    needsCountry: true,
    title: "Keep a candidate segment",
    description: [
      "Keep a group as a candidate audience (a segment):",
      "from a scan's corner (from_scan, the scan's id or label, and idea,",
      "or idea 'nothing:<n>' for a group none serves) or written as conditions (among).",
      "Its size is counted on the generated people.",
      "label: how the owner would say it ('retired homeowners in the South West').",
    ].join(" "),
    inputSchema: {
      type: "object",
      properties: {
        folder: FOLDER,
        label: { type: "string" },
        among: { type: "string" },
        from_scan: { type: "string" },
        idea: { type: "string" },
        why: { type: "string" },
        country: COUNTRY,
      },
      required: ["label"],
    },
    run: async (args: SegmentAddArgs) => {
      const folder = folderOf(args),
        { product, save } = kb(folder);
      const country = countryOf(args, product);
      let among = args.among,
        intent: Intent | null = null,
        offer: string | null = null,
        at_work: string | null = null;
      if (args.from_scan) {
        // A scan in the background is saved once it is read.
        const scan = findScan(product, args.from_scan, (ref) => {
          const run = runningScan(scansDir(folder));
          if (run?.label !== ref) return null;
          const state = run.alive ? "is still running" : "has finished but is not read yet";
          return [
            `The scan ${run.label} ${state}: read it with ideas_scan and label "${run.label}" alone (it sends nothing),`,
            "then keep a corner from it.",
          ].join(" ");
        });
        const nothing = /^nothing:(\d+)$/.exec(String(args.idea ?? "").trim());
        const key = nothing || !args.idea ? null : keyOf(args.idea);
        const noCorner = () =>
          new Error(
            `No corner "${args.idea}" in ${scan.id}: ${scan.corners.map((c) => c.key).join(", ")}, or nothing:1 to nothing:${scan.nothing_for.length}`,
          );
        if (nothing) {
          // A group none of the offers serves.
          const gap = scan.nothing_for[Number(nothing[1]) - 1];
          if (!gap) throw noCorner();
          among = among || gap.among;
          intent = { scan: scan.id, none_serves: true, best: gap.best };
        } else {
          const corner = scan.corners.find((c) => c.key === key);
          if (!corner) throw noCorner();
          // A group the owner names (among) is read whatever the corner: they asked about that group, not about the corner.
          if (!args.among && strengthOf(corner.odds) === "none")
            throw new Error(
              [
                `${corner.key} has no corner of its own in ${scan.id}:`,
                `the group that prefers it most does so only x${corner.odds.toFixed(2)} over their average idea`,
                "(x1.15 is faint, x1.5 a lead to test, x2 strong). Write it differently and scan again,",
                "or keep a group you name with among.",
              ].join(" "),
            );
          among = among || corner.among;
          intent = {
            scan: scan.id,
            idea: corner.key,
            odds: corner.odds,
            keen: corner.keen,
            room: corner.room,
            ...(corner.room_of ? { room_of: corner.room_of } : {}),
          };
          if (groupOf(among) !== groupOf(corner.among)) {
            // A group other than the corner (a part of it, say) has its own keenness, read from the saved answers the
            // same way; without them, none is claimed.
            const pref = preferenceIn({ folder, scan, idea: corner.key, country }),
              list = pref?.members(among);
            intent =
              pref && list?.length
                ? {
                    scan: scan.id,
                    idea: corner.key,
                    odds: pref.lean(list),
                    keen: pref.keen(list),
                    room: pref.mine.mean,
                    ...(pref.room.scale < 1 ? { room_of: pref.room.whom } : {}),
                  }
                : { scan: scan.id, idea: corner.key };
          }
          const scanned = scan.ideas.find((i) => keyOf(i.key) === corner.key);
          offer = scanned?.offer ?? null;
          if (scanned && atWork(scanned)) at_work = scanned.buying_category;
        }
      }
      if (!among) throw new Error("Give among (conditions) or from_scan with idea");
      const share = shareOf(country, among);
      const {
        product: next,
        segment,
        was,
      } = addSegment(product, {
        label: args.label,
        among,
        share,
        people: Math.round(share * ADULTS[country]),
        intent,
        ...(offer ? { offer } : {}),
        ...(at_work ? { at_work } : {}),
        ...(args.why ? { why: args.why } : {}),
      });
      save({ ...next, country });
      // The open question's place first (research_start), then the product's.
      const where = whereOf(next);
      const there = where
        ? ` In ${where.text}, where the owner sells: ${sizeThere(localShare(among, where, country), where, country)}.`
        : "";
      const same = was ? `The same group was kept as ${was.id} ("${was.label}"); updated. ` : "";
      const size = `${one(share)} in every 100 ${country.toUpperCase()} adults nationwide (counted)`;
      const work = roleIn(among)
        ? [
            " Adults by their work, not businesses: for a number of businesses, count firms with people (unit firms)",
            "by their size, sector, industry and place, or give a published count (sourced).",
          ].join(" ")
        : "";
      // Its size is counted; how keen it is, from the scan, simulated.
      const keen = keenIn(intent) ? ` From ${intent.scan}: ${keenness(intent)}.` : "";
      return said([
        labelled(
          "counted",
          [
            `${same}Kept ${segment.id}: ${args.label} (${among.trim()}):`,
            `${size}, about ${people_(share, country)}.${there}${work}${keen}`,
            "Look for rivals serving it with segment_rival.",
          ].join(" "),
          keenIn(intent) ? { simulated: [keenness(intent)] } : null,
        ),
      ]);
    },
  },
  {
    name: "segment_rival",
    title: "Record a rival serving a segment",
    description: [
      "Record a business already serving a segment. The link is opened and the words you copied from the page",
      "(with any figure) must be on it, or nothing is recorded.",
      "If you searched and found none, give none_found with what you searched.",
      "Several rivals per segment are expected.",
    ].join(" "),
    inputSchema: {
      type: "object",
      properties: {
        folder: FOLDER,
        segment: { type: "string" },
        name: { type: "string" },
        offer: { type: "string", description: "What they sell to this segment, in one line" },
        link: { type: "string" },
        words: { type: "string", description: "Words copied from the page, with any figure" },
        none_found: { type: "string" },
      },
      required: ["segment"],
    },
    annotations: { openWorldHint: true },
    run: async (args: SegmentRivalArgs) => {
      const folder = folderOf(args),
        { product, save } = kb(folder);
      if (args.none_found) {
        save(updateSegment(product, args.segment, () => ({ rivals_none: args.none_found })));
        return { text: `Recorded for ${args.segment}: no rival found (${args.none_found}).` };
      }
      const { name, link, words } = args;
      if (!name || !link || !words)
        throw new Error("A rival needs name, link and words copied from the page; or give none_found");
      const opened = await runScript("source.ts", ["--", link, words], folder);
      if (opened.error)
        return { text: `Not recorded: the words were not found on the page.\n${opened.text}`, error: true };
      save(
        updateSegment(product, args.segment, (s) => ({
          rivals: [
            ...s.rivals.filter((r) => r.name !== name),
            {
              name,
              offer: args.offer ?? null,
              link,
              words,
              source: "sourced",
              date: today(),
            },
          ],
          rivals_none: null,
        })),
      );
      return { text: `Recorded ${name} as a rival in ${args.segment} (sourced: the words are on the page).` };
    },
  },
  {
    name: "segments",
    logs: true,
    needsCountry: true,
    title: "The candidate segments side by side",
    annotations: { readOnlyHint: true },
    description: [
      "The segments found so far, side by side: size (counted), keenness (simulated, from a scan),",
      "rivals (sourced), and what is still missing for each.",
      "With price, margin and target (and optionally cac and churn),",
      "also how many customers each needs against its size (scripts/sums.ts).",
      "There is no single score, and nxk never picks one: the research reports them side by side.",
    ].join(" "),
    inputSchema: {
      type: "object",
      properties: {
        folder: FOLDER,
        price: { type: "number" },
        margin: { type: "number", description: "Margin as a percentage" },
        target: { type: "number", description: "Profit a month wanted" },
        cac: { type: "number" },
        churn: { type: "number", description: "Share leaving a month, as a percentage" },
        country: COUNTRY,
      },
    },
    run: async (args: SegmentsArgs) => {
      const folder = folderOf(args),
        { product } = kb(folder);
      const country = countryOf(args, product);
      const segments = product.discovery.segments;
      if (!segments.length) return { text: "No segments yet: keep corners from a scan with segment_add." };
      const where = whereOf(product),
        lines: (string | Line | null)[] = [];
      for (const s of segments) {
        const size = sizeOf(s.among, s.share, where, country),
          firms = firmsInstead(s, where?.text, country);
        lines.push(`[${s.id}] ${s.label} (${s.status})`);
        lines.push(`  who: ${s.among}`);
        lines.push(labelled("counted", `  ${size.line}`));
        // How keen it is, from its scan (simulated). A group none serves has no keenness, nor has one kept when its
        // scan's saved answers could not be read: that is "-", as for a segment never scanned.
        lines.push(
          labelled(
            keenIn(s.intent) ? "simulated" : null,
            `  keenness: ${s.intent?.none_serves ? `no scanned offer serves them (best was ${s.intent.best})` : keenIn(s.intent) ? keenness(s.intent) : "-"}`,
          ),
        );
        lines.push(`  rivals: ${rivalsText(s, (r) => `${r.name}${r.offer ? ` (${r.offer})` : ""} ${r.link}`, "; ")}`);
        for (const line of measuredFor(product, s)) lines.push(labelled("measured", `  measured: ${line}`));
        // Customers who are businesses are not set against adults; a local business's are set against its area.
        if (args.price && args.margin && args.target && firms)
          lines.push(
            `  customers: ${firms.why}, so set the customers needed ${firms.against}. Then sums with that count.`,
          );
        else if (args.price && args.margin && args.target) {
          const unit = [
            `price=${args.price}`,
            `margin=${args.margin}%`,
            `target=${args.target}`,
            ...(args.cac ? [`cac=${args.cac}`] : []),
            ...(args.churn ? [`churn=${args.churn}%`] : []),
            `group=${(100 * (size.local ?? s.share)).toFixed(2)}%`,
            `adults=${ADULTS[country]}`,
          ].join(", ");
          if (where) lines.push(`  set against the group in ${where.text}:`);
          // sums.ts logs these lines in its own run, as computed: here they are its words, indented.
          lines.push(...(await runScript("sums.ts", [`--unit=${unit}`], folder)).text.split("\n").map((l) => `  ${l}`));
        }
        const missing = missingOf(s, [!s.intent && "not scanned (keenness unknown)"]);
        if (missing) lines.push(`  ${missing}`);
      }
      lines.push(
        "",
        [
          "Size is counted on generated people fitted to official statistics;",
          "keenness is a model's view and says who, not how many; rivals are pages opened and checked.",
          "Report them side by side, as findings: nxk never chooses one for the owner.",
        ].join(" "),
      );
      return said(lines);
    },
  },
];
