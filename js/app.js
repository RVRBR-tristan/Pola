import { PRESETS, applyPreset } from './presets.js';
import { FRAMES, renderPolaroid, renderInstagram, assetsReady } from './frames.js';

const $ = (id) => document.getElementById(id);

const state = {
  source: null,          // canvas plein format de la prise de vue
  preset: PRESETS[0],
  frame: FRAMES[0],
  format: 'polaroid',
  seed: 1,
  facing: 'environment',
  stream: null,
};

const video = $('camera');
const renderCanvas = $('render-canvas');

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
  requestAnimationFrame(() => {
    renderQueued = false;
    const photo = cropToOpening(state.source, state.frame);
    applyPreset(photo, state.preset, state.seed);
    renderPolaroid(renderCanvas, state.frame, photo, state.seed);
    positionDevOverlay();
  });
}

// L'overlay de développement couvre exactement l'ouverture image.
function positionDevOverlay() {
  const o = $('dev-overlay');
  const f = state.frame;
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

/* ── Navigation ─────────────────────────────────────────── */

function showEditor(source) {
  state.source = source;
  state.seed = (Math.random() * 0xffffffff) >>> 0;
  stopCamera();
  $('shoot').classList.remove('is-active');
  $('edit').classList.add('is-active');
  render().then(develop);
}

function showShoot() {
  $('edit').classList.remove('is-active');
  $('shoot').classList.add('is-active');
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
  render();
}

/* ── Export ─────────────────────────────────────────────── */

function exportCanvas() {
  if (state.format === 'polaroid') return renderCanvas;
  return renderInstagram(renderCanvas, state.format === 'ig-noir', state.seed);
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

async function share() {
  const blob = await toBlob(exportCanvas());
  const file = new File([blob], `pola-${stamp()}.png`, { type: 'image/png' });
  try {
    await navigator.share({ files: [file] });
  } catch { /* partage annulé */ }
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

$('btn-back').addEventListener('click', showShoot);

$('format-seg').addEventListener('click', (e) => {
  const btn = e.target.closest('.seg-btn');
  if (!btn) return;
  state.format = btn.dataset.format;
  document.querySelectorAll('#format-seg .seg-btn').forEach((b) => {
    const on = b === btn;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-checked', String(on));
  });
});

$('btn-download').addEventListener('click', download);
if (navigator.canShare && navigator.canShare({ files: [new File([''], 'x.png', { type: 'image/png' })] })) {
  $('btn-share').hidden = false;
  $('btn-share').addEventListener('click', share);
}

/* ── Démarrage ──────────────────────────────────────────── */

buildChips($('film-strip'), PRESETS, state.preset, pickPreset);
buildChips($('edit-film-strip'), PRESETS, state.preset, pickPreset);
buildChips($('frame-strip'), FRAMES, state.frame, pickFrame);
syncPresetUi();
startCamera();

document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopCamera();
  else if ($('shoot').classList.contains('is-active')) startCamera();
});

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js');
}
