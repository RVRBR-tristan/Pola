import { PRESETS, applyPreset, applyLightLeak } from './presets.js';
import { FRAMES, renderPolaroid, renderInstagram, assetsReady } from './frames.js';
import { putShot, getShot, getAllShots, deleteShots } from './store.js';

const $ = (id) => document.getElementById(id);

const state = {
  source: null,          // canvas plein format de la prise de vue
  sourceBlob: null,      // même image en blob JPEG, pour la galerie
  currentId: null,       // entrée de galerie en cours d'édition
  createdAt: 0,
  fromGallery: false,    // le retour de l'éditeur mène-t-il à la galerie ?
  preset: PRESETS[0],
  frame: FRAMES[0],
  expo: 0,       // -100..100 → ± 1,2 EV
  contrast: 0,   // -100..100 → ± 0,75
  sat: 82,       // 0..160 → saturation absolue (init. sur le film)
  grain: 18,     // 0..100 → alpha 0..0,4 (init. sur le film)
  blur: 0,       // 0..100 → flou radial
  vignette: 26,  // 0..100 → intensité du vignettage (init. sur le film)
  igSize: 0,     // fond 4:5 : 0 = désactivé, 1..100 = taille du polaroid
  igDark: false, // fond 4:5 : blanc ou noir
  igBg: null,    // fond 4:5 en collage : canvas décodé (mémoire)
  igBgBlob: null, // même fond, blob JPEG persisté dans la galerie
  dbl: 0,        // double exposition : 0 = désactivé, 1..100 = intensité
  dblMode: 'screen', // fusion : screen (éclaircir) / multiply / source-over
  dblImg: null,  // 2e image décodée (mémoire)
  dblBlob: null, // même image, blob JPEG persisté
  leak: 0,       // light leak : 0 = désactivé, 1..100 = intensité
  leakSeed: 1,
  zoom: 100,     // recadrage : 100..300 %
  rot: 0,        // redressement : -45..45°
  cropX: 0,      // déplacement du cadrage, -1..1 de la marge disponible
  cropY: 0,
  format: 'polaroid',
  seed: 1,
  facing: 'environment',
  flash: false,
  stream: null,
};

const video = $('camera');
const renderCanvas = $('render-canvas');
// Rendu du polaroid seul, hors écran ; l'aperçu affiché dépend du format.
const polaroidCanvas = document.createElement('canvas');

/* ── Caméra ─────────────────────────────────────────────── */

// Jeton de génération : deux démarrages peuvent se chevaucher (retour de
// l'éditeur + visibilitychange). Sans ce garde-fou, l'appel perdant
// affichait « caméra indisponible » par-dessus le flux de celui qui
// avait réussi.
let camGen = 0;
async function startCamera() {
  const gen = ++camGen;
  stopCamera();
  try {
    // Capture pleine hauteur du capteur, format portrait 9:16 le plus grand
    // possible : on garde tout le cadrage, le recadrage se fait ensuite dans
    // Réglages (zoom / rotation / déplacement).
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: state.facing,
        width: { ideal: 2160 },
        height: { ideal: 3840 },
        aspectRatio: { ideal: 9 / 16 },
      },
      audio: false,
    });
    if (gen !== camGen) {
      // Un démarrage plus récent a pris la main : on libère ce flux.
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    state.stream = stream;
    video.srcObject = stream;
    video.classList.toggle('is-mirrored', state.facing === 'user');
    $('camera-off').hidden = true;
    $('btn-shutter').disabled = false;
  } catch {
    if (gen !== camGen || state.stream) return; // un flux actif existe déjà
    $('camera-off').hidden = false;
    $('btn-shutter').disabled = true;
  }
}

function stopCamera() {
  if (state.stream) {
    state.stream.getTracks().forEach((t) => t.stop());
    state.stream = null;
  }
}

/* ── Mise au point au tap ───────────────────────────────── */

// Convertit un tap dans la fenêtre du viseur en coordonnées normalisées
// de l'image capteur (la vidéo remplit la fenêtre en « cover », et la
// caméra avant est affichée en miroir).
function tapToVideoCoords(e) {
  const rect = $('live-window').getBoundingClientRect();
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh || !rect.width) return null;
  let px = (e.clientX - rect.left) / rect.width;
  let py = (e.clientY - rect.top) / rect.height;
  if (state.facing === 'user') px = 1 - px;
  const winRatio = rect.width / rect.height;
  const vidRatio = vw / vh;
  if (vidRatio > winRatio) {
    const visible = winRatio / vidRatio; // fraction de largeur visible
    px = (1 - visible) / 2 + px * visible;
  } else {
    const visible = vidRatio / winRatio;
    py = (1 - visible) / 2 + py * visible;
  }
  return { x: Math.min(1, Math.max(0, px)), y: Math.min(1, Math.max(0, py)) };
}

let refocusTimer;
async function focusAt(pt) {
  const track = state.stream?.getVideoTracks()[0];
  if (!track || !track.getCapabilities) return;
  const caps = track.getCapabilities();
  const modes = caps.focusMode || [];
  const adv = { pointsOfInterest: [{ x: pt.x, y: pt.y }] };
  if (modes.includes('single-shot')) adv.focusMode = 'single-shot';
  try {
    await track.applyConstraints({ advanced: [adv] });
  } catch { /* capacité absente : le focus continu natif reste actif */ }
  // Retour au suivi continu après la mise au point ponctuelle.
  if (modes.includes('continuous')) {
    clearTimeout(refocusTimer);
    refocusTimer = setTimeout(() => {
      track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
    }, 4000);
  }
}

// Anneau de mise au point, comme la caméra native.
function showFocusRing(e) {
  const win = $('live-window');
  const rect = win.getBoundingClientRect();
  const ring = document.createElement('div');
  ring.className = 'focus-ring';
  ring.style.left = `${e.clientX - rect.left}px`;
  ring.style.top = `${e.clientY - rect.top}px`;
  win.appendChild(ring);
  ring.addEventListener('animationend', () => ring.remove(), { once: true });
}

// Taper le viseur déclenche la capture (alternative au bouton) ; un appui
// long vise plutôt la mise au point à cet endroit. Un glissement (défilement
// involontaire) n'entraîne rien.
let lwPress = null;
$('live-window').addEventListener('pointerdown', (e) => {
  if (!state.stream || $('btn-shutter').disabled) return;
  lwPress = { x: e.clientX, y: e.clientY, focused: false, ev: e };
  lwPress.timer = setTimeout(() => {
    lwPress.focused = true; // appui long → mise au point ponctuelle
    const pt = tapToVideoCoords(e);
    if (pt) { showFocusRing(e); focusAt(pt); navigator.vibrate?.(8); }
  }, 450);
});
$('live-window').addEventListener('pointermove', (e) => {
  if (!lwPress) return;
  if (Math.abs(e.clientX - lwPress.x) + Math.abs(e.clientY - lwPress.y) > 12) {
    clearTimeout(lwPress.timer);
    lwPress = null;
  }
});
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
  $('live-window').addEventListener(ev, () => {
    if (!lwPress) return;
    clearTimeout(lwPress.timer);
    const wasFocus = lwPress.focused;
    lwPress = null;
    if (ev === 'pointerup' && !wasFocus) triggerShutter(); // tap bref → capture
  });
}

/* ── Capture & import ───────────────────────────────────── */

function captureFromVideo() {
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh) return null;
  const c = document.createElement('canvas');
  c.width = vw;
  c.height = vh;
  const ctx = c.getContext('2d');
  if (state.facing === 'user') {
    ctx.translate(vw, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0);
  return c;
}

function sourceFromImage(imgEl) {
  const max = 3840;
  const k = Math.min(1, max / Math.max(imgEl.naturalWidth, imgEl.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(imgEl.naturalWidth * k);
  c.height = Math.round(imgEl.naturalHeight * k);
  c.getContext('2d').drawImage(imgEl, 0, 0, c.width, c.height);
  return c;
}

/* ── Pipeline de rendu ──────────────────────────────────── */

// Recadrage centré de la source au ratio de l'ouverture du cadre.
// `sf` < 1 : version réduite pour l'aperçu rapide pendant un glissement.
function cropToOpening(source, frame, sf = 1, st = state) {
  const { w, h } = frame.img;
  const outW = Math.round(w * frame.scale * sf), outH = Math.round(h * frame.scale * sf);
  const c = document.createElement('canvas');
  c.width = outW;
  c.height = outH;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  // Recadrage : zoom, redressement et déplacement. L'échelle de base
  // couvre la fenêtre même une fois pivotée (pas de coins vides).
  const rot = (st.rot * Math.PI) / 180;
  const zoom = st.zoom / 100;
  const cos = Math.abs(Math.cos(rot)), sin = Math.abs(Math.sin(rot));
  const needW = outW * cos + outH * sin;
  const needH = outW * sin + outH * cos;
  const s = Math.max(needW / source.width, needH / source.height) * zoom;
  const slackX = Math.max(0, (source.width - needW / s) / 2);
  const slackY = Math.max(0, (source.height - needH / s) / 2);
  ctx.translate(outW / 2, outH / 2);
  ctx.rotate(rot);
  ctx.scale(s, s);
  ctx.drawImage(
    source,
    -source.width / 2 + st.cropX * slackX,
    -source.height / 2 + st.cropY * slackY
  );
  // Réinitialise la transformation : les passes suivantes (douceur,
  // halation, grain) dessinent en coordonnées écran.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return c;
}

function currentAdjust(st = state) {
  return {
    expo: (st.expo / 100) * 1.2,
    contrast: (st.contrast / 100) * 0.75,
    sat: st.sat / 100,
    grain: st.grain / 250,
    blur: st.blur / 100,
    vignette: st.vignette / 100,
  };
}

// Rendu : `fast` = aperçu réduit pendant un glissement de curseur ;
// un rendu plein res demandé pendant la file l'emporte toujours.
let renderQueued = false;
let wantFull = false;
async function render(fast = false) {
  if (!state.source) return;
  if (!fast) wantFull = true;
  if (renderQueued) return;
  renderQueued = true;
  await assetsReady;
  // setTimeout plutôt que requestAnimationFrame : rAF est suspendu
  // quand l'onglet est en arrière-plan et le rendu ne se ferait jamais.
  setTimeout(() => {
    renderQueued = false;
    const full = wantFull;
    wantFull = false;
    const photo = cropToOpening(state.source, state.frame, full ? 1 : 0.35);
    applyDouble(photo, state.dblImg, state.dbl, state.dblMode);
    applyPreset(photo, state.preset, state.seed, currentAdjust());
    if (state.leak > 0) applyLightLeak(photo, state.leakSeed, state.leak / 100);
    renderPolaroid(polaroidCanvas, state.frame, photo);
    updateDisplay();
    if (full) schedulePersist();
  }, 0);
}

// Double exposition : mélange une seconde image dans le canvas photo
// (recadrée « cover »), AVANT le rendu film pour un traitement unifié.
// `mode` : 'screen' (éclaircir), 'multiply' (assombrir) ou 'source-over'.
function applyDouble(photo, img, intensity, mode) {
  if (!img || !intensity) return;
  const ctx = photo.getContext('2d');
  const cover = Math.max(photo.width / img.width, photo.height / img.height);
  const w = img.width * cover, h = img.height * cover;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, intensity / 100));
  ctx.globalCompositeOperation = mode || 'screen';
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, (photo.width - w) / 2, (photo.height - h) / 2, w, h);
  ctx.restore();
}

// Rendu plein res immédiat (attendu) : sert à la navigation par swipe, où
// il faut que l'aperçu soit prêt AVANT de lancer l'animation (aucun calcul
// lourd pendant le glissement). Ne planifie pas de persistance.
async function renderSync() {
  if (!state.source) return;
  await assetsReady;
  const photo = cropToOpening(state.source, state.frame, 1);
  applyDouble(photo, state.dblImg, state.dbl, state.dblMode);
  applyPreset(photo, state.preset, state.seed, currentAdjust());
  if (state.leak > 0) applyLightLeak(photo, state.leakSeed, state.leak / 100);
  renderPolaroid(polaroidCanvas, state.frame, photo);
  updateDisplay();
}

// L'aperçu montre exactement ce qui sera téléchargé : le polaroid seul,
// ou sa mise en page 4:5 (fond blanc ou noir) prête pour Instagram.
function updateDisplay() {
  const ctx = renderCanvas.getContext('2d');
  if (state.format === 'polaroid') {
    renderCanvas.width = polaroidCanvas.width;
    renderCanvas.height = polaroidCanvas.height;
    ctx.clearRect(0, 0, renderCanvas.width, renderCanvas.height);
    ctx.drawImage(polaroidCanvas, 0, 0);
  } else {
    const out = renderInstagram(polaroidCanvas, state.igDark, { size: state.igSize, bg: state.igBg });
    renderCanvas.width = out.width;
    renderCanvas.height = out.height;
    ctx.drawImage(out, 0, 0);
  }
  $('polaroid-out').style.setProperty(
    '--out-ratio',
    (renderCanvas.width / renderCanvas.height).toFixed(4)
  );
  syncIgBgControls();
  positionDevOverlay();
}

// Le « + » d'ajout de fond n'apparaît qu'en mode 4:5 ; le « × » de retrait
// seulement quand une photo de fond est posée.
function syncIgBgControls() {
  const on = state.format !== 'polaroid';
  $('ig-bg-controls').hidden = !on;
  $('ig-bg-remove').hidden = !state.igBg;
}

// L'overlay de développement couvre exactement l'ouverture image
// (uniquement en vue polaroid ; en 4:5 le tirage est incliné).
function positionDevOverlay() {
  const o = $('dev-overlay');
  const f = state.frame;
  o.style.display = state.format === 'polaroid' ? '' : 'none';
  o.style.left = `${(f.img.x / f.W) * 100}%`;
  o.style.top = `${(f.img.y / f.H) * 100}%`;
  o.style.width = `${(f.img.w / f.W) * 100}%`;
  o.style.height = `${(f.img.h / f.H) * 100}%`;
}

function develop() {
  const o = $('dev-overlay');
  o.hidden = false;
  o.style.animation = 'none';
  void o.offsetWidth; // relance l'animation
  o.style.animation = '';
  o.addEventListener('animationend', () => { o.hidden = true; }, { once: true });
}

/* ── Galerie : persistance ──────────────────────────────── */

let persistTimer;
let dirty = false; // des réglages non enregistrés attendent-ils ?
function schedulePersist() {
  if (!state.currentId) return;
  dirty = true;
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persistCurrent, 700);
}

async function persistCurrent() {
  if (!state.currentId || !state.sourceBlob) return;
  dirty = false;
  // Capture ATOMIQUE (avant tout await) : id, source, réglages et vignette
  // doivent tous correspondre au MÊME tirage. Sinon, si l'état bascule sur
  // une autre photo pendant l'encodage async de la vignette, on écrivait une
  // entrée avec la vignette (donc le cadre) d'un autre tirage.
  const shot = {
    id: state.currentId,
    createdAt: state.createdAt,
    updatedAt: Date.now(),
    source: state.sourceBlob,
    settings: {
      presetId: state.preset.id,
      frameId: state.frame.id,
      expo: state.expo,
      contrast: state.contrast,
      sat: state.sat,
      grain: state.grain,
      blur: state.blur,
      vignette: state.vignette,
      leak: state.leak,
      leakSeed: state.leakSeed,
      igSize: state.igSize,
      igDark: state.igDark,
      igBg: state.igBgBlob || null,
      dbl: state.dbl,
      dblMode: state.dblMode,
      dblBg: state.dblBlob || null,
      format: state.format,
      zoom: state.zoom,
      rot: state.rot,
      cropX: state.cropX,
      cropY: state.cropY,
      seed: state.seed,
    },
  };
  // makeThumb() capture polaroidCanvas de façon synchrone à l'appel — donc
  // cohérent avec `shot` ci-dessus (aucun await intercalé).
  shot.thumb = await makeThumb();
  await putShot(shot).catch(() => {});
}

function makeThumb() {
  const max = 420;
  const k = Math.min(1, max / Math.max(polaroidCanvas.width, polaroidCanvas.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(polaroidCanvas.width * k));
  c.height = Math.max(1, Math.round(polaroidCanvas.height * k));
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(polaroidCanvas, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob(res, 'image/png'));
}

// Restaure les réglages d'une entrée de galerie dans toute l'interface.
function applySettings(s) {
  state.preset = PRESETS.find((p) => p.id === s.presetId) || PRESETS[0];
  state.frame = FRAMES.find((f) => f.id === s.frameId) || FRAMES[0];
  state.seed = s.seed || state.seed;
  buildChips($('film-strip'), PRESETS, state.preset, pickPreset);
  buildChips($('edit-film-strip'), PRESETS, state.preset, pickPreset);
  buildChips($('frame-strip'), FRAMES, state.frame, pickFrame);
  buildChips($('shoot-frame-strip'), FRAMES, state.frame, pickFrame);
  syncPresetUi();
  updateLiveFrame();
  setAdjust('expo', s.expo || 0);
  setAdjust('contrast', s.contrast || 0);
  setAdjust('sat', s.sat ?? adjustDefault('sat'));
  setAdjust('grain', s.grain ?? adjustDefault('grain'));
  setAdjust('blur', s.blur || 0);
  setAdjust('vignette', s.vignette ?? adjustDefault('vignette'));
  state.igSize = s.igSize ?? 80;
  const igOn = s.format && s.format !== 'polaroid';
  state.igDark = !!s.igDark || s.format === 'ig-noir';
  state.igSize = snapIgSize(igOn ? (s.igSize ?? 80) : 0);
  state.format = igOn ? (state.igDark ? 'ig-noir' : 'ig-blanc') : 'polaroid';
  $('sw-blanc').classList.toggle('is-on', !state.igDark);
  $('sw-blanc').setAttribute('aria-checked', String(!state.igDark));
  $('sw-noir').classList.toggle('is-on', state.igDark);
  $('sw-noir').setAttribute('aria-checked', String(state.igDark));
  $('adj-size').value = IG_SIZES.indexOf(state.igSize);
  $('adj-size-val').textContent = String(state.igSize);
  // Fond 4:5 en collage : on garde le blob, on décode l'image en arrière-plan.
  state.igBgBlob = s.igBg || null;
  state.igBg = null;
  if (state.igBgBlob) {
    const blob = state.igBgBlob;
    blobToCanvas(blob).then((c) => {
      if (state.igBgBlob === blob) { state.igBg = c; render(); }
    }).catch(() => {});
  }
  // Double exposition : on garde le blob, on décode l'image en arrière-plan.
  state.dbl = s.dbl || 0;
  state.dblMode = s.dblMode || 'screen';
  state.dblBlob = state.dbl > 0 ? (s.dblBg || null) : null;
  state.dblImg = null;
  if (state.dblBlob) {
    const dblob = state.dblBlob;
    blobToCanvas(dblob).then((c) => {
      if (state.dblBlob === dblob) { state.dblImg = c; render(); }
    }).catch(() => {});
  }
  syncDoubleControls();
  setAdjust('leak', s.leak ?? 0);
  state.leakSeed = s.leakSeed ?? state.leakSeed;
  setAdjust('zoom', s.zoom ?? 100);
  setAdjust('rot', s.rot ?? 0);
  state.cropX = s.cropX || 0;
  state.cropY = s.cropY || 0;
}

/* ── Navigation ─────────────────────────────────────────── */

function showScreen(id) {
  for (const s of ['shoot', 'edit', 'gallery']) $(s).classList.toggle('is-active', s === id);
}

function canvasJpeg(c) {
  return new Promise((res) => c.toBlob(res, 'image/jpeg', 0.92));
}

// Nouvelle photo (capture ou import) : nouvelle entrée de galerie.
async function showEditor(source, overlay = null) {
  state.source = source;
  state.seed = (Math.random() * 0xffffffff) >>> 0;
  state.currentId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  state.createdAt = Date.now();
  state.fromGallery = false;
  setAdjust('expo', 0);
  setAdjust('contrast', 0);
  setAdjust('blur', 0);
  setAdjust('leak', 0);
  state.leakSeed = (Math.random() * 0xffffffff) >>> 0;
  setAdjust('zoom', 100);
  setAdjust('rot', 0);
  state.cropX = 0;
  state.cropY = 0;
  state.igBg = null;
  state.igBgBlob = null;
  state.dbl = 0;
  state.dblMode = 'screen';
  state.dblImg = null;
  state.dblBlob = null;
  // Double exposition à la capture : la 2e photo devient le calque superposé.
  if (overlay) {
    state.dblImg = overlay;
    state.dblBlob = await canvasJpeg(overlay);
    state.dbl = 70;
  }
  syncDoubleControls();
  disarmDelete();
  resetAdjustsForPreset();
  if (overlay) { showNav('reglages'); openControl('double'); } // ouvre le menu double expo
  else showNav('films');
  stopCamera();
  showScreen('edit');
  render().then(develop);
  state.sourceBlob = await canvasJpeg(source);
  schedulePersist();
  loadEditNav();
}

// Décode le blob source d'un tirage en canvas plein format.
function loadImageCanvas(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      resolve(c);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image illisible')); };
    img.src = url;
  });
}

// Installe un tirage conservé dans l'état de l'éditeur (sans rendu).
function applyShot(shot, sourceCanvas) {
  state.source = sourceCanvas;
  state.sourceBlob = shot.source;
  state.currentId = shot.id;
  state.createdAt = shot.createdAt;
  state.fromGallery = true;
  dirty = false;
  disarmDelete();
  applySettings(shot.settings || {});
  showNav('films');
  stopCamera();
  showScreen('edit');
}

// Réédition d'un polaroid conservé.
function openShot(shot) {
  return loadImageCanvas(shot.source)
    .then((c) => { applyShot(shot, c); render(); })
    .catch(() => {});
}

// Navigation entre photos par swipe sur l'aperçu, en édition : on tient à
// jour l'ordre de la galerie (plus récent d'abord) au moment d'entrer dans
// l'éditeur, puis on passe d'un id à l'autre sans repasser par la galerie.
let editNavIds = [];
async function loadEditNav() {
  try {
    const shots = await getAllShots();
    shots.sort((a, b) => b.createdAt - a.createdAt);
    editNavIds = shots.map((s) => s.id);
  } catch { editNavIds = []; }
}

let editNavBusy = false;

// Retour en place de l'aperçu (swipe annulé ou bord de liste).
function snapBackPreview() {
  const el = $('polaroid-out');
  el.style.transition = 'transform 180ms ease-out';
  el.style.transform = '';
  el.addEventListener('transitionend', () => { el.style.transition = ''; }, { once: true });
}

// Instantané (résolution d'affichage) de l'aperçu courant, en <img> centré,
// positionné dans la scène par rapport au rectangle donné.
function makeGhost(rect, stageRect) {
  const dispW = Math.min(renderCanvas.width, Math.max(1, Math.ceil(rect.width * (window.devicePixelRatio || 1))));
  const scale = dispW / renderCanvas.width;
  const snap = document.createElement('canvas');
  snap.width = dispW;
  snap.height = Math.max(1, Math.round(renderCanvas.height * scale));
  snap.getContext('2d').drawImage(renderCanvas, 0, 0, snap.width, snap.height);
  const g = document.createElement('img');
  g.className = 'swipe-ghost';
  g.src = snap.toDataURL('image/png');
  g.style.width = `${rect.width}px`;
  g.style.left = `${rect.left - stageRect.left + rect.width / 2}px`;
  g.style.top = `${rect.top - stageRect.top + rect.height / 2}px`;
  return g;
}

// Navigation avec vrai glissement, fluide : on fige la photo sortante et la
// nouvelle en deux instantanés bitmap, puis on ne fait glisser QUE ces
// bitmaps (composition GPU, aucun calcul lourd pendant l'animation). Le
// rendu de la nouvelle photo est terminé AVANT de lancer le glissement.
async function navigateEdit(dir) {
  if (editNavBusy || !state.currentId) return;
  const el = $('polaroid-out');
  const i = editNavIds.indexOf(state.currentId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= editNavIds.length) { snapBackPreview(); return; }
  editNavBusy = true;

  const stage = el.parentElement;
  const stageRect = stage.getBoundingClientRect();

  // 1 — instantané de la photo sortante, là où elle se trouve (glissement
  //     en cours inclus), puis on masque l'aperçu réel (layout conservé).
  const ghostOut = makeGhost(el.getBoundingClientRect(), stageRect);
  stage.appendChild(ghostOut);
  el.style.transition = 'none';
  el.style.transform = '';
  el.style.visibility = 'hidden';

  const fail = () => {
    ghostOut.remove();
    el.style.visibility = ''; el.style.transition = ''; el.style.transform = '';
    editNavBusy = false;
  };

  // 2 — enregistre si nécessaire, charge et REND la nouvelle photo à fond.
  if (dirty) { clearTimeout(persistTimer); await persistCurrent(); }
  const shot = await getShot(editNavIds[j]).catch(() => null);
  if (!shot) return fail();
  let src;
  try { src = await loadImageCanvas(shot.source); } catch { return fail(); }
  applyShot(shot, src);
  await renderSync();

  // 3 — instantané de la nouvelle photo (aperçu masqué, mais bitmap prêt).
  const ghostIn = makeGhost(el.getBoundingClientRect(), stageRect);
  stage.appendChild(ghostIn);

  // 4 — glissement des deux bitmaps uniquement.
  const W = stageRect.width + 40;
  ghostIn.style.transform = `translate(-50%, -50%) translateX(${dir > 0 ? W : -W}px)`;
  void ghostIn.offsetWidth; // reflow avant transition
  const ease = 'transform 340ms cubic-bezier(0.33, 0, 0.2, 1)';
  ghostOut.style.transition = ease;
  ghostIn.style.transition = ease;
  ghostOut.style.transform = `translate(-50%, -50%) translateX(${dir > 0 ? -W : W}px)`;
  ghostIn.style.transform = 'translate(-50%, -50%) translateX(0px)';

  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    ghostOut.remove();
    ghostIn.remove();
    el.style.visibility = ''; el.style.transition = ''; el.style.transform = '';
    editNavBusy = false;
  };
  ghostIn.addEventListener('transitionend', cleanup, { once: true });
  setTimeout(cleanup, 560); // filet de sécurité si transitionend manque
}

function showShoot() {
  showScreen('shoot');
  startCamera();
}

/* ── Sélecteurs (film, cadre) ───────────────────────────── */

function buildChips(container, items, current, onPick) {
  container.textContent = '';
  for (const item of items) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = item.name;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(item === current));
    b.addEventListener('click', () => {
      container.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-checked', 'false'));
      b.setAttribute('aria-checked', 'true');
      onPick(item);
    });
    container.appendChild(b);
  }
}

function syncPresetUi() {
  video.style.filter = state.preset.css === 'none' ? '' : state.preset.css;
  $('film-label').textContent = state.preset.name;
  $('edit-film-label').textContent = `${state.preset.name} · ${state.frame.name}`;
}

function pickPreset(p) {
  state.preset = p;
  syncPresetUi();
  buildChips($('film-strip'), PRESETS, p, pickPreset);
  buildChips($('edit-film-strip'), PRESETS, p, pickPreset);
  resetAdjustsForPreset();
  render();
}

function pickFrame(f) {
  state.frame = f;
  syncPresetUi();
  buildChips($('shoot-frame-strip'), FRAMES, f, pickFrame);
  buildChips($('frame-strip'), FRAMES, f, pickFrame);
  updateLiveFrame();
  render();
}

// Le viseur épouse le cadre choisi : vidéo sous le scan, dans sa fenêtre.
function updateLiveFrame() {
  const f = state.frame;
  $('live-frame').src = f.overlay;
  $('polaroid-live').style.setProperty('--frame-ratio', (f.W / f.H).toFixed(4));
  const w = $('live-window');
  w.style.left = `${(f.img.x / f.W) * 100}%`;
  w.style.top = `${(f.img.y / f.H) * 100}%`;
  w.style.width = `${(f.img.w / f.W) * 100}%`;
  w.style.height = `${(f.img.h / f.H) * 100}%`;
}

/* ── Export ─────────────────────────────────────────────── */

// Facteur de sur-échantillonnage à l'export : vise ~2400 px de grand
// côté. La photo est re-rendue depuis la source pleine résolution (nette) ;
// seul le papier du cadre est interpolé.
function exportBoost(frame) {
  return Math.min(3, Math.max(1, 2400 / (Math.max(frame.W, frame.H) * frame.scale)));
}

function toBlob(canvas) {
  return new Promise((res) => canvas.toBlob(res, 'image/png'));
}

function stampDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function stamp() {
  return stampDate(new Date());
}

// Jeton court et unique par photo exportée : garantit des noms de fichiers
// distincts (aucun écrasement dans Téléchargements), même en ré-exportant
// la même photo ou plusieurs prises de la même seconde. Combine un compteur
// de session, l'horloge (ms) et un aléa.
let exportSeq = 0;
function exportTag() {
  exportSeq += 1;
  const t = Date.now().toString(36);
  const r = Math.floor(Math.random() * 1e6).toString(36);
  return `${t}${exportSeq.toString(36)}${r}`;
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

let downloadBusy = false;
async function download() {
  if (downloadBusy || !state.source) return;
  downloadBusy = true;
  const btn = $('btn-download');
  btn.classList.remove('is-done');
  btn.classList.add('is-busy'); // retour visuel immédiat (spinner)
  // Laisse le navigateur peindre l'état occupé AVANT le rendu plein res
  // (sinon le calcul lourd bloque le fil et le spinner n'apparaît qu'après).
  await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
  try {
    const outputs = await renderExports(state.source, state);
    await downloadOutputs(outputs, `pola-${stamp()}-${exportTag()}`);
    btn.classList.add('is-done');
    setTimeout(() => btn.classList.remove('is-done'), 1400);
  } finally {
    btn.classList.remove('is-busy');
    downloadBusy = false;
  }
}

/* ── Écouteurs ──────────────────────────────────────────── */

// Torche matérielle (Android) ; sinon repli : flash d'écran.
async function setTorch(on) {
  const track = state.stream?.getVideoTracks()[0];
  if (!track || !track.getCapabilities) return false;
  try {
    if (!track.getCapabilities().torch) return false;
    await track.applyConstraints({ advanced: [{ torch: on }] });
    return true;
  } catch {
    return false;
  }
}

$('btn-flash').addEventListener('click', () => {
  state.flash = !state.flash;
  $('btn-flash').classList.toggle('is-on', state.flash);
  $('btn-flash').setAttribute('aria-pressed', String(state.flash));
});

let capturing = false;
async function triggerShutter() {
  if (capturing) return;
  capturing = true;
  const flash = $('flash');
  let source;
  if (state.flash) {
    const torchOk = await setTorch(true);
    if (!torchOk) {
      // Flash d'écran : plein blanc pendant la capture (selfies).
      flash.style.transition = 'none';
      flash.style.opacity = '1';
    }
    await new Promise((r) => setTimeout(r, torchOk ? 320 : 240));
    source = captureFromVideo();
    if (torchOk) setTorch(false);
    else {
      flash.style.opacity = '';
      flash.style.transition = '';
    }
  } else {
    source = captureFromVideo();
  }
  capturing = false;
  if (!source) return;
  flash.classList.remove('is-firing');
  void flash.offsetWidth;
  flash.classList.add('is-firing');
  // Mode double exposition à la capture : la 1re photo est mise en attente
  // (calque fantôme d'alignement), la 2e assemble et ouvre l'éditeur.
  if (dblCaptureMode) {
    if (!dblPendingBase) {
      dblPendingBase = source;
      const g = $('dbl-live-ghost');
      const url = URL.createObjectURL(await canvasJpeg(source));
      if (g.dataset.url) URL.revokeObjectURL(g.dataset.url);
      g.dataset.url = url;
      g.src = url;
      g.hidden = false;
      $('dbl-hint').hidden = false;
      return;
    }
    const base = dblPendingBase;
    clearDblCapture();
    showEditor(base, source); // base = 1re photo, calque = 2e
    return;
  }
  showEditor(source);
}
$('btn-shutter').addEventListener('click', triggerShutter);

/* ── Double exposition à la capture ── */
let dblCaptureMode = false;
let dblPendingBase = null;

function clearDblCapture() {
  dblPendingBase = null;
  const g = $('dbl-live-ghost');
  if (g.dataset.url) { URL.revokeObjectURL(g.dataset.url); delete g.dataset.url; }
  g.hidden = true;
  g.removeAttribute('src');
  $('dbl-hint').hidden = true;
}

$('btn-dbl-mode').addEventListener('click', () => {
  dblCaptureMode = !dblCaptureMode;
  $('btn-dbl-mode').classList.toggle('is-on', dblCaptureMode);
  $('btn-dbl-mode').setAttribute('aria-pressed', String(dblCaptureMode));
  if (!dblCaptureMode) clearDblCapture();
});

// Déclencheur matériel : bouton de volume (télécommandes Bluetooth /
// perches à selfie qui émettent Volume ±) et touches usuelles (Entrée,
// Espace) pour les accessoires et le bureau. Actif seulement sur l'écran
// de prise de vue, caméra prête, et hors champ de saisie.
// NB : sur Android, Chrome intercepte lui-même le bouton de volume
// physique du téléphone et ne le transmet pas à la page — ce déclencheur
// répond donc aux accessoires, pas nécessairement au bipeur intégré.
const SHUTTER_KEYS = new Set([
  'AudioVolumeUp', 'AudioVolumeDown', 'VolumeUp', 'VolumeDown',
  'Enter', ' ', 'Spacebar',
]);
window.addEventListener('keydown', (e) => {
  if (e.repeat || !SHUTTER_KEYS.has(e.key)) return;
  if (!$('shoot').classList.contains('is-active')) return;
  if ($('btn-shutter').disabled) return;
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  e.preventDefault();
  triggerShutter();
});

$('btn-flip').addEventListener('click', () => {
  state.facing = state.facing === 'environment' ? 'user' : 'environment';
  startCamera();
});

$('btn-import').addEventListener('click', () => $('file-input').click());
$('file-input').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  clearDblCapture(); // un import n'entre pas dans la capture double
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    showEditor(sourceFromImage(img));
    URL.revokeObjectURL(url);
  };
  img.src = url;
  e.target.value = '';
});

$('btn-back').addEventListener('click', async () => {
  clearTimeout(persistTimer);
  await persistCurrent(); // termine l'écriture avant de rafraîchir la galerie
  if (state.fromGallery) showGallery();
  else showShoot();
});

/* ── Galerie : affichage & sélection ────────────────────── */

const gallerySel = new Set();
let selecting = false;
let galleryUrls = [];

async function showGallery() {
  stopCamera();
  clearDblCapture();
  exitSelection();
  showScreen('gallery');
  await refreshGallery();
}

async function refreshGallery() {
  const grid = $('gallery-grid');
  for (const u of galleryUrls) URL.revokeObjectURL(u);
  galleryUrls = [];
  grid.textContent = '';
  let shots = [];
  try { shots = await getAllShots(); } catch { /* stockage indisponible */ }
  shots.sort((a, b) => b.createdAt - a.createdAt);
  $('gallery-empty').hidden = shots.length > 0;
  $('btn-select').hidden = shots.length === 0;
  for (const shot of shots) {
    const b = document.createElement('button');
    b.className = 'g-item';
    b.setAttribute('role', 'listitem');
    b.dataset.id = shot.id;
    const img = new Image();
    const url = URL.createObjectURL(shot.thumb || shot.source);
    galleryUrls.push(url);
    img.src = url;
    img.alt = 'Polaroid';
    b.appendChild(img);
    const check = document.createElement('span');
    check.className = 'g-check';
    check.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9.6 16.2 5.4 12l-1.4 1.4 5.6 5.6 10-10-1.4-1.4-8.6 8.6Z"/></svg>';
    b.appendChild(check);
    let lpTimer = null;
    let suppressClick = false;
    b.addEventListener('click', () => {
      if (suppressClick) { suppressClick = false; return; }
      if (selecting) {
        toggleSelected(shot.id, b);
      } else {
        loadEditNav();
        getShot(shot.id).then((full) => full && openShot(full));
      }
    });
    // Long tap : entre en mode sélection avec cette image sélectionnée.
    b.addEventListener('pointerdown', () => {
      clearTimeout(lpTimer);
      lpTimer = setTimeout(() => {
        lpTimer = null;
        suppressClick = true;
        if (!selecting) enterSelection();
        toggleSelected(shot.id, b);
        navigator.vibrate?.(12);
      }, 480);
    });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel', 'pointermove']) {
      b.addEventListener(ev, (e) => {
        if (ev !== 'pointermove' || Math.abs(e.movementX) + Math.abs(e.movementY) > 2) {
          clearTimeout(lpTimer);
        }
      });
    }
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    grid.appendChild(b);
  }
}

function toggleSelected(id, el) {
  if (gallerySel.has(id)) gallerySel.delete(id);
  else gallerySel.add(id);
  el.classList.toggle('is-selected', gallerySel.has(id));
  syncDeleteButton();
}

function syncDeleteButton() {
  const del = $('btn-delete');
  del.disabled = gallerySel.size === 0;
  del.classList.remove('is-armed');
  del.textContent = gallerySel.size > 0 ? `Supprimer (${gallerySel.size})` : 'Supprimer';
  const exp = $('btn-export');
  if (!exportBusy) {
    exp.disabled = gallerySel.size === 0;
    exp.textContent = gallerySel.size > 0 ? `Exporter (${gallerySel.size})` : 'Exporter';
  }
  const all = document.querySelectorAll('.g-item').length;
  $('btn-select-all').textContent =
    gallerySel.size === all && all > 0 ? 'Tout désélectionner' : 'Tout sélectionner';
}

function exitSelection() {
  selecting = false;
  gallerySel.clear();
  $('gallery-grid').classList.remove('is-selecting');
  $('gallery-actions').hidden = true;
  $('btn-select').textContent = 'Sélectionner';
  const exp = $('btn-export');
  exp.classList.remove('is-done');
  document.querySelectorAll('.g-item.is-selected').forEach((el) => el.classList.remove('is-selected'));
}

$('btn-gallery').addEventListener('click', showGallery);
$('btn-gallery-back').addEventListener('click', showShoot);

function enterSelection() {
  selecting = true;
  $('gallery-grid').classList.add('is-selecting');
  $('gallery-actions').hidden = false;
  $('btn-select').textContent = 'Annuler';
  syncDeleteButton();
}

$('btn-select').addEventListener('click', () => {
  if (selecting) exitSelection();
  else enterSelection();
});

$('btn-select-all').addEventListener('click', () => {
  const items = document.querySelectorAll('.g-item');
  const selectAll = gallerySel.size !== items.length;
  items.forEach((el) => {
    const id = el.dataset.id;
    if (selectAll) gallerySel.add(id);
    else gallerySel.delete(id);
    el.classList.toggle('is-selected', selectAll);
  });
  syncDeleteButton();
});

// Suppression en deux temps : un premier appui arme, le second confirme.
$('btn-delete').addEventListener('click', async () => {
  const btn = $('btn-delete');
  if (gallerySel.size === 0) return;
  if (!btn.classList.contains('is-armed')) {
    btn.classList.add('is-armed');
    btn.textContent = `Confirmer (${gallerySel.size})`;
    setTimeout(() => {
      if (btn.classList.contains('is-armed')) syncDeleteButton();
    }, 3500);
    return;
  }
  const ids = [...gallerySel];
  await deleteShots(ids).catch(() => {});
  if (ids.includes(state.currentId)) state.currentId = null;
  exitSelection();
  await refreshGallery();
});

/* ── Export de masse ────────────────────────────────────── */

// Rendu plein format d'une entrée conservée, sans toucher à l'éditeur :
// tout passe par des canvas locaux et un état dérivé des réglages stockés.
function stateFromSettings(s = {}) {
  const preset = PRESETS.find((p) => p.id === s.presetId) || PRESETS[0];
  const igOn = s.format && s.format !== 'polaroid';
  return {
    preset,
    frame: FRAMES.find((f) => f.id === s.frameId) || FRAMES[0],
    seed: s.seed || 1,
    expo: s.expo || 0,
    contrast: s.contrast || 0,
    sat: s.sat ?? Math.round(preset.sat * 100),
    grain: s.grain ?? Math.round(preset.grain * 250),
    blur: s.blur || 0,
    vignette: s.vignette ?? Math.round(preset.vignette * 100),
    leak: s.leak ?? 0,
    leakSeed: s.leakSeed ?? 1,
    zoom: s.zoom ?? 100,
    rot: s.rot ?? 0,
    cropX: s.cropX || 0,
    cropY: s.cropY || 0,
    format: igOn ? s.format : 'polaroid',
    igSize: igOn ? (s.igSize ?? 80) : 0,
    igDark: igOn && (!!s.igDark || s.format === 'ig-noir'),
    igBgBlob: igOn ? (s.igBg || null) : null,
    dbl: s.dbl || 0,
    dblMode: s.dblMode || 'screen',
    dblBlob: s.dbl > 0 ? (s.dblBg || null) : null,
  };
}

function blobToCanvas(blob) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      res(c);
    };
    img.onerror = (e) => { URL.revokeObjectURL(url); rej(e); };
    img.src = url;
  });
}

// L'export sans cadre suit l'orientation du cadre : portrait pour un cadre
// vertical (ex. Instax Mini), horizontal pour un cadre carré ou paysage.
// Si la source est déjà dans la bonne orientation, elle est conservée
// entière (au plus gros format) ; sinon on recadre au centre le plus grand
// rectangle de la bonne orientation.
function orientOriginal(source, frame) {
  const r = frame.img.w / frame.img.h;                 // largeur/hauteur de l'ouverture
  const ar = r < 0.91 ? r : Math.max(r, 4 / 3);        // vertical → ratio portrait ; carré/paysage → ≥ 4:3
  const targetLandscape = ar >= 1;
  const sourceLandscape = source.width >= source.height;
  let cw = source.width, ch = source.height;
  if (targetLandscape !== sourceLandscape) {           // orientation à inverser : recadrage centré
    ch = Math.round(cw / ar);
    if (ch > source.height) { ch = source.height; cw = Math.round(ch * ar); }
  }
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  c.getContext('2d').drawImage(
    source, (source.width - cw) / 2, (source.height - ch) / 2, cw, ch, 0, 0, cw, ch
  );
  return c;
}

// Jeu d'exports par défaut d'un tirage — le même partout dans l'app
// (bouton Télécharger de l'éditeur et export de masse de la galerie).
// `st` est l'état live ou un état dérivé des réglages conservés.
// Retourne, dans l'ordre :
//   1. l'original filtré et sans cadre, orienté comme le cadre (portrait
//      pour un cadre vertical, horizontal sinon) ;
//   2. le polaroid : filtre + recadrage + cadre, sans fond 4:5 ;
//   3. la composition 4:5 avec fond — seulement si un fond 4:5 est activé.
async function renderExports(source, st) {
  await assetsReady;
  const outputs = [];
  const boost = exportBoost(st.frame);
  // Double exposition : image live si dispo, sinon décodée depuis le blob.
  const dblImg = st.dblImg || (st.dblBlob ? await loadImageCanvas(st.dblBlob).catch(() => null) : null);

  // 1 — Original filtré, sans cadre, orienté selon le cadre.
  const original = orientOriginal(source, st.frame);
  applyDouble(original, dblImg, st.dbl, st.dblMode);
  applyPreset(original, st.preset, st.seed, currentAdjust(st));
  outputs.push({ suffix: '-original', canvas: original });

  // 2 — Polaroid : recadrage + filtre + light leak, composé sous le cadre,
  //     re-rendu en haute résolution (sur-échantillonnage depuis la source).
  const photo = cropToOpening(source, st.frame, boost, st);
  applyDouble(photo, dblImg, st.dbl, st.dblMode);
  applyPreset(photo, st.preset, st.seed, currentAdjust(st));
  if (st.leak > 0) applyLightLeak(photo, st.leakSeed, st.leak / 100);
  const pc = document.createElement('canvas');
  renderPolaroid(pc, st.frame, photo, boost);
  outputs.push({ suffix: '', canvas: pc });

  // 3 — Composition 4:5, seulement si l'utilisateur l'a activée.
  if (st.igSize > 0) {
    const bg = st.igBg || (st.igBgBlob ? await blobToCanvas(st.igBgBlob).catch(() => null) : null);
    outputs.push({ suffix: '-4-5', canvas: renderInstagram(pc, !!st.igDark, { size: st.igSize, bg }) });
  }

  return outputs;
}

// Chaque fichier est téléchargé individuellement dans le dossier
// Téléchargements de l'appareil : il est alors repris automatiquement par
// la sauvegarde Google Photos (dossiers d'appareil). Les déclenchements
// sont espacés car certains navigateurs mobiles ignorent des
// téléchargements trop rapprochés — et demandent une seule fois
// l'autorisation de télécharger plusieurs fichiers.
const EXPORT_GAP_MS = 700;

async function downloadOutputs(outputs, base) {
  for (let j = 0; j < outputs.length; j++) {
    downloadBlob(await toBlob(outputs[j].canvas), `${base}${outputs[j].suffix}.png`);
    if (j < outputs.length - 1) await new Promise((r) => setTimeout(r, EXPORT_GAP_MS));
  }
}

let exportBusy = false;
async function exportSelected() {
  if (exportBusy || gallerySel.size === 0) return;
  const ids = [...gallerySel];
  const btn = $('btn-export');
  exportBusy = true;
  btn.disabled = true;
  btn.classList.remove('is-done');
  try {
    const shots = [];
    for (const id of ids) {
      const s = await getShot(id).catch(() => null);
      if (s) shots.push(s);
    }
    shots.sort((a, b) => b.createdAt - a.createdAt);
    for (let i = 0; i < shots.length; i++) {
      btn.textContent = `Enregistrement… ${i + 1}/${shots.length}`;
      const st = stateFromSettings(shots[i].settings);
      const source = await blobToCanvas(shots[i].source);
      const outputs = await renderExports(source, st);
      const base = `pola-${stampDate(new Date(shots[i].createdAt))}-${exportTag()}`;
      await downloadOutputs(outputs, base);
      if (i < shots.length - 1) await new Promise((r) => setTimeout(r, EXPORT_GAP_MS));
    }
    btn.textContent = shots.length > 1 ? `Enregistrées (${shots.length})` : 'Enregistrée';
    btn.classList.add('is-done');
    setTimeout(() => { exportBusy = false; btn.classList.remove('is-done'); syncDeleteButton(); }, 1600);
  } catch (e) {
    btn.textContent = 'Échec de l’export';
    setTimeout(() => { exportBusy = false; syncDeleteButton(); }, 1800);
  }
}

$('btn-export').addEventListener('click', exportSelected);

/* ── Curseurs de réglage ── */

const ADJUST_IDS = {
  expo: 'adj-expo', contrast: 'adj-contrast', sat: 'adj-sat',
  grain: 'adj-grain', blur: 'adj-blur', vignette: 'adj-vignette',
  zoom: 'adj-zoom', rot: 'adj-rot', leak: 'adj-leak',
};
const SIGNED = new Set(['expo', 'contrast', 'rot']);

function setAdjust(key, value) {
  state[key] = value;
  $(ADJUST_IDS[key]).value = value;
  $(ADJUST_IDS[key] + '-val').textContent =
    SIGNED.has(key) && value > 0 ? `+${value}` : String(value);
}

// Valeur de repos : saturation, grain et vignettage reprennent le film choisi.
function adjustDefault(key) {
  if (key === 'sat') return Math.round(state.preset.sat * 100);
  if (key === 'grain') return Math.round(state.preset.grain * 250);
  if (key === 'vignette') return Math.round(state.preset.vignette * 100);
  if (key === 'zoom') return 100;
  return 0;
}

function resetAdjustsForPreset() {
  setAdjust('sat', adjustDefault('sat'));
  setAdjust('grain', adjustDefault('grain'));
  setAdjust('vignette', adjustDefault('vignette'));
}

for (const key of Object.keys(ADJUST_IDS)) {
  // Pendant le glissement : aperçu rapide basse résolution, fluide.
  $(ADJUST_IDS[key]).addEventListener('input', (e) => {
    setAdjust(key, Number(e.target.value));
    render(true);
  });
  // Au relâchement : rendu pleine résolution.
  $(ADJUST_IDS[key]).addEventListener('change', () => render());
  $(ADJUST_IDS[key] + '-val').addEventListener('click', () => {
    setAdjust(key, adjustDefault(key));
    render();
  });
}

/* ── Navigation basse de l'éditeur : Films / Cadres / Réglages ── */

const NAV_PANES = { films: 'edit-film-strip', lumiere: 'drawer-lumiere', cadres: 'frame-strip', reglages: 'drawer-reglages' };

function showNav(name) {
  for (const [nav, pane] of Object.entries(NAV_PANES)) {
    $(pane).hidden = nav !== name;
    $('nav-' + nav).classList.toggle('is-on', nav === name);
  }
  $('drawer-control').hidden = true;
}
for (const nav of Object.keys(NAV_PANES)) {
  $('nav-' + nav).addEventListener('click', () => showNav(nav));
}

/* ── Sous-menu Réglages : une icône par réglage, curseur seul ── */

const CONTROL_ROWS = {
  expo: 'row-expo', contrast: 'row-contrast', sat: 'row-sat',
  grain: 'row-grain', blur: 'row-blur', vignette: 'row-vignette',
  double: 'row-double', fond: 'row-fond', crop: 'row-crop',
};
let ctlKey = null;
let ctlPrev = null;

function openControl(key) {
  ctlKey = key;
  if (key === 'fond') ctlPrev = state.igSize;
  else if (key === 'crop') ctlPrev = { zoom: state.zoom, rot: state.rot, x: state.cropX, y: state.cropY };
  else if (key === 'double') ctlPrev = { dbl: state.dbl, mode: state.dblMode, img: state.dblImg, blob: state.dblBlob };
  else ctlPrev = state[key];
  if (key === 'double') syncDoubleControls();
  for (const [k, row] of Object.entries(CONTROL_ROWS)) $(row).hidden = k !== key;
  $('drawer-reglages').hidden = true;
  $('drawer-control').hidden = false;
}

function closeControl(apply) {
  if (!apply && ctlKey) {
    if (ctlKey === 'fond') {
      setIgSize(ctlPrev);
    } else if (ctlKey === 'crop') {
      setAdjust('zoom', ctlPrev.zoom);
      setAdjust('rot', ctlPrev.rot);
      state.cropX = ctlPrev.x;
      state.cropY = ctlPrev.y;
    } else if (ctlKey === 'double') {
      state.dbl = ctlPrev.dbl;
      state.dblMode = ctlPrev.mode;
      state.dblImg = ctlPrev.img;
      state.dblBlob = ctlPrev.blob;
      syncDoubleControls();
    } else {
      setAdjust(ctlKey, ctlPrev);
    }
  }
  ctlKey = null;
  render();
  $('drawer-control').hidden = true;
  $('drawer-reglages').hidden = false;
}

document.querySelectorAll('#drawer-reglages .ric').forEach((b) => {
  b.addEventListener('click', () => openControl(b.dataset.key));
});
$('ctl-ok').addEventListener('click', () => closeControl(true));
$('ctl-cancel').addEventListener('click', () => closeControl(false));

/* ── Fond 4:5 : curseur à crans — 0 = désactivé, puis 5 tailles ── */

const IG_SIZES = [0, 40, 50, 70, 80, 90];

// Accroche une valeur libre (anciens tirages) au cran le plus proche.
function snapIgSize(v) {
  return IG_SIZES.reduce((best, s) => (Math.abs(s - v) < Math.abs(best - v) ? s : best), 0);
}

function setIgSize(v) {
  v = snapIgSize(v);
  state.igSize = v;
  state.format = v > 0 ? (state.igDark ? 'ig-noir' : 'ig-blanc') : 'polaroid';
  $('adj-size').value = IG_SIZES.indexOf(v);
  $('adj-size-val').textContent = String(v);
  if (state.source) updateDisplay();
}

function setIgDark(dark) {
  state.igDark = dark;
  if (state.format !== 'polaroid') state.format = dark ? 'ig-noir' : 'ig-blanc';
  $('sw-blanc').classList.toggle('is-on', !dark);
  $('sw-blanc').setAttribute('aria-checked', String(!dark));
  $('sw-noir').classList.toggle('is-on', dark);
  $('sw-noir').setAttribute('aria-checked', String(dark));
  if (state.source) updateDisplay();
  schedulePersist();
}

$('adj-size').addEventListener('input', (e) => setIgSize(IG_SIZES[Number(e.target.value)]));
$('sw-blanc').addEventListener('click', () => setIgDark(false));
$('sw-noir').addEventListener('click', () => setIgDark(true));
$('adj-size').addEventListener('change', () => schedulePersist());
$('adj-size-val').addEventListener('click', () => {
  setIgSize(0);
  schedulePersist();
});

/* ── Fond 4:5 en collage : photo derrière le polaroid ── */

// Décode le fichier choisi et le ré-encode en JPEG, plafonné à 2160 px
// sur le grand côté (résolution du cadre 4:5) pour garder la galerie légère.
function prepareBg(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const k = Math.min(1, 2160 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * k));
      c.height = Math.max(1, Math.round(img.naturalHeight * k));
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob((blob) => res({ canvas: c, blob }), 'image/jpeg', 0.85);
    };
    img.onerror = (e) => { URL.revokeObjectURL(url); rej(e); };
    img.src = url;
  });
}

$('ig-bg-add').addEventListener('click', () => $('ig-bg-input').click());
$('ig-bg-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const { canvas, blob } = await prepareBg(file);
    state.igBg = canvas;
    state.igBgBlob = blob;
    // Ajouter un fond n'a de sens qu'en 4:5 : on l'active si besoin.
    if (state.format === 'polaroid') setIgSize(state.igSize > 0 ? state.igSize : 80);
    else updateDisplay();
    schedulePersist();
  } catch { /* image illisible : on ignore */ }
});

$('ig-bg-remove').addEventListener('click', () => {
  state.igBg = null;
  state.igBgBlob = null;
  if (state.source) updateDisplay();
  schedulePersist();
});

/* ── Double exposition : seconde photo superposée ── */

const DBL_MODES = [['dbl-screen', 'screen'], ['dbl-multiply', 'multiply'], ['dbl-normal', 'source-over']];

function syncDoubleControls() {
  const on = !!state.dblImg;
  $('dbl-add').hidden = on;
  $('dbl-body').hidden = !on;
  $('adj-dbl').value = state.dbl;
  $('adj-dbl-val').textContent = String(state.dbl);
  for (const [id, mode] of DBL_MODES) {
    const sel = state.dblMode === mode;
    $(id).classList.toggle('is-on', sel);
    $(id).setAttribute('aria-checked', String(sel));
  }
}

function setDbl(v) {
  state.dbl = v;
  $('adj-dbl').value = v;
  $('adj-dbl-val').textContent = String(v);
}

$('dbl-add').addEventListener('click', () => $('double-input').click());
$('double-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const { canvas, blob } = await prepareBg(file); // ré-encode et plafonne à 2160 px
    state.dblImg = canvas;
    state.dblBlob = blob;
    if (state.dbl === 0) state.dbl = 70; // active à une intensité par défaut
    syncDoubleControls();
    render();
    schedulePersist();
  } catch { /* image illisible : on ignore */ }
});

// Intensité : aperçu rapide pendant le glissement, plein res au relâchement.
$('adj-dbl').addEventListener('input', (e) => { setDbl(Number(e.target.value)); render(true); });
$('adj-dbl').addEventListener('change', () => { render(); schedulePersist(); });
$('adj-dbl-val').addEventListener('click', () => { setDbl(70); render(); schedulePersist(); });

for (const [id, mode] of DBL_MODES) {
  $(id).addEventListener('click', () => {
    state.dblMode = mode;
    syncDoubleControls();
    render();
    schedulePersist();
  });
}

$('dbl-remove').addEventListener('click', () => {
  state.dblImg = null;
  state.dblBlob = null;
  state.dbl = 0;
  syncDoubleControls();
  render();
  schedulePersist();
});

/* ── Recadrage : glisser sur l'aperçu déplace le cadrage ── */

let panDrag = null;
renderCanvas.addEventListener('pointerdown', (e) => {
  if (ctlKey !== 'crop' || !state.source) return;
  panDrag = { x: e.clientX, y: e.clientY, cx: state.cropX, cy: state.cropY };
  renderCanvas.setPointerCapture(e.pointerId);
});
renderCanvas.addEventListener('pointermove', (e) => {
  if (!panDrag) return;
  const rect = renderCanvas.getBoundingClientRect();
  const clamp1 = (v) => Math.max(-1, Math.min(1, v));
  state.cropX = clamp1(panDrag.cx - ((e.clientX - panDrag.x) / rect.width) * 2);
  state.cropY = clamp1(panDrag.cy - ((e.clientY - panDrag.y) / rect.height) * 2);
  render(true);
});
const endPan = () => {
  if (!panDrag) return;
  panDrag = null;
  render();
};
renderCanvas.addEventListener('pointerup', endPan);
renderCanvas.addEventListener('pointercancel', endPan);

/* ── Swipe horizontal sur l'aperçu : photo précédente / suivante ── */
// Hors mode recadrage (où le glissement déplace le cadrage). Un swipe vers
// la gauche va à la photo suivante, vers la droite à la précédente.
const outEl = $('polaroid-out');
let editSwipe = null;
outEl.addEventListener('pointerdown', (e) => {
  if (ctlKey === 'crop' || !state.currentId || editNavIds.length < 2) return;
  if (e.target.closest('button')) return; // ne pas contrarier les boutons (+ / ×)
  editSwipe = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, active: false };
});
outEl.addEventListener('pointermove', (e) => {
  if (!editSwipe || e.pointerId !== editSwipe.id) return;
  const dx = e.clientX - editSwipe.x, dy = e.clientY - editSwipe.y;
  if (!editSwipe.active) {
    if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.3) {
      editSwipe.active = true;
      outEl.setPointerCapture(editSwipe.id);
    } else if (Math.abs(dy) > 12) { editSwipe = null; return; } // geste vertical → abandon
    else return;
  }
  editSwipe.dx = dx;
  // L'aperçu suit le doigt (glissement réel, sans fondu).
  outEl.style.transition = 'none';
  outEl.style.transform = `translateX(${dx}px)`;
});
const endSwipe = (commit) => {
  if (!editSwipe) return;
  const { dx, active } = editSwipe;
  editSwipe = null;
  if (commit && active && Math.abs(dx) > 60) {
    navigateEdit(dx < 0 ? 1 : -1); // gère lui-même le glissement complet
  } else if (active) {
    snapBackPreview();
  }
};
outEl.addEventListener('pointerup', () => endSwipe(true));
outEl.addEventListener('pointercancel', () => endSwipe(false));
outEl.addEventListener('pointerleave', () => endSwipe(false));

// Nouvelle fuite : nouveau tirage aléatoire du motif.
$('btn-leak-reroll').addEventListener('click', () => {
  state.leakSeed = (Math.random() * 0xffffffff) >>> 0;
  if (state.leak === 0) setAdjust('leak', 55); // active si éteint
  render();
});

$('btn-download').addEventListener('click', download);

/* ── Suppression du tirage courant (éditeur), confirmation en deux temps ── */
let deleteArmed = false;
let deleteArmTimer;
function disarmDelete() {
  deleteArmed = false;
  clearTimeout(deleteArmTimer);
  const b = $('btn-delete-photo');
  b.classList.remove('is-armed');
  b.setAttribute('aria-label', 'Supprimer');
}

async function deleteCurrent() {
  const id = state.currentId;
  if (!id) return;
  const i = editNavIds.indexOf(id);
  await deleteShots([id]).catch(() => {});
  editNavIds = editNavIds.filter((x) => x !== id);
  state.currentId = null;
  // Enchaîne sur la photo voisine (suivante, sinon précédente).
  const nextId = editNavIds[i] ?? editNavIds[i - 1] ?? null;
  if (nextId) {
    const shot = await getShot(nextId).catch(() => null);
    if (shot) {
      try {
        applyShot(shot, await loadImageCanvas(shot.source));
        await renderSync();
        return;
      } catch { /* illisible : repli galerie */ }
    }
  }
  showGallery(); // plus de voisin (ou échec) : retour à la galerie
}

$('btn-delete-photo').addEventListener('click', () => {
  const b = $('btn-delete-photo');
  if (!deleteArmed) {
    deleteArmed = true;
    b.classList.add('is-armed');
    b.setAttribute('aria-label', 'Confirmer la suppression');
    navigator.vibrate?.(8);
    clearTimeout(deleteArmTimer);
    deleteArmTimer = setTimeout(disarmDelete, 3000);
    return;
  }
  disarmDelete();
  deleteCurrent();
});

/* ── Démarrage ──────────────────────────────────────────── */

buildChips($('film-strip'), PRESETS, state.preset, pickPreset);
buildChips($('edit-film-strip'), PRESETS, state.preset, pickPreset);
buildChips($('frame-strip'), FRAMES, state.frame, pickFrame);
buildChips($('shoot-frame-strip'), FRAMES, state.frame, pickFrame);
syncPresetUi();
updateLiveFrame();
startCamera();

// Ceinture et bretelles : dès que la vidéo joue, le message d'erreur
// n'a plus lieu d'être.
video.addEventListener('playing', () => {
  $('camera-off').hidden = true;
  $('btn-shutter').disabled = false;
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopCamera();
  else if ($('shoot').classList.contains('is-active')) startCamera();
});

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js');
}
