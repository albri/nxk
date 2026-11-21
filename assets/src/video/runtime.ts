/// <reference lib="dom" />
// Runs in the page: install(plan) defines window.seek(t), which draws the video at t seconds from nothing, so any frame
// can be drawn on its own and in any order. video.ts hands this function to the browser as its source, so it uses
// nothing from outside itself.
//
// The words and shapes are HTML, moved by their data- attributes (scenes.ts writes them):
//   data-in="t,rise,dur"   arrives at t, fading in and rising `rise` px over `dur` seconds
//   data-out="t,dur"       leaves at t, fading out
//   data-tw='[[t,dur,prop,from,to,ease],...]'   x, y, s (scale), o (opacity), w (width in %) or c (colour)
//   data-type="t,cps,hide" its spans typed in from t, `cps` characters a second; its caret goes at `hide` (-1: never)
//   data-band="key,i,t"    a label set beside band i of the crowd sorted by `key`, where that band is at t
// The crowd is drawn on the canvas: 10,000 dots, each standing for 20 of the 200,000 made-up adults in their mix of
// facts, drawn as small rounded squares (or, when they are smaller than a few pixels, splatted with their exact
// coverage, so they still move smoothly).
import type { CrowdPlan } from "./scenes.ts";

export function install(plan: CrowdPlan): void {
  const W = 1920,
    H = 1080;
  const clamp = (x: number, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const EASE: Record<string, (x: number) => number> = {
    out: (x) => 1 - (1 - x) ** 3,
    in: (x) => x * x * x,
    inout: (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2),
    lin: (x) => x,
    back: (x) => 1 + 2.2 * (x - 1) ** 3 + 1.2 * (x - 1) ** 2,
  };
  const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));

  // ---------- the people ----------
  let seed = 7;
  const random = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const N = plan.cells.reduce((s, c) => s + c.n, 0);
  const attr = { online: new Uint8Array(N), age: new Uint8Array(N), work: new Uint8Array(N) };
  {
    let i = 0;
    for (const c of plan.cells)
      for (let k = 0; k < c.n; k++, i++) {
        attr.online[i] = c.online;
        attr.age[i] = c.age;
        attr.work[i] = c.work;
      }
  }
  const rnd = new Float32Array(N);
  for (let i = 0; i < N; i++) rnd[i] = random();
  // each person's place in the field, shuffled so the mixes are scattered as they would be in a crowd
  const slot = new Uint32Array(N);
  for (let i = 0; i < N; i++) slot[i] = i;
  for (let i = N - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const s = slot[i];
    slot[i] = slot[j];
    slot[j] = s;
  }
  // a little jitter, so the grid reads as a crowd and doesn't shimmer when the video is scaled down
  const jx = new Float32Array(N),
    jy = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    jx[i] = (random() - 0.5) * 0.5;
    jy[i] = (random() - 0.5) * 0.5;
  }

  const F = plan.field;
  const fw = F.cols * F.pitch,
    fh = F.rows * F.pitch;
  const centre = { x: F.x + fw / 2, y: F.y + fh / 2 };
  const layouts: Record<string, { x: Float32Array; y: Float32Array }> = {};

  // the field: person i at their shuffled slot
  {
    const x = new Float32Array(N),
      y = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const s = slot[i];
      x[i] = F.x + ((s % F.cols) + 0.5 + jx[i]) * F.pitch;
      y[i] = F.y + (Math.floor(s / F.cols) + 0.5 + jy[i]) * F.pitch;
    }
    layouts.field = { x, y };
  }
  // people in field order (row by row), so a sort keeps them roughly where they were
  const byField = new Uint32Array(N);
  for (let i = 0; i < N; i++) byField[slot[i]] = i;

  // sorted by a fact: one band of rows for each answer, top to bottom, a gap between them, centred on the field
  const bandTops: Record<string, number[]> = {};
  for (const key of ["age", "work", "online"] as const) {
    const cats = plan.cats[key].length;
    const count: number[] = Array.from({ length: cats }, () => 0);
    for (let i = 0; i < N; i++) count[attr[key][i]]++;
    const rows = count.map((n: number) => Math.ceil(n / F.cols));
    const total = rows.reduce((s: number, r: number) => s + r * F.pitch, 0) + F.gap * (cats - 1);
    const tops: number[] = [];
    let top = centre.y - total / 2;
    for (let c = 0; c < cats; c++) {
      tops.push(top);
      top += rows[c] * F.pitch + F.gap;
    }
    bandTops[key] = tops.map((tp, c) => tp + (rows[c] * F.pitch) / 2);
    const x = new Float32Array(N),
      y = new Float32Array(N);
    const filled: number[] = Array.from({ length: cats }, () => 0);
    for (let k = 0; k < N; k++) {
      const i = byField[k];
      const c = attr[key][i];
      const j = filled[c]++;
      x[i] = F.x + ((j % F.cols) + 0.5 + jx[i]) * F.pitch;
      y[i] = tops[c] + (Math.floor(j / F.cols) + 0.5 + jy[i]) * F.pitch;
    }
    layouts[`bands:${key}`] = { x, y };
  }

  // the camera: world point `at` drawn at (sx, sy), scaled by s
  let target = 0;
  {
    let best = Infinity;
    const T = plan.target;
    for (let i = 0; i < N; i++)
      if (attr.online[i] === T.online && attr.age[i] === T.age && attr.work[i] === T.work) {
        const d = (layouts.field.x[i] - centre.x) ** 2 + (layouts.field.y[i] - centre.y) ** 2;
        if (d < best) {
          best = d;
          target = i;
        }
      }
  }
  interface Cam {
    s: number;
    px: number;
    py: number;
    sx: number;
    sy: number;
  }
  const anchor = (a: string) =>
    a === "target" ? { px: layouts.field.x[target], py: layouts.field.y[target] } : { px: centre.x, py: centre.y };
  const project = (c: Cam, x: number, y: number) => [(x - c.px) * c.s + c.sx, (y - c.py) * c.s + c.sy];
  function cameraAt(t: number): Cam {
    let cam: Cam | null = null;
    for (const k of plan.camera) {
      if (k.t > t && cam) break;
      const a = anchor(k.at);
      let sx = k.sx,
        sy = k.sy;
      // -1: keep the anchor where the camera before this one drew it
      if (sx < 0 && cam) [sx, sy] = project(cam, a.px, a.py);
      const next: Cam = { s: k.s, px: a.px, py: a.py, sx, sy };
      if (!cam || k.dur === 0 || t >= k.t + k.dur) {
        cam = next;
        continue;
      }
      const u = EASE.inout(clamp((t - k.t) / k.dur));
      cam = {
        s: Math.exp(Math.log(cam.s) + (Math.log(next.s) - Math.log(cam.s)) * u),
        px: cam.px + (next.px - cam.px) * u,
        py: cam.py + (next.py - cam.py) * u,
        sx: cam.sx + (next.sx - cam.sx) * u,
        sy: cam.sy + (next.sy - cam.sy) * u,
      };
    }
    return cam as Cam;
  }

  // the 100 squares, on screen, turned back into the field's own coordinates through the camera when they are used
  {
    const S = plan.squares;
    const when = plan.moves.find((m) => m.to === "squares")?.t ?? 0;
    const cam = cameraAt(when);
    const x = new Float32Array(N),
      y = new Float32Array(N);
    const groups = new Map<number, number[]>();
    S.online.forEach((o, n) => groups.set(o, [...(groups.get(o) ?? []), n]));
    const members = new Map<number, number[]>();
    for (let k = 0; k < N; k++) {
      const i = byField[k];
      const o = attr.online[i];
      if (!members.has(o)) members.set(o, []);
      members.get(o)!.push(i);
    }
    for (const [o, list] of members) {
      const squares = groups.get(o) ?? [];
      const per = Math.ceil(list.length / squares.length);
      const sub = Math.ceil(Math.sqrt(per));
      const p = S.cell / sub;
      list.forEach((i, j) => {
        const n = squares[Math.min(squares.length - 1, Math.floor((j * squares.length) / list.length))];
        const q = j - Math.ceil((squares.indexOf(n) * list.length) / squares.length);
        const ox = S.x + (n % S.cols) * (S.cell + S.gap),
          oy = S.y + Math.floor(n / S.cols) * (S.cell + S.gap);
        const sx = ox + ((q % sub) + 0.5) * p,
          sy = oy + (Math.floor(q / sub) + 0.5) * p;
        x[i] = (sx - cam.sx) / cam.s + cam.px;
        y[i] = (sy - cam.sy) / cam.s + cam.py;
      });
    }
    layouts.squares = { x, y };
  }

  // a slow, smooth pattern over the field: how strongly each person answers in the scan sketch
  const glow = new Float32Array(N);
  {
    const ph = [random(), random(), random(), random()].map((v) => v * 6.283);
    for (let i = 0; i < N; i++) {
      const u = (layouts.field.x[i] - F.x) / fw,
        v = (layouts.field.y[i] - F.y) / fh;
      const n =
        0.5 +
        0.22 * Math.sin(u * 7.1 + ph[0]) * Math.cos(v * 5.3 + ph[1]) +
        0.18 * Math.sin((u + v) * 11.7 + ph[2]) +
        0.1 * Math.cos(u * 23.0 - v * 17.0 + ph[3]) +
        (rnd[i] - 0.5) * 0.35;
      glow[i] = clamp((n - 0.5) / 0.32) ** 1.6;
    }
  }

  // ---------- how each person looks ----------
  const CROWD = hex(plan.colour.crowd),
    AURORA = hex(plan.colour.aurora),
    LOOK = hex(plan.colour.look);
  const leftOut = (o: number) => plan.cats.online[o];
  /** [r, g, b, size, alpha] for person i in a mode at t. */
  const look = (mode: string, i: number, t: number, sxScreen: number): [number, number, number, number, number] => {
    if (mode === "leftout") {
      const o = leftOut(attr.online[i]);
      if (o === "none") return [AURORA[0], AURORA[1], AURORA[2], 1.45, 1];
      if (o === "other") return [LOOK[0], LOOK[1], LOOK[2], 1.45, 1];
    } else if (mode === "target") {
      if (i === target) return [AURORA[0], AURORA[1], AURORA[2], 1.5, 1];
    } else if (mode === "scan") {
      const sw = plan.sweep;
      const at = sw.x0 + (sw.x1 - sw.x0) * EASE.inout(clamp((t - sw.t0) / (sw.t1 - sw.t0)));
      const shown = clamp((at - sxScreen) / 40) * glow[i];
      return [
        CROWD[0] + (AURORA[0] - CROWD[0]) * shown,
        CROWD[1] + (AURORA[1] - CROWD[1]) * shown,
        CROWD[2] + (AURORA[2] - CROWD[2]) * shown,
        1 + 0.5 * shown,
        1,
      ];
    }
    return [CROWD[0], CROWD[1], CROWD[2], 1, 1];
  };
  /** The two modes in play at t and how far from the first to the second. */
  function modesAt(t: number): [string, string, number] {
    let from = plan.colours[0].mode,
      to = from,
      u = 1;
    for (const c of plan.colours) {
      if (c.t > t) break;
      from = to;
      to = c.mode;
      u = c.dur ? clamp((t - c.t) / c.dur) : 1;
    }
    return [from, to, EASE.inout(u)];
  }
  function alphaAt(t: number): number {
    let a = plan.alpha[0].a;
    for (const k of plan.alpha) {
      if (k.t > t) break;
      const u = k.dur ? EASE.inout(clamp((t - k.t) / k.dur)) : 1;
      a = a + (k.a - a) * u;
    }
    return a;
  }

  // ---------- the canvas ----------
  const canvas = document.getElementById("crowd") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  const img = ctx.createImageData(W, H);
  const A = new Float32Array(W * H),
    R = new Float32Array(W * H),
    G = new Float32Array(W * H),
    B = new Float32Array(W * H);
  const counter = document.getElementById("count");
  const big: number[] = [];

  function drawCrowd(t: number): void {
    ctx.clearRect(0, 0, W, H);
    const ga = alphaAt(t);
    // the counter counts the people who have arrived
    const ar = plan.arrive;
    let arrived = 0;
    if (ga <= 0.001) {
      if (counter) counter.textContent = t < ar.t ? "0" : (N * plan.per).toLocaleString("en-GB");
      return;
    }
    const cam = cameraAt(t);
    const [m1, m2, mu] = modesAt(t);
    // which move is under way, and from where
    let from = layouts.field,
      to = layouts.field,
      mv: CrowdPlan["moves"][number] | null = null;
    for (const m of plan.moves) {
      if (m.t > t) break;
      from = mv ? layouts[mv.to] : layouts.field;
      to = layouts[m.to];
      mv = m;
    }
    const arriving = t >= ar.t - 0.5 && t < ar.t + ar.spread + ar.dur + 0.05;
    const base = 0.64 * F.pitch * cam.s;
    A.fill(0);
    R.fill(0);
    G.fill(0);
    B.fill(0);
    big.length = 0;
    let bx0 = W,
      by0 = H,
      bx1 = 0,
      by1 = 0;
    for (let i = 0; i < N; i++) {
      // where they are
      let x = to.x[i],
        y = to.y[i];
      if (mv && mv.dur > 0) {
        const key = mv.by === "random" ? rnd[i] : mv.by === "y" ? (from.y[i] - F.y) / fh : (from.x[i] - F.x) / fw;
        const u = EASE.inout(clamp((t - mv.t - mv.stagger * clamp(key)) / mv.dur));
        if (u < 1) {
          x = from.x[i] + (x - from.x[i]) * u;
          y = from.y[i] + (y - from.y[i]) * u;
        }
      }
      let a = ga;
      if (arriving) {
        const local = clamp(
          (t - ar.t - ar.spread * (0.82 * ((layouts.field.x[i] - F.x) / fw) + 0.18 * rnd[i])) / ar.dur,
        );
        if (local >= 0.5) arrived++;
        if (local <= 0) continue;
        const e = EASE.out(local);
        a *= e;
        y -= (1 - e) * 22;
      }
      const sx = (x - cam.px) * cam.s + cam.sx,
        sy = (y - cam.py) * cam.s + cam.sy;
      // how they look
      const l1 = look(m1, i, t, sx);
      let r = l1[0],
        g = l1[1],
        b = l1[2],
        size = l1[3];
      if (mu < 1 && m1 !== m2) {
        const l2 = look(m2, i, t, sx);
        r += (l2[0] - r) * mu;
        g += (l2[1] - g) * mu;
        b += (l2[2] - b) * mu;
        size += (l2[3] - size) * mu;
      } else if (m1 !== m2) {
        const l2 = look(m2, i, t, sx);
        r = l2[0];
        g = l2[1];
        b = l2[2];
        size = l2[3];
      }
      if (mv && mv.to === "squares" && mv.dur > 0) size *= 1 + 0.4 * clamp((t - mv.t) / (mv.dur + mv.stagger));
      const s = base * size;
      if (sx < -s || sy < -s || sx > W + s || sy > H + s) continue;
      if (s > 3.2) {
        big.push(sx, sy, s, r, g, b, a);
        continue;
      }
      // splat: each pixel the dot covers gets its share of it
      const x0 = sx - s / 2,
        x1 = sx + s / 2,
        y0 = sy - s / 2,
        y1 = sy + s / 2;
      const ix0 = Math.max(0, Math.floor(x0)),
        ix1 = Math.min(W - 1, Math.floor(x1)),
        iy0 = Math.max(0, Math.floor(y0)),
        iy1 = Math.min(H - 1, Math.floor(y1));
      if (ix0 < bx0) bx0 = ix0;
      if (iy0 < by0) by0 = iy0;
      if (ix1 > bx1) bx1 = ix1;
      if (iy1 > by1) by1 = iy1;
      for (let py = iy0; py <= iy1; py++) {
        const cy = Math.min(y1, py + 1) - Math.max(y0, py);
        if (cy <= 0) continue;
        for (let px = ix0; px <= ix1; px++) {
          const cx = Math.min(x1, px + 1) - Math.max(x0, px);
          if (cx <= 0) continue;
          const w = cx * cy * a,
            p = py * W + px;
          A[p] += w;
          R[p] += w * r;
          G[p] += w * g;
          B[p] += w * b;
        }
      }
    }
    if (counter && t >= ar.t - 0.5) counter.textContent = ((arriving ? arrived : N) * plan.per).toLocaleString("en-GB");
    if (bx1 >= bx0) {
      const d = img.data;
      for (let py = by0; py <= by1; py++)
        for (let px = bx0; px <= bx1; px++) {
          const p = py * W + px,
            q = p * 4,
            a = A[p];
          if (a <= 0) {
            d[q + 3] = 0;
            continue;
          }
          d[q] = R[p] / a;
          d[q + 1] = G[p] / a;
          d[q + 2] = B[p] / a;
          d[q + 3] = Math.min(1, a) * 255;
        }
      ctx.putImageData(img, 0, 0, bx0, by0, bx1 - bx0 + 1, by1 - by0 + 1);
    }
    for (let k = 0; k < big.length; k += 7) {
      const [x, y, s, r, g, b, a] = big.slice(k, k + 7);
      ctx.globalAlpha = a;
      ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
      ctx.beginPath();
      ctx.roundRect(x - s / 2, y - s / 2, s, s, s * 0.22);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ---------- the words and shapes ----------
  type TweenSpec = [number, number, string, number | string, number | string, string?];
  interface Moving {
    el: HTMLElement;
    inn?: number[];
    out?: number[];
    tw: TweenSpec[];
    type?: { t: number; cps: number; hide: number; spans: HTMLElement[]; full: string[]; caret: HTMLElement | null };
  }
  const moving: Moving[] = [];
  for (const el of document.querySelectorAll<HTMLElement>("[data-in],[data-out],[data-tw],[data-type]")) {
    const m: Moving = { el, tw: el.dataset.tw ? JSON.parse(el.dataset.tw) : [] };
    if (el.dataset.in) m.inn = el.dataset.in.split(",").map(Number);
    if (el.dataset.out) m.out = el.dataset.out.split(",").map(Number);
    if (el.dataset.type) {
      const [t, cps, hide] = el.dataset.type.split(",").map(Number);
      const spans = [...el.querySelectorAll<HTMLElement>("[data-full]")];
      m.type = { t, cps, hide, spans, full: spans.map((s) => s.dataset.full ?? ""), caret: el.querySelector(".caret") };
    }
    moving.push(m);
  }
  // the band labels, beside the bands they name
  for (const el of document.querySelectorAll<HTMLElement>("[data-band]")) {
    const [key, i, t] = (el.dataset.band ?? "").split(",");
    const cam = cameraAt(Number(t));
    const y = project(cam, 0, bandTops[key][Number(i)])[1];
    el.style.top = `${(y - 21).toFixed(1)}px`;
  }

  const mix = (a: string, b: string, u: number) => {
    const x = hex(a),
      y = hex(b);
    return `rgb(${x.map((v, k) => Math.round(v + (y[k] - v) * u)).join(",")})`;
  };
  function place(m: Moving, t: number): void {
    let o = 1,
      y = 0,
      x = 0,
      s = 1;
    if (m.inn) {
      const [a, rise, dur] = m.inn;
      const u = EASE.out(clamp((t - a) / dur));
      o *= u;
      y += rise * (1 - u);
    }
    if (m.out) {
      const [b, dur] = m.out;
      const u = EASE.in(clamp((t - b) / dur));
      o *= 1 - u;
      y -= 10 * u;
    }
    const v: Record<string, number | string> = {};
    for (const [a, dur, prop, f, to, e] of m.tw) {
      if (t < a) {
        if (v[prop] === undefined) v[prop] = f;
        continue;
      }
      const u = (EASE[e ?? "out"] ?? EASE.out)(dur ? clamp((t - a) / dur) : 1);
      v[prop] = typeof f === "string" ? mix(f, to as string, u) : f + ((to as number) - f) * u;
    }
    if (typeof v.o === "number") o *= v.o;
    if (typeof v.x === "number") x += v.x;
    if (typeof v.y === "number") y += v.y;
    if (typeof v.s === "number") s = v.s;
    if (typeof v.w === "number") m.el.style.width = `${v.w}%`;
    if (typeof v.c === "string") m.el.style.color = v.c;
    m.el.style.opacity = String(o);
    m.el.style.visibility = o <= 0.001 ? "hidden" : "visible";
    m.el.style.transform =
      x || y || s !== 1 ? `translate(${x.toFixed(2)}px,${y.toFixed(2)}px) scale(${s.toFixed(4)})` : "";
    if (m.type) {
      const k = m.type;
      let left = Math.max(0, Math.floor((t - k.t) * k.cps));
      k.spans.forEach((span, j) => {
        const n = Math.min(left, k.full[j].length);
        span.textContent = k.full[j].slice(0, n);
        left -= n;
      });
      const total = k.full.reduce((sum, f) => sum + f.length, 0);
      const end = k.t + total / k.cps;
      const typing = t >= k.t - 0.4 && t < end + 0.05;
      const blink = Math.floor((t - end) / 0.53) % 2 === 0;
      const on = typing || (t >= end && (k.hide < 0 || t < k.hide) && blink);
      if (k.caret) k.caret.style.visibility = on && t >= k.t - 0.4 ? "visible" : "hidden";
    }
  }

  (window as Window & { seek?: (t: number) => void }).seek = (t: number) => {
    drawCrowd(t);
    for (const m of moving) place(m, t);
  };
}
