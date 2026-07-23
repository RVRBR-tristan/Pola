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
  expo: 0,       // -100..100 → ± 1,2 EV
  contrast: 0,   // -100..100 → ± 0,75
  sat: 82,       // 0..160 → saturation absolue (init. sur le film)
  grain: 18,     // 0..100 → alpha 0..0,4 (init. sur le film)
  blur: 0,       // 0..100 → flou radial
  igSize: 80,    // taille du polaroid dans le canevas 4:5 (40..100)
  igDark: false, // pastille : fond blanc ou noir
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
// `sf` < 1 : version réduite pour l'aperçu rapide pendant un glissement.
function cropToOpening(source, frame, sf = 1) {
  const { w, h } = frame.img;
  const outW = Math.round(w * frame.scale * sf), outH = Math.round(h * frame.scale * sf);
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

function currentAdjust() {
  return {
    expo: (state.expo / 100) * 1.2,
    contrast: (state.contrast / 100) * 0.75,
    sat: state.sat / 100,
    grain: state.grain / 250,
    blur: state.blur / 100,
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
    const out = renderInstagram(polaroidCanvas, state.format === 'ig-noir', { size: state.igSize });
    renderCanvas.width = out.width;
    renderCanvas.height = out.height;
    ctx.drawImage(out, 0, 0);
  }
  $('polaroid-out').style.setProperty(
    '--out-ratio',
    (renderCanvas.width / renderCanvas.height).toFixed(4)
  );
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
      sat: state.sat,
      grain: state.grain,
      blur: state.blur,
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
  setAdjust('sat', s.sat ?? adjustDefault('sat'));
  setAdjust('grain', s.grain ?? adjustDefault('grain'));
  setAdjust('blur', s.blur || 0);
  state.igSize = s.igSize ?? 80;
  $('adj-size').value = state.igSize;
  $('adj-size-val').textContent = String(state.igSize);
  state.format = s.format || 'polaroid';
  state.igDark = state.format === 'ig-noir';
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
  setAdjust('blur', 0);
  resetAdjustsForPreset();
  showTab('reglages');
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

/* ── Curseurs de réglage ── */

const ADJUST_IDS = { expo: 'adj-expo', contrast: 'adj-contrast', sat: 'adj-sat', grain: 'adj-grain', blur: 'adj-blur' };
const SIGNED = new Set(['expo', 'contrast']);

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

/* ── Onglets Réglages / Fond 4:5 ── */

function showTab(name) {
  for (const t of ['reglages', 'fond']) {
    $('tab-' + t).hidden = t !== name;
    $('tab-btn-' + t).classList.toggle('is-on', t === name);
    $('tab-btn-' + t).setAttribute('aria-selected', String(t === name));
  }
}
$('tab-btn-reglages').addEventListener('click', () => showTab('reglages'));
$('tab-btn-fond').addEventListener('click', () => showTab('fond'));

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
// L'interrupteur « Fond 4:5 » et les pastilles blanc/noir pilotent le format.
function syncIgControls() {
  const ig = state.format !== 'polaroid';
  $('toggle-ig').checked = ig;
  $('size-row').hidden = !ig;
  $('bg-swatches').hidden = !ig;
  $('sw-blanc').classList.toggle('is-on', !state.igDark);
  $('sw-blanc').setAttribute('aria-checked', String(!state.igDark));
  $('sw-noir').classList.toggle('is-on', state.igDark);
  $('sw-noir').setAttribute('aria-checked', String(state.igDark));
}

function setIgFormat() {
  state.format = $('toggle-ig').checked ? (state.igDark ? 'ig-noir' : 'ig-blanc') : 'polaroid';
  syncIgControls();
  if (state.source) updateDisplay();
  schedulePersist();
}

$('toggle-ig').addEventListener('change', setIgFormat);
$('sw-blanc').addEventListener('click', () => { state.igDark = false; setIgFormat(); });
$('sw-noir').addEventListener('click', () => { state.igDark = true; setIgFormat(); });

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
