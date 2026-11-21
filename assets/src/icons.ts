// nxk's icons: one line glyph for each command and for each kind of thing the README talks about, on a 24-unit grid,
// drawn in the theme's ink with one accent in Aurora. The figures draw them in place (icon); build.ts also writes each
// as its own small file, assets/icons/<name>-light.svg and -dark.svg, for the README's text.
import { r1, type Theme } from "./kit.ts";

/** A glyph: its SVG inside a 24 by 24 box, from the line colour, the accent and the grey of everyone else. */
type Glyph = (line: string, accent: string, quiet: string) => string;

const STROKE = 1.8;

// Each glyph: (line, accent, quiet) => SVG inside a 24 by 24 box. `line` draws strokes, `accent` marks the one thing
// the glyph is about, and `quiet` is the grey of everyone else, as in the figures.
export const ICONS: Record<string, Glyph> = {
  // /nxk:research: a lens over a few people
  research: (c, a) =>
    `<circle cx="10.5" cy="10.5" r="6.6" fill="none" stroke="${c}" stroke-width="${STROKE}"/>` +
    `<path d="M15.3 15.3 20.6 20.6" stroke="${c}" stroke-width="2.4" stroke-linecap="round"/>` +
    `<circle cx="8" cy="11.6" r="1.3" fill="${a}"/><circle cx="10.5" cy="8.7" r="1.3" fill="${a}"/><circle cx="13" cy="11.6" r="1.3" fill="${a}"/>`,
  // /nxk:look: a second look
  look: (c, a) =>
    `<path d="M2.6 12C5.6 6.7 18.4 6.7 21.4 12 18.4 17.3 5.6 17.3 2.6 12Z" fill="none" stroke="${c}" stroke-width="${STROKE}" stroke-linejoin="round"/>` +
    `<circle cx="12" cy="12" r="3.2" fill="none" stroke="${c}" stroke-width="${STROKE}"/><circle cx="12" cy="12" r="1.3" fill="${a}"/>`,
  // /nxk:meet: the panel, a few of the group's people
  meet: (c, a) =>
    `<circle cx="15.8" cy="8.2" r="2.6" fill="none" stroke="${c}" stroke-width="${STROKE}"/>` +
    `<path d="M14.4 13.3c3.3-.6 6.3 1.6 6.3 5.6" fill="none" stroke="${c}" stroke-width="${STROKE}" stroke-linecap="round"/>` +
    `<circle cx="8.6" cy="9.4" r="3" fill="${a}"/>` +
    `<path d="M3.2 19.8c0-3.9 2.4-6.1 5.4-6.1s5.4 2.2 5.4 6.1" fill="none" stroke="${c}" stroke-width="${STROKE}" stroke-linecap="round"/>`,
  // a count on the made-up people: a crowd as squares, the counted ones in colour
  people: (c, a, q) =>
    [0, 1, 2]
      .flatMap((row) => [0, 1, 2].map((col) => [row, col]))
      .map(([row, col], n) => {
        const fill = n >= 7 ? a : q;
        return `<rect x="${r1(3.2 + col * 6.3)}" y="${r1(3.2 + row * 6.3)}" width="5" height="5" rx="1.2" fill="${fill}"/>`;
      })
      .join(""),
  // a scan: a sweep across everyone, and a group that stands out
  scan: (c, a) =>
    `<circle cx="12" cy="12" r="8.8" fill="none" stroke="${c}" stroke-width="${STROKE}"/>` +
    `<circle cx="12" cy="12" r="4.4" fill="none" stroke="${c}" stroke-width="1.1" stroke-opacity="0.55"/>` +
    `<path d="M12 12 18.2 5.8" stroke="${c}" stroke-width="${STROKE}" stroke-linecap="round"/>` +
    `<circle cx="12" cy="12" r="1.3" fill="${c}"/><circle cx="15.4" cy="15.6" r="1.9" fill="${a}"/>`,
  // the evidence: nxk's figures against published ones, on the line where they agree
  evidence: (c, a) =>
    `<path d="M3.8 3.5v16.7h16.7" fill="none" stroke="${c}" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="M6.5 17.5 19.5 4.5" stroke="${c}" stroke-width="1.2" stroke-dasharray="1.6 2" stroke-linecap="round"/>` +
    `<circle cx="8.6" cy="15.3" r="1.5" fill="${a}"/><circle cx="12.5" cy="11.6" r="1.5" fill="${a}"/><circle cx="16.4" cy="7.5" r="1.5" fill="${a}"/>`,
  // a figure checked against the tool that printed it
  check: (c, a) =>
    `<circle cx="12" cy="12" r="8.6" fill="none" stroke="${c}" stroke-width="${STROKE}"/>` +
    `<path d="M8 12.3 10.8 15.1 16.2 9.5" fill="none" stroke="${a}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`,
  // every figure's label
  label: (c, a) =>
    `<path d="M3.5 4.6v6.9c0 .4.2.8.5 1.1l8.2 8.2c.6.6 1.6.6 2.2 0l6.5-6.5c.6-.6.6-1.6 0-2.2L12.7 3.9c-.3-.3-.7-.5-1.1-.5H4.6c-.6 0-1.1.5-1.1 1.2Z" fill="none" stroke="${c}" stroke-width="${STROKE}" stroke-linejoin="round"/>` +
    `<circle cx="8.3" cy="8.3" r="1.7" fill="${a}"/>`,
  // installing: a line typed in Claude Code
  install: (c, a) =>
    `<rect x="2.8" y="4.6" width="18.4" height="14.8" rx="2.4" fill="none" stroke="${c}" stroke-width="${STROKE}"/>` +
    `<path d="M7 10 9.8 12 7 14" fill="none" stroke="${c}" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="M12.2 14.6h4.6" stroke="${a}" stroke-width="2.2" stroke-linecap="round"/>`,
};

/** An icon drawn in a figure at (x, y), `size` units across, in the theme's colours. */
export function icon(name: string, x: number, y: number, size: number, t: Theme): string {
  const glyph = ICONS[name];
  if (!glyph) throw new Error(`No icon ${name}`);
  return `<g transform="translate(${r1(x)} ${r1(y)}) scale(${r1(size / 24)})">${glyph(t.ink, t.aurora, t.group)}</g>`;
}

/** An icon as its own file, for the README's text: no ground, so it sits on the page's own. */
export function iconFile(name: string, t: Theme, size = 24): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${ICONS[name](t.ink, t.aurora, t.group)}</svg>\n`;
}
