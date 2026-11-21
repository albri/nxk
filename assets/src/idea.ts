// The opening figure: one choice, and 100 adults split into the people it suits and the people it leaves out, with
// who they are. Every number comes from data/idea-counts.json through hundred.ts.
import { W, PAD, squares, hline, wordmark, plain, type Drawn, type Font, type Kit, type Theme } from "./kit.ts";
import type { HeaderWords } from "./header.ts";
import { hundred, type IdeaCounts } from "./hundred.ts";

/** A group the choice leaves out: how it goes online, its colour, who it is, and one more fact about it. */
interface LeftOutGroup {
  online: string;
  tone: keyof Theme;
  who: string;
  /** "{n} of the {of} are 65 or over": the people of the group in `detail_ages`, of the group. */
  detail: string;
  detail_ages: string[];
}

/** data/idea.json: the words of the header and the opening figure. */
export interface IdeaWords {
  _about: string;
  header: HeaderWords;
  context: string;
  choice: string;
  suits: string;
  leaves_out: string;
  groups: LeftOutGroup[];
  note: string;
}

export async function draw(data: { idea: IdeaWords; "idea-counts": IdeaCounts }, t: Theme, k: Kit): Promise<Drawn> {
  const d = data.idea;
  const h = hundred(data["idea-counts"]);
  const at = (key: string) => h.online.indexOf(key);
  const suits = h.byOnline[at("phone")];
  const groups = d.groups.map((g) => {
    const n = h.byOnline[at(g.online)];
    const detail = h.people.filter((p) => p[2] === at(g.online) && g.detail_ages.includes(h.age[p[0]])).length;
    return { ...g, n, line: g.detail.replace("{n}", String(detail)).replace("{of}", String(n)) };
  });
  const out = groups.reduce((s, g) => s + g.n, 0);
  if (suits + out !== 100) throw new Error(`idea: ${suits} suit and ${out} are left out, not 100`);

  const right = W - PAD;
  let svg = "";

  // what was asked, and the choice in the business's words
  let y = PAD + 14;
  svg += k.text(PAD, y, d.context, { fam: "sans", size: 15 }, { fill: t.ink2 });
  y += 46;
  const cf: Font = { fam: "display", size: 32, weight: 500 };
  const choice = await k.quote(PAD, y, d.choice, cf, right - PAD, { fill: t.ink, lh: 38 });
  svg += choice.svg;
  y += (choice.lines.length - 1) * 38 + 24;
  svg += hline(PAD, right, y, t.ink);

  // the hundred: those it suits first, in grey, then each group it leaves out in its colour
  const top = y + 32;
  const grid = squares({
    x: PAD,
    y: top,
    cell: 22,
    gap: 5,
    groups: [{ n: suits, fill: t.group }, ...groups.map((g) => ({ n: g.n, fill: t[g.tone] }))],
  });
  svg += grid.svg;

  // the counts beside them
  const rx = PAD + grid.w + 48;
  const big: Font = { fam: "display", size: 52, weight: 600 };
  const lab: Font = { fam: "sans", size: 18 };
  const numW = Math.max(await k.width(String(suits), big), await k.width(String(out), big));
  let ry = top + 40;
  svg +=
    k.text(rx + numW, ry, String(suits), big, { fill: t.ink, anchor: "end" }) +
    k.text(rx + numW + 14, ry, d.suits, lab, { fill: t.ink2 });
  ry += 74;
  svg +=
    k.text(rx + numW, ry, String(out), big, { fill: t.ink, anchor: "end" }) +
    k.text(rx + numW + 14, ry, d.leaves_out, lab, { fill: t.ink2 });

  // each group: a key in its colour, its count, who they are and one more fact about them
  const gx = rx + numW + 14;
  const n: Font = { fam: "sans", size: 18, weight: 600 };
  const nW = Math.max(...(await Promise.all(groups.map((g) => k.width(String(g.n), n)))));
  ry += 40;
  for (const g of groups) {
    const who = await k.wrap(g.who, lab, right - (gx + 22 + nW + 8));
    svg += `<rect x="${gx}" y="${ry - 13}" width="14" height="14" rx="3" fill="${t[g.tone]}"/>`;
    svg += k.text(gx + 22 + nW, ry, String(g.n), n, { fill: t.ink, anchor: "end" });
    svg += k.text(gx + 22 + nW + 8, ry, who, lab, { fill: t.ink, lh: 24 });
    ry += (who.length - 1) * 24 + 24;
    svg += k.text(gx + 22 + nW + 8, ry, g.line, { fam: "sans", size: 15 }, { fill: t.ink2 });
    ry += 38;
  }
  const bottom = Math.max(top + grid.h, ry - 38 + 6);

  // how it was counted
  let fy = bottom + 30;
  svg += hline(PAD, right, fy, t.hair);
  fy += 30;
  svg += wordmark(k, PAD, fy + 2, 24, t);
  const small: Font = { fam: "sans", size: 13 };
  const nx = PAD + 70;
  const note = await k.wrap(d.note, small, right - nx);
  svg += k.text(nx, fy - 2, note, small, { fill: t.ink3, lh: 18 });
  const height = fy + (note.length - 1) * 18 + 26;

  const desc =
    `${d.context}: ${plain(d.choice)} Shown as 100 squares. It suits ${suits} and leaves out ${out}: ` +
    groups.map((g) => `${g.n} ${g.who} (${g.line})`).join("; ") +
    `. ${d.note}`;
  return { height, body: svg, title: "Who one choice suits and who it leaves out", desc };
}
