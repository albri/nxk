// Draws the README figures in assets/readme from figures.mjs, each in light and dark (the banner is one file, on pine).
//
//   node assets/readme/src/render.mjs [banner|how-it-works|every-answer|does-it-work ...]
//
// Needs playwright-core and a Chromium. cwebp writes the .webp files; without it the PNGs are kept.
//   PLAYWRIGHT_CORE  path to playwright-core, if Node can't find it
//   CHROMIUM         path to a Chromium or headless-shell binary, if Playwright's own isn't installed
//   CWEBP            path to cwebp, if it isn't on PATH
//   NXK_FONT_SANS    Schibsted Grotesk as .woff2 (the variable font, 400–800), and
//   NXK_FONT_MONO    Fragment Mono as .woff2. Without both, the fonts load from Google Fonts.
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { answers, banner, benchmark, library } from './figures.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..');

// The family's neutrals with nxk's pine, as on the brand's mark page. Marigold points at one thing per figure.
const THEMES = {
  light: {
    card: '#f4f6f9', panel: '#ffffff', track: '#e8ecf2', line: '#e1e5ec', strong: '#c8cfda',
    ink: '#0b1222', ink2: '#475165', ink3: '#687286', hero: '#08553e', mid: '#3b9a78', soft: '#e2f1e9',
    crowd: '#587fc8', look: '#e89a0c', nxB: '#3b9a78', nxX: '#05402d', nxLit: ['#1c7e5e', '#043d2b'], word: '#083f2e',
  },
  dark: {
    card: '#121a2d', panel: '#0b1020', track: '#1a2339', line: '#232d45', strong: '#35415f',
    ink: '#edf0f7', ink2: '#aeb6c8', ink3: '#8790a5', hero: '#a1eecd', mid: '#3b9a78', soft: '#14322b',
    crowd: '#587fc8', look: '#f5b13a', nxB: '#3b9a78', nxX: '#68b797', nxLit: ['#dff4ea', '#7acbaa'], word: '#edf0f7',
  },
  pine: { bg: '#053727', nxB: '#3ea17d', nxX: '#72c5a3', nxLit: ['#e7f6ef', '#82d1b0'], word: '#ffffff' },
};

// ---------- the mark: the falling stroke, the lit rising stroke, and the overprint where they cross ----------

const FALL = 'M26.185 26.685C19.89 26.685 18.045 19.549 16 16.24C14.057 13.095 12.11 6.315 5.815 6.315';
const RISE = 'M5.815 26.685C12.11 26.685 13.955 19.549 16 16.24C17.943 13.095 19.89 6.315 26.185 6.315';

function mark(t, size) {
  const s = 'fill="none" stroke-width="5.63" stroke-linecap="round"';
  return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true"><defs>`
    + `<linearGradient id="nx-lit" gradientUnits="userSpaceOnUse" x1="0" y1="3.5" x2="0" y2="29.5"><stop offset="0" stop-color="${t.nxLit[0]}"/><stop offset="1" stop-color="${t.nxLit[1]}"/></linearGradient>`
    + `<mask id="nx-m" maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="32"><path d="${RISE}" stroke="#fff" ${s}/></mask></defs>`
    + `<path d="${FALL}" stroke="${t.nxB}" ${s}/><path d="${RISE}" stroke="url(#nx-lit)" ${s}/><path d="${FALL}" stroke="${t.nxX}" ${s} mask="url(#nx-m)"/></svg>`;
}

// The family lockup: the mark at 1.3 times the name, a third of an em apart.
const lockup = (t, size) => `<span class="lock" style="font-size:${size}px;color:${t.word}">${mark(t, size * 1.3)}<span>nxk</span></span>`;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const vars = (t) => Object.entries(t).filter(([, v]) => typeof v === 'string').map(([k, v]) => `--${k}:${v}`).join(';');
const arrow = '<svg class="arrow" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 7h9M7.5 3.5 11 7l-3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function frame(t, body, note) {
  return `<div class="fig" style="${vars(t)}">${body}<footer>${lockup(t, 15)}<span>${esc(note)}</span></footer></div>`;
}

// ---------- How it works: one decision, from the file it starts in to the change ----------

function crossover(t, rows) {
  // Three groups along the bottom, share on the side. The lines cross where the majority flips.
  const W = 276, H = 172, top = 22, base = 146, x0 = 30, x1 = W - 30;
  const x = (i) => x0 + (i * (x1 - x0)) / (rows.length - 1);
  const y = (p) => base - ((base - top) * p) / 100;
  const line = (key) => rows.map((r, i) => `${i ? 'L' : 'M'}${x(i)} ${y(r[key])}`).join('');
  const dots = (key, fill) => rows.map((r, i) => `<circle cx="${x(i)}" cy="${y(r[key])}" r="4.5" fill="${fill}" stroke="${t.panel}" stroke-width="2"/>`).join('');
  const last = rows.length - 1, first = rows[0], end = rows[last];
  const label = (lx, ly, anchor, name, value) =>
    `<text x="${lx}" y="${ly}" text-anchor="${anchor}" class="lbl">${name} <tspan class="val">${value}%</tspan></text>`;
  return `<svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Morning falls and evening rises from retired people to people in full-time work">
    <line x1="${x0 - 14}" x2="${x1 + 14}" y1="${base}" y2="${base}" stroke="${t.strong}" stroke-width="1"/>
    <line x1="${x0 - 14}" x2="${x1 + 14}" y1="${y(50)}" y2="${y(50)}" stroke="${t.strong}" stroke-width="1" stroke-dasharray="2 4"/>
    <text x="${x0 - 14}" y="${y(50) - 6}" class="axis">50%</text>
    <path d="${line('morning')}" fill="none" stroke="${t.mid}" stroke-width="2" stroke-linejoin="round"/>
    <path d="${line('evening')}" fill="none" stroke="${t.hero}" stroke-width="2" stroke-linejoin="round"/>
    ${dots('morning', t.mid)}${dots('evening', t.hero)}
    <circle cx="${x(last)}" cy="${y(end.evening)}" r="10" fill="none" stroke="${t.look}" stroke-width="2"/>
    ${label(x0 - 10, y(first.morning) - 12, 'start', 'Morning', first.morning)}
    ${label(x0 - 10, y(first.evening) + 22, 'start', 'Evening', first.evening)}
    ${label(x1 + 10, y(end.evening) - 17, 'end', 'Evening', end.evening)}
    ${label(x1 + 10, y(end.morning) + 22, 'end', 'Morning', end.morning)}
    ${rows.map((r, i) => `<text x="${x(i)}" y="${H - 4}" text-anchor="middle" class="axis">${esc(r.group)}</text>`).join('')}
  </svg>`;
}

function crowd(t, n, overall) {
  // One dot a person, then the crowd's answer, weighted by each person's chance of visiting.
  const cols = 20, pitch = 8.9, r = 3.3, w = cols * pitch;
  const dots = Array.from({ length: n }, (_, i) => `<circle cx="${(i % cols) * pitch + pitch / 2}" cy="${Math.floor(i / cols) * pitch + pitch / 2}" r="${r}" fill="${t.crowd}"/>`).join('');
  const rows = Math.ceil(n / cols);
  const split = (w * overall.morning) / 100;
  return `<div class="crowd">
    <svg width="${w}" height="${rows * pitch}" viewBox="0 0 ${w} ${rows * pitch}" role="img" aria-label="${n} people">${dots}</svg>
    <svg width="${w}" height="12" viewBox="0 0 ${w} 12" role="img" aria-label="Morning ${overall.morning}%, evening ${overall.evening}%">
      <rect x="0" y="0" width="${split - 1}" height="12" rx="3" fill="${t.mid}"/><rect x="${split + 1}" y="0" width="${w - split - 1}" height="12" rx="3" fill="${t.hero}"/>
    </svg>
    <div class="split" style="width:${w}px"><span>Morning <b>${overall.morning}%</b></span><span>Evening <b>${overall.evening}%</b></span></div>
  </div>`;
}

// lines: [text, kind?], kind is 'cm' (comment), 'add' or 'del'
function code(file, lines) {
  return `<div class="code"><div class="tab">${esc(file)}</div><pre>${lines.map(([text, kind]) => `<span${kind ? ` class="${kind}"` : ''}>${esc(text)}</span>`).join('')}</pre></div>`;
}

function howItWorks(t) {
  const d = library;
  const before = code(d.file, [[d.before[0]], [d.before[1]], [d.question, 'cm']]);
  const after = code(d.file, [[d.before[0]], [`- ${d.before[1]}`, 'del'], ['+ when:', 'add'], ...d.after.map((l) => [`+   ${l}`, 'add'])]);
  const visuals = [before, crowd(t, d.people, d.overall), crossover(t, d.byWork), after];
  const steps = d.steps.map((s, i) => `<section class="step">${i ? arrow : ''}
      <h2><span class="n">${i + 1}</span><span>${esc(s.title)}</span></h2>
      <div class="vis">${visuals[i]}</div>
      <p>${esc(s.text)}</p>
    </section>`).join('');
  return frame(t, `<header><h1>${esc(d.title)}</h1><p>${esc(d.lead)}</p></header><div class="steps">${steps}</div>`, d.note);
}

// ---------- Every answer: three people, one question, every probability ----------

function everyAnswer(t) {
  const d = answers;
  const people = d.people.map((p) => {
    const top = p.p.indexOf(Math.max(...p.p));
    const bars = d.options.map((o, i) => `<div class="bar${i === top ? ' top' : ''}">
        <div class="row"><span>${esc(o)}</span><span class="num">${p.p[i]}%</span></div>
        <div class="track"><div class="fill" style="width:${p.p[i]}%"></div></div>
      </div>`).join('');
    return `<section class="person"><h2>${esc(p.name)}</h2><p class="role">${esc(p.role)}</p>
      <p class="facts">${p.facts.map(esc).join(' · ')}</p><div class="bars">${bars}</div></section>`;
  }).join('');
  return frame(t, `<header><h1>${esc(d.title)}</h1><p>Three people from the same crowd, asked: “${esc(d.question)}” (${esc(d.source)})</p></header>
    <div class="people">${people}</div><p class="keep">${esc(d.keep)}</p>`, d.note);
}

// ---------- Does it work: the benchmark, with a dashed row for any run still to come ----------

function units(parts, total) {
  const out = [];
  for (const [cls, n] of parts) for (let i = 0; i < n; i++) out.push(`<i class="u ${cls}"></i>`);
  while (out.length < total) out.push('<i class="u c"></i>');
  return `<div class="units">${out.join('')}</div>`;
}

function doesItWork(t) {
  const d = benchmark, max = 16;
  const pending = '<span class="chip">Results to come</span>';
  const placeholder = (n) => `<div class="units">${'<i class="u p"></i>'.repeat(n)}</div>`;
  const key = (items) => `<span class="key">${items.map(([cls, text]) => `<span><i class="u ${cls}"></i>${text}</span>`).join('')}</span>`;
  const block = (title, legend, row) => `<section class="check"><h2><span>${title}</span>${legend}</h2><div class="rows">${d.runs.map((run) => `<div class="r${run.pending ? ' pending' : ''}"><span class="label">${esc(run.label)}</span>${row(run)}</div>`).join('')}</div></section>`;

  const leading = block('Is the leading answer the survey’s, or the one next to it?', key([['a', 'Exact'], ['b', 'One step off'], ['c', 'Missed']]), (run) => run.pending
    ? `${placeholder(d.questions)}<span class="value">${pending}</span>`
    : `${units([['a', run.leading.exact], ['b', run.leading.close]], d.questions)}<span class="value num"><b>${run.leading.exact + run.leading.close} of ${d.questions}</b> · ${run.leading.exact} exact</span>`);

  const gaps = block('Do the biggest gaps between groups point the same way?', key([['a', 'Clearly'], ['b', 'Faintly'], ['c', 'The other way']]), (run) => {
    if (run.pending) return `${placeholder(d.gapsCompared)}<span class="value">${pending}</span>`;
    if (!run.gaps) return '<span class="none">No gaps to compare: with no person attached, everyone gets the same answer</span><span class="value">–</span>';
    return `${units([['a', run.gaps.clearly], ['b', run.gaps.faintly]], d.gapsCompared)}<span class="value num"><b>${run.gaps.clearly + run.gaps.faintly} of ${d.gapsCompared}</b> · ${run.gaps.clearly} clearly</span>`;
  });

  const off = block('How far is each answer from the survey, on average?', '<span class="key">Shorter is better</span>', (run) => run.pending
    ? `<div class="gauge"><i class="p"></i></div><span class="value">${pending}</span>`
    : `<div class="gauge"><i style="width:${(run.avgGap / max) * 100}%"></i></div><span class="value"><b>${run.avgGap.toFixed(1)}</b> points</span>`);

  return frame(t, `<header><h1>${esc(d.title)}</h1><p>${esc(d.lead)}</p></header><div class="checks">${leading}${gaps}${off}</div>`, d.note);
}

// ---------- Banner: the mark made of people. Two answers cross as lives change ----------

function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function bannerFig() {
  const t = THEMES.pine, r = rng(7), W = 360, H = 286, n = 60;
  const gauss = () => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
  const S = (v) => 1 / (1 + Math.exp(-8.5 * (v - 0.5)));
  const clamp = (v) => Math.min(0.985, Math.max(0.015, v));
  const px = (v) => 14 + v * (W - 28), py = (p) => 14 + (1 - p) * (H - 28);
  const mix = (a, b, k) => '#' + [0, 2, 4].map((o) => Math.round(parseInt(a.slice(1 + o, 3 + o), 16) * (1 - k) + parseInt(b.slice(1 + o, 3 + o), 16) * k).toString(16).padStart(2, '0')).join('');
  const morning = [], evening = [];
  for (let i = 0; i < n; i++) {
    const v = (i + 0.5 + (r() - 0.5) * 0.9) / n;
    const e = clamp(0.04 + 0.92 * S(v) + 0.045 * gauss());
    const m = clamp(0.04 + 0.92 * (1 - S(v)) + 0.045 * gauss());
    morning.push(`<circle cx="${px(v + (r() - 0.5) * 0.012).toFixed(1)}" cy="${py(m).toFixed(1)}" r="4.4" fill="${t.nxB}"/>`);
    evening.push(`<circle cx="${px(v).toFixed(1)}" cy="${py(e).toFixed(1)}" r="4.4" fill="${mix(t.nxLit[1], t.nxLit[0], e)}"/>`);
  }
  const d = banner;
  return `<div class="banner" style="background:${t.bg}">
    ${lockup(t, 28)}
    <h1>${d.title.map(esc).join('<br>')}</h1>
    <p>${esc(d.lead)}</p>
    <code>${esc(d.install)}</code>
    <figure class="dots"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">${morning.join('')}${evening.join('')}</svg><figcaption>${esc(d.caption)}</figcaption></figure>
  </div>`;
}

// ---------- page and styles ----------

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{background:transparent;font-family:var(--font);-webkit-font-smoothing:antialiased}
:root{--font:"Schibsted Grotesk",ui-sans-serif,system-ui,sans-serif;--mono:"Fragment Mono",ui-monospace,Menlo,monospace}
.lock{display:inline-flex;align-items:center;gap:.32em;font-weight:700;letter-spacing:-0.02em;line-height:1}
.lock svg{display:block;flex:none}
.num{font-variant-numeric:tabular-nums}
b{font-weight:600;color:var(--ink)}

.fig{width:960px;border-radius:18px;background:var(--card);color:var(--ink);padding:36px 36px 22px;font-size:15px;line-height:1.5}
.fig header h1{font-size:27px;line-height:1.15;font-weight:650;letter-spacing:-0.026em;text-wrap:balance}
.fig header p{margin-top:8px;color:var(--ink2);max-width:66ch;text-wrap:pretty}
.fig footer{display:flex;justify-content:space-between;align-items:center;gap:24px;margin-top:28px;padding-top:16px;border-top:1px solid var(--line);font-size:13px;color:var(--ink3)}

.steps{display:grid;grid-template-columns:1fr 1fr 1.56fr 1fr;gap:28px;margin-top:28px}
.step{position:relative;display:grid;grid-template-rows:44px 196px auto;gap:12px}
.step h2{display:flex;gap:9px;font-size:15.5px;line-height:1.3;font-weight:600;letter-spacing:-0.012em}
.step h2 .n{font:400 13px/1.55 var(--mono);color:var(--ink3)}
.step p{font-size:14px;line-height:1.45;color:var(--ink2);text-wrap:pretty}
.step .arrow{position:absolute;left:-21px;top:${44 + 12 + 98 - 7}px;color:var(--ink3)}
.vis{display:grid;align-items:center;min-width:0}
.code{height:100%;background:var(--panel);border:1px solid var(--line);border-radius:10px;overflow:hidden;font:400 12.5px/1.6 var(--mono);color:var(--ink)}
.code .tab{padding:6px 12px;border-bottom:1px solid var(--line);font-size:11.5px;line-height:1.5;color:var(--ink3)}
.code pre{padding:7px 0;font:inherit;white-space:pre}
.code pre span{display:block;padding:0 12px}
.code .cm{color:var(--ink3)}
.code .add{background:var(--soft);color:var(--hero)}
.code .del{color:var(--ink3);text-decoration:line-through;text-decoration-thickness:1px}
.crowd{display:grid;gap:10px;justify-items:start}
.crowd .split{display:flex;justify-content:space-between;font-size:13px;color:var(--ink2)}
.chart{display:block;overflow:visible}
.chart .lbl{font:400 13px var(--font);fill:var(--ink2)}
.chart .val{font-weight:600;fill:var(--ink)}
.chart .axis{font:400 12.5px var(--font);fill:var(--ink3)}

.people{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:24px}
.person{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:18px}
.person h2{font-size:17px;line-height:1.25;font-weight:600;letter-spacing:-0.015em}
.person .role{margin-top:2px;font-size:14px;color:var(--ink2)}
.person .facts{margin-top:8px;font-size:13px;line-height:1.45;color:var(--ink3);min-height:38px}
.bars{display:grid;gap:11px;margin-top:14px;padding-top:15px;border-top:1px solid var(--line)}
.bar .row{display:flex;justify-content:space-between;font-size:13px;color:var(--ink2)}
.bar.top .row{color:var(--ink);font-weight:600}
.bar .track{height:8px;margin-top:5px;border-radius:4px;background:var(--track);overflow:hidden}
.bar .fill{height:100%;border-radius:4px;background:var(--hero)}
.keep{margin-top:20px;font-size:14.5px;color:var(--ink2);max-width:72ch}

.checks{display:grid;gap:22px;margin-top:24px}
.check h2{display:flex;justify-content:space-between;align-items:baseline;gap:20px;font-size:15.5px;line-height:1.3;font-weight:600;letter-spacing:-0.012em}
.key{display:flex;gap:14px;font-size:12.5px;font-weight:400;color:var(--ink3);letter-spacing:0}
.key span{display:inline-flex;align-items:center;gap:6px}
.key .u{width:11px;height:11px}
.rows{margin-top:10px;border-top:1px solid var(--line)}
.r{display:grid;grid-template-columns:186px minmax(0,1fr) 172px;align-items:center;gap:18px;min-height:37px;border-bottom:1px solid var(--line)}
.r .label{font-size:14px;color:var(--ink2)}
.r .value{font-size:14px;color:var(--ink2);text-align:right}
.r .none{font-size:13.5px;color:var(--ink3)}
.units{display:flex;gap:4px}
.u{display:block;width:14px;height:14px;border-radius:3px;flex:none}
.u.a{background:var(--hero)}
.u.b{background:var(--mid)}
.u.c{box-shadow:inset 0 0 0 1.5px var(--strong)}
.u.p{border:1.5px dashed var(--strong)}
.gauge{height:12px;width:464px}
.gauge i{display:block;height:100%;border-radius:3px;background:var(--mid)}
.gauge i.p{width:60%;background:none;border:1.5px dashed var(--strong)}
.chip{display:inline-block;padding:1px 9px;border:1px dashed var(--strong);border-radius:999px;font-size:12.5px;color:var(--ink3)}

.banner{position:relative;width:960px;height:420px;border-radius:20px;overflow:hidden;padding:44px 48px;color:#fff}
.banner h1{margin-top:38px;max-width:440px;font-size:54px;line-height:1.02;font-weight:650;letter-spacing:-0.034em}
.banner p{margin-top:18px;max-width:440px;font-size:16.5px;line-height:1.5;color:rgb(231 246 239 / .8)}
.banner code{display:inline-block;margin-top:24px;padding:11px 14px;border-radius:10px;background:rgb(255 255 255 / .07);border:1px solid rgb(255 255 255 / .14);font:400 14.5px/1 var(--mono);color:#e7f6ef}
.banner .dots{position:absolute;right:46px;top:44px;margin:0}
.banner figcaption{margin-top:10px;font-size:13px;line-height:1.4;color:rgb(231 246 239 / .62);text-align:right}
`;

function fonts() {
  const { NXK_FONT_SANS: sans, NXK_FONT_MONO: mono } = process.env;
  const face = (family, file, weight) => `@font-face{font-family:"${family}";font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${readFileSync(file).toString('base64')}) format("woff2")}`;
  if (sans && mono) return { link: '', css: face('Schibsted Grotesk', sans, '400 800') + face('Fragment Mono', mono, 400) };
  return { link: '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fragment+Mono&family=Schibsted+Grotesk:wght@400..800&display=block">', css: '' };
}

const FIGURES = {
  banner: { themes: ['pine'], build: () => bannerFig() },
  'how-it-works': { themes: ['light', 'dark'], build: howItWorks },
  'every-answer': { themes: ['light', 'dark'], build: everyAnswer },
  'does-it-work': { themes: ['light', 'dark'], build: doesItWork },
};

function webp(png, file) {
  const tmp = file.replace(/\.webp$/, '.png');
  writeFileSync(tmp, png);
  try {
    execFileSync(process.env.CWEBP || 'cwebp', ['-quiet', '-lossless', '-z', '9', tmp, '-o', file]);
    rmSync(tmp);
    return file;
  } catch {
    console.warn('cwebp failed or is missing; kept the PNG');
    return tmp;
  }
}

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core'));
} catch {
  console.error('Needs playwright-core: install it, or set PLAYWRIGHT_CORE to its path.');
  process.exit(1);
}

const wanted = process.argv.slice(2);
const names = wanted.length ? wanted : Object.keys(FIGURES);
const font = fonts();
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
try {
  const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1040, height: 800 } });
  for (const name of names) {
    const fig = FIGURES[name];
    if (!fig) throw new Error(`No figure called ${name}`);
    for (const theme of fig.themes) {
      const html = fig.build(THEMES[theme]);
      await page.setContent(`<!doctype html><html lang="en-GB"><head><meta charset="utf-8">${font.link}<style>${font.css}${CSS}</style></head><body style="padding:20px">${html}</body></html>`, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      const png = await page.locator('.fig, .banner').first().screenshot({ omitBackground: true });
      const file = webp(png, join(OUT, `${name}${theme === 'dark' ? '-dark' : ''}.webp`));
      console.log('wrote', relative(process.cwd(), file));
    }
  }
} finally {
  await browser.close();
}
