// ── Cadres instantanés : de vrais scans à fenêtre transparente ──
// La photo est composée sous le PNG (alpha, ombres et grain du scan
// par-dessus). Géométries mesurées sur les scans, fidèles aux formats
// réels : Polaroid 600 (88 × 107 mm, image 79 × 79) et Instax Mini
// (54 × 86 mm, image 46 × 62).

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
  {
    id: 'film120',
    name: 'Film 120',
    W: 1062, H: 974,
    img: { x: 108, y: 76, w: 842, h: 780 },
    scale: 2,
    overlay: 'assets/frame-120.png',
    paper: '#141414',
  },
  {
    id: 'kodak',
    name: 'Kodak',
    W: 1430, H: 1029,
    img: { x: 60, y: 40, w: 1322, h: 941 },
    scale: 1.5,
    overlay: 'assets/frame-kodak.png',
    paper: '#0d0d0d',
  },
  {
    id: 'negatif',
    name: 'Négatif',
    W: 836, H: 1161,
    img: { x: 24, y: 64, w: 772, h: 1030 },
    scale: 2,
    overlay: 'assets/frame-negatif.png',
    paper: '#101010',
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

// Export Instagram 4:5 : polaroid droit, centré, fond blanc ou noir.
// `opts.size` (40–100) : taille homogène du tirage dans le canevas.
export function renderInstagram(polaroidCanvas, dark, opts = {}) {
  const W = 2160, H = 2700;
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const ctx = out.getContext('2d');
  ctx.fillStyle = dark ? '#0c0c0d' : '#ffffff';
  ctx.fillRect(0, 0, W, H);

  const size = (opts.size ?? 80) / 100;
  const fit = Math.min((W * 0.94) / polaroidCanvas.width, (H * 0.94) / polaroidCanvas.height);
  const scale = fit * size;
  const w = polaroidCanvas.width * scale;
  const h = polaroidCanvas.height * scale;

  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(polaroidCanvas, (W - w) / 2, (H - h) / 2, w, h);
  return out;
}
