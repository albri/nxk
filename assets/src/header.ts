// The header: the wordmark, one line on what nxk is, the install command, and the opening figure's 100 adults drawn as
// strands through their age and work to the app sign-up, the ones it leaves out in colour. The drawing is the Route
// from public main's banner (assets/readme/src/route.mjs there), fed with the counted people.
import { r1, type Drawn, type Font, type Kit, type Theme } from "./kit.ts";
import { hundred, type IdeaCounts } from "./hundred.ts";

/** The header's words in data/idea.json: the line, the install command, the facts' names and the sign-up's labels. */
export interface HeaderWords {
  line: string;
  install: string;
  facts: { age: string; work: string; signup: string };
  /** The sign-up's label for each way online, and for the ones it leaves out. */
  labels: { signup: Record<string, string> };
}

/** A fact the strands pass through: its name, and each answer with its count and, when drawn in colour, its tone. */
interface Fact {
  name: string;
  cats: [label: string, share: number, tone?: keyof Theme][];
}

/** An answer's rail: where it starts along the column, how long it is, and its middle. */
interface Rail {
  label: string;
  tone: keyof Theme | undefined;
  start: number;
  size: number;
  mid: number;
}

/** mulberry32: fixed random numbers, so the drawing is the same every time it is built. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One fact laid along a length, split into its shares with a gap between answers. */
function rails(fact: Fact, from: number, length: number, gap: number): Rail[] {
  const total = fact.cats.reduce((n, [, s]) => n + s, 0) || 1;
  const usable = length - gap * (fact.cats.length - 1);
  let at = from;
  return fact.cats.map(([label, share, tone]) => {
    const size = (usable * share) / total;
    const s = { label, tone, start: at, size, mid: at + size / 2 };
    at += size + gap;
    return s;
  });
}

/** A strand: soft curves, so the crowd reads as one texture. */
function smooth(points: [number, number][]): string {
  let d = `M${r1(points[0][0])} ${r1(points[0][1])}`;
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i - 1],
      [x2, y2] = points[i],
      c = (x2 - x1) * 0.5;
    d += `C${r1(x1 + c)} ${r1(y1)} ${r1(x2 - c)} ${r1(y2)} ${r1(x2)} ${r1(y2)}`;
  }
  return d;
}

/**
 * Each column a fact split into its answers as rails, the crowd as strands behind, the strands `tone` picks drawn in
 * colour, and each fact's name below its column. Returns { svg, xs, segs, rail }.
 */
function route({
  k,
  t,
  ground,
  facts,
  people,
  tone,
  x0,
  y0,
  width,
  height,
  right,
}: {
  k: Kit;
  t: Theme;
  ground: string;
  facts: Fact[];
  /** Each person's answer to each fact, by position. */
  people: number[][];
  /** The colour a person's strand is drawn in, or none for the crowd's grey. */
  tone: (p: number[]) => keyof Theme | undefined;
  x0: number;
  y0: number;
  width: number;
  height: number;
  right: number;
}): { svg: string; xs: number[]; segs: Rail[][]; rail: number } {
  const top = y0,
    bottom = y0 + height - 34,
    rail = 6,
    cut = 5,
    gap = 9;
  const xs = facts.map((_, i) => x0 + (i * (width - right)) / (facts.length - 1));
  const segs = facts.map((f) => rails(f, top, bottom - top, gap));
  const at = (s: Rail, lane: number) => s.start + rail / 2 + (s.size - rail) * lane;
  const random = rng(21);
  const strands = people.map((p) => {
    const lane = 0.14 + 0.72 * random();
    return { d: smooth(p.map((a, c): [number, number] => [xs[c], at(segs[c][a], lane)])), tone: tone(p) };
  });
  const crowd = `<g fill="none" stroke="${t.strand}" stroke-width="1.1" stroke-opacity="0.6">${strands
    .filter((s) => !s.tone)
    .map((s) => `<path d="${s.d}"/>`)
    .join("")}</g>`;
  const lit = [...new Set(strands.map((s) => s.tone).filter((c) => c !== undefined))]
    .map(
      (c) =>
        `<g fill="none" stroke="${t[c]}" stroke-width="1.6" stroke-opacity="0.95">${strands
          .filter((s) => s.tone === c)
          .map((s) => `<path d="${s.d}"/>`)
          .join("")}</g>`,
    )
    .join("");
  const bars = segs
    .map(
      (ss, c) =>
        `<rect x="${r1(xs[c] - rail / 2 - cut)}" y="${r1(top - cut)}" width="${rail + 2 * cut}" height="${r1(bottom - top + 2 * cut)}" rx="${(rail + 2 * cut) / 2}" fill="${ground}"/>` +
        ss
          .map(
            (s) =>
              `<rect x="${r1(xs[c] - rail / 2)}" y="${r1(s.start)}" width="${rail}" height="${r1(Math.max(s.size, 1))}" rx="${r1(Math.min(rail, Math.max(s.size, 1)) / 2)}" fill="${t.edge}"/>`,
          )
          .join(""),
    )
    .join("");
  const label: Font = { fam: "mono", size: 12 };
  const factNames = facts
    .map((f, c) =>
      k.text(xs[c] - (c === 0 ? rail / 2 : 0), bottom + 28, f.name, label, {
        fill: t.ink3,
        anchor: c === 0 ? "start" : "middle",
      }),
    )
    .join("");
  return { svg: crowd + lit + bars + factNames, xs, segs, rail };
}

export async function draw(
  data: { idea: { header: HeaderWords }; "idea-counts": IdeaCounts },
  t: Theme,
  k: Kit,
): Promise<Drawn> {
  const d = data.idea.header;
  const h = hundred(data["idea-counts"]);
  const ground = t.ground;
  let svg = "";

  // the words: the name, the line, the install command
  const x = 44;
  svg += k.text(x, 100, "nxk", { fam: "display", size: 60, weight: 600 }, { fill: t.aurora, spacing: -0.6 });
  const lineFont: Font = { fam: "sans", size: 20 };
  const line = await k.wrap(d.line, lineFont, 350);
  svg += k.text(x, 160, line, lineFont, { fill: t.ink, lh: 29 });
  const cy = 160 + (line.length - 1) * 29 + 40;
  const code: Font = { fam: "mono", size: 13.5 };
  const cw = await k.width(d.install, code);
  svg +=
    `<rect x="${x}" y="${cy}" width="${r1(cw + 28)}" height="40" rx="8" fill="${t.inset}" stroke="${t.line}" stroke-width="1"/>` +
    k.text(x + 14, cy + 25, d.install, code, { fill: t.ink });
  const height = cy + 40 + 40;

  // the drawing: the same 100 adults as the opening figure, one strand each, through age and work to the sign-up,
  // where the ones it leaves out end in the colour of why
  const count = (c: number, n: number) => h.people.filter((p) => p[c] === n).length;
  const tones: Partial<Record<string, keyof Theme>> = { none: "aurora", other: "look" };
  const facts: Fact[] = [
    { name: d.facts.age, cats: h.age.map((a, i) => [a, count(0, i)]) },
    { name: d.facts.work, cats: h.work.map((w, i) => [w, count(1, i)]) },
    { name: d.facts.signup, cats: h.online.map((o, i) => [d.labels.signup[o], count(2, i), tones[o]]) },
  ];
  const people = h.people.map((p) => [p[0], p[1], p[2]]);
  const random = rng(5);
  for (let i = people.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [people[i], people[j]] = [people[j], people[i]];
  }
  const r = route({
    k,
    t,
    ground,
    facts,
    people,
    tone: (p) => tones[h.online[p[2]]],
    x0: 446,
    y0: 46,
    width: 334,
    height: height - 46 - 22,
    right: 112,
  });
  svg += r.svg;

  // the sign-up's answers beside its rail, where no strand passes: what it suits, then what it leaves out and why
  const last = r.segs[2],
    lx = r.xs[2] + r.rail / 2 + 9;
  const label: Font = { fam: "mono", size: 12 };
  const strong: Font = { ...label, weight: 500 };
  const [suits, ...out] = last;
  svg += k.text(lx, suits.mid + 4, suits.label, label, { fill: t.ink2 });
  svg += k.text(lx, out[0].start - 10, d.labels.signup.out, strong, { fill: t.ink });
  const step = Math.max(16, out[1].mid - out[0].mid);
  out.forEach((s, i) => {
    svg += k.text(lx + 8, out[0].mid + 4 + i * step, s.label, strong, { fill: s.tone && t[s.tone] });
  });

  const n = (key: string) => count(2, h.online.indexOf(key));
  const desc = [
    `nxk. ${d.line} Install it in Claude Code with ${d.install}.`,
    "Beside the words, 100 adults in the UK are drawn as lines through their age and work to a sign-up that works only in a smartphone app.",
    `It suits ${n("phone")}. The ${n("other") + n("none")} it leaves out are in colour: ${n("other")} with no smartphone, in amber, and ${n("none")} offline, in green.`,
  ].join(" ");
  return { height, body: svg, fill: ground, title: "nxk", desc };
}
