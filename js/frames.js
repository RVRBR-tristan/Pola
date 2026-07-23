// ── Cadres instantanés photoréalistes ──
// Les cadres 600 sont synthétisés : papier à fibre (bruit de valeur
// multi-octaves), éclairage non uniforme, fenêtre embossée, usure des
// bords, auréoles. L'Instax Mini utilise une vraie texture scannée.
// Géométries d'après les formats réels : Polaroid 600 (88 × 107 mm,
// image 79 × 79) et Instax Mini (54 × 86 mm, image 46 × 62).

import { mulberry32 } from './presets.js';

export const FRAMES = [
  {
    id: 'p600',
    name: '600 Blanc',
    W: 656, H: 792,
    img: { x: 47, y: 49, w: 568, h: 580 },
    scale: 2,
    overlay: 'assets/frame-600.png',
    paper: [248, 246, 241],
    aged: 0, dark: false,
  },
  {
    id: 'p600-vieilli',
    name: '600 Vieilli',
    W: 880, H: 1070,
    img: { x: 45, y: 50, w: 790, h: 790 },
    scale: 2,
    paper: [241, 234, 217],
    aged: 1, dark: false,
  },
  {
    id: 'p600-noir',
    name: '600 Noir',
    W: 880, H: 1070,
    img: { x: 45, y: 50, w: 790, h: 790 },
    scale: 2,
    paper: [32, 32, 35],
    aged: 0, dark: true,
  },
  {
    id: 'instax',
    name: 'Instax Mini',
    W: 606, H: 957,
    img: { x: 46, y: 91, w: 510, h: 684 },
    scale: 2,
    overlay: 'assets/frame-instax.png',
    paper: [250, 249, 247],
    aged: 0, dark: false,
  },
  {
    id: 'instax-brut',
    name: 'Instax Brut',
    W: 591, H: 891,
    img: { x: 34, y: 78, w: 523, h: 648 },
    scale: 2,
    overlay: 'assets/frame-instax-brut.png',
    paper: [250, 249, 247],
    aged: 0, dark: false,
  },
];

/* ── Chargement des textures réelles ── */

const textures = {};
export const assetsReady = Promise.all(
  FRAMES.filter((f) => f.overlay).map(
    (f) =>
      new Promise((res) => {
        const img = new Image();
        img.onload = () => { textures[f.id] = img; res(); };
        img.onerror = res; // repli : synthèse procédurale
        img.src = f.overlay;
      })
  )
);

/* ── Bruit de valeur seedé (base de la synthèse papier) ── */

const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);

function hash2(ix, iy, seed) {
  let h = (ix * 374761393 + iy * 668265263 + seed * 974634 + 1013904223) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function vnoise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = smooth(x - ix), fy = smooth(y - iy);
  return lerp(
    lerp(hash2(ix, iy, seed), hash2(ix + 1, iy, seed), fx),
    lerp(hash2(ix, iy + 1, seed), hash2(ix + 1, iy + 1, seed), fx),
    fy
  );
}

/* ── Synthèse du papier ── */

const paperCache = new Map();

function synthPaper(frame, seed) {
  const key = `${frame.id}:${frame.scale}:${frame.aged ? seed : 0}`;
  if (paperCache.has(key)) return paperCache.get(key);

  const s = frame.scale;
  const W = frame.W * s, H = frame.H * s;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');

  {
    // — Fibre du papier, calculée à mi-résolution puis lissée.
    const hw = W >> 1, hh = H >> 1;
    const half = document.createElement('canvas');
    half.width = hw;
    half.height = hh;
    const hctx = half.getContext('2d');
    const im = hctx.createImageData(hw, hh);
    const d = im.data;
    const [br, bg, bb] = frame.paper;
    const dark = frame.dark;
    for (let y = 0; y < hh; y++) {
      for (let x = 0; x < hw; x++) {
        const mottle = vnoise(x / 46, y / 46, 11) - 0.5;   // nuages larges
        const mid = vnoise(x / 12, y / 12, 23) - 0.5;      // texture moyenne
        const fiber = vnoise(x / 2.1, y / 0.9, 37) - 0.5;  // fibre anisotrope
        const tint = vnoise(x / 78, y / 78, 53) - 0.5;     // dérive chaude/froide
        const l = 1 + mottle * (dark ? 0.05 : 0.038) + mid * 0.024 + fiber * (dark ? 0.05 : 0.028);
        const i = (y * hw + x) * 4;
        d[i] = Math.min(255, br * l + tint * 6);
        d[i + 1] = Math.min(255, bg * l + tint * 1);
        d[i + 2] = Math.min(255, bb * l - tint * 7);
        d[i + 3] = 255;
      }
    }
    hctx.putImageData(im, 0, 0);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(half, 0, 0, W, H);
  }

  // — Éclairage non uniforme : un tirage photographié, pas un aplat.
  const lightX = W * 0.38, lightY = H * 0.3;
  const sheen = ctx.createRadialGradient(lightX, lightY, 0, lightX, lightY, Math.hypot(W, H) * 0.75);
  sheen.addColorStop(0, 'rgba(255,255,255,0.10)');
  sheen.addColorStop(0.55, 'rgba(255,255,255,0)');
  sheen.addColorStop(1, 'rgba(30,25,20,0.10)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, W, H);

  // — Bords : assombrissement irrégulier + micro-écaillures.
  edgeWear(ctx, W, H, frame, seed);

  // — Vieillissement : jaunissement des bords, auréoles, mouchetures.
  if (frame.aged) agedMarks(ctx, W, H, frame, seed);

  paperCache.set(key, c);
  return c;
}

function edgeWear(ctx, W, H, frame, seed) {
  const s = frame.scale;
  const dark = frame.dark;
  const rim = dark ? 'rgba(0,0,0,' : 'rgba(105,95,78,';
  // Liseré irrégulier : segments courts d'opacité modulée par bruit.
  ctx.lineCap = 'round';
  for (const [x0, y0, x1, y1, nx, ny] of [
    [0, 0, W, 0, 0, 1], [0, H, W, H, 0, -1], [0, 0, 0, H, 1, 0], [W, 0, W, H, -1, 0],
  ]) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.round(len / (14 * s));
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps, t1 = (i + 1) / steps;
      const n = vnoise(i * 0.7, seed % 97, 71);
      ctx.strokeStyle = rim + (0.10 + n * 0.16) + ')';
      ctx.lineWidth = (1 + n * 1.6) * s;
      ctx.beginPath();
      ctx.moveTo(lerp(x0, x1, t0) + nx * s, lerp(y0, y1, t0) + ny * s);
      ctx.lineTo(lerp(x0, x1, t1) + nx * s, lerp(y0, y1, t1) + ny * s);
      ctx.stroke();
    }
  }
  // Coins légèrement frottés.
  const rnd = mulberry32(seed ^ 0xc0f3);
  for (const [cx, cy] of [[0, 0], [W, 0], [0, H], [W, H]]) {
    const r = (14 + rnd() * 30) * s;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, rim + (0.10 + rnd() * 0.10) + ')');
    g.addColorStop(1, rim + '0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
}

// Auréoles à anneau (effet « coffee ring »), jaunissement, mouchetures.
function agedMarks(ctx, W, H, frame, seed) {
  const s = frame.scale;
  const rnd = mulberry32(seed ^ 0xa9ed);

  // Jaunissement inégal depuis les bords.
  for (const [x0, y0, x1, y1] of [
    [0, 0, 0, H * 0.25], [0, H, 0, H * 0.72], [0, 0, W * 0.2, 0], [W, 0, W * 0.78, 0],
  ]) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, `rgba(168,132,66,${0.06 + rnd() * 0.06})`);
    g.addColorStop(1, 'rgba(168,132,66,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // Auréoles : blob irrégulier, cœur pâle, anneau plus marqué.
  const blobs = 4 + Math.floor(rnd() * 4);
  for (let b = 0; b < blobs; b++) {
    const edge = rnd() < 0.75;
    const cx = (edge ? (rnd() < 0.5 ? rnd() * 0.2 : 0.8 + rnd() * 0.2) : rnd()) * W;
    const cy = (edge ? rnd() : (rnd() < 0.5 ? rnd() * 0.15 : 0.8 + rnd() * 0.2)) * H;
    const rr = (18 + rnd() * 55) * s;
    const irregular = () => {
      ctx.beginPath();
      const pts = 14;
      for (let i = 0; i <= pts; i++) {
        const a = (i / pts) * Math.PI * 2;
        const rad = rr * (0.75 + vnoise(Math.cos(a) * 2 + b * 9, Math.sin(a) * 2, 91) * 0.5);
        const px = cx + Math.cos(a) * rad, py = cy + Math.sin(a) * rad;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
    };
    const a = 0.05 + rnd() * 0.07;
    ctx.fillStyle = `rgba(150,110,52,${a * 0.5})`;
    irregular();
    ctx.fill();
    ctx.strokeStyle = `rgba(128,90,40,${a})`;
    ctx.lineWidth = (1.2 + rnd() * 2) * s;
    irregular();
    ctx.stroke();
  }

  // Mouchetures sombres et claires.
  for (let i = 0; i < 90; i++) {
    const x = rnd() * W, y = rnd() * H;
    const r = (0.4 + rnd() * 1.4) * s;
    ctx.fillStyle = rnd() < 0.6
      ? `rgba(90,70,45,${0.05 + rnd() * 0.12})`
      : `rgba(255,255,255,${0.08 + rnd() * 0.12})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Une pliure discrète en travers de la marge basse.
  const fy = H * (0.87 + rnd() * 0.06);
  const tilt = (rnd() - 0.5) * 30 * s;
  const grad = ctx.createLinearGradient(0, fy - 3 * s, 0, fy + 3 * s);
  grad.addColorStop(0, 'rgba(0,0,0,0.06)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.20)');
  grad.addColorStop(1, 'rgba(0,0,0,0.05)');
  ctx.fillStyle = grad;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, fy - 2.5 * s);
  ctx.lineTo(W, fy - 2.5 * s + tilt);
  ctx.lineTo(W, fy + 2.5 * s + tilt);
  ctx.lineTo(0, fy + 2.5 * s);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/* ── Composition du polaroid ── */

// `photo` est un canvas déjà passé par applyPreset, au ratio de l'ouverture.
export function renderPolaroid(target, frame, photo, seed) {
  const s = frame.scale;
  const W = frame.W * s, H = frame.H * s;
  target.width = W;
  target.height = H;
  const ctx = target.getContext('2d');

  const ix = frame.img.x * s, iy = frame.img.y * s;
  const iw = frame.img.w * s, ih = frame.img.h * s;

  if (textures[frame.id]) {
    // Cadre réel scanné à fenêtre transparente : la photo est glissée
    // dessous (légèrement débordante pour passer sous les bords doux
    // de la découpe), puis le scan — alpha, ombres, grain — par-dessus.
    ctx.clearRect(0, 0, W, H);
    const pad = 5 * s;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(photo, ix - pad, iy - pad, iw + pad * 2, ih + pad * 2);
    ctx.drawImage(textures[frame.id], 0, 0, W, H);
    return target;
  }

  ctx.drawImage(synthPaper(frame, seed), 0, 0);
  ctx.drawImage(photo, ix, iy, iw, ih);

  // — Embossage de la découpe : le papier surplombe le film.
  // Ombre portée du bord supérieur/gauche sur la photo…
  ctx.save();
  ctx.beginPath();
  ctx.rect(ix, iy, iw, ih);
  ctx.clip();
  for (let i = 0; i < 3; i++) {
    const o = (i + 0.5) * s;
    const a = [0.22, 0.12, 0.05][i];
    ctx.strokeStyle = `rgba(0,0,0,${a})`;
    ctx.lineWidth = s;
    ctx.strokeRect(ix + o, iy + o, iw - o * 2, ih - o * 2);
  }
  const innerTop = ctx.createLinearGradient(0, iy, 0, iy + 12 * s);
  innerTop.addColorStop(0, 'rgba(0,0,0,0.22)');
  innerTop.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = innerTop;
  ctx.fillRect(ix, iy, iw, 12 * s);
  // Reflet du brillant du film.
  const gloss = ctx.createLinearGradient(ix, iy, ix + iw * 0.7, iy + ih);
  gloss.addColorStop(0, 'rgba(255,255,255,0.05)');
  gloss.addColorStop(0.35, 'rgba(255,255,255,0)');
  ctx.fillStyle = gloss;
  ctx.fillRect(ix, iy, iw, ih);
  ctx.restore();

  // …et fin liseré clair juste sous la découpe (bas/droite).
  ctx.strokeStyle = frame.dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.75)';
  ctx.lineWidth = s;
  ctx.beginPath();
  ctx.moveTo(ix - s * 0.5, iy + ih + s * 0.5);
  ctx.lineTo(ix + iw + s * 0.5, iy + ih + s * 0.5);
  ctx.lineTo(ix + iw + s * 0.5, iy - s * 0.5);
  ctx.stroke();

  return target;
}

// Export Instagram 4:5 : polaroid centré, ombre portée, fond blanc ou noir.
export function renderInstagram(polaroidCanvas, dark, seed) {
  const W = 2160, H = 2700;
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const ctx = out.getContext('2d');
  ctx.fillStyle = dark ? '#0c0c0d' : '#ffffff';
  ctx.fillRect(0, 0, W, H);

  const rnd = mulberry32(seed ^ 0x51ab3c);
  const angle = (rnd() * 2 - 1) * 0.028; // ± 1.6°
  const targetH = H * 0.82;
  const scale = Math.min(targetH / polaroidCanvas.height, (W * 0.86) / polaroidCanvas.width);
  const w = polaroidCanvas.width * scale;
  const h = polaroidCanvas.height * scale;

  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(angle);
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 70;
  ctx.shadowOffsetY = 34;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(polaroidCanvas, -w / 2, -h / 2, w, h);
  ctx.restore();
  return out;
}
