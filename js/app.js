'use strict';
/* Cartoon Studio: a small keyframe cartoon editor with audio, Rhubarb lip sync and video export. */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 10);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round2 = v => Math.round(v * 100) / 100;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeName = s => String(s || 'cartoon').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'cartoon';

const PRESETS = {
  vertical: { w: 1080, h: 1920, label: '9:16 Vertical — TikTok, Reels, Stories' },
  portrait: { w: 1080, h: 1350, label: '4:5 Portrait — Instagram / Facebook feed' },
  square:   { w: 1080, h: 1080, label: '1:1 Square — Instagram / Facebook feed' },
  wide:     { w: 1920, h: 1080, label: '16:9 Wide — Facebook / YouTube' },
};
const FPS_OPTIONS = [12, 15, 24, 25, 30, 60];
const SHAPES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'X'];
const SHAPE_INFO = { A: 'M B P', B: 'K S T EE', C: 'EH AE', D: 'AA', E: 'AO ER', F: 'OO W', G: 'F V', H: 'L', X: 'Rest' };
const SHAPE_COLORS = { A: '#ff8fa3', B: '#ffd166', C: '#06d6a0', D: '#4cc9f0', E: '#b8b8ff', F: '#f4a261', G: '#e9c46a', H: '#90be6d', X: '#6c757d' };
const EXPRESSIONS = ['smile', 'grin', 'neutral', 'surprised', 'sad'];
const EASES = { easeInOut: 'Smooth (ease in & out)', linear: 'Steady (linear)', easeIn: 'Speed up', easeOut: 'Slow down', hold: 'Jump (hold, then snap)' };
const ICON = { smiley: '🙂', image: '🖼️', text: '🔤', music: '🎵', voice: '🎙️', sfx: '💥' };
// Eye directions for image characters ('' = the eyes as drawn in the picture).
const LOOKS = ['viewer', 'left', 'right', 'up', 'down', 'up-left', 'up-right', 'down-left', 'down-right', 'closed'];
const LOOK_PAD = ['up-left', 'up', 'up-right', 'left', 'viewer', 'right', 'down-left', 'down', 'down-right'];
const LOOK_ICON = { 'up-left': '↖', up: '↑', 'up-right': '↗', left: '←', viewer: '●', right: '→', 'down-left': '↙', down: '↓', 'down-right': '↘', closed: '—' };
const LOOK_NAME = { viewer: 'at the viewer', closed: 'eyes closed', '': 'as drawn' };
const FONTS = ['Comic Sans MS', 'Arial Black', 'Impact', 'Trebuchet MS', 'Georgia', 'Verdana', 'Courier New'];
const ZOOMS = [0.25, 0.5, 1, 1.5, 2, 3, 4, 6, 8, 10, 14, 18, 24, 32, 44];
const HEAD = 170;

let project = null;
let assets = {};               // id -> { type: 'image' | 'audio', name, data (data URL) }
const imgCache = {}, bufCache = {}, peakCache = {}, fxCache = {};
const VOICE_PRESETS = {
  kid:     { semis: 5,  keep: true,  label: '👦 Cartoon kid' },
  classic: { semis: 5,  keep: false, label: '⏩ Sped-up kid' },
  chip:    { semis: 9,  keep: true,  label: '🐿️ Chipmunk' },
  deep:    { semis: -5, keep: true,  label: '👹 Deep / monster' },
  none:    { semis: 0,  keep: true,  label: 'Normal' },
};
const state = { frame: 0, selLayer: null, selTrack: null, playing: false, ppf: 14, loop: false, onion: false, path: true, safe: true, server: null, zoom: 1 };
let actx = null;
const getActx = () => (actx ||= new (window.AudioContext || window.webkitAudioContext)());

const stage = $('#stage');
const sctx = stage.getContext('2d');

/* ---------------------------------------------------------------- storage */

const DB = {
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('cartoon-studio', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  },
  async get(k) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const q = db.transaction('kv').objectStore('kv').get(k);
      q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
    });
  },
  async set(k, v) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(v, k);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  },
};

let hist = [], hpos = -1, saveTimer = null;
function resetHistory() { hist = [JSON.stringify(project)]; hpos = 0; updateUndo(); }
function commit() {
  const s = JSON.stringify(project);
  if (s === hist[hpos]) return;
  hist = hist.slice(0, hpos + 1);
  hist.push(s);
  if (hist.length > 150) hist.shift();
  hpos = hist.length - 1;
  updateUndo();
  scheduleSave();
}
function undo() { if (hpos > 0) { stopPlay(); project = JSON.parse(hist[--hpos]); afterRestore(); } }
function redo() { if (hpos < hist.length - 1) { stopPlay(); project = JSON.parse(hist[++hpos]); afterRestore(); } }
function afterRestore() {
  if (!getLayer(state.selLayer)) state.selLayer = null;
  if (!getTrack(state.selTrack)) state.selTrack = null;
  state.frame = clamp(state.frame, 0, project.frames - 1);
  updateUndo(); scheduleSave(); renderAll();
  // An undo can bring back a voice effect that hasn't been processed in this session.
  Promise.all(project.tracks.map(T => applyFx(T).catch(() => null))).then(() => buildTimeline());
}
function updateUndo() {
  $('#undoBtn').disabled = hpos <= 0;
  $('#redoBtn').disabled = hpos >= hist.length - 1;
}
function usedAssets() {
  const ids = new Set();
  for (const L of project.layers) {
    if (L.assetId) ids.add(L.assetId);
    for (const id of Object.values(L.mouths || {})) ids.add(id);
    for (const id of Object.values(L.eyes || {})) ids.add(id);
  }
  for (const T of project.tracks) ids.add(T.assetId);
  const out = {};
  for (const id of ids) if (assets[id]) out[id] = assets[id];
  return out;
}
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { DB.set('autosave', { project, assets: usedAssets() }).catch(() => {}); }, 700);
}

/* ---------------------------------------------------------------- project model */

function blankProject(preset = 'vertical', fps = 24, seconds = 5) {
  const p = PRESETS[preset];
  return { version: 1, name: 'Untitled Cartoon', preset, width: p.w, height: p.h, fps, frames: Math.round(seconds * fps), bg: '#8fd3ff', layers: [], tracks: [] };
}

function key(f, x, y, scale, rot = 0, extra = {}) {
  return { f, x, y, scale, rot, opacity: 1, flip: false, ease: 'easeInOut', expr: 'smile', look: '', ...extra };
}

function addDemo(p) {
  const N = p.frames, cx = p.width / 2, cy = p.height / 2;
  const sx = p.width / 1080, sy = p.height / 1920;
  p.layers.push({
    id: uid(), type: 'smiley', name: 'Smiley', visible: true, start: 0, end: N - 1,
    color: '#ffd23f', autoBlink: true, lip: { trackId: null, cues: [], dialog: '', recognizer: 'pocketSphinx' },
    keys: [
      key(0, Math.round(240 * sx), Math.round(cy + 340 * sy), 1.4, -15),
      key(12, Math.round(cx), Math.round(cy - 60 * sy), 1.8, 0),
      key(24, Math.round(840 * sx), Math.round(cy + 340 * sy), 1.4, 15, { expr: 'surprised' }),
      key(36, Math.round(cx), Math.round(cy + 40 * sy), 2.6, 0, { expr: 'grin', ease: 'easeOut' }),
    ],
  });
  p.layers.push({
    id: uid(), type: 'text', name: 'Title', visible: true, start: 36, end: N - 1,
    text: 'Hi there!', font: 'Comic Sans MS', size: 140, bold: true, color: '#ffffff', stroke: '#1d3557',
    keys: [
      key(36, Math.round(cx), Math.round(cy - 540 * sy), 0.2, 0, { opacity: 0, ease: 'easeOut' }),
      key(46, Math.round(cx), Math.round(cy - 540 * sy), 1, -4),
    ],
  });
  return p;
}

function demoProject() {
  const p = blankProject('vertical', 24, 4);
  p.name = 'Smiley Says Hi';
  return addDemo(p);
}

function migrate(p) {
  p.layers ||= []; p.tracks ||= [];
  for (const L of p.layers) {
    L.keys = (L.keys || []).map(k => ({ ...key(0, p.width / 2, p.height / 2, 1), ...k })).sort((a, b) => a.f - b.f);
    if (!L.keys.length) L.keys.push(key(0, p.width / 2, p.height / 2, 1));
    if (L.type !== 'text') L.lip ||= { trackId: null, cues: [], dialog: '', recognizer: 'pocketSphinx' };
    if (L.type === 'image') { L.mouths ||= {}; L.eyes ||= {}; L.autoBlink ??= false; L.mouthX ??= 0; L.mouthY ??= 0; L.mouthScale ??= 1; }
    L.start ??= 0; L.end ??= p.frames - 1; L.visible ??= true;
  }
  for (const T of p.tracks) { T.volume ??= 1; T.start ??= 0; T.muted ??= false; T.fx ??= { semis: 0, keep: true }; }
  return p;
}

const getLayer = id => project.layers.find(l => l.id === id) || null;
const getTrack = id => project.tracks.find(t => t.id === id) || null;
const getSelLayer = () => getLayer(state.selLayer);
const getSelTrack = () => getTrack(state.selTrack);
const keyAt = (L, f) => L.keys.find(k => k.f === f);

function ease(t, type) {
  switch (type) {
    case 'linear': return t;
    case 'hold': return 0;
    case 'easeIn': return t * t;
    case 'easeOut': return 1 - (1 - t) * (1 - t);
    default: return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }
}

// Where a layer is on a given frame: keyframes are copied, frames in between are blended.
function stateAt(L, f) {
  const k = L.keys;
  if (f <= k[0].f) return { ...k[0], f };
  const last = k[k.length - 1];
  if (f >= last.f) return { ...last, f };
  let i = 0;
  while (i < k.length - 2 && k[i + 1].f <= f) i++;
  const a = k[i], b = k[i + 1];
  const t = ease((f - a.f) / (b.f - a.f), a.ease);
  const out = { ...a, f };
  for (const p of ['x', 'y', 'scale', 'rot', 'opacity']) out[p] = a[p] + (b[p] - a[p]) * t;
  return out;
}

function ensureKey(L, f) {
  let k = keyAt(L, f);
  if (!k) {
    k = stateAt(L, f);
    k.f = f;
    L.keys.push(k);
    L.keys.sort((a, b) => a.f - b.f);
  }
  return k;
}
function setAnimProp(L, prop, val) { ensureKey(L, state.frame)[prop] = val; }

function mouthAt(L, f) {
  if (!L.lip || !L.lip.cues.length) return null;
  const T = getTrack(L.lip.trackId);
  // Mouth shapes are timed against the original recording; a sped-up voice reaches them sooner.
  const t = (f / project.fps - (T ? T.start : 0)) * speedOf(T);
  for (const c of L.lip.cues) if (t >= c.start && t < c.end) return c.value;
  return null;
}

/* ---------------------------------------------------------------- voice effects */

const fxActive = T => !!(T && T.fx && T.fx.semis);
const speedOf = T => (fxActive(T) && !T.fx.keep ? Math.pow(2, T.fx.semis / 12) : 1);
const fxKey = T => `${T.assetId}|${fxActive(T) ? T.fx.semis + (T.fx.keep ? 'k' : 's') : 'raw'}`;
// The audio to actually play: the processed voice if it's ready, else the original.
const trackBuf = T => (fxActive(T) && fxCache[fxKey(T)]) || bufCache[T.assetId];

async function applyFx(T) {
  const raw = await decodeAudio(T.assetId);
  if (!fxActive(T)) { T.duration = raw.duration; return raw; }
  const k = fxKey(T);
  if (!fxCache[k]) {
    await new Promise(r => setTimeout(r, 30)); // let the "working" message show first
    const r = Math.pow(2, T.fx.semis / 12), sr = raw.sampleRate, x = AudioUtil.mono(raw);
    const out = T.fx.keep ? AudioUtil.pitchShift(x, r, sr) : AudioUtil.resample(x, r);
    const buf = getActx().createBuffer(1, out.length, sr);
    buf.copyToChannel(out, 0);
    fxCache[k] = buf;
  }
  T.duration = fxCache[k].duration;
  return fxCache[k];
}

async function refreshFx(T) {
  toast('Changing the voice…');
  try { await applyFx(T); } catch (err) { toast('Voice effect failed: ' + err.message); return; }
  commit(); buildTimeline(); renderPanel();
  const synced = project.layers.some(l => l.lip && l.lip.trackId === T.id && l.lip.cues.length);
  toast(fxActive(T) ? 'Voice effect applied' + (synced ? '. Lip sync still lines up.' : '. Press ▶ Listen to hear it.') : 'Voice back to normal');
}

let listenSrc = null;
function listenTrack() {
  const T = getSelTrack();
  if (!T) return;
  stopPlay();
  if (listenSrc) { try { listenSrc.stop(); } catch { /* ended */ } listenSrc = null; return; }
  const buf = trackBuf(T);
  if (!buf) return;
  const ac = getActx(); ac.resume();
  const src = ac.createBufferSource(), g = ac.createGain();
  src.buffer = buf; g.gain.value = T.volume;
  src.connect(g); g.connect(ac.destination);
  src.onended = () => { if (listenSrc === src) listenSrc = null; };
  src.start();
  listenSrc = src;
}

function saveVoiceWav() {
  const T = getSelTrack();
  const buf = T && trackBuf(T);
  if (!buf) return;
  download(AudioUtil.encodeWav(AudioUtil.mono(buf), buf.sampleRate), safeName(T.name) + (fxActive(T) ? '-effect' : '') + '.wav');
}

function isBlink(L, f) {
  const period = Math.round(project.fps * 3.2);
  let h = 0;
  for (const ch of L.id) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return (f + h) % period < Math.max(2, Math.round(project.fps * 0.12));
}

/* ---------------------------------------------------------------- rendering */

const fontOf = L => `${L.bold ? 'bold ' : ''}${L.size}px "${L.font}", sans-serif`;

function bounds(L) {
  if (L.type === 'smiley') return Smiley.bounds;
  if (L.type === 'image') return { x: -L.iw / 2, y: -L.ih / 2, w: L.iw, h: L.ih };
  sctx.save();
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.font = fontOf(L);
  const lines = String(L.text).split('\n');
  const w = Math.max(10, ...lines.map(l => sctx.measureText(l).width));
  sctx.restore();
  const h = lines.length * L.size * 1.15;
  return { x: -w / 2 - 10, y: -h / 2, w: w + 20, h };
}

function drawLayer(ctx, L, f, alphaMul = 1) {
  const s = stateAt(L, f);
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(s.rot * Math.PI / 180);
  ctx.scale(s.scale * (s.flip ? -1 : 1), s.scale);
  ctx.globalAlpha = clamp(s.opacity, 0, 1) * alphaMul;

  if (L.type === 'smiley') {
    Smiley.draw(ctx, { color: L.color, expr: s.expr, mouth: mouthAt(L, f), blink: L.autoBlink && isBlink(L, f) });
  } else if (L.type === 'image') {
    const img = imgCache[L.assetId];
    if (img) ctx.drawImage(img, -L.iw / 2, -L.ih / 2, L.iw, L.ih);
    else { ctx.fillStyle = '#888'; ctx.fillRect(-L.iw / 2, -L.ih / 2, L.iw, L.ih); }
    // Eyes: blinking wins over where they're looking.
    const look = L.autoBlink && L.eyes && L.eyes.closed && isBlink(L, f) ? 'closed' : s.look;
    const ei = look && L.eyes && imgCache[L.eyes[look]];
    if (ei) ctx.drawImage(ei, -ei.naturalWidth / 2, -ei.naturalHeight / 2);
    const shape = mouthAt(L, f) || 'X';
    const mid = L.mouths[shape] || L.mouths.X;
    const mi = mid && imgCache[mid];
    if (mi) {
      const w = mi.naturalWidth * L.mouthScale, h = mi.naturalHeight * L.mouthScale;
      ctx.drawImage(mi, L.mouthX - w / 2, L.mouthY - h / 2, w, h);
    }
  } else if (L.type === 'text') {
    ctx.font = fontOf(L);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const lines = String(L.text).split('\n');
    const lh = L.size * 1.15;
    lines.forEach((ln, i) => {
      const y = (i - (lines.length - 1) / 2) * lh;
      if (L.stroke) { ctx.lineWidth = L.size * 0.14; ctx.lineJoin = 'round'; ctx.strokeStyle = L.stroke; ctx.strokeText(ln, 0, y); }
      ctx.fillStyle = L.color; ctx.fillText(ln, 0, y);
    });
  }
  ctx.restore();
}

function renderFrame(ctx, f, editor = false) {
  const W = project.width, H = project.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = project.bg;
  ctx.fillRect(0, 0, W, H);
  const showTools = editor && !state.playing;
  const sel = showTools ? getSelLayer() : null;

  if (sel && state.onion) {
    const prev = [...sel.keys].reverse().find(k => k.f < f);
    const next = sel.keys.find(k => k.f > f);
    if (prev) drawLayer(ctx, sel, prev.f, 0.25);
    if (next) drawLayer(ctx, sel, next.f, 0.25);
  }
  for (const L of project.layers) {
    if (!L.visible || f < L.start || f > L.end) continue;
    drawLayer(ctx, L, f);
  }
  if (!showTools) return;
  const u = W / Math.max(1, stage.clientWidth); // canvas pixels per screen pixel
  if (state.safe) drawSafeZone(ctx, u);
  if (sel) {
    if (state.path) drawMotionPath(ctx, sel, u);
    drawSelection(ctx, sel, f, u);
  }
}

function drawSafeZone(ctx, u) {
  const W = project.width, H = project.height;
  const r = project.preset === 'vertical'
    ? { l: 0.06 * W, t: 0.11 * H, r: 0.14 * W, b: 0.2 * H }   // phone apps put buttons on the right and captions at the bottom
    : { l: 0.05 * W, t: 0.05 * H, r: 0.05 * W, b: 0.05 * H };
  ctx.save();
  ctx.setLineDash([8 * u, 6 * u]);
  ctx.lineWidth = 1.5 * u;
  ctx.strokeStyle = 'rgba(255,255,255,.55)';
  ctx.strokeRect(r.l, r.t, W - r.l - r.r, H - r.t - r.b);
  ctx.fillStyle = 'rgba(255,255,255,.7)';
  ctx.font = `${12 * u}px system-ui, sans-serif`;
  ctx.fillText('safe zone', r.l + 6 * u, r.t + 16 * u);
  ctx.restore();
}

function drawMotionPath(ctx, L, u) {
  if (L.keys.length < 2) return;
  ctx.save();
  ctx.fillStyle = 'rgba(255,182,39,.8)';
  const a = L.keys[0].f, b = L.keys[L.keys.length - 1].f;
  for (let f = a; f <= b; f++) {
    const s = stateAt(L, f);
    ctx.beginPath(); ctx.arc(s.x, s.y, 2.5 * u, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#4a3a00';
  ctx.lineWidth = 1.5 * u;
  for (const k of L.keys) {
    const d = 5 * u;
    ctx.save(); ctx.translate(k.x, k.y); ctx.rotate(Math.PI / 4);
    ctx.fillStyle = k.f === state.frame ? '#fff' : '#ffd23f';
    ctx.fillRect(-d, -d, d * 2, d * 2); ctx.strokeRect(-d, -d, d * 2, d * 2);
    ctx.restore();
  }
  ctx.restore();
}

function drawSelection(ctx, L, f, u) {
  const s = stateAt(L, f);
  const b = bounds(L);
  const k = Math.abs(s.scale) || 1;
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(s.rot * Math.PI / 180);
  ctx.scale(s.scale * (s.flip ? -1 : 1), s.scale);
  ctx.setLineDash([6 * u / k, 4 * u / k]);
  ctx.lineWidth = 2 * u / k;
  ctx.strokeStyle = '#3d8bfd';
  ctx.strokeRect(b.x, b.y, b.w, b.h);
  ctx.restore();
}

function drawStage() { renderFrame(sctx, state.frame, true); }

function resizeStage() {
  const wrap = $('#stageWrap');
  if (stage.width !== project.width) stage.width = project.width;
  if (stage.height !== project.height) stage.height = project.height;
  const area = $('#stageArea');
  const aw = area.clientWidth - 48, ah = area.clientHeight - 64;
  const fit = Math.max(0.05, Math.min(aw / project.width, ah / project.height));
  const s = fit * state.zoom;
  stage.style.width = Math.floor(project.width * s) + 'px';
  stage.style.height = Math.floor(project.height * s) + 'px';
  $('#zoomLabel').textContent = state.zoom === 1 ? 'Fit' : Math.round(state.zoom * 100) + '%';
  drawStage();
}

/* View zoom for the stage (1 = whole picture fits). Zooms toward a point on screen. */
const VIEW_ZOOMS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8];
function setViewZoom(z, cx, cy) {
  const wrap = $('#stageWrap');
  z = clamp(z, VIEW_ZOOMS[0], VIEW_ZOOMS[VIEW_ZOOMS.length - 1]);
  if (z === state.zoom) return;
  const r = stage.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
  if (cx == null) { cx = wr.left + wr.width / 2; cy = wr.top + wr.height / 2; }
  // Which spot of the picture is under the point, as a fraction of its size.
  const fx = (cx - r.left) / r.width, fy = (cy - r.top) / r.height;
  state.zoom = z;
  resizeStage();
  const r2 = stage.getBoundingClientRect();
  wrap.scrollLeft += r2.left + fx * r2.width - cx;
  wrap.scrollTop += r2.top + fy * r2.height - cy;
}
function stepViewZoom(dir, cx, cy) {
  const i = VIEW_ZOOMS.findIndex(z => z >= state.zoom - 1e-9);
  const next = dir > 0 ? VIEW_ZOOMS[Math.min(VIEW_ZOOMS.length - 1, VIEW_ZOOMS[i] > state.zoom + 1e-9 ? i : i + 1)]
                       : VIEW_ZOOMS[Math.max(0, i - 1)];
  setViewZoom(next, cx, cy);
}

function hitTest(px, py, f) {
  for (let i = project.layers.length - 1; i >= 0; i--) {
    const L = project.layers[i];
    if (!L.visible || f < L.start || f > L.end) continue;
    const s = stateAt(L, f);
    if (!s.scale) continue;
    const r = -s.rot * Math.PI / 180, c = Math.cos(r), sn = Math.sin(r);
    const dx = px - s.x, dy = py - s.y;
    const lx = (dx * c - dy * sn) / (s.scale * (s.flip ? -1 : 1));
    const ly = (dx * sn + dy * c) / s.scale;
    const b = bounds(L);
    if (lx >= b.x && lx <= b.x + b.w && ly >= b.y && ly <= b.y + b.h) return L;
  }
  return null;
}

/* ---------------------------------------------------------------- playback */

let playInfo = null, exp = null;

function play(opts = {}) {
  if (state.playing) return;
  const ac = getActx();
  ac.resume();
  if (state.frame >= project.frames - 1) state.frame = 0;
  const startT = state.frame / project.fps;
  const endT = project.frames / project.fps;
  const t0 = ac.currentTime + 0.06;
  const sources = [];
  for (const T of project.tracks) {
    const buf = trackBuf(T);
    if (!buf || T.muted) continue;
    const rel = startT - T.start;
    if (rel >= buf.duration) continue;
    const src = ac.createBufferSource();
    src.buffer = buf;
    const g = ac.createGain();
    g.gain.value = T.volume;
    src.connect(g);
    g.connect(ac.destination);
    if (opts.dest) g.connect(opts.dest);
    if (rel >= 0) src.start(t0, rel); else src.start(t0 - rel, 0);
    src.stop(t0 + (endT - startT));
    sources.push(src);
  }
  playInfo = { t0, startT, sources, opts };
  state.playing = true;
  updateTransport();
  drawStage();
  requestAnimationFrame(tick);
}

function tick() {
  if (!state.playing) return;
  const ac = getActx();
  const t = playInfo.startT + Math.max(0, ac.currentTime - playInfo.t0);
  const f = Math.floor(t * project.fps + 1e-6);
  if (f >= project.frames) {
    const opts = playInfo.opts;
    if (state.loop && !opts.dest) { stopPlay(); state.frame = 0; play(); return; }
    state.frame = project.frames - 1;
    stopPlay();
    if (opts.onEnd) opts.onEnd();
    return;
  }
  if (f !== state.frame || exp) {
    state.frame = f;
    drawStage();
    if (exp) {
      renderFrame(exp.ectx, f);
      const bar = $('#expBar');
      if (bar) bar.style.width = ((f + 1) / project.frames * 100) + '%';
    }
    updatePlayhead(true);
    updateTransport();
  }
  requestAnimationFrame(tick);
}

function stopPlay() {
  if (!state.playing) return;
  state.playing = false;
  for (const s of playInfo.sources) { try { s.stop(); } catch { /* already stopped */ } }
  playInfo = null;
  updateTransport();
  drawStage();
  renderPanel();
}

function togglePlay() { state.playing ? stopPlay() : play(); }

// follow: also scroll the timeline so the playhead is in view (for jumps, not for scrubbing).
function setFrame(f, follow = false) {
  if (state.playing) stopPlay();
  state.frame = clamp(Math.round(f), 0, project.frames - 1);
  drawStage();
  updatePlayhead(follow);
  updateTransport();
  $$('.kf').forEach(el => el.classList.toggle('cur', +el.dataset.f === state.frame && el.closest('.tl-row').dataset.layer === state.selLayer));
  renderPanel();
}

/* ---------------------------------------------------------------- media */

function readAsDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result); r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
}

function loadImage(id) {
  return new Promise(res => {
    if (imgCache[id]) return res(imgCache[id]);
    const img = new Image();
    img.onload = () => { imgCache[id] = img; res(img); };
    img.onerror = () => res(null);
    img.src = assets[id].data;
  });
}

async function decodeAudio(id) {
  if (bufCache[id]) return bufCache[id];
  const ab = await (await fetch(assets[id].data)).arrayBuffer();
  bufCache[id] = await getActx().decodeAudioData(ab);
  return bufCache[id];
}

function pickFile(accept, cb) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = accept;
  inp.onchange = () => { if (inp.files[0]) Promise.resolve(cb(inp.files[0])).catch(err => { console.error(err); alert('Could not load that file: ' + err.message); }); };
  inp.click();
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ---------------------------------------------------------------- adding things */

function newLayer(type, extra, scale = 1) {
  const L = {
    id: uid(), type, name: type, visible: true, start: 0, end: project.frames - 1,
    keys: [key(state.frame, Math.round(project.width / 2), Math.round(project.height / 2), scale)],
    ...extra,
  };
  project.layers.push(L);
  state.selLayer = L.id; state.selTrack = null;
  commit(); renderAll();
  return L;
}

function addSmiley() {
  const n = project.layers.filter(l => l.type === 'smiley').length + 1;
  const voice = project.tracks.find(t => t.kind === 'voice');
  newLayer('smiley', {
    name: n > 1 ? `Smiley ${n}` : 'Smiley', color: '#ffd23f', autoBlink: true,
    lip: { trackId: voice ? voice.id : null, cues: [], dialog: '', recognizer: 'pocketSphinx' },
  }, 2);
}

function addText() {
  newLayer('text', { name: 'Text', text: 'Your text', font: 'Comic Sans MS', size: 110, bold: true, color: '#ffffff', stroke: '#1d3557' });
}

async function importImage(file) {
  const id = uid();
  assets[id] = { type: 'image', name: file.name, data: await readAsDataURL(file) };
  const img = await loadImage(id);
  if (!img) throw new Error('not a picture this browser can read');
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const scale = round2(Math.min(1, 0.6 * project.width / iw, 0.6 * project.height / ih));
  newLayer('image', {
    name: file.name.replace(/\.[^.]+$/, ''), assetId: id, iw, ih,
    mouths: {}, mouthX: 0, mouthY: Math.round(ih * 0.2), mouthScale: 1,
    lip: { trackId: null, cues: [], dialog: '', recognizer: 'pocketSphinx' },
  }, scale);
}

async function importAudio(kind, file) {
  const id = uid();
  assets[id] = { type: 'audio', name: file.name, data: await readAsDataURL(file) };
  let buf;
  try { buf = await decodeAudio(id); } catch { delete assets[id]; throw new Error('this browser cannot play that audio format (try MP3, WAV or OGG)'); }
  const T = {
    id: uid(), name: file.name.replace(/\.[^.]+$/, ''), kind, assetId: id,
    start: kind === 'music' ? 0 : round2(state.frame / project.fps),
    volume: kind === 'music' ? 0.5 : 1, muted: false, duration: buf.duration, fx: { semis: 0, keep: true },
  };
  project.tracks.push(T);
  const endT = T.start + T.duration, movieT = project.frames / project.fps;
  if (kind !== 'music' && endT > movieT + 0.01 &&
      confirm(`This audio runs to ${endT.toFixed(1)}s but the movie is ${movieT.toFixed(1)}s long.\n\nMake the movie longer so all of it fits?`)) {
    applyProjectProp('seconds', Math.ceil(endT * 10) / 10);
  }
  // Hook a new voice up to a character that doesn't have one yet.
  if (kind === 'voice') {
    const sel = getSelLayer();
    const target = (sel && sel.lip && !getTrack(sel.lip.trackId)) ? sel
      : project.layers.find(l => l.lip && !getTrack(l.lip.trackId));
    if (target) target.lip.trackId = T.id;
  }
  state.selTrack = T.id; state.selLayer = null;
  commit(); renderAll();
  toast(`Added ${kind}: ${T.name}`);
}

/* ---------------------------------------------------------------- Rhubarb lip sync */

function parseRhubarb(text) {
  text = text.trim();
  let cues = [];
  if (text.startsWith('{')) {
    cues = (JSON.parse(text).mouthCues || []).map(c => ({ start: +c.start, end: +c.end, value: String(c.value).trim() }));
  } else if (text.startsWith('<')) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    cues = [...doc.getElementsByTagName('mouthCue')].map(c => ({ start: +c.getAttribute('start'), end: +c.getAttribute('end'), value: c.textContent.trim() }));
  } else {
    const rows = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => l.split(/\s+/));
    cues = rows.map((r, i) => ({ start: +r[0], end: i + 1 < rows.length ? +rows[i + 1][0] : +r[0] + 0.1, value: r[1] }));
  }
  cues = cues.filter(c => SHAPES.includes(c.value) && isFinite(c.start) && isFinite(c.end));
  if (!cues.length) throw new Error('no mouth shapes found in that file');
  return cues;
}

function setLipStatus(msg, err = false) {
  const el = $('#lipStatus');
  if (el) { el.textContent = msg; el.classList.toggle('err', err); }
}

async function autoLip(btn) {
  const L = getSelLayer();
  const T = L && getTrack(L.lip.trackId);
  if (!T) return toast('Pick a voice track first');
  if (!state.server || !state.server.rhubarb) return rhubarbHelp();
  btn.disabled = true;
  try {
    setLipStatus('Preparing audio…');
    const buf = await decodeAudio(T.assetId);
    const wav = await AudioUtil.toWav16kMono(buf);
    const b64 = await AudioUtil.blobToBase64(wav);
    setLipStatus('Rhubarb is listening to the voice… this can take about as long as the clip.');
    const r = await fetch((state.api || '') + 'api/rhubarb', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wav: b64, dialog: L.lip.dialog || '', recognizer: L.lip.recognizer || 'pocketSphinx' }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || r.statusText);
    const layer = getLayer(L.id);
    if (!layer) return;
    layer.lip.cues = parseRhubarb(JSON.stringify(j));
    commit(); renderAll();
    toast(`Lip sync done: ${layer.lip.cues.length} mouth shapes`);
  } catch (err) {
    setLipStatus('Problem: ' + err.message, true);
    btn.disabled = false;
  }
}

function importLip() {
  const L = getSelLayer();
  if (!L) return;
  pickFile('.json,.tsv,.txt,.xml', async file => {
    L.lip.cues = parseRhubarb(await file.text());
    commit(); renderAll();
    toast(`Loaded ${L.lip.cues.length} mouth shapes` + (getTrack(L.lip.trackId) ? '' : '. Pick the voice track so they line up.'));
  });
}

async function checkServer() {
  const el = $('#serverStatus');
  // Use this page's own server if it is ours; otherwise (Live Server, or the file opened
  // directly) look for the Cartoon Studio server that start.bat runs.
  state.server = null;
  const bases = location.protocol.startsWith('http') ? ['', 'http://localhost:5173/'] : ['http://localhost:5173/'];
  for (const base of bases) {
    try {
      const r = await fetch(base + 'api/status');
      const j = r.ok ? await r.json() : null;
      if (j && 'rhubarb' in j) { state.server = j; state.api = base; break; }
    } catch { /* try the next one */ }
  }
  if (!state.server) {
    el.className = 'status no';
    el.innerHTML = 'Lip sync server isn\'t running. Double-click <b>start.bat</b>, keep its window open, then refresh this page.';
    renderPanel();
    return;
  }
  if (state.server.rhubarb) {
    el.className = 'status ok';
    el.textContent = `✓ Rhubarb ready${state.server.version ? ' (' + state.server.version.replace(/^Rhubarb Lip Sync version /i, 'v') + ')' : ''}`;
  } else {
    el.className = 'status no';
    el.textContent = state.server ? 'Rhubarb not found yet. See setup below.' : 'Server not reachable. Auto lip sync is off.';
  }
  renderPanel();
}

/* ---------------------------------------------------------------- export */

function pickMime() {
  const hi = project.fps > 30 ? '64002A' : '640028';
  const list = [
    `video/mp4;codecs="avc1.${hi},mp4a.40.2"`, 'video/mp4;codecs="avc1.42E01F,mp4a.40.2"', 'video/mp4',
    'video/webm;codecs="vp9,opus"', 'video/webm;codecs="vp8,opus"', 'video/webm',
  ];
  return window.MediaRecorder ? list.find(m => MediaRecorder.isTypeSupported(m)) || '' : '';
}

function exportVideo() {
  stopPlay();
  const mime = pickMime();
  const secs = (project.frames / project.fps).toFixed(1);
  const isMp4 = mime.startsWith('video/mp4');
  showModal(`
    <h2>🎬 Export video</h2>
    <p><b>${project.width}×${project.height}</b> · ${project.fps} fps · ${secs} seconds</p>
    ${!mime ? `<p>This browser can't record video. Please use <b>Google Chrome</b> or <b>Microsoft Edge</b>.</p>`
      : isMp4 ? `<p>File type: <b>MP4</b>, ready for TikTok, Instagram and Facebook.</p>`
      : `<p>File type: <b>WebM</b>. This browser can't record MP4. TikTok and Instagram want MP4, so use an up-to-date Chrome or Edge, or convert the file (see README).</p>`}
    <p class="hint">Your movie plays through once in real time while it records. Keep this tab open and in front until it finishes.</p>
    <div class="progress"><div id="expBar"></div></div>
    <div id="expResult"></div>
    <div class="row"><button data-act="closeModal">Close</button><button class="primary" id="expGo" data-act="runExport" ${mime ? '' : 'disabled'}>Start export</button></div>`);
}

async function runExport() {
  if (exp) return;
  const mime = pickMime();
  const ec = document.createElement('canvas');
  ec.width = project.width; ec.height = project.height;
  ec.style.cssText = 'position:fixed;left:-99999px;top:0;width:10px;height:10px';
  document.body.appendChild(ec);
  const ectx = ec.getContext('2d');
  state.frame = 0;
  renderFrame(ectx, 0);
  const ac = getActx();
  await ac.resume();
  const dest = ac.createMediaStreamDestination();
  const vs = ec.captureStream(project.fps);
  const stream = new MediaStream([...vs.getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12_000_000, audioBitsPerSecond: 192_000 });
  const chunks = [];
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  exp = { rec, ectx, cancelled: false };
  rec.onstop = () => {
    const cancelled = exp ? exp.cancelled : true;
    exp = null;
    ec.remove();
    stream.getTracks().forEach(t => t.stop());
    if (cancelled) return;
    const blob = new Blob(chunks, { type: mime.split(';')[0] });
    const name = safeName(project.name) + (mime.startsWith('video/mp4') ? '.mp4' : '.webm');
    const url = URL.createObjectURL(blob);
    const res = $('#expResult');
    if (res) res.innerHTML = `<p>✅ Done! ${(blob.size / 1048576).toFixed(1)} MB</p><a class="btn primary" href="${url}" download="${esc(name)}">⬇ Download ${esc(name)}</a>`;
    const go = $('#expGo'); if (go) go.remove();
    download(blob, name);
  };
  $('#expGo').disabled = true;
  $('#expGo').textContent = 'Recording…';
  rec.start(500);
  play({ dest, onEnd: () => setTimeout(() => { if (rec.state !== 'inactive') rec.stop(); }, 250) });
}

function cancelExport() {
  if (!exp) return;
  exp.cancelled = true;
  stopPlay();
  if (exp.rec.state !== 'inactive') exp.rec.stop();
}

function snapshot() {
  const c = document.createElement('canvas');
  c.width = project.width; c.height = project.height;
  renderFrame(c.getContext('2d'), state.frame);
  c.toBlob(b => download(b, `${safeName(project.name)}-frame-${state.frame + 1}.png`), 'image/png');
}

/* ---------------------------------------------------------------- save / open */

function saveProject() {
  const data = JSON.stringify({ app: 'CartoonStudio', version: 1, project, assets: usedAssets() });
  download(new Blob([data], { type: 'application/json' }), safeName(project.name) + '.cartoon.json');
  toast('Project saved to your Downloads folder');
}

function openProject() {
  pickFile('.json', async file => {
    const data = JSON.parse(await file.text());
    if (!data.project) throw new Error('that is not a Cartoon Studio project');
    await loadData(data);
    toast('Opened ' + project.name);
  });
}

async function loadData(data) {
  stopPlay();
  project = migrate(data.project);
  assets = data.assets || {};
  for (const c of [imgCache, bufCache, peakCache]) for (const k in c) delete c[k];
  state.frame = 0; state.selLayer = null; state.selTrack = null;
  await Promise.all(Object.keys(assets).map(id => assets[id].type === 'image' ? loadImage(id) : decodeAudio(id).catch(() => null)));
  for (const T of project.tracks) await applyFx(T).catch(() => null);
  resetHistory(); renderAll(); scheduleSave();
  repairCharacters();
}

/* ---------------------------------------------------------------- modal dialogs */

function showModal(html) {
  closeModal(true);
  const bg = document.createElement('div');
  bg.className = 'modal-bg'; bg.id = 'modalBg';
  bg.innerHTML = `<div class="modal">${html}</div>`;
  bg.addEventListener('pointerdown', e => { if (e.target === bg) closeModal(); });
  document.body.appendChild(bg);
}
function closeModal() {
  const m = $('#modalBg');
  if (!m) return;
  cancelExport();
  m.remove();
}

function newProjectDialog() {
  showModal(`
    <h2>New cartoon</h2>
    <p>Pick the shape of your video. You can change it later.</p>
    <div class="presets">${Object.entries(PRESETS).map(([k, p]) =>
      `<button data-act="createProject" data-preset="${k}"><b>${p.label}</b><br><span class="hint">${p.w}×${p.h}</span></button>`).join('')}
    </div>
    <label class="check" style="margin-top:12px"><input type="checkbox" id="withDemo" checked> Start with the bouncing smiley demo</label>
    <p class="hint">This replaces what's open now. Click <b>Save</b> first if you want to keep it.</p>
    <div class="row"><button data-act="closeModal">Cancel</button></div>`);
}

function createProject(btn) {
  const p = blankProject(btn.dataset.preset, 24, 4);
  if ($('#withDemo').checked) addDemo(p);
  closeModal();
  loadData({ project: p, assets: {} });
}

function rhubarbHelp() {
  showModal(`
    <h2>👄 Setting up Rhubarb lip sync</h2>
    <p>Rhubarb listens to a voice recording and works out which mouth shape to show on every frame.</p>
    <ol>
      <li>Download <b>Rhubarb Lip Sync</b> for Windows from <code>github.com/DanielSWolf/rhubarb-lip-sync/releases</code>.</li>
      <li>Unzip it into the <code>rhubarb</code> folder inside this editor's folder (so you have <code>rhubarb\\…\\rhubarb.exe</code>).</li>
      <li>Close this page and double-click <b>start.bat</b>. The editor opens with auto lip sync turned on.</li>
    </ol>
    <p>Then: add a <b>Voice</b> track, select your character, pick the voice in its Lip Sync section, and press <b>Auto lip sync</b>. Typing what's said in the Dialog box makes it more accurate.</p>
    <h4 style="margin-top:14px">Prefer the command line?</h4>
    <pre>rhubarb -f json -o voice.json voice.wav</pre>
    <p>Then use <b>Import Rhubarb file</b> on your character. JSON, TSV and XML all work.</p>
    <div class="row"><button class="primary" data-act="closeModal">Got it</button></div>`);
}

function helpDialog() {
  const rows = [
    ['Space', 'Play / pause'], ['← / →', 'Previous / next frame'], ['Shift + ← / →', 'Jump 1 second'],
    ['Home / End', 'First / last frame'], [', / .', 'Previous / next keyframe'], ['K', 'Add keyframe on this frame'],
    ['Delete', 'Remove keyframe on this frame'], ['Shift + Delete', 'Delete the selected layer'],
    ['Ctrl + D', 'Duplicate layer'], ['Ctrl + Z / Ctrl + Y', 'Undo / redo'], ['Ctrl + S', 'Save project file'],
    ['Scroll on stage', 'Resize selected'], ['Ctrl + scroll on stage, or + / −', 'Zoom the picture in / out'], ['0', 'Fit the whole picture'], ['Middle-mouse drag', 'Move around when zoomed in'], ['Shift + scroll on stage', 'Rotate selected'], ['Ctrl + scroll on timeline', 'Zoom timeline'],
    ['Esc', 'Deselect'],
  ];
  showModal(`
    <h2>Help & shortcuts</h2>
    <p><b>Animating:</b> pick a frame, then move, resize or rotate a character. That frame becomes a keyframe ◆. Do it again on a later frame and the editor fills in the movement between them. Drag ◆ on the timeline to change timing.</p>
    <p><b>Your work saves itself</b> in this browser. Use <b>Save</b> to keep a file you can back up or move to another computer.</p>
    <table class="keys">${rows.map(r => `<tr><td><kbd>${r[0]}</kbd></td><td>${r[1]}</td></tr>`).join('')}</table>
    <div class="row"><button class="primary" data-act="closeModal">Close</button></div>`);
}

/* ---------------------------------------------------------------- timeline */

function rulerHTML(N, ppf) {
  const step = [1, 2, 4, 6, 12, 24, 48, 96, 240, 480].find(s => s * ppf >= 36) || 960;
  let h = '';
  for (let i = 0; i < N; i++) if (i === 0 || (i + 1) % step === 0) h += `<span style="left:${i * ppf}px">${i + 1}</span>`;
  return h;
}

function lipStrip(L) {
  if (!L.lip || !L.lip.cues.length) return '';
  const T = getTrack(L.lip.trackId);
  const off = T ? T.start : 0, sp = speedOf(T), k = project.fps * state.ppf, endX = project.frames * state.ppf;
  return L.lip.cues.map(c => {
    const x = (c.start / sp + off) * k;
    const w = Math.min((c.end / sp + off) * k, endX) - x;
    if (w <= 0) return '';
    return `<div class="lip" style="left:${x}px;width:${w}px;background:${SHAPE_COLORS[c.value]}">${w > 9 ? c.value : ''}</div>`;
  }).join('');
}

function buildTimeline() {
  const N = project.frames, ppf = state.ppf, fps = project.fps;
  // A little room after the end, so the end marker can be dragged later too.
  const extra = Math.max(fps * 2, Math.ceil(160 / ppf)), W = (N + extra) * ppf;
  const bg = `width:${W}px;background-size:${ppf}px 100%,${fps * ppf}px 100%`;
  let h = `<div class="tl-row tl-ruler"><div class="tl-head">Frame</div><div class="tl-track" style="${bg}">${rulerHTML(N, ppf)}</div></div>`;
  for (const L of [...project.layers].reverse()) {
    const sel = L.id === state.selLayer;
    h += `<div class="tl-row ${sel ? 'sel' : ''}" data-layer="${L.id}">
      <div class="tl-head"><button class="ico" data-act="toggleVis" data-id="${L.id}" title="Show / hide">${L.visible ? '👁' : '◌'}</button><span>${ICON[L.type]}</span><span class="tname">${esc(L.name)}</span></div>
      <div class="tl-track" style="${bg}">
        <div class="range" style="left:${L.start * ppf}px;width:${(L.end - L.start + 1) * ppf}px"></div>
        ${lipStrip(L)}
        ${L.keys.map(k => `<div class="kf ${sel && k.f === state.frame ? 'cur' : ''}" data-f="${k.f}" style="left:${k.f * ppf + ppf / 2}px" title="Keyframe at frame ${k.f + 1}"></div>`).join('')}
      </div></div>`;
  }
  for (const T of project.tracks) {
    const sel = T.id === state.selTrack;
    const bw = Math.max(4, T.duration * fps * ppf);
    h += `<div class="tl-row ${sel ? 'sel' : ''}" data-track="${T.id}">
      <div class="tl-head"><button class="ico" data-act="toggleMute" data-id="${T.id}" title="Mute">${T.muted ? '🔇' : '🔊'}</button><span>${ICON[T.kind]}</span><span class="tname">${esc(T.name)}</span></div>
      <div class="tl-track" style="${bg}">
        <div class="abar ${T.kind} ${sel ? 'sel' : ''} ${T.muted ? 'muted' : ''}" style="left:${T.start * fps * ppf}px;width:${bw}px">
          <canvas class="wave" data-track="${T.id}" width="${Math.min(6000, Math.ceil(bw))}" height="28"></canvas><span>${esc(T.name)}</span>
        </div>
      </div></div>`;
  }
  h += '<div id="playhead"></div>';
  h += `<div id="endZone" style="left:${HEAD + N * ppf}px;width:${extra * ppf}px"></div>
    <div id="endHandle" style="left:${HEAD + N * ppf}px" title="The movie ends here. Drag to make it shorter or longer."><span>END</span></div>`;
  const c = $('#tlContent');
  c.innerHTML = h;
  c.style.width = (HEAD + W) + 'px';
  $('#endHandle').addEventListener('pointerdown', dragEnd);
  drawWaves();
  updatePlayhead();
}

// Drag a layer's name up or down to change what's drawn in front.
// The timeline lists the front-most layer at the top.
function dragLayerRow(e, id) {
  const y0 = e.clientY;
  let dragging = false, target = null;
  const content = $('#tlContent');
  startDrag(e, ev => {
    if (!dragging && Math.abs(ev.clientY - y0) < 5) return;
    const rows = $$('.tl-row[data-layer]', content);
    if (!dragging) {
      dragging = true;
      rows.find(r => r.dataset.layer === id)?.classList.add('dragging');
      content.insertAdjacentHTML('beforeend', '<div id="dropLine"></div>');
    }
    // Drop position: before the first row whose middle is below the pointer.
    let idx = rows.findIndex(r => { const b = r.getBoundingClientRect(); return ev.clientY < b.top + b.height / 2; });
    if (idx < 0) idx = rows.length;
    target = idx;
    const ref = rows[Math.min(idx, rows.length - 1)], cb = content.getBoundingClientRect(), rb = ref.getBoundingClientRect();
    $('#dropLine').style.top = ((idx < rows.length ? rb.top : rb.bottom) - cb.top - 1) + 'px';
  }, () => {
    if (!dragging) return;
    $('#dropLine')?.remove();
    const order = $$('.tl-row[data-layer]', content).map(r => r.dataset.layer);   // front first
    const from = order.indexOf(id);
    order.splice(from, 1);
    order.splice(target > from ? target - 1 : target, 0, id);
    const next = order.slice().reverse().map(getLayer);                              // back first
    if (next.some((L, i) => L !== project.layers[i])) {
      project.layers = next;
      commit();
    }
    renderAllLight();
  });
}

/* Right-click menu for layers and audio tracks. */
function showMenu(x, y, items) {
  hideMenu();
  const m = document.createElement('div');
  m.id = 'ctxMenu';
  m.innerHTML = items.map(it => it === '-' ? '<hr>' : `<button data-act="${it.act}" class="${it.danger ? 'danger' : ''}">${it.label}</button>`).join('');
  document.body.appendChild(m);
  const r = m.getBoundingClientRect();
  m.style.left = Math.min(x, innerWidth - r.width - 6) + 'px';
  m.style.top = Math.min(y, innerHeight - r.height - 6) + 'px';
}
function hideMenu() { $('#ctxMenu')?.remove(); }
document.addEventListener('pointerdown', e => { if (!e.target.closest('#ctxMenu')) hideMenu(); }, true);
document.addEventListener('click', e => { if (e.target.closest('#ctxMenu [data-act]')) setTimeout(hideMenu); });
window.addEventListener('blur', hideMenu);

const LAYER_MENU = [
  { act: 'dupLayer', label: '⧉ Copy (Ctrl+D)' },
  { act: 'delLayer', label: '🗑 Delete (Shift+Del)', danger: true },
  '-',
  { act: 'layerToFront', label: '⤒ Bring to front' },
  { act: 'fwdLayer', label: '⬆ Bring forward' },
  { act: 'backLayer', label: '⬇ Send backward' },
  { act: 'layerToBack', label: '⤓ Send to back' },
];
function openLayerMenu(e, id) {
  e.preventDefault();
  stopPlay();
  if (state.selLayer !== id) selectLayer(id);
  showMenu(e.clientX, e.clientY, LAYER_MENU);
}
$('#tlContent').addEventListener('contextmenu', e => {
  const row = e.target.closest('.tl-row');
  if (!row) return;
  const kf = e.target.closest('.kf');
  if (kf && row.dataset.layer) {
    // Right-click a keyframe: jump to it and offer to remove it.
    e.preventDefault();
    state.selLayer = row.dataset.layer; state.selTrack = null;
    setFrame(+kf.dataset.f); buildTimeline();
    const only = getLayer(row.dataset.layer).keys.length < 2;
    showMenu(e.clientX, e.clientY, only
      ? [{ act: 'noop', label: 'This is the only keyframe, so it can\'t be removed' }]
      : [{ act: 'delKey', label: `🗑 Delete keyframe at frame ${+kf.dataset.f + 1}`, danger: true }]);
    return;
  }
  if (row.dataset.layer) openLayerMenu(e, row.dataset.layer);
  else if (row.dataset.track) {
    e.preventDefault();
    if (state.selTrack !== row.dataset.track) selectTrack(row.dataset.track);
    showMenu(e.clientX, e.clientY, [{ act: 'delTrack', label: '🗑 Delete audio', danger: true }]);
  }
});
stage.addEventListener('contextmenu', e => {
  const p = toStage(e), L = hitTest(p.x, p.y, state.frame);
  if (L) openLayerMenu(e, L.id); else e.preventDefault();
});

// Drag the END marker to change the movie's length.
function dragEnd(e) {
  if (e.button !== 0) return;
  e.preventDefault(); e.stopPropagation();
  stopPlay();
  const handle = e.currentTarget, zone = $('#endZone');
  const left = $('#tlContent').getBoundingClientRect().left + HEAD;
  const maxF = project.frames + Math.max(project.fps * 2, Math.ceil(160 / state.ppf));
  let nf = project.frames;
  startDrag(e, ev => {
    nf = clamp(Math.round((ev.clientX - left) / state.ppf), 1, maxF);
    handle.style.left = zone.style.left = (HEAD + nf * state.ppf) + 'px';
    $('#frameInfo').textContent = `Movie ends after frame ${nf}  ·  ${(nf / project.fps).toFixed(2)}s`;
  }, () => {
    if (nf !== project.frames) {
      applyProjectProp('seconds', nf / project.fps);
      commit();
      toast(`Movie is now ${(project.frames / project.fps).toFixed(2)} seconds`);
    }
    renderAll();
  });
}

function drawWaves() {
  for (const cv of $$('#tlContent canvas.wave')) {
    const T = getTrack(cv.dataset.track);
    const buf = T && trackBuf(T);
    if (!buf) continue;
    const w = cv.width, h = cv.height, k = fxKey(T) + ':' + w;
    const peaks = peakCache[k] ||= AudioUtil.peaks(buf, w);
    const g = cv.getContext('2d');
    g.fillStyle = 'rgba(255,255,255,.5)';
    for (let x = 0; x < w; x++) {
      const p = Math.max(1, peaks[x] * h * 0.9);
      g.fillRect(x, (h - p) / 2, 1, p);
    }
  }
}

function updatePlayhead(follow = false) {
  const ph = $('#playhead');
  if (!ph) return;
  const x = HEAD + state.frame * state.ppf;
  ph.style.left = x + 'px';
  ph.style.width = Math.max(2, state.ppf) + 'px';
  const sc = $('#tlScroll');
  if (follow && (x > sc.scrollLeft + sc.clientWidth - 40 || x < sc.scrollLeft + HEAD)) sc.scrollLeft = x - HEAD - 40;
}

function startDrag(e, move, up) {
  const mv = ev => move(ev);
  const end = ev => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', end); up && up(ev); };
  window.addEventListener('pointermove', mv);
  window.addEventListener('pointerup', end);
}

$('#tlContent').addEventListener('pointerdown', e => {
  if (e.button !== 0 || e.target.closest('[data-act]')) return;
  const row = e.target.closest('.tl-row');
  if (!row) return;
  if (e.target.closest('.tl-head')) {
    if (row.dataset.layer) { selectLayer(row.dataset.layer); dragLayerRow(e, row.dataset.layer); }
    else if (row.dataset.track) selectTrack(row.dataset.track);
    return;
  }
  const track = e.target.closest('.tl-track');
  if (!track) return;
  e.preventDefault();
  stopPlay();
  const rect = track.getBoundingClientRect();
  const frameAt = ev => clamp(Math.floor((ev.clientX - rect.left) / state.ppf), 0, project.frames - 1);

  const kfEl = e.target.closest('.kf');
  if (kfEl) {
    const L = getLayer(row.dataset.layer);
    const k = keyAt(L, +kfEl.dataset.f);
    state.selLayer = L.id; state.selTrack = null;
    let moved = false;
    state.frame = k.f;
    buildTimeline(); drawStage(); renderPanel(); updateTransport();
    startDrag(e, ev => {
      const nf = frameAt(ev);
      if (nf !== k.f && !L.keys.some(o => o !== k && o.f === nf)) {
        k.f = nf; L.keys.sort((a, b) => a.f - b.f); moved = true;
        state.frame = nf; buildTimeline(); drawStage(); updateTransport();
      }
    }, () => { if (moved) commit(); renderPanel(); });
    return;
  }

  const bar = e.target.closest('.abar');
  if (bar) {
    const T = getTrack(row.dataset.track);
    state.selTrack = T.id; state.selLayer = null;
    const x0 = e.clientX, s0 = T.start;
    let moved = false;
    buildTimeline(); renderPanel(); drawStage();
    startDrag(e, ev => {
      const ns = Math.max(0, round2(s0 + Math.round((ev.clientX - x0) / state.ppf) / project.fps));
      if (ns !== T.start) { T.start = ns; moved = true; buildTimeline(); }
    }, () => { if (moved) { commit(); renderPanel(); } });
    return;
  }

  if (row.dataset.layer) { state.selLayer = row.dataset.layer; state.selTrack = null; }
  else if (row.dataset.track) { state.selTrack = row.dataset.track; state.selLayer = null; }
  state.frame = frameAt(e);
  buildTimeline(); setFrame(state.frame);
  startDrag(e, ev => { const f = frameAt(ev); if (f !== state.frame) setFrame(f); });
});

$('#tlScroll').addEventListener('wheel', e => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  zoom(e.deltaY < 0 ? 1 : -1);
}, { passive: false });

function zoom(dir) {
  const i = ZOOMS.indexOf(state.ppf);
  state.ppf = ZOOMS[clamp((i < 0 ? 6 : i) + dir, 0, ZOOMS.length - 1)];
  buildTimeline();
  updatePlayhead(true);
}

/* ---------------------------------------------------------------- stage interaction */

function toStage(e) {
  const r = stage.getBoundingClientRect();
  return { x: (e.clientX - r.left) * project.width / r.width, y: (e.clientY - r.top) * project.height / r.height };
}

let stageDrag = null, wheelTimer = null;
stage.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  stopPlay();
  const p = toStage(e);
  const L = hitTest(p.x, p.y, state.frame);
  if (!L) { deselect(); return; }
  if (L.id !== state.selLayer) { state.selLayer = L.id; state.selTrack = null; renderPanel(); }
  const s = stateAt(L, state.frame);
  stageDrag = { L, px: p.x, py: p.y, x: s.x, y: s.y, moved: false };
  stage.setPointerCapture(e.pointerId);
  buildTimeline(); drawStage();
});
stage.addEventListener('pointermove', e => {
  const p = toStage(e);
  if (!stageDrag) { stage.style.cursor = hitTest(p.x, p.y, state.frame) ? 'move' : 'default'; return; }
  const d = stageDrag;
  const k = ensureKey(d.L, state.frame);
  k.x = Math.round(d.x + p.x - d.px);
  k.y = Math.round(d.y + p.y - d.py);
  if (!d.moved) { d.moved = true; buildTimeline(); }
  drawStage();
});
const endStageDrag = () => {
  if (!stageDrag) return;
  const moved = stageDrag.moved;
  stageDrag = null;
  if (moved) { commit(); buildTimeline(); renderPanel(); }
};
stage.addEventListener('pointerup', endStageDrag);
stage.addEventListener('pointercancel', endStageDrag);
// Ctrl + scroll anywhere over the stage area zooms the view.
$('#stageWrap').addEventListener('wheel', e => {
  if (!e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  e.stopPropagation();
  stepViewZoom(e.deltaY < 0 ? 1 : -1, e.clientX, e.clientY);
}, { passive: false, capture: true });
// Middle mouse button drag pans around when zoomed in.
$('#stageWrap').addEventListener('pointerdown', e => {
  if (e.button !== 1) return;
  e.preventDefault();
  const wrap = $('#stageWrap'), x0 = e.clientX, y0 = e.clientY, sl = wrap.scrollLeft, st = wrap.scrollTop;
  wrap.classList.add('panning');
  startDrag(e, ev => { wrap.scrollLeft = sl - (ev.clientX - x0); wrap.scrollTop = st - (ev.clientY - y0); },
    () => wrap.classList.remove('panning'));
}, { capture: true });
stage.addEventListener('wheel', e => {
  const L = getSelLayer();
  if (!L || e.ctrlKey || e.metaKey) return;
  e.preventDefault();
  stopPlay();
  const s = stateAt(L, state.frame);
  const d = Math.sign(e.deltaY || e.deltaX);
  if (e.shiftKey) setAnimProp(L, 'rot', Math.round(s.rot - d * 5));
  else setAnimProp(L, 'scale', Math.max(0.05, +(s.scale * (d > 0 ? 0.95 : 1.05)).toFixed(3)));
  drawStage();
  clearTimeout(wheelTimer);
  wheelTimer = setTimeout(() => { commit(); buildTimeline(); renderPanel(); }, 300);
}, { passive: false });

new ResizeObserver(() => project && resizeStage()).observe($('#stageArea'));

/* ---------------------------------------------------------------- properties panel */

const num = v => round2(+v || 0);
function numField(label, bind, value, { min, max, step = 1 } = {}) {
  return `<label>${label}<input type="number" data-bind="${bind}" value="${num(value)}" ${min != null ? `min="${min}"` : ''} ${max != null ? `max="${max}"` : ''} step="${step}"></label>`;
}
function pair(label, bind, value, min, max, step) {
  return `<label>${label}<div class="pair"><input type="range" data-bind="${bind}" min="${min}" max="${max}" step="${step}" value="${num(value)}"><input type="number" data-bind="${bind}" min="${min}" max="${max}" step="${step}" value="${num(value)}"></div></label>`;
}
const opt = (v, cur, label = v) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(label)}</option>`;

function renderPanel() {
  if (state.playing) return;
  const el = $('#props');
  const L = getSelLayer(), T = getSelTrack();
  el.innerHTML = L ? layerPanel(L) : T ? trackPanel(T) : projectPanel();
  if (L && L.type === 'smiley') {
    for (const cv of $$('canvas[data-mouth]', el)) {
      const g = cv.getContext('2d');
      g.translate(cv.width / 2, cv.height / 2); g.scale(0.62, 0.62); g.translate(0, -36);
      Smiley.draw(g, { color: L.color, expr: 'smile', mouth: cv.dataset.mouth });
    }
  }
  if (L && L.type === 'image') drawMouthThumbs(L, el);
}

// Area of the character covered by its mouth pictures, for mouth pictures that are
// see-through overlays the same size as the character.
const bboxCache = {};
function alphaBBox(id) {
  if (id in bboxCache) return bboxCache[id];
  const img = imgCache[id];
  if (!img) return null;
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    if (d[(y * c.width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return (bboxCache[id] = x1 < 0 ? null : { x0, y0, x1, y1 });
}

function eyesPanel(L, s, k) {
  const has = Object.keys(L.eyes).length > 0;
  if (!has) {
    return `<div class="sec"><h4>👀 Eyes</h4>
      <p class="hint">Load see-through eye pictures to make this character look around. Name them ending in a direction: _viewer, _left, _right, _up, _down, _up-left, _up-right, _down-left, _down-right, _closed.</p>
      <div class="btnrow"><button data-act="loadEyeSet">📂 Load eye pictures</button></div></div>`;
  }
  // Eye pictures may be named from the character's point of view (his left = screen right).
  // The pad always shows screen directions.
  const mirror = L.eyesNamedFrom === 'character';
  const swap = look => !mirror ? look : look.replace(/left|right/, m => (m === 'left' ? 'right' : 'left'));
  const screenName = look => {
    if (LOOK_NAME[look] || !look) return LOOK_NAME[look] || '';
    const dir = swap(look).replace('-', ' ');
    return /left|right/.test(dir) ? `toward the screen's ${dir}` : dir;
  };
  const btn = (screen, label) => {
    const look = screen ? swap(screen) : '';
    if (screen && !L.eyes[look]) return '<span></span>';
    return `<button data-act="setLook" data-look="${look}" class="${(s.look || '') === look ? 'on' : ''}" title="Look ${screenName(look)}">${label || (screen ? LOOK_ICON[screen] : 'As drawn')}</button>`;
  };
  return `<div class="sec"><h4>👀 Eyes on frame ${state.frame + 1}: looking ${screenName(s.look || '') || s.look}</h4>
    <div class="lookpad">${LOOK_PAD.map(p => btn(p)).join('')}</div>
    <div class="btnrow">${btn('')}${btn('closed', '— Closed')}</div>
    <label class="check"><input type="checkbox" data-bind="layer:autoBlink" ${L.autoBlink ? 'checked' : ''} ${L.eyes.closed ? '' : 'disabled'}>Blink now and then</label>
    <p class="hint">Picking a direction makes this frame a keyframe. He keeps looking that way until the next change.</p>
    <div class="btnrow"><button data-act="loadEyeSet">📂 Replace eye pictures</button><button data-act="clearEyes" class="danger">Remove eyes</button></div></div>`;
}

// Matches a file name ending like "_up-left" or "-closed" to an eye direction.
function lookFromName(name) {
  const n = name.toLowerCase().replace(/\.[^.]+$/, '');
  for (const look of [...LOOKS].sort((a, b) => b.length - a.length)) {
    if (n === look || (n.endsWith(look) && /[_\-\s]/.test(n[n.length - look.length - 1]))) return look;
  }
  return null;
}

async function urlToAsset(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`couldn't load ${url}`);
  const id = uid();
  assets[id] = { type: 'image', name: url.split('/').pop(), data: await readAsDataURL(await r.blob()) };
  if (!(await loadImage(id))) throw new Error(`${url} isn't a picture`);
  return id;
}

/* Ready-made characters listed in assets/characters.json (head + mouths + eyes). */
let characters = [];
async function loadCharacterList() {
  const box = $('#charList');
  try {
    const r = await fetch('assets/characters.json', { cache: 'no-store' });
    characters = r.ok ? (await r.json()).characters || [] : [];
  } catch { characters = []; }
  box.innerHTML = characters.map((c, i) => `<button data-act="addCharacter" data-i="${i}">${esc(c.icon || '🧑')} ${esc(c.name)}</button>`).join('');
  $('#charSec').hidden = !characters.length;
  repairCharacters();
}

// Keep ready-made characters in projects up to date. If a layer is one of them (same name and
// head size), fetch any eye or mouth pictures that are missing (older saves left out eyes), or
// all of them when the character's pictures have been updated since (its version went up).
async function repairCharacters() {
  if (!project || !characters.length) return;
  const fixed = [];
  for (const L of project.layers) {
    if (L.type !== 'image') continue;
    const c = characters.find(ch => ch.name === L.name);
    if (!c) continue;
    const outdated = (L.charVersion || 1) < (c.version || 1);
    const missing = (have, want) => Object.keys(want || {}).filter(k => outdated || !have[k] || !assets[have[k]]);
    const needEyes = missing(L.eyes || {}, c.eyes), needMouths = missing(L.mouths || {}, c.mouths);
    if (!needEyes.length && !needMouths.length) continue;
    try {
      const head = await load(c.head);
      if (head.naturalWidth !== L.iw || head.naturalHeight !== L.ih) continue; // a different version of the character
      L.eyes ||= {};
      for (const k of needEyes) L.eyes[k] = await urlToAsset(c.eyes[k]);
      for (const k of needMouths) L.mouths[k] = await urlToAsset(c.mouths[k]);
      if (needEyes.length) { L.eyesNamedFrom ||= c.eyesNamedFrom || 'screen'; if (L.eyes.closed) L.autoBlink = true; }
      L.charVersion = c.version || 1;
      fixed.push(L.name);
    } catch { /* leave it as it is */ }
  }
  if (!fixed.length) return;
  commit(); renderAll();
  toast(`Updated pictures for ${[...new Set(fixed)].join(', ')}`);

  function load(u) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = u; }); }
}

async function addCharacter(b) {
  const c = characters[+b.dataset.i];
  if (!c) return;
  toast(`Adding ${c.name}…`);
  try {
    const head = await urlToAsset(c.head);
    const img = imgCache[head];
    const mouths = {}, eyes = {};
    for (const [k, u] of Object.entries(c.mouths || {})) mouths[k] = await urlToAsset(u);
    for (const [k, u] of Object.entries(c.eyes || {})) eyes[k] = await urlToAsset(u);
    const voice = project.tracks.find(t => t.kind === 'voice' && !project.layers.some(l => l.lip && l.lip.trackId === t.id));
    const scale = round2(Math.min(1, (c.scale || 0.6) * project.width / img.naturalWidth, 0.6 * project.height / img.naturalHeight));
    newLayer('image', {
      name: c.name, assetId: head, iw: img.naturalWidth, ih: img.naturalHeight,
      mouths, eyes, autoBlink: !!eyes.closed, mouthX: 0, mouthY: 0, mouthScale: 1, eyesNamedFrom: c.eyesNamedFrom || 'screen', charVersion: c.version || 1,
      lip: { trackId: voice ? voice.id : null, cues: [], dialog: '', recognizer: 'pocketSphinx' },
    }, scale);
    toast(`${c.name} is ready. Add a voice and press Auto lip sync.`);
  } catch (err) {
    toast(`Couldn't add ${c.name}: ${err.message}`);
  }
}

function drawMouthThumbs(L, el) {
  const overlay = id => { const i = imgCache[id]; return i && i.naturalWidth === L.iw && i.naturalHeight === L.ih; };
  let box = null;
  for (const id of Object.values(L.mouths)) {
    const b = overlay(id) && alphaBBox(id);
    if (b) box = box ? { x0: Math.min(box.x0, b.x0), y0: Math.min(box.y0, b.y0), x1: Math.max(box.x1, b.x1), y1: Math.max(box.y1, b.y1) } : { ...b };
  }
  const head = imgCache[L.assetId];
  for (const cv of $$('canvas[data-mthumb]', el)) {
    const mi = imgCache[L.mouths[cv.dataset.mthumb]];
    if (!mi) continue;
    const g = cv.getContext('2d');
    if (box && head && overlay(L.mouths[cv.dataset.mthumb])) {
      // Zoom in on the mouth: the character with this mouth on top.
      const pad = 10, w = box.x1 - box.x0 + pad * 2, h = box.y1 - box.y0 + pad * 2;
      const s = Math.min(cv.width / w, cv.height / h), dx = (cv.width - w * s) / 2, dy = (cv.height - h * s) / 2;
      for (const im of [head, mi]) g.drawImage(im, box.x0 - pad, box.y0 - pad, w, h, dx, dy, w * s, h * s);
    } else {
      const s = Math.min(cv.width / mi.naturalWidth, cv.height / mi.naturalHeight);
      g.drawImage(mi, (cv.width - mi.naturalWidth * s) / 2, (cv.height - mi.naturalHeight * s) / 2, mi.naturalWidth * s, mi.naturalHeight * s);
    }
  }
}

function renderPanelSoft(changedEl) {
  setTimeout(() => {
    const a = document.activeElement;
    if (a && a !== changedEl && $('#props').contains(a) && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) return;
    renderPanel();
  });
}

function projectPanel() {
  const N = project.frames;
  return `
  <div class="sec"><h3>🎬 Movie settings</h3>
    <label>Format<select data-bind="project:preset">${Object.entries(PRESETS).map(([k, p]) => opt(k, project.preset, p.label)).join('')}</select></label>
    <div class="grid2">
      <label>Frames per second<select data-bind="project:fps">${FPS_OPTIONS.map(f => opt(String(f), String(project.fps))).join('')}</select></label>
      ${numField('Length (seconds)', 'project:seconds', N / project.fps, { min: 0.1, step: 0.1 })}
    </div>
    <label>Background colour<input type="color" data-bind="project:bg" value="${esc(project.bg)}"></label>
    <p class="hint">${project.width}×${project.height} pixels · ${N} frames</p>
  </div>
  <div class="sec"><h4>Which format?</h4>
    <p class="hint"><b>9:16</b>: TikTok, Instagram Reels & Stories, Facebook Reels.<br><b>4:5 or 1:1</b>: Instagram & Facebook feed posts.<br><b>16:9</b>: regular Facebook or YouTube video.<br><br>24 frames per second is the classic cartoon speed. 12 gives a choppier, hand-drawn feel.</p>
  </div>
  <div class="sec"><h4>Nothing selected</h4><p class="hint">Click a character on the stage, or a row on the timeline, to edit it.</p></div>`;
}

function layerPanel(L) {
  const f = state.frame, s = stateAt(L, f), k = keyAt(L, f), N = project.frames;
  let h = `<div class="sec"><h3>${ICON[L.type]}<input class="title-input" data-bind="layer:name" value="${esc(L.name)}"></h3></div>
  <div class="sec"><h4>Frame ${f + 1}<span class="badge ${k ? 'on' : ''}">${k ? '◆ keyframe' : '◇ in-between'}</span></h4>
    <div class="grid2">${numField('X', 'anim:x', s.x)}${numField('Y', 'anim:y', s.y)}</div>
    ${pair('Size', 'anim:scale', s.scale, 0.05, 6, 0.01)}
    ${pair('Rotate°', 'anim:rot', s.rot, -360, 360, 1)}
    ${pair('Opacity', 'anim:opacity', s.opacity, 0, 1, 0.01)}
    <label class="check"><input type="checkbox" data-bind="anim:flip" ${s.flip ? 'checked' : ''}>Flip (mirror)</label>
    ${L.type === 'smiley' ? `<label>Expression<select data-bind="anim:expr">${EXPRESSIONS.map(x => opt(x, s.expr)).join('')}</select></label>` : ''}
    ${k ? `<label>Movement to the next keyframe<select data-bind="key:ease">${Object.entries(EASES).map(([v, t]) => opt(v, k.ease, t)).join('')}</select></label>` : ''}
    <div class="btnrow">
      <button data-act="prevKey" title="Previous keyframe (,)">◀ Key</button>
      <button data-act="addKey" title="Add keyframe (K)">◆ Add</button>
      <button data-act="delKey" title="Remove keyframe (Delete)" ${k && L.keys.length > 1 ? '' : 'disabled'}>✕ Remove</button>
      <button data-act="nextKey" title="Next keyframe (.)">Key ▶</button>
    </div>
    <p class="hint">Change anything here, or drag on the stage, and this frame becomes a keyframe. The frames in between are filled in for you. To delete a keyframe, right-click its ◆ on the timeline.</p>
  </div>`;

  if (L.type === 'smiley') {
    h += `<div class="sec"><h4>Look</h4>
      <label>Face colour<input type="color" data-bind="layer:color" value="${esc(L.color)}"></label>
      <label class="check"><input type="checkbox" data-bind="layer:autoBlink" ${L.autoBlink ? 'checked' : ''}>Blink now and then</label></div>`;
  } else if (L.type === 'text') {
    h += `<div class="sec"><h4>Text</h4>
      <label>Words<textarea data-bind="layer:text">${esc(L.text)}</textarea></label>
      <label>Font<select data-bind="layer:font">${FONTS.map(x => opt(x, L.font)).join('')}</select></label>
      <div class="grid2">${numField('Size', 'layer:size', L.size, { min: 8, max: 600 })}<label class="check" style="margin-top:20px"><input type="checkbox" data-bind="layer:bold" ${L.bold ? 'checked' : ''}>Bold</label></div>
      <div class="grid2"><label>Colour<input type="color" data-bind="layer:color" value="${esc(L.color)}"></label><label>Outline<input type="color" data-bind="layer:stroke" value="${esc(L.stroke || '#000000')}"></label></div></div>`;
  } else if (L.type === 'image') {
    h += eyesPanel(L, s, k);
    h += `<div class="sec"><h4>Image</h4><p class="hint">${L.iw}×${L.ih} pixels. PNG pictures with a see-through background work best for characters.</p></div>`;
  }

  h += `<div class="sec"><h4>On screen</h4>
    <div class="grid2">${numField('From frame', 'layer:start', L.start + 1, { min: 1, max: N })}${numField('To frame', 'layer:end', L.end + 1, { min: 1, max: N })}</div>
    <div class="btnrow"><button data-act="startHere">Appear here</button><button data-act="endHere">Disappear here</button></div></div>`;

  if (L.lip) h += lipPanel(L);

  h += `<div class="sec"><p class="hint">Right-click the layer to copy or delete it. Drag its name up or down on the timeline to put it in front of or behind other layers.</p></div>`;
  return h;
}

function lipPanel(L) {
  const lip = L.lip;
  const tracks = [...project.tracks].sort((a, b) => (b.kind === 'voice') - (a.kind === 'voice'));
  const ready = state.server && state.server.rhubarb;
  let h = `<div class="sec"><h4>👄 Lip sync (Rhubarb)</h4>
    <label>Voice track<select data-bind="lip:trackId">${opt('', lip.trackId || '', '— none —')}${tracks.map(t => opt(t.id, lip.trackId, `${ICON[t.kind]} ${t.name}`)).join('')}</select></label>
    <label>What's being said (optional, makes it more accurate)<textarea data-bind="lip:dialog" placeholder="Hi there! Welcome to my channel.">${esc(lip.dialog)}</textarea></label>
    <label>Language<select data-bind="lip:recognizer">${opt('pocketSphinx', lip.recognizer, 'English')}${opt('phonetic', lip.recognizer, 'Any language (phonetic)')}</select></label>
    <div class="btnrow">
      <button class="primary" data-act="autoLip" ${lip.trackId ? '' : 'disabled'} title="${ready ? 'Run Rhubarb on the voice track' : 'Rhubarb is not set up yet'}">⚡ Auto lip sync</button>
      <button data-act="importLip" title="Load a .json / .tsv / .xml file made by Rhubarb">📄 Import file</button>
    </div>
    <div id="lipStatus" class="lipstatus">${lip.cues.length ? `${lip.cues.length} mouth shape${lip.cues.length === 1 ? '' : 's'} loaded. They show as coloured letters on the timeline.` : ready ? 'No mouth shapes yet.' : 'Rhubarb isn\'t set up yet. Click Auto lip sync to see how, or import a Rhubarb file.'}</div>
    ${lip.cues.length ? '<div class="btnrow"><button data-act="clearLip" class="danger">Clear mouth shapes</button></div>' : ''}`;

  if (L.type === 'smiley') {
    h += `<div class="mouths">${SHAPES.map(sh => `<div><canvas data-mouth="${sh}" width="120" height="80"></canvas>${sh} · ${SHAPE_INFO[sh]}</div>`).join('')}</div>`;
  } else {
    h += `<div class="btnrow"><button data-act="loadMouthSet" title="Pick all the mouth pictures at once. Each file name should end in its letter, like mouth_A.png">📂 Load all 9 at once</button></div>
      <p class="hint">Or click a box to upload one mouth picture at a time. Rest (X) is used whenever a shape is missing.</p>
      <div class="mouths">${SHAPES.map(sh => {
        const id = L.mouths[sh];
        return `<div class="slot" data-act="mouthImg" data-shape="${sh}" title="Upload mouth ${sh}">${id && assets[id] ? `<canvas data-mthumb="${sh}" width="120" height="80"></canvas><button class="x" data-act="clearMouth" data-shape="${sh}" title="Remove">✕</button>` : '<div class="empty">＋</div>'}${sh} · ${SHAPE_INFO[sh]}</div>`;
      }).join('')}</div>
      <div class="grid2">${numField('Mouth X', 'layer:mouthX', L.mouthX)}${numField('Mouth Y', 'layer:mouthY', L.mouthY)}</div>
      ${pair('Mouth size', 'layer:mouthScale', L.mouthScale, 0.05, 4, 0.01)}`;
  }
  return h + '</div>';
}

function trackPanel(T) {
  return `<div class="sec"><h3>${ICON[T.kind]}<input class="title-input" data-bind="track:name" value="${esc(T.name)}"></h3></div>
  <div class="sec">
    <label>Type<select data-bind="track:kind">${opt('music', T.kind, '🎵 Music')}${opt('voice', T.kind, '🎙️ Voice / dialog')}${opt('sfx', T.kind, '💥 Sound effect')}</select></label>
    ${numField('Starts at (seconds)', 'track:start', T.start, { min: 0, step: 0.05 })}
    ${pair('Volume', 'track:volume', T.volume, 0, 2, 0.01)}
    <label class="check"><input type="checkbox" data-bind="track:muted" ${T.muted ? 'checked' : ''}>Mute</label>
    <p class="hint">Length ${T.duration.toFixed(2)}s. Drag the coloured bar on the timeline to move it.</p>
    <div class="btnrow"><button data-act="trackToPlayhead">Start at playhead</button><button data-act="fitToTrack">Fit movie to this</button></div>
  </div>
  <div class="sec"><h4>🎛️ Voice effect</h4>
    <div class="btnrow">${Object.entries(VOICE_PRESETS).map(([k, p]) =>
      `<button data-act="voicePreset" data-preset="${k}" class="${T.fx.semis === p.semis && (T.fx.keep === p.keep || !p.semis) ? 'on' : ''}">${p.label}</button>`).join('')}</div>
    ${pair('Pitch (lower ↔ higher)', 'track:fxSemis', T.fx.semis, -12, 12, 1)}
    <label class="check"><input type="checkbox" data-bind="track:fxKeep" ${T.fx.keep ? 'checked' : ''}>Keep the same speed</label>
    <div class="btnrow"><button data-act="listenTrack">▶ Listen</button><button data-act="saveVoiceWav" title="Download this audio, with the effect, as a WAV file">⬇ Save WAV</button></div>
    <p class="hint">Cartoon kid voices are usually made by speeding up the recording, which makes it higher. For that classic sound, pick <b>Sped-up kid</b> and talk slowly and clearly when you record. The voice gets shorter, and lip sync stays matched.</p>
  </div>
  <div class="sec"><div class="btnrow"><button data-act="delTrack" class="danger">🗑 Delete audio</button></div></div>`;
}

function readVal(el) {
  if (el.type === 'checkbox') return el.checked;
  if (el.type === 'number' || el.type === 'range') return parseFloat(el.value);
  return el.value;
}

function applyProjectProp(prop, v) {
  const p = project;
  if (prop === 'name') p.name = v;
  else if (prop === 'bg') p.bg = v;
  else if (prop === 'preset') {
    const pr = PRESETS[v];
    if (!pr) return;
    const sx = pr.w / p.width, sy = pr.h / p.height;
    for (const L of p.layers) for (const k of L.keys) { k.x = Math.round(k.x * sx); k.y = Math.round(k.y * sy); }
    Object.assign(p, { preset: v, width: pr.w, height: pr.h });
    resizeStage();
  } else if (prop === 'fps') {
    v = parseInt(v, 10);
    if (!v || v === p.fps) return;
    const r = v / p.fps;
    for (const L of p.layers) {
      const seen = new Set();
      L.keys = L.keys.map(k => ({ ...k, f: Math.round(k.f * r) })).filter(k => !seen.has(k.f) && seen.add(k.f));
      L.start = Math.round(L.start * r);
      L.end = Math.round((L.end + 1) * r) - 1;
    }
    p.frames = Math.max(1, Math.round(p.frames * r));
    p.fps = v;
    state.frame = Math.round(state.frame * r);
  } else if (prop === 'seconds') {
    if (!(v > 0)) return;
    const nf = Math.max(1, Math.round(v * p.fps));
    for (const L of p.layers) {
      if (L.end >= p.frames - 1) L.end = nf - 1;
      L.end = Math.min(L.end, nf - 1);
      L.start = Math.min(L.start, L.end);
    }
    p.frames = nf;
  }
  state.frame = clamp(state.frame, 0, p.frames - 1);
}

function applyBind(el, final) {
  const [scope, prop] = el.dataset.bind.split(':');
  let v = readVal(el);
  if (typeof v === 'number' && isNaN(v)) return;
  const L = getSelLayer(), T = getSelTrack();
  stopPlay();
  // Keep a slider and its number box showing the same value.
  if (!final) for (const o of $$(`[data-bind="${el.dataset.bind}"]`)) if (o !== el && o.type !== 'checkbox') o.value = el.value;

  switch (scope) {
    case 'anim':
      if (!L) return;
      setAnimProp(L, prop, v);
      break;
    case 'key': {
      const k = L && keyAt(L, state.frame);
      if (k) k[prop] = v;
      break;
    }
    case 'layer':
      if (!L) return;
      if (prop === 'start' || prop === 'end') {
        if (!final) return;
        v = clamp(Math.round(v) - 1, 0, project.frames - 1);
        L[prop] = v;
        if (L.start > L.end) { if (prop === 'start') L.end = v; else L.start = v; }
      } else L[prop] = v;
      break;
    case 'lip':
      if (!L) return;
      L.lip[prop] = v === '' && prop === 'trackId' ? null : v;
      break;
    case 'track':
      if (!T) return;
      if (prop === 'fxSemis' || prop === 'fxKeep') {
        if (!final) return;
        T.fx = { ...T.fx, [prop === 'fxSemis' ? 'semis' : 'keep']: prop === 'fxSemis' ? Math.round(v) : v };
        refreshFx(T);
        return;
      }
      if (prop === 'start') v = Math.max(0, v);
      T[prop] = v;
      break;
    case 'project':
      if (!final && prop !== 'name' && prop !== 'bg') return;
      applyProjectProp(prop, v);
      break;
  }
  drawStage();
  if (scope === 'anim' && !final) {
    const badge = $('#props .badge');
    if (badge) { badge.classList.add('on'); badge.textContent = '◆ keyframe'; }
  }
  if (final) {
    commit(); buildTimeline(); updateTransport();
    if (scope === 'project' && prop === 'name') $('#projName').value = project.name;
    renderPanelSoft(el);
  } else if (scope === 'layer' && prop === 'name' || scope === 'track' && prop === 'name') {
    const row = $(`.tl-row[data-${scope === 'layer' ? 'layer' : 'track'}="${(L || T).id}"] .tname`);
    if (row) row.textContent = v;
  }
}

document.addEventListener('input', e => { if (e.target.dataset && e.target.dataset.bind) applyBind(e.target, false); });
document.addEventListener('change', e => { if (e.target.dataset && e.target.dataset.bind) applyBind(e.target, true); });

/* ---------------------------------------------------------------- selection & actions */

function selectLayer(id) { state.selLayer = id; state.selTrack = null; renderAllLight(); }
function selectTrack(id) { state.selTrack = id; state.selLayer = null; renderAllLight(); }
function deselect() { state.selLayer = null; state.selTrack = null; renderAllLight(); }
function renderAllLight() { buildTimeline(); renderPanel(); drawStage(); }

function updateTransport() {
  const f = state.frame, N = project.frames, fps = project.fps;
  $('#frameInfo').textContent = `Frame ${f + 1} / ${N}   ·   ${(f / fps).toFixed(2)}s / ${(N / fps).toFixed(2)}s`;
  $('#playBtn').textContent = state.playing ? '⏸' : '▶';
  $('#tgLoop').classList.toggle('on', state.loop);
  $('#tgOnion').classList.toggle('on', state.onion);
  $('#tgPath').classList.toggle('on', state.path);
  $('#tgSafe').classList.toggle('on', state.safe);
}

function renderAll() {
  $('#projName').value = project.name;
  document.title = `${project.name} · Cartoon Studio`;
  resizeStage();
  buildTimeline();
  renderPanel();
  updateTransport();
}

function moveLayer(dir) {
  const L = getSelLayer();
  if (!L) return;
  // dir: +1 / -1 one step, or ±Infinity all the way to the front / back.
  const a = project.layers, i = a.indexOf(L), j = clamp(i + dir, 0, a.length - 1);
  if (j === i) return;
  a.splice(i, 1);
  a.splice(j, 0, L);
  commit(); renderAllLight();
}

function jumpKey(dir) {
  const L = getSelLayer();
  if (!L) return;
  const k = dir < 0 ? [...L.keys].reverse().find(k => k.f < state.frame) : L.keys.find(k => k.f > state.frame);
  if (k) { setFrame(k.f); buildTimeline(); updatePlayhead(true); }
}

const actions = {
  newProject: newProjectDialog, createProject, openProject, saveProject, undo, redo,
  exportVideo, runExport, snapshot, closeModal, help: helpDialog, rhubarbHelp,
  addSmiley, addText,
  addImage: () => pickFile('image/*', importImage),
  addMusic: () => pickFile('audio/*', f => importAudio('music', f)),
  addVoice: () => pickFile('audio/*', f => importAudio('voice', f)),
  addSfx: () => pickFile('audio/*', f => importAudio('sfx', f)),
  play: togglePlay,
  first: () => setFrame(0, true),
  last: () => setFrame(project.frames - 1, true),
  prev: () => setFrame(state.frame - 1, true),
  next: () => setFrame(state.frame + 1, true),
  toggleLoop: () => { state.loop = !state.loop; updateTransport(); },
  toggleOnion: () => { state.onion = !state.onion; updateTransport(); drawStage(); },
  togglePath: () => { state.path = !state.path; updateTransport(); drawStage(); },
  toggleSafe: () => { state.safe = !state.safe; updateTransport(); drawStage(); },
  zoomIn: () => zoom(1), zoomOut: () => zoom(-1),
  endMovieHere: () => {
    stopPlay();
    const f = state.frame + 1;
    if (f === project.frames) return toast('The movie already ends on this frame');
    applyProjectProp('seconds', f / project.fps);
    commit(); renderAll();
    toast(`Movie now ends at frame ${f} (${(f / project.fps).toFixed(2)}s). Ctrl+Z to undo.`);
  },
  viewZoomIn: () => stepViewZoom(1), viewZoomOut: () => stepViewZoom(-1),
  viewFit: () => setViewZoom(1),
  zoomFit: () => {
    // Biggest zoom that shows the whole movie without scrolling sideways.
    const room = $('#tlScroll').clientWidth - HEAD - 20;
    state.ppf = [...ZOOMS].reverse().find(z => z * project.frames + Math.max(z * project.fps * 2, 160) <= room) || ZOOMS[0];
    buildTimeline();
    $('#tlScroll').scrollLeft = 0;
  },
  addKey: () => { const L = getSelLayer(); if (!L) return; ensureKey(L, state.frame); commit(); renderAllLight(); },
  delKey: () => {
    const L = getSelLayer();
    if (!L || !keyAt(L, state.frame)) return;
    if (L.keys.length < 2) return toast('A layer needs at least one keyframe');
    L.keys = L.keys.filter(k => k.f !== state.frame);
    commit(); renderAllLight();
  },
  prevKey: () => jumpKey(-1), nextKey: () => jumpKey(1),
  startHere: () => { const L = getSelLayer(); if (!L) return; L.start = state.frame; L.end = Math.max(L.end, L.start); commit(); renderAllLight(); },
  endHere: () => { const L = getSelLayer(); if (!L) return; L.end = state.frame; L.start = Math.min(L.start, L.end); commit(); renderAllLight(); },
  fwdLayer: () => moveLayer(1), backLayer: () => moveLayer(-1),
  noop: () => {},
  layerToFront: () => moveLayer(Infinity), layerToBack: () => moveLayer(-Infinity),
  dupLayer: () => {
    const L = getSelLayer();
    if (!L) return;
    const c = JSON.parse(JSON.stringify(L));
    c.id = uid(); c.name = L.name + ' copy';
    for (const k of c.keys) { k.x += 40; k.y += 40; }
    project.layers.splice(project.layers.indexOf(L) + 1, 0, c);
    state.selLayer = c.id;
    commit(); renderAllLight();
  },
  delLayer: () => {
    const L = getSelLayer();
    if (!L) return;
    project.layers = project.layers.filter(l => l !== L);
    state.selLayer = null;
    commit(); renderAllLight();
    toast(`Deleted ${L.name} (Ctrl+Z to undo)`);
  },
  toggleVis: b => { const L = getLayer(b.dataset.id); L.visible = !L.visible; commit(); renderAllLight(); },
  toggleMute: b => { const T = getTrack(b.dataset.id); T.muted = !T.muted; commit(); renderAllLight(); },
  autoLip, importLip,
  clearLip: () => { const L = getSelLayer(); L.lip.cues = []; commit(); renderAllLight(); },
  mouthImg: b => {
    const L = getSelLayer(), shape = b.dataset.shape;
    pickFile('image/*', async file => {
      const id = uid();
      assets[id] = { type: 'image', name: file.name, data: await readAsDataURL(file) };
      await loadImage(id);
      L.mouths[shape] = id;
      commit(); renderAllLight();
    });
  },
  loadMouthSet: () => {
    const L = getSelLayer();
    if (!L) return;
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
    inp.onchange = async () => {
      let n = 0, fullSize = false;
      for (const file of inp.files) {
        // The shape letter is the last single letter in the name: mouth_A.png, John-D.png, B.png…
        const m = file.name.replace(/\.[^.]+$/, '').match(/(?:^|[^A-Za-z])([A-HXa-hx])$/);
        if (!m) continue;
        const id = uid();
        assets[id] = { type: 'image', name: file.name, data: await readAsDataURL(file) };
        const img = await loadImage(id);
        if (!img) continue;
        L.mouths[m[1].toUpperCase()] = id;
        if (img.naturalWidth === L.iw && img.naturalHeight === L.ih) fullSize = true;
        n++;
      }
      if (!n) return toast('No files matched. Name them ending in a letter, like mouth_A.png … mouth_X.png');
      // Overlays the same size as the character line up exactly with no offset.
      if (fullSize) { L.mouthX = 0; L.mouthY = 0; L.mouthScale = 1; }
      commit(); renderAllLight();
      toast(`Loaded ${n} mouth shape${n === 1 ? '' : 's'}`);
    };
    inp.click();
  },
  clearMouth: b => { const L = getSelLayer(); delete L.mouths[b.dataset.shape]; commit(); renderAllLight(); },
  setLook: b => {
    const L = getSelLayer();
    if (!L) return;
    stopPlay();
    setAnimProp(L, 'look', b.dataset.look);
    commit(); renderAllLight();
  },
  loadEyeSet: () => {
    const L = getSelLayer();
    if (!L) return;
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
    inp.onchange = async () => {
      const eyes = {};
      for (const file of inp.files) {
        const look = lookFromName(file.name);
        if (!look) continue;
        const id = uid();
        assets[id] = { type: 'image', name: file.name, data: await readAsDataURL(file) };
        if (await loadImage(id)) eyes[look] = id;
      }
      const n = Object.keys(eyes).length;
      if (!n) return toast('No files matched. Name them ending in a direction, like eyes_left.png or eyes_closed.png');
      L.eyes = eyes;
      if (eyes.closed) L.autoBlink = true;
      commit(); renderAllLight();
      toast(`Loaded ${n} eye picture${n === 1 ? '' : 's'}`);
    };
    inp.click();
  },
  clearEyes: () => {
    const L = getSelLayer();
    if (!L) return;
    L.eyes = {}; L.autoBlink = false;
    for (const k of L.keys) k.look = '';
    commit(); renderAllLight();
  },
  addCharacter,
  voicePreset: b => {
    const T = getSelTrack(), p = VOICE_PRESETS[b.dataset.preset];
    if (!T || !p) return;
    T.fx = { semis: p.semis, keep: p.keep };
    refreshFx(T);
  },
  listenTrack, saveVoiceWav,
  trackToPlayhead: () => { const T = getSelTrack(); T.start = round2(state.frame / project.fps); commit(); renderAllLight(); },
  fitToTrack: () => { const T = getSelTrack(); applyProjectProp('seconds', Math.ceil((T.start + T.duration) * 10) / 10); commit(); renderAll(); },
  delTrack: () => {
    const T = getSelTrack();
    project.tracks = project.tracks.filter(t => t !== T);
    for (const L of project.layers) if (L.lip && L.lip.trackId === T.id) L.lip.trackId = null;
    state.selTrack = null;
    commit(); renderAllLight();
  },
};

document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const fn = actions[b.dataset.act];
  if (!fn) return;
  e.preventDefault();
  e.stopPropagation();
  fn(b);
});

document.addEventListener('keydown', e => {
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key.toLowerCase() === 's') { e.preventDefault(); saveProject(); return; }
  if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  if ($('#modalBg')) { if (e.key === 'Escape') closeModal(); return; }
  if (ctrl && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (ctrl && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if (ctrl && e.key.toLowerCase() === 'd') { e.preventDefault(); actions.dupLayer(); return; }
  if (ctrl) return;
  const step = e.shiftKey ? project.fps : 1;
  switch (e.key) {
    case ' ': e.preventDefault(); togglePlay(); break;
    case 'ArrowLeft': e.preventDefault(); setFrame(state.frame - step, true); break;
    case 'ArrowRight': e.preventDefault(); setFrame(state.frame + step, true); break;
    case 'Home': setFrame(0, true); break;
    case 'End': setFrame(project.frames - 1, true); break;
    case ',': jumpKey(-1); break;
    case '.': jumpKey(1); break;
    case 'k': case 'K': actions.addKey(); break;
    case 'Delete': case 'Backspace': e.preventDefault(); e.shiftKey ? actions.delLayer() : actions.delKey(); break;
    case 'Escape': deselect(); break;
    case '=': case '+': stepViewZoom(1); break;
    case '-': case '_': stepViewZoom(-1); break;
    case '0': setViewZoom(1); break;
  }
});

/* ---------------------------------------------------------------- start up */

(async function init() {
  let restored = false;
  try {
    // Don't let a stuck browser storage keep the editor from starting.
    const saved = await Promise.race([DB.get('autosave'), new Promise(r => setTimeout(() => r(null), 1500))]);
    if (saved && saved.project) { await loadData(saved); restored = true; }
  } catch { /* no saved session */ }
  if (!restored) {
    project = migrate(demoProject());
    resetHistory();
    renderAll();
  }
  if (restored) toast('Welcome back! Your last cartoon was restored.');
  checkServer();
  loadCharacterList();
})();
