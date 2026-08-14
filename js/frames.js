// ── Cadres instantanés : de vrais scans à fenêtre transparente ──
// La photo est composée sous le PNG (alpha, ombres et grain du scan
// par-dessus). Géométries mesurées sur les scans, fidèles aux formats
// réels : Polaroid 600 (88 × 107 mm, image 79 × 79) et Instax Mini
// (54 × 86 mm, image 46 × 62).

export const FRAMES = [
  {
    id: 'p600',
    name: 'Polaroïd-01',
    W: 1541, H: 1860,
    img: { x: 168, y: 156, w: 1221, h: 1294 },
    scale: 1,
    overlay: 'assets/frame-600.png',
    paper: '#f8f6f1',
  },
  {
    id: 'creme',
    name: 'Polaroïd-02',
    W: 552, H: 666,
    img: { x: 36, y: 38, w: 482, h: 498 },
    scale: 2,
    overlay: 'assets/frame-creme.png',
    paper: '#f2f0e4',
  },
  {
    id: 'perfore',
    name: 'Polaroïd-03',
    W: 611, H: 738,
    img: { x: 44, y: 78, w: 525, h: 522 },
    scale: 2,
    overlay: 'assets/frame-perfore.png',
    paper: '#eae6df',
  },
  {
    id: 'froisse',
    name: 'Polaroïd-04',
    W: 1022, H: 1234,
    img: { x: 55, y: 82, w: 903, h: 907 },
    scale: 1.5,
    overlay: 'assets/frame-froisse-2.png',
    paper: '#f7f7f7',
  },
  {
    id: 'patine',
    name: 'Polaroïd-05',
    W: 1056, H: 1275,
    img: { x: 65, y: 71, w: 922, h: 944 },
    scale: 1.5,
    overlay: 'assets/frame-patine-2.png',
    paper: '#f2f1ee',
  },
  {
    id: 'dechire',
    name: 'Polaroïd-06',
    W: 1167, H: 1409,
    img: { x: 43, y: 88, w: 1077, h: 1030 },
    scale: 1.4,
    overlay: 'assets/frame-dechire-2.png',
    paper: '#f6f3ef',
  },
  {
    id: 'polaroid-07',
    name: 'Polaroïd-07',
    W: 1479, H: 1786,
    img: { x: 153, y: 178, w: 1160, h: 1204 },
    scale: 1,
    overlay: 'assets/polaroid-1.png',
    paper: '#f7f6f2',
  },
  {
    id: 'polaroid-08',
    name: 'Polaroïd-08',
    W: 1479, H: 1786,
    img: { x: 173, y: 170, w: 1140, h: 1195 },
    scale: 1,
    overlay: 'assets/polaroid-2.png',
    paper: '#f7f6f2',
  },
  {
    id: 'instax',
    name: 'Instax Mini',
    W: 841, H: 1500,
    img: { x: 51, y: 133, w: 736, h: 1094 },
    scale: 1.5,
    overlay: 'assets/frame-instax2.png',
    paper: '#f8f8f8',
  },
  {
    id: 'instax-creme',
    name: 'Instax Crème',
    W: 804, H: 1250,
    img: { x: 55, y: 106, w: 694, h: 917 },
    scale: 1.6,
    overlay: 'assets/frame-instax-creme-2.png',
    paper: '#f4ecd8',
  },
  {
    id: 'instax-brut',
    name: 'Instax Brut',
    W: 1470, H: 1924,
    img: { x: 243, y: 230, w: 981, h: 1298 },
    scale: 1,
    overlay: 'assets/frame-instax-brut.png',
    paper: '#f6f5f7',
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
    id: 'widev',
    name: 'Wide Vertical',
    W: 1008, H: 1275,
    img: { x: 187, y: 59, w: 739, h: 1176 },
    scale: 1.5,
    overlay: 'assets/frame-widev.png',
    paper: '#fafafa',
  },
  {
    id: 'kodak-neg-160',
    name: 'Kodak Neg 160',
    W: 2016, H: 2400,
    img: { x: 211, y: 160, w: 1627, h: 2124 },
    scale: 0.62,
    overlay: 'assets/kodak-frame-neg-portra160.png',
    paper: '#1a1a1a',
  },
  {
    id: 'kodak-neg-400',
    name: 'Kodak Neg 400',
    W: 1758, H: 2284,
    img: { x: 199, y: 274, w: 1349, h: 1790 },
    scale: 0.66,
    overlay: 'assets/kodak-frame-neg-portra400.png',
    paper: '#1a1a1a',
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
  {
    id: 'kodak',
    name: 'Négatif paysage',
    W: 1430, H: 1029,
    img: { x: 60, y: 40, w: 1322, h: 941 },
    scale: 1.5,
    overlay: 'assets/frame-kodak.png',
    paper: '#0d0d0d',
  },
  {
    id: 'film120',
    name: 'Négatif 120',
    W: 1062, H: 974,
    img: { x: 108, y: 76, w: 842, h: 780 },
    scale: 2,
    overlay: 'assets/frame-120.png',
    paper: '#141414',
  },
  {
    id: 'ekta',
    name: 'Diapo Ekta',
    W: 1400, H: 1400,
    img: { x: 218, y: 380, w: 963, h: 647 },
    scale: 1.3,
    overlay: 'assets/frame-ekta.png',
    paper: '#f2ecd8',
  },
  {
    id: 'kodach',
    name: 'Diapo Kodak',
    W: 1400, H: 1400,
    img: { x: 222, y: 367, w: 962, h: 655 },
    scale: 1.3,
    overlay: 'assets/frame-kodach.png',
    paper: '#f4f2ea',
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
    id: 'papier',
    name: 'Papier',
    W: 1021, H: 1439,
    img: { x: 88, y: 101, w: 838, h: 1233 },
    scale: 1.4,
    overlay: 'assets/frame-papier-2.png',
    paper: '#f3efe6',
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
export function renderPolaroid(target, frame, photo, boost = 1) {
  const s = frame.scale * boost;
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
    const pad = 8 * s;
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
// `opts.bg` (canvas/image) : photo de fond en collage, recadrée « cover ».
export function renderInstagram(polaroidCanvas, dark, opts = {}) {
  const W = 2160, H = 2700;
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const ctx = out.getContext('2d');
  ctx.fillStyle = dark ? '#0c0c0d' : '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // Fond collage : la photo couvre tout le cadre 4:5 sans déformation.
  const bg = opts.bg;
  if (bg && bg.width && bg.height) {
    const cover = Math.max(W / bg.width, H / bg.height);
    const bw = bg.width * cover, bh = bg.height * cover;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bg, (W - bw) / 2, (H - bh) / 2, bw, bh);
  }

  const size = (opts.size ?? 80) / 100;
  const fit = Math.min((W * 0.94) / polaroidCanvas.width, (H * 0.94) / polaroidCanvas.height);
  const scale = fit * size;
  const w = polaroidCanvas.width * scale;
  const h = polaroidCanvas.height * scale;

  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(polaroidCanvas, (W - w) / 2, (H - h) / 2, w, h);
  return out;
}
