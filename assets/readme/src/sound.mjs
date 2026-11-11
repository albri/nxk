// The launch video's soundtrack, synthesised here from video.mjs's cue sheet: no samples and no recordings, so it is as
// open as the rest of the repository. A quiet pad holds one chord per section of the story, in D major, and changes
// with the cuts; soft mallet notes mark the steps and stops; the data gets light touches (a shimmer for a crowd
// arriving, a breath of air for a dot moving). It is restrained on purpose: the video has to work muted, and the sound
// only follows what is already on screen.
//
// soundtrack({ cues, sections, duration }) takes the cues and the chords ([name, start] in seconds) and returns a
// 48 kHz stereo 16-bit WAV as a Buffer. video.mjs mixes it in and ffmpeg evens out the loudness.
import { rng } from './route.mjs';

const RATE = 48000;

// Notes as MIDI numbers, and their frequencies.
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const N = { D2: 38, E2: 40, Fs2: 42, G2: 43, A2: 45, B2: 47, Cs3: 49, D3: 50, E3: 52, Fs3: 54, G3: 55, A3: 57, B3: 59, Cs4: 61, D4: 62, E4: 64, Fs4: 66, G4: 67, A4: 69, B4: 71, Cs5: 73, D5: 74, E5: 76, Fs5: 78, A5: 81, B5: 83, D6: 86 };

// The chords, voiced low and open. video.mjs says which one plays from when: home for the opening and the end, and a
// walk away and back between, one chord a step or stop.
const CHORDS = {
  Dmaj9: [N.D2, N.A2, N.Fs3, N.Cs4, N.E4],
  Bm9: [N.B2, N.Fs3, N.D4, N.A3, N.Cs4],
  Gmaj9: [N.G2, N.D3, N.B3, N.Fs4, N.A3],
  Em9: [N.E2, N.B2, N.G3, N.D4, N.Fs4],
  A7sus: [N.A2, N.E3, N.G3, N.Cs4, N.D4],
  'D/Fs': [N.Fs2, N.D3, N.A3, N.E4, N.Fs4],
};
// The mallet's scale, D major pentatonic, climbing with each step or stop.
const SCALE = [N.D4, N.E4, N.Fs4, N.A4, N.B4, N.D5, N.E5, N.Fs5, N.A5, N.B5, N.D6];

export function soundtrack({ cues, sections, duration }) {
  const length = Math.ceil((duration + 0.05) * RATE);
  const L = new Float32Array(length), R = new Float32Array(length);
  const send = { L: new Float32Array(length), R: new Float32Array(length) }; // what goes to the reverb
  const random = rng(7);

  // Add a mono voice at t with a pan (-1 to 1) and how much of it reaches the reverb.
  function add(t, samples, gain, pan = 0, wet = 0.35) {
    const start = Math.round(t * RATE), l = gain * Math.cos(((pan + 1) * Math.PI) / 4), r = gain * Math.sin(((pan + 1) * Math.PI) / 4);
    for (let i = 0; i < samples.length; i++) {
      const j = start + i;
      if (j < 0 || j >= length) continue;
      const s = samples[i];
      L[j] += s * l; R[j] += s * r;
      send.L[j] += s * l * wet; send.R[j] += s * r * wet;
    }
  }

  // ---------- voices ----------

  // A mallet: a sine with a quieter partial near the fourth harmonic, as a marimba bar has, and a quick fall.
  function mallet(freq, decay = 0.9) {
    const n = Math.round(decay * 3 * RATE), out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / RATE, attack = Math.min(1, t / 0.004);
      out[i] = attack * (Math.sin(2 * Math.PI * freq * t) * Math.exp(-t / decay) + 0.22 * Math.sin(2 * Math.PI * freq * 3.93 * t) * Math.exp(-t / (decay * 0.18)));
    }
    return out;
  }

  // A bell for the end: inharmonic partials that ring for a while.
  function bell(freq, decay = 3.2) {
    const parts = [[1, 1, 1], [2, 0.5, 0.7], [2.76, 0.32, 0.5], [5.4, 0.12, 0.25]];
    const n = Math.round(decay * 3 * RATE), out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / RATE, attack = Math.min(1, t / 0.006);
      let s = 0;
      for (const [k, a, d] of parts) s += a * Math.sin(2 * Math.PI * freq * k * t) * Math.exp(-t / (decay * d));
      out[i] = attack * s * 0.5;
    }
    return out;
  }

  // Air: filtered noise that swells and fades, for something moving.
  function air(length_s = 1.0, bright = 0.25) {
    const n = Math.round(length_s * RATE), out = new Float32Array(n);
    let lp = 0, hp = 0, prev = 0;
    for (let i = 0; i < n; i++) {
      const p = i / n, env = Math.sin(Math.PI * p) ** 2;
      const white = random() * 2 - 1;
      lp += (white - lp) * bright; // a soft low-pass
      hp = 0.97 * (hp + lp - prev); prev = lp; // and a gentle high-pass
      out[i] = hp * env;
    }
    return out;
  }

  // The pad: each note of a chord as a few detuned soft waves, fading in and out over its span.
  function pad(t0, t1, notes, gain) {
    const fadeIn = 1.4, fadeOut = 1.6, start = Math.max(0, t0 - 0.2), end = Math.min(duration, t1 + fadeOut * 0.6);
    const n = Math.round((end - start) * RATE);
    notes.forEach((midi, v) => {
      const out = new Float32Array(n), f = hz(midi), detune = [0.9985, 1, 1.0016], phase = detune.map(() => random() * 2 * Math.PI);
      for (let i = 0; i < n; i++) {
        const t = i / RATE, abs = start + t;
        const env = Math.min(1, (abs - start) / fadeIn) * Math.min(1, Math.max(0, (end - abs) / fadeOut));
        const swell = 0.85 + 0.15 * Math.sin(2 * Math.PI * (0.07 + v * 0.013) * abs + v);
        let s = 0;
        for (let k = 0; k < detune.length; k++) {
          const w = 2 * Math.PI * f * detune[k] * t + phase[k];
          s += Math.sin(w) + 0.12 * Math.sin(3 * w) + 0.04 * Math.sin(5 * w); // a rounded triangle
        }
        out[i] = (s / detune.length) * env * swell;
      }
      // spread the voices across the field, lower notes nearer the middle
      const pan = ((v % 2 ? 1 : -1) * Math.min(0.6, 0.15 + v * 0.12));
      add(start, out, gain / Math.sqrt(notes.length) * (midi < 48 ? 1.1 : 0.8), pan, 0.5);
    });
  }

  // ---------- the score ----------

  sections.forEach(([chord, t0], i) => {
    const last = i === sections.length - 1, t1 = last ? duration : sections[i + 1][1];
    pad(t0, t1, CHORDS[chord], last ? 0.16 : 0.13);
  });

  for (const { t, kind, i } of cues) {
    switch (kind) {
      case 'open': // the crowd's first breath, under the opening
        add(t + 0.1, air(2.4, 0.08), 0.08, 0, 0.6);
        add(t + 0.3, mallet(hz(N.D3), 1.6), 0.18, 0, 0.6);
        break;
      case 'sweep': // the two groups drawn in
        add(t, air(1.6, 0.18), 0.06, 0.2, 0.6);
        add(t + 0.2, mallet(hz(N.A4), 1.2), 0.12, 0.3);
        add(t + 0.55, mallet(hz(N.Fs4), 1.2), 0.1, -0.3);
        break;
      case 'cut': // a new section: one soft note
        add(t, mallet(hz(N.D4), 1.1), 0.16, 0, 0.45);
        break;
      case 'ring': // the library's stops, one step up each
        add(t, mallet(hz(SCALE[i + 1]), 1.0), 0.2, -0.15 + i * 0.1);
        break;
      case 'pluck':
        add(t, mallet(hz(i ? N.A4 : N.Fs4), 1.0), 0.14, 0.1);
        break;
      case 'type': // lines arriving in a file: tiny high taps
        for (let k = 0; k < 3; k++) add(t + k * 0.2, mallet(hz(N.D6 + (k % 2) * 2), 0.08), 0.05, 0.25 - k * 0.15, 0.2);
        break;
      case 'strike': // a line struck out
        add(t, air(0.35, 0.5), 0.06, 0.2, 0.2);
        break;
      case 'wave': // a crowd arriving: a quick shimmer up the scale
        for (let k = 0; k < 9; k++) add(t + k * 0.036 + random() * 0.01, mallet(hz(SCALE[2 + (k % 8)] + 12), 0.12), 0.045, -0.6 + k * 0.15, 0.4);
        break;
      case 'move': // a dot moving to its answer
        add(t, air(0.9, 0.12), 0.05, -0.3 + i * 0.2, 0.4);
        add(t + 0.7, mallet(hz(SCALE[3 + (i % 4)]), 0.6), 0.08, -0.3 + i * 0.2);
        break;
      case 'note': // one person's answer
        add(t, mallet(hz([N.B4, N.D5, N.Fs5][i % 3]), 0.9), 0.15, -0.3 + i * 0.3);
        break;
      case 'hop': // the Tally run's stops, climbing
        add(t, mallet(hz(SCALE[Math.min(SCALE.length - 1, i + 1)]), 0.9), 0.16, -0.25 + (i % 3) * 0.25);
        break;
      case 'land': // what changed: a warm pair
        add(t, mallet(hz(N.D5), 1.4), 0.16, -0.2);
        add(t + 0.12, mallet(hz(N.A4), 1.4), 0.13, 0.2);
        break;
      case 'close': // home
        add(t, bell(hz(N.D4)), 0.2, 0, 0.6);
        add(t + 0.02, bell(hz(N.A4)), 0.08, 0.2, 0.6);
        add(t + 1.0, mallet(hz(N.Fs4), 1.6), 0.08, -0.2, 0.6);
        break;
      default:
        throw new Error(`No sound for cue ${kind}`);
    }
  }

  // ---------- room and finish ----------

  const [wetL, wetR] = reverb(send.L, send.R);
  // a high-pass at about 45 Hz keeps rumble off small speakers; a gentle curve keeps the peaks round
  const k = Math.exp((-2 * Math.PI * 45) / RATE);
  let peak = 0, xl = 0, xr = 0, yl = 0, yr = 0;
  for (let j = 0; j < length; j++) {
    const tail = Math.min(1, (length - j) / RATE); // fade out over the last second so the end doesn't click
    const l = L[j] + wetL[j] * 0.55, r = R[j] + wetR[j] * 0.55;
    yl = k * (yl + l - xl); xl = l;
    yr = k * (yr + r - xr); xr = r;
    L[j] = Math.tanh(yl * 1.1) * tail;
    R[j] = Math.tanh(yr * 1.1) * tail;
    peak = Math.max(peak, Math.abs(L[j]), Math.abs(R[j]));
  }
  const scale = peak > 0 ? 0.7 / peak : 1;
  return wav(L, R, scale);
}

// A small Schroeder reverb: four combs in parallel, then two all-passes, a little different on each side.
function reverb(inL, inR) {
  const side = (input, offset) => {
    const out = new Float32Array(input.length);
    const combs = [1557, 1617, 1491, 1422].map((d) => ({ buf: new Float32Array(d + offset), i: 0, lp: 0 }));
    const passes = [556, 441].map((d) => ({ buf: new Float32Array(d + offset), i: 0 }));
    for (let j = 0; j < input.length; j++) {
      let s = 0;
      for (const c of combs) {
        const y = c.buf[c.i];
        c.lp = y * 0.62 + c.lp * 0.38; // damp the highs as they decay
        c.buf[c.i] = input[j] + c.lp * 0.84;
        c.i = (c.i + 1) % c.buf.length;
        s += y;
      }
      for (const a of passes) {
        const y = a.buf[a.i];
        a.buf[a.i] = s + y * 0.5;
        a.i = (a.i + 1) % a.buf.length;
        s = y - s * 0.5;
      }
      out[j] = s * 0.25;
    }
    return out;
  };
  return [side(inL, 0), side(inR, 23)];
}

function wav(L, R, scale) {
  const n = L.length, data = Buffer.alloc(44 + n * 4);
  data.write('RIFF', 0); data.writeUInt32LE(36 + n * 4, 4); data.write('WAVE', 8);
  data.write('fmt ', 12); data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(2, 22);
  data.writeUInt32LE(RATE, 24); data.writeUInt32LE(RATE * 4, 28); data.writeUInt16LE(4, 32); data.writeUInt16LE(16, 34);
  data.write('data', 36); data.writeUInt32LE(n * 4, 40);
  for (let j = 0; j < n; j++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[j] * scale)) * 32767), 44 + j * 4);
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[j] * scale)) * 32767), 46 + j * 4);
  }
  return data;
}
