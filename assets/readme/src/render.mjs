// Draws the README figures in assets/readme from figures.mjs in PersonaGen Route, each on Paper and on Night (the
// banner is one file, on Night). The drawings are the ones on the nxk page of alexbristow.com, at the README's width.
//
//   node assets/readme/src/render.mjs [banner|how-it-works|every-answer|following|does-it-work ...]
//
// Needs playwright-core and a Chromium. cwebp writes the .webp files; without it the PNGs are kept.
//   PLAYWRIGHT_CORE  path to playwright-core, if Node can't find it
//   CHROMIUM         path to a Chromium, Chrome or Brave binary, if Playwright's own isn't installed
//   CWEBP            path to cwebp, if it isn't on PATH
//   NXK_FONTS        a folder of the fonts as .woff2 (see route.mjs). Without it, they load from Google Fonts.
import { execFileSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { answers, banner, benchmark, library, tally } from './figures.mjs';
import { esc, fonts, route, THEMES, TONES, TYPE, vars, visitors, waffle, wordmark } from './route.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..');

// The frame every figure shares: a title and lead over a rule, the drawing, then the wordmark and a note.
function frame(title, lead, body, note) {
  return `<div class="fig"><header><h1>${esc(title)}</h1><p>${lead}</p></header>${body}<footer>${wordmark(22)}<span>${esc(note)}</span></footer></div>`;
}

// ---------- How it works: one decision as a line of four stops, from the file it starts in to the change ----------

const toneClass = (group) => `t-${TONES[group] ?? 'ink'}`;

// lines: [text, kind?, group?], kind is 'cm' (comment), 'add' or 'del'; a group colours the line
function yaml(lines) {
  return `<div class="code"><div class="tab">${esc(library.file)}</div><div class="body">${lines.map(([text, kind, group]) =>
    `<span class="${[kind, group && toneClass(group)].filter(Boolean).join(' ')}">${esc(text)}</span>`).join('')}</div></div>`;
}

function crowd(t) {
  const d = library;
  const squares = waffle({ t, groups: d.mix.map((m) => ({ n: m.n, tone: TONES[m.group] })) });
  return `<div class="crowd">${squares}<p class="legend">${d.mix.map((m) => `<span class="${toneClass(m.group)}"><i></i>${esc(m.group)} <b class="num">${m.n}</b></span>`).join('')}</p></div>`;
}

// how far each group leans from an even split: left for mornings, right for evenings
function lean() {
  const d = library, rows = [{ group: 'All visitors', ...d.overall }, ...d.byWork];
  const says = (r) => (r.morning === r.evening ? 'Even' : r.morning > r.evening ? `${r.morning}% mornings` : `${r.evening}% evenings`);
  return `<div class="lean"><div class="axis data"><span>Mornings</span><span>Evenings</span></div>${rows.map((r) => {
    const at = r.evening, from = Math.min(at, 50), span = Math.abs(at - 50);
    return `<div class="lrow ${toneClass(r.group)}"><div class="lname"><span>${esc(r.group)}</span><b class="num">${says(r)}</b></div>
      <div class="ltrack"><i class="stem" style="left:${from}%;width:${span}%"></i><i class="dot" style="left:${at}%"></i></div></div>`;
  }).join('')}</div>`;
}

function howItWorks(t) {
  const d = library;
  const groupOf = (line) => (line === '# retired' ? 'Retired' : line === '# full-time' ? 'Full-time' : undefined);
  const visuals = [
    yaml([[d.before[0]], [d.before[1]], [d.question, 'cm']]),
    crowd(t),
    lean(),
    yaml([[d.before[0]], [`- ${d.before[1]}`, 'del'], ['+ when:', 'add'], ...d.after.map((l) => [`+   ${l}`, 'add', groupOf(l)])]),
  ];
  const steps = d.steps.map((s, i) => `<li class="step"><span class="ring"></span><h2>${esc(s.title)}</h2><div class="vis">${visuals[i]}</div><p>${esc(s.text)}</p></li>`).join('');
  return frame(d.title, esc(d.lead), `<ol class="steps">${steps}</ol>`, d.note);
}

// ---------- Every answer: three people, one question, every probability as a small histogram ----------

function everyAnswer() {
  const d = answers;
  const head = `<div class="person head"><span></span><div class="options">${d.options.map((o) => `<span>${esc(o)}</span>`).join('')}</div></div>`;
  const people = d.people.map((p) => {
    const top = p.p.indexOf(Math.max(...p.p));
    const cols = p.p.map((share, i) => `<span class="col${i === top ? ' top' : ''}"><i style="height:${share}%"><b class="num">${share}%</b></i></span>`).join('');
    return `<div class="person"><div class="who"><h2>${esc(p.name)}</h2><p class="role">${esc(p.role)}</p><p class="facts">${p.facts.map((f) => `<span>${esc(f)}</span>`).join('')}</p></div>
      <div class="spread">${cols}</div></div>`;
  }).join('');
  return frame(d.title, `Three people from the same crowd, asked: “${esc(d.question)}” (${esc(d.source)})`, `<div class="people">${head}${people}</div><p class="keep">${esc(d.keep)}</p>`, d.note);
}

// ---------- Following: the longer run as a route, each stop what an answer showed and where it sent the agent ----------

function following() {
  const d = tally;
  const bars = (rows) => `<div class="hbars">${rows.map(([label, share, acted]) => `<span class="hl${acted ? ' acted' : ''}">${esc(label)}</span>
    <span class="track${acted ? ' acted' : ''}"><i style="width:${share}%"></i></span><b class="hv num${acted ? ' acted' : ''}">${share}%</b>`).join('')}</div>`;
  const hops = d.hops.map((h) => `<li class="hop"><span class="ring"></span>
    <div class="hbody"><div><h2>${esc(h.title)}</h2><p class="what">${esc(h.text)}</p></div><div>${h.bars ? bars(h.bars) : ''}<p class="then">${esc(h.then)}</p></div></div>
    ${h.left ? `<p class="left"><b>Left it.</b> ${esc(h.left)}</p>` : ''}</li>`).join('');
  const pages = `<div class="pages">${d.pages.map((p, i) => `<div class="page${i ? ' after' : ''}"><span class="data">${esc(p.when)}</span><span class="phead">${esc(p.headline)}</span>
    <span class="offer">${esc(p.offer)}</span><span class="picked"><span class="track"><i style="width:${p.picked}%"></i></span><span>Headline picked by <b class="num">${p.picked}%</b></span></span></div>`).join('')}</div>`;
  const end = `<li class="hop end"><span class="ring"></span><h2>What changed</h2>${pages}<p class="held">${esc(d.held)}</p></li>`;
  return frame(d.title, esc(d.lead), `<ol class="route">${hops}${end}</ol>`, d.note);
}

// ---------- Does it work: the benchmark's two checks, with a dashed row for any run still to come ----------

function arrow(way) {
  return `<svg viewBox="0 0 16 12" class="arrow ${way}" aria-hidden="true"><path d="${way === 'against' ? 'M14 6H3M7 2 3 6l4 4' : 'M2 6h11M9 2l4 4-4 4'}"/></svg>`;
}

function doesItWork() {
  const d = benchmark, c = d.checks, chip = `<span class="chip">${esc(d.toCome)}</span>`;
  const head = (title, keys) => `<h2><span>${esc(title)}</span><span class="keys">${keys}</span></h2>`;
  const row = (run, track, value) => `<div class="r${run.nxk ? ' nxk' : ''}${run.pending ? ' pending' : ''}"><span class="label">${esc(run.label)}</span><div class="rt">${track}</div><span class="value">${value}</span></div>`;

  const ways = ['clearly', 'faintly', 'against'];
  const arrows = (list) => `<div class="arrows">${list.map(arrow).join('')}</div>`;
  const gapRows = d.runs.map((run) => {
    if (run.pending) return row(run, '<i class="placeholder"></i>', chip);
    if (!run.gaps) return row(run, `<span class="none">${esc(c.gaps.none)}</span>`, '–');
    const list = [...Array(run.gaps.clearly).fill('clearly'), ...Array(run.gaps.faintly).fill('faintly')];
    while (list.length < d.gapsCompared) list.push('against');
    return row(run, arrows(list), `<b class="num">${run.gaps.clearly + run.gaps.faintly} of ${d.gapsCompared}</b> · ${run.gaps.clearly} clearly`);
  }).join('');
  const gaps = `<section class="check">${head(c.gaps.title, c.gaps.key.map((k, i) => `<span>${arrow(ways[i])}${esc(k)}</span>`).join(''))}<div class="rows">${gapRows}</div></section>`;

  // the recorded runs as points on one scale, the model alone in grey and nxk in Aurora
  const [alone, nxk] = d.runs.filter((r) => !r.pending);
  const at = (v) => `${(v / c.avgGap.max) * 100}%`;
  const tag = (run, cls) => `<span class="tag ${cls}${run.avgGap / c.avgGap.max > 0.7 ? ' end' : ''}" style="left:${at(run.avgGap)}">${esc(run.label)} <b class="num">${run.avgGap.toFixed(1)}</b></span>`;
  const scale = `<div class="dist">${tag(alone, '')}<div class="dtrack"><i class="gain" style="left:${at(nxk.avgGap)};width:${at(alone.avgGap - nxk.avgGap)}"></i><i class="ddot" style="left:${at(alone.avgGap)}"></i><i class="ddot nxk" style="left:${at(nxk.avgGap)}"></i></div>${tag(nxk, 'nxk')}
    <div class="axis data">${c.avgGap.ticks.map((n) => `<span style="left:${at(n)}">${n}</span>`).join('')}</div></div>`;
  const pending = d.runs.filter((r) => r.pending).map((run) => row(run, '<div class="dtrack p"></div>', chip)).join('');
  const distance = `<section class="check">${head(c.avgGap.title, esc(c.avgGap.key))}<div class="rows">
    ${row({ label: c.avgGap.both }, scale, `<b class="num">${alone.avgGap.toFixed(1)}</b> to <b class="num aurora">${nxk.avgGap.toFixed(1)}</b> points`).replace('class="r"', 'class="r dist-row"')}${pending}</div></section>`;

  return frame(d.title, esc(d.lead), `<div class="checks">${gaps}${distance}</div>`, d.note);
}

// ---------- Banner: the name, the line, and the crowd split at the question ----------

function bannerFig() {
  const t = THEMES.night, d = banner;
  const { people, facts, tone } = visitors(library);
  // the two groups that answer differently, each in its colour: retired people who want mornings, full-time workers who
  // want evenings
  const lit = (p) => (p[2] === 0 && p[3] === 0) || (p[2] === 2 && p[3] === 1);
  const drawing = route({ t, ground: t.page, facts, people, lit, tone, width: 452, height: 318, k: 0.92, right: 86, named: [2, 3], tones: TONES });
  return `<div class="banner">
    <div class="copy">
      ${wordmark(56)}
      <h1>${d.title.map(esc).join('<br>')}</h1>
      <p>${esc(d.lead)}</p>
      <code>${esc(d.install)}</code>
    </div>
    <div class="draw">${drawing}</div>
  </div>`;
}

// ---------- page and styles: the nxk page's layout at the README's width ----------

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{background:transparent;font-family:var(--sans);-webkit-font-smoothing:antialiased}
${TYPE}
b{font-weight:600;color:var(--ink)}
ol{list-style:none}
.data{font:400 13px/1.4 var(--mono);letter-spacing:.02em;color:var(--ink3)}
.t-aurora{--tone:var(--aurora)} .t-look{--tone:var(--look)} .t-group{--tone:var(--group)} .t-ink{--tone:var(--ink)}

.fig{width:960px;border-radius:12px;background:var(--raised);color:var(--ink);padding:40px 40px 22px;font-size:15px;line-height:1.5}
.fig>header{padding-bottom:22px;border-bottom:1px solid var(--ink)}
.fig>header h1{font:500 34px/1.1 var(--display);letter-spacing:-0.01em;text-wrap:balance}
.fig>header p{margin-top:10px;max-width:70ch;color:var(--ink2);text-wrap:pretty}
.fig>footer{display:flex;justify-content:space-between;align-items:center;gap:24px;margin-top:30px;padding-top:14px;border-top:1px solid var(--hair);font-size:13px;color:var(--ink3)}
.ring{position:relative;z-index:1;display:block;width:22px;height:22px;border:4px solid var(--ink);border-radius:50%;background:var(--raised)}

.steps{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1.2fr) minmax(0,1fr);grid-template-rows:repeat(4,auto);gap:12px 28px;margin-top:30px}
.step{position:relative;display:grid;grid-row:span 4;grid-template-rows:subgrid}
.step:not(:last-child)::after{content:"";position:absolute;left:11px;right:-39px;top:8px;height:6px;border-radius:3px;background:var(--stop)}
.step h2{font:500 20px/1.15 var(--display);letter-spacing:-0.005em;text-wrap:balance}
.step p{font-size:14px;line-height:1.45;color:var(--ink2);text-wrap:pretty}
.vis{display:grid;align-items:center;min-width:0}
.code{align-self:stretch;overflow:hidden;border:1px solid var(--hair);border-radius:8px;background:var(--page);font:400 12.5px/1.6 var(--mono);color:var(--ink)}
.code .tab{padding:6px 12px;border-bottom:1px solid var(--hair);font-size:11.5px;line-height:1.5;color:var(--ink3)}
.code .body{padding:7px 0;white-space:pre}
.code .body>span{display:block;padding:0 12px}
.code .cm{color:var(--ink3)}
.code .del{color:var(--ink3);text-decoration:line-through;text-decoration-thickness:1px}
.code .add{background:var(--diff)}
.code .t-aurora,.code .t-look{color:var(--tone)}
.crowd{display:grid;gap:14px;justify-items:start}

.legend{display:flex;flex-wrap:wrap;gap:4px 14px;margin-right:-16px;font-size:13px;color:var(--ink2)}
.legend span{display:inline-flex;align-items:center;gap:6px}
.legend i{display:block;width:10px;height:10px;border-radius:2.5px;background:var(--tone)}
.legend b{font-weight:500}
.lean{display:grid;gap:12px}
.lean .axis{display:flex;justify-content:space-between;padding-bottom:6px;border-bottom:1px solid var(--hair)}
.lrow{display:grid;gap:5px}
.lname{display:flex;justify-content:space-between;gap:8px;font-size:13px;line-height:1.3;color:var(--ink2)}
.lname b{font-weight:500}
.ltrack{position:relative;height:12px;background:linear-gradient(var(--hair),var(--hair)) center/100% 1px no-repeat}
.ltrack::before{content:"";position:absolute;left:50%;top:-3px;bottom:-3px;width:1px;background:var(--edge)}
.ltrack i{position:absolute;top:50%;background:var(--tone)}
.ltrack .stem{height:4px;border-radius:2px;transform:translateY(-50%)}
.ltrack .dot{width:12px;height:12px;border-radius:50%;transform:translate(-50%,-50%)}

.people{margin-top:8px}
.person{display:grid;grid-template-columns:minmax(0,.6fr) minmax(0,1fr);gap:28px;align-items:end;padding:22px 0;border-bottom:1px solid var(--hair)}
.person.head{padding:18px 0 0;border-bottom:0}
.who{overflow:hidden}
.who h2{font:500 22px/1.15 var(--display);letter-spacing:-0.005em}
.who .role{margin-top:3px;font-size:14px;color:var(--ink2)}
/* Each fact carries its dot in front; the dot that starts a line sits in the clipped margin, so no line starts on one. */
.who .facts{display:flex;flex-wrap:wrap;margin:8px 0 0 -1.1em;font-size:13.5px;line-height:1.45;color:var(--ink3)}
.who .facts span{white-space:nowrap}
.who .facts span::before{content:"·";display:inline-block;width:1.1em;text-align:center}
.options,.spread{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.options{align-items:end;font-size:13px;line-height:1.3;text-align:center;color:var(--ink2)}
.spread{align-items:end;height:92px;padding-top:20px;border-bottom:1px solid var(--lineStrong)}
.col{display:flex;align-items:flex-end;height:100%}
.col i{position:relative;display:block;width:100%;border-radius:3px 3px 0 0;background:color-mix(in srgb,var(--aurora) 38%,transparent)}
.col b{position:absolute;bottom:calc(100% + 4px);left:0;right:0;text-align:center;font:400 13px/1 var(--mono);color:var(--ink3)}
.col.top i{background:var(--aurora)}
.col.top b{font-weight:500;color:var(--ink)}
.keep{margin-top:16px;max-width:76ch;font-size:14.5px;color:var(--ink2)}

.route{display:grid;gap:24px;margin-top:30px}
.hop{position:relative;display:grid;grid-template-columns:22px minmax(0,1fr);gap:12px 14px}
.hop>.ring{grid-column:1;grid-row:1}
.hop>:not(.ring){grid-column:2}
.hop:not(:last-child)::after{content:"";position:absolute;left:8px;top:11px;bottom:-35px;width:6px;border-radius:3px;background:var(--stop)}
.hbody{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:32px;align-items:start}
.hop h2{font:500 20px/1.15 var(--display);letter-spacing:-0.005em;text-wrap:balance}
.hop .what{margin-top:4px;font-size:14.5px;color:var(--ink2);text-wrap:pretty}
.then{margin-top:10px;font-size:14px;font-weight:500;color:var(--aurora);text-wrap:pretty}
.hbody>div:last-child>.then:first-child{margin-top:2px}
.then::before{content:"→ "}
.hbars{display:grid;grid-template-columns:fit-content(60%) minmax(0,1fr) 2.6em;align-items:center;gap:8px 12px;font-size:13.5px;line-height:1.3}
.hl{color:var(--ink2)}
.hv{font:400 13px/1 var(--mono);text-align:right;color:var(--ink2)}
.hl.acted,.hv.acted{font-weight:500;color:var(--ink)}
.track{display:block;height:10px;border-radius:3px;background:var(--hair)}
.track>i{display:block;height:100%;min-width:2px;border-radius:3px;background:var(--group)}
.track.acted>i,.page.after .track>i{background:var(--aurora)}
.left{position:relative;padding:10px 14px;border:1px dashed var(--edge);border-radius:10px;font-size:13.5px;color:var(--ink3);text-wrap:pretty}
.left::before{content:"";position:absolute;top:50%;left:-23px;width:22px;border-top:2px dashed var(--edge)}
.left b{font-weight:500;color:var(--ink2)}
.pages{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.page{display:grid;align-content:start;gap:8px;padding:16px;border:1px solid var(--lineStrong);border-radius:10px;background:var(--page)}
.page.after{border-color:var(--aurora);box-shadow:inset 0 0 0 1px var(--aurora)}
.phead{font:500 20px/1.15 var(--display);color:var(--ink);text-wrap:balance}
.offer{font-size:13.5px;color:var(--ink2)}
.picked{display:grid;gap:6px;margin-top:4px;font-size:13.5px;color:var(--ink2)}
.picked b{font-weight:500}
.held{font-size:14px;color:var(--ink2)}

.checks{display:grid;gap:24px;margin-top:26px}
.check h2{display:flex;justify-content:space-between;align-items:baseline;gap:6px 20px;font-size:15.5px;line-height:1.3;font-weight:600}
.keys{display:flex;gap:4px 14px;font-size:12.5px;font-weight:400;color:var(--ink3)}
.keys>span{display:inline-flex;align-items:center;gap:6px}
.keys .arrow{width:14px}
.rows{margin-top:10px;border-top:1px solid var(--hair)}
.r{display:grid;grid-template-columns:186px minmax(0,1fr) 172px;align-items:center;gap:18px;min-height:38px;padding:4px 0;border-bottom:1px solid var(--hair)}
.r .label{font-size:14px;color:var(--ink2)}
.r.nxk .label{color:var(--ink)}
.r .value{font-size:14px;color:var(--ink2);text-align:right}
.r .none{font-size:13.5px;color:var(--ink3)}
.arrows{display:grid;grid-template-columns:repeat(16,minmax(0,22px));gap:6px}
.arrow{display:block;width:100%;aspect-ratio:16/12;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.arrow.clearly{stroke:var(--aurora)}
.arrow.faintly{stroke:color-mix(in srgb,var(--aurora) 45%,transparent)}
.arrow.against{stroke:var(--ink3)}
.placeholder{display:block;width:466px;height:14px;border:1.5px dashed var(--edge);border-radius:4px}
.dist-row{padding:10px 0 4px}
.dist{position:relative;display:grid;gap:6px;max-width:464px;padding-top:4px}
.tag{position:relative;justify-self:start;transform:translateX(-50%);font-size:13px;white-space:nowrap;color:var(--ink2)}
.tag.end{transform:translateX(calc(-100% + 7px))}
.tag.nxk,.tag.nxk b,.aurora{color:var(--aurora)}
.dtrack{position:relative;height:14px;max-width:464px;background:linear-gradient(var(--lineStrong),var(--lineStrong)) center/100% 1px no-repeat}
.dtrack.p{background:none;border-top:1.5px dashed var(--edge);height:0}
.dtrack i{position:absolute;top:50%}
.gain{height:4px;border-radius:2px;transform:translateY(-50%);background:color-mix(in srgb,var(--aurora) 45%,transparent)}
.ddot{width:14px;height:14px;border-radius:50%;transform:translate(-50%,-50%);background:var(--group)}
.ddot.nxk{background:var(--aurora)}
.dist .axis{position:relative;height:18px}
.dist .axis span{position:absolute;transform:translateX(-50%)}
.dist .axis span:first-child{transform:none}
.dist .axis span:last-child{transform:translateX(-100%)}
.chip{display:inline-block;padding:1px 9px;border:1px dashed var(--edge);border-radius:999px;font:400 12px/1.6 var(--mono);letter-spacing:.02em;color:var(--ink3)}

.banner{position:relative;width:960px;height:420px;border-radius:12px;overflow:hidden;padding:46px 48px;background:var(--page);color:var(--ink)}
.banner h1{margin-top:34px;font:500 54px/1.02 var(--display);letter-spacing:-0.005em}
.banner p{margin-top:18px;max-width:390px;font-size:16px;line-height:1.5;color:var(--ink2)}
.banner code{display:inline-block;margin-top:24px;padding:11px 14px;border-radius:8px;background:var(--raised);border:1px solid var(--hair);font:400 14.5px/1 var(--mono);color:var(--ink)}
.banner .copy{position:relative;width:420px}
.banner .draw{position:absolute;right:30px;top:46px}
`;

const FIGURES = {
  banner: { themes: ['night'], build: bannerFig },
  'how-it-works': { themes: ['paper', 'night'], build: howItWorks },
  'every-answer': { themes: ['paper', 'night'], build: everyAnswer },
  following: { themes: ['paper', 'night'], build: following },
  'does-it-work': { themes: ['paper', 'night'], build: doesItWork },
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
      const t = THEMES[theme];
      const html = fig.build(t);
      await page.setContent(`<!doctype html><html lang="en-GB"><head><meta charset="utf-8">${font.link}<style>${font.css}${CSS}</style></head><body style="padding:20px;${vars(t)}">${html}</body></html>`, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      const png = await page.locator('.fig, .banner').first().screenshot({ omitBackground: true });
      const file = webp(png, join(OUT, `${name}${theme === 'night' && fig.themes.length > 1 ? '-dark' : ''}.webp`));
      console.log('wrote', relative(process.cwd(), file));
    }
  }
} finally {
  await browser.close();
}
