// ── Cadres instantanés : de vrais scans à fenêtre transparente ──
// La photo est composée sous le PNG (alpha, ombres et grain du scan
// par-dessus). Géométries mesurées sur les scans, fidèles aux formats
// réels : Polaroid 600 (88 × 107 mm, image 79 × 79) et Instax Mini
// (54 × 86 mm, image 46 × 62).

import { mulberry32 } from './presets.js';

export const FRAMES = [
  {
    id: 'p600',
    name: 'Polaroid 600',
    W: 656, H: 792,
    img: { x: 47, y: 49, w: 568, h: 580 },
    scale: 2,
    overlay: 'assets/frame-600.png',
    paper: '#f8f6f1',
  },
  {
    id: 'instax',
    name: 'Instax Mini',
    W: 606, H: 957,
    img: { x: 46, y: 91, w: 510, h: 684 },
    scale: 2,
    overlay: 'assets/frame-instax.png',
    paper: '#faf9f7',
  },
  {
    id: 'instax-brut',
    name: 'Instax Brut',
    W: 591, H: 891,
    img: { x: 34, y: 78, w: 523, h: 648 },
    scale: 2,
    overlay: 'assets/frame-instax-brut.png',
    paper: '#faf9f7',
  },
  {
    id: 'creme',
    name: 'Crème',
    W: 552, H: 676,
    img: { x: 36, y: 39, w: 482, h: 505 },
    scale: 2,
    overlay: 'assets/frame-creme.png',
    paper: '#f2f0e4',
  },
  {
    id: 'perfore',
    name: 'Perforé',
    W: 611, H: 720,
    img: { x: 44, y: 76, w: 525, h: 509 },
    scale: 2,
    overlay: 'assets/frame-perfore.png',
    paper: '#eae6df',
  },
  {
    id: 'wide',
    name: 'Instax Wide',
    W: 905, H: 711,
    img: { x: 38, y: 66, w: 825, h: 513 },
    scale: 2,
    overlay: 'assets/frame-wide.png',
    paper: '#f8f8f8',
  },
  {
    id: 'rouge',
    name: 'Rouge',
    W: 742, H: 702,
    img: { x: 52, y: 56, w: 634, h: 453 },
    scale: 2,
    overlay: 'assets/frame-rouge.png',
    paper: '#c8453a',
  },
];

/* ── Chargement des scans ── */

const textures = {};
export const assetsReady = Promise.all(
  FRAMES.map(
    (f) =>
      new Promise((res) => {
        const img = new Image();
        img.onload = () => { textures[f.id] = img; res(); };
        img.onerror = res; // repli : papier uni
        img.src = f.overlay;
      })
  )
);

/* ── Composition du polaroid ── */

// `photo` est un canvas déjà passé par applyPreset, au ratio de l'ouverture.
export function renderPolaroid(target, frame, photo) {
  const s = frame.scale;
  const W = frame.W * s, H = frame.H * s;
  target.width = W;
  target.height = H;
  const ctx = target.getContext('2d');

  const ix = frame.img.x * s, iy = frame.img.y * s;
  const iw = frame.img.w * s, ih = frame.img.h * s;

  if (textures[frame.id]) {
    // La photo est glissée sous le scan (légèrement débordante pour
    // passer sous les bords doux de la découpe), le cadre par-dessus.
    ctx.clearRect(0, 0, W, H);
    const pad = 5 * s;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(photo, ix - pad, iy - pad, iw + pad * 2, ih + pad * 2);
    ctx.drawImage(textures[frame.id], 0, 0, W, H);
    return target;
  }

  // Repli si le scan n'a pas pu se charger : papier uni.
  ctx.fillStyle = frame.paper;
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(photo, ix, iy, iw, ih);
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
