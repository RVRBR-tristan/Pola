// ── Films instantanés : chaque preset simule une émulsion précise ──
// Le pipeline pixel utilise lift / gamma / gain par canal, une courbe de
// contraste filmique, saturation, halation (bloom), grain et vignettage.
// `css` est l'approximation temps réel pour le viseur et les vignettes.

export const PRESETS = [
  {
    id: '600',
    name: '600',
    css: 'contrast(0.93) saturate(0.88) brightness(1.03) sepia(0.12)',
    lift: 0.055,
    gamma: { r: 1.05, g: 1.0, b: 0.96 },
    gain: { r: 1.0, g: 0.985, b: 0.945 },
    sat: 0.86,
    contrast: 0.16,
    bloom: 0.12,
    grain: 0.07,
    vignette: 0.26,
  },
  {
    id: 'sx70',
    name: 'SX-70',
    css: 'sepia(0.24) saturate(0.9) contrast(0.9) brightness(1.02)',
    lift: 0.07,
    gamma: { r: 1.09, g: 1.0, b: 0.93 },
    gain: { r: 1.04, g: 0.97, b: 0.89 },
    sat: 0.8,
    contrast: 0.09,
    bloom: 0.18,
    grain: 0.09,
    vignette: 0.3,
  },
  {
    id: 'timezero',
    name: 'Time Zero',
    css: 'sepia(0.12) hue-rotate(14deg) saturate(0.74) contrast(0.9)',
    lift: 0.09,
    gamma: { r: 1.0, g: 0.97, b: 1.0 },
    gain: { r: 0.93, g: 1.0, b: 0.99 },
    sat: 0.7,
    contrast: 0.06,
    bloom: 0.1,
    grain: 0.1,
    vignette: 0.34,
  },
  {
    id: '669',
    name: '669',
    css: 'saturate(0.8) contrast(0.95) sepia(0.16) hue-rotate(6deg)',
    lift: 0.05,
    gamma: { r: 1.02, g: 0.98, b: 1.0 },
    gain: { r: 0.98, g: 1.0, b: 0.93 },
    sat: 0.76,
    contrast: 0.13,
    bloom: 0.08,
    grain: 0.08,
    vignette: 0.28,
  },
  {
    id: 'nb',
    name: 'N&B 667',
    css: 'grayscale(1) sepia(0.14) contrast(0.98)',
    lift: 0.04,
    gamma: { r: 1.0, g: 1.0, b: 1.0 },
    gain: { r: 1.04, g: 1.0, b: 0.94 },
    sat: 0,
    contrast: 0.22,
    bloom: 0.1,
    grain: 0.14,
    vignette: 0.3,
  },
  {
    id: 'expire',
    name: 'Expiré',
    css: 'sepia(0.32) saturate(0.62) contrast(0.82) brightness(1.05)',
    lift: 0.14,
    gamma: { r: 1.03, g: 0.97, b: 0.9 },
    gain: { r: 1.02, g: 0.95, b: 0.88 },
    sat: 0.55,
    contrast: -0.06,
    bloom: 0.2,
    grain: 0.16,
    vignette: 0.5,
    edgeCast: 'rgba(190, 80, 150, 0.16)',
  },
  {
    id: 'aucun',
    name: 'Aucun',
    css: 'none',
    lift: 0,
    gamma: { r: 1, g: 1, b: 1 },
    gain: { r: 1, g: 1, b: 1 },
    sat: 1,
    contrast: 0,
    bloom: 0,
    grain: 0,
    vignette: 0,
  },
];

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (x) => x * x * (3 - 2 * x);

// Table de correspondance 0..255 pour un canal donné.
// `adjust` : réglages utilisateur { expo (EV), contrast (-1..1) },
// repliés dans la courbe du film.
function buildLut(preset, ch, adjust) {
  const lut = new Uint8Array(256);
  const g = preset.gamma[ch];
  const gain = preset.gain[ch];
  const { lift } = preset;
  const expo = adjust?.expo || 0;
  const contrast = preset.contrast + (adjust?.contrast || 0);
  const gainExpo = Math.pow(2, expo);
  for (let i = 0; i < 256; i++) {
    let x = i / 255;
    // Exposition : comme si le film avait reçu plus ou moins de lumière.
    x = Math.min(1, x * gainExpo);
    // Courbe de contraste filmique : épaules douces via smoothstep.
    if (contrast >= 0) x = lerp(x, smooth(x), Math.min(1, contrast));
    else x = lerp(x, 0.22 + x * 0.56, Math.min(1, -contrast));
    // Lift / gamma / gain — les dérives colorées viennent d'ici.
    x = Math.pow(Math.min(1, Math.max(0, x)), 1 / g);
    x = x * (gain - lift) + lift;
    lut[i] = clamp255(Math.round(x * 255));
  }
  return lut;
}

// Applique le rendu film sur un canvas (modifie le canvas en place).
export function applyPreset(canvas, preset, seed, adjust) {
  const ctx = canvas.getContext('2d');
  const { width: w, height: h } = canvas;

  // 1 — Douceur optique : les objectifs plastiques ne sont pas nets.
  const soft = document.createElement('canvas');
  soft.width = Math.max(1, Math.round(w / 2));
  soft.height = Math.max(1, Math.round(h / 2));
  const sctx = soft.getContext('2d');
  sctx.drawImage(canvas, 0, 0, soft.width, soft.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.globalAlpha = 0.45;
  ctx.drawImage(soft, 0, 0, w, h);
  ctx.globalAlpha = 1;

  // 2 — Grading par pixel : LUTs par canal + saturation.
  const lutR = buildLut(preset, 'r', adjust);
  const lutG = buildLut(preset, 'g', adjust);
  const lutB = buildLut(preset, 'b', adjust);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const sat = preset.sat;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i + 1], b = d[i + 2];
    if (sat !== 1) {
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      r = luma + (r - luma) * sat;
      g = luma + (g - luma) * sat;
      b = luma + (b - luma) * sat;
    }
    d[i] = lutR[clamp255(r | 0)];
    d[i + 1] = lutG[clamp255(g | 0)];
    d[i + 2] = lutB[clamp255(b | 0)];
  }
  ctx.putImageData(img, 0, 0);

  // 3 — Halation : les hautes lumières fleurissent doucement.
  if (preset.bloom > 0) {
    const bloom = document.createElement('canvas');
    bloom.width = Math.max(1, Math.round(w / 6));
    bloom.height = Math.max(1, Math.round(h / 6));
    const bctx = bloom.getContext('2d');
    bctx.drawImage(canvas, 0, 0, bloom.width, bloom.height);
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = preset.bloom;
    ctx.drawImage(bloom, 0, 0, w, h);
  }

  // 4 — Grain d'émulsion.
  if (preset.grain > 0) {
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = preset.grain;
    ctx.drawImage(grainTile(seed), 0, 0, w, h);
  }

  // 5 — Vignettage.
  if (preset.vignette > 0) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 1;
    const rMax = Math.hypot(w, h) / 2;
    const grad = ctx.createRadialGradient(w / 2, h / 2, rMax * 0.45, w / 2, h / 2, rMax);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    const v = Math.round(255 * (1 - preset.vignette * 0.55));
    grad.addColorStop(1, `rgb(${v},${v},${Math.min(255, v + 6)})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  // 6 — Dérive chimique des bords (films périmés).
  if (preset.edgeCast) {
    ctx.globalCompositeOperation = 'soft-light';
    const grad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.hypot(w, h) / 2);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, preset.edgeCast);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

// PRNG déterministe : le grain ne « saute » pas quand on change de cadre.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let grainCache = null;
function grainTile(seed) {
  if (grainCache && grainCache.seed === seed) return grainCache.canvas;
  const size = 640;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const rnd = mulberry32(seed);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = 96 + rnd() * 64;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  grainCache = { seed, canvas: c };
  return c;
}
