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
  igSize: 0,     // fond 4:5 : 0 = désactivé, 1..100 = taille du polaroid
  igDark: false, // fond 4:5 : blanc ou noir
  igBg: null,    // fond 4:5 en collage : canvas décodé (mémoire)
  igBgBlob: null, // même fond, blob JPEG persisté dans la galerie
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
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: state.facing, width: { ideal: 2160 }, height: { ideal: 2160 } },
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

$('live-window').addEventListener('click', (e) => {
  if (!state.stream) return;
  const pt = tapToVideoCoords(e);
  if (!pt) return;
  showFocusRing(e);
  focusAt(pt);
});

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
  const max = 2600;
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
    applyPreset(photo, state.preset, state.seed, currentAdjust());
    if (state.leak > 0) applyLightLeak(photo, state.leakSeed, state.leak / 100);
    renderPolaroid(polaroidCanvas, state.frame, photo);
    updateDisplay();
    if (full) schedulePersist();
  }, 0);
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
function schedulePersist() {
  if (!state.currentId) return;
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persistCurrent, 700);
}

async function persistCurrent() {
  if (!state.currentId || !state.sourceBlob) return;
  const thumb = await makeThumb();
  await putShot({
    id: state.currentId,
    createdAt: state.createdAt,
    updatedAt: Date.now(),
    source: state.sourceBlob,
    thumb,
    settings: {
      presetId: state.preset.id,
      frameId: state.frame.id,
      expo: state.expo,
      contrast: state.contrast,
      sat: state.sat,
      grain: state.grain,
      blur: state.blur,
      leak: state.leak,
      leakSeed: state.leakSeed,
      igSize: state.igSize,
      igDark: state.igDark,
      igBg: state.igBgBlob || null,
      format: state.format,
      zoom: state.zoom,
      rot: state.rot,
      cropX: state.cropX,
      cropY: state.cropY,
      seed: state.seed,
    },
  }).catch(() => {});
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
  state.igSize = s.igSize ?? 80;
  const igOn = s.format && s.format !== 'polaroid';
  state.igDark = !!s.igDark || s.format === 'ig-noir';
  state.igSize = igOn ? (s.igSize ?? 80) : 0;
  state.format = igOn ? (state.igDark ? 'ig-noir' : 'ig-blanc') : 'polaroid';
  $('sw-blanc').classList.toggle('is-on', !state.igDark);
  $('sw-blanc').setAttribute('aria-checked', String(!state.igDark));
  $('sw-noir').classList.toggle('is-on', state.igDark);
  $('sw-noir').setAttribute('aria-checked', String(state.igDark));
  $('adj-size').value = state.igSize;
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
async function showEditor(source) {
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
  resetAdjustsForPreset();
  showNav('films');
  stopCamera();
  showScreen('edit');
  render().then(develop);
  state.sourceBlob = await canvasJpeg(source);
  schedulePersist();
}

// Réédition d'un polaroid conservé.
function openShot(shot) {
  const url = URL.createObjectURL(shot.source);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    state.source = c;
    state.sourceBlob = shot.source;
    state.currentId = shot.id;
    state.createdAt = shot.createdAt;
    state.fromGallery = true;
    applySettings(shot.settings || {});
    showNav('films');
    stopCamera();
    showScreen('edit');
    render();
  };
  img.src = url;
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

function exportCanvas() {
  if (state.format === 'polaroid') return polaroidCanvas;
  return renderInstagram(polaroidCanvas, state.igDark, { size: state.igSize, bg: state.igBg });
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

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function download() {
  const blob = await toBlob(exportCanvas());
  downloadBlob(blob, `pola-${stamp()}.png`);
  const btn = $('btn-download');
  btn.classList.add('is-done');
  setTimeout(() => btn.classList.remove('is-done'), 1200);
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
$('btn-shutter').addEventListener('click', async () => {
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
  showEditor(source);
});

$('btn-flip').addEventListener('click', () => {
  state.facing = state.facing === 'environment' ? 'user' : 'environment';
  startCamera();
});

$('btn-import').addEventListener('click', () => $('file-input').click());
$('file-input').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    showEditor(sourceFromImage(img));
    URL.revokeObjectURL(url);
  };
  img.src = url;
  e.target.value = '';
});

$('btn-back').addEventListener('click', () => {
  clearTimeout(persistTimer);
  persistCurrent();
  if (state.fromGallery) showGallery();
  else showShoot();
});

/* ── Galerie : affichage & sélection ────────────────────── */

const gallerySel = new Set();
let selecting = false;
let galleryUrls = [];

async function showGallery() {
  stopCamera();
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
    leak: s.leak ?? 0,
    leakSeed: s.leakSeed ?? 1,
    zoom: s.zoom ?? 100,
    rot: s.rot ?? 0,
    cropX: s.cropX || 0,
    cropY: s.cropY || 0,
    format: igOn ? s.format : 'polaroid',
    igSize: igOn ? (s.igSize ?? 80) : 0,
    igBgBlob: igOn ? (s.igBg || null) : null,
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

// Rend les deux sorties d'un tirage conservé :
//  - `framed` : le polaroid complet (cadre + format polaroid ou 4:5) ;
//  - `photo`  : la photo seule, recadrée et filtrée (film + réglages +
//    light leak) mais SANS cadre — l'« original » filtré, avant compositing.
async function renderShotCanvas(shot) {
  await assetsReady;
  const st = stateFromSettings(shot.settings);
  const source = await blobToCanvas(shot.source);
  const photo = cropToOpening(source, st.frame, 1, st);
  applyPreset(photo, st.preset, st.seed, currentAdjust(st));
  if (st.leak > 0) applyLightLeak(photo, st.leakSeed, st.leak / 100);
  const pc = document.createElement('canvas');
  renderPolaroid(pc, st.frame, photo);
  let framed = pc;
  if (st.format !== 'polaroid') {
    const bg = st.igBgBlob ? await blobToCanvas(st.igBgBlob).catch(() => null) : null;
    framed = renderInstagram(pc, !!st.igDark, { size: st.igSize, bg });
  }
  return { framed, photo };
}

// Chaque photo est téléchargée individuellement dans le dossier
// Téléchargements de l'appareil : elle est alors reprise automatiquement
// par la sauvegarde Google Photos (dossiers d'appareil). Les déclenchements
// sont espacés car certains navigateurs mobiles ignorent des
// téléchargements trop rapprochés — et demandent une seule fois
// l'autorisation de télécharger plusieurs fichiers.
const EXPORT_GAP_MS = 700;

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
      const { framed, photo } = await renderShotCanvas(shots[i]);
      const base = `pola-${stampDate(new Date(shots[i].createdAt))}-${i + 1}`;
      // Deux fichiers par tirage : le polaroid encadré et la photo seule
      // (filtrée, sans cadre) pour conserver l'original.
      downloadBlob(await toBlob(framed), `${base}.png`);
      await new Promise((r) => setTimeout(r, EXPORT_GAP_MS));
      downloadBlob(await toBlob(photo), `${base}-sans-cadre.png`);
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
  grain: 'adj-grain', blur: 'adj-blur', zoom: 'adj-zoom', rot: 'adj-rot',
  leak: 'adj-leak',
};
const SIGNED = new Set(['expo', 'contrast', 'rot']);

function setAdjust(key, value) {
  state[key] = value;
  $(ADJUST_IDS[key]).value = value;
  $(ADJUST_IDS[key] + '-val').textContent =
    SIGNED.has(key) && value > 0 ? `+${value}` : String(value);
}

// Valeur de repos : saturation et grain reprennent celles du film choisi.
function adjustDefault(key) {
  if (key === 'sat') return Math.round(state.preset.sat * 100);
  if (key === 'grain') return Math.round(state.preset.grain * 250);
  if (key === 'zoom') return 100;
  return 0;
}

function resetAdjustsForPreset() {
  setAdjust('sat', adjustDefault('sat'));
  setAdjust('grain', adjustDefault('grain'));
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
  grain: 'row-grain', blur: 'row-blur', fond: 'row-fond', crop: 'row-crop',
};
let ctlKey = null;
let ctlPrev = null;

function openControl(key) {
  ctlKey = key;
  if (key === 'fond') ctlPrev = state.igSize;
  else if (key === 'crop') ctlPrev = { zoom: state.zoom, rot: state.rot, x: state.cropX, y: state.cropY };
  else ctlPrev = state[key];
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

/* ── Fond 4:5 : un seul curseur — 0 = désactivé, au-delà = taille ── */

function setIgSize(v) {
  state.igSize = v;
  state.format = v > 0 ? (state.igDark ? 'ig-noir' : 'ig-blanc') : 'polaroid';
  $('adj-size').value = v;
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

$('adj-size').addEventListener('input', (e) => setIgSize(Number(e.target.value)));
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

// Nouvelle fuite : nouveau tirage aléatoire du motif.
$('btn-leak-reroll').addEventListener('click', () => {
  state.leakSeed = (Math.random() * 0xffffffff) >>> 0;
  if (state.leak === 0) setAdjust('leak', 55); // active si éteint
  render();
});

$('btn-download').addEventListener('click', download);

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
