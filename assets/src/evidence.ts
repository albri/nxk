// The evidence: the three checks against published figures, one row each, every number read from the check's own
// results in evals/ when the figure is drawn. The census check is drawn as its counts against the real ones, on the
// line where they agree; the other two as 100 squares, the differences the right way round in colour.
import { readFileSync, readdirSync } from "node:fs";
import { W, PAD, hline, wordmark, r1, squares, plain, type Drawn, type Font, type Kit, type Theme } from "./kit.ts";
import { icon } from "./icons.ts";

/** One check's row in data/evidence.json: its icon and claim, with {braced} names filled from its numbers. */
interface EvidenceRow {
  icon: string;
  head: string;
  big: string;
  text: string;
  /** The chart's axis labels, for the census check's chart. */
  axis?: [string, string];
  link: string;
}

/** data/evidence.json: the words of the figure. */
export interface EvidenceWords {
  _about: string;
  title: string;
  lead: string;
  rows: EvidenceRow[];
  key: string;
  note: string;
}

/** What the figure reads of the census check's results (evals/real-us): each count's real and made-up share, and the gap. */
interface CensusResults {
  matched: number;
  counted: number;
  results: { real: number; made_up: number; gap: number }[];
}

/** What it reads of the surveys check's totals (evals/surveys): the differences put the right way round, of all. */
interface SurveyTotals {
  right: number;
  gaps: number;
}

/** What it reads of a products run (evals/products): each pair's two scan levels, the one that should lead first. */
interface ProductRun {
  pairs: { scan: [number, number] }[];
}

/** The three checks' numbers, which their rows read by the {braced} names: the last two as rows of 100 squares. */
export interface EvidenceNumbers {
  census: { matched: number; counted: number; largest: string; points: [number, number][] };
  surveys: { right: number; of: number; in100: number };
  products: { right: number; of: number; in100: number };
}

const EVALS = new URL("../../evals/", import.meta.url);
const json = (path: string) => JSON.parse(readFileSync(new URL(path, EVALS), "utf8"));
const latest = (dir: string, re: RegExp) =>
  readdirSync(new URL(dir, EVALS))
    .filter((f) => re.test(f))
    .sort()
    .at(-1);

/** The three checks' numbers, from their newest results. */
export function evidenceNumbers(): EvidenceNumbers {
  const census: CensusResults = json(`real-us/${latest("real-us/", /^results-.*\.json$/)}`);
  const surveys: SurveyTotals = json(`surveys/${latest("surveys/", /^results-.*\.json$/)}`).total;
  const run: ProductRun = json(`products/results/${latest("products/results/", /year-on-offer.*\.json$/)}`);
  const right = run.pairs.filter((p) => p.scan[0] > p.scan[1]).length;
  return {
    census: {
      matched: census.matched,
      counted: census.counted,
      largest: Math.max(...census.results.map((r) => Math.abs(r.gap))).toFixed(1),
      points: census.results.map((r): [number, number] => [r.real, r.made_up]),
    },
    surveys: { right: surveys.right, of: surveys.gaps, in100: Math.round((100 * surveys.right) / surveys.gaps) },
    products: { right, of: run.pairs.length, in100: Math.round((100 * right) / run.pairs.length) },
  };
}

const fill = (text: string, values: Record<string, unknown>) =>
  text.replace(/\{(\w+)\}/g, (_, name: string) => {
    if (values[name] === undefined) throw new Error(`evidence: no value for {${name}}`);
    return String(values[name]);
  });

const CHART = 150; // the side of each row's chart

/** The census counts against the real ones: each a dot, on the line where the two agree. */
function scatter(x: number, y: number, points: [number, number][], t: Theme, k: Kit, axis: [string, string]): string {
  const at = (v: number) => (v / 100) * CHART;
  let svg = `<rect x="${x}" y="${y}" width="${CHART}" height="${CHART}" rx="6" fill="${t.inset}" stroke="${t.hair}"/>`;
  svg += `<line x1="${x}" y1="${y + CHART}" x2="${x + CHART}" y2="${y}" stroke="${t.line}" stroke-width="1.5" stroke-dasharray="3 4"/>`;
  for (const [real, made] of points)
    svg += `<circle cx="${r1(x + at(real))}" cy="${r1(y + CHART - at(made))}" r="4" fill="${t.aurora}" fill-opacity="0.85"/>`;
  const f: Font = { fam: "mono", size: 11 };
  svg += k.text(x + CHART, y + CHART + 18, axis[0], f, { fill: t.ink3, anchor: "end" });
  svg += `<text class="mono" font-size="11" fill="${t.ink3}" transform="translate(${x - 8} ${y}) rotate(-90)" text-anchor="end">${axis[1]}</text>`;
  return svg;
}

export async function draw(data: { evidence: EvidenceWords }, t: Theme, k: Kit): Promise<Drawn> {
  const d = data.evidence;
  const n = evidenceNumbers();
  const values = [n.census, n.surveys, n.products];
  const right = W - PAD;
  let svg = "";

  // title and lead over a rule
  let y = PAD + 30;
  svg += k.text(PAD, y, d.title, { fam: "display", size: 34, weight: 500 }, { fill: t.ink });
  const lead = await k.wrap(d.lead, { fam: "sans", size: 16 }, right - PAD);
  y += 36;
  svg += k.text(PAD, y, lead, { fam: "sans", size: 16 }, { fill: t.ink2, lh: 23 });
  y += (lead.length - 1) * 23 + 26;
  svg += hline(PAD, right, y, t.ink);

  // one row a check: the chart, then the claim
  const tx = PAD + CHART + 44,
    tw = right - tx;
  const descs: string[] = [];
  for (const [i, row] of d.rows.entries()) {
    const top = y + 34;
    const v = values[i];
    // The census check, first, is drawn as its points; the other two as squares.
    svg +=
      "points" in v
        ? scatter(PAD + 14, top, v.points, t, k, row.axis ?? ["", ""])
        : squares({
            x: PAD + 14,
            y: top,
            cols: 10,
            cell: 12,
            gap: 3.3,
            groups: [
              { n: v.in100, fill: t.aurora },
              { n: 100 - v.in100, fill: t.group },
            ],
          }).svg;

    svg += icon(row.icon, tx, top - 2, 24, t);
    const head: Font = { fam: "display", size: 20, weight: 600 };
    svg += k.text(tx + 34, top + 17, row.head, head, { fill: t.ink });
    const big = fill(row.big, v);
    svg += k.text(tx, top + 72, big, { fam: "display", size: 48, weight: 600 }, { fill: t.aurora });
    const text = await k.wrap(fill(row.text, v), { fam: "sans", size: 15 }, tw);
    svg += k.text(tx, top + 100, text, { fam: "sans", size: 15 }, { fill: t.ink2, lh: 21 });
    const after = top + 100 + (text.length - 1) * 21;
    svg += k.text(tx, after + 26, row.link, { fam: "mono", size: 12 }, { fill: t.ink3 });
    descs.push(`${row.head}: ${big} ${plain(fill(row.text, v))} (${row.link})`);

    y = Math.max(top + CHART + 22, after + 26) + 26;
    if (i < d.rows.length - 1) svg += hline(PAD, right, y, t.hair);
  }

  // the footer: what the squares are, the wordmark and a note
  svg += hline(PAD, right, y, t.hair);
  y += 30;
  svg += wordmark(k, PAD, y + 2, 24, t);
  const note = await k.wrap(`${d.key} ${d.note}`, { fam: "sans", size: 13 }, right - PAD - 70);
  svg += k.text(PAD + 70, y - 2, note, { fam: "sans", size: 13 }, { fill: t.ink3, lh: 18 });
  const height = y + (note.length - 1) * 18 + 26;

  const desc = `${d.title}. ${d.lead} ${descs.join(" ")} ${d.key} ${d.note}`;
  return { height, body: svg, title: "nxk's evidence", desc };
}
