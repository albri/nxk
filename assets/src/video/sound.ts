// The launch video's sound, synthesised here from the cue sheet scenes.ts writes: no samples, no recordings and no
// one else's audio. Every effect is built from sines, noise, filters and a plucked string, and a seeded random number
// generator makes every build the same. Under the effects, a quiet held chord for each act of the story, in D major,
// moves with the cuts and comes home at the end. It is restrained on purpose: GitHub starts the video muted, the words
// carry every idea, and the sound only follows what is already on screen.
//
// soundtrack({ cues, sections, duration }) returns a 48 kHz stereo 16-bit WAV as a Buffer. video.ts evens out its
// loudness when it puts it with the frames.
import type { Cue } from "./scenes.ts";

const RATE = 48000;
const TAU = Math.PI * 2;

// notes as MIDI numbers, and their frequencies
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const N = {
  Fs2: 42,
  G2: 43,
  A2: 45,
  B2: 47,
  D2: 38,
  E2: 40,
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
  Cs5: 73,
  D5: 74,
  E5: 76,
  Fs5: 78,
  A5: 81,
  B5: 83,
  D6: 86,
  E6: 88,
  Fs6: 90,
  A6: 93,
  B6: 95,
  D7: 98,
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
// D major pentatonic, for anything with a pitch that climbs
const SCALE = [N.D4, N.E4, N.Fs4, N.A4, N.B4, N.D5, N.E5, N.Fs5, N.A5, N.B5, N.D6, N.E6, N.Fs6, N.A6];

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

  // ---------- voices: each returns mono samples ----------

  /** A bell: inharmonic partials that ring and fade, the upper ones first. */
  function bell(f: number, decay = 2.4): Float32Array {
    const parts = [
      [1, 1, 1],
      [2.0, 0.42, 0.62],
      [2.76, 0.3, 0.45],
      [4.07, 0.14, 0.3],
      [5.43, 0.08, 0.2],
    ];
    const out = samples(decay * 3);
    for (let i = 0; i < out.length; i++) {
      const t = i / RATE,
        a = Math.min(1, t / 0.004);
      let s = 0;
      for (const [k, amp, d] of parts) s += amp * Math.sin(TAU * f * k * t) * Math.exp(-t / (decay * d));
      out[i] = a * s * 0.45;
    }
    return out;
  }

  /** A mallet: a sine and a quieter partial near the fourth harmonic, as a marimba bar has, and a quick fall. */
  function mallet(f: number, decay = 0.5): Float32Array {
    const out = samples(decay * 4);
    for (let i = 0; i < out.length; i++) {
      const t = i / RATE,
        a = Math.min(1, t / 0.002);
      out[i] =
        a *
        (Math.sin(TAU * f * t) * Math.exp(-t / decay) +
          0.25 * Math.sin(TAU * f * 3.93 * t) * Math.exp(-t / (decay * 0.15)));
    }
    return out;
  }

  /** A short burst of filtered noise: a click, the attack of something struck. */
  function click(len: number, fc: number, q = 1.4): Float32Array {
    const out = samples(len),
      f = svf();
    for (let i = 0; i < out.length; i++) {
      const p = i / out.length;
      out[i] = f(noise(), fc, q).band * (1 - p) ** 3;
    }
    return out;
  }

  /** A sine that falls in pitch and fades: the body of a knock or a thud. */
  function body(f0: number, f1: number, decay: number, glide = 0.06): Float32Array {
    const out = samples(decay * 5);
    let ph = 0;
    for (let i = 0; i < out.length; i++) {
      const t = i / RATE,
        f = f1 + (f0 - f1) * Math.exp(-t / glide);
      ph += (TAU * f) / RATE;
      out[i] = Math.sin(ph) * Math.exp(-t / decay) * Math.min(1, t / 0.0015);
    }
    return out;
  }

  /** A plucked string (Karplus-Strong): a burst of noise in a delay line that loses its brightness as it rings. */
  function pluck(f: number, decay = 0.997, len = 1.4): Float32Array {
    const out = samples(len),
      n = Math.round(RATE / f),
      line = new Float32Array(n);
    const lp = svf();
    for (let i = 0; i < n; i++) line[i] = lp(noise(), f * 6, 0.7).low;
    let at = 0;
    for (let i = 0; i < out.length; i++) {
      const next = (at + 1) % n;
      const v = line[at];
      line[at] = decay * 0.5 * (line[at] + line[next]);
      out[i] = v * Math.min(1, (out.length - i) / (RATE * 0.05));
      at = next;
    }
    return out;
  }

  /** Noise through a band-pass whose centre moves from f0 to f1, shaped by an envelope of how far through it is. */
  function moving(len: number, f0: number, f1: number, q: number, env: (p: number) => number): Float32Array {
    const out = samples(len),
      f = svf();
    let pink = 0;
    for (let i = 0; i < out.length; i++) {
      const p = i / out.length;
      pink = 0.97 * pink + 0.03 * noise() * 6;
      const fc = f0 * (f1 / f0) ** p;
      out[i] = f(0.5 * noise() + 0.5 * pink, fc, q).band * env(p);
    }
    return out;
  }

  /** Many tiny high grains, as glints of light, at a density that follows `density` (0 to 1) through the length. */
  function grains(t: number, len: number, count: number, density: (p: number) => number, gain: number, low = 10): void {
    // place the grains by the density, so they gather where it is high
    const steps = 400,
      cdf: number[] = [0];
    for (let k = 1; k <= steps; k++) cdf.push(cdf[k - 1] + density(k / steps));
    for (let g = 0; g < count; g++) {
      const u = random() * cdf[steps];
      let k = 0;
      while (cdf[k + 1] < u) k++;
      const at = t + ((k + random()) / steps) * len;
      const f =
        hz(SCALE[low + Math.floor(random() * (SCALE.length - low))] + 12 * Math.floor(random() * 2)) *
        (1 + (random() - 0.5) * 0.006);
      const dur = 0.04 + random() * 0.06,
        s = samples(dur);
      for (let i = 0; i < s.length; i++) {
        const p = i / s.length;
        s[i] = Math.sin((TAU * f * i) / RATE) * Math.sin(Math.PI * p) ** 2 * Math.exp(-p * 2);
      }
      add(at, s, gain * (0.5 + random() * 0.5), (random() - 0.5) * 1.6, 0.55);
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
        s = samples(len);
      for (let i = 0; i < s.length; i++) {
        const p = i / s.length,
          tt = i / RATE;
        const env =
          p < 0.55 ? Math.sin((p / 0.55) * (Math.PI / 2)) ** 2 : Math.cos(((p - 0.55) / 0.45) * (Math.PI / 2)) ** 2;
        s[i] = env * (Math.sin(TAU * f * tt) + 0.5 * Math.sin(TAU * f * 1.0015 * tt + k));
      }
      add(t, s, gain / 5, (k / 4 - 0.5) * 0.8, 0.8);
    }
  }

  // ---------- the effects, one for each kind of cue ----------
  const EFFECTS: Record<string, (c: Cue) => void> = {
    // the title's soft low bell, and the end's three notes
    bell: (c) => {
      const g = c.gain ?? 1;
      if (c.i === 1)
        [N.D5, N.Fs5, N.A5].forEach((m, k) => add(c.t + k * 0.09, bell(hz(m), 2.6), 0.16 * g, (k - 1) * 0.35, 0.6));
      else {
        add(c.t, bell(hz(N.D4), 3.2), 0.2 * g, -0.1, 0.6);
        add(c.t + 0.02, bell(hz(N.A4), 2.6), 0.08 * g, 0.2, 0.6);
      }
    },
    air: (c) =>
      add(
        c.t,
        moving(c.dur ?? 0.8, 900, 3200, 0.6, (p) => Math.sin(Math.PI * p) ** 2),
        0.05,
        (p) => -0.3 + 0.6 * p,
        0.4,
      ),
    // a wooden tick, climbing a step with each question
    wood: (c) => {
      const f = hz([N.E5, N.Fs5, N.A5][c.i ?? 0]);
      add(c.t, body(f * 1.05, f, 0.05, 0.004), 0.22, -0.15 + 0.15 * (c.i ?? 0), 0.25);
      add(c.t, body(f * 2.71, f * 2.7, 0.012, 0.002), 0.06, 0, 0.2);
      add(c.t, click(0.006, 3800, 2), 0.08, 0, 0.1);
    },
    swell: (c) => pad(c.t, c.dur ?? 2, 0.09),
    whoosh: (c) => {
      const len = c.dur ?? 1,
        up = (c.to ?? 1) > 0;
      const env = up ? (p: number) => p ** 2.2 * (1 - p) ** 0.35 * 2.2 : (p: number) => (1 - p) ** 2 * p ** 0.3 * 2.4;
      add(
        c.t,
        moving(len, up ? 280 : 2600, up ? 3200 : 260, 1.1, env),
        0.12 * (c.gain ?? 1),
        (p) => (up ? -0.4 + 0.8 * p : 0.4 - 0.8 * p),
        0.35,
      );
    },
    // the crowd arriving: glints that gather as the dots do
    shimmer: (c) => {
      const len = c.dur ?? 2;
      grains(
        c.t,
        len,
        Math.round(150 * len),
        (p) => Math.sin(Math.PI * Math.min(1, p * 1.1)) ** 0.8,
        0.05 * (c.gain ?? 1),
      );
      add(
        c.t,
        moving(len, 2000, 5000, 0.5, (p) => Math.sin(Math.PI * p) ** 2),
        0.03 * (c.gain ?? 1),
        0,
        0.6,
      );
    },
    // the counter counting
    ticker: (c) => {
      const len = c.dur ?? 2,
        n = 44;
      for (let k = 0; k < n; k++) {
        const p = k / n,
          at = c.t + len * (p + ((random() - 0.5) * 0.4) / n);
        add(at, click(0.004, 5200, 3), 0.05 * (0.4 + 0.6 * Math.sin(Math.PI * p)), (random() - 0.5) * 0.3, 0.1);
      }
    },
    // a big number landing: a low thud, and with i=1 a high ping over it
    thud: (c) => {
      const g = c.gain ?? 1;
      add(c.t, body(95, 46, 0.3, 0.05), 0.16 * g, 0, 0.15);
      add(c.t, body(190, 92, 0.08, 0.03), 0.05 * g, 0, 0.15);
      add(c.t, click(0.012, 900, 1), 0.08 * g, 0, 0.15);
      if (c.i === 1) add(c.t + 0.01, bell(hz(N.A6), 0.9), 0.05 * g, 0.2, 0.6);
    },
    tick: (c) => {
      const f = hz(SCALE[9 + ((c.i ?? 0) % 5)]);
      add(c.t, mallet(f, 0.06), 0.07 * (c.gain ?? 1), 0.1, 0.3);
      add(c.t, click(0.003, 6000, 2), 0.03 * (c.gain ?? 1), 0.1, 0.1);
    },
    // the card landing
    snap: (c) => {
      add(c.t, click(0.03, 2200, 1.6), 0.2, 0, 0.25);
      add(c.t, body(170, 120, 0.05, 0.01), 0.22, 0, 0.2);
      add(c.t + 0.004, click(0.004, 7000, 3), 0.05, 0.1, 0.2);
    },
    pluck: (c) => add(c.t, pluck(hz(SCALE[c.i ?? 0]), 0.996, 1.2), 0.2, -0.2 + 0.06 * (c.i ?? 0), 0.35),
    wash: (c) => {
      const len = c.dur ?? 3;
      add(
        c.t,
        moving(len, 500, 1400, 0.5, (p) => Math.sin(Math.PI * p) ** 2),
        0.035,
        0,
        0.8,
      );
      grains(c.t, len, Math.round(20 * len), () => 1, 0.015, 8);
    },
    // the crowd sorting itself: sand pouring across, with fine grains in it
    flow: (c) => {
      const len = c.dur ?? 1.4,
        a = c.pan ?? -0.4,
        b = c.to ?? 0.4;
      const s = samples(len),
        f = svf(),
        lp = svf();
      let grain = 0;
      for (let i = 0; i < s.length; i++) {
        const p = i / s.length;
        if (random() < 0.012) grain = 1;
        grain *= 0.993;
        const env = p ** 0.6 * (1 - p) ** 1.6 * 3.2;
        const sand = f(noise(), 2400 + 1600 * Math.sin(Math.PI * p), 0.9).band * (0.35 + 0.65 * grain);
        const low = lp(noise(), 240, 0.7).low * 0.6;
        s[i] = (sand + low) * env;
      }
      add(c.t, s, 0.11, (p) => a + (b - a) * p, 0.3);
    },
    // two notes, a fifth apart, for a figure that lands; i=1 a softer single one for a reply
    chime: (c) => {
      const g = c.gain ?? 1;
      if (c.i === 1) {
        add(c.t, bell(hz(N.A5), 1.2), 0.07 * g, 0.25, 0.5);
        add(c.t + 0.06, bell(hz(N.D6), 1.0), 0.04 * g, 0.3, 0.5);
      } else {
        add(c.t, bell(hz(N.D5), 1.6), 0.1 * g, -0.15, 0.55);
        add(c.t + 0.11, bell(hz(N.A5), 1.8), 0.09 * g, 0.15, 0.55);
      }
    },
    swish: (c) =>
      add(
        c.t,
        moving(0.4, 600, 4200, 0.8, (p) => Math.sin(Math.PI * p ** 0.7) ** 2),
        0.07,
        (p) => -0.2 + 0.4 * p,
        0.3,
      ),
    // the groups lighting: green high, amber a little lower
    glint: (c) => {
      const f = hz(c.i === 1 ? N.Fs6 : N.A6);
      add(c.t, bell(f, 0.8), 0.07, c.i === 1 ? 0.3 : -0.3, 0.6);
      grains(c.t, 0.4, 14, (p) => 1 - p, 0.02, 11);
    },
    // squares forming: a quick run of tiny clicks, sweeping across; i=1 climbs in pitch
    ripple: (c) => {
      const n = c.n ?? 100,
        len = c.dur ?? 0.4,
        g = c.gain ?? 1;
      const every = Math.max(1, Math.round(n / 28));
      for (let k = 0; k < n; k += every) {
        const p = k / n;
        const f = c.i === 1 ? hz(N.D6) * 2 ** p : hz(SCALE[10 + (k % 3)]);
        add(c.t + p * len, mallet(f, 0.02), 0.035 * g, -0.6 + 1.2 * p, 0.3);
      }
    },
    rise: (c) => {
      const len = c.dur ?? 0.9,
        s = samples(len);
      let ph = 0;
      for (let i = 0; i < s.length; i++) {
        const p = i / s.length,
          f = hz(N.D5) * 2 ** p;
        ph += (TAU * f) / RATE;
        s[i] = Math.sin(ph) * Math.sin(Math.PI * p) ** 2;
      }
      add(c.t, s, 0.035, 0.1, 0.6);
      add(
        c.t,
        moving(len, 800, 4000, 0.7, (p) => Math.sin(Math.PI * p) ** 2),
        0.03,
        0,
        0.5,
      );
    },
    resolve: (c) => {
      pad(c.t, 2.4, 0.11, 0);
      add(c.t + 0.05, bell(hz(N.D5), 1.8), 0.06, 0, 0.6);
    },
    // a fact put to the decision model: a soft ping that echoes
    ping: (c) => {
      const f = hz(SCALE[7 + (c.i ?? 0)]);
      const s = mallet(f, 0.16);
      [0, 0.13, 0.26].forEach((d, k) => add(c.t + d, s, 0.09 * 0.45 ** k, k % 2 ? 0.4 : -0.2, 0.4));
    },
    // the scan's sweep across the crowd, left to right as on screen
    sweep: (c) => {
      const len = c.dur ?? 2;
      const e = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
      add(
        c.t,
        moving(len, 900, 2600, 2.2, (p) => Math.sin(Math.PI * p) ** 0.7),
        0.09,
        (p) => -0.8 + 1.6 * e(p),
        0.4,
      );
      const s = samples(len);
      for (let i = 0; i < s.length; i++) {
        const p = i / s.length,
          t = i / RATE;
        s[i] = Math.sin(TAU * hz(N.A4) * t) * (0.6 + 0.4 * Math.sin(TAU * 6 * t)) * Math.sin(Math.PI * p) ** 2;
      }
      add(c.t, s, 0.02, (p) => -0.8 + 1.6 * e(p), 0.6);
    },
    // a key pressed, and Enter
    key: (c) => {
      const v = 0.85 + random() * 0.3;
      add(c.t, click(0.005, 3800 + (c.i ?? 0) * 300, 1.8), 0.09 * v, 0.15, 0.08);
      add(c.t, body(260 + (c.i ?? 0) * 18, 200, 0.018, 0.004), 0.06 * v, 0.15, 0.08);
    },
    enter: (c) => {
      const g = c.gain ?? 1;
      add(c.t, click(0.012, 1800, 1.4), 0.16 * g, 0.15, 0.1);
      add(c.t, body(150, 105, 0.06, 0.01), 0.2 * g, 0.15, 0.1);
    },
    // a census point dropping onto the line
    drop: (c) => add(c.t, mallet(hz(SCALE[5 + ((c.i ?? 0) % 9)]), 0.08), 0.06, -0.4 + 0.04 * (c.i ?? 0), 0.4),
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
          lp(v, 900, 0.6).low *
          Math.sin((Math.PI / 2) * Math.max(0, Math.min(1, fadeIn))) *
          Math.sin((Math.PI / 2) * Math.max(0, fadeOut)) *
          breathe *
          end2;
      }
      add(from, s, 0.0038, 0, 0.7);
    }
  }

  // ---------- the room: a small Freeverb on everything sent to it ----------
  const scale = RATE / 44100;
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((d) => Math.round(d * scale));
  const allpasses = [556, 441, 341, 225].map((d) => Math.round(d * scale));
  const room = (input: Float32Array, spread: number) => {
    const out = new Float32Array(length);
    for (const d of combs) {
      const buf = new Float32Array(d + spread);
      let at = 0,
        store = 0;
      for (let i = 0; i < length; i++) {
        const y = buf[at];
        store = y * 0.75 + store * 0.25;
        buf[at] = input[i] * 0.015 + store * 0.86;
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

  // ---------- out: dry and wet together, as 16-bit PCM ----------
  for (let i = 0; i < length; i++) {
    L[i] += wetL[i] * 0.9;
    R[i] += wetR[i] * 0.9;
  }
  // A look-ahead limiter keeps the sharpest attacks within 14 dB of the louder passages (the 90th percentile of the
  // level over 0.4 s windows), so video.ts can bring the whole up to its loudness without a peak clipping. It only
  // touches the attacks of the knocks and thuds.
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
