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
  vertical: { w: 1080, h: 1920, label: '9:16 Vertical ★ Works everywhere: TikTok, Reels, Shorts, Facebook' },
  portrait: { w: 1080, h: 1350, label: '4:5 Portrait — Instagram / Facebook feed' },
  square:   { w: 1080, h: 1080, label: '1:1 Square — Instagram / Facebook feed' },
  wide:     { w: 1920, h: 1080, label: '16:9 Wide — regular YouTube / Facebook video' },
};
const FPS_OPTIONS = [12, 15, 24, 25, 30, 60];
const SHAPES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'X'];
const SHAPE_INFO = { A: 'M B P', B: 'K S T EE', C: 'EH AE', D: 'AA', E: 'AO ER', F: 'OO W', G: 'F V', H: 'L', X: 'Rest' };
const SHAPE_COLORS = { A: '#ff8fa3', B: '#ffd166', C: '#06d6a0', D: '#4cc9f0', E: '#b8b8ff', F: '#f4a261', G: '#e9c46a', H: '#90be6d', X: '#6c757d' };
const EXPRESSIONS = ['smile', 'grin', 'neutral', 'surprised', 'sad'];
const EASES = { easeInOut: 'Smooth (ease in & out)', linear: 'Steady (linear)', easeIn: 'Speed up', easeOut: 'Slow down', hold: 'Jump (hold, then snap)' };
const ICON = { smiley: '🙂', image: '🖼️', text: '🔤', caption: '💬', music: '🎵', voice: '🎙️', sfx: '💥' };
// Eye directions for image characters ('' = the eyes as drawn in the picture).
const LOOKS = ['viewer', 'left', 'right', 'up', 'down', 'up-left', 'up-right', 'down-left', 'down-right', 'closed'];
const LOOK_PAD = ['up-left', 'up', 'up-right', 'left', 'viewer', 'right', 'down-left', 'down', 'down-right'];
const LOOK_ICON = { 'up-left': '↖', up: '↑', 'up-right': '↗', left: '←', viewer: '●', right: '→', 'down-left': '↙', down: '↓', 'down-right': '↘', closed: '—' };
const LOOK_NAME = { viewer: 'at the viewer', closed: 'eyes closed', '': 'as drawn' };

/* Body rig. Joint angles are in degrees: 0 points straight down, positive swings toward
   the screen's right. Shoulders and hips store the upper limb's angle; elbows and knees store
   how much the lower limb bends from the upper one. "L" / "R" mean the screen's left / right. */
const POSE_KEYS = ['armLs', 'armLe', 'armRs', 'armRe', 'legLh', 'legLk', 'legRh', 'legRk'];
const POSE_DEFAULT = { armLs: -14, armLe: 10, armRs: 14, armRe: 12, legLh: -4, legLk: 0, legRh: 4, legRk: 0 };
// Whether each arm is drawn in front of the head (and beard). Held until the next keyframe, not blended.
const ARM_FRONT_DEFAULT = { armLFront: false, armRFront: false };
const POSE_LABEL = {
  armLs: 'Left shoulder', armLe: 'Left elbow', armRs: 'Right shoulder', armRe: 'Right elbow',
  legLh: 'Left hip', legLk: 'Left knee', legRh: 'Right hip', legRk: 'Right knee',
};
// Sizes, measured from the neck, for a head about 1000 px from hat to chin (scaled by body.size).
const RIG = {
  shoulderX: 330, shoulderY: 120, upper: 440, fore: 400, armW: 135, hand: 80,
  hipX: 215, hipY: 1100, thigh: 500, shin: 460, legW: 165, footLen: 260, footH: 104,
  torsoTop: 360, torsoBot: 560, torsoH: 1900,   // a long robe, down to mid-shin
};
const POSES = {
  stand:  { label: '🧍 Stand', ...POSE_DEFAULT, ...ARM_FRONT_DEFAULT },
  wave:   { label: '👋 Wave', armRs: 125, armRe: 45 },
  point:  { label: '👉 Point', armRs: 92, armRe: 0, armRFront: true },
  preach: { label: '🙌 Preach', armLs: -135, armLe: -30, armRs: 135, armRe: 30 },
  shrug:  { label: '🤷 Shrug', armLs: -28, armLe: -85, armRs: 28, armRe: 85 },
  think:  { label: '🤔 Think', ik: { armR: [190, -60] }, armRFront: true },   // right hand to the chin
  chest:  { label: '🤲 Hands on chest', ik: { armL: [-90, 430], armR: [90, 430] }, ikMode: 'out', armLFront: true, armRFront: true },
  pray:   { label: '🙏 Pray', ik: { armL: [-25, 360], armR: [25, 360] }, ikMode: 'out', armLFront: true, armRFront: true },
  step1:  { label: '🚶 Step 1', legLh: -20, legLk: -30, legRh: 24, legRk: -4, armLs: 18, armLe: 15, armRs: -16, armRe: 15 },
  step2:  { label: '🚶 Step 2', legLh: 24, legLk: -4, legRh: -20, legRk: -30, armLs: -16, armLe: 15, armRs: 18, armRe: 15 },
};
const D2R = Math.PI / 180;

/* Effects. Strengths live on keyframes (so they can fade in and out); 0 / 1 means "off". */
const FX_DEFAULT = { fxGlow: 0, fxGray: 0, fxSepia: 0, fxBright: 1, fxContrast: 1, fxSat: 1, fxHue: 0, fxBlur: 0, fxInvert: 0 };
const FX_KEYS = Object.keys(FX_DEFAULT);
const FX_PRESETS = {
  none:       { label: '🚫 None' },
  glow:       { label: '✨ Glow', fxGlow: 1 },
  mono:       { label: '⚫ Black & white', fxGray: 1, fxContrast: 1.1 },
  sepia:      { label: '📜 Old photo', fxSepia: 0.85, fxContrast: 0.95, fxBright: 1.05 },
  silhouette: { label: '👤 Silhouette', fxBright: 0 },
  ghost:      { label: '👻 Ghost', fxGlow: 0.8, fxBright: 1.35, fxSat: 0.3, fxBlur: 1.5, ghost: true },
  dream:      { label: '💭 Dreamy', fxBlur: 3, fxBright: 1.1, fxSat: 1.2, fxGlow: 0.5 },
  invert:     { label: '🔄 Negative', fxInvert: 1 },
};
const FX_LABEL = {
  fxGlow: ['Glow', 0, 1, 0.01], fxGray: ['Black & white', 0, 1, 0.01], fxSepia: ['Old photo (sepia)', 0, 1, 0.01],
  fxBright: ['Brightness', 0, 2, 0.01], fxContrast: ['Contrast', 0, 2, 0.01], fxSat: ['Colour', 0, 2, 0.01],
  fxHue: ['Colour shift°', -180, 180, 1], fxBlur: ['Blur', 0, 30, 0.5], fxInvert: ['Negative', 0, 1, 0.01],
};
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
// Everything a voice effect can do. "Voice" presets set pitch; "place & style" presets set the rest.
const VOICE_FX_DEFAULT = { semis: 0, keep: true, speed: 1, bass: 0, treble: 0, reverb: 'none', reverbMix: 0.35, echo: 0, gate: false, punch: false, radio: false, robot: 0 };
const SOUND_FIELDS = ['bass', 'treble', 'reverb', 'reverbMix', 'echo', 'gate', 'punch', 'radio', 'robot'];
const SOUND_PRESETS = {
  none:      { label: '🚫 No effects' },
  clean:     { label: '🎙️ Clean & clear', gate: true, punch: true, treble: 2 },
  church:    { label: '⛪ Church', reverb: 'church', reverbMix: 0.35, punch: true },
  cathedral: { label: '🏛️ Big cathedral', reverb: 'cathedral', reverbMix: 0.4, punch: true },
  room:      { label: '🏠 Small room', reverb: 'room', reverbMix: 0.3 },
  radio:     { label: '📻 Old radio', radio: true, punch: true },
  echo:      { label: '🔁 Echo', echo: 0.5 },
  robot:     { label: '🤖 Robot', robot: 0.8, bass: -2 },
};
// Rooms: how long the echo rings on (s), how quickly it fades, and the gap before it starts.
const REVERBS = {
  room:      { label: 'Small room', secs: 0.7, decay: 3.5, pre: 0.005 },
  church:    { label: 'Church', secs: 2.6, decay: 2.2, pre: 0.025 },
  cathedral: { label: 'Big cathedral', secs: 4.5, decay: 1.8, pre: 0.04 },
};
const state = { frame: 0, selLayer: null, selTrack: null, playing: false, ppf: 14, loop: false, onion: false, path: true, safe: true, server: null, zoom: 1, selCam: false, camView: true };
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
  saveTimer = setTimeout(() => { DB.set('autosave', { project, assets: usedAssets() }).catch(() => {}); pushCurrent(); }, 700);
}

/* ---- current/project.json: the open cartoon as a file, kept in step both ways ----
   Every change is written there (pictures and sounds go to current/assets/). If the file is
   changed from outside, the editor loads the change as an undoable step. */
const sync = { hash: null, assets: new Set(), busy: false, again: false, last: null };   // last: the project as last saved or loaded
async function api(p, body) {
  const r = await fetch((state.api || '') + p, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}
async function pushCurrent() {
  if (!state.server || !state.server.current || !project) return;
  if (sync.busy) { sync.again = true; return; }
  sync.busy = true;
  try {
    for (const [id, a] of Object.entries(usedAssets())) {
      if (sync.assets.has(id)) continue;
      await api('api/current/asset', { id, type: a.type, name: a.name, data: a.data });
      sync.assets.add(id);
    }
    const text = JSON.stringify(project);
    if (text !== sync.last) { sync.hash = (await api('api/current', { project })).hash; sync.last = text; }
  } catch (err) { console.warn('Could not write current/project.json:', err); }
  finally { sync.busy = false; if (sync.again) { sync.again = false; pushCurrent(); } }
}
// Read current/project.json, fetching any pictures or sounds the editor doesn't have yet.
async function pullCurrent() {
  const j = await api('api/current');
  if (!j.exists) return null;
  sync.last = JSON.stringify(j.project);
  for (const [id, m] of Object.entries(j.assets || {})) {
    sync.assets.add(id);
    if (assets[id]) continue;
    const blob = await (await fetch((state.api || '') + 'current/assets/' + m.file)).blob();
    assets[id] = { type: m.type, name: m.name, data: await readAsDataURL(blob) };
  }
  return j;
}
async function applyExternal(j) {
  stopPlay();
  project = migrate(j.project);
  await Promise.all(Object.keys(assets).map(id => assets[id].type === 'image' ? loadImage(id) : decodeAudio(id).catch(() => null)));
  for (const T of project.tracks) await applyFx(T).catch(() => null);
  sync.hash = j.hash;
  if (!getLayer(state.selLayer)) state.selLayer = null;
  if (!getTrack(state.selTrack)) state.selTrack = null;
  state.frame = clamp(state.frame, 0, project.frames - 1);
  commit(); renderAll();
  toast('Updated from current/project.json (Ctrl+Z to undo)');
}
// Watch for outside changes.
setInterval(async () => {
  if (!state.server || !state.server.current || state.playing || exp || sync.busy) return;
  try {
    const m = await api('api/current/meta');
    if (!m.hash || m.hash === sync.hash || sync.busy) return;
    const j = await pullCurrent();
    if (j && j.hash !== sync.hash) await applyExternal(j);
  } catch (err) { console.warn('current/project.json:', err.message); }
}, 1500);

/* ---------------------------------------------------------------- project model */

function blankProject(preset = 'vertical', fps = 24, seconds = 5) {
  const p = PRESETS[preset];
  return { version: 1, name: 'Untitled Cartoon', preset, width: p.w, height: p.h, fps, frames: Math.round(seconds * fps), bg: '#8fd3ff', layers: [], tracks: [] };
}

function key(f, x, y, scale, rot = 0, extra = {}) {
  return { f, x, y, scale, rot, opacity: 1, flip: false, ease: 'easeInOut', expr: 'smile', look: '', ...POSE_DEFAULT, ...ARM_FRONT_DEFAULT, ...FX_DEFAULT, headTilt: 0, headNod: 0, stretch: 0, smileR: 0, smileL: 0, brows: 0, lean: 0, ...extra };
}

function migrate(p) {
  p.layers ||= []; p.tracks ||= [];
  p.camera ||= { keys: [] };
  p.camera.keys.sort((a, b) => a.f - b.f);
  for (const L of p.layers) {
    L.keys = (L.keys || []).map(k => ({ ...key(0, p.width / 2, p.height / 2, 1), ...k })).sort((a, b) => a.f - b.f);
    if (!L.keys.length) L.keys.push(key(0, p.width / 2, p.height / 2, 1));
    if (L.type !== 'text' && L.type !== 'caption') L.lip ||= { trackId: null, cues: [], dialog: '', recognizer: 'pocketSphinx' };
    // Walks made with the earlier "Walk somewhere" button become keyframe walks.
    for (const w of L.walks || []) { const k = L.keys.find(k => k.f === w.from); if (k) { k.walk = w.speed || 'normal'; k.walkArms = w.arms !== false; } }
    delete L.walks; delete L.walkSpeed;
    if (L.type === 'image') L.idle ??= true;
    // Where Calvin's mouth corners and cheeks are, for smiling (his right = left of the picture).
    if (L.type === 'image' && L.name === 'John Calvin' && L.iw === 1136 && !L.face) L.face = { mouthR: [710, 822], mouthL: [845, 831], cheekR: [640, 650], cheekL: [870, 630] };
    // The first smile point was a little low and to the right.
    if (L.face && L.face.mouthR && L.face.mouthR[0] === 725 && L.face.mouthR[1] === 837) L.face.mouthR = [710, 822];
    // His eyebrows (for raising): x, y, half width, half height in the picture.
    if (L.face && L.name === 'John Calvin' && L.iw === 1136 && !L.face.browR) { L.face.browR = [615, 432, 110, 34]; L.face.browL = [862, 410, 62, 30]; }
    // Calvin's beard sways (from just below his lower lip); projects made before this get it too.
    if (L.type === 'image' && L.name === 'John Calvin' && L.beardSway === undefined && L.iw === 1136) { L.beardSway = true; L.beardTop = 900; }
    // Calvin wears a fur collar (projects made before the collar existed get it too).
    if (L.type === 'image' && L.body && L.body.collarOn === undefined) { L.body.collarOn = L.name === 'John Calvin'; L.body.collarColor = '#6b4a2e'; }
    if (L.type === 'image' && L.body && L.body.collarColor === '#a8825a') L.body.collarColor = '#6b4a2e';   // the first, lighter brown
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
// Where a layer is on a frame, including automatic walking.
function stateAt(L, f) {
  const out = keyStateAt(L, f);
  if (L.body && L.body.on && L.type === 'image') { applyWalk(L, f, out); applyIdle(L, f, out); }
  return out;
}

/* ---- idle motion: breathing, a gentle sway and small head movements ---- */
// A number from the layer's id, so two characters don't sway, breathe or blink in step.
function idHash(L) { let h = 0; for (const ch of L.id) h = (h * 31 + ch.charCodeAt(0)) % 1000; return h; }

/* ---- secondary motion: robe swing, beard sway, automatic squash & stretch ---- */
// How fast the layer's keyframed position is moving on frame f (picture pixels per frame).
function motionAt(L, f) {
  const p = g => keyStateAt(L, clamp(g, 0, project.frames - 1));
  const a = p(f - 1), b = p(f), c = p(f + 1);
  return { vx: (c.x - a.x) / 2, vy: (c.y - a.y) / 2, ay: c.y - 2 * b.y + a.y };
}
function secondary(L, f, s) {
  const out = { robe: 0, beard: 0, stretch: s.stretch || 0 };
  const sc = Math.abs(s.scale) || 1, dir = s.flip ? -1 : 1;
  const lag = motionAt(L, f - 3), now = motionAt(L, f);   // cloth and hair trail a few frames behind
  const vx = lag.vx / (sc * dir);                           // in the character's own direction
  const walkW = s._walkW || 0, phi = s._walkPhi || 0;
  if (L.body && L.body.on && L.body.robeSwing !== false) {
    // How far the hem trails behind, plus a flutter and a wavy hem that come with each step.
    // When standing, a gentle, slow sway (like a light breeze), blending into the walking motion.
    const still = 1 - walkW, t = f / project.fps + idHash(L) / 23, P2 = 2 * Math.PI;
    out.robe = {
      swing: clamp(-vx * 5, -170, 170) + walkW * 45 * Math.sin(2 * phi + 0.8) + still * 14 * Math.sin(P2 * t / 4.7),
      flutter: walkW * 28 + still * 9,
      phase: walkW > 0.5 ? 2 * phi + 0.8 : P2 * t / 2.9,
    };
    out.robe.ripple = walkW * 18 + still * 6 + Math.abs(out.robe.swing) * 0.08;
  }
  if (L.type === 'image' && L.beardSway) {
    const t = f / project.fps + idHash(L) / 29;
    out.beard = clamp(-vx * 3.5, -110, 110) + walkW * 22 * Math.sin(2 * phi + 1.2)
      + (L.idle !== false ? 6 * Math.sin(2 * Math.PI * t / 3.3) : 0)
      - headAngle(L, s) * D2R * L.ih * 0.25;                  // hangs straight down when the head tilts
  }
  if (L.autoStretch) {
    // Stretch when moving up or down fast; squash when stopping suddenly (landing).
    out.stretch += clamp(Math.abs(now.vy) / sc * 0.0025, 0, 0.25) - clamp(-now.ay / sc * 0.004, 0, 0.3);
  }
  return out;
}
// Where squash & stretch is anchored: the feet for characters with a body, the bottom otherwise.
function stretchPivot(L) {
  if (L.type === 'image' && L.body && L.body.on) {
    const k = L.body.size || 1;
    return [L.body.nx - L.iw / 2, L.body.ny - L.ih / 2 + (RIG.hipY + RIG.thigh + RIG.shin + RIG.footH * 0.3) * k];
  }
  if (L.type === 'image') return [0, L.ih / 2];
  if (L.type === 'smiley') return [0, 100];
  return [0, 0];
}

function applyIdle(L, f, out) {
  if (L.idle === false) return;
  const h = idHash(L);
  const t = f / project.fps + h / 37, w = 1 - (out._walkW || 0), S = Math.sin, P2 = 2 * Math.PI;
  out.headTilt = (out.headTilt || 0) + w * (1.3 * S(P2 * t / 4.3) + 0.6 * S(P2 * t / 2.7 + 1.3));
  out.headNod = (out.headNod || 0) + w * 1.2 * S(P2 * t / 3.7 + 0.4);
  out._breath = w * S(P2 * t / 3.6);          // -1 … 1, one breath every 3.6 s
  out._sway = w * 0.45 * S(P2 * t / 6.1 + 0.7); // degrees, from the feet
}

/* ---- head tilt and nod ---- */
// The head turns around the neck (or near the bottom of the picture when there's no body).
function headPivot(L, rig) { return rig ? rig.N : [0, L.ih * 0.4]; }
function headAngle(L, s) { return (s.headTilt || 0) + ((L.body && L.body.facing) || 1) * (s.headNod || 0) * 0.35; }
function applyHeadTransform(ctx, L, s, rig) {
  const [px, py] = headPivot(L, rig), nod = s.headNod || 0;
  ctx.translate(px, py);
  ctx.rotate(headAngle(L, s) * D2R + (rig ? rig.lean : 0));   // the head also turns with a bend at the waist
  // Nodding down tips the head forward, drops it a little and squashes it slightly; up does the reverse.
  ctx.translate(0, nod * 0.0025 * L.ih);
  ctx.scale(1, 1 - Math.min(0.08, Math.abs(nod) * 0.002));
  // The head is drawn relative to where the neck sits in the picture; breathing and bending move it from there.
  ctx.translate(-(rig ? rig.N0[0] : px), -(rig ? rig.N0[1] : py));
}
// Where the purple head dot sits: the top of the head, turned with the head.
function headHandlePos(L, s, rig) {
  const [px, py] = headPivot(L, rig), a = headAngle(L, s) * D2R + (rig ? rig.lean : 0);
  const top = [rig ? rig.N0[0] : px, -L.ih / 2 + 0.06 * L.ih];
  const dx = top[0] - (rig ? rig.N0[0] : px), dy = top[1] - (rig ? rig.N0[1] : py);
  return [px + dx * Math.cos(a) - dy * Math.sin(a), py + dx * Math.sin(a) + dy * Math.cos(a)];
}

/* ---- automatic walk cycle ---- */
// A keyframe's "walk" setting makes the character walk from it to the next keyframe.
// The style sets the stride; the number of steps fits the distance so the feet don't slide.
const WALK_STYLES = {
  stroll: { label: '🐢 Stroll (short steps)', hip: 15, knee: 30, arm: 12, cycles: 0.7 },
  normal: { label: '🚶 Normal', hip: 22, knee: 42, arm: 20, cycles: 0.9 },
  brisk:  { label: '🏃 Brisk (long strides)', hip: 28, knee: 55, arm: 30, cycles: 1.2 },
};

// The walking keyframe pair around frame f, if any.
function walkSegment(L, f) {
  const k = L.keys;
  for (let i = 0; i < k.length - 1; i++) if (f >= k[i].f && f < k[i + 1].f) return k[i].walk && WALK_STYLES[k[i].walk] ? [k[i], k[i + 1]] : null;
  return null;
}

function applyWalk(L, f, out) {
  const seg = walkSegment(L, f);
  if (!seg) return;
  const [a, b] = seg, st = WALK_STYLES[a.walk], fps = project.fps, dur = b.f - a.f;
  const size = (L.body.size || 1) * (Math.abs(a.scale) + Math.abs(b.scale)) / 2;
  const stepLen = 2 * (RIG.thigh + RIG.shin) * size * Math.sin(st.hip * D2R);
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  // Enough steps to cover the ground; walking on the spot just uses the style's own pace.
  const cycles = dist > stepLen * 0.5 ? dist / (2 * stepLen) : st.cycles * dur / fps;
  const phi = 2 * Math.PI * cycles * (f - a.f) / dur;
  // Ease into and out of the walk so he doesn't snap into stepping.
  const ramp = Math.max(1, Math.min(0.3 * fps, dur / 4)), wgt = clamp(Math.min((f - a.f) / ramp, (b.f - f) / ramp), 0, 1);
  const legHip = p => st.hip * Math.sin(p);
  const legKnee = p => -st.knee * Math.max(0, Math.cos(p));   // the knee bends while the leg swings forward
  const pose = {
    legLh: -4 + legHip(phi), legLk: legKnee(phi),
    legRh: 4 + legHip(phi + Math.PI), legRk: legKnee(phi + Math.PI),
    // Arms swing opposite to the leg on their side.
    armLs: -14 + st.arm * Math.sin(phi + Math.PI), armLe: 15 + 10 * Math.max(0, Math.sin(phi + Math.PI)),
    armRs: 14 + st.arm * Math.sin(phi), armRe: 15 + 10 * Math.max(0, Math.sin(phi)),
  };
  out._walkW = wgt;   // idle motion fades out while walking
  out._walkPhi = phi; // where he is in his stride (robe and beard sway in time with it)
  for (const [k, v] of Object.entries(pose)) {
    if (a.walkArms === false && k.startsWith('arm')) continue;
    out[k] = out[k] * (1 - wgt) + v * wgt;
  }
  // Face the way he's walking.
  if (Math.abs(b.x - a.x) > 1) out.flip = (b.x < a.x) === ((L.body.facing || 1) === 1);
  // A small bob: highest as the legs pass each other.
  out.y -= 0.035 * (RIG.thigh + RIG.shin) * size * wgt * (Math.cos(2 * phi) + 1) / 2;
}

// When a keyframe starts walking, turn both ends to face the way he goes, so he doesn't spin round on arrival.
function faceWalk(L, a) {
  const b = L.keys.find(k => k.f > a.f);
  if (!b || !L.body || Math.abs(b.x - a.x) < 1) return;
  a.flip = b.flip = (b.x < a.x) === ((L.body.facing || 1) === 1);
}

function keyStateAt(L, f) {
  const k = L.keys;
  if (f <= k[0].f) return { ...k[0], f };
  const last = k[k.length - 1];
  if (f >= last.f) return { ...last, f };
  let i = 0;
  while (i < k.length - 2 && k[i + 1].f <= f) i++;
  const a = k[i], b = k[i + 1];
  const p = (f - a.f) / (b.f - a.f), t = ease(p, a.ease);
  const out = { ...a, f };
  for (const q of ['x', 'y', 'scale', 'rot', 'opacity', 'headTilt', 'headNod', 'stretch', 'smileR', 'smileL', 'brows', 'lean', ...POSE_KEYS, ...FX_KEYS]) out[q] = (a[q] || 0) + ((b[q] || 0) - (a[q] || 0)) * t;
  // While walking, travel at a steady pace so the steps match the ground.
  if (a.walk && WALK_STYLES[a.walk]) { out.x = a.x + (b.x - a.x) * p; out.y = a.y + (b.y - a.y) * p; }
  return out;
}

function ensureKey(L, f) {
  let k = keyAt(L, f);
  if (!k) {
    k = keyStateAt(L, f);   // the keyframed values only (not the automatic walk on top)
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

const vfx = T => ({ ...VOICE_FX_DEFAULT, ...((T && T.fx) || {}) });
const fxActive = T => {
  if (!T) return false;
  const f = vfx(T);
  return !!(f.semis || Math.abs(f.speed - 1) > 0.01 || f.bass || f.treble || f.reverb !== 'none' || f.echo > 0 || f.gate || f.punch || f.radio || f.robot > 0);
};
// How much faster than the original recording the voice plays (lip sync follows this).
const speedOf = T => {
  if (!fxActive(T)) return 1;
  const f = vfx(T);
  return (f.semis && !f.keep ? Math.pow(2, f.semis / 12) : 1) * f.speed;
};
const fxKey = T => `${T.assetId}|${fxActive(T) ? JSON.stringify(vfx(T)) : 'raw'}`;

// Quiet the background hiss between words: below a threshold the sound is turned right down,
// opening a moment early so the starts of words aren't clipped.
function noiseGate(x, sr) {
  const win = Math.max(1, Math.round(sr * 0.02)), n = Math.ceil(x.length / win), env = new Float32Array(n);
  for (let w = 0; w < n; w++) {
    let s = 0; const a = w * win, b = Math.min(x.length, a + win);
    for (let i = a; i < b; i++) s += x[i] * x[i];
    env[w] = Math.sqrt(s / Math.max(1, b - a));
  }
  const sorted = Array.from(env).sort((a, b) => a - b), floor = sorted[Math.floor(n * 0.1)] || 0, peak = sorted[n - 1] || 1;
  const thr = Math.max(floor * 2.5, peak * 0.03);
  const open = new Float32Array(n);
  for (let w = 0; w < n; w++) if (env[w] > thr) { open[w] = 1; if (w > 0) open[w - 1] = 1; if (w > 1) open[w - 2] = 1; }
  const g = new Float32Array(n), rel = Math.exp(-1 / 6);   // fade down over about 120 ms
  let cur = 0.08;
  for (let w = 0; w < n; w++) { cur = open[w] ? 1 : Math.max(0.08, cur * rel); g[w] = cur; }
  const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const p = i / win - 0.5, w0 = Math.max(0, Math.floor(p)), w1 = Math.min(n - 1, w0 + 1), t = clamp(p - w0, 0, 1);
    y[i] = x[i] * (g[w0] + (g[w1] - g[w0]) * t);
  }
  return y;
}

// A made-up "room sound": noise that fades away, like sound bouncing round a room.
function roomImpulse(oc, r) {
  const sr = oc.sampleRate, n = Math.floor(r.secs * sr), buf = oc.createBuffer(1, n, sr), d = buf.getChannelData(0);
  let seed = 3, prev = 0;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    if (t < r.pre) continue;
    const v = (rnd() * 2 - 1) * Math.pow(1 - t / r.secs, r.decay);
    prev = prev * 0.35 + v * 0.65;   // a little softer, like a real room
    d[i] = prev;
  }
  return buf;
}

// Tone, room, echo, radio, robot and loudness, done with the browser's audio tools.
async function soundFx(x, sr, f) {
  const needed = f.bass || f.treble || f.reverb !== 'none' || f.echo > 0 || f.punch || f.radio || f.robot > 0;
  if (!needed) return x;
  const tail = (REVERBS[f.reverb] ? REVERBS[f.reverb].secs : 0) + (f.echo > 0 ? 1.6 : 0);
  const oc = new OfflineAudioContext(1, x.length + Math.ceil(tail * sr), sr);
  const b = oc.createBuffer(1, x.length, sr);
  b.copyToChannel(x, 0);
  const src = oc.createBufferSource();
  src.buffer = b;
  let node = src;
  const chain = n => { node.connect(n); node = n; };
  const biquad = (type, freq, gain = 0, Q = 0.7) => { const q = oc.createBiquadFilter(); q.type = type; q.frequency.value = freq; q.gain.value = gain; q.Q.value = Q; return q; };
  if (f.radio) {
    chain(biquad('highpass', 450)); chain(biquad('lowpass', 3200)); chain(biquad('peaking', 1500, 6, 1));
    const ws = oc.createWaveShaper(), curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const v = i / 511.5 - 1; curve[i] = Math.tanh(v * 2.2) / Math.tanh(2.2); }
    ws.curve = curve; chain(ws);
  }
  if (f.bass) chain(biquad('lowshelf', 220, f.bass));
  if (f.treble) chain(biquad('highshelf', 3200, f.treble));
  if (f.robot > 0) {
    // Ring modulation: the voice multiplied by a low hum, mixed with a little of the plain voice.
    const dry = oc.createGain(), ring = oc.createGain(), osc = oc.createOscillator(), depth = oc.createGain(), sum = oc.createGain();
    dry.gain.value = 1 - f.robot * 0.75; ring.gain.value = 0; osc.frequency.value = 55; depth.gain.value = f.robot;
    osc.connect(depth); depth.connect(ring.gain); osc.start();
    node.connect(dry); node.connect(ring); dry.connect(sum); ring.connect(sum);
    node = sum;
  }
  if (f.punch) {
    const c = oc.createDynamicsCompressor();
    c.threshold.value = -26; c.knee.value = 12; c.ratio.value = 4; c.attack.value = 0.005; c.release.value = 0.2;
    chain(c);
  }
  const bus = oc.createGain();
  node.connect(bus);
  if (REVERBS[f.reverb]) {
    const cv = oc.createConvolver(), wet = oc.createGain();
    cv.buffer = roomImpulse(oc, REVERBS[f.reverb]); wet.gain.value = f.reverbMix * 1.4;
    node.connect(cv); cv.connect(wet); wet.connect(bus);
  }
  if (f.echo > 0) {
    const d = oc.createDelay(2), fb = oc.createGain(), wet = oc.createGain();
    d.delayTime.value = 0.32; fb.gain.value = 0.38; wet.gain.value = f.echo * 0.8;
    node.connect(d); d.connect(fb); fb.connect(d); d.connect(wet); wet.connect(bus);
  }
  bus.connect(oc.destination);
  src.start();
  const y = (await oc.startRendering()).getChannelData(0);
  // Loudness: "louder & more even" brings the peak up near full volume; otherwise just never clip.
  let peak = 0;
  for (let i = 0; i < y.length; i++) peak = Math.max(peak, Math.abs(y[i]));
  const gain = peak > 0 ? (f.punch ? 0.89 / peak : peak > 0.98 ? 0.95 / peak : 1) : 1;
  if (gain !== 1) for (let i = 0; i < y.length; i++) y[i] *= gain;
  return y;
}
// The audio to actually play: the processed voice if it's ready, else the original.
const trackBuf = T => (fxActive(T) && fxCache[fxKey(T)]) || bufCache[T.assetId];

async function applyFx(T) {
  const raw = await decodeAudio(T.assetId);
  if (!fxActive(T)) { T.duration = raw.duration; return raw; }
  const k = fxKey(T);
  if (!fxCache[k]) {
    await new Promise(r => setTimeout(r, 30)); // let the "working" message show first
    const f = vfx(T), sr = raw.sampleRate;
    let out = AudioUtil.mono(raw);
    if (f.gate) out = noiseGate(out, sr);
    if (f.semis) { const r = Math.pow(2, f.semis / 12); out = f.keep ? AudioUtil.pitchShift(out, r, sr) : AudioUtil.resample(out, r); }
    if (Math.abs(f.speed - 1) > 0.01) out = AudioUtil.stretch(out, 1 / f.speed, sr);   // faster or slower, same pitch
    out = await soundFx(out, sr, f);
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

/* ---- body rig geometry (all in the layer's own coordinates: picture pixels, centred) ---- */

const dirv = (a, len) => [Math.sin(a * D2R) * len, Math.cos(a * D2R) * len];
const nearAngle = (a, ref) => a + 360 * Math.round((ref - a) / 360);

function rigOf(L, s) {
  const b = L.body, k = b.size || 1;
  // Breathing lifts the shoulders (and the head with them); the hips stay put.
  const N0 = [b.nx - L.iw / 2, b.ny - L.ih / 2], dyB = -(s._breath || 0) * 7 * k;
  const Nb = [N0[0], N0[1] + dyB];   // the neck before bending (the robe is drawn from here)
  // Bending at the waist: everything above the waist turns around it (forward = the way he faces).
  const lean = (s.lean || 0) * (b.facing || 1) * D2R, cs = Math.cos(lean), sn = Math.sin(lean);
  const W = [N0[0], N0[1] + RIG.hipY * 0.9 * k];
  const rot = ([x, y]) => { const dx = x - W[0], dy = y - W[1]; return [W[0] + dx * cs - dy * sn, W[1] + dx * sn + dy * cs]; };
  const N = rot(Nb);
  const P = (x, y) => rot([Nb[0] + x * k, Nb[1] + y * k]);
  const H = (x, y) => [N0[0] + x * k, N0[1] + y * k];
  const limb = (base, a1, a2, l1, l2, keys, pref) => {
    const d1 = dirv(a1, l1 * k), mid = [base[0] + d1[0], base[1] + d1[1]];
    const d2 = dirv(a1 + a2, l2 * k), end = [mid[0] + d2[0], mid[1] + d2[1]];
    return { base, mid, end, a1, a2, l1: l1 * k, l2: l2 * k, keys, pref };
  };
  return {
    k, N, Nb, N0, dyB, lean, W,
    armL: limb(P(-RIG.shoulderX, RIG.shoulderY), s.armLs, s.armLe, RIG.upper, RIG.fore, ['armLs', 'armLe'], 1),
    armR: limb(P(RIG.shoulderX, RIG.shoulderY), s.armRs, s.armRe, RIG.upper, RIG.fore, ['armRs', 'armRe'], 1),
    legL: limb(H(-RIG.hipX, RIG.hipY), s.legLh, s.legLk, RIG.thigh, RIG.shin, ['legLh', 'legLk'], -1),
    legR: limb(H(RIG.hipX, RIG.hipY), s.legRh, s.legRk, RIG.thigh, RIG.shin, ['legRh', 'legRk'], -1),
  };
}

// Two-bone reach: angles that put the end of a limb at target, bending the same way as now.
// mode 'low': pick the bend with the elbow / knee lowest; 'out': elbow away from the body's middle.
// Otherwise keep bending the way the limb bends now. (Used by set poses.)
function solveIK(lm, target, mode = '') {
  const [bx, by] = lm.base, dx = target[0] - bx, dy = target[1] - by, dist = Math.hypot(dx, dy) || 1e-6;
  const d = clamp(dist, Math.abs(lm.l1 - lm.l2) + 1e-3, lm.l1 + lm.l2 - 1e-3);
  const tc = [bx + dx / dist * d, by + dy / dist * d];
  const th = Math.atan2(dx, dy) / D2R;
  const al = Math.acos(clamp((lm.l1 ** 2 + d * d - lm.l2 ** 2) / (2 * lm.l1 * d), -1, 1)) / D2R;
  let best = null;
  for (const sg of [1, -1]) {
    const a1 = nearAngle(th + sg * al, lm.a1);
    const e = [bx + Math.sin(a1 * D2R) * lm.l1, by + Math.cos(a1 * D2R) * lm.l1];
    let rel = Math.atan2(tc[0] - e[0], tc[1] - e[1]) / D2R - a1;
    rel = ((rel % 360) + 540) % 360 - 180;
    // Keep bending the same way; a straight limb bends the natural way (elbows/knees forward).
    const side = lm.keys[0].includes('L') ? -1 : 1;   // which side of the body this limb is on
    const score = mode === 'low' ? -e[1] : mode === 'out' ? -(e[0] - bx) * side
      : Math.abs(rel - lm.a2) + (Math.sign(rel) === lm.pref ? 0 : 0.01);
    if (!best || score < best.score) best = { a1, rel, score };
  }
  return [best.a1, best.rel];
}

function rigPoints(L, s) {
  const r = rigOf(L, s), k = r.k, pts = [];
  for (const lm of [r.armL, r.armR, r.legL, r.legR]) pts.push(lm.base, lm.mid, lm.end);
  const pad = (RIG.legW + RIG.footLen) * k;
  // When he bends at the waist the head moves too: include where the picture's corners end up.
  if (r.lean) {
    const c = Math.cos(r.lean), sn = Math.sin(r.lean);
    for (const [x, y] of [[-L.iw / 2, -L.ih / 2], [L.iw / 2, -L.ih / 2], [-L.iw / 2, L.ih / 2], [L.iw / 2, L.ih / 2]]) {
      const dx = x - r.N0[0], dy = y - r.N0[1];
      pts.push([r.N[0] + dx * c - dy * sn, r.N[1] + dx * sn + dy * c]);
    }
  }
  return { pts, pad, N: r.Nb, k };
}

function bounds(L, s) {
  if (L.type === 'smiley') return Smiley.bounds;
  if (L.type === 'caption') return { x: 0, y: 0, w: 1, h: 1 };
  if (L.type === 'image') {
    const b = { x0: -L.iw / 2, y0: -L.ih / 2, x1: L.iw / 2, y1: L.ih / 2 };
    if (L.body && L.body.on && s) {
      const { pts, pad, N, k } = rigPoints(L, s);
      for (const [x, y] of [...pts, [N[0] - RIG.torsoBot * k, N[1] + RIG.torsoH * k], [N[0] + RIG.torsoBot * k, N[1] + RIG.torsoH * k]]) {
        b.x0 = Math.min(b.x0, x - pad / 2); b.x1 = Math.max(b.x1, x + pad / 2);
        b.y0 = Math.min(b.y0, y - pad / 3); b.y1 = Math.max(b.y1, y + pad / 3);
      }
    }
    return { x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0 };
  }
  sctx.save();
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.font = fontOf(L);
  const lines = String(L.text).split('\n');
  const w = Math.max(10, ...lines.map(l => sctx.measureText(l).width));
  sctx.restore();
  const h = lines.length * L.size * 1.15;
  return { x: -w / 2 - 10, y: -h / 2, w: w + 20, h };
}

/* ---- body drawing ---- */

// cap: 'round' for arms (the hand covers the end), 'butt' for legs so they stop flat inside the shoe.
// bendy: a smooth curve through the elbow (rubber-hose style) instead of two straight pieces.
function limbCtrl(lm) { return [2 * lm.mid[0] - (lm.base[0] + lm.end[0]) / 2, 2 * lm.mid[1] - (lm.base[1] + lm.end[1]) / 2]; }
function drawLimb(ctx, lm, w, color, k, cap = 'round', bendy = false) {
  ctx.save();
  ctx.lineCap = cap; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(...lm.base);
  if (bendy) ctx.quadraticCurveTo(...limbCtrl(lm), ...lm.end); else { ctx.lineTo(...lm.mid); ctx.lineTo(...lm.end); }
  ctx.strokeStyle = '#000'; ctx.lineWidth = w + 16 * k; ctx.stroke();   // outline
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke();
  ctx.restore();
}

function drawBodyBack(ctx, L, rig) {
  const b = L.body, k = rig.k, robe = b.robe || '#161616', face = b.facing || 1;
  // Legs and shoes
  for (const leg of [rig.legL, rig.legR]) {
    drawLimb(ctx, leg, RIG.legW * k, '#000', k, 'butt');   // legs and shoes are solid black
    const [ex, ey] = leg.end, rx = RIG.footLen / 2 * k, ry = RIG.footH / 2 * k;
    // The shoe sits at the ankle with the end of the leg tucked inside it, and tilts with the shin,
    // so its sole stays square to the leg (toe up as the front heel lands, toe down as the back foot pushes off).
    ctx.save();
    // Standing (shin within a few degrees of upright) keeps the shoe flat on the ground.
    const shin = leg.a1 + leg.a2, tilt = shin - clamp(shin, -6, 6);
    ctx.translate(ex, ey); ctx.rotate(-tilt * D2R);
    const cx = face * rx * 0.25, cy = -ry * 0.1;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, Math.PI, 0); ctx.lineTo(cx + rx, cy + ry * 0.25); ctx.lineTo(cx - rx, cy + ry * 0.25); ctx.closePath();
    const g = ctx.createLinearGradient(0, cy - ry, 0, cy + ry);
    g.addColorStop(0, '#000'); g.addColorStop(1, '#000');
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 8 * k; ctx.strokeStyle = '#000'; ctx.stroke();
    ctx.restore();
  }
  // Torso: a black robe, wider at the bottom, with rounded shoulders
  const T = RIG;
  ctx.save();
  // Stretch the robe a touch when breathing in, so its hem stays at the hips.
  ctx.translate(...rig.Nb); ctx.scale(k, k * (1 - rig.dyB / (T.torsoH * k)));
  // The sides bend more the lower they go, flutter while walking, and the hem waves. Bending at the
  // waist turns the part above the waist, blending smoothly into the part below.
  const dx = y => robeDx(rig.robe, y), N = 48;
  const hemY = x => T.torsoH + robeHem(rig.robe, x);
  const bend = (x, y) => robeBend(rig.lean, x, y);
  const mv = (x, y) => ctx.moveTo(...bend(x, y)), ln = (x, y) => ctx.lineTo(...bend(x, y));
  const qc = (cx, cy, x, y) => { const c = bend(cx, cy), e = bend(x, y); ctx.quadraticCurveTo(c[0], c[1], e[0], e[1]); };
  ctx.beginPath();
  mv(-T.torsoTop + 80 + dx(0), 0);
  qc(-T.torsoTop - 10 + dx(5), 5, -T.torsoTop + dx(120), 120);
  for (let i = 1; i <= N; i++) { const y = 120 + (T.torsoH - 120) * i / N; ln(-(T.torsoTop + (T.torsoBot - T.torsoTop) * i / N) + dx(y), i === N ? hemY(-T.torsoBot) : y); }
  for (let i = 1; i <= N; i++) { const x = -T.torsoBot + 2 * T.torsoBot * i / N; ln(x + dx(T.torsoH), hemY(x)); }
  for (let i = N - 1; i >= 0; i--) { const y = 120 + (T.torsoH - 120) * i / N; ln(T.torsoTop + (T.torsoBot - T.torsoTop) * i / N + dx(y), y); }
  qc(T.torsoTop + 10 + dx(5), 5, T.torsoTop - 80 + dx(0), 0);
  ctx.closePath();
  const g = ctx.createLinearGradient(-T.torsoBot, 0, T.torsoBot, 0);
  g.addColorStop(0, Smiley.shade(robe, -0.4)); g.addColorStop(0.45, Smiley.shade(robe, 0.12)); g.addColorStop(1, Smiley.shade(robe, -0.3));
  ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = 14; ctx.strokeStyle = '#000'; ctx.stroke();
  ctx.restore();
}

// Fur trim on an open robe: it wraps around the back of the neck and runs down both front
// edges of the robe to the hem, with the robe open between them. It never changes shape, so it's
// drawn once (per colour) onto its own picture and reused every frame.
const trimCache = {};
function trimImage(col, robe) {
  const key = col + '|' + robe;
  if (trimCache[key]) return trimCache[key];
  const hem = RIG.torsoH - 8, X0 = -420, Y0 = -170, W = 840, H = hem - Y0 + 90;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.translate(-X0, -Y0);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const light = Smiley.shade(col, 0.3), dark = Smiley.shade(col, -0.4);

  // The robe opening between the two fur edges: a slightly lighter garment underneath.
  // (It starts at the neck, under the fur, so it has no visible top edge.)
  g.beginPath(); g.moveTo(-200, 105); g.quadraticCurveTo(-92, 430, -80, hem); g.lineTo(118, hem); g.quadraticCurveTo(92, 430, 200, 105); g.closePath();
  g.fillStyle = Smiley.shade(robe, 0.14); g.fill();

  // The middle line of the fur band: up the left front edge, round the back of the neck, down the right.
  const pts = [];
  const quad = (p0, p1, p2, n) => { for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; pts.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]); } };
  quad([-80, hem], [-92, 430], [-205, 105], 60);
  for (let i = 1; i < 40; i++) { const a = Math.PI + Math.PI * i / 40; pts.push([205 * Math.cos(a), 105 + 145 * Math.sin(a)]); }
  quad([205, 105], [92, 430], [118, hem], 60);
  const w = 118, n = pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], tx = b[0] - a[0], ty = b[1] - a[1], len = Math.hypot(tx, ty) || 1;
    return [-ty / len, tx / len];
  });
  const edgeA = pts.map((p, i) => [p[0] + n[i][0] * w / 2, p[1] + n[i][1] * w / 2]);
  const edgeB = pts.map((p, i) => [p[0] - n[i][0] * w / 2, p[1] - n[i][1] * w / 2]);
  const band = (gg = g) => { gg.beginPath(); gg.moveTo(...edgeA[0]); for (const p of edgeA) gg.lineTo(...p); for (const p of [...edgeB].reverse()) gg.lineTo(...p); gg.closePath(); };

  // On the graphics card: grow real fur strands that follow the band.
  if (GFX.hardware()) {
    const furImg = growFur(W, H, col, { hairLen: 46, grain: 2, depth: 26, seed: 3 },
      m => { m.translate(-X0, -Y0); m.filter = 'blur(1.5px)'; band(m); m.fillStyle = '#fff'; m.fill(); },
      fl => {
        fl.translate(-X0, -Y0);
        for (let i = 0; i < pts.length - 1; i++) {
          // Which way the band runs here, stored as a colour for the shader.
          const tx = pts[i + 1][0] - pts[i][0], ty = pts[i + 1][1] - pts[i][1], len = Math.hypot(tx, ty) || 1, r = w / 2 + 45;
          fl.fillStyle = `rgb(${Math.round((tx / len * 0.5 + 0.5) * 255)},${Math.round((ty / len * 0.5 + 0.5) * 255)},128)`;
          fl.beginPath();
          fl.moveTo(pts[i][0] + n[i][0] * r, pts[i][1] + n[i][1] * r); fl.lineTo(pts[i + 1][0] + n[i + 1][0] * r, pts[i + 1][1] + n[i + 1][1] * r);
          fl.lineTo(pts[i + 1][0] - n[i + 1][0] * r, pts[i + 1][1] - n[i + 1][1] * r); fl.lineTo(pts[i][0] - n[i][0] * r, pts[i][1] - n[i][1] * r);
          fl.closePath(); fl.fill();
        }
      });
    if (furImg) {
      g.save(); g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 30; g.shadowOffsetX = 6; g.shadowOffsetY = 10; band(); g.fillStyle = dark; g.fill(); g.restore();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(furImg, 0, 0);
      return (trimCache[key] = { canvas: c, x: X0, y: Y0 });
    }
  }

  // A soft shadow on the robe, then the fur itself.
  g.save(); g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 30; g.shadowOffsetX = 6; g.shadowOffsetY = 10; band(); g.fillStyle = col; g.fill(); g.restore();
  band();
  const grad = g.createLinearGradient(-200, 0, 200, 0);
  grad.addColorStop(0, dark); grad.addColorStop(0.35, col); grad.addColorStop(0.5, light); grad.addColorStop(0.65, col); grad.addColorStop(1, dark);
  g.fillStyle = grad; g.fill();

  // Fur texture: soft strokes running along the band.
  g.save(); band(); g.clip();
  g.lineCap = 'round';
  for (let i = 0; i < pts.length - 1; i++) {
    for (let j = 0; j < 4; j++) {
      const [x, y] = pts[i], off = (rnd() - 0.5) * w, along = Math.atan2(pts[i + 1][1] - y, pts[i + 1][0] - x) + (rnd() - 0.5) * 0.9, len = 26 + rnd() * 30;
      const sx = x + n[i][0] * off, sy = y + n[i][1] * off;
      g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo(sx + Math.cos(along + 0.5) * len * 0.5, sy + Math.sin(along + 0.5) * len * 0.5, sx + Math.cos(along) * len, sy + Math.sin(along) * len);
      g.strokeStyle = rnd() < 0.5 ? light : dark; g.globalAlpha = 0.3 + rnd() * 0.4; g.lineWidth = 4 + rnd() * 4; g.stroke();
    }
  }
  g.restore();

  // Fluffy edges: wisps of fur sticking out on both sides of the band.
  g.lineCap = 'round';
  const wisps = (x, y, nx, ny) => {
    for (let j = 0; j < 2; j++) {
      const a = Math.atan2(ny, nx) + (rnd() - 0.5) * 1.0, len = 14 + rnd() * 20;
      const sx = x - nx * 8 + (rnd() - 0.5) * 10, sy = y - ny * 8 + (rnd() - 0.5) * 10;
      g.beginPath(); g.moveTo(sx, sy);
      g.quadraticCurveTo(sx + Math.cos(a + 0.4) * len * 0.6, sy + Math.sin(a + 0.4) * len * 0.6, sx + Math.cos(a) * len, sy + Math.sin(a) * len);
      g.strokeStyle = rnd() < 0.6 ? col : rnd() < 0.5 ? light : dark;
      g.globalAlpha = 0.8 + rnd() * 0.2; g.lineWidth = 5 + rnd() * 4; g.stroke();
    }
  };
  for (let i = 0; i < pts.length; i += 1) {
    wisps(...edgeA[i], n[i][0], n[i][1]);
    wisps(...edgeB[i], -n[i][0], -n[i][1]);
  }
  g.globalAlpha = 1;
  return (trimCache[key] = { canvas: c, x: X0, y: Y0 });
}

// Grow fur on the graphics card. drawMask paints where it grows; drawFlow paints which way it lies.
// opts: { hairLen, grain (strand size), depth (how far in the fur gets its full colour, px), seed }
function growFur(w, h, color, opts, drawMask, drawFlow) {
  const mk = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const m = mk(), fl = mk(), th = mk();
  drawMask(m.getContext('2d'));
  drawFlow(fl.getContext('2d'));
  const tg = th.getContext('2d');
  tg.filter = `blur(${opts.depth}px)`; tg.drawImage(m, 0, 0);
  const r = GFX.fur(m, fl, th, w, h, { color, ...opts });
  if (!r) return null;
  const out = mk();
  out.getContext('2d').drawImage(r.canvas, r.sx, r.sy, w, h, 0, 0, w, h);
  return out;
}

// A fur cuff at the end of a sleeve, matching the robe trim. Drawn once per colour, then turned
// to follow the forearm each frame.
const cuffCache = {};
function cuffImage(col) {
  if (cuffCache[col]) return cuffCache[col];
  const W = RIG.armW + 70, H = 86, pad = 30;
  const c = document.createElement('canvas');
  c.width = W + pad * 2; c.height = H + pad * 2;
  const g = c.getContext('2d');
  g.translate(c.width / 2, c.height / 2);
  let seed = 23;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const light = Smiley.shade(col, 0.3), dark = Smiley.shade(col, -0.4);
  const band = (gg = g) => { gg.beginPath(); gg.roundRect(-W / 2, -H / 2, W, H, H / 2.2); };
  if (GFX.hardware()) {
    // Fur strands lying along the arm, toward the hand.
    const furImg = growFur(c.width, c.height, col, { hairLen: 20, grain: 1.2, depth: 12, seed: 5 },
      m => { m.translate(c.width / 2, c.height / 2); m.filter = 'blur(1px)'; band(m); m.fillStyle = '#fff'; m.fill(); },
      fl => { fl.fillStyle = 'rgb(128,255,128)'; fl.fillRect(0, 0, c.width, c.height); });
    if (furImg) {
      g.save(); g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 14; g.shadowOffsetY = 5; band(); g.fillStyle = dark; g.fill(); g.restore();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(furImg, 0, 0);
      return (cuffCache[col] = c);
    }
  }
  g.save(); g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 14; g.shadowOffsetY = 5; band(); g.fillStyle = col; g.fill(); g.restore();
  band();
  const grad = g.createLinearGradient(-W / 2, 0, W / 2, 0);
  grad.addColorStop(0, dark); grad.addColorStop(0.45, light); grad.addColorStop(1, dark);
  g.fillStyle = grad; g.fill();
  g.lineCap = 'round';
  // Texture strokes, then wisps sticking out of the top and bottom edges.
  g.save(); band(); g.clip();
  for (let i = 0; i < 70; i++) {
    const x = (rnd() - 0.5) * W, y = (rnd() - 0.5) * H, a = Math.PI / 2 + (rnd() - 0.5) * 1.2, len = 16 + rnd() * 18;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.strokeStyle = rnd() < 0.5 ? light : dark; g.globalAlpha = 0.3 + rnd() * 0.4; g.lineWidth = 3 + rnd() * 3; g.stroke();
  }
  g.restore();
  for (let i = 0; i <= 22; i++) for (const side of [-1, 1]) {
    const x = -W / 2 + 12 + (W - 24) * i / 22, y = side * (H / 2 - 6), a = side * Math.PI / 2 + (rnd() - 0.5) * 1.0, len = 10 + rnd() * 14;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + 0.4) * len * 0.6, y + Math.sin(a + 0.4) * len * 0.6, x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.strokeStyle = rnd() < 0.6 ? col : rnd() < 0.5 ? light : dark; g.globalAlpha = 0.85; g.lineWidth = 4 + rnd() * 3; g.stroke();
  }
  g.globalAlpha = 1;
  return (cuffCache[col] = c);
}
function drawCuff(ctx, arm, k, col, a = arm.a1 + arm.a2) {
  const img = cuffImage(col), back = (RIG.hand + 32) * k;
  // Just above the hand, square to the forearm.
  const cx = arm.end[0] - Math.sin(a * D2R) * back, cy = arm.end[1] - Math.cos(a * D2R) * back;
  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(-a * D2R); ctx.scale(k, k);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  ctx.restore();
}

function drawCollar(ctx, L, rig) {
  const b = L.body;
  if (!b.collarOn) return;
  const t = trimImage(b.collarColor || '#6b4a2e', b.robe || '#161616');
  ctx.save();
  // Same stretch as the robe when breathing, so the trim stays on the robe's edges.
  ctx.translate(...rig.Nb); ctx.scale(rig.k, rig.k * (1 - rig.dyB / (RIG.torsoH * rig.k)));
  ctx.translate(b.trimX ?? 15, 0);   // fine-tune: nudge the trim left or right on the robe
  if (!rig.lean && (!rig.robe || (Math.abs(rig.robe.swing) < 0.5 && rig.robe.flutter < 0.5))) {
    ctx.drawImage(t.canvas, t.x, t.y);
  } else {
    // Bend with the robe: drawn in thin strips, each moved (and turned) as much as the robe is at that height.
    const step = 6, h = t.canvas.height, w = t.canvas.width;
    for (let sy = 0; sy < h; sy += step) {
      const hgt = Math.min(step, h - sy), y = t.y + sy + hgt / 2, [bx, by] = robeBend(rig.lean, robeDx(rig.robe, y), y);
      ctx.save();
      ctx.translate(bx, by); ctx.rotate(robeBendAngle(rig.lean, y));
      ctx.drawImage(t.canvas, 0, sy, w, hgt, t.x, -hgt / 2, w, hgt + 0.8);
      ctx.restore();
    }
  }
  ctx.restore();
}

// Bending at the waist, for a point on the robe (robe units, y down from the neck): above the
// waist it turns with the upper body, below it stays put, with a smooth blend in between.
function robeBendAngle(lean, y) {
  if (!lean) return 0;
  const t = clamp((RIG.hipY * 0.9 - y) / 280, 0, 1);
  return lean * t * t * (3 - 2 * t);
}
function robeBend(lean, x, y) {
  if (!lean) return [x, y];
  const wr = RIG.hipY * 0.9, a = robeBendAngle(lean, y);
  const dy = y - wr, c = Math.cos(a), s = Math.sin(a);
  return [x * c - dy * s, wr + x * s + dy * c];
}

// Robe shape while moving (robe's own units, y measured down from the neck):
// how far sideways it is at height y, and how far the hem dips or rises at position x.
function robeDx(r, y) {
  if (!r) return 0;
  const t = clamp((y - 60) / (RIG.torsoH - 60), 0, 1);
  return r.swing * t * t + r.flutter * Math.sin(Math.PI * t) * Math.sin(r.phase + t * 2.2);
}
function robeHem(r, x) {
  if (!r || !r.ripple) return 0;
  return r.ripple * Math.sin(x / RIG.torsoBot * Math.PI * 1.5 + r.phase);
}

// front: true draws the arms that go in front of the head, false the ones behind it.
function drawArms(ctx, L, rig, s, front) {
  const b = L.body, k = rig.k, robe = b.robe || '#161616', skin = b.skin || '#d6a07c';
  for (const [arm, flag] of [[rig.armL, 'armLFront'], [rig.armR, 'armRFront']]) {
    if (!!s[flag] !== front) continue;
    const bendy = b.bendy !== false;
    drawLimb(ctx, arm, RIG.armW * k, Smiley.shade(robe, 0.1), k, 'round', bendy);
    // On a bendy arm the cuff follows the curve's direction at the wrist.
    const c = limbCtrl(arm), wristAngle = bendy ? Math.atan2(arm.end[0] - c[0], arm.end[1] - c[1]) / D2R : arm.a1 + arm.a2;
    if (b.collarOn) drawCuff(ctx, arm, k, b.collarColor || '#6b4a2e', wristAngle);
    const [hx, hy] = arm.end, r = RIG.hand * k;
    ctx.save();
    const g = ctx.createRadialGradient(hx - r * 0.3, hy - r * 0.3, r * 0.1, hx, hy, r);
    g.addColorStop(0, Smiley.shade(skin, 0.25)); g.addColorStop(1, Smiley.shade(skin, -0.15));
    ctx.beginPath(); ctx.arc(hx, hy, r, 0, Math.PI * 2);
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 8 * k; ctx.strokeStyle = Smiley.shade(skin, -0.5); ctx.stroke();
    ctx.restore();
  }
}

// The skeleton shown on the selected character: bones, fixed pivots and draggable joints.
function drawRigHandles(ctx, L, f, u) {
  const s = stateAt(L, f), rig = rigOf(L, s), k = Math.abs(s.scale) || 1;
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(s.rot * D2R);
  ctx.scale(s.scale * (s.flip ? -1 : 1), s.scale);
  ctx.lineWidth = 2.5 * u / k; ctx.strokeStyle = 'rgba(80,220,255,.9)';
  ctx.beginPath();
  ctx.moveTo(...rig.armL.base); ctx.lineTo(...rig.armR.base);
  ctx.moveTo(rig.N[0], rig.N[1]); ctx.lineTo(rig.W[0], rig.W[1]); ctx.lineTo(rig.W[0], rig.legL.base[1]);   // spine, bending at the waist
  ctx.moveTo(...rig.legL.base); ctx.lineTo(...rig.legR.base);
  for (const lm of [rig.armL, rig.armR, rig.legL, rig.legR]) { ctx.moveTo(...lm.base); ctx.lineTo(...lm.mid); ctx.lineTo(...lm.end); }
  ctx.stroke();
  const dot = (p, r, fill) => { ctx.beginPath(); ctx.arc(p[0], p[1], r * u / k, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 2 * u / k; ctx.strokeStyle = '#fff'; ctx.stroke(); };
  for (const lm of [rig.armL, rig.armR, rig.legL, rig.legR]) {
    dot(lm.base, 4, 'rgba(80,220,255,1)');
    dot(lm.mid, 7, '#ffb627');
    dot(lm.end, 9, '#ff6b6b');
  }
  // Head: a line from the neck to the top of the head, with a purple dot to tilt it.
  const hp = headHandlePos(L, s, rig);
  ctx.beginPath(); ctx.moveTo(...rig.N); ctx.lineTo(...hp);
  ctx.setLineDash([6 * u / k, 5 * u / k]); ctx.strokeStyle = 'rgba(200,140,255,.9)'; ctx.lineWidth = 2 * u / k; ctx.stroke(); ctx.setLineDash([]);
  dot(hp, 9, '#b07cff');
  ctx.restore();
}

function toLocal(s, px, py) {
  const r = -s.rot * D2R, c = Math.cos(r), sn = Math.sin(r), dx = px - s.x, dy = py - s.y;
  return [(dx * c - dy * sn) / (s.scale * (s.flip ? -1 : 1)), (dx * sn + dy * c) / s.scale];
}
function toWorld(s, [lx, ly]) {
  const x = lx * s.scale * (s.flip ? -1 : 1), y = ly * s.scale, r = s.rot * D2R;
  return [s.x + x * Math.cos(r) - y * Math.sin(r), s.y + x * Math.sin(r) + y * Math.cos(r)];
}
// Which joint handle (if any) is under a point on the picture.
function rigHandleAt(L, px, py) {
  if (!L || L.type !== 'image' || !L.body || !L.body.on || state.playing) return null;
  const s = stateAt(L, state.frame), rig = rigOf(L, s), u = project.width / Math.max(1, stage.clientWidth) / viewZoom();
  const [hx, hy] = toWorld(s, headHandlePos(L, s, rig));
  if (Math.hypot(hx - px, hy - py) < 13 * u) return { limb: 'head', part: 'head' };
  for (const part of ['end', 'mid']) for (const limb of ['armR', 'armL', 'legR', 'legL']) {
    const [wx, wy] = toWorld(s, rig[limb][part]);
    if (Math.hypot(wx - px, wy - py) < 13 * u) return { limb, part };
  }
  return null;
}

// The canvas filter for a layer's effects on this frame, or '' when it has none.
function fxFilter(L, s) {
  const p = [], n = v => Math.round(v * 1000) / 1000;
  if (s.fxGray > 0.001) p.push(`grayscale(${n(s.fxGray)})`);
  if (s.fxSepia > 0.001) p.push(`sepia(${n(s.fxSepia)})`);
  if (Math.abs(s.fxBright - 1) > 0.001) p.push(`brightness(${n(s.fxBright)})`);
  if (Math.abs(s.fxContrast - 1) > 0.001) p.push(`contrast(${n(s.fxContrast)})`);
  if (Math.abs(s.fxSat - 1) > 0.001) p.push(`saturate(${n(s.fxSat)})`);
  if (Math.abs(s.fxHue) > 0.1) p.push(`hue-rotate(${n(s.fxHue)}deg)`);
  if (s.fxInvert > 0.001) p.push(`invert(${n(s.fxInvert)})`);
  return p.join(' ');
}

// Layers with effects are drawn on their own sheet first, then copied over with the effect, so
// the effect applies to the character as a whole (not to each arm and leg separately). Only the
// area around the character is processed, and the soft glow is built at quarter size, to stay fast.
const fxCanvases = {};
function fxCanvas(name, w, h) {
  let c = fxCanvases[name];
  if (!c) c = fxCanvases[name] = document.createElement('canvas');
  if (c.width < w || c.height < h) { c.width = Math.max(c.width, w); c.height = Math.max(c.height, h); }
  const g = c.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.filter = 'none';
  g.clearRect(0, 0, w, h);
  return [c, g];
}

function drawLayer(ctx, L, f, alphaMul = 1) {
  const s = stateAt(L, f), filter = fxFilter(L, s), glow = s.fxGlow > 0.001, blur = s.fxBlur > 0.05;
  if (!filter && !glow && !blur) return drawLayerPlain(ctx, L, f, alphaMul);

  // Where the layer lands on this canvas, with room for the glow and blur.
  const fx = L.fx || {}, glowR = fx.glowSize || 40, T = ctx.getTransform();
  const b = bounds(L, s);
  const pts = [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]].map(p => toWorld(s, p)).map(([x, y]) => [T.a * x + T.c * y + T.e, T.b * x + T.d * y + T.f]);
  const pad = Math.ceil((glow ? glowR * 1.6 : 0) + s.fxBlur * 3 + 4), cw = ctx.canvas.width, ch = ctx.canvas.height;
  // The sheet reaches a little past the frame edges, so a blur near an edge has picture to blend with instead of empty space.
  const x0 = Math.max(-pad, Math.floor(Math.min(...pts.map(p => p[0])) - pad)), y0 = Math.max(-pad, Math.floor(Math.min(...pts.map(p => p[1])) - pad));
  const x1 = Math.min(cw + pad, Math.ceil(Math.max(...pts.map(p => p[0])) + pad)), y1 = Math.min(ch + pad, Math.ceil(Math.max(...pts.map(p => p[1])) + pad));
  const bw = x1 - x0, bh = y1 - y0;
  if (bw <= 0 || bh <= 0) return;

  const [sheet, g] = fxCanvas('sheet', bw, bh);
  g.setTransform(T.a, T.b, T.c, T.d, T.e - x0, T.f - y0);
  drawLayerPlain(g, L, f, 1);
  if (blur) {
    // Repeat the pixels along the frame's edges outward, so a blurred background doesn't fade out at the edges.
    const ex0 = -x0, ey0 = -y0, ex1 = cw - x0, ey1 = ch - y0;
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (ex0 > 0) { g.clearRect(0, 0, ex0, bh); g.drawImage(sheet, ex0, 0, 1, bh, 0, 0, ex0, bh); }
    if (ex1 < bw) { g.clearRect(ex1, 0, bw - ex1, bh); g.drawImage(sheet, ex1 - 1, 0, 1, bh, ex1, 0, bw - ex1, bh); }
    if (ey0 > 0) { g.clearRect(0, 0, bw, ey0); g.drawImage(sheet, 0, ey0, bw, 1, 0, 0, bw, ey0); }
    if (ey1 < bh) { g.clearRect(0, ey1, bw, bh - ey1); g.drawImage(sheet, 0, ey1 - 1, bw, 1, 0, ey1, bw, bh - ey1); }
  }

  // On the graphics card when possible (fast); otherwise the browser's built-in filters below.
  const gpu = GFX.hardware() && GFX.layerFx(sheet, bw, bh, {
    gray: s.fxGray, sepia: s.fxSepia, bright: s.fxBright, contrast: s.fxContrast, sat: s.fxSat, hue: s.fxHue,
    invert: s.fxInvert, blur: s.fxBlur, glow: s.fxGlow, glowSize: glowR, glowColor: fx.glowColor,
  });
  if (gpu) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = alphaMul;
    ctx.drawImage(gpu.canvas, gpu.sx, gpu.sy, bw, bh, x0, y0, bw, bh);
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (glow) {
    // A coloured copy of the character's shape, blurred into a tight halo and a wide halo.
    const q = 0.25, sw = Math.max(1, Math.ceil(bw * q)), sh = Math.max(1, Math.ceil(bh * q));
    const [shape, sg] = fxCanvas('shape', sw, sh);
    sg.drawImage(sheet, 0, 0, bw, bh, 0, 0, sw, sh);
    sg.globalCompositeOperation = 'source-in';
    sg.fillStyle = fx.glowColor || '#ffe27a';
    sg.fillRect(0, 0, sw, sh);
    for (const [radius, alpha] of [[glowR, 0.9], [glowR * 0.35, 1.1]]) {
      const [halo, hg] = fxCanvas('halo', sw, sh);
      hg.filter = `blur(${Math.max(0.5, radius * q)}px)`;
      hg.drawImage(shape, 0, 0, sw, sh, 0, 0, sw, sh);
      ctx.globalAlpha = Math.min(1, s.fxGlow * alpha) * alphaMul;
      ctx.drawImage(halo, 0, 0, sw, sh, x0, y0, bw, bh);
    }
  }
  ctx.globalAlpha = alphaMul;
  if (s.fxBlur > 0.05) {
    // Blur (and colour) at a smaller size — a blurry picture doesn't need every pixel — then scale back up.
    const q = clamp(2 / s.fxBlur, 0.3, 1), sw = Math.max(1, Math.ceil(bw * q)), sh = Math.max(1, Math.ceil(bh * q));
    const [soft, bg2] = fxCanvas('soft', sw, sh);
    bg2.filter = `blur(${s.fxBlur * q}px) ${filter}`;
    bg2.drawImage(sheet, 0, 0, bw, bh, 0, 0, sw, sh);
    ctx.drawImage(soft, 0, 0, sw, sh, x0, y0, bw, bh);
  } else {
    if (filter) ctx.filter = filter;
    ctx.drawImage(sheet, 0, 0, bw, bh, x0, y0, bw, bh);
  }
  ctx.restore();
}

function drawLayerPlain(ctx, L, f, alphaMul = 1) {
  const s = stateAt(L, f);
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(s.rot * Math.PI / 180);
  ctx.scale(s.scale * (s.flip ? -1 : 1), s.scale);
  ctx.globalAlpha = clamp(s.opacity, 0, 1) * alphaMul;
  const sec = secondary(L, f, s);
  if (Math.abs(sec.stretch) > 0.001) {
    // Squash & stretch: taller and thinner (or shorter and wider), keeping the same amount of "stuff".
    const [px, py] = stretchPivot(L), sy = Math.max(0.2, 1 + sec.stretch);
    ctx.translate(px, py); ctx.scale(1 / sy, sy); ctx.translate(-px, -py);
  }

  if (L.type === 'smiley') {
    Smiley.draw(ctx, { color: L.color, expr: s.expr, mouth: mouthAt(L, f), blink: L.autoBlink && isBlink(L, f) });
  } else if (L.type === 'image') {
    const rig = L.body && L.body.on ? rigOf(L, s) : null;
    if (rig) rig.robe = sec.robe;
    if (rig && s._sway) {
      // Idle sway: lean the whole figure very slightly, pivoting at the feet.
      const fy = rig.N0[1] + (RIG.hipY + RIG.thigh + RIG.shin) * rig.k;
      ctx.translate(rig.N0[0], fy); ctx.rotate(s._sway * D2R); ctx.translate(-rig.N0[0], -fy);
    }
    if (rig) { drawBodyBack(ctx, L, rig); drawCollar(ctx, L, rig); drawArms(ctx, L, rig, s, false); }   // legs, robe, fur trim and back arms go behind the head
    ctx.save();
    applyHeadTransform(ctx, L, s, rig);   // head, eyes and mouth tilt and nod together
    // Which pictures make up the head on this frame, and where they sit (picture pixels from the top-left).
    const img = imgCache[L.assetId];
    const look = L.autoBlink && L.eyes && L.eyes.closed && isBlink(L, f) ? 'closed' : s.look;   // blinking wins
    const ei = look && L.eyes && imgCache[L.eyes[look]];
    const shape = mouthAt(L, f) || 'X';
    const mid = L.mouths[shape] || L.mouths.X;
    const mi = mid && imgCache[mid];
    const parts = [];
    if (img) parts.push({ img, x: 0, y: 0, w: L.iw, h: L.ih });
    if (ei) parts.push({ img: ei, x: L.iw / 2 - ei.naturalWidth / 2, y: L.ih / 2 - ei.naturalHeight / 2, w: ei.naturalWidth, h: ei.naturalHeight });
    if (mi) {
      const w = mi.naturalWidth * L.mouthScale, h = mi.naturalHeight * L.mouthScale;
      parts.push({ img: mi, x: L.iw / 2 + L.mouthX - w / 2, y: L.ih / 2 + L.mouthY - h / 2, w, h });
    }
    const sway = Math.abs(sec.beard) > 0.5, pad = 200;
    const y0 = Math.round(clamp(L.beardTop ?? L.ih * 0.6, 0, L.ih - 10));
    const lifts = smileLifts(L, s), brows = browLifts(L, s);
    // On the graphics card, one shader puts the head together, bends the beard and lifts the smile and brows.
    const gpuHead = (sway || lifts.length || brows.length) && img && GFX.hardware()
      ? GFX.headWarp(parts, L.iw, L.ih, y0, sway ? clamp(sec.beard, -pad, pad) : 0, pad, lifts, brows) : null;
    if (gpuHead) {
      ctx.drawImage(gpuHead.canvas, gpuHead.sx, gpuHead.sy, gpuHead.w, gpuHead.h, -L.iw / 2 - pad, -L.ih / 2, gpuHead.w, gpuHead.h);
    } else {
    // Otherwise: put the head together with the 2D canvas (on its own picture when the beard sways).
    let hg = ctx, ox = -L.iw / 2, oy = -L.ih / 2, sheet = null;
    if (sway) { [sheet, hg] = fxCanvas('head', L.iw, L.ih); ox = 0; oy = 0; }
    if (!img) { hg.fillStyle = '#888'; hg.fillRect(ox, oy, L.iw, L.ih); }
    for (const pt of parts) hg.drawImage(pt.img, ox + pt.x, oy + pt.y, pt.w, pt.h);
    if (sway) {
      // Slide the strips at the picture's own size (each strip lands exactly on whole pixels, so
      // there are no seams), then shrink the finished head onto the stage in one go.
      const step = 4;
      const [warped, wg] = fxCanvas('headWarp', L.iw + pad * 2, L.ih);
      wg.drawImage(sheet, 0, 0, L.iw, y0, pad, 0, L.iw, y0);
      for (let y = y0; y < L.ih; y += step) {
        const hgt = Math.min(step, L.ih - y), t = (y + hgt / 2 - y0) / (L.ih - y0);
        const dx = Math.round(clamp(sec.beard, -pad, pad) * Math.pow(t, 1.6));
        wg.drawImage(sheet, 0, y, L.iw, hgt, pad + dx, y, L.iw, hgt);
      }
      ctx.drawImage(warped, 0, 0, L.iw + pad * 2, L.ih, -L.iw / 2 - pad, -L.ih / 2, L.iw + pad * 2, L.ih);
    }
    }
    ctx.restore();
    if (rig) drawArms(ctx, L, rig, s, true);     // arms brought in front of the head and beard
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

/* ---------------------------------------------------------------- camera */
// The camera looks at (x, y) on the picture, zoomed in by `zoom` (1 = the whole picture).
// Each camera keyframe says how the camera gets there from the previous one: a cut or a move.
const CAM_INTO = { cut: '✂ Cut', smooth: '〰 Smooth move', steady: '→ Steady move' };
const camKeys = () => project.camera.keys;
const isCamSel = () => state.selCam && !state.selLayer && !state.selTrack;

function camAt(f) {
  const k = camKeys(), W = project.width, H = project.height;
  if (!k.length) return { x: W / 2, y: H / 2, zoom: 1 };
  if (f <= k[0].f) return { ...k[0] };
  const last = k[k.length - 1];
  if (f >= last.f) return { ...last };
  let i = 0;
  while (i < k.length - 2 && k[i + 1].f <= f) i++;
  const a = k[i], b = k[i + 1], p = (f - a.f) / (b.f - a.f);
  const t = b.into === 'cut' ? 0 : b.into === 'steady' ? p : ease(p, 'easeInOut');
  // Blend zoom in "times closer" terms, so a zoom-in feels even rather than rushing at the end.
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, zoom: Math.exp(Math.log(a.zoom) + (Math.log(b.zoom) - Math.log(a.zoom)) * t) };
}

function ensureCamKey(f) {
  let k = camKeys().find(k => k.f === f);
  if (!k) {
    const c = camAt(f);
    k = { f, x: Math.round(c.x), y: Math.round(c.y), zoom: round2(c.zoom), into: 'cut' };
    camKeys().push(k);
    camKeys().sort((a, b) => a.f - b.f);
  }
  return k;
}

function applyCam(ctx, c) {
  ctx.translate(project.width / 2, project.height / 2);
  ctx.scale(c.zoom, c.zoom);
  ctx.translate(-c.x, -c.y);
}
// A point on the stage (what you see) to a point in the scene (where characters live).
function viewToWorld(p, f = state.frame) {
  if (!state.camView) return p;
  const c = camAt(f);
  return { x: c.x + (p.x - project.width / 2) / c.zoom, y: c.y + (p.y - project.height / 2) / c.zoom };
}
const viewZoom = () => (state.camView ? camAt(state.frame).zoom : 1);

// Frame a box (in scene coordinates) with some room around it.
function camFit(x0, y0, x1, y1, pad) {
  const W = project.width, H = project.height, bw = Math.max(1, x1 - x0), bh = Math.max(1, y1 - y0);
  return { x: Math.round((x0 + x1) / 2), y: Math.round((y0 + y1) / 2), zoom: round2(clamp(Math.min(W / (bw * pad), H / (bh * pad)), 0.25, 8)) };
}
function worldBox(L, f, local) {
  const s = stateAt(L, f), b = local || bounds(L, s);
  const pts = [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]].map(p => toWorld(s, p));
  return [Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))];
}
function camShot(kind, L) {
  const f = state.frame, W = project.width, H = project.height;
  if (kind === 'wide') return { x: W / 2, y: H / 2, zoom: 1 };
  if (kind === 'all') {
    const boxes = project.layers.filter(l => l.visible && l.type !== 'caption' && f >= l.start && f <= l.end).map(l => worldBox(l, f));
    if (!boxes.length) return { x: W / 2, y: H / 2, zoom: 1 };
    return camFit(Math.min(...boxes.map(b => b[0])), Math.min(...boxes.map(b => b[1])), Math.max(...boxes.map(b => b[2])), Math.max(...boxes.map(b => b[3])), 1.1);
  }
  if (kind === 'body') return camFit(...worldBox(L, f), 1.08);
  // Face: the top part of the picture (hat to chin) for pictures, the whole smiley for smileys.
  const local = L.type === 'image' ? { x: -L.iw / 2, y: -L.ih / 2, w: L.iw, h: L.ih * (L.body ? 0.62 : 0.75) } : null;
  return camFit(...worldBox(L, f, local), 1.3);
}

// With camera view off: a box showing what the camera sees on this frame.
function drawCamFrame(ctx, c, u) {
  const w = project.width / c.zoom, h = project.height / c.zoom;
  ctx.save();
  ctx.setLineDash([12 * u, 8 * u]); ctx.lineWidth = 3 * u; ctx.strokeStyle = '#ff6b6b';
  ctx.strokeRect(c.x - w / 2, c.y - h / 2, w, h);
  ctx.fillStyle = '#ff6b6b'; ctx.font = `bold ${14 * u}px system-ui, sans-serif`;
  ctx.fillText('🎥 camera', c.x - w / 2 + 6 * u, c.y - h / 2 - 6 * u);
  ctx.restore();
}

/* ---- transitions (on camera keyframes) and the film look ---- */
const TRANSITIONS = { cut: 'None (straight cut)', black: 'Fade through black', white: 'Fade through white', dissolve: 'Dissolve (blend shots)' };
const FILM_PRESETS = {
  none:     { label: '🚫 None', grain: 0, vignette: 0, flicker: 0, scratches: 0, sepia: 0 },
  old:      { label: '🎞️ Old film', grain: 0.6, vignette: 0.7, flicker: 0.6, scratches: 0.7, sepia: 0.6 },
  vignette: { label: '🔲 Dark edges', grain: 0, vignette: 0.6, flicker: 0, scratches: 0, sepia: 0 },
  grainy:   { label: '🌫️ Grainy', grain: 0.5, vignette: 0.2, flicker: 0, scratches: 0, sepia: 0 },
  sepia:    { label: '📜 Sepia', grain: 0.15, vignette: 0.35, flicker: 0, scratches: 0, sepia: 0.8 },
};
const FILM_LABEL = { grain: 'Grain', flicker: 'Flicker', scratches: 'Scratches', sepia: 'Sepia (brown tint)', vignette: 'Dark edges' };
const filmOn = p => !!p && ['grain', 'vignette', 'flicker', 'scratches', 'sepia'].some(k => p[k] > 0.001);

// Is a transition happening on frame f? It's centred on its camera keyframe.
function transitionAt(f) {
  for (const k of camKeys()) {
    if (!k.trans || k.trans === 'cut') continue;
    const d = Math.max(2, k.transDur || Math.round(project.fps * 0.6)), a = k.f - d / 2, b = k.f + d / 2;
    if (f < a || f >= b) continue;
    if (k.trans === 'dissolve') return { kind: 'dissolve', key: k, amount: clamp((f + 0.5 - a) / d, 0, 1) };
    return { kind: k.trans, key: k, amount: clamp(1 - Math.abs(f + 0.5 - k.f) / (d / 2), 0, 1) };
  }
  return null;
}

// The background and every layer, seen through camera `cam` (or no camera).
function drawScene(ctx, f, cam, sel) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = project.bg;
  ctx.fillRect(0, 0, project.width, project.height);
  ctx.save();
  if (cam) applyCam(ctx, cam);
  if (sel && state.onion) {
    const prev = [...sel.keys].reverse().find(k => k.f < f);
    const next = sel.keys.find(k => k.f > f);
    if (prev) drawLayer(ctx, sel, prev.f, 0.25);
    if (next) drawLayer(ctx, sel, next.f, 0.25);
  }
  for (const L of project.layers) {
    if (!L.visible || f < L.start || f > L.end || L.type === 'caption') continue;   // captions go on top, outside the camera
    drawLayer(ctx, L, f);
  }
  ctx.restore();
}

function renderFrame(ctx, f, editor = false) {
  const W = project.width, H = project.height;
  const showTools = editor && !state.playing;
  const sel = showTools ? getSelLayer() : null;
  const useCam = !editor || state.camView;   // the editor can also show the scene without the camera
  const tr = useCam ? transitionAt(f) : null;
  // During a dissolve: the outgoing shot, with the incoming shot blended on top.
  drawScene(ctx, f, !useCam ? null : tr && tr.kind === 'dissolve' ? camAt(Math.min(f, tr.key.f - 1)) : camAt(f), sel);
  if (tr && tr.kind === 'dissolve' && tr.amount > 0) {
    const [other, og] = fxCanvas('dissolve', W, H);
    drawScene(og, f, camAt(Math.max(f, tr.key.f)), sel);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = tr.amount;
    ctx.drawImage(other, 0, 0, W, H, 0, 0, W, H);
    ctx.restore();
  }
  // The film look over the whole picture (graphics card only).
  if (filmOn(project.film) && GFX.available()) {
    const r = GFX.film(ctx.canvas, W, H, project.film, f);
    if (r) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.drawImage(r.canvas, r.sx, r.sy, W, H, 0, 0, W, H); ctx.restore(); }
  }
  drawCaptions(ctx, f);
  // Fades through black or white.
  if (tr && (tr.kind === 'black' || tr.kind === 'white') && tr.amount > 0) {
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = tr.amount;
    ctx.fillStyle = tr.kind === 'black' ? '#000' : '#fff'; ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  if (!showTools) return;
  const cam = useCam ? camAt(f) : null;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (cam) applyCam(ctx, cam);
  const u = W / Math.max(1, stage.clientWidth); // canvas pixels per screen pixel
  const uw = u / (cam ? cam.zoom : 1);            // the same, inside the camera's view
  if (sel) {
    if (state.path) drawMotionPath(ctx, sel, uw);
    drawSelection(ctx, sel, f, uw);
    if (sel.type === 'image' && sel.body && sel.body.on && f >= sel.start && f <= sel.end) drawRigHandles(ctx, sel, f, uw);
  }
  ctx.restore();
  if (!cam && camKeys().length) drawCamFrame(ctx, camAt(f), u);
  if (state.safe) drawSafeZone(ctx, u);
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
  const b = bounds(L, s);
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
    if (!L.visible || f < L.start || f > L.end || L.type === 'caption' || L.locked) continue;   // locked layers let clicks through
    const s = stateAt(L, f);
    if (!s.scale) continue;
    const [lx, ly] = toLocal(s, px, py);
    const b = bounds(L, s);
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
    $('#whisperStatus').className = 'status no'; $('#whisperStatus').textContent = 'Captions need the server too.';
    renderPanel();
    return;
  }
  const ws = $('#whisperStatus');
  ws.className = 'status ' + (state.server.whisper ? 'ok' : 'no');
  ws.textContent = state.server.whisper ? `✓ Whisper captions ready (${(state.server.whisperModel || '').replace(/^ggml-|\.bin$/g, '')})` : 'Whisper not found (captions off).';
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
    <p class="hint">This replaces what's open now. Click <b>Save</b> first if you want to keep it.</p>
    <div class="row"><button data-act="closeModal">Cancel</button></div>`);
}

function createProject(btn) {
  const p = blankProject(btn.dataset.preset, 24, 4);
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
    ['Home / End', 'First / last frame'], ['[ / ]', 'Previous / next caption word'], [', / .', 'Previous / next keyframe'], ['K', 'Add keyframe on this frame'],
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
  const marks = wordMarks();
  if (marks.length) {
    h += `<div class="tl-row words"><div class="tl-head" title="The words from your captions. Click one to jump there; keyframes snap to them when dragged (hold Alt to stop snapping).">Words</div><div class="tl-track" style="${bg}">${marks.map((m, i) => {
      const room = Math.max(6, ((marks[i + 1] ? marks[i + 1].f : N) - m.f) * ppf - 3);
      return `<div class="wordmark" data-f="${m.f}" style="left:${m.f * ppf}px;max-width:${room}px" title="${esc(m.text)} (frame ${m.f + 1}, ${(m.f / fps).toFixed(2)}s)">${esc(m.text)}</div>`;
    }).join('')}</div></div>`;
  }
  const camSel = isCamSel();
  h += `<div class="tl-row cam ${camSel ? 'sel' : ''}" data-cam="1">
      <div class="tl-head" title="Click to work with the camera"><span class="ico">🎥</span><span class="tname">Camera</span></div>
      <div class="tl-track" style="${bg}">${camKeys().map((k, i) => `<div class="kf camkf ${i && k.into !== 'cut' ? 'move' : ''} ${camSel && k.f === state.frame ? 'cur' : ''}" data-f="${k.f}" style="left:${k.f * ppf + ppf / 2}px" title="Camera keyframe at frame ${k.f + 1}${i ? (k.into === 'cut' ? ' (cut)' : ' (move)') : ''}"></div>`).join('')}</div></div>`;
  for (const L of [...project.layers].reverse()) {
    const sel = L.id === state.selLayer;
    h += `<div class="tl-row ${sel ? 'sel' : ''}" data-layer="${L.id}">
      <div class="tl-head"><button class="ico" data-act="toggleVis" data-id="${L.id}" title="Show / hide">${L.visible ? '👁' : '◌'}</button><span>${ICON[L.type]}</span><span class="tname">${esc(L.name)}</span></div>
      <div class="tl-track" style="${bg}">
        <div class="range" style="left:${L.start * ppf}px;width:${(L.end - L.start + 1) * ppf}px"></div>
        ${lipStrip(L)}
        ${L.type === 'caption' ? captionStrip(L) : ''}
        ${L.keys.slice(0, -1).map((k, i) => k.walk && WALK_STYLES[k.walk] ? `<div class="walkbar" style="left:${k.f * ppf}px;width:${(L.keys[i + 1].f - k.f) * ppf}px" title="Walking (${WALK_STYLES[k.walk].label}), frames ${k.f + 1}–${L.keys[i + 1].f + 1}">🚶</div>` : '').join('')}
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
// Bend a limb the other way: mirror the elbow / knee across the line from shoulder / hip
// to hand / foot, so the hand or foot stays put.
function flipLimb(L, limb) {
  if (!L || !L.body) return;
  stopPlay();
  const s = stateAt(L, state.frame), lm = rigOf(L, s)[limb];
  if (Math.abs(lm.a2) < 0.5) return toast('That limb is straight. Bend it a little first, then flip it.');
  const th = Math.atan2(lm.end[0] - lm.base[0], lm.end[1] - lm.base[1]) / D2R;
  const key = ensureKey(L, state.frame);
  key[lm.keys[0]] = Math.round(nearAngle(2 * th - lm.a1, lm.a1) * 10) / 10;
  key[lm.keys[1]] = Math.round(-lm.a2 * 10) / 10;
  commit(); renderAllLight();
}
const LIMB_NAME = { armL: 'left elbow', armR: 'right elbow', legL: 'left knee', legR: 'right knee' };

function showMenu(x, y, items) {
  hideMenu();
  const m = document.createElement('div');
  m.id = 'ctxMenu';
  m.innerHTML = items.map(it => it === '-' ? '<hr>' : `<button data-act="${it.act}" ${it.limb ? `data-limb="${it.limb}"` : ''} class="${it.danger ? 'danger' : ''}">${it.label}</button>`).join('');
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
  if (row.dataset.cam) {
    e.preventDefault();
    state.selCam = true; state.selLayer = null; state.selTrack = null;
    if (kf) {
      setFrame(+kf.dataset.f); buildTimeline();
      showMenu(e.clientX, e.clientY, [{ act: 'delKey', label: `🗑 Delete camera keyframe at frame ${+kf.dataset.f + 1}`, danger: true }]);
    } else if (camKeys().length) {
      renderAllLight();
      showMenu(e.clientX, e.clientY, [{ act: 'camClear', label: '🗑 Remove all camera moves', danger: true }]);
    }
    return;
  }
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
  if (isCamSel()) { e.preventDefault(); return; }
  const p = viewToWorld(toStage(e));
  const joint = rigHandleAt(getSelLayer(), p.x, p.y);
  if (joint && joint.limb === 'head') { e.preventDefault(); return; }
  if (joint) {
    e.preventDefault();
    showMenu(e.clientX, e.clientY, [{ act: 'flipLimb', limb: joint.limb, label: `↔ Bend the ${LIMB_NAME[joint.limb]} the other way` }]);
    return;
  }
  const L = hitTest(p.x, p.y, state.frame);
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
    if (row.dataset.cam) selectCamera();
    else if (row.dataset.layer) { selectLayer(row.dataset.layer); dragLayerRow(e, row.dataset.layer); }
    else if (row.dataset.track) selectTrack(row.dataset.track);
    return;
  }
  const track = e.target.closest('.tl-track');
  if (!track) return;
  e.preventDefault();
  stopPlay();
  const rect = track.getBoundingClientRect();
  const frameAt = ev => clamp(Math.floor((ev.clientX - rect.left) / state.ppf), 0, project.frames - 1);

  const wm = e.target.closest('.wordmark');
  if (wm) { setFrame(+wm.dataset.f, true); buildTimeline(); return; }
  const kfEl = e.target.closest('.kf');
  if (kfEl && row.dataset.cam) {
    // Drag a camera keyframe to a different frame.
    const k = camKeys().find(k => k.f === +kfEl.dataset.f);
    state.selCam = true; state.selLayer = null; state.selTrack = null;
    let moved = false;
    state.frame = k.f;
    buildTimeline(); drawStage(); renderPanel(); updateTransport();
    startDrag(e, ev => {
      const nf = snapToWord(frameAt(ev), ev);
      if (nf !== k.f && !camKeys().some(o => o !== k && o.f === nf)) {
        k.f = nf; camKeys().sort((a, b) => a.f - b.f); moved = true;
        state.frame = nf; buildTimeline(); drawStage(); updateTransport();
      }
    }, () => { if (moved) commit(); renderPanel(); });
    return;
  }
  if (kfEl) {
    const L = getLayer(row.dataset.layer);
    const k = keyAt(L, +kfEl.dataset.f);
    state.selLayer = L.id; state.selTrack = null;
    let moved = false;
    state.frame = k.f;
    buildTimeline(); drawStage(); renderPanel(); updateTransport();
    startDrag(e, ev => {
      const nf = snapToWord(frameAt(ev), ev);
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

  if (row.dataset.cam) { state.selCam = true; state.selLayer = null; state.selTrack = null; }
  else if (row.dataset.layer) { state.selLayer = row.dataset.layer; state.selTrack = null; }
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
  if (isCamSel()) {
    // Camera selected: drag to point it somewhere else.
    const p0 = toStage(e), c0 = camAt(state.frame), k = state.camView ? -1 / c0.zoom : 1;
    stageDrag = { cam: true, moved: false };
    startDrag(e, ev => {
      const p1 = toStage(ev), key = ensureCamKey(state.frame);
      key.x = Math.round(c0.x + (p1.x - p0.x) * k); key.y = Math.round(c0.y + (p1.y - p0.y) * k);
      if (!stageDrag.moved) { stageDrag.moved = true; buildTimeline(); }
      drawStage();
    }, () => {
      const moved = stageDrag.moved;
      stageDrag = null;
      if (moved) { commit(); buildTimeline(); renderPanel(); }
    });
    return;
  }
  const p = viewToWorld(toStage(e));
  // Grabbing a joint of the selected character bends that limb instead of moving the character.
  const sel = getSelLayer(), handle = rigHandleAt(sel, p.x, p.y);
  if (handle) {
    stageDrag = { rig: true, L: sel, ...handle, moved: false };
    stage.setPointerCapture(e.pointerId);
    return;
  }
  const L = hitTest(p.x, p.y, state.frame);
  if (!L) { deselect(); return; }
  if (L.id !== state.selLayer) { state.selLayer = L.id; state.selTrack = null; renderPanel(); }
  const s = stateAt(L, state.frame);
  stageDrag = { L, px: p.x, py: p.y, x: s.x, y: s.y, moved: false };
  stage.setPointerCapture(e.pointerId);
  buildTimeline(); drawStage();
});
stage.addEventListener('pointermove', e => {
  if (stageDrag && stageDrag.cam) return;
  if (isCamSel()) { stage.style.cursor = 'grab'; return; }
  const p = viewToWorld(toStage(e));
  if (!stageDrag) {
    stage.style.cursor = rigHandleAt(getSelLayer(), p.x, p.y) ? 'grab' : hitTest(p.x, p.y, state.frame) ? 'move' : 'default';
    return;
  }
  const d = stageDrag;
  if (d.rig && d.limb === 'head') {
    // Head dot: tilt the head toward the pointer, around the neck.
    const s = stateAt(d.L, state.frame), rig = rigOf(d.L, s), [px, py] = headPivot(d.L, rig), t = toLocal(s, p.x, p.y);
    const ang = 180 - Math.atan2(t[0] - px, t[1] - py) / D2R;   // 0 = straight up, + = leaning toward +x
    const tilt = ((ang + 540) % 360) - 180;
    const key = ensureKey(d.L, state.frame);
    const face = (d.L.body && d.L.body.facing) || 1;
    key.headTilt = Math.round(clamp(tilt - face * (key.headNod || 0) * 0.35 - face * (key.lean || 0), -60, 60));
    if (!d.moved) { d.moved = true; buildTimeline(); stage.style.cursor = 'grabbing'; }
    drawStage();
    return;
  }
  if (d.rig) {
    // Elbow / knee: swing the limb from the shoulder / hip. Hand / foot: reach for the pointer.
    const s = stateAt(d.L, state.frame), lm = rigOf(d.L, s)[d.limb], target = toLocal(s, p.x, p.y);
    const key = ensureKey(d.L, state.frame), r1 = v => Math.round(v * 10) / 10;
    if (d.part === 'mid') {
      key[lm.keys[0]] = r1(nearAngle(Math.atan2(target[0] - lm.base[0], target[1] - lm.base[1]) / D2R, lm.a1));
    } else {
      const [a1, rel] = solveIK(lm, target);
      key[lm.keys[0]] = r1(a1); key[lm.keys[1]] = r1(rel);
    }
    if (!d.moved) { d.moved = true; buildTimeline(); stage.style.cursor = 'grabbing'; }
    drawStage();
    return;
  }
  const k = ensureKey(d.L, state.frame);
  k.x = Math.round(d.x + p.x - d.px);
  k.y = Math.round(d.y + p.y - d.py);
  if (!d.moved) { d.moved = true; buildTimeline(); }
  drawStage();
});
const endStageDrag = () => {
  if (!stageDrag || stageDrag.cam) return;
  const moved = stageDrag.moved;
  stageDrag = null;
  if (moved) { commit(); buildTimeline(); renderPanel(); }
};
stage.addEventListener('pointerup', endStageDrag);
stage.addEventListener('dblclick', e => {
  const p = viewToWorld(toStage(e)), joint = rigHandleAt(getSelLayer(), p.x, p.y);
  if (joint && joint.limb !== 'head') flipLimb(getSelLayer(), joint.limb);
});
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
  if (isCamSel() && !e.ctrlKey && !e.metaKey) {
    // Camera selected: scroll to zoom the camera, toward the pointer.
    e.preventDefault(); stopPlay();
    const p = toStage(e), w = viewToWorld(p), key = ensureCamKey(state.frame);
    key.zoom = round2(clamp(key.zoom * (Math.sign(e.deltaY || e.deltaX) > 0 ? 1 / 1.08 : 1.08), 0.25, 8));
    if (state.camView) {
      key.x = Math.round(w.x - (p.x - project.width / 2) / key.zoom);
      key.y = Math.round(w.y - (p.y - project.height / 2) / key.zoom);
    }
    drawStage();
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => { commit(); buildTimeline(); renderPanel(); }, 300);
    return;
  }
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

// Which fold-out sections ("Look and fit", "Joint angles", …) you've opened or closed, by title,
// so redrawing the panel after a change doesn't snap them shut.
const detailsOpen = {};

/* Panel sections fold open and closed by clicking their title. The choice is remembered by
   section name (the title without changing parts like frame numbers), across frames and layers. */
const secOpen = {};

/* Where you were in the editor (selection, frame, scroll positions, open sections), kept for this
   browser tab so that if the page reloads, e.g. VS Code's Live Server reloading it, nothing is lost. */
const UI_KEY = 'cartoon-studio-ui';
function saveUI() {
  if (!project) return;
  try {
    sessionStorage.setItem(UI_KEY, JSON.stringify({
      selLayer: state.selLayer, selTrack: state.selTrack, selCam: state.selCam, frame: state.frame,
      ppf: state.ppf, zoom: state.zoom, camView: state.camView, onion: state.onion, path: state.path, safe: state.safe, loop: state.loop,
      panelScroll: $('#props').scrollTop, tlLeft: $('#tlScroll').scrollLeft, tlTop: $('#tlScroll').scrollTop,
      stageLeft: $('#stageWrap').scrollLeft, stageTop: $('#stageWrap').scrollTop,
      secOpen, detailsOpen, at: Date.now(),
    }));
  } catch { /* storage unavailable: nothing to keep */ }
}
window.addEventListener('pagehide', saveUI);
window.addEventListener('beforeunload', saveUI);
setInterval(saveUI, 2000);
function restoreUI() {
  let u;
  try { u = JSON.parse(sessionStorage.getItem(UI_KEY) || 'null'); } catch { u = null; }
  if (!u || Date.now() - u.at > 30 * 60 * 1000) return false;   // only shortly after a reload
  Object.assign(secOpen, u.secOpen || {});
  Object.assign(detailsOpen, u.detailsOpen || {});
  for (const k of ['ppf', 'zoom', 'camView', 'onion', 'path', 'safe', 'loop']) if (k in u) state[k] = u[k];
  state.selLayer = getLayer(u.selLayer) ? u.selLayer : null;
  state.selTrack = getTrack(u.selTrack) ? u.selTrack : null;
  state.selCam = !!u.selCam && !state.selLayer && !state.selTrack;
  state.frame = clamp(u.frame || 0, 0, project.frames - 1);
  renderAll();
  // Scroll positions once the page has laid itself out.
  requestAnimationFrame(() => {
    $('#props').scrollTop = u.panelScroll || 0;
    $('#tlScroll').scrollLeft = u.tlLeft || 0; $('#tlScroll').scrollTop = u.tlTop || 0;
    $('#stageWrap').scrollLeft = u.stageLeft || 0; $('#stageWrap').scrollTop = u.stageTop || 0;
  });
  return true;
}
const secKey = h => h.textContent.split(/\d|:/)[0].replace(/[▸▾]/g, '').trim();
function setupSections(el) {
  const secs = $$('.sec', el).filter(s => s.firstElementChild && s.firstElementChild.tagName === 'H4');
  const busy = secs.length > 4;   // short panels just stay open
  secs.forEach((s, i) => {
    const h = s.firstElementChild, k = secKey(h);
    s.classList.add('fold');
    h.tabIndex = 0; h.setAttribute('role', 'button');
    const open = k in secOpen ? secOpen[k] : !busy || i === 0;
    s.classList.toggle('closed', !open);
    h.setAttribute('aria-expanded', open);
  });
  if (busy) {
    const bar = document.createElement('div');
    bar.className = 'foldbar';
    bar.innerHTML = '<button data-act="foldAll" data-open="1">▾ Expand all</button><button data-act="foldAll" data-open="0">▸ Collapse all</button>';
    secs[0].before(bar);
  }
}
function toggleSection(h) {
  const s = h.parentElement, open = s.classList.contains('closed');
  s.classList.toggle('closed', !open);
  h.setAttribute('aria-expanded', open);
  secOpen[secKey(h)] = open;
}
$('#props').addEventListener('click', e => {
  const h = e.target.closest('.sec.fold > h4');
  if (h && !e.target.closest('input, select, button')) toggleSection(h);
});
$('#props').addEventListener('keydown', e => {
  const h = e.target.closest('.sec.fold > h4');
  if (h && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleSection(h); }
});
$('#props').addEventListener('toggle', e => {
  const s = e.target.tagName === 'DETAILS' && e.target.querySelector('summary');
  if (s) detailsOpen[s.textContent] = e.target.open;
}, true);

function renderPanel() {
  if (state.playing) return;
  const el = $('#props');
  const L = getSelLayer(), T = getSelTrack();
  // Remember where you were: scroll position, and the box or button you're using and where it
  // sits on screen, so it stays put even if controls appear or disappear above it.
  const scroll = el.scrollTop, active = el.contains(document.activeElement) ? document.activeElement : null;
  const activeBind = active && active.dataset.bind, activeType = active && active.type;
  const anchorSel = active && Object.keys(active.dataset).length
    ? (activeBind ? `[data-bind="${activeBind}"][type="${activeType}"]`
      : Object.entries(active.dataset).map(([k, v]) => `[data-${k.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}="${v}"]`).join(''))
    : null;
  const anchorTop = active ? active.getBoundingClientRect().top : 0;
  el.innerHTML = L ? (L.type === 'caption' ? captionPanel(L) : layerPanel(L)) : T ? trackPanel(T) : isCamSel() ? cameraPanel() : projectPanel();
  for (const d of $$('details', el)) {
    const t = d.querySelector('summary').textContent;
    if (t in detailsOpen) d.open = detailsOpen[t];
  }
  setupSections(el);
  el.scrollTop = scroll;
  const again = anchorSel && (el.querySelector(anchorSel) || (activeBind && el.querySelector(`[data-bind="${activeBind}"]`)));
  if (again) {
    el.scrollTop += again.getBoundingClientRect().top - anchorTop;
    if (activeBind) again.focus({ preventScroll: true });
  }
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

function defaultBody(L) {
  // For any picture: neck near the bottom middle, sized to the picture.
  return { on: true, nx: Math.round(L.iw / 2), ny: Math.round(L.ih * 0.92), size: round2(L.ih / 1750), robe: '#161616', skin: '#d6a07c', facing: 1 };
}

function bodyPanel(L, s) {
  if (!L.body) {
    return `<div class="sec"><h4>🧍 Body</h4><p class="hint">Give this character a simple body with bendable arms and legs.</p>
      <div class="btnrow"><button data-act="addBody">➕ Add a body</button></div></div>`;
  }
  const b = L.body;
  let h = `<div class="sec"><h4>🧍 Body</h4>
    <label class="check"><input type="checkbox" data-bind="body:on" ${b.on ? 'checked' : ''}>Show body</label>`;
  if (b.on) {
    h += `<div class="btnrow">${Object.entries(POSES).map(([n, p]) => `<button data-act="setPose" data-pose="${n}">${p.label}</button>`).join('')}</div>
      <p class="hint">On the stage, drag the <b style="color:#ff6b6b">red dots</b> (hands and feet) and the elbow/knee and shoulder/hip follow. Drag the <b style="color:#ffb627">orange dots</b> (elbows and knees) to swing the whole limb. <b>Double-click</b> any dot to bend that elbow or knee the other way, for example to bring a hand in to his chest. Poses are saved on this frame's keyframe, so they animate between keyframes.</p>
      <div class="btnrow">${Object.entries(LIMB_NAME).map(([l, n]) => `<button data-act="flipLimb" data-limb="${l}" title="Bend the ${n} the other way (or double-click its dot)">↔ ${n[0].toUpperCase() + n.slice(1)}</button>`).join('')}</div>
      ${pair('Bend at the waist (back ↔ forward)', 'anim:lean', s.lean || 0, -30, 60, 1)}
      <div class="btnrow"><button data-act="setLean" data-v="30" data-nod="8">🙇 Bow</button><button data-act="setLean" data-v="-14">↩ Lean back</button><button data-act="setLean" data-v="0">⟲ Upright</button></div>
      <label class="check"><input type="checkbox" data-bind="anim:armLFront" ${s.armLFront ? 'checked' : ''}>Left arm in front of head and beard</label>
      <label class="check"><input type="checkbox" data-bind="anim:armRFront" ${s.armRFront ? 'checked' : ''}>Right arm in front of head and beard</label>
      <details><summary>Joint angles</summary><div class="grid2">${POSE_KEYS.map(p => numField(POSE_LABEL[p], 'anim:' + p, s[p], { step: 1 })).join('')}</div></details>
      <details><summary>Look and fit</summary>
        <div class="grid2"><label>Robe colour<input type="color" data-bind="body:robe" value="${esc(b.robe)}"></label><label>Hand colour<input type="color" data-bind="body:skin" value="${esc(b.skin)}"></label></div>
        <div class="grid2">${numField('Neck X', 'body:nx', b.nx)}${numField('Neck Y', 'body:ny', b.ny)}</div>
        ${numField('Body size', 'body:size', b.size, { min: 0.1, max: 5, step: 0.05 })}
        <label class="check"><input type="checkbox" data-bind="body:collarOn" ${b.collarOn ? 'checked' : ''}>Fur trim (around the neck, down the front of the robe, and cuffs on the sleeves)</label>
        ${b.collarOn ? `<label>Fur colour<input type="color" data-bind="body:collarColor" value="${esc(b.collarColor || '#6b4a2e')}"></label>${pair('Fur trim position (left ↔ right)', 'body:trimX', b.trimX ?? 15, -80, 80, 1)}` : ''}
        <label>Feet point<select data-bind="body:facing">${opt('1', String(b.facing), 'Right →')}${opt('-1', String(b.facing), '← Left')}</select></label>
      </details>`;
  }
  return h + '</div>';
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
    const needBody = !!c.body && !L.body;
    if (!needEyes.length && !needMouths.length && !needBody) continue;
    try {
      const head = await load(c.head);
      if (head.naturalWidth !== L.iw || head.naturalHeight !== L.ih) continue; // a different version of the character
      L.eyes ||= {};
      for (const k of needEyes) L.eyes[k] = await urlToAsset(c.eyes[k]);
      for (const k of needMouths) L.mouths[k] = await urlToAsset(c.mouths[k]);
      if (needEyes.length) { L.eyesNamedFrom ||= c.eyesNamedFrom || 'screen'; if (L.eyes.closed) L.autoBlink = true; }
      if (needBody) L.body = bodyFrom(c);
      L.charVersion = c.version || 1;
      fixed.push(L.name);
    } catch { /* leave it as it is */ }
  }
  if (!fixed.length) return;
  commit(); renderAll();
  toast(`Updated pictures for ${[...new Set(fixed)].join(', ')}`);

  function load(u) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = u; }); }
}

// A ready-made character's body settings from characters.json, if it has one.
function bodyFrom(c) {
  if (!c.body) return null;
  const b = c.body;
  return { on: true, nx: b.neck[0], ny: b.neck[1], size: b.size || 1, robe: b.robe || '#161616', skin: b.skin || '#d6a07c', facing: b.facing || 1, collarOn: !!b.collar, collarColor: b.collarColor || '#6b4a2e' };
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
    const iw = img.naturalWidth, ih = img.naturalHeight, body = bodyFrom(c);
    let scale = round2(Math.min(1, (c.scale || 0.6) * project.width / iw, 0.6 * project.height / ih));
    let top = -ih / 2, bottom = ih / 2;
    if (body) {
      // Fit the whole figure, head to feet, in the frame.
      bottom = body.ny - ih / 2 + (RIG.hipY + RIG.thigh + RIG.shin + RIG.footH) * body.size;
      scale = round2(Math.min(scale, 0.86 * project.height / (bottom - top)));
    }
    const L = newLayer('image', {
      name: c.name, assetId: head, iw, ih,
      mouths, eyes, autoBlink: !!eyes.closed, mouthX: 0, mouthY: 0, mouthScale: 1, eyesNamedFrom: c.eyesNamedFrom || 'screen', charVersion: c.version || 1, beardSway: !!c.beardTop, beardTop: c.beardTop, face: c.face,
      lip: { trackId: voice ? voice.id : null, cues: [], dialog: '', recognizer: 'pocketSphinx' },
      ...(body ? { body } : {}),
    }, scale);
    if (body) { L.keys[0].y = Math.round(project.height / 2 - (top + bottom) / 2 * scale); commit(); renderAll(); }
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

function fxPanel(L, s) {
  const on = FX_KEYS.filter(k => Math.abs(s[k] - FX_DEFAULT[k]) > 0.001);
  const fx = L.fx || {};
  return `<div class="sec"><h4>✨ Effects${on.length ? `<span class="badge on">${on.length} on</span>` : ''}</h4>
    <div class="btnrow">${Object.entries(FX_PRESETS).map(([n, p]) => `<button data-act="setFx" data-fx="${n}">${p.label}</button>`).join('')}</div>
    <p class="hint">Effects are saved on this frame's keyframe, so they can fade in and out. For example: no glow on frame 1, full glow on frame 24.</p>
    <details ${on.length ? 'open' : ''}><summary>Fine-tune</summary>
      ${FX_KEYS.map(k => pair(FX_LABEL[k][0], 'anim:' + k, s[k], FX_LABEL[k][1], FX_LABEL[k][2], FX_LABEL[k][3])).join('')}
      <div class="grid2"><label>Glow colour<input type="color" data-bind="fx:glowColor" value="${esc(fx.glowColor || '#ffe27a')}"></label>${numField('Glow size', 'fx:glowSize', fx.glowSize || 40, { min: 2, max: 300, step: 2 })}</div>
    </details></div>`;
}

// Smile: soft lifts at each mouth corner (and a gentler one on the cheek above it).
// smileR / smileL are the character's own right / left; 1 = full smile, negative = frown.
const SMILE = { corner: 24, radius: 50, cheek: 0.35, cheekRadius: 95 };
function smileLifts(L, s) {
  const fc = L.face;
  if (!fc) return [];
  const out = [];
  // Only his right corner (nearer the viewer) moves; lifting the far corner looks wrong on this face.
  for (const [side, amt] of [['R', s.smileR || 0]]) {
    if (Math.abs(amt) < 0.005) continue;
    const m = fc['mouth' + side], c = fc['cheek' + side];
    // A positive lift makes the shader look a little lower, which moves the picture up there.
    if (m) out.push([m[0], m[1], SMILE.radius, amt * SMILE.corner]);
    if (c && amt > 0) out.push([c[0], c[1], SMILE.cheekRadius, amt * SMILE.corner * SMILE.cheek]);
  }
  return out;
}

// Eyebrows: a wide, soft lift over each brow. 1 = raised, negative = lowered (stern).
const BROW_LIFT = 20;
function browLifts(L, s) {
  const fc = L.face, amt = s.brows || 0;
  if (!fc || Math.abs(amt) < 0.005) return [];
  return ['browR', 'browL'].filter(k => fc[k]).map(k => [...fc[k], amt * BROW_LIFT]);
}

function headPanel(L) {
  const ks = keyStateAt(L, state.frame);   // the keyframed values, without idle motion jiggling the sliders
  return `<div class="sec"><h4>🙂 Head</h4>
    ${L.face ? `${pair('Smile (lower = frown, higher = smile)', 'anim:smileR', ks.smileR || 0, -1, 2, 0.05)}
      <div class="btnrow"><button data-act="setSmile" data-r="1.3" data-l="0">😊 Smile</button><button data-act="setSmile" data-r="0" data-l="0">😐 Straight</button><button data-act="setSmile" data-r="-0.6" data-l="0">☹ Frown</button></div>
      <p class="hint">Moves the corner of his mouth nearer the viewer. Saved on keyframes, so a smile can grow and fade, and it works while he's talking. Up to 2 for a big smile.</p>
      ${L.face.browR ? `${pair('Eyebrows (lower ↔ raise)', 'anim:brows', ks.brows || 0, -1, 1.5, 0.05)}
        <div class="btnrow"><button data-act="setBrows" data-v="1">🤨 Raise</button><button data-act="setBrows" data-v="0">😐 Normal</button><button data-act="setBrows" data-v="-0.7">😠 Stern</button></div>` : ''}
      <details><summary>Fine-tune where the smile lifts</summary><div class="grid2">${numField('Point X (picture pixels)', 'face:mouthRX', L.face.mouthR[0])}${numField('Point Y', 'face:mouthRY', L.face.mouthR[1])}</div><p class="hint">Lower X moves it left; lower Y moves it up.</p></details>` : ''}
    ${pair('Tilt (lean left ↔ right)', 'anim:headTilt', ks.headTilt || 0, -45, 45, 1)}
    ${pair('Nod (up ↔ down)', 'anim:headNod', ks.headNod || 0, -25, 25, 1)}
    <div class="btnrow"><button data-act="nodYes" title="Adds a quick double nod starting on this frame">👍 Nod "yes"</button><button data-act="headStraight">⟲ Straighten</button></div>
    ${L.body ? `<label class="check"><input type="checkbox" data-bind="layer:idle" ${L.idle !== false ? 'checked' : ''}>Idle motion: breathing, gentle sway and small head movements</label>` : ''}
    <p class="hint">${L.body && L.body.on ? 'Drag the <b style="color:#b07cff">purple dot</b> on top of his head to tilt it. ' : ''}Tilt and nod are saved on keyframes. ${L.body ? 'Idle motion plays on top by itself and fades out while he walks.' : ''}</p></div>`;
}

function motionPanel(L) {
  const ks = keyStateAt(L, state.frame), b = L.body;
  return `<div class="sec"><h4>🌀 Motion extras</h4>
    ${pair('Squash ↔ stretch', 'anim:stretch', ks.stretch || 0, -0.6, 0.6, 0.01)}
    <div class="btnrow"><button data-act="squashPose" data-v="-0.3">⬇ Squash</button><button data-act="squashPose" data-v="0.3">⬆ Stretch</button><button data-act="boing" title="A quick squash-stretch wobble starting on this frame">🏀 Boing!</button></div>
    <label class="check"><input type="checkbox" data-bind="layer:autoStretch" ${L.autoStretch ? 'checked' : ''}>Automatic squash & stretch when moving up or down fast</label>
    ${b && b.on ? `<label class="check"><input type="checkbox" data-bind="body:bendy" ${b.bendy !== false ? 'checked' : ''}>Bendy arms (smooth, rubber-hose style)</label>
      <label class="check"><input type="checkbox" data-bind="body:robeSwing" ${b.robeSwing !== false ? 'checked' : ''}>Robe swings when he moves</label>` : ''}
    <label class="check"><input type="checkbox" data-bind="layer:beardSway" ${L.beardSway ? 'checked' : ''}>Beard (or hair) sways</label>
    ${L.beardSway ? pair('Where the beard starts (from the top of the picture)', 'layer:beardTop', L.beardTop ?? Math.round(L.ih * 0.6), 0, L.ih, 10) : ''}
    <p class="hint">Squash & stretch is saved on keyframes. The robe, beard and arm curves move by themselves, trailing behind his movement.</p></div>`;
}

function walkControls(L, k) {
  const next = L.keys.find(o => o.f > k.f);
  return `<label>Walk to the next keyframe<select data-bind="key:walk">${opt('', k.walk || '', 'None')}${Object.entries(WALK_STYLES).map(([v, s]) => opt(v, k.walk || '', s.label)).join('')}</select></label>
    ${k.walk ? `<label class="check"><input type="checkbox" data-bind="key:walkArms" ${k.walkArms !== false ? 'checked' : ''}>Swing arms while walking</label>
      <p class="hint">${next ? `He walks from here to where he is on frame ${next.f + 1}, facing the way he goes. Move him on that keyframe to change where he ends up; move the keyframe on the timeline to change how long it takes.` : 'Now add a keyframe later on and move him there. He will walk to it.'}</p>` : ''}`;
}

/* ---------------------------------------------------------------- captions */
// A caption layer holds the words Whisper heard, each with its time in the original recording.
// It's drawn on top of everything, fixed on screen (the camera doesn't move it).
const CAP_DEFAULT = { font: 'Arial Black', size: 76, color: '#ffffff', hi: '#ffd23f', stroke: '#000000', upper: true, box: false, perCap: 3, pos: 0.7, pop: true };
const CAP_PRESETS = {
  pop:     { label: '⚡ TikTok pop', font: 'Arial Black', size: 80, color: '#ffffff', hi: '#ffd23f', stroke: '#000000', upper: true, box: false, perCap: 3, pop: true },
  clean:   { label: '✨ Clean', font: 'Trebuchet MS', size: 64, color: '#ffffff', hi: '#ffffff', stroke: '#000000', upper: false, box: true, perCap: 4, pop: false },
  classic: { label: '🎬 Subtitles', font: 'Arial', size: 52, color: '#ffffff', hi: '#ffffff', stroke: '#000000', upper: false, box: true, perCap: 8, pop: false },
  bold:    { label: '🔥 Big & bold', font: 'Impact', size: 110, color: '#ffffff', hi: '#ff5a36', stroke: '#000000', upper: true, box: false, perCap: 2, pop: true },
};

// Group words into short captions: a new one starts after a pause, after a full stop, or when full.
const chunkCache = new WeakMap();
function captionChunks(L) {
  const n = Math.max(1, Math.round((L.cap && L.cap.perCap) || CAP_DEFAULT.perCap));
  const hit = chunkCache.get(L.words);
  if (hit && hit.n === n) return hit.chunks;
  const chunks = [];
  let cur = [];
  L.words.forEach((w, i) => {
    const prev = L.words[i - 1];
    if (cur.length && (cur.length >= n || w.start - prev.end > 0.5 || /[.?!]$/.test(prev.text))) { chunks.push(cur); cur = []; }
    cur.push(w);
  });
  if (cur.length) chunks.push(cur);
  chunkCache.set(L.words, { n, chunks });
  return chunks;
}
// Seconds from the start of the movie, for a time in the original recording.
function capTime(L, t) {
  const T = getTrack(L.trackId);
  return T ? T.start + t / speedOf(T) : t;
}

function drawCaptions(ctx, f) {
  const t = f / project.fps, W = project.width, H = project.height;
  for (const L of project.layers) {
    if (L.type !== 'caption' || !L.visible || f < L.start || f > L.end || !L.words || !L.words.length) continue;
    const c = { ...CAP_DEFAULT, ...L.cap }, chunks = captionChunks(L);
    // The caption showing now: from its first word until the next caption starts (or a moment after its last word).
    let ci = -1;
    for (let i = 0; i < chunks.length; i++) {
      const a = capTime(L, chunks[i][0].start), next = chunks[i + 1] ? capTime(L, chunks[i + 1][0].start) : Infinity;
      const b = Math.min(next, capTime(L, chunks[i][chunks[i].length - 1].end) + 0.6);
      if (t >= a && t < b) { ci = i; break; }
    }
    if (ci < 0) continue;
    const words = chunks[ci], opacity = clamp(stateAt(L, f).opacity, 0, 1);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = opacity;
    ctx.font = `${c.size}px "${c.font}", sans-serif`;
    ctx.textBaseline = 'middle';
    const txt = w => (c.upper ? w.text.toUpperCase() : w.text);
    const space = ctx.measureText(' ').width, widths = words.map(w => ctx.measureText(txt(w)).width);
    // Is this word the one being said, and how much bigger it is while it pops. Its neighbours make
    // room for the bigger size, so a long popped word never runs into the next one.
    const isNow = i => { const s = capTime(L, words[i].start), e = words[i + 1] ? capTime(L, words[i + 1].start) : capTime(L, words[i].end) + 0.6; return t >= s && t < e; };
    const popOf = i => (c.pop && isNow(i) ? 1 + 0.14 * Math.max(0, 1 - (t - capTime(L, words[i].start)) / 0.12) + 0.04 : 1);
    const dw = i => widths[i] * popOf(i);
    // Wrap onto more lines if it doesn't fit.
    const maxW = W * 0.84, lines = [[]];
    let lw = 0;
    words.forEach((w, i) => {
      const add = widths[i] + (lines[lines.length - 1].length ? space : 0);
      if (lines[lines.length - 1].length && lw + add > maxW) { lines.push([]); lw = 0; }
      lines[lines.length - 1].push(i); lw += widths[i] + (lines[lines.length - 1].length > 1 ? space : 0);
    });
    const lh = c.size * 1.2, y0 = H * c.pos - (lines.length - 1) * lh / 2;
    lines.forEach((ln, li) => {
      const total = ln.reduce((s, i) => s + dw(i), 0) + space * (ln.length - 1);
      let x = W / 2 - total / 2;
      const y = y0 + li * lh;
      if (c.box) {
        ctx.fillStyle = 'rgba(0,0,0,.55)';
        ctx.beginPath(); ctx.roundRect(x - c.size * 0.35, y - lh / 2, total + c.size * 0.7, lh, c.size * 0.25); ctx.fill();
      }
      for (const i of ln) {
        // The word being said is highlighted, and pops up a little as it starts.
        const w = words[i], now = isNow(i), pop = popOf(i);
        ctx.save();
        ctx.translate(x + dw(i) / 2, y); ctx.scale(pop, pop);
        if (c.stroke && !c.box) { ctx.lineJoin = 'round'; ctx.lineWidth = c.size * 0.18; ctx.strokeStyle = c.stroke; ctx.strokeText(txt(w), -widths[i] / 2, 0); }
        ctx.fillStyle = now ? c.hi : c.color;
        ctx.fillText(txt(w), -widths[i] / 2, 0);
        ctx.restore();
        x += dw(i) + space;
      }
    });
    ctx.restore();
  }
}

// After fixing words by hand: keep each word's timing when the count is unchanged; otherwise
// spread the new words over the same stretch of time, longer words getting more of it.
function retimeWords(old, text) {
  const nw = String(text).split(/\s+/).filter(Boolean);
  if (!nw.length) return [];
  if (old.length && nw.length === old.length) return old.map((w, i) => ({ ...w, text: nw[i] }));
  const a = old.length ? old[0].start : 0, b = old.length ? old[old.length - 1].end : nw.length * 0.4;
  const total = nw.reduce((s, w) => s + w.length + 1, 0);
  let t = a;
  return nw.map(w => { const d = (b - a) * (w.length + 1) / total, r = { start: round2(t), end: round2(t + d), text: w }; t += d; return r; });
}

// Every caption word as a timeline marker: { f: frame it starts on, text }.
function wordMarks() {
  const out = [];
  for (const L of project.layers) {
    if (L.type !== 'caption' || !L.visible || !L.words) continue;
    for (const w of L.words) out.push({ f: clamp(Math.round(capTime(L, w.start) * project.fps), 0, project.frames - 1), text: w.text });
  }
  return out.sort((a, b) => a.f - b.f);
}
// Snap a frame to the nearest word start if it's close (about 10 pixels on the timeline). Alt turns it off.
function snapToWord(f, ev) {
  if (ev && ev.altKey) return f;
  const r = Math.max(1, Math.round(10 / state.ppf));
  let best = null;
  for (const m of wordMarks()) if (Math.abs(m.f - f) <= r && (!best || Math.abs(m.f - f) < Math.abs(best.f - f))) best = m;
  return best ? best.f : f;
}
function jumpWord(dir) {
  const marks = wordMarks();
  const m = dir > 0 ? marks.find(m => m.f > state.frame) : [...marks].reverse().find(m => m.f < state.frame);
  if (m) { setFrame(m.f, true); buildTimeline(); toast(m.text); }
}
// Go to a word by name, searching forward from the playhead and wrapping round.
const plainWord = t => t.toLowerCase().replace(/[^\p{L}\p{N}']+/gu, '');
function findWord(q) {
  const marks = wordMarks(), want = plainWord(q);
  if (!want) return;
  if (!marks.length) return toast('No words yet: add Auto captions to a voice track first');
  const hits = marks.filter(m => plainWord(m.text).startsWith(want));
  if (!hits.length) return toast(`"${q}" isn't in the captions`);
  const m = hits.find(m => m.f > state.frame) || hits[0];
  setFrame(m.f, true); buildTimeline();
  toast(`${m.text} (frame ${m.f + 1}${hits.length > 1 ? `, ${hits.indexOf(m) + 1} of ${hits.length}` : ''})`);
}

function captionStrip(L) {
  const k = project.fps * state.ppf;
  return captionChunks(L).map(ch => {
    const x = capTime(L, ch[0].start) * k, w = Math.max(3, (capTime(L, ch[ch.length - 1].end) - capTime(L, ch[0].start)) * k);
    return `<div class="capbar" style="left:${x}px;width:${w}px" title="${esc(ch.map(w => w.text).join(' '))}">${w > 30 ? esc(ch.map(w => w.text).join(' ')) : ''}</div>`;
  }).join('');
}

async function autoCaptions() {
  const T = getSelTrack();
  if (!T) return;
  if (!state.server || !state.server.whisper) return toast('Whisper isn\'t set up. Captions need it in the "whisper" folder.');
  stopPlay();
  const btn = $('[data-act="autoCaptions"]');
  if (btn) { btn.disabled = true; btn.textContent = '👂 Listening…'; }
  try {
    const buf = await decodeAudio(T.assetId);   // the original recording (lip sync is timed to it too)
    const b64 = await AudioUtil.blobToBase64(await AudioUtil.toWav16kMono(buf));
    const r = await fetch((state.api || '') + 'api/whisper', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wav: b64 }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || r.statusText);
    if (!j.words.length) return toast('Whisper didn\'t hear any words in this recording.');
    let L = project.layers.find(l => l.type === 'caption' && l.trackId === T.id);
    if (L) L.words = j.words;
    else {
      L = { id: uid(), type: 'caption', name: 'Captions: ' + T.name, visible: true, start: 0, end: project.frames - 1,
        keys: [key(0, project.width / 2, project.height / 2, 1)], trackId: T.id, words: j.words, cap: { ...CAP_DEFAULT } };
      project.layers.push(L);   // on top of everything
    }
    // The words also help Rhubarb: fill in "What's being said" for characters using this voice.
    let filled = 0;
    for (const C of project.layers) if (C.lip && C.lip.trackId === T.id && !String(C.lip.dialog || '').trim()) { C.lip.dialog = j.words.map(w => w.text).join(' '); filled++; }
    state.selLayer = L.id; state.selTrack = null;
    commit(); renderAll();
    toast(`Captions added: ${j.words.length} words` + (filled ? '. Also filled in the lip sync dialog.' : ''));
  } catch (err) {
    toast('Captions failed: ' + err.message);
    renderPanel();
  }
}

function captionPanel(L) {
  const c = { ...CAP_DEFAULT, ...L.cap }, T = getTrack(L.trackId);
  return `<div class="sec"><h3>💬<input class="title-input" data-bind="layer:name" value="${esc(L.name)}"></h3>
    <p class="hint">${T ? `From the audio "${esc(T.name)}"` : 'Its audio was deleted, so the timing starts at the beginning of the movie'} · ${L.words.length} words. Captions stay put on screen whatever the camera does, and the word being said is highlighted.</p></div>
  <div class="sec"><h4>Style</h4>
    <div class="btnrow">${Object.entries(CAP_PRESETS).map(([k, p]) => `<button data-act="capPreset" data-preset="${k}">${p.label}</button>`).join('')}</div>
    <label>Font<select data-bind="cap:font">${FONTS.concat(['Arial']).filter((v, i, a) => a.indexOf(v) === i).map(x => opt(x, c.font)).join('')}</select></label>
    ${pair('Size', 'cap:size', c.size, 24, 180, 1)}
    ${pair('Height on screen (top ↔ bottom)', 'cap:pos', c.pos, 0.08, 0.95, 0.01)}
    ${pair('Words per caption', 'cap:perCap', c.perCap, 1, 10, 1)}
    <div class="grid2"><label>Colour<input type="color" data-bind="cap:color" value="${esc(c.color)}"></label><label>Word being said<input type="color" data-bind="cap:hi" value="${esc(c.hi)}"></label></div>
    <div class="grid2"><label>Outline<input type="color" data-bind="cap:stroke" value="${esc(c.stroke)}"></label><span></span></div>
    <label class="check"><input type="checkbox" data-bind="cap:upper" ${c.upper ? 'checked' : ''}>ALL CAPITALS</label>
    <label class="check"><input type="checkbox" data-bind="cap:box" ${c.box ? 'checked' : ''}>Dark box behind the words</label>
    <label class="check"><input type="checkbox" data-bind="cap:pop" ${c.pop ? 'checked' : ''}>Word being said pops</label>
  </div>
  <div class="sec"><h4>Words</h4>
    <label>Fix any misheard words<textarea data-bind="captext:all" rows="6">${esc(L.words.map(w => w.text).join(' '))}</textarea></label>
    <p class="hint">Changing a word keeps its timing. Adding or removing words spreads them evenly over the same time.</p>
    <div class="btnrow"><button data-act="redoCaptions">🔄 Listen again</button><button data-act="delLayer" class="danger">🗑 Delete captions</button></div>
  </div>`;
}

function cameraPanel() {
  const f = state.frame, c = camAt(f), keys = camKeys(), k = keys.find(k => k.f === f), first = k && keys[0] === k;
  const chars = project.layers.filter(L => L.type === 'image' || L.type === 'smiley');
  return `<div class="sec"><h3>🎥 Camera</h3>
    <p class="hint">Drag on the stage to point the camera. Scroll to zoom in or out. Each change makes this frame a camera keyframe. Press Esc or click a character's row to go back to editing characters.</p></div>
  <div class="sec"><h4>Frame ${f + 1}<span class="badge ${k ? 'on' : ''}">${k ? '◆ camera keyframe' : '◇ in-between'}</span></h4>
    ${k && !first ? `<label>How the camera gets to this shot</label>
      <div class="btnrow">${Object.entries(CAM_INTO).map(([v, t]) => `<button data-act="camInto" data-into="${v}" class="${k.into === v ? 'on' : ''}">${t}</button>`).join('')}</div>
      <p class="hint">${k.into === 'cut' ? 'The shot changes instantly on this frame.' : 'The camera moves the whole time since the previous camera keyframe. To hold a shot before moving, add a keyframe where the move should start.'}</p>` : ''}
    ${k ? `<label>Transition here<select data-bind="cam:trans">${Object.entries(TRANSITIONS).map(([v, t]) => opt(v, k.trans || 'cut', t)).join('')}</select></label>
      ${k.trans && k.trans !== 'cut' ? pair('Transition length (frames)', 'cam:transDur', k.transDur || Math.round(project.fps * 0.6), 2, project.fps * 3, 1) + `<p class="hint">The ${k.trans === 'dissolve' ? 'blend' : 'fade'} is centred on this frame: half before, half after.${first ? ' On the first keyframe, a fade makes the movie fade in.' : ''}</p>` : ''}` : ''}
    ${pair('Zoom', 'cam:zoom', c.zoom, 0.25, 8, 0.05)}
    <div class="grid2">${numField('Look at X', 'cam:x', c.x)}${numField('Look at Y', 'cam:y', c.y)}</div>
    <div class="btnrow"><button data-act="prevKey">◀ Key</button><button data-act="addKey">◆ Add</button><button data-act="delKey" ${k ? '' : 'disabled'}>✕ Remove</button><button data-act="nextKey">Key ▶</button></div>
  </div>
  <div class="sec"><h4>Quick shots</h4>
    <div class="btnrow"><button data-act="camShot" data-shot="wide">🖼 Whole picture</button><button data-act="camShot" data-shot="all">👥 Everyone</button></div>
    ${chars.map(L => `<div class="btnrow"><button data-act="camShot" data-shot="face" data-id="${L.id}">🔍 ${esc(L.name)}: face</button><button data-act="camShot" data-shot="body" data-id="${L.id}">🧍 ${esc(L.name)}: full</button></div>`).join('')}
    <p class="hint">Quick shots frame things where they are on this frame, and make it a camera keyframe.</p>
  </div>
  ${keys.length ? '<div class="sec"><div class="btnrow"><button data-act="camClear" class="danger">Remove all camera moves</button></div></div>' : ''}`;
}

function filmPanel() {
  const p = { ...FILM_PRESETS.none, ...(project.film || {}) };
  const isOn = n => Object.keys(FILM_LABEL).every(k => Math.abs(FILM_PRESETS[n][k] - p[k]) < 0.001);
  return `<div class="sec"><h4>🎞️ Film look</h4>
    <div class="btnrow">${Object.entries(FILM_PRESETS).map(([n, f]) => `<button data-act="filmPreset" data-preset="${n}" class="${isOn(n) ? 'on' : ''}">${f.label}</button>`).join('')}</div>
    <details><summary>Fine-tune the film look</summary>${Object.entries(FILM_LABEL).map(([k, l]) => pair(l, 'film:' + k, p[k], 0, 1, 0.05)).join('')}</details>
    <p class="hint">${GFX.available() ? 'Applies to the whole movie, on top of everything.' : 'This browser can\'t use the graphics card (WebGL), so the film look is off. Try an up-to-date Chrome or Edge.'}</p></div>`;
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
  ${filmPanel()}
  <div class="sec"><h4>Which format?</h4>
    <p class="hint" style="color:var(--text)"><b>★ Posting to YouTube, Instagram, Facebook and TikTok? Use 9:16 Vertical (1080×1920).</b> It's the one shape all four accept as a short video: YouTube Shorts, Instagram Reels, Facebook Reels and TikTok. Keep it under about 60 seconds to be safe everywhere, and keep faces and words inside the safe zone.</p>
    <p class="hint"><b>4:5 or 1:1</b>: Instagram & Facebook feed posts only.<br><b>16:9</b>: regular (non-Shorts) YouTube or Facebook video.<br><br>24 frames per second is the classic cartoon speed. 12 gives a choppier, hand-drawn feel.</p>
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
    ${k && L.type === 'image' && L.body && L.body.on ? walkControls(L, k) : ''}
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
    h += headPanel(L);
    h += motionPanel(L);
    h += bodyPanel(L, s);
    h += `<div class="sec"><h4>Image</h4><p class="hint">${L.iw}×${L.ih} pixels. PNG pictures with a see-through background work best for characters.</p></div>`;
  }

  h += fxPanel(L, s);
  h += `<div class="sec"><h4>On screen</h4>
    <label class="check"><input type="checkbox" data-bind="layer:locked" ${L.locked ? 'checked' : ''}>🔒 Locked: clicks on the stage go through it (good for backgrounds)</label>
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
    <div class="btnrow"><button data-act="autoCaptions" class="primary" ${state.server && state.server.whisper ? '' : 'disabled'} title="Turn this recording into timed captions with Whisper">📝 Auto captions</button></div>
    <p class="hint">${state.server && state.server.whisper ? 'Whisper listens to this recording and puts the words on screen, in time with the voice.' : 'Auto captions need Whisper in the "whisper" folder and the editor opened with start.bat.'}</p>
  </div>
  ${voiceFxPanel(T)}
  <div class="sec"><div class="btnrow"><button data-act="delTrack" class="danger">🗑 Delete audio</button></div></div>`;
}

function voiceFxPanel(T) {
  const f = vfx(T);
  const soundOn = p => SOUND_FIELDS.every(k => (k in p ? p[k] : VOICE_FX_DEFAULT[k]) === f[k] || (k === 'reverbMix' && f.reverb === 'none'));
  return `<div class="sec"><h4>🎛️ Voice effect</h4>
    <label>Voice</label>
    <div class="btnrow">${Object.entries(VOICE_PRESETS).map(([k, p]) =>
      `<button data-act="voicePreset" data-preset="${k}" class="${f.semis === p.semis && (f.keep === p.keep || !p.semis) ? 'on' : ''}">${p.label}</button>`).join('')}</div>
    <label>Place & style</label>
    <div class="btnrow">${Object.entries(SOUND_PRESETS).map(([k, p]) =>
      `<button data-act="soundPreset" data-preset="${k}" class="${soundOn(p) ? 'on' : ''}">${p.label}</button>`).join('')}</div>
    ${pair('Pitch (lower ↔ higher)', 'track:fxSemis', f.semis, -12, 12, 1)}
    <label class="check"><input type="checkbox" data-bind="track:fxKeep" ${f.keep ? 'checked' : ''}>Keep the same speed when changing pitch</label>
    ${pair('Speed (slower ↔ faster, same pitch)', 'track:fxSpeed', f.speed, 0.6, 1.5, 0.05)}
    <details><summary>More voice controls</summary>
      ${pair('Bass (thinner ↔ deeper, fuller)', 'track:fxBass', f.bass, -12, 12, 1)}
      ${pair('Treble (softer ↔ crisper)', 'track:fxTreble', f.treble, -12, 12, 1)}
      <label>Room sound<select data-bind="track:fxReverb">${opt('none', f.reverb, 'None')}${Object.entries(REVERBS).map(([k, r]) => opt(k, f.reverb, r.label)).join('')}</select></label>
      ${f.reverb !== 'none' ? pair('How much room sound', 'track:fxReverbMix', f.reverbMix, 0, 1, 0.05) : ''}
      ${pair('Echo (repeats)', 'track:fxEcho', f.echo, 0, 1, 0.05)}
      ${pair('Robot', 'track:fxRobot', f.robot, 0, 1, 0.05)}
      <label class="check"><input type="checkbox" data-bind="track:fxGate" ${f.gate ? 'checked' : ''}>Clean up background noise between words</label>
      <label class="check"><input type="checkbox" data-bind="track:fxPunch" ${f.punch ? 'checked' : ''}>Louder & more even</label>
      <label class="check"><input type="checkbox" data-bind="track:fxRadio" ${f.radio ? 'checked' : ''}>Old radio</label>
    </details>
    <div class="btnrow"><button data-act="listenTrack">▶ Listen</button><button data-act="saveVoiceWav" title="Download this audio, with the effect, as a WAV file">⬇ Save WAV</button></div>
    <p class="hint">Try <b>⛪ Church</b> for preaching scenes, or <b>🎙️ Clean & clear</b> if the recording has a hum or hiss. Mix a Voice with a Place & style. Press ▶ Listen after each change. Your original recording is never changed, and lip sync stays matched, even if you change the speed.</p>
  </div>`;
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
    for (const k of p.camera.keys) { k.x = Math.round(k.x * sx); k.y = Math.round(k.y * sy); }
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
    const seenCam = new Set();
    p.camera.keys = p.camera.keys.map(k => ({ ...k, f: Math.round(k.f * r) })).filter(k => !seenCam.has(k.f) && seenCam.add(k.f));
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
      if (k && prop === 'walk' && v) faceWalk(L, k);
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
    case 'fx':
      if (!L) return;
      L.fx ||= {};
      L.fx[prop] = v;
      break;
    case 'film':
      project.film = { ...FILM_PRESETS.none, ...(project.film || {}), [prop]: v };
      break;
    case 'cam': {
      const key = ensureCamKey(state.frame);
      key[prop] = prop === 'zoom' ? clamp(v, 0.25, 8) : v;
      break;
    }
    case 'face':
      if (!L || !L.face) return;
      L.face = { ...L.face, mouthR: prop === 'mouthRX' ? [v, L.face.mouthR[1]] : [L.face.mouthR[0], v] };
      break;
    case 'cap':
      if (!L) return;
      L.cap = { ...CAP_DEFAULT, ...L.cap, [prop]: v };
      break;
    case 'captext':
      if (!L || !final) return;
      L.words = retimeWords(L.words, v);
      break;
    case 'body':
      if (!L) return;
      L.body ||= defaultBody(L);
      L.body[prop] = prop === 'facing' ? +v : v;
      break;
    case 'lip':
      if (!L) return;
      L.lip[prop] = v === '' && prop === 'trackId' ? null : v;
      break;
    case 'track':
      if (!T) return;
      if (prop.startsWith('fx')) {
        // Voice effect settings (fxSemis -> semis, fxReverbMix -> reverbMix, …); redone when you let go.
        if (!final) return;
        const key = prop[2].toLowerCase() + prop.slice(3);
        T.fx = { ...vfx(T), [key]: key === 'semis' ? Math.round(v) : v };
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

function selectLayer(id) { state.selLayer = id; state.selTrack = null; state.selCam = false; renderAllLight(); }
function selectTrack(id) { state.selTrack = id; state.selLayer = null; state.selCam = false; renderAllLight(); }
function selectCamera() { state.selCam = true; state.selLayer = null; state.selTrack = null; renderAllLight(); }
function deselect() { state.selLayer = null; state.selTrack = null; state.selCam = false; renderAllLight(); }
function renderAllLight() { buildTimeline(); renderPanel(); drawStage(); }

function updateTransport() {
  const f = state.frame, N = project.frames, fps = project.fps;
  $('#frameInfo').textContent = `Frame ${f + 1} / ${N}   ·   ${(f / fps).toFixed(2)}s / ${(N / fps).toFixed(2)}s`;
  $('#playBtn').textContent = state.playing ? '⏸' : '▶';
  $('#tgLoop').classList.toggle('on', state.loop);
  $('#tgOnion').classList.toggle('on', state.onion);
  $('#tgPath').classList.toggle('on', state.path);
  $('#tgSafe').classList.toggle('on', state.safe);
  $('#tgCam').classList.toggle('on', state.camView);
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
  const keys = isCamSel() ? camKeys() : L && L.keys;
  if (!keys) return;
  const k = dir < 0 ? [...keys].reverse().find(k => k.f < state.frame) : keys.find(k => k.f > state.frame);
  if (k) { setFrame(k.f); buildTimeline(); updatePlayhead(true); }
}

const actions = {
  newProject: newProjectDialog, createProject, openProject, saveProject, undo, redo,
  exportVideo, runExport, snapshot, closeModal, help: helpDialog, rhubarbHelp,
  addText,
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
  addKey: () => {
    if (isCamSel()) { ensureCamKey(state.frame); commit(); renderAllLight(); return; }
    const L = getSelLayer(); if (!L) return; ensureKey(L, state.frame); commit(); renderAllLight();
  },
  delKey: () => {
    if (isCamSel()) {
      project.camera.keys = camKeys().filter(k => k.f !== state.frame);
      commit(); renderAllLight(); return;
    }
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
  autoCaptions,
  redoCaptions: () => { const L = getSelLayer(), T = L && getTrack(L.trackId); if (!T) return toast('The audio for these captions was deleted'); state.selTrack = T.id; state.selLayer = null; autoCaptions(); },
  capPreset: b => {
    const L = getSelLayer(), p = CAP_PRESETS[b.dataset.preset];
    if (!L || !p) return;
    const { label, ...vals } = p;
    L.cap = { ...CAP_DEFAULT, ...L.cap, ...vals };
    commit(); renderAllLight();
  },
  foldAll: b => {
    const open = b.dataset.open === '1';
    for (const h of $$('#props .sec.fold > h4')) {
      h.parentElement.classList.toggle('closed', !open);
      h.setAttribute('aria-expanded', open);
      secOpen[secKey(h)] = open;
    }
  },
  filmPreset: b => {
    const p = FILM_PRESETS[b.dataset.preset];
    if (!p) return;
    const { label, ...vals } = p;
    project.film = vals;
    commit(); renderAllLight();
  },
  squashPose: b => {
    const L = getSelLayer();
    if (!L) return;
    stopPlay();
    ensureKey(L, state.frame).stretch = +b.dataset.v;
    commit(); renderAllLight();
  },
  boing: () => {
    const L = getSelLayer();
    if (!L) return;
    stopPlay();
    const f0 = state.frame, step = Math.max(2, Math.round(project.fps / 8));
    [-0.35, 0.25, -0.12, 0.05, 0].forEach((v, i) => {
      const f = f0 + i * step;
      if (f <= project.frames - 1) ensureKey(L, f).stretch = v;
    });
    commit(); renderAllLight();
    toast('Boing!');
  },
  setBrows: b => {
    const L = getSelLayer();
    if (!L) return;
    stopPlay();
    ensureKey(L, state.frame).brows = +b.dataset.v;
    commit(); renderAllLight();
  },
  setLean: b => {
    const L = getSelLayer();
    if (!L || !L.body) return;
    stopPlay();
    const k = ensureKey(L, state.frame);
    k.lean = +b.dataset.v;
    if (b.dataset.nod) k.headNod = +b.dataset.nod;
    commit(); renderAllLight();
  },
  setSmile: b => {
    const L = getSelLayer();
    if (!L) return;
    stopPlay();
    const k = ensureKey(L, state.frame);
    k.smileR = +b.dataset.r; k.smileL = +b.dataset.l;
    commit(); renderAllLight();
  },
  nodYes: () => {
    const L = getSelLayer();
    if (!L || L.type !== 'image') return;
    stopPlay();
    const f0 = state.frame, base = keyStateAt(L, f0).headNod || 0, step = Math.max(2, Math.round(project.fps / 6));
    [0, 14, 0, 11, 0].forEach((d, i) => {
      const f = f0 + i * step;
      if (f <= project.frames - 1) ensureKey(L, f).headNod = base + d;
    });
    commit(); renderAllLight();
    toast('Added a double nod');
  },
  headStraight: () => {
    const L = getSelLayer();
    if (!L) return;
    const k = ensureKey(L, state.frame);
    k.headTilt = 0; k.headNod = 0;
    commit(); renderAllLight();
  },
  setFx: b => {
    const L = getSelLayer(), p = FX_PRESETS[b.dataset.fx];
    if (!L || !p) return;
    stopPlay();
    const key = ensureKey(L, state.frame);
    Object.assign(key, FX_DEFAULT);
    for (const k of FX_KEYS) if (k in p) key[k] = p[k];
    // Ghost also makes the character see-through and its glow pale blue; other effects undo that.
    if (p.ghost) { key.opacity = 0.6; L.fx = { ...(L.fx || {}), glowColor: '#cfe8ff' }; }
    else {
      if (key.opacity === 0.6) key.opacity = 1;
      if (L.fx && L.fx.glowColor === '#cfe8ff') L.fx.glowColor = '#ffe27a';
    }
    commit(); renderAllLight();
  },
  toggleCamView: () => { state.camView = !state.camView; updateTransport(); drawStage(); },
  selectCamera,
  camInto: b => { const k = camKeys().find(k => k.f === state.frame); if (!k) return; k.into = b.dataset.into; commit(); renderAllLight(); },
  camShot: b => {
    stopPlay();
    const c = camShot(b.dataset.shot, b.dataset.id && getLayer(b.dataset.id));
    Object.assign(ensureCamKey(state.frame), c);
    if (!state.camView) { state.camView = true; updateTransport(); }
    commit(); renderAllLight();
  },
  camClear: () => { project.camera.keys = []; commit(); renderAllLight(); toast('Camera back to showing the whole picture'); },
  flipLimb: b => flipLimb(getSelLayer(), b.dataset.limb),
  addBody: () => { const L = getSelLayer(); if (!L) return; L.body = defaultBody(L); commit(); renderAllLight(); },
  setPose: b => {
    const L = getSelLayer(), pose = POSES[b.dataset.pose];
    if (!L || !L.body || !pose) return;
    stopPlay();
    const key = ensureKey(L, state.frame);
    for (const p of POSE_KEYS) if (p in pose) key[p] = pose[p];
    for (const p of ['armLFront', 'armRFront']) key[p] = !!pose[p];
    // Some poses put a hand at a spot (measured from the neck) and work out the arm.
    for (const [limb, [tx, ty]] of Object.entries(pose.ik || {})) {
      const s = stateAt(L, state.frame), rig = rigOf(L, s), lm = rig[limb];
      const [a1, rel] = solveIK(lm, [rig.N[0] + tx * rig.k, rig.N[1] + ty * rig.k], pose.ikMode || 'low');
      key[lm.keys[0]] = Math.round(a1); key[lm.keys[1]] = Math.round(rel);
    }
    commit(); renderAllLight();
  },
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
    T.fx = { ...vfx(T), semis: p.semis, keep: p.keep };
    refreshFx(T);
  },
  soundPreset: b => {
    const T = getSelTrack(), p = SOUND_PRESETS[b.dataset.preset];
    if (!T || !p) return;
    const f = vfx(T);
    for (const k of SOUND_FIELDS) f[k] = k in p ? p[k] : VOICE_FX_DEFAULT[k];
    T.fx = f;
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
    case '[': jumpWord(-1); break;
    case ']': jumpWord(1); break;
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
    project = migrate(blankProject());
    resetHistory();
    renderAll();
  }
  await checkServer();
  // current/project.json is the shared copy (the same whichever way the editor was opened), so it wins.
  let fromFile = false;
  if (state.server && state.server.current) {
    try {
      const j = await pullCurrent();
      if (j) { await loadData({ project: j.project, assets }); sync.hash = j.hash; fromFile = true; }
      else pushCurrent();
    } catch (err) { toast('Couldn\'t open current/project.json: ' + err.message); }
  }
  const resumed = restoreUI();   // after a page reload, pick up exactly where you were
  if (resumed) { /* quietly carry on */ }
  else if (fromFile) toast('Opened your cartoon from current/project.json');
  else if (restored) toast('Welcome back! Your last cartoon was restored.');
  loadCharacterList();
})();

// "Go to word" box in the transport bar.
$('#wordFind').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); findWord(e.target.value); }
  if (e.key === 'Escape') e.target.blur();
});
