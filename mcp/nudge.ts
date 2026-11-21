// The next step, after every tool's answer. An agent told only what it asked tends to stop after one step, so each
// answer ends with one move that digs further, named as a call ("Next: <tool> <inputs>" and why), built from what this
// answer meant (its records: scripts/log.ts) and what nxk.json holds, never from its text: in research, the move
// explore_next would name (explorer.ts planOf); after a count, what marks the group out; after that, a split by it;
// after an option scan, the groups at both ends of the fact where the versions differ most, and the same split inside
// a group read. The model may take it or not.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { LogRecord, RecordOf } from "../scripts/log.ts";
import { loadMap, shareOf, type Country, type PeopleMap } from "../scripts/population.ts";
import { findProduct, readProduct, studyOf } from "../scripts/product.ts";
import { logOdds } from "../scripts/scan-answers.ts";
import type { OptionsScanArgs, PeopleArgs } from "./build.ts";
import { call, planOf } from "./explorer.ts";

/** A fact to split a group by, with the codes at its two ends. */
export interface FactEnds {
  field: string;
  low: string;
  high: string;
}

/** The arguments a nudge reads beside the folder: those of people and options_scan, the tools whose groups it splits. */
export type NudgeArgs = Partial<PeopleArgs & OptionsScanArgs>;

/** An answer, as nudgeFor reads it: the tool, what it was given and what it meant, its folder, and the country. */
export interface Answer {
  tool: string;
  args?: NudgeArgs;
  records?: LogRecord[];
  folder: string;
  country?: Country | null;
}

// The fact that matters most in each option scan's last full reading, by folder and label: a group read then splits by
// it when the saved answers cannot say where the versions differ.
const topFact = new Map<string, FactEnds>();
const mapOf = (country: string | null | undefined): PeopleMap | null =>
  country && existsSync(new URL(`../maps/${country}.json`, import.meta.url)) ? loadMap(country) : null;

/**
 * Where an option scan's versions differ most, from its saved answers: the listed fact (held by 3 in 100 adults or
 * more at both ends) whose values move one version against another the furthest, in log-odds, leaving out `skip`.
 * Returns { field, low, high } (low: where the first version of the pair does worst against the second), or null with
 * fewer than two versions or no fact that moves them apart by `min`. After a group is read, the nudge splits it by this
 * fact, which asks whether the best version holds inside the group; a profile of the group would not say.
 */
export function versionsApart(
  folder: string,
  label: string | undefined,
  country: string | null | undefined,
  skip: string[] = [],
  { min = 0.5 }: { min?: number } = {},
): FactEnds | null {
  const dir = join(folder, ".nxk", "scans", "options", String(label ?? ""));
  if (!label || !existsSync(dir)) return null;
  const versions = readdirSync(dir)
    .filter((f) => /^scan-.+\.jsonl$/.test(f))
    .sort()
    .map((f) => {
      const answers = new Map<string, number>();
      for (const line of readFileSync(join(dir, f), "utf8").split("\n")) {
        try {
          // A saved answer: the group it is for ("path=code") and the probability given.
          const a: { id?: string; p?: unknown } | null = JSON.parse(line);
          if (a?.id && typeof a.p === "number") answers.set(a.id, a.p);
        } catch {
          /* a torn line */
        }
      }
      return answers;
    });
  if (versions.length < 2) return null;
  let best: (FactEnds & { spread: number }) | null = null;
  for (const field of mapOf(country)?.fields ?? []) {
    if (!field.values || skip.includes(field.name) || skip.includes(field.path)) continue;
    // The values held by 3 in 100 adults or more that every version has an answer for, with each version's answer.
    const held = field.values
      .filter((v) => (shareOf(v.share) ?? 0) >= 0.03)
      .map((v) => ({ code: String(v.code), p: versions.map((m) => m.get(`${field.path}=${v.code}`)) }))
      .filter((v): v is { code: string; p: number[] } => v.p.every((p) => p !== undefined));
    if (held.length < 2) continue;
    for (let a = 0; a < versions.length; a++)
      for (let b = a + 1; b < versions.length; b++) {
        const gaps = held
          .map((v) => ({ code: v.code, d: logOdds(v.p[a]) - logOdds(v.p[b]) }))
          .sort((x, y) => x.d - y.d);
        const low = gaps[0],
          high = gaps[gaps.length - 1];
        const spread = high.d - low.d;
        if (spread >= min && (!best || spread > best.spread))
          best = { field: field.name, low: low.code, high: high.code, spread };
      }
  }
  return best && { field: best.field, low: best.low, high: best.high };
}
const first = (text: string) => String(text).split(/(?<=\.)\s/)[0];
const inputs = (o: Record<string, unknown>) =>
  JSON.stringify(Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "")));
const groupsOf = (who: string | undefined) =>
  String(who ?? "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
const fieldsIn = (group: string) =>
  groupsOf(group)
    .flatMap((g) => g.split(","))
    .map((c) => c.split("=")[0].trim())
    .filter(Boolean);

const ofType = <T extends LogRecord["type"]>(records: LogRecord[], type: T): RecordOf<T>[] =>
  records.filter((r): r is RecordOf<T> => r.type === type);

/**
 * The fact that matters most in an option scan's full reading, as scan.ts recorded it: { field, low, high }, the first
 * whose two ends are each one word (a condition can be written with them), or null when that one is a range of numbers.
 */
export function topOf(records: LogRecord[]): FactEnds | null {
  const top = ofType(records, "fact").find((f) => !/\s/.test(f.low) && !/\s/.test(f.high));
  return top && !/^\d/.test(top.low) ? { field: top.field, low: top.low, high: top.high } : null;
}

/** The facts that mark a group out most in a profile (people.ts's marked records), widest gap first, leaving out `skip`. */
export function markedFields(records: LogRecord[], skip: string[] = []): string[] {
  const ranked = ofType(records, "marked").sort((a, b) => b.gap - a.gap);
  return [...new Set(ranked.map((r) => r.field))].filter(
    (f) => !skip.includes(f) && !/^(?:life_stage|relationship_history_context|purchasing_role)/.test(f),
  );
}

/** Who makes a move of each kind, when it is not the session alone. */
const WHOSE: Partial<Record<string, string>> = {
  owner: " (the owner's to answer: put it to them)",
  paid: " (paid, within the owner's budget)",
};

/**
 * While research is open, the move explore_next would name, as a nudge; else null. Before its first scan there is
 * none: research_start and guide topic research say what to scan.
 */
function explorerMove(folder: string, country: Country | null | undefined): string[] | null {
  const file = findProduct(folder);
  if (!file || !country) return null;
  const product = readProduct(file);
  if (!studyOf(product)) return null;
  const { move } = planOf(product, folder, country);
  if (move.kind === "stop" && move.step === "start") return null;
  return [
    `Next: ${call(move)}${WHOSE[move.kind] ?? ""}. ${first(move.why)}`,
    "explore_next lays out every lead and names each move after this one.",
  ];
}

/**
 * One answer's nudge lines: the next move. Empty when there is none, or when the answer named its own next move or left
 * a scan running. `records` are what the tool meant as it printed.
 */
export function nudgeFor({ tool, args = {}, records = [], folder, country }: Answer): string[] {
  if (ofType(records, "next").length || ofType(records, "running").length) return [];
  const out: string[] = [];
  const discovery = [
    "ideas_scan",
    "segment_add",
    "segment_rival",
    "segments",
    "corner_split",
    "outcome_record",
    "owner_answer",
  ].includes(tool)
    ? explorerMove(folder, country)
    : null;
  if (discovery) out.push(...discovery);
  else if (tool === "people") {
    const groups = groupsOf(args.who),
      action = args.action;
    if (action === "find" || action === "values" || action === "fields")
      out.push(
        `Next: people ${inputs({ action: "count", who: "<the groups to compare, separated by ;>" })}. Size the groups the question turns on side by side, before anything is put to them.`,
      );
    else if ((action === "count" || action === "reach" || action === "cast") && groups.length)
      out.push(
        [
          `Next: people ${inputs({ action: "profile", who: groups[0], among: args.among })}.`,
          "What marks this group out from everyone: the facts to split it by,",
          "before treating it as one kind of person.",
        ].join(" "),
      );
    else if (action === "profile" && groups.length) {
      const by = markedFields(records, fieldsIn(groups[0])).slice(0, 2);
      if (by.length)
        out.push(
          `Next: people ${inputs({ action: "split", who: groups[0], by, among: args.among })}. The group broken down by what marks it out most: whether one part of it carries the difference.`,
        );
    } else if (action === "split" && groups.length)
      out.push(
        `Next: people ${inputs({ action: "count", who: `${groups[0]}; <the part of it that stood out>` })}. The part that stood out against the whole, with how many real adults it is.`,
      );
  } else if (tool === "options_scan") {
    const key = `${folder}\0${args.label}`,
      groups = groupsOf(args.who);
    // With two versions or more, the split that matters to the choice is where the versions differ most; with one, the
    // fact that moves the answer most.
    if (!groups.length) {
      const apart = versionsApart(folder, args.label, country);
      const top = topOf(records);
      if (top) topFact.set(key, top);
      if (apart) {
        const who = `${apart.field}=${apart.low}; ${apart.field}=${apart.high}`;
        out.push(
          [
            `Next: options_scan ${inputs({ label: args.label, read_only: true, who })}.`,
            `Each version at both ends of ${apart.field}, where the versions differ most in the saved answers:`,
            "whether the best version changes with it. Read from the saved answers, nothing sent.",
          ].join(" "),
        );
      } else if (top) {
        const who = `${top.field}=${top.low}; ${top.field}=${top.high}`;
        out.push(
          [
            `Next: options_scan ${inputs({ label: args.label, read_only: true, who })}.`,
            `Each version at both ends of ${top.field}, the fact that matters most:`,
            "the groups read from the saved answers, nothing sent.",
          ].join(" "),
        );
      }
    } else {
      const inside = groups[0],
        skip = fieldsIn(inside);
      const top = versionsApart(folder, args.label, country, skip) ?? topFact.get(key);
      if (top && !skip.includes(top.field)) {
        const who = `${inside},${top.field}=${top.low}; ${inside},${top.field}=${top.high}`;
        out.push(
          [
            `Next: options_scan ${inputs({ label: args.label, read_only: true, who })}.`,
            `Whether the best version holds inside the first group at both ends of ${top.field},`,
            "where the versions differ most: a group is rarely one kind of person.",
          ].join(" "),
        );
      } else
        out.push(
          `Next: people ${inputs({ action: "profile", who: inside })}. What marks the first group out, to split its reading by (the fact must be one the scan asked about).`,
        );
    }
  } else if (tool === "terms")
    out.push(
      [
        "Next: suggest with each of the owner's terms that may shut out a big group:",
        "their option as asked and what you could offer if they say yes (suggestions: [] when none does).",
        "Then the note, opportunity first (guide topic second-look).",
      ].join(" "),
    );
  else if (tool === "sweep")
    out.push(
      [
        "Next: ask of each line, could they be customers too, and what would it take?",
        "Only if a term the owner set may shut out a big group: terms, then suggest.",
        "Then the note, and note_check (guide topic second-look).",
      ].join(" "),
    );
  else if (tool === "suggest")
    out.push(
      "Next: note_check, once you have built what was asked with the owner's terms as given: the reply as you will send it, and every file it delivers.",
    );
  return out;
}
