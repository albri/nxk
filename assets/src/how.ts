// How it works: one lane for each command, from what you ask, through the agent that does it in its own context, to
// what comes back, with the check every figure passes on the way and what each agent counts or scans with.
import { W, PAD, hline, wordmark, r1, plain, type Drawn, type Font, type Kit, type Theme } from "./kit.ts";
import { icon } from "./icons.ts";

/** One command's lane: its icon and name, what you ask, the agent, the icons it uses, and what comes back. */
interface Lane {
  icon: string;
  command: string;
  ask: string;
  agent: string;
  uses: string[];
  back: string;
}

/** data/how.json: the words of the figure. A *starred* phrase is drawn in the accent. */
export interface HowWords {
  _about: string;
  title: string;
  lead: string;
  columns: string[];
  lanes: Lane[];
  /** The word for each icon an agent uses. */
  uses: Record<string, string>;
  check: string;
  legend: { icon: string; text: string }[];
  note: string;
}

// The three columns: what you ask, the agent, what comes back; the gaps between them hold the arrows.
const C1 = { x: PAD, w: 196 };
const C2 = { x: 284, w: 212 };
const C3 = { x: 556, w: W - PAD - 556 };

/** An arrow from x1 to x2 at y, in the accent. */
const arrow = (x1: number, x2: number, y: number, stroke: string) =>
  `<path d="M${r1(x1)} ${r1(y)}H${r1(x2 - 2)}M${r1(x2 - 8)} ${r1(y - 5)}l6 5-6 5" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;

export async function draw(data: { how: HowWords }, t: Theme, k: Kit): Promise<Drawn> {
  const d = data.how;
  const right = W - PAD;
  const small: Font = { fam: "mono", size: 12 };
  const body: Font = { fam: "sans", size: 15 };
  let svg = "";

  // title and lead over a rule
  let y = PAD + 30;
  svg += k.text(PAD, y, d.title, { fam: "display", size: 34, weight: 500 }, { fill: t.ink });
  const lead = await k.wrap(d.lead, { fam: "sans", size: 16 }, right - PAD);
  y += 36;
  svg += k.text(PAD, y, lead, { fam: "sans", size: 16 }, { fill: t.ink2, lh: 23 });
  y += (lead.length - 1) * 23 + 26;
  svg += hline(PAD, right, y, t.ink);

  // the columns' names
  y += 30;
  for (const [i, c] of [C1, C2, C3].entries()) svg += k.text(c.x, y, d.columns[i], small, { fill: t.ink3 });
  y += 22;

  // the lanes
  for (const [n, lane] of d.lanes.entries()) {
    const top = y;
    // what you ask: the command's icon and name, and what it is for
    let c1 = "";
    c1 += icon(lane.icon, C1.x, top + 4, 28, t);
    c1 += k.text(C1.x + 38, top + 24, lane.command, { fam: "mono", size: 15, weight: 500 }, { fill: t.ink });
    const ask = await k.wrap(lane.ask, { fam: "sans", size: 14 }, C1.w);
    c1 += k.text(C1.x, top + 56, ask, { fam: "sans", size: 14 }, { fill: t.ink2, lh: 20 });
    const c1h = 56 + (ask.length - 1) * 20;

    // the agent: a box with a dashed edge, its own context, and what it uses
    const boxH = 92;
    let c2 = `<rect x="${C2.x}" y="${top - 4}" width="${C2.w}" height="${boxH}" rx="12" fill="${t.inset}" stroke="${t.line}" stroke-width="1.5" stroke-dasharray="5 4"/>`;
    c2 += k.text(C2.x + 18, top + 26, lane.agent, { fam: "display", size: 21, weight: 600 }, { fill: t.ink });
    let ux = C2.x + 18;
    for (const use of lane.uses) {
      c2 += icon(use, ux, top + 46, 22, t);
      const word = d.uses[use];
      c2 += k.text(ux + 28, top + 62, word, { fam: "mono", size: 13 }, { fill: t.ink2 });
      ux += 28 + (await k.width(word, { fam: "mono", size: 13 })) + 22;
    }

    // what comes back
    const back = await k.wrap(lane.back, body, C3.w);
    const c3 = k.text(C3.x, top + 22, back, body, { fill: t.ink, lh: 22, accent: t.aurora });
    const c3h = 22 + (back.length - 1) * 22;

    // the arrows, level with the agent's name; the second passes the check
    const mid = top + 40;
    svg += arrow(C1.x + C1.w + 10, C2.x - 8, mid, t.aurora);
    svg += arrow(C2.x + C2.w + 8, C3.x - 10, mid, t.aurora);
    svg += `<circle cx="${r1((C2.x + C2.w + C3.x) / 2 - 1)}" cy="${mid}" r="12" fill="${t.card}"/>`;
    svg += icon("check", (C2.x + C2.w + C3.x) / 2 - 12, mid - 11, 22, t);

    svg += c1 + c2 + c3;
    y = top + Math.max(c1h, boxH - 4, c3h) + 34;
    if (n < d.lanes.length - 1) svg += hline(PAD, right, y - 18, t.hair);
  }

  // the check, said once
  svg += hline(PAD, right, y - 6, t.ink);
  y += 26;
  svg += icon("check", PAD, y - 17, 22, t);
  const check = await k.wrap(d.check, { fam: "sans", size: 14 }, right - PAD - 34);
  svg += k.text(PAD + 34, y, check, { fam: "sans", size: 14 }, { fill: t.ink2, lh: 20 });
  y += (check.length - 1) * 20 + 30;

  // what the agents count and scan with
  const half = (right - PAD - 32) / 2;
  let tallest = 0;
  for (const [i, item] of d.legend.entries()) {
    const x = PAD + i * (half + 32);
    svg += icon(item.icon, x, y - 17, 22, t);
    const lines = await k.wrap(item.text, { fam: "sans", size: 14 }, half - 34);
    svg += k.text(x + 34, y, lines, { fam: "sans", size: 14 }, { fill: t.ink2, lh: 20, accent: t.ink });
    tallest = Math.max(tallest, lines.length);
  }
  y += (tallest - 1) * 20 + 30;

  // the footer: the wordmark and a note
  svg += hline(PAD, right, y, t.hair);
  y += 30;
  svg += wordmark(k, PAD, y + 2, 24, t);
  const note = await k.wrap(d.note, { fam: "sans", size: 13 }, right - PAD - 70);
  svg += k.text(PAD + 70, y - 2, note, { fam: "sans", size: 13 }, { fill: t.ink3, lh: 18 });
  const height = y + (note.length - 1) * 18 + 26;

  const lanes = d.lanes
    .map(
      (l) =>
        `${l.command}: ${l.ask}. ${l.agent}, using ${l.uses.map((u) => d.uses[u]).join(" and ")}. Back: ${plain(l.back)}.`,
    )
    .join(" ");
  const desc = `${d.title}. ${d.lead} ${lanes} ${d.check} ${d.legend.map((l) => plain(l.text)).join(" ")} ${d.note}`;
  return { height, body: svg, title: "How nxk works", desc };
}
