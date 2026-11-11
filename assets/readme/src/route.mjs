// The PersonaGen Route parts that nxk's README figures and launch video are drawn from: the two grounds, the type, the
// wordmark and two drawings. Route is a crowd as strands through a few facts, split at the question. Waffle counts a
// crowd as squares. Ported from the Route design system (personagen-web, src/components/route), as the nxk page on
// alexbristow.com draws them.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Paper for reading, Night for heroes and the dark theme. Aurora is nxk and the group an agent picks out; Signal is one
// person and never shares a drawing with Aurora. In the library example each kind of work keeps one colour from the
// crowd to the file: retired people in Aurora, full-time workers in Marigold (look), everyone else in grey.
export const THEMES = {
  paper: {
    page: '#ffffff', raised: '#f4f5f8', raised2: '#e9ebf0', hair: '#e3e5eb', lineStrong: '#c9ccd5', ink: '#0b0c14', ink2: '#4a4e5e', ink3: '#626677',
    edge: '#7c8193', aurora: '#0a5a42', signal: '#4a26a6', look: '#a86400', group: '#7c8193', stop: '#7c8193', strand: '#a3a8b8', fill: '#e4e6ec', diff: '#e6efe9',
  },
  night: {
    page: '#06070c', raised: '#0e1019', raised2: '#161926', hair: '#1d2030', lineStrong: '#2c3044', ink: '#eef0f6', ink2: '#aab0c0', ink3: '#878d9f',
    edge: '#5d6478', aurora: '#7fe3c0', signal: '#9b84ff', look: '#f5b13a', group: '#6b7287', stop: '#6b7287', strand: '#4a5068', fill: '#252a3b', diff: '#0f2a22',
  },
};

/** The colour each kind of work keeps in the library example, as a theme key. */
export const TONES = { Retired: 'aurora', 'Part-time': 'group', 'Full-time': 'look' };

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const vars = (t) => Object.entries(t).map(([k, v]) => `--${k}:${v}`).join(';');
const r1 = (n) => Math.round(n * 10) / 10;

/** mulberry32: fixed random numbers, so a drawing is the same every time it's rendered. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- type ----------
// Genos for the name and headings, IBM Plex Sans for words, IBM Plex Mono for data and code. Set NXK_FONTS to a folder
// of .woff2 files (genos.woff2, the variable font; plex-sans-400/500/600.woff2; plex-mono-400/500.woff2) to render
// without Google Fonts.

export function fonts() {
  const dir = process.env.NXK_FONTS;
  if (!dir) {
    return { link: '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Genos:wght@500;600&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=block">', css: '' };
  }
  const face = (family, file, weight) => `@font-face{font-family:"${family}";font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${readFileSync(join(dir, file)).toString('base64')}) format("woff2")}`;
  return {
    link: '',
    css: face('Genos', 'genos.woff2', '100 900') + face('IBM Plex Sans', 'plex-sans-400.woff2', 400) + face('IBM Plex Sans', 'plex-sans-500.woff2', 500)
      + face('IBM Plex Sans', 'plex-sans-600.woff2', 600) + face('IBM Plex Mono', 'plex-mono-400.woff2', 400) + face('IBM Plex Mono', 'plex-mono-500.woff2', 500),
  };
}

export const TYPE = `:root{--display:"Genos",system-ui,sans-serif;--sans:"IBM Plex Sans",system-ui,sans-serif;--mono:"IBM Plex Mono",ui-monospace,Menlo,monospace}
.wm{display:inline-block;font-family:var(--display);font-weight:600;letter-spacing:-0.01em;line-height:1;color:var(--aurora)}
.num{font-variant-numeric:tabular-nums}`;

/** The logo: nxk in Genos 600, in Aurora, always lower case. There is no symbol. */
export const wordmark = (size) => `<span class="wm" style="font-size:${size}px">nxk</span>`;

// ---------- the library's likely visitors ----------

/**
 * The hundred likely visitors in the library example, one per person as [age, household, work, answer] indices, with
 * the facts they're drawn through. Built from the counts in figures.mjs, so the drawings and the numbers agree.
 */
export function visitors(library, seed = 5) {
  const { ages, households, byWork } = library;
  const mix = Object.fromEntries(library.mix.map((m) => [m.group, m]));
  const random = rng(seed);
  const shuffle = (list) => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  };
  const spread = (counts) => shuffle(counts.flatMap((n, i) => Array(n).fill(i)));
  const people = [];
  byWork.forEach((row, w) => {
    const m = mix[row.group];
    const morning = Math.round((m.n * row.morning) / 100);
    const age = spread(m.age), home = spread(m.household), answer = shuffle([...Array(m.n)].map((_, i) => (i < morning ? 0 : 1)));
    for (let i = 0; i < m.n; i++) people.push([age[i], home[i], w, answer[i]]);
  });
  shuffle(people);
  const share = (c, n) => people.filter((p) => p[c] === n).length;
  const facts = [
    { name: 'age', cats: ages.map((a, i) => [a, share(0, i)]) },
    { name: 'household', cats: households.map((h, i) => [h, share(1, i)]) },
    { name: 'work', cats: byWork.map((r, i) => [r.group, share(2, i)]) },
    { name: 'answer', cats: [['Mornings', share(3, 0)], ['Evenings', share(3, 1)]] },
  ];
  // Each person's colour: the kind of work they're in, as in the library figure.
  const tone = (p) => TONES[byWork[p[2]].group];
  return { people, facts, tone };
}

// ---------- Route ----------

/** One fact laid along a length, split into its shares with a gap between answers. */
function segments(fact, from, length, gap) {
  const total = fact.cats.reduce((n, [, s]) => n + s, 0) || 1;
  const usable = length - gap * (fact.cats.length - 1);
  let at = from;
  return fact.cats.map(([label, share], i) => {
    const size = (usable * share) / total;
    const s = { i, label, start: at, size, mid: at + size / 2 };
    at += size + gap;
    return s;
  });
}

/** A strand: soft curves, so the crowd reads as one texture. */
function smooth(points) {
  let d = `M${r1(points[0][0])} ${r1(points[0][1])}`;
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i - 1], [x2, y2] = points[i], k = (x2 - x1) * 0.5;
    d += `C${r1(x1 + k)} ${r1(y1)} ${r1(x2 - k)} ${r1(y2)} ${r1(x2)} ${r1(y2)}`;
  }
  return d;
}

let routes = 0;

/**
 * The nxk Route: each column a fact split into its answers as rails, and the crowd as strands behind. `lit(person)`
 * picks the strands drawn in colour and `tone(person)` gives each one's theme colour; the rest stay in the crowd's grey.
 * `named` lists the columns whose answers are written beside their rails, and `tones` colours an answer's name, by its
 * label. `ground` is the colour behind the drawing, cut around every rail. `anim`, for the video, takes the times the
 * rails, the crowd, the lit strands and the names arrive.
 */
export function route({ t, ground, facts, people, lit, tone, width, height, k = 1, left = 8, right = 96, top = 8, named = [], tones = {}, seed = 21, anim }) {
  const id = `rt${++routes}`;
  const bottom = height - 40 * k, rail = 6 * k, gnd = 5 * k, gap = 10 * k;
  const xs = facts.map((_, i) => left + (i * (width - right - left)) / (facts.length - 1));
  const segs = facts.map((f) => segments(f, top, bottom - top, gap));
  const at = (s, lane) => s.start + rail / 2 + (s.size - rail) * lane;
  const random = rng(seed);
  const strands = people.map((answers) => {
    const lane = 0.14 + 0.72 * random();
    return { d: smooth(answers.map((a, c) => [xs[c], at(segs[c][a], lane)])), tone: lit(answers) ? tone(answers) : null };
  });
  const a = (key, extra = '') => (anim?.[key] === undefined ? '' : ` data-in="${anim[key]}" data-rise="0"${extra}`);

  const crowd = `<g fill="none" stroke="${t.strand}" stroke-width="${r1(1.1 * k)}" stroke-opacity="0.55"${a('crowd')}>${strands.filter((s) => !s.tone).map((s) => `<path d="${s.d}"/>`).join('')}</g>`;
  const wipe = anim?.lit === undefined ? '' : `<clipPath id="${id}-w"><rect x="0" y="-20" width="0" height="${height + 40}" data-wipe="${anim.lit},${width},1.4"/></clipPath>`;
  const colours = [...new Set(strands.map((s) => s.tone).filter(Boolean))];
  const coloured = colours.map((c) => `<g fill="none" stroke="${t[c]}" stroke-width="${r1(1.5 * k)}" stroke-opacity="0.9"${wipe ? ` clip-path="url(#${id}-w)"` : ''}>${strands.filter((s) => s.tone === c).map((s) => `<path d="${s.d}"/>`).join('')}</g>`).join('');

  const rails = segs.map((ss, c) => {
    const casing = `<rect x="${r1(xs[c] - rail / 2 - gnd)}" y="${r1(top - gnd)}" width="${r1(rail + 2 * gnd)}" height="${r1(bottom - top + 2 * gnd)}" rx="${r1((rail + 2 * gnd) / 2)}" fill="${ground}"/>`;
    const bars = ss.map((s) => `<rect x="${r1(xs[c] - rail / 2)}" y="${r1(s.start)}" width="${r1(rail)}" height="${r1(Math.max(s.size, 1))}" rx="${r1(Math.min(rail, Math.max(s.size, 1)) / 2)}" fill="${t.stop}"/>`).join('');
    const delay = anim?.rails === undefined ? '' : ` data-in="${(anim.rails + c * 0.08).toFixed(2)}" data-rise="0"`;
    return `<g${delay}>${casing}${bars}</g>`;
  }).join('');

  // Answers beside their rails, each on a cut of ground so the strands stop short of it, as they do at the rails.
  const names = segs.map((ss, c) => (named.includes(c) ? ss.filter((s) => s.size >= 15 * k).map((s) => {
    const colour = tones[s.label] ? t[tones[s.label]] : t.ink3;
    const x = xs[c] + rail / 2 + gnd + 4 * k, w = s.label.length * 7.85 * k + 12 * k;
    return `<rect x="${r1(x - 6 * k)}" y="${r1(s.mid - 11 * k)}" width="${r1(w)}" height="${r1(22 * k)}" rx="${r1(4 * k)}" fill="${ground}"/>`
      + `<text x="${r1(x)}" y="${r1(s.mid + 4.5 * k)}" fill="${colour}" style="font:${tones[s.label] ? 500 : 400} ${r1(13 * k)}px var(--mono)">${esc(s.label)}</text>`;
  }).join('') : '')).join('');
  const factNames = facts.map((f, c) => `<text x="${r1(xs[c] - (c === 0 ? rail / 2 : 0))}" y="${r1(bottom + 30 * k)}" text-anchor="${c === 0 ? 'start' : 'middle'}" fill="${t.ink3}" style="font:400 ${r1(13 * k)}px var(--mono);letter-spacing:.02em">${esc(f.name)}</text>`).join('');

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true" style="display:block;overflow:visible">
    ${wipe ? `<defs>${wipe}</defs>` : ''}${crowd}${coloured}${rails}<g${a('names')}>${names}${factNames}</g></svg>`;
}

// ---------- Waffle ----------

/**
 * A crowd counted as squares in reading order, ten to a row, each in the colour of its group. groups: [{ n, tone }]
 * with tone a theme key. `attrs(n)` adds attributes to square n, for the video's wave.
 */
export function waffle({ t, groups, cols = 10, cell = 12, gap = 3, attrs = () => '' }) {
  const fills = groups.flatMap((g) => Array(g.n).fill(t[g.tone]));
  const step = cell + gap, rows = Math.ceil(fills.length / cols), w = cols * step - gap, h = rows * step - gap, rx = r1(cell / 5);
  const squares = fills.map((fill, n) => `<rect x="${(n % cols) * step}" y="${Math.floor(n / cols) * step}" width="${cell}" height="${cell}" rx="${rx}" fill="${fill}"${attrs(n)}/>`).join('');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true" style="display:block;overflow:visible">${squares}</svg>`;
}
