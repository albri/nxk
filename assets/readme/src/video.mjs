// Renders the nxk launch video and its poster from figures.mjs:
//   assets/nxk-launch.mp4         1920 × 1080, 30 fps, about 50 seconds, no sound
//   assets/nxk-launch-poster.png  a still from the opening
// It tells the README's story: give your agent a crowd, ask, follow the difference, change the work. Then the benchmark,
// where a run marked `pending` in figures.mjs draws as a dashed placeholder until its numbers are filled in.
//
//   node assets/readme/src/video.mjs               the MP4 and the poster
//   node assets/readme/src/video.mjs --at 3,21,40  stills at those seconds, for checking, in a temporary folder
//
// Needs what render.mjs needs (playwright-core, a Chromium, and the same font variables), plus ffmpeg:
//   FFMPEG   path to ffmpeg, if it isn't on PATH
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { banner, benchmark, library } from './figures.mjs';

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const VIDEO = join(ASSETS, 'nxk-launch.mp4');
const POSTER = join(ASSETS, 'nxk-launch-poster.png');
const W = 1920, H = 1080, FPS = 30, M = 120;

// The brand's motion: things arrive in 0.32 s and leave in 0.25 s, data moves in 0.9 s, and a crowd moves as a wave
// with the last dot at most 0.3 s behind the first. Everything eases out on the brand curve.
const MOTION = { MOVE: 0.32, OUT: 0.25, DATA: 0.9, WAVE: 0.3 };

// Scene lengths in seconds, in order. Each scene fades out in its last 0.3 s; the last one holds.
const SCENES = { open: 4.5, intro: 3.6, s1: 4.4, s2: 5.6, s3: 7.2, s4: 5.8, bench: 14.6, close: 5.2 };
const T = {};
let clock = 0;
for (const [k, d] of Object.entries(SCENES)) { T[k] = clock; clock += d; }
const END = clock;
const n2 = (v) => +v.toFixed(2);
const at = (k, o = 0) => n2(T[k] + o);
const exit = (k) => { const ks = Object.keys(SCENES), next = ks[ks.indexOf(k) + 1]; return next ? n2(T[next] - 0.3) : Infinity; };
const POSTER_AT = at('open', 3.2);

// Pine for the opening and the end, as on the banner; the family's mist for the story and the benchmark, with the
// figures' light colours. Marigold points at one thing: the difference the agent follows.
const PINE = { bg: '#053727', b: '#3ea17d', x: '#72c5a3', lit: ['#e7f6ef', '#82d1b0'], word: '#ffffff' };
const MIST = {
  bg: '#f4f6f9', panel: '#ffffff', track: '#e8ecf2', line: '#e1e5ec', strong: '#c8cfda',
  ink: '#0b1222', ink2: '#475165', ink3: '#687286', hero: '#08553e', mid: '#3b9a78', soft: '#e2f1e9',
  crowd: '#587fc8', look: '#e89a0c', b: '#3b9a78', x: '#05402d', lit: ['#1c7e5e', '#043d2b'], word: '#083f2e',
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const vars = (t) => Object.entries(t).filter(([, v]) => typeof v === 'string').map(([k, v]) => `--${k}:${v}`).join(';');
// data-in: arrives at a (fading in and rising), data-out: leaves at b
const fade = (a, b = Infinity, rise = 14) => `data-in="${n2(a)}"${Number.isFinite(b) ? ` data-out="${n2(b)}"` : ''}${rise === 14 ? '' : ` data-rise="${rise}"`}`;
const mix = (a, b, k) => '#' + [0, 2, 4].map((o) => Math.round(parseInt(a.slice(1 + o, 3 + o), 16) * (1 - k) + parseInt(b.slice(1 + o, 3 + o), 16) * k).toString(16).padStart(2, '0')).join('');

// ---------- the mark: the falling stroke, the lit rising stroke, and the overprint where they cross ----------
// Both strokes run left to right, so the mark can draw itself as two answers crossing.

const FALL = 'M5.815 6.315C12.11 6.315 14.057 13.095 16 16.24C18.045 19.549 19.89 26.685 26.185 26.685';
const RISE = 'M5.815 26.685C12.11 26.685 13.955 19.549 16 16.24C17.943 13.095 19.89 6.315 26.185 6.315';
let ids = 0;

function mark(t, size, draw) {
  const id = `mk${++ids}`, d = draw === undefined ? '' : ` pathLength="1" data-draw="${n2(draw)}"`;
  const s = `fill="none" stroke-width="5.63" stroke-linecap="round"${d}`;
  return `<svg width="${n2(size)}" height="${n2(size)}" viewBox="0 0 32 32" aria-hidden="true"><defs>`
    + `<linearGradient id="${id}-lit" gradientUnits="userSpaceOnUse" x1="0" y1="3.5" x2="0" y2="29.5"><stop offset="0" stop-color="${t.lit[0]}"/><stop offset="1" stop-color="${t.lit[1]}"/></linearGradient>`
    + `<mask id="${id}-x" maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="32"><path d="${RISE}" stroke="#fff" ${s}/></mask></defs>`
    + `<path d="${FALL}" stroke="${t.b}" ${s}/><path d="${RISE}" stroke="url(#${id}-lit)" ${s}/><path d="${FALL}" stroke="${t.x}" ${s} mask="url(#${id}-x)"/></svg>`;
}

// The family lockup: the mark at 1.3 times the name, a third of an em apart.
const lockup = (t, size) => `<span class="lock" style="font-size:${size}px;color:${t.word}">${mark(t, size * 1.3)}<span>nxk</span></span>`;

// ---------- opening: the banner, coming alive. Each person's two answers start level, then cross ----------

function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// The banner's 60 people, drawn exactly as render.mjs draws them (same seed, same order of draws).
function bannerPeople() {
  const r = rng(7), n = 60, out = [];
  const gauss = () => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
  const S = (v) => 1 / (1 + Math.exp(-8.5 * (v - 0.5)));
  const clamp = (v) => Math.min(0.985, Math.max(0.015, v));
  for (let i = 0; i < n; i++) {
    const v = (i + 0.5 + (r() - 0.5) * 0.9) / n;
    const e = clamp(0.04 + 0.92 * S(v) + 0.045 * gauss());
    const m = clamp(0.04 + 0.92 * (1 - S(v)) + 0.045 * gauss());
    out.push({ v, e, m, vm: v + (r() - 0.5) * 0.012 });
  }
  return out;
}

function openScene() {
  const t = PINE, out = exit('open'), k = 760 / 360, fw = 760, fh = Math.round(286 * k), fx = W - M - fw, fy = 216;
  const px = (v) => 14 * k + v * (fw - 28 * k), py = (p) => 14 * k + (1 - p) * (fh - 28 * k);
  const people = bannerPeople(), last = people.length - 1, y0 = n2(py(0.5));
  const dot = (i, v, p, fill) => {
    const show = at('open', 0.3) + (i / last) * MOTION.WAVE, move = at('open', 0.95) + (i / last) * MOTION.WAVE;
    return `<circle cx="${n2(px(v))}" cy="${y0}" r="${n2(4.4 * k)}" fill="${fill}" opacity="0" data-od="${y0},${n2(py(p))},${n2(show)},${n2(move)}"/>`;
  };
  const morning = people.map((p, i) => dot(i, p.vm, p.m, t.b)).join('');
  const evening = people.map((p, i) => dot(i, p.v, p.e, mix(t.lit[1], t.lit[0], p.e))).join('');
  return `<section class="scene pine" ${fade(-1, out, 0)}>
    <div class="abs" style="left:${M}px;top:104px">${lockup(t, 46)}</div>
    <h1 class="abs o-h1" style="left:${M}px;top:348px">${banner.title.map(esc).join('<br>')}</h1>
    <p class="abs o-lead" style="left:${M}px;top:618px;width:760px" ${fade(at('open', 1.5))}>${esc(banner.lead)}</p>
    <svg class="abs" style="left:${fx}px;top:${fy}px;overflow:visible" width="${fw}" height="${fh}" aria-hidden="true">${morning}${evening}</svg>
    <p class="abs o-cap" style="right:${M}px;top:${fy + fh + 22}px" ${fade(at('open', 2.3), Infinity, 0)}>${esc(banner.caption)}</p>
  </section>`;
}

// ---------- the library: one decision, from the file it starts in to the change ----------

const STAGE = { x: 1340, y: 548 }; // the centre of the right-hand side, where each step's picture sits

function step(i, key, textAt) {
  const s = library.steps[i];
  return `<div class="abs step" style="left:${M}px;top:340px;width:700px" ${fade(at(key, 0.1), exit(key))}>
    <h2><span class="n">${i + 1}</span><span>${esc(s.title)}</span></h2>
    <p ${fade(at(key, textAt))}>${esc(s.text)}</p>
  </div>`;
}

// A file, line by line. lines: [text, kind?, diff?] where kind is 'cm' or 'add', and diff is how the line changes:
// 'del' marks it removed (a '- ' slides in and a line strikes it through), 'gone' closes it up and 'add' opens it.
const LH = 62, CARD_W = 660;
const cardHeight = (n) => 2 + 82 + 40 + n * LH;
function card(lines, top, a, out, lineAt) {
  const body = lines.map(([text, kind, diff], j) => {
    const cls = `ln${kind ? ` ${kind}` : ''}`;
    if (diff?.[0] === 'del') return `<div class="ln" data-diff="del,${n2(diff[1])}"><span class="del"><span class="pre">- </span>${esc(text)}<i class="strike"></i></span></div>`;
    if (diff) return `<div class="${cls}" data-diff="${diff[0]},${n2(diff[1])}">${esc(text)}</div>`;
    return `<div class="${cls}" ${lineAt ? fade(lineAt + j * 0.2, Infinity, 8) : ''}>${esc(text)}</div>`;
  }).join('');
  return `<div class="abs card" style="left:${STAGE.x - CARD_W / 2}px;top:${top}px;width:${CARD_W}px" ${fade(a, out, 18)}>
    <div class="tab">${esc(library.file)}</div><div class="code">${body}</div></div>`;
}

function decisionScene() {
  const d = library, lines = [[d.before[0]], [d.before[1]], [d.question, 'cm']];
  return step(0, 's1', 0.75) + card(lines, Math.round(STAGE.y - cardHeight(3) / 2), at('s1', 0.3), exit('s1'), at('s1', 0.55));
}

function askScene() {
  const d = library, cols = 20, pitch = 42, r = 15, rows = Math.ceil(d.people / cols), w = cols * pitch, h = rows * pitch;
  const top = Math.round(STAGE.y - (h + 36 + 30 + 22 + 50) / 2), left = STAGE.x - w / 2, out = exit('s2');
  const dots = Array.from({ length: d.people }, (_, i) => `<circle cx="${(i % cols) * pitch + pitch / 2}" cy="${Math.floor(i / cols) * pitch + pitch / 2}" r="${r}" fill="${MIST.crowd}" opacity="0" data-wave="${at('s2', 0.4)},${i},${d.people}"/>`).join('');
  const fill = at('s2', 1.35), split = (w * d.overall.morning) / 100;
  const value = (v) => `<b class="num"><span data-count="0,${v},${fill},0">${v}</span>%</b>`;
  return step(1, 's2', 1.9) + `
    <svg class="abs" style="left:${left}px;top:${top}px" width="${w}" height="${h}" aria-hidden="true" ${fade(at('s2', 0.3), out, 0)}>${dots}</svg>
    <div class="abs bar" style="left:${left}px;top:${top + h + 36}px;width:${w}px" ${fade(at('s2', 1.2), out, 0)}>
      <i class="track"></i><i style="left:0;background:var(--mid)" data-grow="${fill},${n2(split - 2)}"></i><i style="right:0;background:var(--hero)" data-grow="${fill},${n2(w - split - 2)}"></i>
    </div>
    <div class="abs split" style="left:${left}px;top:${top + h + 36 + 30 + 18}px;width:${w}px" ${fade(at('s2', 1.2), out, 0)}>
      <span>Morning ${value(d.overall.morning)}</span><span>Evening ${value(d.overall.evening)}</span>
    </div>`;
}

// The crossing. Every group starts at the average, then moves to its own answer, and the lines cross where the
// majority flips. Marigold rings the difference the agent follows.
const CHART = { w: 900, h: 560, x0: 150, x1: 750, mid: 256, ky: 6.4, axis: 500 };
function chartData() {
  const d = library, c = CHART, n = d.byWork.length;
  return {
    ...c, base: c.mid + 50 * c.ky, gx: d.byWork.map((_, i) => c.x0 + (i * (c.x1 - c.x0)) / (n - 1)), overall: d.overall, rows: d.byWork,
    split: at('s3', 1.6), stagger: 0.05, up: 30, down: 56,
  };
}

function differenceScene() {
  const d = library, c = chartData(), out = exit('s3'), last = d.byWork.length - 1, end = d.byWork[last];
  const y = (p) => n2(c.base - c.ky * p), left = STAGE.x - c.w / 2, top = Math.round(STAGE.y - c.h / 2) + 6;
  const dots = (key, fill) => c.gx.map((x) => `<circle class="ch-${key}" cx="${n2(x)}" cy="${y(d.overall[key === 'm' ? 'morning' : 'evening'])}" r="11" fill="${fill}" stroke="${MIST.bg}" stroke-width="4"/>`).join('');
  const settled = n2(c.split + last * c.stagger + MOTION.DATA);
  const label = (id, x, yy, anchor, name, v, a) => `<text id="${id}" x="${n2(x)}" y="${yy}" text-anchor="${anchor}" class="lbl" ${a === undefined ? '' : fade(a, Infinity, 0)}>${name} <tspan class="val" id="${id}v">${v}%</tspan></text>`;
  return step(2, 's3', 3.2) + `
    <svg class="abs chart" style="left:${left}px;top:${top}px;overflow:visible" width="${c.w}" height="${c.h}" aria-hidden="true" ${fade(at('s3', 0.3), out, 0)}>
      <line x1="${c.x0 - 40}" x2="${c.x1 + 40}" y1="${c.axis}" y2="${c.axis}" stroke="${MIST.strong}" stroke-width="2"/>
      <line x1="${c.x0 - 40}" x2="${c.x1 + 40}" y1="${y(50)}" y2="${y(50)}" stroke="${MIST.strong}" stroke-width="2" stroke-dasharray="4 10" stroke-linecap="round"/>
      <text x="${c.x0 - 40}" y="${y(50) - 16}" class="axis">50%</text>
      <path id="ch-m" fill="none" stroke="${MIST.mid}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>
      <path id="ch-e" fill="none" stroke="${MIST.hero}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>
      ${dots('m', MIST.mid)}${dots('e', MIST.hero)}
      <circle cx="${n2(c.x1)}" cy="${y(end.evening)}" r="30" fill="none" stroke="${MIST.look}" stroke-width="5" ${fade(settled + 0.25, Infinity, 0)}/>
      ${label('ch-lm', c.x0 - 28, y(d.overall.morning) - c.up, 'start', 'Morning', d.overall.morning)}
      ${label('ch-le', c.x0 - 28, y(d.overall.evening) + c.down, 'start', 'Evening', d.overall.evening)}
      ${label('ch-re', c.x1 + 28, y(end.evening) - c.up - 20, 'end', 'Evening', end.evening, settled)}
      ${label('ch-rm', c.x1 + 28, y(end.morning) + c.down, 'end', 'Morning', end.morning, settled)}
      ${d.byWork.map((r, i) => `<text x="${n2(c.gx[i])}" y="${c.axis + 50}" text-anchor="middle" class="axis" ${fade(at('s3', 0.9 + i * 0.08), Infinity, 0)}>${esc(r.group)}</text>`).join('')}
    </svg>`;
}

function changeScene() {
  const d = library, a = at('s4', 1.0);
  const lines = [[d.before[0]], [d.before[1], '', ['del', a]], [d.question, 'cm', ['gone', a]],
    ['+ when:', 'add', ['add', a + 0.3]], ...d.after.map((l, j) => [`+   ${l}`, 'add', ['add', a + 0.55 + j * 0.25]])];
  return step(3, 's4', 2.4) + card(lines, Math.round(STAGE.y - cardHeight(lines.length - 1) / 2), at('s4', 0.3), exit('s4'));
}

function introScene() {
  const d = library, out = exit('intro');
  return `<h1 class="abs i-h1" style="left:${M}px;top:330px;width:1500px" ${fade(at('intro', 0.1), out)}>${esc(d.title)}</h1>
    <p class="abs i-lead" style="left:${M}px;top:446px;width:1240px" ${fade(at('intro', 0.4), out)}>${esc(d.lead)}</p>`;
}

// ---------- the benchmark: the model alone against nxk, one check at a time, with a dashed row for any run to come ----------

function benchScene() {
  const d = benchmark, c = d.checks, max = Math.max(16, ...d.runs.map((r) => r.avgGap ?? 0));
  const rowsTop = 470, rowH = 110, unitsX = 540, gaugeW = 852;
  const starts = [at('bench', 1.3), at('bench', 5.9), at('bench', 10.3)];
  const ends = [n2(starts[1] - 0.3), n2(starts[2] - 0.3), exit('bench')];
  const rowY = (r) => rowsTop + r * rowH;
  const swatch = (cls) => `<i class="u ${cls}"></i>`;
  const key = (names) => `<span class="key">${names.map((name, i) => `<span>${swatch('abc'[i])}${esc(name)}</span>`).join('')}</span>`;
  const units = (parts, total, a) => {
    const cls = [];
    for (const [k, n] of parts) for (let i = 0; i < n; i++) cls.push(k);
    while (cls.length < total) cls.push('c');
    return `<div class="units">${cls.map((k, i) => `<i class="u ${k}" data-wave="${n2(a)},${i},${total}"></i>`).join('')}</div>`;
  };
  const toCome = `<span class="chip">${esc(d.toCome)}</span>`;

  // one check: its question and key, then each run's row
  const check = (i, title, legend, row) => {
    const a = starts[i], out = ends[i];
    const rows = d.runs.map((run, r) => {
      const ua = a + 0.35 + r * 0.75, [body, value] = row(run, ua);
      return `<div class="abs cell" style="left:${unitsX}px;top:${rowY(r)}px;width:${W - M - unitsX - 110}px;height:${rowH}px">${body}</div>
        <div class="abs cell value" style="right:${M}px;top:${rowY(r)}px;height:${rowH}px" ${fade(ua + 0.45, Infinity, 0)}><span>${value}</span></div>`;
    }).join('');
    return `<div class="scene" ${fade(a - 0.35, out, 0)}>
      <div class="abs ck-h" style="left:${M}px;top:396px;width:${W - 2 * M}px" ${fade(a, Infinity, 10)}><h2>${esc(title)}</h2>${legend}</div>
      ${rows}</div>`;
  };

  const leading = check(0, c.leading.title, key(c.leading.key), (run, a) => run.pending
    ? [units([], d.questions, a).replace(/u c/g, 'u p'), toCome]
    : [units([['a', run.leading.exact], ['b', run.leading.close]], d.questions, a), `<b class="num">${run.leading.exact + run.leading.close} of ${d.questions}</b> · ${run.leading.exact} exact`]);

  const gaps = check(1, c.gaps.title, key(c.gaps.key), (run, a) => {
    if (run.pending) return [units([], d.gapsCompared, a).replace(/u c/g, 'u p'), toCome];
    if (!run.gaps) return [`<span class="none" ${fade(a, Infinity, 0)}>${esc(c.gaps.none)}</span>`, '–'];
    return [units([['a', run.gaps.clearly], ['b', run.gaps.faintly]], d.gapsCompared, a), `<b class="num">${run.gaps.clearly + run.gaps.faintly} of ${d.gapsCompared}</b> · ${run.gaps.clearly} clearly`];
  });

  const off = check(2, c.avgGap.title, `<span class="key">${esc(c.avgGap.key)}</span>`, (run, a) => run.pending
    ? [`<i class="gauge p" style="width:${gaugeW * 0.6}px" ${fade(a, Infinity, 0)}></i>`, toCome]
    : [`<i class="gauge" data-grow="${n2(a)},${n2((gaugeW * run.avgGap) / max)}"></i>`, `<b>${run.avgGap.toFixed(1)}</b> ${esc(c.avgGap.unit)}`]);

  const out = exit('bench'), la = at('bench', 1.2);
  const labels = d.runs.map((run, r) => `<div class="abs cell label" style="left:${M}px;top:${rowY(r)}px;height:${rowH}px" ${fade(la + r * 0.08, out, 0)}>${esc(run.label)}</div>`).join('');
  const rules = [0, 1, 2, 3].map((r) => `<i class="abs hr" style="left:${M}px;top:${rowY(r) - 1}px;width:${W - 2 * M}px" ${fade(la, out, 0)}></i>`).join('');
  return `<h1 class="abs b-title" style="left:${M}px;top:104px" ${fade(at('bench', 0.1), out)}>${esc(d.title)}</h1>
    <p class="abs b-lead" style="left:${M}px;top:204px;width:1460px" ${fade(at('bench', 0.35), out)}>${esc(d.lead)}</p>
    ${rules}${labels}${leading}${gaps}${off}`;
}

// The footer the README figures have: the lockup, and a note saying what the numbers are.
function footer() {
  return `<div class="abs foot" style="left:${M}px;top:952px;width:${W - 2 * M}px" ${fade(at('intro', 0.1), exit('bench'), 0)}>
    <i class="hr"></i><div class="row">${lockup(MIST, 30)}
      <span class="note" ${fade(at('intro', 0.4), exit('s4'), 0)}>${esc(library.note)}</span>
      <span class="note" ${fade(at('bench', 0.4), Infinity, 0)}>${esc(benchmark.note)}</span></div></div>`;
}

// ---------- the end: the mark draws itself as two answers crossing, then the name, the line and the install ----------

function closeScene() {
  const t = PINE, size = 104;
  return `<section class="scene pine">
    <div class="abs c-lock" style="left:0;top:296px;width:${W}px;font-size:${size}px;color:${t.word}">${mark(t, size * 1.3, at('close', 0.35))}<span ${fade(at('close', 1.0), Infinity, 0)}>nxk</span></div>
    <h1 class="abs c-h1" style="left:0;top:494px;width:${W}px" ${fade(at('close', 1.35))}>${esc(banner.title.join(' '))}</h1>
    <div class="abs" style="left:0;top:648px;width:${W}px;text-align:center" ${fade(at('close', 1.75))}><code class="c-pill">${esc(banner.install)}</code></div>
  </section>`;
}

// ---------- page ----------

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:${PINE.bg}}
body{font-family:var(--font);-webkit-font-smoothing:antialiased}
:root{--font:"Schibsted Grotesk",ui-sans-serif,system-ui,sans-serif;--mono:"Fragment Mono",ui-monospace,Menlo,monospace}
#v{position:relative;width:${W}px;height:${H}px;overflow:hidden;${vars(MIST)}}
#ground{position:absolute;inset:0}
.scene{position:absolute;inset:0}
.abs{position:absolute;display:block}
.lock{display:inline-flex;align-items:center;gap:.32em;font-weight:700;letter-spacing:-0.02em;line-height:1}
.lock svg,.c-lock svg{display:block;flex:none}
.num{font-variant-numeric:tabular-nums}
b{font-weight:600;color:var(--ink)}
h1,h2{font-weight:650;text-wrap:balance}
p{text-wrap:pretty}
.hr{display:block;height:2px;background:var(--line)}

.pine{color:#fff}
.o-h1{font-size:118px;line-height:1.02;letter-spacing:-0.034em}
.o-lead{font-size:36px;line-height:1.5;color:rgb(231 246 239 / .8)}
.o-cap{font-size:28px;line-height:1.4;color:rgb(231 246 239 / .62);text-align:right}

.i-h1{font-size:84px;line-height:1.08;letter-spacing:-0.03em;color:var(--ink)}
.i-lead{font-size:40px;line-height:1.45;color:var(--ink2)}

.step h2{display:flex;gap:26px;align-items:baseline;font-size:64px;line-height:1.1;letter-spacing:-0.026em;color:var(--ink)}
.step h2 .n{flex:none;font:400 38px/1 var(--mono);letter-spacing:0;color:var(--ink3)}
.step p{margin-top:34px;font-size:38px;line-height:1.42;color:var(--ink2);text-wrap:balance}

.card{background:var(--panel);border:2px solid var(--line);border-radius:20px;overflow:hidden;font:400 36px/1 var(--mono);color:var(--ink)}
.card .tab{height:82px;padding:0 32px;border-bottom:2px solid var(--line);font-size:28px;line-height:80px;color:var(--ink3)}
.card .code{padding:20px 0}
.card .ln{position:relative;height:${LH}px;padding:0 32px;line-height:${LH}px;white-space:pre;overflow:hidden}
.card .cm{color:var(--ink3)}
.card .add{background:var(--soft);color:var(--hero)}
.card .del{position:relative;display:inline-block}
.card .del .pre{display:inline-block;overflow:hidden;vertical-align:top}
.card .del .strike{position:absolute;left:0;top:50%;height:2px;width:0;background:currentColor}

.bar{height:30px}
.bar i{position:absolute;top:0;height:100%;border-radius:7px;width:0}
.bar i.track{left:0;width:100%;background:var(--track)}
.split{display:flex;justify-content:space-between;font-size:36px;color:var(--ink2)}

.chart .lbl{font:400 36px var(--font);fill:var(--ink2)}
.chart .val{font-weight:600;fill:var(--ink)}
.chart .axis{font:400 32px var(--font);fill:var(--ink3)}

.b-title{font-size:72px;line-height:1.1;letter-spacing:-0.028em;color:var(--ink)}
.b-lead{font-size:36px;line-height:1.45;color:var(--ink2)}
.ck-h{display:flex;justify-content:space-between;align-items:baseline;gap:40px}
.ck-h h2{font-size:40px;line-height:1.2;font-weight:600;letter-spacing:-0.015em;color:var(--ink)}
.key{display:flex;gap:28px;font-size:28px;color:var(--ink3);white-space:nowrap}
.key span{display:inline-flex;align-items:center;gap:12px}
.key .u{width:24px;height:24px}
.cell{display:flex;align-items:center}
.label{font-size:36px;color:var(--ink2)}
.value{justify-content:flex-end;font-size:34px;color:var(--ink2);white-space:nowrap}
.value b{font-size:38px}
.units{display:flex;gap:6px}
.u{display:block;width:27px;height:27px;border-radius:6px;flex:none}
.u.a{background:var(--hero)}
.u.b{background:var(--mid)}
.u.c{box-shadow:inset 0 0 0 2.5px var(--strong)}
.u.p{border:2.5px dashed var(--strong)}
.gauge{display:block;height:27px;width:0;border-radius:6px;background:var(--mid)}
.gauge.p{background:none;border:2.5px dashed var(--strong)}
.none{font-size:30px;color:var(--ink3);white-space:nowrap}
.chip{display:inline-block;padding:6px 22px;border:2px dashed var(--strong);border-radius:999px;font-size:28px;line-height:1.3;color:var(--ink3)}

.foot .row{position:relative;display:flex;align-items:center;height:84px}
.foot .note{position:absolute;right:0;font-size:28px;color:var(--ink3)}

.c-lock{display:flex;justify-content:center;align-items:center;gap:.32em;font-weight:700;letter-spacing:-0.02em;line-height:1}
.c-h1{font-size:76px;line-height:1.1;letter-spacing:-0.03em;text-align:center;color:#fff}
.c-pill{display:inline-block;padding:24px 32px;border-radius:18px;background:rgb(255 255 255 / .07);border:2px solid rgb(255 255 255 / .14);font:400 40px/1 var(--mono);color:#e7f6ef}
`;

// Runs in the page. seek(t) sets every element to where it is at t seconds, so any frame can be drawn on its own.
function inPage(D) {
  const all = (s) => [...document.querySelectorAll(s)];
  const nums = (el, k) => el.dataset[k].split(',').map(Number);
  function bezier(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const X = (t) => ((ax * t + bx) * t + cx) * t, Y = (t) => ((ay * t + by) * t + cy) * t;
    return (p) => {
      if (p <= 0) return 0;
      if (p >= 1) return 1;
      let lo = 0, hi = 1, t = p;
      for (let i = 0; i < 24; i++) { t = (lo + hi) / 2; if (X(t) < p) lo = t; else hi = t; }
      return Y(t);
    };
  }
  const EASE = bezier(0.2, 0.7, 0.1, 1);
  const c01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const lin = (t, a, b) => c01((t - a) / (b - a));
  const seg = (t, a, b) => EASE(lin(t, a, b));
  const { MOVE, OUT, DATA, WAVE } = D.motion;

  const fades = all('[data-in]').map((el) => ({ el, a: +el.dataset.in, b: el.dataset.out ? +el.dataset.out : Infinity, rise: el.dataset.rise ? +el.dataset.rise : 14 }));
  const waves = all('[data-wave]').map((el) => {
    const [a, i, n] = nums(el, 'wave');
    return { el, a: a + (n > 1 ? (i / (n - 1)) * WAVE : 0), r: el instanceof SVGElement ? +el.getAttribute('r') : 0 };
  });
  const grows = all('[data-grow]').map((el) => { const [a, w] = nums(el, 'grow'); return { el, a, w }; });
  const counts = all('[data-count]').map((el) => { const [from, to, a, dec] = nums(el, 'count'); return { el, from, to, a, dec }; });
  const draws = all('[data-draw]').map((el) => ({ el, a: +el.dataset.draw }));
  const people = all('[data-od]').map((el) => { const [y0, y1, show, move] = nums(el, 'od'); return { el, y0, y1, show, move }; });
  const lines = all('[data-diff]').map((el) => {
    const [kind, a] = el.dataset.diff.split(','), pre = el.querySelector('.pre');
    return { el, kind, a: +a, h: el.offsetHeight, pre, w: pre ? pre.offsetWidth : 0, strike: el.querySelector('.strike') };
  });

  const C = D.chart, byId = (id) => document.getElementById(id);
  const chart = { m: byId('ch-m'), e: byId('ch-e'), dm: all('.ch-m'), de: all('.ch-e'), lm: byId('ch-lm'), lmv: byId('ch-lmv'), le: byId('ch-le'), lev: byId('ch-lev') };
  const y = (v) => C.base - C.ky * v;

  const ground = byId('ground');
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  function groundAt(t) {
    const K = D.ground;
    let i = 0;
    while (i < K.length - 2 && t >= K[i + 1][0]) i++;
    const [t0, c0] = K[i], [t1, c1] = K[i + 1], p = lin(t, t0, t1), a = rgb(c0), b = rgb(c1);
    return `rgb(${a.map((v, j) => Math.round(v + (b[j] - v) * p)).join(',')})`;
  }

  window.seek = (t) => {
    ground.style.background = groundAt(t);
    for (const f of fades) {
      const p = seg(t, f.a, f.a + MOVE), q = f.b < Infinity ? lin(t, f.b, f.b + OUT) : 0;
      f.el.style.opacity = (p * (1 - q)).toFixed(4);
      f.el.style.transform = f.rise && p < 1 ? `translateY(${((1 - p) * f.rise).toFixed(2)}px)` : '';
    }
    for (const w of waves) {
      const p = seg(t, w.a, w.a + MOVE);
      if (w.r) { w.el.setAttribute('opacity', p.toFixed(4)); w.el.setAttribute('r', (w.r * (0.55 + 0.45 * p)).toFixed(2)); }
      else { w.el.style.opacity = p.toFixed(4); w.el.style.transform = `scale(${(0.55 + 0.45 * p).toFixed(4)})`; }
    }
    for (const g of grows) g.el.style.width = `${(g.w * seg(t, g.a, g.a + DATA)).toFixed(2)}px`;
    for (const c of counts) c.el.textContent = (c.from + (c.to - c.from) * seg(t, c.a, c.a + DATA)).toFixed(c.dec);
    for (const d of draws) {
      const p = seg(t, d.a, d.a + DATA * 1.25);
      d.el.style.strokeDasharray = '1 1';
      d.el.style.strokeDashoffset = (1 - p).toFixed(4);
      d.el.style.visibility = p > 0 ? 'visible' : 'hidden';
    }
    for (const o of people) {
      o.el.setAttribute('opacity', seg(t, o.show, o.show + MOVE).toFixed(4));
      o.el.setAttribute('cy', (o.y0 + (o.y1 - o.y0) * seg(t, o.move, o.move + DATA)).toFixed(2));
    }
    for (const l of lines) {
      const p = seg(t, l.a, l.a + MOVE);
      if (l.kind === 'del') {
        l.pre.style.width = `${(l.w * p).toFixed(2)}px`;
        l.strike.style.width = `${(100 * seg(t, l.a + 0.12, l.a + 0.12 + MOVE)).toFixed(2)}%`;
        l.el.style.color = `color-mix(in srgb, var(--ink3) ${(100 * p).toFixed(1)}%, var(--ink))`;
      }
      else if (l.kind === 'gone') { l.el.style.height = `${(l.h * (1 - p)).toFixed(2)}px`; l.el.style.opacity = 1 - p; }
      else if (l.kind === 'add') { l.el.style.height = `${(l.h * p).toFixed(2)}px`; l.el.style.opacity = seg(t, l.a + 0.08, l.a + 0.08 + MOVE); }
    }
    // the crossing: each group moves from the average to its own answer
    const v = C.rows.map((r, i) => {
      const p = seg(t, C.split + i * C.stagger, C.split + i * C.stagger + DATA);
      return { m: C.overall.morning + (r.morning - C.overall.morning) * p, e: C.overall.evening + (r.evening - C.overall.evening) * p };
    });
    const path = (k) => v.map((p, i) => `${i ? 'L' : 'M'}${C.gx[i]} ${y(p[k]).toFixed(2)}`).join('');
    chart.m.setAttribute('d', path('m'));
    chart.e.setAttribute('d', path('e'));
    chart.dm.forEach((el, i) => el.setAttribute('cy', y(v[i].m).toFixed(2)));
    chart.de.forEach((el, i) => el.setAttribute('cy', y(v[i].e).toFixed(2)));
    chart.lm.setAttribute('y', (y(v[0].m) - C.up).toFixed(2));
    chart.lmv.textContent = `${Math.round(v[0].m)}%`;
    chart.le.setAttribute('y', (y(v[0].e) + C.down).toFixed(2));
    chart.lev.textContent = `${Math.round(v[0].e)}%`;
  };
}

function fonts() {
  const { NXK_FONT_SANS: sans, NXK_FONT_MONO: mono } = process.env;
  const face = (family, file, weight) => `@font-face{font-family:"${family}";font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${readFileSync(file).toString('base64')}) format("woff2")}`;
  if (sans && mono) return { link: '', css: face('Schibsted Grotesk', sans, '400 800') + face('Fragment Mono', mono, 400) };
  return { link: '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fragment+Mono&family=Schibsted+Grotesk:wght@400..800&display=block">', css: '' };
}

function html() {
  const font = fonts();
  const body = openScene() + introScene() + decisionScene() + askScene() + differenceScene() + changeScene() + benchScene() + footer() + closeScene();
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8">${font.link}<style>${font.css}${CSS}</style></head>
    <body><div id="v"><div id="ground"></div>${body}</div></body></html>`;
}

// What the page needs to move things: the motion timings, the crossing, and the ground colour over time.
const PLAN = {
  motion: MOTION,
  chart: chartData(),
  ground: [[0, PINE.bg], [at('intro', -0.04), PINE.bg], [at('intro', 0.2), MIST.bg], [at('close', -0.04), MIST.bg], [at('close', 0.2), PINE.bg], [END, PINE.bg]],
};

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core'));
} catch {
  console.error('Needs playwright-core: install it, or set PLAYWRIGHT_CORE to its path.');
  process.exit(1);
}

async function open(browser, markup) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.setContent(markup, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(`(${inPage})(${JSON.stringify(PLAN)})`);
  return page;
}
const shot = async (p, t) => { await p.evaluate((s) => window.seek(s), t); return p.screenshot({ type: 'png' }); };

const args = process.argv.slice(2), atArg = args.indexOf('--at');
const markup = html();
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
try {
  if (atArg >= 0) {
    // stills, for checking a moment without rendering the whole video
    const dir = mkdtempSync(join(tmpdir(), 'nxk-video-'));
    const p = await open(browser, markup);
    for (const s of args[atArg + 1].split(',').map(Number)) {
      const file = join(dir, `t${s.toFixed(2).padStart(5, '0')}.png`);
      writeFileSync(file, await shot(p, s));
      console.log('wrote', file);
    }
  } else {
    // every frame, drawn by four pages at once, then encoded once
    const dir = mkdtempSync(join(tmpdir(), 'nxk-video-')), frames = Math.round(END * FPS), workers = 4;
    const pages = await Promise.all(Array.from({ length: workers }, () => open(browser, markup)));
    let done = 0;
    await Promise.all(pages.map(async (p, w) => {
      for (let f = w; f < frames; f += workers) {
        writeFileSync(join(dir, `f${String(f).padStart(5, '0')}.png`), await shot(p, f / FPS));
        if (++done % 150 === 0) console.log(`${done} of ${frames} frames`);
      }
    }));
    execFileSync(process.env.FFMPEG || 'ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(dir, 'f%05d.png'),
      '-vf', 'scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p,setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-tune', 'animation',
      '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-movflags', '+faststart', VIDEO]);
    rmSync(dir, { recursive: true, force: true });
    console.log('wrote', relative(process.cwd(), VIDEO), `${frames} frames, ${END.toFixed(1)} s`);
    writeFileSync(POSTER, await shot(pages[0], POSTER_AT));
    console.log('wrote', relative(process.cwd(), POSTER));
  }
} finally {
  await browser.close();
}
