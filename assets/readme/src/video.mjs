// Renders the nxk launch video and its poster from figures.mjs, in PersonaGen Route:
//   assets/nxk-launch.mp4         1920 × 1080, 30 fps, about 70 seconds, with sound (it works muted too)
//   assets/nxk-launch-poster.png  a still from the opening
// It tells the README's story in the README's order: give your agent a crowd; ask, follow the difference and change the
// work; every person answers with probabilities; each answer picks the next question; and, once figures.mjs has the
// PersonaGen 4.0 benchmark run, does it point the right way.
// The sound is drawn by sound.mjs from the same timeline, so every cue lands on its cut.
//
//   node assets/readme/src/video.mjs               the MP4 and the poster
//   node assets/readme/src/video.mjs --at 3,21,40  stills at those seconds, for checking, in a temporary folder
//   node assets/readme/src/video.mjs --sound       only the soundtrack, as a WAV in a temporary folder
//
// Needs what render.mjs needs (playwright-core, a Chromium and, optionally, NXK_FONTS), plus ffmpeg:
//   FFMPEG   path to ffmpeg, if it isn't on PATH
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { answers, banner, benchmark, library, tally } from './figures.mjs';
import { esc, fonts, route, THEMES, TONES, TYPE, vars, visitors, waffle, wordmark } from './route.mjs';
import { soundtrack } from './sound.mjs';

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const VIDEO = join(ASSETS, 'nxk-launch.mp4');
const POSTER = join(ASSETS, 'nxk-launch-poster.png');
const W = 1920, H = 1080, FPS = 30, M = 120;

// The brand's motion: things arrive in 0.32 s and leave in 0.25 s, data moves in 0.9 s, and a crowd moves as a wave
// with the last square at most 0.3 s behind the first. Everything eases out on the brand curve.
const MOTION = { MOVE: 0.32, OUT: 0.25, DATA: 0.9, WAVE: 0.3 };

// The benchmark scene waits for the PersonaGen 4.0 run: while a run in figures.mjs is still `pending`, the video goes
// from the Tally run straight to the end. Fill in the numbers, drop `pending`, and render again to bring it back.
const BENCH = !benchmark.runs.some((r) => r.pending);
const LAST = BENCH ? 'bench' : 'follow';

// Scene lengths in seconds, in order. Each scene fades out in its last 0.3 s; the last one holds.
// The Tally run gives each stop HOP seconds, then holds on what changed.
const HOP = 3.5;
const SCENES = {
  open: 4.6, intro: 3.4, s1: 5.1, s2: 6.3, s3: 7.3, s4: 6.5, answers: 7.6, follow: 1.0 + 6 * HOP + 5.4,
  ...(BENCH ? { bench: 10.4 } : {}), close: 5.4,
};
const T = {};
let clock = 0;
for (const [k, d] of Object.entries(SCENES)) { T[k] = clock; clock += d; }
const END = clock;
const n2 = (v) => +v.toFixed(2);
const at = (k, o = 0) => n2(T[k] + o);
const exit = (k) => { const ks = Object.keys(SCENES), next = ks[ks.indexOf(k) + 1]; return next ? n2(T[next] - 0.3) : Infinity; };
const POSTER_AT = at('open', 3.4);

// The sound's cue sheet, filled in as the scenes are built: { t, kind, i? }. sound.mjs turns it into music.
const CUES = [];
const cue = (t, kind, i = 0) => { CUES.push({ t: n2(t), kind, i }); };

// Night for the opening and the end, as on the banner; Paper for the story and the benchmark.
const NIGHT = THEMES.night;
const PAPER = THEMES.paper;

// data-in: arrives at a (fading in and rising), data-out: leaves at b
const fade = (a, b = Infinity, rise = 14) => `data-in="${n2(a)}"${Number.isFinite(b) ? ` data-out="${n2(b)}"` : ''}${rise === 14 ? '' : ` data-rise="${rise}"`}`;
// data-tw: CSS properties that move from one value to another, starting at a, over the brand's data time
const tw = (...moves) => `data-tw='${JSON.stringify(moves.map(([a, prop, from, to, unit = '%']) => [n2(a), prop, from, to, unit]))}'`;

// The title and lead every Paper section after the library opens with.
function heading(key, title, lead) {
  const out = exit(key);
  return `<h1 class="abs s-title" style="left:${M}px;top:84px;width:${W - 2 * M}px" ${fade(at(key, 0.1), out)}>${esc(title)}</h1>
    <p class="abs s-lead" style="left:${M}px;top:182px;width:1500px" ${fade(at(key, 0.35), out)}>${lead}</p>`;
}

// ---------- opening: the banner, coming alive. The rails, then the crowd, then the two groups that answer apart ----------

function openScene() {
  const t = NIGHT, out = exit('open');
  const { people, facts, tone } = visitors(library);
  const lit = (p) => (p[2] === 0 && p[3] === 0) || (p[2] === 2 && p[3] === 1);
  const drawing = route({
    t, ground: t.page, facts, people, lit, tone, width: 820, height: 660, k: 1.75, right: 172, named: [2, 3], tones: TONES,
    anim: { rails: at('open', 0.1), crowd: at('open', 0.45), lit: at('open', 1.05), names: at('open', 2.0) },
  });
  cue(at('open', 0), 'open');
  cue(at('open', 1.05), 'sweep');
  cue(at('open', 2.0), 'pluck', 0);
  return `<section class="scene night" style="${vars(t)}" ${fade(-1, out, 0)}>
    <div class="abs" style="left:${M}px;top:118px">${wordmark(96)}</div>
    <h1 class="abs o-h1" style="left:${M}px;top:330px">${banner.title.map(esc).join('<br>')}</h1>
    <p class="abs o-lead" style="left:${M}px;top:640px;width:720px" ${fade(at('open', 1.5))}>${esc(banner.lead)}</p>
    <div class="abs" style="right:${M - 20}px;top:176px">${drawing}</div>
  </section>`;
}

// ---------- the library: one decision, from the file it starts in to the change ----------

const STAGE = { x: 1340, y: 580 }; // the centre of the right-hand side, where each step's picture sits
const KEYS = ['s1', 's2', 's3', 's4'];

function introScene() {
  const d = library, out = exit('intro');
  cue(at('intro', 0.1), 'cut');
  return `<h1 class="abs i-h1" style="left:${M}px;top:350px;width:1500px" ${fade(at('intro', 0.1), out)}>${esc(d.title)}</h1>
    <p class="abs i-lead" style="left:${M}px;top:472px;width:1240px" ${fade(at('intro', 0.4), out)}>${esc(d.lead)}</p>`;
}

// The four steps as stops on one line, the step on screen lit. The rings carry the order, so the steps need no numbers.
function stepLine() {
  const gapX = 236, top = 196, r = 21;
  const rail = `<i class="abs rail" style="left:${M + r}px;top:${top + r - 5}px;width:${gapX * 3}px"></i>`;
  const rings = KEYS.map((key, i) => {
    cue(at(key, 0.05), 'ring', i);
    return `<i class="abs ring" style="left:${M + i * gapX}px;top:${top}px"></i>
    <i class="abs ring lit" style="left:${M + i * gapX}px;top:${top}px" ${fade(at(key, 0.05), exit(key), 0)}></i>`;
  }).join('');
  return `<div class="scene" ${fade(at('s1', -0.1), exit('s4'), 0)}>${rail}${rings}</div>`;
}

function step(i, key, textAt) {
  const s = library.steps[i];
  return `<div class="abs step" style="left:${M}px;top:330px;width:720px" ${fade(at(key, 0.1), exit(key))}>
    <h2>${esc(s.title)}</h2>
    <p ${fade(at(key, textAt))}>${esc(s.text)}</p>
  </div>`;
}

// A file, line by line. lines: [text, kind?, diff?, group?] where kind is 'cm' or 'add', and diff is how the line
// changes: 'del' marks it removed (a '- ' slides in and a line strikes it through), 'gone' closes it up and 'add' opens
// it. A group colours the line in its kind of work's colour.
const LH = 56, CARD_W = 660;
const cardHeight = (n) => 2 + 76 + 36 + n * LH;
function card(lines, top, a, out, lineAt) {
  const body = lines.map(([text, kind, diff, group], j) => {
    const cls = `ln${kind ? ` ${kind}` : ''}${group ? ` t-${TONES[group]}` : ''}`;
    if (diff?.[0] === 'del') return `<div class="ln" data-diff="del,${n2(diff[1])}"><span class="del"><span class="pre">- </span>${esc(text)}<i class="strike"></i></span></div>`;
    if (diff) return `<div class="${cls}" data-diff="${diff[0]},${n2(diff[1])}">${esc(text)}</div>`;
    return `<div class="${cls}" ${lineAt ? fade(lineAt + j * 0.2, Infinity, 8) : ''}>${esc(text)}</div>`;
  }).join('');
  return `<div class="abs card" style="left:${STAGE.x - CARD_W / 2}px;top:${top}px;width:${CARD_W}px" ${fade(a, out, 18)}>
    <div class="tab">${esc(library.file)}</div><div class="code">${body}</div></div>`;
}

function decisionScene() {
  const d = library, lines = [[d.before[0]], [d.before[1]], [d.question, 'cm']];
  cue(at('s1', 0.55), 'type');
  return step(0, 's1', 0.75) + card(lines, Math.round(STAGE.y - cardHeight(3) / 2), at('s1', 0.3), exit('s1'), at('s1', 0.55));
}

// The hundred likely visitors, one square each in the colour of their kind of work, arriving as a wave.
function askScene() {
  const d = library, cols = 10, cell = 40, gap = 10, side = cols * (cell + gap) - gap, out = exit('s2'), wave = at('s2', 0.45);
  const top = Math.round(STAGE.y - (side + 46 + 50) / 2), left = STAGE.x - side / 2;
  const squares = waffle({ t: PAPER, groups: d.mix.map((m) => ({ n: m.n, tone: TONES[m.group] })), cell, gap, attrs: (n) => ` data-wave="${wave},${n},100"` });
  const counts = at('s2', 1.0);
  cue(wave, 'wave');
  const legend = d.mix.map((m) => `<span class="t-${TONES[m.group]}"><i></i>${esc(m.group)} <b class="num"><span data-count="0,${m.n},${counts},0">${m.n}</span></b></span>`).join('');
  return step(1, 's2', 1.6) + `
    <div class="abs" style="left:${left}px;top:${top}px" ${fade(at('s2', 0.3), out, 0)}>${squares}</div>
    <div class="abs legend" style="left:${left}px;top:${top + side + 46}px" ${fade(at('s2', 0.9), out, 0)}>${legend}</div>`;
}

// How far each group leans from an even split. Every dot starts on the middle line, then moves to its own answer.
function differenceScene() {
  const d = library, out = exit('s3'), move = at('s3', 1.0), w = 880, rowH = 118;
  const rows = [{ group: 'All visitors', ...d.overall }, ...d.byWork];
  const top = Math.round(STAGE.y - (rows.length * rowH + 70) / 2), left = W - M - 20 - w;
  const says = (r) => (r.morning === r.evening ? 'Even' : r.morning > r.evening ? `${r.morning}% mornings` : `${r.evening}% evenings`);
  const body = rows.map((r, i) => {
    const a = n2(move + i * 0.35), from = Math.min(r.evening, 50), span = Math.abs(r.evening - 50);
    cue(a, 'move', i);
    return `<div class="lrow t-${TONES[r.group] ?? 'ink'}" style="top:${70 + i * rowH}px" ${fade(at('s3', 0.35 + i * 0.08), out, 10)}>
      <div class="lname"><span>${esc(r.group)}</span><b class="num" ${fade(a + 0.5, Infinity, 0)}>${says(r)}</b></div>
      <div class="ltrack"><i class="stem" style="left:50%;width:0%" ${tw([a, 'left', 50, from], [a, 'width', 0, span])}></i><i class="dot" style="left:50%" ${tw([a, 'left', 50, r.evening])}></i></div>
    </div>`;
  }).join('');
  return step(2, 's3', 2.6) + `<div class="abs lean" style="left:${left}px;top:${top}px;width:${w}px;height:${70 + rows.length * rowH}px" ${fade(at('s3', 0.3), out, 0)}>
    <div class="axis"><span>Mornings</span><span>Evenings</span></div>${body}</div>`;
}

function changeScene() {
  const d = library, a = at('s4', 1.0);
  const groupOf = (line) => (line === '# retired' ? 'Retired' : line === '# full-time' ? 'Full-time' : undefined);
  const lines = [[d.before[0]], [d.before[1], '', ['del', a]], [d.question, 'cm', ['gone', a]],
    ['+ when:', 'add', ['add', a + 0.3]], ...d.after.map((l, j) => [`+   ${l}`, 'add', ['add', a + 0.55 + j * 0.2], groupOf(l)])];
  cue(a, 'strike');
  d.after.forEach((_, j) => { if (j % 2 === 0) cue(a + 0.55 + j * 0.2, 'type', j); });
  return step(3, 's4', 2.4) + card(lines, Math.round(STAGE.y - cardHeight(lines.length - 1) / 2), at('s4', 0.3), exit('s4'));
}

// ---------- every answer: three people, one question, each answer a column as tall as its probability ----------

function answersScene() {
  const d = answers, out = exit('answers'), rowsTop = 420, rowH = 172, colsX = 900, colsW = W - M - colsX;
  cue(at('answers', 0.1), 'cut');
  const head = `<div class="abs options" style="left:${colsX}px;top:${rowsTop - 56}px;width:${colsW}px" ${fade(at('answers', 0.6), out, 0)}>${d.options.map((o) => `<span>${esc(o)}</span>`).join('')}</div>`;
  const people = d.people.map((p, r) => {
    const a = at('answers', 1.2 + r * 1.3), top = p.p.indexOf(Math.max(...p.p));
    cue(a + 0.15, 'note', r);
    const cols = p.p.map((share, i) => `<span class="col${i === top ? ' top' : ''}"><i style="height:0%" ${tw([a + i * 0.06, 'height', 0, share])}><b class="num" ${fade(a + 0.5, Infinity, 0)}>${share}%</b></i></span>`).join('');
    return `<div class="abs person" style="left:${M}px;top:${rowsTop + r * rowH}px;width:${W - 2 * M}px;height:${rowH}px" ${fade(a - 0.3, out, 10)}>
      <div class="who"><h2>${esc(p.name)}</h2><p class="role">${esc(p.role)}</p><p class="facts">${p.facts.map((f) => `<span>${esc(f)}</span>`).join('')}</p></div>
      <div class="spread" style="left:${colsX - M}px;width:${colsW}px">${cols}</div></div>`;
  }).join('');
  return heading('answers', d.title, `Three people from the same crowd, asked: “${esc(d.question)}” (${esc(d.source)})`) + head + people;
}

// ---------- following: the Tally run as a route. Each stop arrives on the left; what it showed fills the right ----------

function followScene() {
  const d = tally, out = exit('follow'), railTop = 352, gapY = 84, panelX = 900, panelW = W - M - panelX;
  const hopAt = (i) => at('follow', 1.0 + i * HOP);
  const endAt = hopAt(d.hops.length);
  cue(at('follow', 0.1), 'cut');
  const stops = [...d.hops.map((h) => h.title), 'What changed'];
  // the rail grows down to each stop as it arrives
  const grow = stops.slice(1).map((_, i) => [n2((i + 1 < d.hops.length ? hopAt(i + 1) : endAt) - 0.35), 'height', i * gapY, (i + 1) * gapY, 'px']);
  const rail = `<i class="abs vrail" style="left:${M + 16}px;top:${railTop + 21}px;height:0px" ${fade(at('follow', 0.7), out, 0)} ${tw(...grow)}></i>`;
  const left = stops.map((title, i) => {
    const a = i < d.hops.length ? hopAt(i) : endAt, until = i < d.hops.length ? n2(hopAt(i + 1) - 0.05) : out;
    cue(a, i < d.hops.length ? 'hop' : 'land', i);
    return `<i class="abs ring" style="left:${M}px;top:${railTop + i * gapY}px" ${fade(a, out, 0)}></i>
      <i class="abs ring lit" style="left:${M}px;top:${railTop + i * gapY}px" ${fade(a, until, 0)}></i>
      <div class="abs stop" style="left:${M + 76}px;top:${railTop + i * gapY - 2}px;width:${panelX - M - 140}px" ${fade(a, out, 10)}><span ${fade(a, until, 0)} class="on">${esc(title)}</span><span class="off">${esc(title)}</span></div>`;
  }).join('');
  const bars = (rows, a) => `<div class="hbars">${rows.map(([label, share, acted], j) => `<span class="hl${acted ? ' acted' : ''}">${esc(label)}</span>
    <span class="track${acted ? ' acted' : ''}"><i style="width:0%" ${tw([a + j * 0.08, 'width', 0, share])}></i></span><b class="hv num${acted ? ' acted' : ''}">${share}%</b>`).join('')}</div>`;
  const panels = d.hops.map((h, i) => {
    const a = hopAt(i), until = n2(hopAt(i + 1) - 0.3);
    return `<div class="abs panel" style="left:${panelX}px;top:${railTop - 4}px;width:${panelW}px" ${fade(a + 0.1, until, 12)}>
      <p class="what">${esc(h.text)}</p>${h.bars ? bars(h.bars, a + 0.35) : ''}<p class="then" ${fade(a + 0.55, Infinity, 0)}>${esc(h.then)}</p>
      ${h.left ? `<p class="left" ${fade(a + 0.75, Infinity, 0)}><b>Left it.</b> ${esc(h.left)}</p>` : ''}</div>`;
  }).join('');
  const pages = `<div class="abs pages" style="left:${panelX}px;top:${railTop - 4}px;width:${panelW}px" ${fade(endAt + 0.1, out, 12)}>${d.pages.map((p, i) => `<div class="page${i ? ' after' : ''}">
      <span class="when">${esc(p.when)}</span><span class="phead">${esc(p.headline)}</span><span class="offer">${esc(p.offer)}</span>
      <span class="picked"><span class="track"><i style="width:0%" ${tw([endAt + 0.5 + i * 0.5, 'width', 0, p.picked])}></i></span><span>Headline picked by <b class="num"><span data-count="0,${p.picked},${n2(endAt + 0.5 + i * 0.5)},${p.picked < 1 ? 1 : 0}">${p.picked}</span>%</b></span></span></div>`).join('')}
    <p class="held" ${fade(endAt + 1.6, Infinity, 0)}>${esc(d.held)}</p></div>`;
  return heading('follow', d.title, esc(d.lead)) + rail + left + panels + pages;
}

// ---------- the benchmark: the gaps between groups, then the distance from the survey, with a dashed row to come ----------

function arrow(way) {
  return `<svg viewBox="0 0 16 12" class="arrow ${way}" aria-hidden="true"><path d="${way === 'against' ? 'M14 6H3M7 2 3 6l4 4' : 'M2 6h11M9 2l4 4-4 4'}"/></svg>`;
}

function benchScene() {
  const d = benchmark, c = d.checks, out = exit('bench'), rowH = 66, labelW = 420, trackW = 930;
  const gapsAt = at('bench', 1.3), distAt = at('bench', 5.0);
  cue(at('bench', 0.1), 'cut');
  const chip = `<span class="chip">${esc(d.toCome)}</span>`;
  const row = (top, run, track, value, a, h = rowH) => `<div class="abs brow${run.nxk ? ' nxk' : ''}" style="left:${M}px;top:${top}px;width:${W - 2 * M}px;height:${h}px" ${fade(a, out, 0)}>
    <span class="label">${esc(run.label)}</span><div class="rt" style="left:${labelW}px;width:${trackW}px">${track}</div><span class="value" ${fade(a + 0.45, Infinity, 0)}>${value}</span></div>`;

  // the gaps: an arrow each, with the survey or against it
  const g = c.gaps, gTop = 316, ways = ['clearly', 'faintly', 'against'];
  const gHead = `<div class="abs ck-h" style="left:${M}px;top:${gTop}px;width:${W - 2 * M}px" ${fade(gapsAt - 0.3, out, 10)}><h2>${esc(g.title)}</h2><span class="keys">${g.key.map((k, i) => `<span>${arrow(ways[i])}${esc(k)}</span>`).join('')}</span></div>`;
  const gRows = d.runs.map((run, r) => {
    const a = n2(gapsAt + r * 0.7), top = gTop + 60 + r * rowH;
    if (run.pending) return row(top, run, '<i class="placeholder"></i>', chip, a);
    if (!run.gaps) return row(top, run, `<span class="none">${esc(g.none)}</span>`, '–', a);
    const list = [...Array(run.gaps.clearly).fill('clearly'), ...Array(run.gaps.faintly).fill('faintly')];
    while (list.length < d.gapsCompared) list.push('against');
    cue(a + 0.3, 'wave', 1);
    return row(top, run, `<div class="arrows">${list.map((way, i) => `<span data-wave="${n2(a + 0.3)},${i},${list.length}">${arrow(way)}</span>`).join('')}</div>`,
      `<b class="num">${run.gaps.clearly + run.gaps.faintly} of ${d.gapsCompared}</b> · ${run.gaps.clearly} clearly`, a);
  }).join('');

  // the distance: both recorded runs as points on one scale; nxk's slides in from the model alone's. A later nxk run
  // (4.0) fills in the dashed row below with its own track.
  const v = c.avgGap, dTop = gTop + 60 + 3 * rowH + 44;
  const [alone, nxk, ...later] = d.runs.filter((r) => !r.pending);
  const x = (n) => (n / v.max) * 100, move = n2(distAt + 0.9);
  cue(distAt + 0.3, 'pluck', 1);
  cue(move, 'move', 4);
  const scale = `<div class="dist">
      <span class="tag" style="left:${x(alone.avgGap)}%" ${fade(distAt + 0.3, Infinity, 0)}>${esc(alone.label)} <b class="num">${alone.avgGap.toFixed(1)}</b></span>
      <div class="dtrack"><i class="gain" style="left:${x(alone.avgGap)}%;width:0%" ${tw([move, 'left', x(alone.avgGap), x(nxk.avgGap)], [move, 'width', 0, x(alone.avgGap - nxk.avgGap)])}></i>
        <i class="ddot" style="left:${x(alone.avgGap)}%" ${fade(distAt + 0.3, Infinity, 0)}></i><i class="ddot nxk" style="left:${x(alone.avgGap)}%" ${fade(move - 0.2, Infinity, 0)} ${tw([move, 'left', x(alone.avgGap), x(nxk.avgGap)])}></i></div>
      <span class="tag nxk" style="left:${x(nxk.avgGap)}%" ${fade(move + 0.6, Infinity, 0)}>${esc(nxk.label)} <b class="num">${nxk.avgGap.toFixed(1)}</b></span>
      <div class="axis">${v.ticks.map((n) => `<span style="left:${x(n)}%">${n}</span>`).join('')}</div></div>`;
  const dHead = `<div class="abs ck-h" style="left:${M}px;top:${dTop}px;width:${W - 2 * M}px" ${fade(distAt - 0.3, out, 10)}><h2>${esc(v.title)}</h2><span class="keys">${esc(v.key)}</span></div>`;
  const points = (run) => `<b class="num">${alone.avgGap.toFixed(1)}</b> to <b class="num aurora">${run.avgGap.toFixed(1)}</b> points`;
  const track = (run, b) => `<div class="dtrack" style="width:914px"><i class="gain" style="left:${x(alone.avgGap)}%;width:0%" ${tw([b, 'left', x(alone.avgGap), x(Math.min(run.avgGap, alone.avgGap))], [b, 'width', 0, x(Math.abs(alone.avgGap - run.avgGap))])}></i>
      <i class="ddot" style="left:${x(alone.avgGap)}%"></i><i class="ddot nxk" style="left:${x(alone.avgGap)}%" ${tw([b, 'left', x(alone.avgGap), x(run.avgGap)])}></i></div>`;
  const below = [...later.map((run) => [run, track(run, n2(distAt + 2.2)), points(run)]), ...d.runs.filter((r) => r.pending).map((run) => [run, '<i class="dline"></i>', chip])];
  if (later.length) cue(distAt + 2.2, 'move', 5);
  const dRows = row(dTop + 60, { label: later.length ? nxk.label : v.both, nxk: later.length > 0 }, scale, points(nxk), distAt, 160)
    + below.map(([run, t, value], i) => row(dTop + 60 + 160 + i * rowH, run, t, value, n2(distAt + 1.6))).join('');
  return heading('bench', d.title, esc(d.lead)) + gHead + gRows + dHead + dRows;
}

// The footer the README figures have: the name, and a note saying what the numbers are.
function footer() {
  const note = (text, from, until) => `<span class="note" ${fade(at(from, 0.4), until, 0)}>${esc(text)}</span>`;
  return `<div class="abs foot" style="left:${M}px;top:976px;width:${W - 2 * M}px" ${fade(at('intro', 0.1), exit(LAST), 0)}>
    <i class="hr"></i><div class="row">${wordmark(36)}
      ${note(library.note, 'intro', exit('s4'))}${note(answers.note, 'answers', exit('answers'))}${note(tally.note, 'follow', BENCH ? exit('follow') : Infinity)}${BENCH ? note(benchmark.note, 'bench', Infinity) : ''}</div></div>`;
}

// ---------- the end: the name, the line and the install, on Night ----------

function closeScene() {
  const t = NIGHT;
  cue(at('close', 0.35), 'close');
  return `<section class="scene night" style="${vars(t)}">
    <div class="abs c-name" style="left:0;top:282px;width:${W}px" ${fade(at('close', 0.35), Infinity, 24)}>${wordmark(210)}</div>
    <h1 class="abs c-h1" style="left:0;top:520px;width:${W}px" ${fade(at('close', 1.0))}>${esc(banner.title.join(' '))}</h1>
    <div class="abs" style="left:0;top:666px;width:${W}px;text-align:center" ${fade(at('close', 1.4))}><code class="c-pill">${esc(banner.install)}</code></div>
  </section>`;
}

// ---------- page ----------

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:${NIGHT.page}}
body{font-family:var(--sans);-webkit-font-smoothing:antialiased}
${TYPE}
#v{position:relative;width:${W}px;height:${H}px;overflow:hidden;${vars(PAPER)}}
#ground{position:absolute;inset:0}
.scene{position:absolute;inset:0}
.abs{position:absolute;display:block}
b{font-weight:600;color:var(--ink)}
h1,h2{font-weight:500;text-wrap:balance}
p{text-wrap:pretty}
.hr{display:block;height:2px;background:var(--hair)}
rect[data-wave]{transform-box:fill-box;transform-origin:center}
.t-aurora{--tone:var(--aurora)} .t-look{--tone:var(--look)} .t-group{--tone:var(--group)} .t-ink{--tone:var(--ink)}

.night{color:var(--ink)}
.o-h1{font:500 124px/1.02 var(--display);letter-spacing:-0.005em}
.o-lead{font-size:36px;line-height:1.5;color:var(--ink2)}

.i-h1{font:500 92px/1.08 var(--display);letter-spacing:-0.01em;color:var(--ink)}
.i-lead{font-size:40px;line-height:1.45;color:var(--ink2)}
.s-title{font:500 72px/1.1 var(--display);letter-spacing:-0.01em;color:var(--ink)}
.s-lead{font-size:34px;line-height:1.45;color:var(--ink2)}

.rail{height:10px;border-radius:5px;background:var(--stop)}
.vrail{width:10px;border-radius:5px;background:var(--stop)}
.ring{width:42px;height:42px;border-radius:50%;border:7px solid var(--ink);background:var(--raised)}
.ring.lit{background:var(--ink)}
.step h2{font:500 66px/1.08 var(--display);letter-spacing:-0.005em;color:var(--ink)}
.step p{margin-top:34px;font-size:38px;line-height:1.42;color:var(--ink2);text-wrap:balance}

.card{background:var(--page);border:2px solid var(--hair);border-radius:16px;overflow:hidden;font:400 34px/1 var(--mono);color:var(--ink)}
.card .tab{height:76px;padding:0 30px;border-bottom:2px solid var(--hair);font-size:26px;line-height:74px;color:var(--ink3)}
.card .code{padding:18px 0}
.card .ln{position:relative;height:${LH}px;padding:0 30px;line-height:${LH}px;white-space:pre;overflow:hidden}
.card .cm{color:var(--ink3)}
.card .add{background:var(--diff)}
.card .t-aurora,.card .t-look{color:var(--tone)}
.card .del{position:relative;display:inline-block}
.card .del .pre{display:inline-block;overflow:hidden;vertical-align:top}
.card .del .strike{position:absolute;left:0;top:50%;height:2px;width:0;background:currentColor}

.legend{display:flex;gap:40px;font-size:34px;color:var(--ink2)}
.legend span{display:inline-flex;align-items:center;gap:14px;white-space:nowrap}
.legend i{display:block;width:26px;height:26px;border-radius:6px;background:var(--tone)}
.legend b{font-weight:500}

.lean .axis{position:absolute;left:0;right:0;top:0;display:flex;justify-content:space-between;padding-bottom:12px;border-bottom:2px solid var(--hair);font:400 30px/1.4 var(--mono);letter-spacing:.02em;color:var(--ink3)}
.lrow{position:absolute;left:0;right:0;display:grid;gap:14px}
.lname{display:flex;justify-content:space-between;font-size:34px;line-height:1.3;color:var(--ink2)}
.lname b{font-weight:500}
.ltrack{position:relative;height:30px;background:linear-gradient(var(--hair),var(--hair)) center/100% 2px no-repeat}
.ltrack::before{content:"";position:absolute;left:50%;top:-8px;bottom:-8px;width:2px;background:var(--edge)}
.ltrack i{position:absolute;top:50%;background:var(--tone)}
.ltrack .stem{height:10px;border-radius:5px;transform:translateY(-50%)}
.ltrack .dot{width:30px;height:30px;border-radius:50%;transform:translate(-50%,-50%)}

.options{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:20px;font-size:28px;line-height:1.25;text-align:center;color:var(--ink2)}
.person{border-bottom:2px solid var(--hair)}
.who{position:absolute;left:0;top:26px;width:740px}
.who h2{font:500 46px/1.1 var(--display);letter-spacing:-0.005em;color:var(--ink)}
.who .role{margin-top:6px;font-size:30px;color:var(--ink2)}
.who .facts{display:flex;margin-top:8px;font-size:25px;white-space:nowrap;color:var(--ink3)}
.who .facts span:not(:last-child)::after{content:"·";display:inline-block;width:1.2em;text-align:center}
.spread{position:absolute;bottom:0;height:150px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:20px;align-items:end}
.col{display:flex;align-items:flex-end;height:120px}
.col i{position:relative;display:block;width:100%;border-radius:6px 6px 0 0;background:color-mix(in srgb,var(--aurora) 38%,transparent)}
.col b{position:absolute;bottom:calc(100% + 8px);left:0;right:0;text-align:center;font:400 28px/1 var(--mono);color:var(--ink3)}
.col.top i{background:var(--aurora)}
.col.top b{font-weight:500;color:var(--ink)}

.stop{font:500 34px/42px var(--display);letter-spacing:-0.005em;white-space:nowrap}
.stop .on{position:absolute;color:var(--ink)}
.stop .off{color:var(--ink3)}
.panel .what{font-size:36px;line-height:1.4;color:var(--ink2)}
.then{margin-top:26px;font-size:34px;line-height:1.35;font-weight:500;color:var(--aurora)}
.then::before{content:"→ "}
.hbars{display:grid;grid-template-columns:fit-content(58%) minmax(0,1fr) 3em;align-items:center;gap:16px 22px;margin-top:28px;font-size:30px;line-height:1.25}
.hl{color:var(--ink2)}
.hv{font:400 28px/1 var(--mono);text-align:right;color:var(--ink2)}
.hl.acted,.hv.acted{font-weight:500;color:var(--ink)}
.track{display:block;height:22px;border-radius:6px;background:var(--hair)}
.track>i{display:block;height:100%;min-width:4px;border-radius:6px;background:var(--group)}
.track.acted>i,.page.after .track>i{background:var(--aurora)}
.left{margin-top:30px;padding:20px 26px;border:2px dashed var(--edge);border-radius:18px;font-size:28px;line-height:1.4;color:var(--ink3)}
.left b{font-weight:500;color:var(--ink2)}
.pages{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:30px;align-items:start}
.pages .held{grid-column:1/-1;font-size:30px;color:var(--ink2)}
.page{display:grid;align-content:start;gap:16px;padding:30px;border:2px solid var(--lineStrong);border-radius:18px;background:var(--page)}
.page.after{border-color:var(--aurora);box-shadow:inset 0 0 0 2px var(--aurora)}
.when{font:400 26px/1.3 var(--mono);letter-spacing:.02em;color:var(--ink3)}
.phead{font:500 40px/1.12 var(--display);color:var(--ink);text-wrap:balance}
.offer{font-size:27px;line-height:1.35;color:var(--ink2)}
.picked{display:grid;gap:12px;margin-top:6px;font-size:28px;color:var(--ink2)}
.picked b{font-weight:500}

.ck-h{display:flex;justify-content:space-between;align-items:baseline;gap:40px;padding-bottom:16px;border-bottom:2px solid var(--hair)}
.ck-h h2{font-size:38px;line-height:1.2;font-weight:600;color:var(--ink)}
.keys{display:flex;gap:30px;font-size:26px;color:var(--ink3);white-space:nowrap}
.keys>span{display:inline-flex;align-items:center;gap:10px}
.keys .arrow{width:30px}
.brow{border-bottom:2px solid var(--hair)}
.brow .label{position:absolute;left:0;top:50%;transform:translateY(-50%);font-size:32px;color:var(--ink2)}
.brow.nxk .label{color:var(--ink)}
.brow .rt{position:absolute;top:50%;transform:translateY(-50%)}
.brow .value{position:absolute;right:0;top:50%;transform:translateY(-50%);font-size:32px;color:var(--ink2);white-space:nowrap}
.brow .none{font-size:28px;color:var(--ink3);white-space:nowrap}
.arrows{display:grid;grid-template-columns:repeat(16,44px);gap:14px}
.arrows>span{display:block;transform-origin:center}
.arrow{display:block;width:100%;aspect-ratio:16/12;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.arrow.clearly{stroke:var(--aurora)}
.arrow.faintly{stroke:color-mix(in srgb,var(--aurora) 45%,transparent)}
.arrow.against{stroke:var(--ink3)}
.placeholder{display:block;width:914px;height:32px;border:2.5px dashed var(--edge);border-radius:8px}
.dline{display:block;width:914px;border-top:2.5px dashed var(--edge)}
.chip{display:inline-block;padding:6px 22px;border:2px dashed var(--edge);border-radius:999px;font:400 26px/1.3 var(--mono);letter-spacing:.02em;color:var(--ink3)}
.dist{position:relative;display:grid;gap:12px;width:914px}
.tag{position:relative;justify-self:start;transform:translateX(-50%);font-size:28px;white-space:nowrap;color:var(--ink2)}
.tag.nxk,.tag.nxk b,.aurora{color:var(--aurora)}
.dtrack{position:relative;height:30px;background:linear-gradient(var(--lineStrong),var(--lineStrong)) center/100% 2px no-repeat}
.dtrack i{position:absolute;top:50%}
.gain{height:10px;border-radius:5px;transform:translateY(-50%);background:color-mix(in srgb,var(--aurora) 45%,transparent)}
.ddot{width:30px;height:30px;border-radius:50%;transform:translate(-50%,-50%);background:var(--group)}
.ddot.nxk{background:var(--aurora)}
.dist .axis{position:relative;height:34px;font:400 26px/1.3 var(--mono);color:var(--ink3)}
.dist .axis span{position:absolute;transform:translateX(-50%)}
.dist .axis span:first-child{transform:none}
.dist .axis span:last-child{transform:translateX(-100%)}

.foot .row{position:relative;display:flex;align-items:center;height:76px}
.foot .note{position:absolute;right:0;font-size:26px;color:var(--ink3)}

.c-name{text-align:center}
.c-h1{font:500 84px/1.1 var(--display);letter-spacing:-0.005em;text-align:center;color:var(--ink)}
.c-pill{display:inline-block;padding:24px 32px;border-radius:16px;background:var(--raised);border:2px solid var(--hair);font:400 40px/1 var(--mono);color:var(--ink)}
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
    return { el, a: a + (n > 1 ? (i / (n - 1)) * WAVE : 0) };
  });
  const tweens = all('[data-tw]').map((el) => ({ el, moves: JSON.parse(el.dataset.tw) }));
  const wipes = all('[data-wipe]').map((el) => { const [a, w, d] = nums(el, 'wipe'); return { el, a, w, d }; });
  const counts = all('[data-count]').map((el) => { const [from, to, a, dec] = nums(el, 'count'); return { el, from, to, a, dec }; });
  const lines = all('[data-diff]').map((el) => {
    const [kind, a] = el.dataset.diff.split(','), pre = el.querySelector('.pre');
    return { el, kind, a: +a, h: el.offsetHeight, pre, w: pre ? pre.offsetWidth : 0, strike: el.querySelector('.strike') };
  });

  const ground = document.getElementById('ground');
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
      f.el.style.translate = f.rise && p < 1 ? `0 ${((1 - p) * f.rise).toFixed(2)}px` : '';
    }
    for (const w of waves) {
      const p = seg(t, w.a, w.a + MOVE);
      w.el.style.opacity = p.toFixed(4);
      w.el.style.transform = `scale(${(0.55 + 0.45 * p).toFixed(4)})`;
    }
    // each property follows the latest of its moves to have started (or sits at the first one's start)
    for (const { el, moves } of tweens) {
      const now = {};
      for (const m of moves) if (!now[m[1]] || m[0] <= t) now[m[1]] = m;
      for (const [a, prop, from, to, unit] of Object.values(now)) el.style[prop] = `${(from + (to - from) * seg(t, a, a + DATA)).toFixed(3)}${unit}`;
    }
    for (const w of wipes) w.el.setAttribute('width', (w.w * seg(t, w.a, w.a + w.d)).toFixed(1));
    for (const c of counts) c.el.textContent = (c.from + (c.to - c.from) * seg(t, c.a, c.a + DATA)).toFixed(c.dec);
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
  };
}

function html() {
  const font = fonts();
  const body = openScene() + introScene() + stepLine() + decisionScene() + askScene() + differenceScene() + changeScene()
    + answersScene() + followScene() + (BENCH ? benchScene() : '') + footer() + closeScene();
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8">${font.link}<style>${font.css}${CSS}</style></head>
    <body><div id="v"><div id="ground"></div>${body}</div></body></html>`;
}

// What the page needs to move things: the motion timings and the ground colour over time.
const PLAN = {
  motion: MOTION,
  ground: [[0, NIGHT.page], [at('intro', -0.04), NIGHT.page], [at('intro', 0.2), PAPER.raised], [at('close', -0.04), PAPER.raised], [at('close', 0.2), NIGHT.page], [END, NIGHT.page]],
};

const require = createRequire(import.meta.url);
let chromium;
const args = process.argv.slice(2), atArg = args.indexOf('--at');
const markup = html();
// The pad's chords and when each starts, one a step or stop, back home at the end. The cues were collected while the
// scenes were built. Without the benchmark, the Tally run lands on the dominant and the end resolves it.
const SECTIONS = [['Dmaj9', T.open], ['Bm9', T.intro], ['Gmaj9', T.s2], ['Em9', T.s3], ['A7sus', T.s4], ['D/Fs', T.answers],
  ['Gmaj9', T.follow], ['Bm9', at('follow', 1.0 + 3 * HOP)],
  ...(BENCH ? [['Dmaj9', at('follow', 1.0 + 6 * HOP)], ['Em9', T.bench], ['A7sus', at('bench', 5.0)]] : [['A7sus', at('follow', 1.0 + 6 * HOP)]]),
  ['Dmaj9', T.close]];

if (args.includes('--sound')) {
  const dir = mkdtempSync(join(tmpdir(), 'nxk-sound-')), file = join(dir, 'nxk-launch.wav');
  writeFileSync(file, soundtrack({ cues: CUES, sections: SECTIONS, duration: END }));
  console.log('wrote', file);
  process.exit(0);
}

try {
  ({ chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core'));
} catch {
  console.error('Needs playwright-core: install it, or set PLAYWRIGHT_CORE to its path.');
  process.exit(1);
}

async function open(browser) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.setContent(markup, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(`(${inPage})(${JSON.stringify(PLAN)})`);
  return page;
}
const shot = async (p, t) => { await p.evaluate((s) => window.seek(s), t); return p.screenshot({ type: 'png' }); };

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
try {
  if (atArg >= 0) {
    // stills, for checking a moment without rendering the whole video
    const dir = mkdtempSync(join(tmpdir(), 'nxk-video-'));
    const p = await open(browser);
    for (const s of args[atArg + 1].split(',').map(Number)) {
      const file = join(dir, `t${s.toFixed(2).padStart(5, '0')}.png`);
      writeFileSync(file, await shot(p, s));
      console.log('wrote', file);
    }
  } else {
    // every frame, drawn by four pages at once, then encoded once with the soundtrack
    const dir = mkdtempSync(join(tmpdir(), 'nxk-video-')), frames = Math.round(END * FPS), workers = 4;
    const pages = await Promise.all(Array.from({ length: workers }, () => open(browser)));
    let done = 0;
    await Promise.all(pages.map(async (p, w) => {
      for (let f = w; f < frames; f += workers) {
        writeFileSync(join(dir, `f${String(f).padStart(5, '0')}.png`), await shot(p, f / FPS));
        if (++done % 150 === 0) console.log(`${done} of ${frames} frames`);
      }
    }));
    const wav = join(dir, 'sound.wav');
    writeFileSync(wav, soundtrack({ cues: CUES, sections: SECTIONS, duration: frames / FPS }));
    execFileSync(process.env.FFMPEG || 'ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(dir, 'f%05d.png'), '-i', wav,
      '-vf', 'scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p,setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-tune', 'animation',
      '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
      '-af', 'loudnorm=I=-20:TP=-2:LRA=9', '-ar', '48000', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', VIDEO]);
    rmSync(dir, { recursive: true, force: true });
    console.log('wrote', relative(process.cwd(), VIDEO), `${frames} frames, ${END.toFixed(1)} s`);
    writeFileSync(POSTER, await shot(pages[0], POSTER_AT));
    console.log('wrote', relative(process.cwd(), POSTER));
  }
} finally {
  await browser.close();
}
