// What each label means, said once in the reply. A reader who has never met nxk gets nothing from "(counted)": the
// reply says in one short line what each label it uses stands for. nxk writes the line (legendFor), so the agent does
// not invent it, and the check passes on that line or any figure-free line that gives each used label its meaning.
import { plural } from "../format.ts";
import type { ReplyRow } from "../reply.ts";
import type { Check, CheckContext } from "./index.ts";

/** The meaning of each label, in plain words, in the order the line lists them. `counted` names the country's people. */
export const MEANINGS: Record<string, (country: string | null) => string> = {
  given: () => "what you told me",
  counted: (country) =>
    `on 200,000 made-up ${country ? `${country.toUpperCase()} ` : ""}adults that match official statistics, a rough guide`,
  computed: () => "arithmetic on other figures here",
  simulated: () => "from a scan, which says who is more likely to want something, not how many will",
  measured: () => "your own results",
  sourced: () => "published, with the link",
  guess: () => "my estimate, with nothing behind it",
  imagined: () => "written by Claude in a made-up person's voice, from their facts: colour, not evidence",
};

/** The labels a reply's lines use on figures (a lead-in's label counts for the items under it), in the order above. */
export function labelsUsed(ctx: Pick<CheckContext, "rows">): string[] {
  const used = new Set<string>();
  for (const row of ctx.rows) if (row.figures.length || row.worded.length) for (const l of row.labels) used.add(l);
  return Object.keys(MEANINGS).filter((l) => used.has(l));
}

/** The country the reply is about: the last one a tool was run for, else one the reply names, else null. */
export function countryOf(ctx: Pick<CheckContext, "runs" | "text">): string | null {
  const asked = (ctx.runs ?? []).flatMap((run) => (run.args ?? []).map((a) => /^--country=(uk|us)$/i.exec(a)?.[1]));
  const last = asked.findLast(Boolean);
  if (last) return last.toLowerCase();
  const uk = /\b(?:UK|Britain|British|England|Scotland|Wales)\b|£/.test(ctx.text);
  const us = /\b(?:US|USA|American|Americans)\b|\$/.test(ctx.text);
  return uk !== us ? (uk ? "uk" : "us") : null;
}

/** The line to add for these labels, as nxk writes it. */
export const legendFor = (labels: string[], country: string | null): string =>
  labels.map((l) => `${l}: ${MEANINGS[l](country)}`).join("; ");

// A label is given its meaning in nxk's own form (it opens the line, or follows a ";" or ":", and a colon, "means" or
// "is" comes after it; not "(sourced: Publisher, 2026, link)" inside a figure's own line), or, in a session's own
// words, by its being named in quotes or bold in a line of eight words or more ('Figures marked "counted" come from ...').
const defines = (line: string, label: string) => {
  const bare = line.replace(/\([^)]*\)/g, "");
  return (
    new RegExp(
      String.raw`(?:^\s*(?:[-*+]\s+)?(?:\*\*)?|[;:,.]\s*)${label}(?:\*\*)?\s*(?::|=|\u2013|\u2014|-|\bmeans\b|\bis\b)\s*[A-Za-z]+,?(?:\s+\S+){2,}`,
      "i",
    ).test(bare) ||
    (new RegExp(String.raw`["'\u201c\u2018\x60*_]${label}["'\u201d\u2019\x60*_]`, "i").test(bare) &&
      bare.trim().split(/\s+/).length >= 8)
  );
};

/** The reply's lines that give a label its meaning: outside any draft, with no figure of their own. */
export function legendLines(ctx: { lines: string[]; rows?: ReplyRow[] }): Map<number, string[]> {
  const out = new Map<number, string[]>();
  const bare = new Set((ctx.rows ?? []).filter((r) => !r.figures.length && !r.worded.length).map((r) => r.i));
  ctx.lines.forEach((line, i) => {
    if (!bare.has(i)) return;
    for (const label of Object.keys(MEANINGS)) if (defines(line, label)) out.set(i, [...(out.get(i) ?? []), label]);
  });
  return out;
}

export const LEGEND: Check[] = [
  {
    id: "legend",
    kind: "format",
    why: "A reply that labels figures says once, in one short line, what each label it uses means.",
    run(ctx, { fail }) {
      const used = labelsUsed(ctx);
      if (!used.length) return;
      const said = new Set([...legendLines(ctx).values()].flat());
      const missing = used.filter((l) => !said.has(l));
      if (!missing.length) return;
      const mean = plural(missing.length, "it means", "they mean");
      fail(
        `the reply uses ${missing.join(", ")} with no word on what ${mean}, and the reader may not know nxk. Add one line, outside any draft: "${legendFor(missing, countryOf(ctx))}"`,
      );
    },
  },
];
