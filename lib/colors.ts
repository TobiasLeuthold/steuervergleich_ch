// Green → yellow → red ramp for "cheap → medium → expensive".
//
// Interpolating green to red in RGB passes through muddy olive/brown tones.
// Here the ramp is walked in OKLCH instead: hue turns from green over yellow
// to red while chroma stays high and lightness peaks at yellow, so every
// in-between step is a clean lime, yellow or orange. Colors outside the sRGB
// gamut are pulled in by lowering chroma only (hue and lightness kept).

type Lch = [l: number, c: number, h: number];

// [t, oklch] anchors; t = 0 cheapest, 0.5 median, 1 most expensive
const ANCHORS_LIGHT: [number, Lch][] = [
  [0, [0.56, 0.15, 152]], // deep green
  [0.25, [0.76, 0.19, 138]], // fresh green
  [0.5, [0.89, 0.18, 98]], // yellow
  [0.75, [0.76, 0.17, 58]], // orange
  [1, [0.56, 0.21, 27]], // deep red
];

// dark theme: a touch darker and calmer so the map doesn't glare
const ANCHORS_DARK: [number, Lch][] = [
  [0, [0.52, 0.14, 152]],
  [0.25, [0.7, 0.18, 138]],
  [0.5, [0.86, 0.17, 97]],
  [0.75, [0.72, 0.17, 57]],
  [1, [0.57, 0.2, 27]],
];

function oklabToLinearRgb(l: number, a: number, b: number): [number, number, number] {
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const L = l_ ** 3;
  const M = m_ ** 3;
  const S = s_ ** 3;
  return [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];
}

function lchToLinear([l, c, h]: Lch) {
  const r = (h * Math.PI) / 180;
  return oklabToLinearRgb(l, c * Math.cos(r), c * Math.sin(r));
}

const inGamut = (rgb: number[]) => rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

const toByte = (v: number) => {
  const x = Math.min(1, Math.max(0, v));
  const s = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
  return Math.round(s * 255);
};

function lchToHex(lch: Lch): string {
  let rgb = lchToLinear(lch);
  if (!inGamut(rgb)) {
    let lo = 0;
    let hi = lch[1];
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(lchToLinear([lch[0], mid, lch[2]]))) lo = mid;
      else hi = mid;
    }
    rgb = lchToLinear([lch[0], lo, lch[2]]);
  }
  return "#" + rgb.map((v) => toByte(v).toString(16).padStart(2, "0")).join("");
}

function sample(anchors: [number, Lch][], t: number): Lch {
  const x = Math.min(1, Math.max(0, t));
  let i = 0;
  while (i < anchors.length - 2 && x > anchors[i + 1][0]) i++;
  const [t0, a] = anchors[i];
  const [t1, b] = anchors[i + 1];
  const k = (x - t0) / (t1 - t0);
  const lerp = (u: number, v: number) => u + (v - u) * k;
  return [lerp(a[0], b[0]), lerp(a[1], b[1]), lerp(a[2], b[2])];
}

// 256-step lookup tables, so the map doesn't redo color math per municipality
const STEPS = 256;
const build = (anchors: [number, Lch][]) =>
  Array.from({ length: STEPS }, (_, i) => lchToHex(sample(anchors, i / (STEPS - 1))));
const LUT_LIGHT = build(ANCHORS_LIGHT);
const LUT_DARK = build(ANCHORS_DARK);

/** Color for t in [0, 1]: 0 = cheapest (green), 0.5 = median (yellow), 1 = most expensive (red). */
export function rampColor(t: number, dark: boolean): string {
  const lut = dark ? LUT_DARK : LUT_LIGHT;
  const x = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0;
  return lut[Math.round(x * (STEPS - 1))];
}

/** CSS linear-gradient stops matching rampColor, for the legend bar. */
export function rampGradient(dark: boolean, stops = 17): string {
  return Array.from({ length: stops }, (_, i) => {
    const t = i / (stops - 1);
    return `${rampColor(t, dark)} ${(t * 100).toFixed(1)}%`;
  }).join(", ");
}
