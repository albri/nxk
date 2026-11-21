// The launch video's scenes: the page every frame is drawn from, what the crowd of 200,000 does and when, and the cue
// sheet the sound is made from. Every figure comes from the same place as the README's: the sign-up's from
// data/idea-counts.json through hundred.ts, the evidence's from the checks' own results in evals/.
//
// The page is plain HTML over one canvas. Each element says in data- attributes when it arrives (data-in), leaves
// (data-out), moves (data-tw) or is typed (data-type); runtime.ts reads them and draws any moment on its own, so frames
// can be drawn in any order. The canvas draws the crowd from the plan's moves, camera, colours and alpha.
import { fontCss, themes, esc, shares, type Theme } from "../kit.ts";
import { hundred, type IdeaCounts } from "../hundred.ts";
import { evidenceNumbers } from "../evidence.ts";
import { ICONS } from "../icons.ts";

export const W = 1920;
export const H = 1080;
export const FPS = 30;
const M = 120; // the left margin

/** The words in data/video.json. */
export interface VideoWords {
  _about: string;
  title: { line: string };
  questions: { asks: string[]; answer: string };
  crowd: { label: string; more: string; dot: string };
  person: { kicker: string; name: string; rows: [string, string][]; head: string };
  matched: {
    head: string;
    facts: string[];
    sorted: Record<BandKey, string>;
    bands: Record<BandKey, string[]>;
    if: string;
    so: string;
    grids: [string, string];
  };
  count: {
    context: string;
    choice: string;
    suits: string;
    leaves_out: string;
    adults: string;
    label: string;
    note: string;
  };
  breakdown: {
    groups: { online: string; tone: "aurora" | "look"; who: string; detail: string; ages: string[] }[];
    fixes: string;
  };
  scan: {
    how: string;
    who: string[];
    model: string;
    model_what: string;
    someone: string;
    question: string;
    answers: string[];
    one: string;
    facts: string[];
    all: string;
    counted: string;
    note: string;
  };
  research: {
    kicker: string;
    command: string;
    ask: string;
    steps: string[];
    cost: string;
    findings: string;
    parts: string[];
  };
  look: { command: string; ask: string; reply_head: string; point: string; label: string; what: string };
  meet: { command: string; ask: string; rows: string[]; what: string; sub: string };
  context: { head: string; sub: string };
  checked: { labels_head: string; labels: string[]; from: string; head: string; rows: { big: string; text: string }[] };
  end: { line: string; install: string };
}

export type BandKey = "age" | "work" | "online";
export type Layout = "field" | "bands:age" | "bands:work" | "bands:online" | "squares";
export type Mode = "crowd" | "leftout" | "target" | "scan";

/** Where the camera looks: the world point `at` (the field's centre or the dot the card opens from) drawn at (sx, sy). */
export interface CameraKey {
  t: number;
  dur: number;
  s: number;
  at: "center" | "target";
  sx: number;
  sy: number;
}

/** What the canvas draws: the people, where they stand and move, and how they look over time. */
export interface CrowdPlan {
  /** Each mix of how a person goes online, age and work, as positions in `cats`, and how many dots stand for it. */
  cells: { online: number; age: number; work: number; n: number }[];
  /** How many people each dot stands for. */
  per: number;
  cats: Record<BandKey, string[]>;
  /** The field: the people in a grid of cols by rows, `pitch` px apart, at (x, y), before the camera. */
  field: { x: number; y: number; cols: number; rows: number; pitch: number; gap: number };
  /** The 100 squares, on screen: the first square's corner, the cell and gap, and each square's way online. */
  squares: { x: number; y: number; cell: number; gap: number; cols: number; online: number[] };
  /** The person the card opens from: a dot in this mix, the one nearest the field's centre. */
  target: { online: number; age: number; work: number };
  arrive: { t: number; spread: number; dur: number };
  moves: { t: number; dur: number; to: Layout; stagger: number; by: "x" | "y" | "random" }[];
  camera: CameraKey[];
  colours: { t: number; dur: number; mode: Mode }[];
  alpha: { t: number; dur: number; a: number }[];
  /** The scan's sweep across the field, on screen. */
  sweep: { t0: number; t1: number; x0: number; x1: number };
  colour: { crowd: string; aurora: string; look: string };
}

/** A sound: when, what kind, and the kind's own settings. */
export interface Cue {
  t: number;
  kind: string;
  i?: number;
  dur?: number;
  pan?: number;
  to?: number;
  n?: number;
  gain?: number;
}

/** Everything the build needs: the page, the crowd's plan, the cue sheet, the chords and the length. */
export interface Video {
  html: string;
  plan: CrowdPlan;
  cues: Cue[];
  sections: [chord: string, start: number][];
  duration: number;
  /** Seconds worth looking at as stills, one in each scene, for checking. */
  stills: number[];
}

// The scenes, in order, and how long each runs. From the scan on, each scene carries one idea, at about the pace of
// the first minute: what a scan is for, the decision model, one fact at a time, every person answering, then each
// command on its own, and the checks one by one.
const SCENES = {
  title: 4.5,
  questions: 6.5,
  crowd: 8,
  person: 9.5,
  matched: 11.5,
  count: 10,
  breakdown: 8,
  scan: 6,
  model: 8,
  facts: 7.5,
  everyone: 9,
  research: 10,
  findings: 8,
  look: 8.5,
  meet: 8,
  context: 6,
  labels: 6.5,
  checks: 13,
  end: 6.5,
};
type Scene = keyof typeof SCENES;
const T = {} as Record<Scene, number>;
let clock = 0;
for (const [k, d] of Object.entries(SCENES) as [Scene, number][]) {
  T[k] = clock;
  clock += d;
}
const DURATION = clock;
const n2 = (v: number) => Math.round(v * 100) / 100;
const at = (k: Scene, o = 0) => n2(T[k] + o);
/** When a scene's elements start to leave: 0.3 s before the next one. */
const exit = (k: Scene) => {
  const keys = Object.keys(SCENES) as Scene[];
  const next = keys[keys.indexOf(k) + 1];
  return next ? n2(T[next] - 0.3) : Infinity;
};

// ---------- the page's parts ----------

/** A text with *starred* phrases drawn in the accent. */
const rich = (s: string) => esc(s).replace(/\*([^*]+)\*/g, '<span class="a">$1</span>');

/** Arrives at a (rising `rise` px over `dur`), leaves at b. */
const fade = (a: number, b = Infinity, rise = 14, dur = 0.38) =>
  `data-in="${n2(a)},${rise},${dur}"${Number.isFinite(b) ? ` data-out="${n2(b)},0.26"` : ""}`;

/** Moves: [start, seconds, property, from, to, ease?] for x, y, s (scale), o (opacity), w (width in %), c (colour). */
type Tween = [number, number, "x" | "y" | "s" | "o" | "w" | "c", number | string, number | string, string?];
const tw = (...moves: Tween[]) => `data-tw='${JSON.stringify(moves.map(([a, ...rest]) => [n2(a), ...rest]))}'`;

const css = (t: Theme) => `
${fontCss()}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:${t.ground};color:${t.ink}}
body{font-kerning:normal;font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased}
#crowd{position:absolute;left:0;top:0;z-index:1}
.abs{position:absolute;z-index:2}
.top{z-index:4}
.display{font-family:"nxk-display";font-weight:600;letter-spacing:-0.01em;line-height:1.06}
.sans{font-family:"nxk-sans"}
.mono{font-family:"nxk-mono"}
.a{color:${t.aurora}}
.h1{font-size:88px}
.lead{font-size:46px;line-height:1.3;color:${t.ink2}}
.note{font-family:"nxk-sans";font-size:28px;line-height:1.35;color:${t.ink3}}
.wm{color:${t.aurora};letter-spacing:-0.02em;line-height:1}
.card{background:${t.card};border:1.5px solid ${t.line};border-radius:22px}
.pill{display:inline-block;font-family:"nxk-mono";border:1.5px solid ${t.line};border-radius:999px;padding:6px 20px;color:${t.ink2};background:${t.card}}
.sq{position:absolute;border-radius:20%}
.caret{display:inline-block;width:0.55em;height:1.05em;margin-left:4px;vertical-align:-0.18em;background:${t.aurora}}
.row{position:absolute;display:flex;align-items:baseline;gap:22px}
.bal{text-wrap:balance}
`;

/** An icon from icons.ts, drawn `size` px across in the theme's colours. */
const iconSvg = (name: string, size: number, t: Theme) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" style="display:block">${ICONS[name](t.ink, t.aurora, t.group)}</svg>`;

/** A line typed in at `start`, `cps` characters a second, its parts kept in their own colours; the caret goes at `hide`. */
function typed(parts: [text: string, colour: string][], start: number, cps: number, hide = Infinity) {
  const spans = parts.map(([s, c]) => `<span data-full="${esc(s)}" style="color:${c}"></span>`).join("");
  return `<span data-type="${n2(start)},${cps},${Number.isFinite(hide) ? n2(hide) : -1}">${spans}<i class="caret"></i></span>`;
}
const typingEnds = (text: string, start: number, cps: number) => n2(start + text.length / cps);

// ---------- the cue sheet ----------

const CUES: Cue[] = [];
const cue = (t: number, kind: string, extra: Omit<Cue, "t" | "kind"> = {}) => CUES.push({ t: n2(t), kind, ...extra });
/** A key tick for each character typed, a little uneven, as hands type. */
function keys(text: string, start: number, cps: number) {
  for (let i = 0; i < text.length; i++)
    if (text[i] !== " ") cue(start + i / cps + ((i * 7919) % 13) / 1000, "key", { i: i % 5 });
}

// ---------- the scenes ----------

/** The scenes, from the words, the sign-up's counts and the names of the 150 facts (maps/uk.json). */
export function video(words: VideoWords, counts: IdeaCounts, factNames: string[]): Video {
  CUES.length = 0;
  const t = themes.dark;
  const h = hundred(counts);
  const ev = evidenceNumbers();
  const parts: string[] = [];
  const add = (s: string) => parts.push(s);

  // the crowd: 10,000 dots, each standing for 20 of the 200,000, so they still read as dots at the size the README shows
  // the video. The field sits right of the words; the title, B and C are the other places it stands.
  const field = { x: 840, y: 252, cols: 125, rows: 80, pitch: 7.2, gap: 18 };
  const center = { x: field.x + (field.cols * field.pitch) / 2, y: field.y + (field.rows * field.pitch) / 2 };
  const A = { s: 1, at: "center" as const, sx: center.x, sy: center.y };
  const TITLE = { s: 0.92, at: "center" as const, sx: 1400, sy: 560 };
  const B = { s: 0.8, at: "center" as const, sx: 1360, sy: 640 };
  const C = { s: 0.72, at: "center" as const, sx: 1470, sy: 640 };
  const camera: CameraKey[] = [{ t: 0, dur: 0, ...TITLE }];
  const colours: CrowdPlan["colours"] = [{ t: 0, dur: 0, mode: "leftout" }];
  const alpha: CrowdPlan["alpha"] = [{ t: 0, dur: 0, a: 0.9 }];
  const moves: CrowdPlan["moves"] = [];
  let sweepPlan: CrowdPlan["sweep"] = { t0: 0, t1: 0, x0: 0, x1: 0 };

  // ---------- 1. title: frame 0 is the thumbnail GitHub shows, so it starts finished ----------
  {
    const out = at("title", 3.8);
    add(
      `<div class="abs display wm" style="left:${M - 10}px;top:282px;font-size:230px" ${tw([out, 0.3, "o", 1, 0], [out, 0.3, "y", 0, -16])}>nxk</div>`,
    );
    add(
      `<div class="abs sans" style="left:${M}px;top:560px;font-size:54px;color:${t.ink}" ${tw([out + 0.05, 0.3, "o", 1, 0], [out + 0.05, 0.3, "y", 0, -16])}>${rich(words.title.line)}</div>`,
    );
    alpha.push({ t: at("title", 3.9), dur: 0.6, a: 0 });
    colours.push({ t: at("title", 4.6), dur: 0, mode: "crowd" });
    cue(0, "bell", { i: 0, gain: 0.5 });
    cue(at("title", 3.75), "air", { dur: 0.9 });
  }

  // ---------- 2. the questions ----------
  {
    const q = words.questions;
    const out = exit("questions");
    const times = [0.3, 1.5, 2.7].map((o) => at("questions", o));
    q.asks.forEach((ask, i) => {
      const dim = times[i + 1] ?? at("questions", 4.1);
      add(
        `<div class="abs display h1" style="left:${M}px;top:${230 + i * 128}px;font-size:96px" ${fade(times[i], out)} ${tw([dim, 0.4, "o", 1, 0.38])}>${rich(ask)}</div>`,
      );
      cue(times[i], "wood", { i });
    });
    add(
      `<div class="abs sans" style="left:${M}px;top:${230 + 3 * 128 + 70}px;font-size:58px;color:${t.ink}" ${fade(at("questions", 4.1), out)}>${rich(q.answer)}</div>`,
    );
    cue(at("questions", 4.1), "swell", { dur: 2.2 });
    cue(at("questions", 5.9), "whoosh", { dur: 1.0, to: 1 });
  }

  // ---------- 3. the crowd: the dots pour in, and the counter counts the people they stand for ----------
  const arrive = { t: at("crowd", 0.2), spread: 2.4, dur: 0.6 };
  {
    const c = words.crowd;
    const out = exit("crowd");
    alpha.push({ t: at("crowd", 0), dur: 0, a: 1 });
    camera.push({ t: at("crowd", 0), dur: 0, ...A });
    add(
      `<div class="abs display" id="count" style="left:${M - 6}px;top:330px;font-size:200px;color:${t.ink}" ${fade(at("crowd", 0.1), out, 0)}>0</div>`,
    );
    add(
      `<div class="abs sans" style="left:${M}px;top:560px;font-size:54px;color:${t.ink}" ${fade(at("crowd", 2.9), out)}>${rich(c.label)}</div>`,
    );
    add(
      `<div class="abs sans" style="left:${M}px;top:640px;font-size:42px;color:${t.ink3}" ${fade(at("crowd", 4.4), out)}>${rich(c.more)}</div>`,
    );
    add(
      `<div class="abs mono" style="left:${field.x}px;top:${field.y + field.rows * field.pitch + 22}px;font-size:28px;color:${t.ink3}" ${fade(at("crowd", 3.4), out, 6)}>${esc(c.dot)}</div>`,
    );
    cue(arrive.t, "shimmer", { dur: arrive.spread + arrive.dur });
    cue(arrive.t, "ticker", { dur: arrive.spread + arrive.dur * 0.5 });
    cue(at("crowd", 2.85), "thud", { i: 1 });
    cue(at("crowd", 4.4), "tick", { i: 4 });
  }

  // ---------- 4. one person: the camera dives into the crowd and one dot opens into a card ----------
  {
    const p = words.person;
    const dive = at("person", 0.2),
      open = at("person", 1.5),
      out = exit("person");
    colours.push({ t: at("person", 0), dur: 0.4, mode: "target" });
    camera.push({ t: dive, dur: 0, s: 1, at: "target", sx: -1, sy: -1 }); // -1: where the target stands now
    camera.push({ t: dive, dur: 1.3, s: 9, at: "target", sx: 1290, sy: 540 });
    alpha.push({ t: open, dur: 0.5, a: 0.14 });
    // the names of the facts every person has, in rows above and below the card, drifting up
    const lines = [...Array(7).keys()].flatMap((k) => [44 + k * 30, 856 + k * 30]).sort((x, y) => x - y);
    let line = 0,
      x = 780;
    for (const [i, name] of factNames.entries()) {
      const w = name.length * 12; // Plex Mono at 20 px: 12 px a character
      if (x + w > 1880) {
        line++;
        x = 780 + rand(line) * 90;
      }
      if (line >= lines.length) break;
      add(
        `<div class="abs mono" style="left:${x.toFixed(0)}px;top:${lines[line]}px;font-size:20px;color:${t.ink3};opacity:0.45;z-index:2" ${fade(open + 0.2 + rand(i + 99) * 1.8, out, 0, 0.6)} ${tw([open, 7.5, "y", 0, -22, "lin"])}>${esc(name)}</div>`,
      );
      x += w + 30;
    }
    const rows = p.rows
      .map(
        ([k, v], i) =>
          `<div style="display:flex;gap:28px;margin-top:${i ? 18 : 0}px" ${fade(open + 0.55 + i * 0.42, Infinity, 10)}><span class="mono" style="flex:0 0 170px;font-size:28px;color:${t.ink3};padding-top:6px">${esc(k)}</span><span class="sans" style="font-size:35px;line-height:1.25;color:${t.ink}">${esc(v)}</span></div>`,
      )
      .join("");
    add(`<div class="abs top" style="left:${1290 - 480}px;top:0;width:960px;height:${H}px;display:flex;align-items:center"><div class="card" style="width:960px;padding:40px 46px 44px;transform-origin:50% 50%" ${tw([open, 0.5, "s", 0.035, 1, "back"], [open, 0.18, "o", 0, 1], [out, 0.3, "s", 1, 0.035, "in"], [out + 0.12, 0.18, "o", 1, 0])}>
      <div class="mono" style="font-size:28px;color:${t.ink3}">${esc(p.kicker)}</div>
      <div class="display" style="font-size:58px;margin:14px 0 28px;color:${t.ink}">${esc(p.name)}</div>${rows}</div></div>`);
    add(
      `<div class="abs display" style="left:${M}px;top:360px;width:660px;font-size:84px;color:${t.ink};z-index:3" ${fade(at("person", 4.6), out)}>${rich(p.head)}</div>`,
    );
    cue(dive, "whoosh", { dur: 1.35, to: 1 });
    cue(open, "snap");
    p.rows.forEach((_, i) => cue(open + 0.55 + i * 0.42, "pluck", { i: i + 2 }));
    cue(open + 0.2, "wash", { dur: 3.2 });
    cue(at("person", 4.6), "tick", { i: 3 });
  }

  // ---------- 5. matched: the crowd sorts itself by fact, then the README's "if 22 in 100" ----------
  const sorts: [BandKey, number][] = [
    ["age", at("matched", 1.6)],
    ["work", at("matched", 3.6)],
    ["online", at("matched", 5.6)],
  ];
  {
    const m = words.matched;
    const back = at("matched", 0),
      split = at("matched", 7.6);
    camera.push({ t: back, dur: 1.2, ...B });
    colours.push({ t: back, dur: 0.4, mode: "crowd" });
    alpha.push({ t: back + 0.1, dur: 0.6, a: 1 });
    add(
      `<div class="abs display" style="left:${M}px;top:150px;font-size:76px;color:${t.ink}" ${fade(at("matched", 0.9), split)}>${rich(m.head)}</div>`,
    );
    const facts = m.facts
      .map((f) => {
        const sort = sorts.find(([k]) => m.sorted[k] === f);
        const lit = sort ? tw([sort[1], 0.3, "c", t.ink3, t.aurora]) : "";
        return `<span ${lit} style="color:${t.ink3}">${esc(f)}</span>`;
      })
      .join(`<span style="color:${t.edge}"> · </span>`);
    add(
      `<div class="abs mono" style="left:${M}px;top:252px;font-size:36px" ${fade(at("matched", 1.2), split)}>${facts}</div>`,
    );
    for (const [j, [key, when]] of sorts.entries()) {
      moves.push({ t: when, dur: 1.0, to: `bands:${key}`, stagger: 0.3, by: "x" });
      const until = sorts[j + 1]?.[1] ?? split;
      m.bands[key].forEach((label, i) =>
        add(
          `<div class="abs mono" data-band="${key},${i},${when}" style="right:${W - 968}px;font-size:30px;color:${t.ink2};text-align:right" ${fade(when + 0.55, until - 0.1, 0, 0.3)}>${esc(label)}</div>`,
        ),
      );
      cue(when, "flow", { dur: 1.5, pan: -0.4, to: 0.4 });
      cue(when + 0.05, "pluck", { i: 5 + j });
    }
    alpha.push({ t: split, dur: 0.5, a: 0 });
    // two grids of 100, 22 lit in each
    const grid = (x: number, y: number, lit: number, label: string) => {
      let s = "";
      for (let n = 0; n < 100; n++) {
        const gx = x + (n % 10) * 50,
          gy = y + Math.floor(n / 10) * 50;
        s += `<div class="sq" style="left:${gx}px;top:${gy}px;width:40px;height:40px;background:${t.group};z-index:2" ${fade(lit - 0.8 + n * 0.004, exit("matched"), 0, 0.25)}></div>`;
        if (n >= 78)
          s += `<div class="sq" style="left:${gx}px;top:${gy}px;width:40px;height:40px;background:${t.aurora};z-index:2" ${fade(lit + (n - 78) * 0.018, exit("matched"), 0, 0.2)}></div>`;
      }
      s += `<div class="abs mono" style="left:${x}px;top:${y + 520}px;width:490px;text-align:center;font-size:32px;color:${t.ink2}" ${fade(lit - 0.6, exit("matched"))}>${esc(label)}</div>`;
      return s;
    };
    const lit1 = at("matched", 8.6),
      lit2 = at("matched", 9.8);
    add(
      `<div class="abs sans" style="left:${M}px;top:150px;width:1680px;font-size:50px;color:${t.ink}" ${fade(split + 0.2, exit("matched"))}>${rich(m.if)}</div>`,
    );
    add(
      `<div class="abs sans" style="left:${M}px;top:222px;width:1680px;font-size:50px;color:${t.ink}" ${fade(lit2, exit("matched"))}>${rich(m.so)}</div>`,
    );
    add(grid(250, 360, lit1, m.grids[0]));
    add(
      `<div class="abs display" style="left:${W / 2 - 40}px;top:520px;font-size:120px;color:${t.ink3}" ${fade(lit2 - 0.4, exit("matched"), 0)}>≈</div>`,
    );
    add(grid(1180, 360, lit2, m.grids[1]));
    cue(split, "whoosh", { dur: 0.9, to: -1, gain: 0.6 });
    cue(lit1 - 0.8, "ripple", { n: 100, dur: 0.45, gain: 0.5 });
    cue(lit1, "ripple", { n: 22, dur: 0.4, i: 1 });
    cue(lit2 - 0.8, "ripple", { n: 100, dur: 0.45, gain: 0.5 });
    cue(lit2, "chime", { i: 0 });
  }

  // ---------- 6. a count: one choice, the people it leaves out lit where they stand, then 100 squares ----------
  const online = h.online; // phone, other, none, as in idea-counts.json
  const at100 = (key: string) => h.byOnline[online.indexOf(key)];
  const suits = at100("phone");
  const out16 = 100 - suits;
  const order = [
    ...Array(suits).fill("phone"),
    ...words.breakdown.groups.flatMap((g) => Array(at100(g.online)).fill(g.online)),
  ];
  const sq = { x: M, y: 330, cell: 56, gap: 14, cols: 10 };
  const sqPos = (n: number) => [sq.x + (n % 10) * (sq.cell + sq.gap), sq.y + Math.floor(n / 10) * (sq.cell + sq.gap)];
  {
    const c = words.count;
    const start = at("count", 0);
    const lightUp = at("count", 2.6),
      gather = at("count", 4.0),
      land = gather + 1.45;
    moves.push({ t: start, dur: 0, to: "field", stagger: 0, by: "x" });
    colours.push({ t: start, dur: 0, mode: "crowd" });
    alpha.push({ t: at("count", 0.9), dur: 0.6, a: 1 });
    const keep = exit("breakdown");
    add(
      `<div class="abs sans" style="left:${M}px;top:96px;font-size:34px;color:${t.ink2}" ${fade(at("count", 0.3), keep)}>${rich(c.context)}</div>`,
    );
    add(
      `<div class="abs display" style="left:${M - 22}px;top:150px;font-size:66px;font-weight:500;color:${t.ink}" ${fade(at("count", 0.7), keep)}>${esc(c.choice)}</div>`,
    );
    add(
      `<div class="abs" style="left:${M}px;top:262px;width:${W - 2 * M}px;height:2px;background:${t.ink};transform-origin:0 50%" ${fade(at("count", 1.0), keep, 0)} ${tw([at("count", 1.0), 0.8, "s", 0, 1, "inout"])}></div>`,
    );
    colours.push({ t: lightUp, dur: 0.5, mode: "leftout" });
    moves.push({ t: gather, dur: 1.0, to: "squares", stagger: 0.45, by: "random" });
    alpha.push({ t: land, dur: 0.35, a: 0 });
    // the squares the dots become: the people it suits in grey, then each group it leaves out in its colour
    const tone = (o: string) =>
      o === "phone" ? t.group : t[words.breakdown.groups.find((g) => g.online === o)?.tone ?? "aurora"];
    // each square's age band: the group's own people from hundred.ts, youngest first, in the order its squares come
    const agesOf = new Map<string, string[]>(
      online.map((o, oi) => [o, h.people.filter((p) => p[2] === oi).map((p) => h.age[p[0]])]),
    );
    const ages = (n: number) => agesOf.get(order[n])![n - order.indexOf(order[n])];
    order.forEach((o, n) => {
      const [x, y] = sqPos(n);
      let dim = "";
      if (o === "phone") dim = tw([at("breakdown", 0.2), 0.5, "o", 1, 0.28]);
      else {
        const g = words.breakdown.groups.findIndex((gg) => gg.online === o);
        const when = at("breakdown", g === 0 ? 1.4 : 3.3);
        if (!words.breakdown.groups[g].ages.includes(ages(n))) dim = tw([when, 0.4, "o", 1, 0.3]);
      }
      add(
        `<div class="sq" style="left:${x}px;top:${y}px;width:${sq.cell}px;height:${sq.cell}px;background:${tone(o)};z-index:2" ${fade(land - 0.1 + n * 0.002, keep, 0, 0.3)} ${dim}></div>`,
      );
    });
    // the counts beside them
    const nx = 1010,
      out = exit("count");
    add(
      `<div class="row" style="left:${nx}px;top:330px" ${fade(land + 0.2, out)}><span class="display" style="font-size:150px;width:190px;text-align:right">${suits}</span><span class="sans" style="font-size:52px;color:${t.ink2}">${esc(c.suits)}</span></div>`,
    );
    add(
      `<div class="row" style="left:${nx}px;top:500px" ${fade(land + 0.8, out)}><span class="display" style="font-size:150px;width:190px;text-align:right">${out16}</span><span class="sans" style="font-size:52px;color:${t.ink2}">${esc(c.leaves_out)}</span></div>`,
    );
    add(
      `<div class="abs sans" style="left:${nx + 20}px;top:730px;width:780px;font-size:46px;line-height:1.3;color:${t.ink}" ${fade(land + 1.9, out)}>${rich(c.adults.replace("{out}", String(out16)))} <span class="pill" style="font-size:28px;vertical-align:6px">${esc(c.label)}</span></div>`,
    );
    add(`<div class="abs note" style="left:${M}px;top:1020px" ${fade(land + 0.4, keep)}>${esc(c.note)}</div>`);
    cue(at("count", 0.7), "swish");
    cue(lightUp, "glint", { i: 0 });
    cue(lightUp + 0.16, "glint", { i: 1 });
    cue(gather, "flow", { dur: 1.5, pan: 0.5, to: -0.5 });
    cue(land - 0.1, "ripple", { n: 100, dur: 0.3 });
    cue(land + 0.2, "thud", { i: 0 });
    cue(land + 0.8, "thud", { i: 0, gain: 0.8 });
    cue(land + 1.9, "rise", { dur: 0.9 });
  }

  // ---------- 7. the breakdown: the two groups, and who they are ----------
  {
    const b = words.breakdown;
    const out = exit("breakdown");
    b.groups.forEach((g, i) => {
      const of = at100(g.online);
      const n = h.people.filter((p) => online[p[2]] === g.online && g.ages.includes(h.age[p[0]])).length;
      const top = 360 + i * 210,
        when = at("breakdown", 0.5 + i * 1.9);
      add(
        `<div class="abs" style="left:1010px;top:${top + 14}px;width:34px;height:34px;border-radius:8px;background:${t[g.tone]}" ${fade(when, out)}></div>`,
      );
      add(
        `<div class="abs sans" style="left:1070px;top:${top}px;width:760px;font-size:48px;line-height:1.2;color:${t.ink}" ${fade(when, out)}><b style="font-weight:600">${of}</b> ${esc(g.who)}</div>`,
      );
      add(
        `<div class="abs sans" style="left:1070px;top:${top + (g.who.length > 26 ? 128 : 70)}px;font-size:40px;color:${t.ink2}" ${fade(when + 0.9, out)}>${esc(g.detail.replace("{n}", String(n)).replace("{of}", String(of)))}</div>`,
      );
      cue(when, "pluck", { i: 4 - i });
      cue(when + 0.9, "tick", { i: 2 + i });
    });
    add(
      `<div class="abs display" style="left:1010px;top:820px;width:820px;font-size:66px;color:${t.ink}" ${fade(at("breakdown", 4.6), out)}>${rich(b.fixes)}</div>`,
    );
    cue(at("breakdown", 4.6), "resolve");
  }

  // a headline at the top of the screen, across the width
  const head = (text: string, a: number, b: number, size = 76, top = 120) =>
    `<div class="abs display bal" style="left:${M}px;top:${top}px;width:${W - 2 * M}px;font-size:${size}px;color:${t.ink}" ${fade(a, b)}>${rich(text)}</div>`;

  // ---------- 8. what a scan is for: a count says how many; who would want it is a scan ----------
  {
    const s = words.scan;
    const start = at("scan", 0),
      out = exit("scan");
    moves.push({ t: start, dur: 0, to: "field", stagger: 0, by: "x" });
    camera.push({ t: start, dur: 0, ...C });
    // the crowd comes back as the count left it, the people the sign-up leaves out still lit
    colours.push({ t: start, dur: 0, mode: "leftout" });
    alpha.push({ t: at("scan", 0.2), dur: 0.7, a: 1 });
    const how = at("scan", 0.4),
      who = at("scan", 2.6);
    add(
      `<div class="abs display" style="left:${M}px;top:300px;font-size:76px;color:${t.ink}" ${fade(how, out)} ${tw([who, 0.4, "o", 1, 0.38])}>${rich(s.how)}</div>`,
    );
    s.who.forEach((line, i) =>
      add(
        `<div class="abs display" style="left:${M}px;top:${430 + i * 96}px;font-size:76px;color:${t.ink}" ${fade(who + i * 0.6, out)}>${rich(line)}</div>`,
      ),
    );
    colours.push({ t: who, dur: 0.8, mode: "crowd" });
    cue(how, "wood", { i: 1 });
    cue(who, "wood", { i: 2 });
    cue(who + 0.6, "swell", { dur: 2.8 });
  }

  // ---------- 9. the decision model, asked one question ----------
  const s = words.scan;
  const widths = [
    [58, 30, 12],
    [66, 24, 10],
    [40, 38, 22],
    [47, 33, 20],
  ]; // how long each answer's bar is, for each fact: a sketch, no result
  const swaps = [0, 1.2, 3.0, 4.8].map((o) => at("facts", o)); // when the card's fact changes
  const fillAt = at("model", 3.7);
  const cardOut = at("everyone", 0.4);
  {
    const out = exit("model");
    alpha.push({ t: at("model", 0.2), dur: 0.8, a: 0.22 });
    add(head(s.model, at("model", 0.3), out));
    add(
      `<div class="abs sans lead bal" style="left:${M}px;top:228px;width:${W - 2 * M}px;font-size:42px" ${fade(at("model", 1.3), out)}>${rich(s.model_what)}</div>`,
    );
    // the fact in the question, one at a time, in a pill wide enough for the longest
    const facts = s.facts
      .map((f, k) => {
        const shown: Tween[] = [];
        if (k > 0) shown.push([swaps[k] + 0.1, 0.25, "o", 0, 1]);
        if (k < s.facts.length - 1) shown.push([swaps[k + 1], 0.2, "o", 1, 0]);
        return `<span style="position:absolute;left:22px;top:7px;white-space:nowrap" ${tw(...shown)}>${esc(f)}</span>`;
      })
      .join("");
    const pill = `<span class="pill" style="position:relative;display:block;width:340px;height:54px;padding:0;font-size:28px;color:${t.ink}">${facts}</span>`;
    const answers = s.answers
      .map((a, j) => {
        const bar: Tween[] = [[fillAt + j * 0.15, 0.6, "w", 0, widths[0][j]]];
        for (let k = 1; k < widths.length; k++)
          bar.push([swaps[k] + 0.25, 0.6, "w", widths[k - 1][j], widths[k][j], "inout"]);
        return `<div style="display:flex;align-items:center;gap:24px;margin-top:${j ? 20 : 0}px"><span class="sans" style="flex:0 0 270px;font-size:32px;color:${t.ink2}">${esc(a)}</span><span style="display:block;flex:0 0 420px;height:14px;border-radius:7px;background:${t.hair};overflow:hidden"><span style="display:block;height:100%;border-radius:7px;background:${t.aurora};width:0" ${tw(...bar)}></span></span></div>`;
      })
      .join("");
    const cardIn = at("model", 2.5);
    add(
      `<div class="abs card" style="left:${M}px;top:400px;width:880px;padding:32px 40px 40px;transform-origin:0 50%" ${fade(cardIn, Infinity, 16)} ${tw([cardOut, 0.35, "s", 1, 0.96, "in"], [cardOut, 0.3, "o", 1, 0])}>
      <div style="display:flex;align-items:center;gap:20px"><span class="mono" style="font-size:28px;color:${t.ink3}">${esc(s.someone)}</span>${pill}</div>
      <div class="sans" style="font-size:34px;line-height:1.3;color:${t.ink};margin:20px 0 26px">${esc(s.question)}</div>
      <div style="height:1.5px;background:${t.line};margin-bottom:28px"></div>${answers}</div>`,
    );
    add(`<div class="abs note" style="left:${M}px;top:1000px" ${fade(fillAt, exit("everyone"))}>${esc(s.note)}</div>`);
    cue(at("model", 0.3), "swish");
    cue(cardIn, "slide");
    cue(fillAt, "ping", { i: 0 });
  }

  // ---------- 10. one fact at a time: the card's fact changes, and each one asked drops below it ----------
  const fly = at("everyone", 0.7);
  {
    add(head(s.one, at("facts", 0.3), exit("facts")));
    const dropAt = [1.2, 3.0, 4.8, 6.3].map((o) => at("facts", o));
    let x = M;
    s.facts.forEach((f, k) => {
      const w = f.length * 15.6 + 44; // Plex Mono at 26 px, and the pill's padding
      const dx = Math.round(C.sx - (x + w / 2));
      add(
        `<div class="abs pill" style="left:${x.toFixed(0)}px;top:862px;font-size:26px" ${fade(dropAt[k], Infinity, -26, 0.4)} ${tw([fly + k * 0.08, 0.6, "x", 0, dx, "in"], [fly + k * 0.08 + 0.3, 0.3, "o", 1, 0])}>${esc(f)}</div>`,
      );
      x += w + 14;
      if (k > 0) cue(swaps[k] + 0.25, "ping", { i: k });
      cue(dropAt[k] + 0.3, "drop", { i: k + 2 });
    });
  }

  // ---------- 11. every person answers from all their facts, so the answers are counted like any count ----------
  {
    const out = exit("everyone");
    add(head(s.all, at("everyone", 0.3), out, 64));
    alpha.push({ t: at("everyone", 0.5), dur: 0.7, a: 1 });
    const fw = field.cols * field.pitch * C.s,
      fh = field.rows * field.pitch * C.s;
    const x0 = C.sx - fw / 2,
      x1 = C.sx + fw / 2;
    const sweep = { t0: at("everyone", 1.5), t1: at("everyone", 3.7), x0, x1 };
    colours.push({ t: sweep.t0, dur: 0, mode: "scan" });
    add(
      `<div class="abs" style="left:${x0 - 2}px;top:${C.sy - fh / 2 - 20}px;width:3px;height:${fh + 40}px;background:${t.aurora};box-shadow:0 0 18px ${t.aurora};z-index:3" ${fade(sweep.t0, sweep.t1, 0, 0.15)} ${tw([sweep.t0, sweep.t1 - sweep.t0, "x", 0, fw + 2, "inout"])}></div>`,
    );
    sweepPlan = sweep;
    const counted = at("everyone", 4.7),
      sortAt = at("everyone", 5.3);
    add(
      `<div class="abs sans" style="left:${M}px;top:292px;font-size:44px;color:${t.ink}" ${fade(counted, out)}>${rich(s.counted)}</div>`,
    );
    moves.push({ t: sortAt, dur: 1.0, to: "bands:age", stagger: 0.3, by: "x" });
    words.matched.bands.age.forEach((label, i) =>
      add(
        `<div class="abs mono" data-band="age,${i},${sortAt}" style="right:${(W - x0 + 30).toFixed(0)}px;font-size:30px;color:${t.ink2};text-align:right" ${fade(sortAt + 0.6, out, 0, 0.3)}>${esc(label)}</div>`,
      ),
    );
    cue(cardOut, "whoosh", { dur: 0.6, to: -1, gain: 0.4 });
    cue(fly, "whoosh", { dur: 0.8, to: 1, gain: 0.5 });
    cue(sweep.t0, "sweep", { dur: sweep.t1 - sweep.t0 });
    cue(sweep.t0 + 0.3, "shimmer", { dur: 2.2, gain: 0.5 });
    cue(counted, "tick", { i: 1 });
    cue(sortAt, "flow", { dur: 1.5, pan: -0.4, to: 0.4 });
    cue(sortAt + 0.05, "pluck", { i: 5 });
  }

  // the commands are typed into one terminal line, kept on screen from research to the panel
  const term = 170;
  add(
    `<div class="abs mono" style="left:${M}px;top:110px;font-size:30px;color:${t.ink3}" ${fade(at("research", 0.2), exit("meet"))}>${esc(words.research.kicker)}</div>`,
  );
  add(
    `<div class="abs card" style="left:${M}px;top:${term}px;width:${W - 2 * M}px;height:116px;background:${t.inset}" ${fade(at("research", 0.3), exit("meet"), 10)}></div>`,
  );
  /** A command typed into the terminal line; returns when the typing ends. */
  const command = (cmd: string, ask: string, start: number, out: number, cps: number) => {
    const end = typingEnds(cmd + ask, start, cps);
    add(
      `<div class="abs mono" style="left:${M + 48}px;top:${term + 28}px;font-size:46px;color:${t.ink3}" ${fade(start - 0.3, out, 0)}>›</div>`,
    );
    add(
      `<div class="abs mono" style="left:${M + 100}px;top:${term + 28}px;font-size:46px;white-space:pre" ${fade(start - 0.3, out, 0)}>${typed(
        [
          [cmd, t.aurora],
          [ask, t.ink],
        ],
        start,
        cps,
        end + 0.4,
      )}</div>`,
    );
    keys(cmd + ask, start, cps);
    cue(end + 0.15, "enter");
    return end;
  };

  // ---------- 12. research: the main way in, and what it does, step by step ----------
  {
    const r = words.research;
    const out = exit("research");
    alpha.push({ t: at("research", 0) - 0.4, dur: 0.4, a: 0 });
    const end = command(r.command, r.ask, at("research", 0.9), exit("findings"), 26);
    r.steps.forEach((step, j) => {
      const when = n2(end + 0.7 + j * 1.35);
      add(
        `<div class="abs" style="left:${M}px;top:${372 + j * 112}px;display:flex;align-items:center;gap:30px" ${fade(when, out)}><span class="mono" style="width:60px;height:60px;border-radius:50%;border:2px solid ${t.aurora};color:${t.aurora};font-size:28px;display:flex;align-items:center;justify-content:center">${j + 1}</span><span class="sans" style="font-size:50px;color:${t.ink}">${esc(step)}</span></div>`,
      );
      cue(when, "tick", { i: j });
    });
    add(`<div class="abs note" style="left:${M}px;top:880px" ${fade(at("research", 8.3), out)}>${esc(r.cost)}</div>`);
  }

  // ---------- 13. findings: what research hands back, one part at a time ----------
  {
    const r = words.research;
    const out = exit("findings");
    add(
      `<div class="abs display" style="left:${M}px;top:338px;font-size:62px;color:${t.ink}" ${fade(at("findings", 0.3), out)}>${rich(r.findings)}</div>`,
    );
    const colW = 520,
      top = 452;
    const bar = (w: number, colour: string, h: number, gap: number, when: number) =>
      `<div style="height:${h}px;width:${w}%;margin-top:${gap}px;border-radius:${h / 2}px;background:${colour}" ${fade(when, Infinity, 6, 0.3)}></div>`;
    r.parts.forEach((part, j) => {
      const when = at("findings", 1.1 + j * 2.0);
      const x = M + j * (colW + 60);
      let rows = "";
      if (j === 0)
        [
          [70, 92],
          [55, 74],
          [62, 58],
        ].forEach(([lw, sw], k) => {
          rows +=
            bar(lw, t.line, 12, k ? 30 : 8, when + 0.35 + k * 0.18) + bar(sw, t.aurora, 16, 12, when + 0.4 + k * 0.18);
        });
      else if (j === 1)
        [
          [64, 66],
          [50, 48],
        ].forEach(([lw, sw], k) => {
          rows +=
            bar(lw, t.line, 12, k ? 30 : 8, when + 0.35 + k * 0.18) + bar(sw, t.look, 16, 12, when + 0.4 + k * 0.18);
        });
      else
        rows += `<div style="display:flex;gap:14px;margin-top:8px" ${fade(when + 0.35, Infinity, 6, 0.3)}><span class="pill" style="font-size:26px">A</span><span class="pill" style="font-size:26px">B</span></div>${bar(80, t.line, 12, 26, when + 0.5)}${bar(56, t.line, 12, 16, when + 0.6)}`;
      add(
        `<div class="abs card" style="left:${x}px;top:${top}px;width:${colW}px;height:372px;padding:30px 32px" ${fade(when, out, 16)}><div class="sans" style="font-size:32px;line-height:1.3;color:${t.ink};height:132px">${esc(part)}</div>${rows}</div>`,
      );
      cue(when, "slide", { pan: -0.5 + j * 0.5 });
      cue(when + 0.35, "pluck", { i: 5 + j });
    });
  }

  // ---------- 14. a second look: the command, a real point from the README, and what it hands back ----------
  {
    const l = words.look;
    const out = exit("look");
    const end = command(l.command, l.ask, at("look", 0.5), out, 28);
    const reply = n2(end + 0.6);
    add(
      `<div class="abs card" style="left:${M}px;top:338px;width:${W - 2 * M}px;padding:36px 48px 42px" ${fade(reply, out, 16)}><div class="mono" style="font-size:30px;color:${t.ink3}">${esc(l.reply_head)}</div><div class="sans" style="font-size:40px;line-height:1.4;color:${t.ink};margin-top:18px;max-width:1560px" ${fade(reply + 0.4, Infinity, 8)}>– ${rich(l.point)} <span class="pill" style="font-size:26px;vertical-align:5px">${esc(l.label)}</span></div></div>`,
    );
    add(
      `<div class="abs display" style="left:${M}px;top:730px;font-size:58px;color:${t.ink}" ${fade(at("look", 5.4), out)}>${rich(l.what)}</div>`,
    );
    cue(reply, "slide");
    cue(reply + 0.4, "chime", { i: 1, gain: 0.5 });
    cue(at("look", 5.4), "tick", { i: 2 });
  }

  // ---------- 15. the panel: the command, a few people as cards, and what it hands back ----------
  {
    const m = words.meet;
    const out = exit("meet");
    const end = command(m.command, m.ask, at("meet", 0.5), out, 30);
    [0, 1, 2].forEach((k) => {
      const when = n2(end + 0.5 + k * 0.3);
      const rows = m.rows
        .map(
          (r, j) =>
            `<div style="display:flex;align-items:center;gap:18px;margin-top:${j ? 18 : 0}px"><span class="mono" style="flex:0 0 140px;font-size:24px;color:${t.ink3}">${esc(r)}</span><span style="display:block;height:12px;width:${[78, 64, 70, 84, 58][(j + k * 2) % 5]}%;border-radius:6px;background:${t.line}"></span></div>`,
        )
        .join("");
      add(
        `<div class="abs card" style="left:${M + k * 580}px;top:338px;width:520px;padding:30px 32px 34px" ${fade(when, out, 30, 0.45)}><div style="height:24px;width:${[62, 70, 56][k]}%;border-radius:8px;background:${t.ink3};opacity:0.55;margin-bottom:26px"></div>${rows}</div>`,
      );
      cue(when, "slide", { pan: -0.5 + k * 0.5, gain: 0.8 });
    });
    add(
      `<div class="abs display" style="left:${M}px;top:700px;font-size:62px;color:${t.ink}" ${fade(at("meet", 4.4), out)}>${rich(m.what)}</div>`,
    );
    add(
      `<div class="abs sans" style="left:${M}px;top:790px;width:${W - 2 * M}px;font-size:40px;line-height:1.3;color:${t.ink2}" ${fade(at("meet", 5.0), out)}>${rich(m.sub)}</div>`,
    );
    cue(at("meet", 4.4), "tick", { i: 3 });
  }

  // ---------- 16. each in its own context, only when asked ----------
  {
    const c = words.context;
    const out = exit("context");
    add(head(c.head, at("context", 0.3), out, 72, 200));
    (
      [
        ["research", words.research.command],
        ["look", words.look.command],
        ["meet", words.meet.command],
      ] as const
    ).forEach(([icon, cmd], k) => {
      const when = at("context", 1.3 + k * 0.3);
      add(
        `<div class="abs card" style="left:${M + k * 580}px;top:430px;width:520px;height:200px;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:22px" ${fade(when, out, 16)}>${iconSvg(icon, 64, t)}<span class="mono" style="font-size:36px;color:${t.aurora}">${esc(cmd)}</span></div>`,
      );
      cue(when, "tick", { i: k, gain: 0.6 });
    });
    add(
      `<div class="abs sans" style="left:${M}px;top:690px;width:${W - 2 * M}px;font-size:44px;line-height:1.3;color:${t.ink2}" ${fade(at("context", 2.8), out)}>${rich(c.sub)}</div>`,
    );
    cue(at("context", 2.8), "swell", { dur: 2.6 });
  }

  // ---------- 17. every figure's label, and the two the video has shown ----------
  {
    const c = words.checked;
    const out = exit("labels");
    add(
      `<div class="abs display" style="left:${M}px;top:280px;font-size:88px;color:${t.ink}" ${fade(at("labels", 0.3), out)}>${rich(c.labels_head)}</div>`,
    );
    const lit = at("labels", 3.4);
    const pills = c.labels
      .map((l, i) => {
        const shown = l === "counted" || l === "simulated";
        return `<span class="pill" style="font-size:32px" ${fade(at("labels", 1.0) + i * 0.16, Infinity, 10, 0.25)} ${shown ? tw([lit, 0.4, "c", t.ink2, t.aurora]) : tw([lit, 0.4, "o", 1, 0.35])}>${esc(l)}</span>`;
      })
      .join("");
    add(
      `<div class="abs" style="left:${M}px;top:440px;width:${W - 2 * M}px;display:flex;flex-wrap:wrap;gap:18px" ${fade(at("labels", 0.95), out, 0)}>${pills}</div>`,
    );
    c.labels.forEach((_, i) => cue(at("labels", 1.0) + i * 0.16, "tick", { i: i % 5, gain: 0.45 }));
    add(
      `<div class="abs sans" style="left:${M}px;top:610px;font-size:50px;color:${t.ink}" ${fade(lit + 0.3, out)}>${rich(c.from)}</div>`,
    );
    cue(lit, "glint", { i: 0 });
    cue(lit + 0.15, "glint", { i: 1 });
  }

  // ---------- 18. checked: the three checks against published figures, one at a time ----------
  {
    const c = words.checked;
    const out = exit("checks");
    add(
      `<div class="abs display" style="left:${M}px;top:110px;font-size:76px;color:${t.ink}" ${fade(at("checks", 0.2), out)}>${rich(c.head)}</div>`,
    );
    const values: Record<string, unknown>[] = [ev.census, ev.surveys, ev.products];
    const fill = (str: string, v: Record<string, unknown>) =>
      str.replace(/\{(\w+)\}/g, (_, k: string) => {
        if (v[k] === undefined) throw new Error(`video: no value for {${k}}`);
        return String(v[k]);
      });
    const CH = 196;
    c.rows.forEach((r, i) => {
      const top = 240 + i * 262,
        when = at("checks", 0.7 + i * 4.0);
      let chart = "";
      if (i === 0) {
        chart += `<div class="abs" style="left:${M}px;top:${top}px;width:${CH}px;height:${CH}px;border-radius:10px;background:${t.inset};border:1.5px solid ${t.hair}" ${fade(when, out, 0)}></div>`;
        chart += `<svg class="abs" style="left:${M}px;top:${top}px" width="${CH}" height="${CH}" ${fade(when + 0.1, out, 0)}><line x1="0" y1="${CH}" x2="${CH}" y2="0" stroke="${t.line}" stroke-width="2" stroke-dasharray="4 6"/></svg>`;
        ev.census.points.forEach(([real, made], j) => {
          const x = M + (real / 100) * CH,
            y = top + CH - (made / 100) * CH;
          chart += `<div class="abs" style="left:${(x - 6).toFixed(1)}px;top:${(y - 6).toFixed(1)}px;width:12px;height:12px;border-radius:50%;background:${t.aurora}" ${fade(when + 0.35 + j * 0.035, out, -36, 0.3)}></div>`;
          if (j % 2 === 0) cue(when + 0.35 + j * 0.035 + 0.2, "drop", { i: j });
        });
      } else {
        const v = values[i] as { in100: number };
        for (let n = 0; n < 100; n++) {
          const x = M + (n % 10) * 20,
            y = top + Math.floor(n / 10) * 20;
          chart += `<div class="sq" style="left:${x}px;top:${y}px;width:16px;height:16px;background:${t.group}" ${fade(when + n * 0.002, out, 0, 0.2)}></div>`;
          if (n < v.in100)
            chart += `<div class="sq" style="left:${x}px;top:${y}px;width:16px;height:16px;background:${t.aurora}" ${fade(when + 0.35 + n * 0.007, out, 0, 0.15)}></div>`;
        }
        cue(when + 0.35, "ripple", { n: v.in100, dur: v.in100 * 0.007, i: 1, gain: 0.7 });
      }
      add(chart);
      add(
        `<div class="abs display" style="left:${M + CH + 64}px;top:${top - 10}px;font-size:112px;color:${t.aurora}" ${fade(when + 0.2, out)}>${esc(fill(r.big, values[i]))}</div>`,
      );
      add(
        `<div class="abs sans" style="left:${M + CH + 66}px;top:${top + 116}px;width:1300px;font-size:38px;line-height:1.3;color:${t.ink2}" ${fade(when + 0.5, out)}>${rich(r.text)}</div>`,
      );
      cue(when + 1.0, "chime", { i: 0, gain: 0.8 });
    });
  }

  // ---------- 19. the end: the wordmark and the install line, held ----------
  {
    const e = words.end;
    const start = at("end", 0.3);
    add(
      `<div class="abs display wm" style="left:0;width:${W}px;text-align:center;top:300px;font-size:250px" ${fade(start, Infinity, 0, 0.6)} ${tw([start, 0.9, "s", 0.94, 1])}>nxk</div>`,
    );
    add(
      `<div class="abs sans" style="left:0;width:${W}px;text-align:center;top:590px;font-size:54px;color:${t.ink2}" ${fade(start + 0.5, Infinity)}>${rich(e.line)}</div>`,
    );
    const typeAt = start + 1.4,
      cps = 34;
    add(
      `<div class="abs" style="left:0;width:${W}px;top:720px;display:flex;justify-content:center" ${fade(start + 1.0, Infinity, 10)}><div class="mono" style="font-size:42px;padding:22px 36px;border-radius:14px;background:${t.inset};border:1.5px solid ${t.line};white-space:pre;min-width:1080px">${typed([[e.install, t.ink]], typeAt, cps)}</div></div>`,
    );
    cue(start, "bell", { i: 1 });
    cue(start, "swell", { dur: 3 });
    keys(e.install, typeAt, cps);
    cue(typingEnds(e.install, typeAt, cps) + 0.2, "enter", { gain: 0.6 });
  }

  // the crowd's plan: each mix's dots, rounded so they add up to 10,000
  const PER = 20;
  const total = counts.cells.reduce((sum, c) => sum + c.n, 0);
  const dots = shares(
    counts.cells.map((c) => c.n),
    Math.round(total / PER),
  );
  const cats: Record<BandKey, string[]> = { online, age: h.age, work: h.work };
  const plan: CrowdPlan = {
    cells: counts.cells.map((c, k) => ({
      online: online.indexOf(c.online),
      age: h.age.indexOf(c.age),
      work: h.work.indexOf(c.work),
      n: dots[k],
    })),
    per: PER,
    cats,
    field,
    squares: { ...sq, online: order.map((o) => online.indexOf(o)) },
    target: { online: online.indexOf("phone"), age: h.age.indexOf("75+"), work: h.work.indexOf("retired") },
    arrive,
    moves,
    camera,
    colours,
    alpha,
    sweep: sweepPlan,
    colour: { crowd: "#7d8397", aurora: t.aurora, look: t.look },
  };

  const sections: [string, number][] = [
    ["Dmaj9", 0],
    ["Bm9", at("crowd")],
    ["Gmaj9", at("matched")],
    ["Em9", at("count")],
    ["A7sus", at("scan")],
    ["Bm9", at("everyone")],
    ["Gmaj9", at("research")],
    ["Em9", at("look")],
    ["A7sus", at("context")],
    ["D/Fs", at("labels")],
    ["Dmaj9", at("end")],
  ];
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css(t)}</style></head><body><canvas id="crowd" width="${W}" height="${H}"></canvas>${parts.join("\n")}</body></html>`;
  const stills = [
    0,
    at("questions", 5),
    at("crowd", 6),
    at("person", 7),
    at("matched", 7.0),
    at("matched", 11),
    at("count", 8),
    at("breakdown", 7),
    at("scan", 5.5),
    at("model", 7.5),
    at("facts", 7),
    at("everyone", 3),
    at("everyone", 8.5),
    at("research", 9.5),
    at("findings", 7.5),
    at("look", 8),
    at("meet", 7.5),
    at("context", 5.5),
    at("labels", 6),
    at("checks", 12.5),
    at("end", 5),
  ];
  return { html, plan, cues: [...CUES].sort((a, b) => a.t - b.t), sections, duration: DURATION, stills };
}

/** Fixed random numbers, so the page is the same every build. */
function rand(i: number): number {
  let a = (i * 0x9e3779b1) >>> 0;
  a = Math.imul(a ^ (a >>> 15), a | 1);
  a ^= a + Math.imul(a ^ (a >>> 7), a | 61);
  return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
}
