// ── Films instantanés : chaque preset simule une émulsion précise ──
//
// Modèle établi d'après les caractéristiques documentées des vrais films
// (analog.cafe, Blue Moon Camera, moominsean, PictureFX) :
//  · `lift`  — voile coloré des noirs (les noirs d'un polaroid ne sont
//    jamais neutres ni à zéro) ;
//  · `white` — plafond des blancs par canal : les hautes lumières sont
//    crème/ivoire, jamais du blanc pur ;
//  · `gamma` — dérives des tons moyens par canal ;
//  · `contrast` — courbe en S filmique (épaules douces) ;
//  · `splitShadow` / `splitHigh` — croisement colorimétrique par zone
//    tonale (ex. 600 : ombres vertes, hautes lumières rosées) ;
//  · `olive` — mixeur de canaux : les verts glissent vers l'olive (SX-70) ;
//  · `blueMute` — les bleus perdent leur éclat (faiblesse cyan des
//    émulsions intégrales) ;
//  · halation (`bloom`), grain d'émulsion, vignettage.
// `css` est l'approximation temps réel pour le viseur.

export const PRESETS = [
  {
    // Polaroid 600 : chaud, pastel ; hautes lumières crème rosé,
    // ombres vertes et bouchées, saturation douce et régulière.
    id: '600',
    name: '600',
    css: 'sepia(0.18) saturate(0.8) contrast(0.95) brightness(1.03)',
    lift: { r: 0.035, g: 0.05, b: 0.042 },
    white: { r: 0.97, g: 0.94, b: 0.885 },
    gamma: { r: 1.08, g: 1.0, b: 0.93 },
    contrast: 0.18,
    sat: 0.78,
    splitShadow: [-9, 7, 4],
    splitHigh: [13, 4, -8],
    blueMute: 0.22,
    bloom: 0.16,
    grain: 0.07,
    vignette: 0.26,
  },
  {
    // SX-70 : doré, doux ; noirs jamais bouchés, blancs jamais stériles,
    // verts olive, rouges assourdis, ombres bleutées, rehauts rosés.
    id: 'sx70',
    name: 'SX-70',
    css: 'sepia(0.34) saturate(0.72) contrast(0.87) brightness(1.05)',
    lift: { r: 0.075, g: 0.068, b: 0.085 },
    white: { r: 0.96, g: 0.925, b: 0.855 },
    gamma: { r: 1.14, g: 1.03, b: 0.9 },
    contrast: 0.06,
    sat: 0.72,
    splitShadow: [0, 3, 10],
    splitHigh: [14, 6, -6],
    olive: 0.18,
    blueMute: 0.24,
    bloom: 0.2,
    grain: 0.09,
    vignette: 0.28,
  },
  {
    // Time Zero : plus saturé que le SX-70, dominante teal / vert acier,
    // bleus mats, rendu pictural.
    id: 'timezero',
    name: 'Time Zero',
    css: 'hue-rotate(14deg) saturate(0.95) contrast(0.97) sepia(0.1)',
    lift: { r: 0.05, g: 0.075, b: 0.065 },
    white: { r: 0.9, g: 0.95, b: 0.935 },
    gamma: { r: 0.94, g: 1.05, b: 1.0 },
    contrast: 0.16,
    sat: 0.92,
    splitShadow: [-12, 8, 10],
    splitHigh: [2, 6, 0],
    blueMute: 0.32,
    bloom: 0.12,
    grain: 0.1,
    vignette: 0.32,
  },
  {
    // Go : le petit format moderne — plus contrasté et plus froid que
    // le 600, couleurs punchy, ombres bleutées.
    id: 'go',
    name: 'Go',
    css: 'saturate(0.94) contrast(1.08) brightness(1.01)',
    lift: { r: 0.028, g: 0.032, b: 0.045 },
    white: { r: 0.945, g: 0.965, b: 0.975 },
    gamma: { r: 0.99, g: 1.0, b: 1.03 },
    contrast: 0.3,
    sat: 0.92,
    splitShadow: [0, 2, 6],
    splitHigh: [3, 3, 4],
    blueMute: 0.1,
    bloom: 0.1,
    grain: 0.09,
    vignette: 0.3,
  },
  {
    // 669 Polacolor : pastel mais bien saturé, léger voile bleu,
    // le plus fidèle des films instantanés — ISO 80, grain fin.
    id: '669',
    name: '669',
    css: 'saturate(0.86) contrast(0.96) sepia(0.05) hue-rotate(-4deg) brightness(1.01)',
    lift: { r: 0.03, g: 0.036, b: 0.052 },
    white: { r: 0.965, g: 0.965, b: 0.955 },
    gamma: { r: 1.0, g: 1.0, b: 1.03 },
    contrast: 0.1,
    sat: 0.85,
    splitShadow: [0, 3, 6],
    splitHigh: [4, 2, 2],
    bloom: 0.1,
    grain: 0.05,
    vignette: 0.18,
  },
  {
    // Ektachrome : la diapo froide et propre — bleus affirmés, rendu
    // net et fidèle, contraste de film inversible, grain très fin.
    id: 'ekta',
    name: 'Ektachrome',
    css: 'saturate(1.02) contrast(1.1) brightness(1.01)',
    lift: { r: 0.015, g: 0.015, b: 0.028 },
    white: { r: 0.955, g: 0.975, b: 1.0 },
    gamma: { r: 1.04, g: 1.0, b: 0.95 },
    contrast: 0.28,
    sat: 0.98,
    splitShadow: [0, 2, 8],
    splitHigh: [2, 2, 4],
    bloom: 0.08,
    grain: 0.04,
    vignette: 0.16,
  },
  {
    // Kodachrome : la légende — rouges riches, noirs profonds, palette
    // chaude et retenue (« more poetry, a softness », dixit McCurry),
    // bleus assourdis, grain fin.
    id: 'kodach',
    name: 'Kodachrome',
    css: 'saturate(1.08) contrast(1.15) sepia(0.08) brightness(0.98)',
    lift: { r: 0.012, g: 0.01, b: 0.008 },
    white: { r: 0.985, g: 0.96, b: 0.92 },
    gamma: { r: 0.97, g: 1.0, b: 1.07 },
    contrast: 0.34,
    sat: 1.05,
    splitShadow: [2, 0, -2],
    splitHigh: [10, 3, -6],
    blueMute: 0.15,
    bloom: 0.08,
    grain: 0.05,
    vignette: 0.18,
  },
  {
    // 667 N&B : contraste fort, ombres profondes et nettes,
    // blancs ivoire (jamais stériles), grain visible.
    id: 'nb',
    name: 'N&B 667',
    css: 'grayscale(1) sepia(0.14) contrast(1.18)',
    lift: { r: 0.02, g: 0.018, b: 0.015 },
    white: { r: 0.98, g: 0.955, b: 0.905 },
    gamma: { r: 1.0, g: 1.0, b: 1.0 },
    contrast: 0.36,
    sat: 0,
    splitShadow: [0, 0, 0],
    splitHigh: [8, 4, -5],
    bloom: 0.12,
    grain: 0.18,
    vignette: 0.28,
  },
  {
    // Reclaimed Blue : la chimie récupérée — un monochrome bleu à la
    // cyanotype, du bleu profond au blanc cassé en passant par le
    // turquoise lagon ; plus contrasté que la couleur.
    id: 'bleu',
    name: 'Bleu',
    css: 'grayscale(1) sepia(1) hue-rotate(160deg) saturate(3.2) contrast(1.15) brightness(1.0)',
    lift: { r: 0.0, g: 0.06, b: 0.2 },
    white: { r: 0.78, g: 0.98, b: 1.0 },
    gamma: { r: 1.38, g: 1.14, b: 0.85 },
    contrast: 0.34,
    sat: 0,
    splitShadow: [-12, 8, 24],
    splitHigh: [-8, 2, 2],
    bloom: 0.14,
    grain: 0.08,
    vignette: 0.3,
  },
  {
    // Duochrome Bleu & Noir : cyan profond + noirs riches, sans point
    // blanc — le tirage paraît sombre même bien exposé.
    id: 'duobleu',
    name: 'Duo Bleu',
    css: 'grayscale(1) sepia(1) hue-rotate(175deg) saturate(3.4) contrast(1.35) brightness(0.8)',
    lift: { r: 0.01, g: 0.05, b: 0.12 },
    white: { r: 0.4, g: 0.66, b: 0.88 },
    gamma: { r: 1.25, g: 1.02, b: 0.92 },
    contrast: 0.48,
    sat: 0,
    splitShadow: [0, 2, 10],
    splitHigh: [-4, 4, 10],
    bloom: 0.06,
    grain: 0.12,
    vignette: 0.36,
  },
  {
    // Duochrome Jaune & Noir : le plus contrasté du catalogue — rehauts
    // jaune vif, noirs texturés.
    id: 'duojaune',
    name: 'Duo Jaune',
    css: 'grayscale(1) sepia(1) hue-rotate(8deg) saturate(2.6) contrast(1.34)',
    lift: { r: 0.05, g: 0.04, b: 0.0 },
    white: { r: 0.97, g: 0.87, b: 0.24 },
    gamma: { r: 0.98, g: 1.0, b: 1.25 },
    contrast: 0.46,
    sat: 0,
    splitShadow: [4, 2, -4],
    splitHigh: [6, 2, -8],
    bloom: 0.1,
    grain: 0.16,
    vignette: 0.3,
  },
  {
    // Duochrome Rouge & Noir : rouge profond + noirs denses, dramatique.
    id: 'duorouge',
    name: 'Duo Rouge',
    css: 'grayscale(1) sepia(1) hue-rotate(-28deg) saturate(3) contrast(1.28) brightness(0.9)',
    lift: { r: 0.09, g: 0.015, b: 0.015 },
    white: { r: 0.93, g: 0.32, b: 0.26 },
    gamma: { r: 0.95, g: 1.15, b: 1.18 },
    contrast: 0.42,
    sat: 0,
    splitShadow: [10, 0, 0],
    splitHigh: [8, -2, -4],
    bloom: 0.08,
    grain: 0.14,
    vignette: 0.34,
  },
  {
    // Expiré : voile magenta dans les ombres, jaunissement des rehauts,
    // contraste plat, saturation en berne, développement inégal.
    id: 'expire',
    name: 'Expiré',
    css: 'sepia(0.32) saturate(0.45) contrast(0.8) brightness(1.06) hue-rotate(-10deg)',
    lift: { r: 0.15, g: 0.1, b: 0.13 },
    white: { r: 0.92, g: 0.9, b: 0.84 },
    gamma: { r: 1.07, g: 0.95, b: 0.88 },
    contrast: -0.14,
    sat: 0.45,
    splitShadow: [14, -5, 10],
    splitHigh: [12, 8, -12],
    blueMute: 0.32,
    bloom: 0.22,
    grain: 0.2,
    vignette: 0.5,
    edgeCast: 'rgba(190, 80, 150, 0.2)',
  },
  {
    id: 'aucun',
    name: 'Aucun',
    css: 'none',
    lift: { r: 0, g: 0, b: 0 },
    white: { r: 1, g: 1, b: 1 },
    gamma: { r: 1, g: 1, b: 1 },
    contrast: 0,
    sat: 1,
    splitShadow: [0, 0, 0],
    splitHigh: [0, 0, 0],
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
  const lift = preset.lift[ch];
  const white = preset.white[ch];
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
    // Tons moyens par canal.
    x = Math.pow(Math.min(1, Math.max(0, x)), 1 / g);
    // Voile des noirs et plafond des blancs : les extrêmes sont teintés.
    x = lift + x * (white - lift);
    lut[i] = clamp255(Math.round(x * 255));
  }
  return lut;
}

// Applique le rendu film sur un canvas (modifie le canvas en place).
// `adjust` : réglages utilisateur — expo (EV), contrast (-1..1, s'ajoute
// au film), sat (0..1.6, absolu, remplace celui du film), grain (alpha
// 0..0.4, absolu), blur (0..1, flou gaussien), vignette (0..1, absolu,
// remplace celui du film).
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

  // 2 — Grading par pixel : mixeur, saturation, LUTs, croisement tonal.
  const lutR = buildLut(preset, 'r', adjust);
  const lutG = buildLut(preset, 'g', adjust);
  const lutB = buildLut(preset, 'b', adjust);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const sat = adjust?.sat ?? preset.sat;
  const olive = preset.olive || 0;
  const blueMute = preset.blueMute || 0;
  const [ssr, ssg, ssb] = preset.splitShadow;
  const [shr, shg, shb] = preset.splitHigh;
  const hasSplit = ssr || ssg || ssb || shr || shg || shb;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i + 1], b = d[i + 2];
    let luma = 0.299 * r + 0.587 * g + 0.114 * b;
    // Verts olive (SX-70) et bleus mats (faiblesse cyan des intégrales).
    if (olive) g = g * (1 - olive) + r * olive;
    if (blueMute) b = b * (1 - blueMute) + luma * blueMute;
    if (sat !== 1) {
      r = luma + (r - luma) * sat;
      g = luma + (g - luma) * sat;
      b = luma + (b - luma) * sat;
    }
    r = lutR[clamp255(r | 0)];
    g = lutG[clamp255(g | 0)];
    b = lutB[clamp255(b | 0)];
    // Croisement colorimétrique : teintes distinctes ombres / rehauts.
    if (hasSplit) {
      const t = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const ts = (1 - t) * (1 - t);
      const th = t * t;
      r += ssr * ts + shr * th;
      g += ssg * ts + shg * th;
      b += ssb * ts + shb * th;
    }
    d[i] = clamp255(r);
    d[i + 1] = clamp255(g);
    d[i + 2] = clamp255(b);
  }
  ctx.putImageData(img, 0, 0);

  // 2b — Flou gaussien uniforme.
  const blurAmt = adjust?.blur || 0;
  if (blurAmt > 0) {
    const px = blurAmt * w * 0.02; // jusqu'à ~2 % de la largeur
    const tmp = document.createElement('canvas');
    tmp.width = w;
    tmp.height = h;
    const tctx = tmp.getContext('2d');
    if (typeof tctx.filter === 'string') {
      // Vrai flou gaussien quand le navigateur le supporte.
      tctx.filter = `blur(${px.toFixed(1)}px)`;
      tctx.drawImage(canvas, 0, 0);
      ctx.drawImage(tmp, 0, 0);
    } else {
      // Repli : double passe réduction/agrandissement.
      const k = 1 / (1 + blurAmt * 7);
      const small = document.createElement('canvas');
      small.width = Math.max(1, Math.round(w * k));
      small.height = Math.max(1, Math.round(h * k));
      const sctx2 = small.getContext('2d');
      sctx2.imageSmoothingQuality = 'high';
      sctx2.drawImage(canvas, 0, 0, small.width, small.height);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(small, 0, 0, w, h);
    }
  }

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
  const grainAmt = adjust?.grain ?? preset.grain;
  if (grainAmt > 0) {
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = grainAmt;
    ctx.drawImage(grainTile(seed), 0, 0, w, h);
  }

  // 5 — Vignettage. Réglage utilisateur (absolu) sinon la valeur du film.
  const vig = adjust?.vignette ?? preset.vignette;
  if (vig > 0) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 1;
    const rMax = Math.hypot(w, h) / 2;
    const grad = ctx.createRadialGradient(w / 2, h / 2, rMax * 0.45, w / 2, h / 2, rMax);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    const v = Math.round(255 * (1 - vig * 0.55));
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

// ── Light leaks : fuites de lumière procédurales, seedées ──
// Trois archétypes documentés des vraies fuites (boîtier percé, dos mal
// fermé) : halo débordant d'un bord, traînée traversante, blob de coin.
// Palette chaude — orange, rouge, magenta — en fusion « screen ».
export function applyLightLeak(canvas, seed, intensity) {
  const ctx = canvas.getContext('2d');
  const { width: w, height: h } = canvas;
  const rnd = mulberry32(seed ^ 0x1e4b7);
  const diag = Math.hypot(w, h);
  ctx.globalCompositeOperation = 'screen';
  const warm = () => {
    const t = rnd();
    if (t < 0.5) return [255, 130 + rnd() * 60, 30 + rnd() * 40];   // orange
    if (t < 0.8) return [255, 60 + rnd() * 50, 40 + rnd() * 50];    // rouge
    return [255, 70 + rnd() * 40, 150 + rnd() * 80];                // magenta
  };
  const n = 1 + Math.floor(rnd() * 2.4);
  for (let i = 0; i < n; i++) {
    const kind = rnd();
    const [r, g, b] = warm();
    const a = intensity * (0.5 + rnd() * 0.45);
    if (kind < 0.45) {
      // Halo : centre hors cadre, déborde d'un bord.
      const edge = Math.floor(rnd() * 4);
      const t = rnd();
      const cx = edge === 1 ? w * 1.15 : edge === 3 ? -w * 0.15 : t * w;
      const cy = edge === 0 ? -h * 0.15 : edge === 2 ? h * 1.15 : t * h;
      const rad = diag * (0.35 + rnd() * 0.55);
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      grad.addColorStop(0, `rgba(255,${Math.min(255, g + 80)},${Math.min(255, b + 60)},${a})`);
      grad.addColorStop(0.35, `rgba(${r},${g},${b},${a * 0.7})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    } else if (kind < 0.8) {
      // Traînée : bande douce traversante, légèrement inclinée.
      const ang = (rnd() - 0.5) * 0.6 + (rnd() < 0.5 ? 0 : Math.PI / 2);
      const off = (rnd() - 0.5) * w * 0.9;
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate(ang);
      const bw = w * (0.08 + rnd() * 0.18);
      const grad = ctx.createLinearGradient(off - bw, 0, off + bw, 0);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.5, `rgba(${r},${g},${b},${a * 0.85})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(-diag, -diag, diag * 2, diag * 2);
      ctx.restore();
    } else {
      // Blob de coin, plus intense au cœur.
      const cx = rnd() < 0.5 ? w * (0.02 + rnd() * 0.1) : w * (0.88 + rnd() * 0.1);
      const cy = rnd() < 0.5 ? h * (0.02 + rnd() * 0.1) : h * (0.88 + rnd() * 0.1);
      const rad = diag * (0.14 + rnd() * 0.22);
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      grad.addColorStop(0, `rgba(255,${Math.min(255, g + 90)},${Math.min(255, b + 80)},${Math.min(1, a * 1.2)})`);
      grad.addColorStop(0.5, `rgba(${r},${g},${b},${a * 0.6})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }
  }
  ctx.globalCompositeOperation = 'source-over';
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
