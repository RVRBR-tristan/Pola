import { PRESETS, applyPreset } from './presets.js';
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
  expo: 0,       // -100..100 → ± 0,8 EV
  contrast: 0,   // -100..100 → ± 0,5
  igSize: 80,    // taille du polaroid dans le canevas 4:5 (40..100)
  format: 'polaroid',
  seed: 1,
  facing: 'environment',
  stream: null,
};

const video = $('camera');
const renderCanvas = $('render-canvas');
// Rendu du polaroid seul, hors écran ; l'aperçu affiché dépend du format.
const polaroidCanvas = document.createElement('canvas');

/* ── Caméra ─────────────────────────────────────────────── */

async function startCamera() {
  stopCamera();
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: state.facing, width: { ideal: 2160 }, height: { ideal: 2160 } },
      audio: false,
    });
    video.srcObject = state.stream;
    video.classList.toggle('is-mirrored', state.facing === 'user');
    $('camera-off').hidden = true;
    $('btn-shutter').disabled = false;
  } catch {
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
function cropToOpening(source, frame) {
  const { w, h } = frame.img;
  const outW = w * frame.scale, outH = h * frame.scale;
  const ratio = outW / outH;
  let sw = source.width, sh = source.height;
  if (sw / sh > ratio) sw = sh * ratio;
  else sh = sw / ratio;
  const sx = (source.width - sw) / 2;
  const sy = (source.height - sh) / 2;
  const c = document.createElement('canvas');
  c.width = outW;
  c.height = outH;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, outW, outH);
  return c;
}

let renderQueued = false;
async function render() {
  if (!state.source || renderQueued) return;
  renderQueued = true;
  await assetsReady;
  // setTimeout plutôt que requestAnimationFrame : rAF est suspendu
  // quand l'onglet est en arrière-plan et le rendu ne se ferait jamais.
  setTimeout(() => {
    renderQueued = false;
    const photo = cropToOpening(state.source, state.frame);
    applyPreset(photo, state.preset, state.seed, {
      expo: (state.expo / 100) * 0.8,
      contrast: (state.contrast / 100) * 0.5,
    });
    renderPolaroid(polaroidCanvas, state.frame, photo);
    updateDisplay();
    schedulePersist();
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
    const out = renderInstagram(polaroidCanvas, state.format === 'ig-noir', { size: state.igSize });
    renderCanvas.width = out.width;
    renderCanvas.height = out.height;
    ctx.drawImage(out, 0, 0);
  }
  positionDevOverlay();
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
      igSize: state.igSize,
      format: state.format,
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
  state.igSize = s.igSize ?? 80;
  $('adj-size').value = state.igSize;
  $('adj-size-val').textContent = String(state.igSize);
  state.format = s.format || 'polaroid';
  document.querySelectorAll('#format-seg .seg-btn').forEach((b) => {
    const on = b.dataset.format === state.format;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-checked', String(on));
  });
  syncIgControls();
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
  return renderInstagram(polaroidCanvas, state.format === 'ig-noir', { size: state.igSize });
}

function toBlob(canvas) {
  return new Promise((res) => canvas.toBlob(res, 'image/png'));
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function download() {
  const blob = await toBlob(exportCanvas());
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pola-${stamp()}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  const btn = $('btn-download');
  btn.classList.add('is-done');
  setTimeout(() => btn.classList.remove('is-done'), 1200);
}

/* ── Écouteurs ──────────────────────────────────────────── */

$('btn-shutter').addEventListener('click', () => {
  const source = captureFromVideo();
  if (!source) return;
  const flash = $('flash');
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
    b.addEventListener('click', () => {
      if (selecting) {
        toggleSelected(shot.id, b);
      } else {
        getShot(shot.id).then((full) => full && openShot(full));
      }
    });
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
  const btn = $('btn-delete');
  btn.disabled = gallerySel.size === 0;
  btn.classList.remove('is-armed');
  btn.textContent = gallerySel.size > 0 ? `Supprimer (${gallerySel.size})` : 'Supprimer';
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
  document.querySelectorAll('.g-item.is-selected').forEach((el) => el.classList.remove('is-selected'));
}

$('btn-gallery').addEventListener('click', showGallery);
$('btn-gallery-back').addEventListener('click', showShoot);

$('btn-select').addEventListener('click', () => {
  if (selecting) {
    exitSelection();
  } else {
    selecting = true;
    $('gallery-grid').classList.add('is-selecting');
    $('gallery-actions').hidden = false;
    $('btn-select').textContent = 'Annuler';
    syncDeleteButton();
  }
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

/* ── Réglages exposition / contraste ── */

const ADJUST_IDS = { expo: 'adj-expo', contrast: 'adj-contrast' };
let adjustTimer;

function setAdjust(key, value) {
  state[key] = value;
  $(ADJUST_IDS[key]).value = value;
  $(ADJUST_IDS[key] + '-val').textContent = value > 0 ? `+${value}` : String(value);
}

for (const key of Object.keys(ADJUST_IDS)) {
  $(ADJUST_IDS[key]).addEventListener('input', (e) => {
    setAdjust(key, Number(e.target.value));
    clearTimeout(adjustTimer);
    adjustTimer = setTimeout(render, 120);
  });
  $(ADJUST_IDS[key] + '-val').addEventListener('click', () => {
    setAdjust(key, 0);
    render();
  });
}

/* ── Réglages du canevas 4:5 (taille, ombre) ── */

$('adj-size').addEventListener('input', (e) => {
  state.igSize = Number(e.target.value);
  $('adj-size-val').textContent = String(state.igSize);
  if (state.source) updateDisplay();
});
$('adj-size-val').addEventListener('click', () => {
  state.igSize = 80;
  $('adj-size').value = 80;
  $('adj-size-val').textContent = '80';
  if (state.source) updateDisplay();
});
function syncIgControls() {
  $('size-row').hidden = state.format === 'polaroid';
}

$('format-seg').addEventListener('click', (e) => {
  const btn = e.target.closest('.seg-btn');
  if (!btn) return;
  state.format = btn.dataset.format;
  document.querySelectorAll('#format-seg .seg-btn').forEach((b) => {
    const on = b === btn;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-checked', String(on));
  });
  syncIgControls();
  if (state.source) updateDisplay();
});

$('btn-download').addEventListener('click', download);

/* ── Démarrage ──────────────────────────────────────────── */

buildChips($('film-strip'), PRESETS, state.preset, pickPreset);
buildChips($('edit-film-strip'), PRESETS, state.preset, pickPreset);
buildChips($('frame-strip'), FRAMES, state.frame, pickFrame);
buildChips($('shoot-frame-strip'), FRAMES, state.frame, pickFrame);
syncPresetUi();
updateLiveFrame();
syncIgControls();
startCamera();

document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopCamera();
  else if ($('shoot').classList.contains('is-active')) startCamera();
});

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js');
}
