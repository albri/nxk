// The banner's picture, shared by render.mjs and video.mjs: a crowd laid out as a field of dots, one a person, with
// the nxk mark lit up in it. Each dot is sized and coloured by how close it sits to one of the mark's two strokes, so the
// mark reads as a halftone made of people: the rising stroke in the lit gradient, the falling one in pine, and the
// crossing in the overprint colour, as on the mark itself.

// The mark's strokes in its 32-unit box, each from its start to its end so a stroke can be traced in order.
const RISE = [[5.815, 26.685], [12.11, 26.685], [13.955, 19.549], [16, 16.24], [17.943, 13.095], [19.89, 6.315], [26.185, 6.315]];
const FALL = [[5.815, 6.315], [12.11, 6.315], [14.057, 13.095], [16, 16.24], [18.045, 19.549], [19.89, 26.685], [26.185, 26.685]];
const HALF = 5.63 / 2; // half the stroke width, in mark units

function sample(points, n = 480) {
  const out = [];
  for (let s = 0; s < 2; s++) {
    const [p0, p1, p2, p3] = points.slice(s * 3, s * 3 + 4);
    for (let i = 0; i < n / 2; i++) {
      const t = i / (n / 2), u = 1 - t;
      const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
      out.push({ x: a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], y: a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1], along: (s + t) / 2 });
    }
  }
  return out;
}

const RISE_PTS = sample(RISE);
const FALL_PTS = sample(FALL);

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export const mix = (a, b, k) => '#' + hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * k).toString(16).padStart(2, '0')).join('');
const smooth = (e0, e1, v) => {
  const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

function nearest(points, x, y) {
  let best = Infinity, along = 0;
  for (const p of points) {
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < best) { best = d; along = p.along; }
  }
  return { d: Math.sqrt(best), along };
}

/**
 * Dots for a field `w` by `h` pixels at `pitch` apart, with the mark centred in the right `markWidth` of it.
 * colours: { bg, fall, cross, lit: [top, bottom] }. `fadeLeft` and `fadeBottom` fade the crowd out towards those edges, as
 * fractions of the field, so text can sit there.
 * Each dot: { x, y, r, fill, k } and, for a lit dot, `stroke` ('rise' or 'fall') and `along` (0 to 1 down its stroke).
 */
export function markField({ w, h, pitch, colours, markSize = h * 0.9, markCentre = [w - h / 2, h / 2], fadeLeft = 0, fadeBottom = 0 }) {
  const scale = markSize / 26; // the mark with its stroke spans about 26 units
  const toMark = (x, y) => [16 + (x - markCentre[0]) / scale, 16 + (y - markCentre[1]) / scale];
  const dim = 0.15, r0 = pitch * 0.12, r1 = pitch * 0.42;
  const cols = Math.floor(w / pitch), rows = Math.floor(h / pitch);
  const ox = (w - (cols - 1) * pitch) / 2, oy = (h - (rows - 1) * pitch) / 2;
  const dots = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = ox + i * pitch, y = oy + j * pitch;
      const [mx, my] = toMark(x, y);
      const rise = nearest(RISE_PTS, mx, my), fall = nearest(FALL_PTS, mx, my);
      const kr = smooth(HALF * 1.3, HALF * 0.45, rise.d), kf = smooth(HALF * 1.3, HALF * 0.45, fall.d);
      const fade = (fadeLeft ? smooth(0, fadeLeft, x / w) : 1) * (fadeBottom ? smooth(0, fadeBottom, (h - y) / h) : 1);
      const crowd = mix(colours.bg, '#ffffff', dim * fade);
      const top = (my - 6.3) / 20.4;
      let fill = crowd, k = Math.max(kr, kf), stroke = null, along = 0;
      if (kr > 0.35 && kf > 0.35) {
        fill = mix(crowd, colours.cross, k);
        stroke = 'cross';
        along = 0.5;
      } else if (kr >= kf && kr > 0) {
        fill = mix(crowd, mix(colours.lit[0], colours.lit[1], Math.min(1, Math.max(0, top))), kr);
        stroke = 'rise';
        along = rise.along;
      } else if (kf > 0) {
        fill = mix(crowd, colours.fall, kf);
        stroke = 'fall';
        along = fall.along;
      }
      dots.push({ x, y, r: r0 + (r1 - r0) * k, fill, k, stroke: k > 0.02 ? stroke : null, along, crowd });
    }
  }
  return { dots, r0 };
}
