// Shared parts for the README figures: the two themes, the type, and helpers that write SVG.
// Text is measured in the browser (build.ts passes `measure`), so lines wrap with the real fonts.

import { readFileSync } from "node:fs";

export const W = 800; // viewBox width: shown at about 830 px in a README, about 350 px on a phone
export const PAD = 40;

/** A theme's colours. */
export interface Theme {
  ground: string;
  card: string;
  inset: string;
  hair: string;
  line: string;
  ink: string;
  ink2: string;
  ink3: string;
  edge: string;
  aurora: string;
  look: string;
  group: string;
  strand: string;
}

/** A font: the face (display, sans or mono), its size in px and its weight. */
export interface Font {
  fam: "display" | "sans" | "mono";
  size: number;
  weight?: number;
}

/** A run of text, drawn in the accent when `accent`. */
export interface Segment {
  text: string;
  accent?: boolean;
}

/** A line of text, as wrap makes it: its runs. */
export type Line = Segment[];

/** How text is drawn: its fill and accent, its anchor, the line height and the letter spacing. */
export interface TextOptions {
  fill?: string;
  accent?: string;
  anchor?: "start" | "middle" | "end";
  lh?: number;
  spacing?: number;
}

/** A text's width in px in a CSS font, as the browser measures it. */
export type Measure = (text: string, font: string) => Promise<number>;

/** The helpers that need the browser's measurements (kit), and the font faces a figure used. */
export interface Kit {
  width(text: string, f: Font): Promise<number>;
  wrap(rich: string, f: Font, max: number): Promise<Line[]>;
  text(x: number, y: number, lines: string | Line[], f: Font, o?: TextOptions): string;
  quote(
    x: number,
    y: number,
    rich: string,
    f: Font,
    max: number,
    o?: TextOptions,
  ): Promise<{ lines: Line[]; svg: string }>;
  used: Set<string>;
}

/** A figure as its draw makes it: its SVG body, its height, its ground, and its title and description for screen readers. */
export interface Drawn {
  height: number;
  body: string;
  title: string;
  desc: string;
  fill?: string;
  width?: number;
}

/** An embedded font face: its key, the family it is drawn as, its file and weights, and the fonts in its place. */
interface Face {
  key: string;
  family: string;
  file: string;
  weight: string;
  fallback: string;
}

// The nxk colours, as on public main and the nxk page: a cool light grey (Paper) or near-black (Night) ground, Aurora
// green for nxk and for the people a figure picks out, Marigold amber as the second tone, and greys for everyone else.
// `card` is the ground of a figure; the header sits on `ground`.
export const themes: Record<"light" | "dark", Theme> = {
  light: {
    ground: "#f4f5f8",
    card: "#f4f5f8",
    inset: "#ffffff",
    hair: "#e3e5eb",
    line: "#c9ccd5",
    ink: "#0b0c14",
    ink2: "#4a4e5e",
    ink3: "#626677",
    edge: "#7c8193",
    aurora: "#0a5a42",
    look: "#a86400",
    group: "#7c8193",
    strand: "#a3a8b8",
  },
  dark: {
    ground: "#06070c",
    card: "#0e1019",
    inset: "#06070c",
    hair: "#1d2030",
    line: "#2c3044",
    ink: "#eef0f6",
    ink2: "#aab0c0",
    ink3: "#878d9f",
    edge: "#5d6478",
    aurora: "#7fe3c0",
    look: "#f5b13a",
    group: "#6b7287",
    strand: "#4a5068",
  },
};

// Genos for the name and headings, IBM Plex Sans for words, IBM Plex Mono for data and code: the Latin subsets Google
// Fonts serves, all SIL Open Font License (fonts/OFL.txt), embedded so the SVG renders the same everywhere.
const FONT_DIR = new URL("./fonts/", import.meta.url);
const faces: Face[] = [
  {
    key: "display",
    family: "nxk-display",
    file: "genos-latin.woff2",
    weight: "100 900",
    fallback: "Genos, system-ui, sans-serif",
  },
  {
    key: "sans",
    family: "nxk-sans",
    file: "plex-sans-latin.woff2",
    weight: "100 700",
    fallback: "'IBM Plex Sans', system-ui, sans-serif",
  },
  {
    key: "mono",
    family: "nxk-mono",
    file: "plex-mono-400-latin.woff2",
    weight: "400",
    fallback: "'IBM Plex Mono', ui-monospace, Menlo, monospace",
  },
  {
    key: "mono500",
    family: "nxk-mono",
    file: "plex-mono-500-latin.woff2",
    weight: "500",
    fallback: "'IBM Plex Mono', ui-monospace, Menlo, monospace",
  },
];
const data64: Record<string, string> = Object.fromEntries(
  faces.map((f) => [f.key, readFileSync(new URL(f.file, FONT_DIR)).toString("base64")]),
);
const fontFace = (f: Face) =>
  `@font-face{font-family:"${f.family}";font-style:normal;font-weight:${f.weight};src:url(data:font/woff2;base64,${data64[f.key]}) format("woff2")}`;
const facesOf = (fam: string, weight = 400) => (fam === "mono" ? [weight >= 500 ? "mono500" : "mono"] : [fam]);

/** @font-face rules for the given face keys (all of them when none are given). */
export const fontCss = (keys: string[] = faces.map((f) => f.key)): string =>
  faces
    .filter((f) => keys.includes(f.key))
    .map(fontFace)
    .join("");

const familyOf: Record<string, Face> = Object.fromEntries(faces.map((f) => [f.key, f]));
/** The CSS font shorthand for a font spec { fam, size, weight }, used to measure and to draw. */
export const cssFont = (f: Font): string => `${f.weight ?? 400} ${f.size}px "${familyOf[f.fam].family}"`;

export const esc = (s: string): string =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const r1 = (n: number): number => Math.round(n * 10) / 10;

/** A text with *starred* words split into segments; starred ones are drawn in the accent. */
export function segments(rich: string): Segment[] {
  return String(rich)
    .split(/(\*[^*]+\*)/)
    .filter(Boolean)
    .map((s) => (s.startsWith("*") ? { text: s.slice(1, -1), accent: true } : { text: s }));
}
export const plain = (rich: string): string =>
  segments(rich)
    .map((s) => s.text)
    .join("");

/**
 * Whole numbers that add up to `total`, in proportion to `weights` (largest remainder). Every figure rounds counts of
 * people to 100 this way, so the parts always add up to the whole.
 */
export function shares(weights: number[], total: number): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  const exact = weights.map((w) => (sum ? (w * total) / sum : 0));
  const out = exact.map(Math.floor);
  let left = total - out.reduce((s, n) => s + n, 0);
  const order = exact
    .map((x, i): [number, number] => [x - Math.floor(x), i])
    .sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) if (left-- > 0) out[i]++;
  return out;
}

/** A run of text as wrap builds a line: always says whether it is in the accent. */
interface Piece {
  text: string;
  accent: boolean;
}

/** Makes the helpers that need the browser's measurements, and records which font faces a figure used. */
export function kit(measure: Measure): Kit {
  const used = new Set<string>();
  const width = async (text: string, f: Font) => {
    facesOf(f.fam, f.weight).forEach((k) => used.add(k));
    return measure(text, cssFont(f));
  };

  /** Greedy word wrap of a rich text into lines of segments no wider than max; "\n" forces a break. */
  async function wrap(rich: string, f: Font, max: number): Promise<Line[]> {
    const lines: Piece[][] = [];
    const str = (pieces: Piece[]) => pieces.map((p) => p.text).join("");
    for (const para of String(rich).split("\n")) {
      // a unit is a word with whatever is glued to it (an accent word and the full stop after it); an accent
      // phrase is kept whole
      const units: Piece[][] = [];
      let cur: Piece[] | null = null;
      for (const seg of segments(para))
        for (const piece of seg.accent ? [seg.text] : seg.text.split(/(?<= )/)) {
          if (!piece) continue;
          if (!cur) units.push((cur = []));
          cur.push({ text: piece, accent: !!seg.accent });
          if (piece.endsWith(" ")) cur = null;
        }
      let line: Piece[] = [];
      for (const u of units) {
        const next = [...line, ...u];
        if (line.length && (await width(str(next).trim(), f)) > max) {
          lines.push(line);
          line = [...u];
        } else line = next;
      }
      if (line.length) lines.push(line);
    }
    // join neighbouring pieces of the same colour, and trim the ends of each line
    return lines.map((l) => {
      const out: Piece[] = [];
      for (const p of l) {
        const last = out[out.length - 1];
        if (last && last.accent === p.accent) last.text += p.text;
        else out.push({ ...p });
      }
      out[0].text = out[0].text.trimStart();
      out[out.length - 1].text = out[out.length - 1].text.trimEnd();
      return out;
    });
  }

  /** A text whose first line hangs its opening quote mark into the margin. */
  async function quote(x: number, y: number, rich: string, f: Font, max: number, o: TextOptions = {}) {
    const hang = /^[“‘"]/.test(rich) ? await width(rich[0], f) : 0;
    const lines = await wrap(rich, f, max);
    const lh = o.lh ?? Math.round(f.size * 1.3);
    return {
      lines,
      svg:
        text(x - hang, y, lines.slice(0, 1), f, o) +
        (lines.length > 1 ? "\n" + text(x, y + lh, lines.slice(1), f, o) : ""),
    };
  }

  /** Draws lines (from wrap, or a plain string) as one <text> each. Options: fill, accent, anchor, lh, spacing. */
  function text(x: number, y: number, lines: string | Line[], f: Font, o: TextOptions = {}) {
    facesOf(f.fam, f.weight).forEach((k) => used.add(k));
    const rows = typeof lines === "string" ? [segments(lines)] : lines;
    const lh = o.lh ?? Math.round(f.size * 1.3);
    const anchor = o.anchor && o.anchor !== "start" ? ` text-anchor="${o.anchor}"` : "";
    const spacing = o.spacing ? ` letter-spacing="${o.spacing}"` : "";
    return rows
      .map((row, i) => {
        const inner = row
          .map((s) => (s.accent ? `<tspan fill="${o.accent}">${esc(s.text)}</tspan>` : esc(s.text)))
          .join("");
        return `<text class="${f.fam}" x="${r1(x)}" y="${r1(y + i * lh)}" font-size="${f.size}" font-weight="${f.weight ?? 400}"${anchor}${spacing} fill="${o.fill}">${inner}</text>`;
      })
      .join("\n");
  }

  return { width, wrap, text, quote, used };
}

/** The wordmark: nxk in Genos 600, in Aurora, always lower case. There is no symbol. */
export function wordmark(k: Kit, x: number, y: number, size: number, t: Theme): string {
  return k.text(x, y, "nxk", { fam: "display", size, weight: 600 }, { fill: t.aurora, spacing: r1(-0.01 * size) });
}

/**
 * A crowd counted as rounded squares in reading order, `cols` to a row, each in its group's colour. groups: [{ n, fill }].
 * Returns { svg, w, h }.
 */
export function squares({
  x,
  y,
  groups,
  cols = 10,
  cell = 20,
  gap = 5,
}: {
  x: number;
  y: number;
  groups: { n: number; fill: string }[];
  cols?: number;
  cell?: number;
  gap?: number;
}): { svg: string; w: number; h: number } {
  const fills = groups.flatMap((g) => Array<string>(g.n).fill(g.fill));
  const step = cell + gap,
    rows = Math.ceil(fills.length / cols),
    rx = r1(cell / 5);
  const svg = fills
    .map(
      (fill, n) =>
        `<rect x="${r1(x + (n % cols) * step)}" y="${r1(y + Math.floor(n / cols) * step)}" width="${cell}" height="${cell}" rx="${rx}" fill="${fill}"/>`,
    )
    .join("");
  return { svg, w: cols * step - gap, h: rows * step - gap };
}

export const hline = (x1: number, x2: number, y: number, stroke: string, w = 1): string =>
  `<line x1="${r1(x1)}" y1="${r1(y)}" x2="${r1(x2)}" y2="${r1(y)}" stroke="${stroke}" stroke-width="${w}"/>`;

/** The finished SVG: fonts embedded, a rounded ground, title and description for screen readers. */
export function svgDoc({
  width = W,
  height,
  title,
  desc,
  body,
  fill,
  fonts,
}: Drawn & { fill: string; fonts: Set<string> }): string {
  const h = Math.ceil(height);
  const css =
    fontCss([...fonts]) +
    ["display", "sans", "mono"]
      .map((k) => `.${k}{font-family:"${familyOf[k].family}",${familyOf[k].fallback}}`)
      .join("") +
    "text{font-kerning:normal;font-variant-numeric:tabular-nums}";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${h}" width="${width}" height="${h}" role="img" aria-labelledby="title desc">
<title id="title">${esc(title)}</title>
<desc id="desc">${esc(desc)}</desc>
<!-- Generated by assets/src/build.ts from assets/src/data/. Do not edit by hand. Fonts: SIL Open Font License, see assets/src/fonts/OFL.txt. -->
<style>${css}</style>
<rect width="${width}" height="${h}" rx="12" fill="${fill}"/>
${body}
</svg>
`;
}
