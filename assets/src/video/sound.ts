// The launch video's sound, synthesised here from the cue sheet scenes.ts writes: no samples, no recordings and no
// one else's audio. A seeded random number generator makes every build the same.
//
// The palette is warm and low on purpose, the way a small studio chain would make it: a soft electric piano (two
// sines, one bending the other, as a Rhodes tine does), felt mallets, wooden knocks, a darkened plucked string and
// breathy noise, all in the middle of the range. Nothing is a bare high sine. Under the effects, a quiet held chord
// for each act of the story, in D major, moves with the cuts and comes home at the end. The whole mix then goes
// through a dark room, a gentle high shelf and a tape stage (soft saturation and a slow wobble of a few cents), so the
// top end sits well under the body, as in a calm mix, with nothing sharp in the 2 to 5 kHz band where harshness lives.
// It is restrained: GitHub starts the video muted, the words carry every idea, and the sound only follows the screen.
//
// soundtrack({ cues, sections, duration }) returns a 48 kHz stereo 16-bit WAV as a Buffer. video.ts evens out its
// loudness when it puts it with the frames.
import type { Cue } from "./scenes.ts";

const RATE = 48000;
const TAU = Math.PI * 2;

// notes as MIDI numbers, and their frequencies
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const N = {
  D2: 38,
  E2: 40,
  Fs2: 42,
  G2: 43,
  A2: 45,
  B2: 47,
  Cs3: 49,
  D3: 50,
  E3: 52,
  Fs3: 54,
  G3: 55,
  A3: 57,
  B3: 59,
  Cs4: 61,
  D4: 62,
  E4: 64,
  Fs4: 66,
  G4: 67,
  A4: 69,
  B4: 71,
  D5: 74,
  E5: 76,
  Fs5: 78,
  A5: 81,
};
// the chords, voiced low and open; scenes.ts says which plays from when
const CHORDS: Record<string, number[]> = {
  Dmaj9: [N.D2, N.A2, N.Fs3, N.Cs4, N.E4],
  Bm9: [N.B2, N.Fs3, N.D4, N.A3, N.Cs4],
  Gmaj9: [N.G2, N.D3, N.B3, N.Fs4, N.A3],
  Em9: [N.E2, N.B2, N.G3, N.D4, N.Fs4],
  A7sus: [N.A2, N.E3, N.G3, N.Cs4, N.D4],
  "D/Fs": [N.Fs2, N.D3, N.A3, N.E4, N.Fs4],
};
// D major pentatonic from D3, for anything with a pitch: index 5 is D4, index 10 is D5
const SCALE = [N.D3, N.E3, N.Fs3, N.A3, N.B3, N.D4, N.E4, N.Fs4, N.A4, N.B4, N.D5, N.E5, N.Fs5, N.A5];
const note = (i: number) => hz(SCALE[Math.max(0, Math.min(SCALE.length - 1, i))]);

/** mulberry32: fixed random numbers. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A two-pole state-variable filter (the topology-preserving form), its cutoff free to move every sample. */
function svf() {
  let ic1 = 0,
    ic2 = 0;
  return (x: number, fc: number, q: number) => {
    const g = Math.tan((Math.PI * Math.min(fc, RATE * 0.45)) / RATE),
      k = 1 / q;
    const a1 = 1 / (1 + g * (g + k)),
      a2 = g * a1,
      a3 = g * a2;
    const v3 = x - ic2,
      v1 = a1 * ic1 + a2 * v3,
      v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1;
    ic2 = 2 * v2 - ic2;
    return { low: v2, band: v1, high: x - k * v1 - v2 };
  };
}

const samples = (seconds: number) => new Float32Array(Math.max(1, Math.round(seconds * RATE)));
/** A raised-cosine rise over `a` seconds, so nothing starts with a click. */
const rise = (t: number, a: number) => (t >= a ? 1 : 0.5 - 0.5 * Math.cos((Math.PI * t) / a));

export function soundtrack({
  cues,
  sections,
  duration,
}: {
  cues: Cue[];
  sections: [string, number][];
  duration: number;
}): Buffer {
  const length = Math.ceil((duration + 0.05) * RATE);
  const L = new Float32Array(length),
    R = new Float32Array(length);
  const sendL = new Float32Array(length),
    sendR = new Float32Array(length);
  const random = rng(11);
  const noise = () => random() * 2 - 1;

  /** Adds a mono voice at t, panned (-1 left to 1 right, or a function of how far through it is), part of it to the room. */
  function add(t: number, s: Float32Array, gain: number, pan: number | ((p: number) => number) = 0, wet = 0.3): void {
    const start = Math.round(t * RATE);
    for (let i = 0; i < s.length; i++) {
      const j = start + i;
      if (j < 0 || j >= length) continue;
      const p = typeof pan === "number" ? pan : pan(i / s.length);
      const l = gain * Math.cos(((p + 1) * Math.PI) / 4),
        r = gain * Math.sin(((p + 1) * Math.PI) / 4);
      const v = s[i];
      L[j] += v * l;
      R[j] += v * r;
      sendL[j] += v * l * wet;
      sendR[j] += v * r * wet;
    }
  }
  /** A voice made twice, a hair apart in pitch and placed either side of `pan`: the width a chorus gives. */
  function wide(t: number, make: (detune: number) => Float32Array, gain: number, pan = 0, wet = 0.4): void {
    add(t, make(0.9985), gain * 0.62, Math.max(-1, pan - 0.35), wet);
    add(t + 0.004, make(1.0015), gain * 0.62, Math.min(1, pan + 0.35), wet);
  }

  // ---------- voices: each returns mono samples ----------

  /**
   * An electric piano: one sine bending another at the same pitch, the bend fading fast, so a note opens with a soft
   * bark and settles to a round tone, and a faint tine above it that dies in a few hundredths of a second. A low-pass
   * that closes as it rings keeps it warm.
   */
  function ep(f: number, vel = 0.7, decay = 1.3): Float32Array {
    const len = decay * 3.2,
      out = samples(len),
      lp = svf();
    let ph = 0;
    for (let i = 0; i < out.length; i++) {
      const t = i / RATE;
      ph += (TAU * f) / RATE;
      const index = 0.5 + 3.2 * vel * Math.exp(-t / 0.07) + 0.6 * vel * Math.exp(-t / 0.4);
      const v =
        Math.sin(ph + index * Math.sin(ph)) +
        0.18 * Math.sin(2 * ph) * Math.exp(-t / 0.5) +
        0.08 * vel * Math.sin(7.02 * ph) * Math.exp(-t / 0.035);
      const env = Math.exp(-t / decay) * rise(t, 0.003) * Math.min(1, (len - t) / 0.08);
      out[i] = lp(v * env, 2800 + 6000 * vel * Math.exp(-t / 0.25), 0.6).low;
    }
    return out;
  }

  /**
   * A felt mallet: a struck string's partials, each quieter and shorter-lived than the one below, so the attack has
   * some grain and the tail is round; a soft breath of felt on the string at the start.
   */
  function felt(f: number, decay = 0.4, bright = 0.4): Float32Array {
    const len = decay * 4,
      out = samples(len),
      bp = svf();
    const parts: [number, number, number][] = [];
    for (let k = 1; k <= 8; k++) {
      const ratio = k * (1 + 0.0004 * k * k); // a little stretched, as a real string is
      if (f * ratio > 6000) break;
      parts.push([ratio, k === 1 ? 1 : (bright * 1.6) / k ** 1.5, decay / k ** 0.9]);
    }
    for (let i = 0; i < out.length; i++) {
      const t = i / RATE;
      let v = 0;
      for (const [r, a, d] of parts) v += a * Math.sin(TAU * f * r * t) * Math.exp(-t / d);
      const contact = bp(noise(), 1800, 1.1).band * Math.exp(-t / 0.005) * 0.5 * bright;
      out[i] = (v + contact) * rise(t, 0.003);
    }
    return out;
  }

  /** A sine that falls in pitch and fades: the body of a knock or a thump. */
  function body(f0: number, f1: number, decay: number, glide = 0.06, attack = 0.002): Float32Array {
    const out = samples(decay * 5);
    let ph = 0;
    for (let i = 0; i < out.length; i++) {
      const t = i / RATE,
        f = f1 + (f0 - f1) * Math.exp(-t / glide);
      ph += (TAU * f) / RATE;
      out[i] = Math.sin(ph) * Math.exp(-t / decay) * rise(t, attack);
    }
    return out;
  }

  /** A short breath of band-passed noise: the scuff of a felt or a fingertip, never a sharp click. */
  function scuff(len: number, fc: number, q = 0.8): Float32Array {
    const out = samples(len),
      f = svf();
    for (let i = 0; i < out.length; i++) {
      const p = i / out.length;
      out[i] = f(noise(), fc, q).band * Math.sin(Math.PI * Math.min(1, p * 4)) * (1 - p) ** 2 * 1.6;
    }
    return out;
  }

  /** A knock on wood, as on a fence post: a low body, two upper modes and the tok of the knuckle, little above 3 kHz. */
  function knock(f: number, decay = 0.07): Float32Array {
    const a = body(f * 1.04, f, decay, 0.006, 0.001),
      b = body(f * 2.32, f * 2.3, decay * 0.45, 0.004, 0.001),
      c = body(f * 4.1, f * 4.05, decay * 0.22, 0.003, 0.001),
      d = scuff(0.014, 1700, 1.1);
    const out = samples(decay * 5);
    for (let i = 0; i < out.length; i++)
      out[i] = (a[i] ?? 0) + 0.4 * (b[i] ?? 0) + 0.18 * (c[i] ?? 0) + 0.45 * (d[i] ?? 0);
    return out;
  }

  /**
   * A plucked string (Karplus-Strong), as a nylon string: the burst of noise is softened, and a low-pass in the loop
   * takes the brightness away as it rings.
   */
  function pluck(f: number, len = 1.6, dark = 0.35): Float32Array {
    // the loop's own filter delays it by about dark / (1 - dark) samples, so the line is that much shorter
    const out = samples(len),
      n = Math.max(2, Math.round(RATE / f - dark / (1 - dark) - 0.5)),
      line = new Float32Array(n);
    const lp = svf();
    for (let i = 0; i < n; i++) line[i] = lp(noise(), f * 6, 0.6).low * 1.2;
    const tone = svf();
    let at = 0,
      z = 0;
    for (let i = 0; i < out.length; i++) {
      const next = (at + 1) % n;
      const v = line[at];
      // the two neighbours averaged, then a one-pole low-pass: the larger `dark`, the duller the string
      z += (1 - dark) * (0.5 * (line[at] + line[next]) - z);
      line[at] = 0.996 * z;
      out[i] = tone(v, 4200, 0.6).low * Math.min(1, (out.length - i) / (RATE * 0.06)) * rise(i / RATE, 0.002);
      at = next;
    }
    return out;
  }

  /** Noise through a band-pass whose centre moves from f0 to f1, shaped by an envelope of how far through it is. */
  function moving(len: number, f0: number, f1: number, q: number, env: (p: number) => number): Float32Array {
    const out = samples(len),
      f = svf(),
      lp = svf();
    let pink = 0;
    for (let i = 0; i < out.length; i++) {
      const p = i / out.length;
      pink = 0.97 * pink + 0.03 * noise() * 6;
      const fc = f0 * (f1 / f0) ** p;
      const v = f(0.4 * noise() + 0.6 * pink, fc, q).band;
      out[i] = lp(v, Math.max(fc * 2.2, 900), 0.6).low * env(p);
    }
    return out;
  }

  /** Soft felt notes scattered through `len`, at a density that follows `density` (0 to 1): rain on a felt roof. */
  function drops(
    t: number,
    len: number,
    count: number,
    density: (p: number) => number,
    gain: number,
    low = 5,
    high = 12,
  ): void {
    const steps = 400,
      cdf: number[] = [0];
    for (let k = 1; k <= steps; k++) cdf.push(cdf[k - 1] + density(k / steps));
    for (let g = 0; g < count; g++) {
      const u = random() * cdf[steps];
      let k = 0;
      while (cdf[k + 1] < u) k++;
      const at = t + ((k + random()) / steps) * len;
      const f = note(low + Math.floor(random() * (high - low + 1))) * (1 + (random() - 0.5) * 0.004);
      add(at, felt(f, 0.12 + random() * 0.1, 0.15), gain * (0.45 + random() * 0.55), (random() - 0.5) * 1.4, 0.5);
    }
  }

  /** The chord playing at t. */
  const chordAt = (t: number) => {
    let name = sections[0][0];
    for (const [c, start] of sections) if (start <= t) name = c;
    return CHORDS[name];
  };

  /** A soft pad: the chord at t, swelling in and out over `len`. */
  function pad(t: number, len: number, gain: number, octave = 12): void {
    for (const [k, m] of chordAt(t).entries()) {
      const f = hz(m + octave),
        s = samples(len),
        lp = svf();
      for (let i = 0; i < s.length; i++) {
        const p = i / s.length,
          tt = i / RATE;
        const env =
          p < 0.55 ? Math.sin((p / 0.55) * (Math.PI / 2)) ** 2 : Math.cos(((p - 0.55) / 0.45) * (Math.PI / 2)) ** 2;
        const v = Math.sin(TAU * f * tt) + 0.5 * Math.sin(TAU * f * 1.0015 * tt + k) + 0.2 * Math.sin(TAU * f * 2 * tt);
        s[i] = lp(v * env, 1400, 0.6).low;
      }
      add(t, s, gain / 5, (k / 4 - 0.5) * 0.8, 0.8);
    }
  }

  // ---------- the effects, one for each kind of cue ----------
  const EFFECTS: Record<string, (c: Cue) => void> = {
    // the title's chord, rolled on the piano over a low note; i=1 the end's three notes rising
    bell: (c) => {
      const g = c.gain ?? 1;
      if (c.i === 1) {
        [N.D4, N.Fs4, N.A4, N.D5].forEach((m, k) =>
          wide(c.t + k * 0.11, (d) => ep(hz(m) * d, 0.6 - k * 0.06, 2.4), 0.12 * g, (k - 1.5) * 0.25, 0.6),
        );
        add(c.t, felt(hz(N.D2), 1.6, 0.2), 0.18 * g, 0, 0.4);
      } else {
        [N.D3, N.A3, N.E4, N.Fs4].forEach((m, k) =>
          wide(c.t + k * 0.05, (d) => ep(hz(m) * d, 0.55, 2.6), 0.11 * g, (k - 1.5) * 0.2, 0.6),
        );
        add(c.t, felt(hz(N.D2), 1.8, 0.2), 0.16 * g, 0, 0.4);
      }
    },
    air: (c) =>
      add(
        c.t,
        moving(c.dur ?? 0.8, 400, 1800, 0.6, (p) => Math.sin(Math.PI * p) ** 2),
        0.07,
        (p) => -0.3 + 0.6 * p,
        0.5,
      ),
    // a knock on wood, a step higher with each question
    wood: (c) => {
      const f = note(5 + [0, 1, 3][c.i ?? 0]) / 2;
      add(c.t, knock(f, 0.09), 0.3, -0.15 + 0.15 * (c.i ?? 0), 0.3);
      add(c.t + 0.002, felt(f * 2, 0.25, 0.1), 0.08, -0.15 + 0.15 * (c.i ?? 0), 0.4);
    },
    swell: (c) => pad(c.t, c.dur ?? 2, 0.1),
    whoosh: (c) => {
      const len = c.dur ?? 1,
        up = (c.to ?? 1) > 0;
      const env = up ? (p: number) => p ** 2 * (1 - p) ** 0.4 * 2.2 : (p: number) => (1 - p) ** 2 * p ** 0.3 * 2.4;
      add(
        c.t,
        moving(len, up ? 200 : 2000, up ? 2000 : 200, 0.9, env),
        0.16 * (c.gain ?? 1),
        (p) => (up ? -0.4 + 0.8 * p : 0.4 - 0.8 * p),
        0.4,
      );
    },
    // the crowd arriving: a murmur that grows, and soft notes falling like rain as the dots land
    shimmer: (c) => {
      const len = c.dur ?? 2,
        g = c.gain ?? 1;
      drops(c.t, len, Math.round(26 * len), (p) => Math.sin(Math.PI * Math.min(1, p * 1.1)) ** 0.8, 0.07 * g);
      add(
        c.t,
        moving(len, 300, 1500, 0.5, (p) => Math.sin(Math.PI * p) ** 2),
        0.08 * g,
        0,
        0.6,
      );
    },
    // the counter counting: soft wooden ticks under the murmur
    ticker: (c) => {
      const len = c.dur ?? 2,
        n = 22;
      for (let k = 0; k < n; k++) {
        const p = k / n,
          at = c.t + len * (p + ((random() - 0.5) * 0.4) / n);
        add(at, knock(note(5 + (k % 2)) * 1.5, 0.025), 0.05 * (0.4 + 0.6 * Math.sin(Math.PI * p)), 0.15, 0.15);
      }
    },
    // a big number landing: a low, soft thump; with i=1 a piano note over it
    thud: (c) => {
      const g = c.gain ?? 1;
      add(c.t, body(78, 44, 0.26, 0.05, 0.004), 0.24 * g, 0, 0.2);
      add(c.t, body(150, 96, 0.06, 0.03, 0.003), 0.06 * g, 0, 0.2);
      add(c.t, scuff(0.02, 700), 0.1 * g, 0, 0.2);
      if (c.i === 1) wide(c.t + 0.01, (d) => ep(hz(N.A4) * d, 0.5, 1.4), 0.1 * g, 0.1, 0.6);
    },
    tick: (c) => add(c.t, felt(note(5 + ((c.i ?? 0) % 5)), 0.22, 0.25), 0.11 * (c.gain ?? 1), 0.1, 0.35),
    // a card landing: a knock and a low thump, like a book set down
    snap: (c) => {
      add(c.t, knock(hz(N.D3) * 1.3, 0.06), 0.24 * (c.gain ?? 1), 0, 0.25);
      add(c.t, body(110, 70, 0.08, 0.02, 0.003), 0.18 * (c.gain ?? 1), 0, 0.2);
      add(c.t, scuff(0.05, 1200), 0.08 * (c.gain ?? 1), 0, 0.25);
    },
    // a string plucked, low in the range
    pluck: (c) => add(c.t, pluck(note(c.i ?? 0)), 0.3 * (c.gain ?? 1), -0.2 + 0.06 * (c.i ?? 0), 0.35),
    wash: (c) => {
      const len = c.dur ?? 3;
      add(
        c.t,
        moving(len, 300, 700, 0.5, (p) => Math.sin(Math.PI * p) ** 2),
        0.05,
        0,
        0.8,
      );
      drops(c.t, len, Math.round(5 * len), () => 1, 0.03, 7, 12);
    },
    // the crowd sorting itself: sand pouring across, low and soft
    flow: (c) => {
      const len = c.dur ?? 1.4,
        a = c.pan ?? -0.4,
        b = c.to ?? 0.4;
      const s = samples(len),
        f = svf(),
        lp = svf(),
        dark = svf();
      let grain = 0;
      for (let i = 0; i < s.length; i++) {
        const p = i / s.length;
        if (random() < 0.01) grain = 1;
        grain *= 0.994;
        const env = p ** 0.6 * (1 - p) ** 1.6 * 3.2;
        const sand = f(noise(), 900 + 600 * Math.sin(Math.PI * p), 0.8).band * (0.4 + 0.6 * grain);
        const low = lp(noise(), 180, 0.7).low * 0.8;
        s[i] = dark(sand + low, 1800, 0.6).low * env;
      }
      add(c.t, s, 0.16 * (c.gain ?? 1), (p) => a + (b - a) * p, 0.3);
    },
    // two piano notes, a fifth apart, for a figure that lands; i=1 a softer pair for a reply
    chime: (c) => {
      const g = c.gain ?? 1;
      if (c.i === 1) {
        wide(c.t, (d) => ep(hz(N.A4) * d, 0.45, 1.2), 0.11 * g, 0.2, 0.5);
        wide(c.t + 0.07, (d) => ep(hz(N.D5) * d, 0.4, 1.0), 0.07 * g, 0.25, 0.5);
      } else {
        wide(c.t, (d) => ep(hz(N.D4) * d, 0.55, 1.6), 0.12 * g, -0.1, 0.55);
        wide(c.t + 0.11, (d) => ep(hz(N.A4) * d, 0.5, 1.8), 0.1 * g, 0.1, 0.55);
      }
    },
    swish: (c) =>
      add(
        c.t,
        moving(0.45, 250, 1200, 0.8, (p) => Math.sin(Math.PI * p ** 0.7) ** 2),
        0.1 * (c.gain ?? 1),
        (p) => -0.2 + 0.4 * p,
        0.35,
      ),
    // the groups lighting: a piano note each, the second a little lower
    glint: (c) => {
      const f = hz(c.i === 1 ? N.Fs4 : N.A4);
      wide(c.t, (d) => ep(f * d, 0.45, 1.1), 0.1, c.i === 1 ? 0.3 : -0.3, 0.6);
    },
    // squares forming: a quick run of soft felt notes, sweeping across; i=1 climbs
    ripple: (c) => {
      const n = c.n ?? 100,
        len = c.dur ?? 0.4,
        g = c.gain ?? 1;
      const every = Math.max(1, Math.round(n / 20));
      for (let k = 0; k < n; k += every) {
        const p = k / n;
        const f = c.i === 1 ? hz(N.D4) * 2 ** p : note(5 + (k % 3));
        add(c.t + p * len, felt(f, 0.08, 0.1), 0.05 * g, -0.6 + 1.2 * p, 0.35);
      }
    },
    rise: (c) => {
      const len = c.dur ?? 0.9,
        s = samples(len),
        lp = svf();
      let ph = 0;
      for (let i = 0; i < s.length; i++) {
        const p = i / s.length,
          f = hz(N.D4) * 2 ** p;
        ph += (TAU * f) / RATE;
        s[i] = lp(Math.sin(ph + 0.6 * Math.sin(ph)), 1500, 0.6).low * Math.sin(Math.PI * p) ** 2;
      }
      add(c.t, s, 0.05, 0.1, 0.6);
      add(
        c.t,
        moving(len, 300, 1200, 0.7, (p) => Math.sin(Math.PI * p) ** 2),
        0.05,
        0,
        0.5,
      );
    },
    resolve: (c) => {
      pad(c.t, 2.4, 0.12, 0);
      wide(c.t + 0.05, (d) => ep(hz(N.D4) * d, 0.5, 1.8), 0.1, 0, 0.6);
    },
    // a fact put to the decision model: a piano note that echoes softly
    ping: (c) => {
      const f = note(7 + (c.i ?? 0));
      const s = ep(f, 0.5, 0.7);
      [0, 0.19, 0.38].forEach((d, k) => add(c.t + d, s, 0.11 * 0.4 ** k, k % 2 ? 0.4 : -0.2, 0.45));
    },
    // the scan's sweep across the crowd, left to right as on screen
    sweep: (c) => {
      const len = c.dur ?? 2;
      const e = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
      add(
        c.t,
        moving(len, 260, 1000, 1.4, (p) => Math.sin(Math.PI * p) ** 0.7),
        0.12,
        (p) => -0.8 + 1.6 * e(p),
        0.45,
      );
      const s = samples(len),
        lp = svf();
      for (let i = 0; i < s.length; i++) {
        const p = i / s.length,
          t = i / RATE;
        const v = Math.sin(TAU * hz(N.A3) * t) + 0.3 * Math.sin(TAU * hz(N.E4) * t);
        s[i] = lp(v, 900, 0.6).low * (0.7 + 0.3 * Math.sin(TAU * 4 * t)) * Math.sin(Math.PI * p) ** 2;
      }
      add(c.t, s, 0.035, (p) => -0.8 + 1.6 * e(p), 0.6);
    },
    // a key pressed, as on a quiet keyboard, and Enter
    key: (c) => {
      const v = 0.8 + random() * 0.4;
      add(c.t, scuff(0.012, 2200 + (c.i ?? 0) * 120), 0.07 * v, 0.15, 0.1);
      add(c.t, body(230 + (c.i ?? 0) * 14, 170, 0.014, 0.004, 0.001), 0.06 * v, 0.15, 0.1);
    },
    enter: (c) => {
      const g = c.gain ?? 1;
      add(c.t, knock(150, 0.05), 0.2 * g, 0.15, 0.15);
      add(c.t, scuff(0.025, 1100), 0.09 * g, 0.15, 0.15);
    },
    // a census point dropping onto the line
    drop: (c) => add(c.t, felt(note(5 + ((c.i ?? 0) % 8)), 0.14, 0.15), 0.07, -0.4 + 0.04 * (c.i ?? 0), 0.4),
    // a card sliding into place: a short breath of air that ends in a soft knock
    slide: (c) => {
      const g = c.gain ?? 1;
      add(
        c.t,
        moving(0.32, 400, 900, 0.7, (p) => Math.sin(Math.PI * p) ** 2),
        0.08 * g,
        (c.pan ?? 0) - 0.15,
        0.3,
      );
      add(c.t + 0.26, knock(hz(N.D3) * 1.5, 0.04), 0.1 * g, c.pan ?? 0, 0.3);
    },
  };

  for (const c of cues) {
    const effect = EFFECTS[c.kind];
    if (!effect) throw new Error(`sound: no effect for a "${c.kind}" cue`);
    effect(c);
  }

  // ---------- the bed: each act's chord, held quietly, crossfading at the cuts ----------
  {
    const fade = 2.2;
    for (const [n, [name, start]] of sections.entries()) {
      const end = n + 1 < sections.length ? sections[n + 1][1] : duration;
      const from = Math.max(0, start - fade / 2),
        to = Math.min(duration, end + fade / 2);
      const s = samples(to - from);
      const chord = CHORDS[name];
      const lp = svf();
      for (let i = 0; i < s.length; i++) {
        const t = from + i / RATE;
        let v = 0;
        for (const [k, m] of chord.entries()) {
          const f = hz(m);
          v +=
            Math.sin(TAU * f * t + k) + 0.6 * Math.sin(TAU * f * 1.0012 * t + 2 * k) + 0.25 * Math.sin(TAU * f * 2 * t);
        }
        const fadeIn = start === 0 ? Math.min(1, t / 2.0) : Math.min(1, (t - from) / fade),
          fadeOut = Math.min(1, (to - t) / fade);
        const breathe = 0.8 + 0.2 * Math.sin(TAU * 0.07 * t + n);
        const end2 = Math.min(1, Math.max(0, (duration - 0.2 - t) / 2.2));
        s[i] =
          lp(v, 700, 0.6).low *
          Math.sin((Math.PI / 2) * Math.max(0, Math.min(1, fadeIn))) *
          Math.sin((Math.PI / 2) * Math.max(0, fadeOut)) *
          breathe *
          end2;
      }
      add(from, s, 0.006, 0, 0.7);
    }
  }

  // ---------- the room: a dark Freeverb on everything sent to it ----------
  const scale = RATE / 44100;
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((d) => Math.round(d * scale));
  const allpasses = [556, 441, 341, 225].map((d) => Math.round(d * scale));
  const room = (input: Float32Array, spread: number) => {
    // darken what goes in first, so the tail is warm
    const pre = svf(),
      dry = new Float32Array(length);
    for (let i = 0; i < length; i++) dry[i] = pre(input[i], 5000, 0.6).low;
    const out = new Float32Array(length);
    for (const d of combs) {
      const buf = new Float32Array(d + spread);
      let at = 0,
        store = 0;
      for (let i = 0; i < length; i++) {
        const y = buf[at];
        store = y * 0.65 + store * 0.35;
        buf[at] = dry[i] * 0.015 + store * 0.88;
        out[i] += y;
        at = (at + 1) % buf.length;
      }
    }
    for (const d of allpasses) {
      const buf = new Float32Array(d + spread);
      let at = 0;
      for (let i = 0; i < length; i++) {
        const b = buf[at];
        buf[at] = out[i] + b * 0.5;
        out[i] = b - out[i];
        at = (at + 1) % buf.length;
      }
    }
    return out;
  };
  const wetL = room(sendL, 0),
    wetR = room(sendR, 23);
  for (let i = 0; i < length; i++) {
    L[i] += wetL[i] * 0.9;
    R[i] += wetR[i] * 0.9;
  }

  // ---------- the tone: a little air, a high shelf up about 5 dB from 2 kHz, and a roll-off above 16 kHz ----------
  for (const ch of [L, R]) {
    const shelf = svf(),
      top = svf();
    for (let i = 0; i < length; i++) {
      const s = shelf(ch[i], 2000, 0.7);
      ch[i] = top(ch[i] + 1.1 * s.high, 16000, 0.7).low;
    }
  }

  // A look-ahead limiter keeps the sharpest attacks within 14 dB of the louder passages (the 90th percentile of the
  // level over 0.4 s windows), so video.ts can bring the whole up to its loudness without a peak clipping. It only
  // touches the attacks of the knocks and thumps.
  {
    const win = Math.round(0.4 * RATE),
      levels: number[] = [];
    for (let at = 0; at + win <= length; at += win) {
      let e = 0;
      for (let i = at; i < at + win; i++) e += (L[i] * L[i] + R[i] * R[i]) / 2;
      levels.push(Math.sqrt(e / win));
    }
    levels.sort((x, y) => x - y);
    const ceiling = levels[Math.floor(levels.length * 0.9)] * 10 ** (14 / 20);
    const ahead = Math.round(0.003 * RATE),
      release = Math.exp(-1 / (0.08 * RATE));
    const want = new Float32Array(length);
    for (let i = 0; i < length; i++) want[i] = Math.min(1, ceiling / Math.max(1e-9, Math.abs(L[i]), Math.abs(R[i])));
    // the smallest gain wanted in the next few milliseconds (a sliding minimum), so the gain is already down when a
    // peak arrives; then it recovers over about 80 ms
    const soon = new Float32Array(length),
      queue = new Int32Array(length);
    let head = 0,
      tail = 0;
    for (let i = 0; i < length + ahead; i++) {
      if (i < length) {
        while (tail > head && want[queue[tail - 1]] >= want[i]) tail--;
        queue[tail++] = i;
      }
      const j = i - ahead;
      if (j < 0) continue;
      while (queue[head] < j) head++;
      soon[j] = want[queue[head]];
    }
    let g = 1;
    for (let i = 0; i < length; i++) {
      g = Math.min(soon[i], 1 - (1 - g) * release);
      L[i] *= g;
      R[i] *= g;
    }
  }

  // ---------- the tape: soft saturation on the loudest moments, and a slow wobble of a few cents ----------
  {
    let peak = 0;
    for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
    const drive = 1.4,
      norm = Math.tanh(drive);
    const delay = Math.round(0.004 * RATE),
      depth = 0.0005 * RATE;
    for (const ch of [L, R]) {
      const src = Float32Array.from(ch, (v) => Math.tanh((drive * v) / (peak || 1)) / norm);
      for (let i = 0; i < length; i++) {
        const t = i / RATE;
        const d = delay + depth * Math.sin(TAU * 0.35 * t) + depth * 0.12 * Math.sin(TAU * 5.2 * t + 1);
        const x = i - d,
          k = Math.floor(x),
          u = x - k;
        const a = k >= 0 && k < length ? src[k] : 0,
          b = k + 1 >= 0 && k + 1 < length ? src[k + 1] : 0;
        ch[i] = a + (b - a) * u;
      }
    }
  }

  // ---------- out: as 16-bit PCM ----------
  let peak = 0;
  for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const gain = peak > 0 ? 0.89 / peak : 1; // to just under full scale; video.ts sets the loudness
  const data = Buffer.alloc(length * 4);
  for (let i = 0; i < length; i++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * gain)) * 32767), i * 4);
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * gain)) * 32767), i * 4 + 2);
  }
  const head = Buffer.alloc(44);
  head.write("RIFF", 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write("WAVE", 8);
  head.write("fmt ", 12);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(2, 22);
  head.writeUInt32LE(RATE, 24);
  head.writeUInt32LE(RATE * 4, 28);
  head.writeUInt16LE(4, 32);
  head.writeUInt16LE(16, 34);
  head.write("data", 36);
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}
