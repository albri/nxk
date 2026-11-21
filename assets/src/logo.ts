// The logo at the top of the README: the wordmark, nxk in Genos 600 in Aurora, always lower case and with no symbol,
// set a little tighter than in the figures and on no ground, so it sits on the page's own in either theme.
import { r1, type Drawn, type Font, type Kit, type Theme } from "./kit.ts";

const SIZE = 120; // the type's size in px; the README shows it at about a third of that
const TRACK = -0.02; // letter spacing, as a share of the size
const PAD = 6; // room around the letters, so no stroke touches the edge

export async function draw(_data: unknown, t: Theme, k: Kit): Promise<Drawn> {
  const f: Font = { fam: "display", size: SIZE, weight: 600 };
  const spacing = r1(TRACK * SIZE);
  // the browser measures the letters without the spacing, which is added after each of the three
  const width = Math.ceil((await k.width("nxk", f)) + 3 * spacing + 2 * PAD);
  // Genos's lower case: the k's ascender is about 0.70 of the size above the baseline, and nothing descends
  const ascent = Math.round(SIZE * 0.7);
  const height = ascent + 2 * PAD;
  const body = k.text(PAD, PAD + ascent, "nxk", f, { fill: t.aurora, spacing });
  return { width, height, body, fill: "none", title: "nxk", desc: "nxk" };
}
