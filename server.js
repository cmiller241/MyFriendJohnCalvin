#!/usr/bin/env node
'use strict';
/*
 * Cartoon Studio local server.
 * Serves the editor at http://localhost:5173 and runs Rhubarb Lip Sync for it.
 * Only listens on this computer (127.0.0.1). No packages to install.
 */
const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const { spawn, spawnSync } = require('child_process');

const PORT = Number(process.env.PORT) || 5173;
const ROOT = __dirname;
const MAX_BODY = 300 * 1024 * 1024;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.json': 'application/json; charset=utf-8', '.ico': 'image/x-icon', '.md': 'text/plain; charset=utf-8',
};

// Looks for Rhubarb in: RHUBARB_PATH, ./rhubarb/, ./rhubarb/<any folder>/, then the system PATH.
function findRhubarb() {
  const exe = process.platform === 'win32' ? 'rhubarb.exe' : 'rhubarb';
  const dir = path.join(ROOT, 'rhubarb');
  const candidates = [process.env.RHUBARB_PATH, path.join(dir, exe)];
  try {
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      if (d.isDirectory()) candidates.push(path.join(dir, d.name, exe));
    }
  } catch { /* no rhubarb folder */ }
  for (const c of candidates) if (c && fs.existsSync(c)) return c;
  try {
    if (spawnSync('rhubarb', ['--version'], { timeout: 10000 }).status === 0) return 'rhubarb';
  } catch { /* not on PATH */ }
  return null;
}

function rhubarbVersion(exe) {
  try { return (spawnSync(exe, ['--version'], { encoding: 'utf8', timeout: 10000 }).stdout || '').trim(); } catch { return ''; }
}

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('Audio is too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function run(exe, args, timeoutMs) {
  return new Promise(resolve => {
    const opts = path.isAbsolute(exe) ? { cwd: path.dirname(exe) } : {};
    const p = spawn(exe, args, { ...opts, windowsHide: true });
    let stderr = '';
    p.stderr.on('data', d => { stderr += d; });
    p.stdout.on('data', () => {});
    const timer = setTimeout(() => p.kill(), timeoutMs);
    p.on('error', err => { clearTimeout(timer); resolve({ code: -1, stderr: err.message }); });
    p.on('close', code => { clearTimeout(timer); resolve({ code, stderr }); });
  });
}

async function handleRhubarb(req, res) {
  const exe = findRhubarb();
  if (!exe) return sendJson(res, 503, { error: 'Rhubarb was not found. Unzip it into the "rhubarb" folder next to server.js.' });
  const body = JSON.parse((await readBody(req)).toString('utf8'));
  if (!body.wav) return sendJson(res, 400, { error: 'No audio was sent.' });

  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'cartoon-rhubarb-'));
  try {
    const wav = path.join(dir, 'voice.wav');
    const out = path.join(dir, 'mouth.json');
    await fsp.writeFile(wav, Buffer.from(body.wav, 'base64'));
    const args = ['-f', 'json', '-o', out, '--extendedShapes', 'GHX',
      '-r', body.recognizer === 'phonetic' ? 'phonetic' : 'pocketSphinx'];
    if (body.dialog && String(body.dialog).trim()) {
      const dialog = path.join(dir, 'dialog.txt');
      await fsp.writeFile(dialog, String(body.dialog), 'utf8');
      args.push('-d', dialog);
    }
    args.push(wav);
    console.log('Running Rhubarb…');
    const { code, stderr } = await run(exe, args, 15 * 60 * 1000);
    if (code !== 0) {
      const msg = stderr.split(/\r?\n/).filter(Boolean).slice(-3).join(' ');
      return sendJson(res, 500, { error: 'Rhubarb failed: ' + (msg || 'exit code ' + code) });
    }
    const result = JSON.parse(await fsp.readFile(out, 'utf8'));
    console.log(`Rhubarb finished: ${(result.mouthCues || []).length} mouth shapes`);
    sendJson(res, 200, result);
  } finally {
    fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/* ---- Whisper (speech to text, for captions) ----
   Looks in ./whisper/ (up to three folders deep) for whisper-cli.exe and a ggml-*.bin model. */
function findFiles(dir, test, depth = 3, out = []) {
  let items = [];
  try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const d of items) {
    const p = path.join(dir, d.name);
    if (d.isDirectory() && depth > 0) findFiles(p, test, depth - 1, out);
    else if (d.isFile() && test(d.name)) out.push(p);
  }
  return out;
}
function findWhisper() {
  const dir = path.join(ROOT, 'whisper');
  const exe = findFiles(dir, n => /^whisper-cli(\.exe)?$/i.test(n))[0] || null;
  // Prefer the more accurate models when several are present.
  const rank = n => /large/.test(n) ? 4 : /medium/.test(n) ? 3 : /small/.test(n) ? 2 : /base/.test(n) ? 1 : 0;
  const model = findFiles(dir, n => /^ggml-.*\.bin$/i.test(n)).sort((a, b) => rank(path.basename(b)) - rank(path.basename(a)))[0] || null;
  return exe && model ? { exe, model } : null;
}

async function handleWhisper(req, res) {
  const w = findWhisper();
  if (!w) return sendJson(res, 503, { error: 'Whisper was not found. Put whisper-cli.exe and a ggml model file in the "whisper" folder.' });
  const body = JSON.parse((await readBody(req)).toString('utf8'));
  if (!body.wav) return sendJson(res, 400, { error: 'No audio was sent.' });
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'cartoon-whisper-'));
  try {
    const wav = path.join(dir, 'voice.wav'), outBase = path.join(dir, 'words');
    await fsp.writeFile(wav, Buffer.from(body.wav, 'base64'));
    // One word per segment (-ml 1, split on words) gives each word its own start and end time.
    const args = ['-m', w.model, '-f', wav, '-l', 'en', '-ml', '1', '-sow', '-oj', '-of', outBase, '-np'];
    if (body.prompt && String(body.prompt).trim()) args.push('--prompt', String(body.prompt).slice(0, 500));
    console.log('Running Whisper…');
    const { code, stderr } = await run(w.exe, args, 15 * 60 * 1000);
    if (code !== 0) return sendJson(res, 500, { error: 'Whisper failed: ' + (stderr.split(/\r?\n/).filter(Boolean).slice(-3).join(' ') || 'exit code ' + code) });
    const j = JSON.parse(await fsp.readFile(outBase + '.json', 'utf8'));
    const words = (j.transcription || [])
      .map(t => ({ start: t.offsets.from / 1000, end: t.offsets.to / 1000, text: String(t.text || '').trim() }))
      .filter(t => t.text && !/^\[.*\]$|^\(.*\)$/.test(t.text));   // drop blanks and notes like [MUSIC]
    console.log(`Whisper finished: ${words.length} words`);
    sendJson(res, 200, { words, model: path.basename(w.model) });
  } finally {
    fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/* ---- current/: the cartoon open in the editor, kept as readable files ----
   current/project.json   the project (keyframes, layers, tracks…), pretty-printed
   current/assets.json    which picture / sound file belongs to which asset id
   current/assets/<id>.*  the pictures and sounds themselves */
// (CARTOON_CURRENT_DIR lets a test copy of the server use a different folder.)
const CUR = process.env.CARTOON_CURRENT_DIR || path.join(ROOT, 'current'), CUR_ASSETS = path.join(CUR, 'assets');
const sha1 = buf => require('crypto').createHash('sha1').update(buf).digest('hex');
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg',
  'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a',
  'audio/ogg': 'ogg', 'audio/webm': 'webm', 'video/webm': 'webm', 'audio/aac': 'aac', 'audio/flac': 'flac' };
async function readJson(file, fallback) { try { return JSON.parse(await fsp.readFile(file, 'utf8')); } catch { return fallback; } }
async function writeAtomic(file, data) { const tmp = file + '.tmp'; await fsp.writeFile(tmp, data); await fsp.rename(tmp, file); }

async function handleCurrent(req, res, url) {
  await fsp.mkdir(CUR_ASSETS, { recursive: true });
  const projFile = path.join(CUR, 'project.json'), manFile = path.join(CUR, 'assets.json');
  if (url.pathname === '/api/current/meta') {
    let hash = null;
    try { hash = sha1(await fsp.readFile(projFile)); } catch { /* no file yet */ }
    return sendJson(res, 200, { hash });
  }
  if (url.pathname === '/api/current' && req.method === 'GET') {
    let text;
    try { text = await fsp.readFile(projFile); } catch { return sendJson(res, 200, { exists: false }); }
    let data;
    try { data = JSON.parse(text.toString('utf8')); } catch (e) { return sendJson(res, 422, { error: 'current/project.json is not valid JSON: ' + e.message }); }
    return sendJson(res, 200, { exists: true, hash: sha1(text), project: data.project || data, assets: await readJson(manFile, {}) });
  }
  const body = JSON.parse((await readBody(req)).toString('utf8'));
  if (url.pathname === '/api/current' && req.method === 'POST') {
    // Nothing changed? Leave the file alone (rewriting it would make things like Live Server reload).
    try {
      const old = await fsp.readFile(projFile);
      const oldDoc = JSON.parse(old.toString('utf8'));
      if (JSON.stringify(oldDoc.project) === JSON.stringify(body.project)) return sendJson(res, 200, { hash: sha1(old), unchanged: true });
    } catch { /* no file yet, or unreadable: write it */ }
    const text = JSON.stringify({ app: 'CartoonStudio', version: 1, savedAt: new Date().toISOString(), project: body.project }, null, 2);
    await writeAtomic(projFile, text);
    return sendJson(res, 200, { hash: sha1(Buffer.from(text)) });
  }
  if (url.pathname === '/api/current/asset' && req.method === 'POST') {
    const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(body.data || '');
    if (!m || !/^[\w-]+$/.test(body.id || '')) return sendJson(res, 400, { error: 'Bad asset' });
    const ext = EXT[(m[1] || '').toLowerCase()] || 'bin', file = `${body.id}.${ext}`;
    await fsp.writeFile(path.join(CUR_ASSETS, file), m[2] ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3])));
    const man = await readJson(manFile, {});
    man[body.id] = { type: body.type, name: body.name, file };
    await writeAtomic(manFile, JSON.stringify(man, null, 2));
    return sendJson(res, 200, { file });
  }
  return sendJson(res, 404, { error: 'Not found' });
}

// Character joints from tools/rig-editor.html, saved as assets/rigs/<name>.rig.json.
async function handleRig(req, res) {
  const body = JSON.parse((await readBody(req)).toString('utf8'));
  const name = String(body.name || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!name || !body.rig || typeof body.rig !== 'object') return sendJson(res, 400, { error: 'Bad rig' });
  const dir = path.join(ROOT, 'assets', 'rigs');
  await fsp.mkdir(dir, { recursive: true });
  await writeAtomic(path.join(dir, name + '.rig.json'), JSON.stringify(body.rig, null, 2));
  return sendJson(res, 200, { file: `assets/rigs/${name}.rig.json` });
}

// Extra files for a character (e.g. normal maps), saved as assets/rigs/<name>-<kind>/<file>.
async function handleRigFile(req, res) {
  const body = JSON.parse((await readBody(req)).toString('utf8'));
  const clean = v => String(v || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  const name = clean(body.name), kind = clean(body.kind), file = String(body.file || '');
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(body.data || '');
  if (!name || !kind || !/^[\w-]+\.(png|json)$/.test(file) || !m) return sendJson(res, 400, { error: 'Bad file' });
  const dir = path.join(ROOT, 'assets', 'rigs', `${name}-${kind}`);
  await fsp.mkdir(dir, { recursive: true });
  await writeAtomic(path.join(dir, file), m[2] ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3])));
  return sendJson(res, 200, { file: `assets/rigs/${name}-${kind}/${file}` });
}

async function serveStatic(pathname, res) {
  let rel = decodeURIComponent(pathname);
  if (rel.startsWith('/current/assets/') && process.env.CARTOON_CURRENT_DIR) {
    const f = path.join(CUR_ASSETS, path.basename(rel));
    try { res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); return fs.createReadStream(f).pipe(res); } catch { res.writeHead(404); return res.end(); }
  }
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
  try {
    const st = await fsp.stat(file);
    if (!st.isFile()) throw new Error('not a file');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    // Let the editor call us when it's opened another way (e.g. VS Code Live Server
    // or the file itself). Only pages on this computer are allowed.
    const origin = req.headers.origin;
    if (origin && (origin === 'null' || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    }
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    if (url.pathname === '/api/status') {
      const exe = findRhubarb();
      const w = findWhisper();
      return sendJson(res, 200, { rhubarb: !!exe, version: exe ? rhubarbVersion(exe) : '', whisper: !!w, whisperModel: w ? path.basename(w.model) : '', current: true });
    }
    if (url.pathname === '/api/rhubarb' && req.method === 'POST') return await handleRhubarb(req, res);
    if (url.pathname === '/api/whisper' && req.method === 'POST') return await handleWhisper(req, res);
    if (url.pathname === '/api/rig' && req.method === 'POST') return await handleRig(req, res);
    if (url.pathname === '/api/rig-file' && req.method === 'POST') return await handleRigFile(req, res);
    if (url.pathname === '/api/current' || url.pathname.startsWith('/api/current/')) return await handleCurrent(req, res, url);
    return await serveStatic(url.pathname, res);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) sendJson(res, 500, { error: err.message });
  }
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') console.log(`Port ${PORT} is busy. Cartoon Studio may already be running: open http://localhost:${PORT}`);
  else console.error(err);
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => {
  const exe = findRhubarb();
  console.log(`\n  Cartoon Studio is running at  http://localhost:${PORT}\n`);
  console.log(exe ? `  Rhubarb lip sync: ready (${exe})` : '  Rhubarb lip sync: not found. Unzip Rhubarb into the "rhubarb" folder to enable it.');
  const w = findWhisper();
  console.log(w ? `  Whisper captions: ready (${path.basename(w.model)})` : '  Whisper captions: not found. Put whisper-cli.exe and a model in the "whisper" folder to enable it.');
  console.log('\n  Keep this window open while you work. Close it to stop the editor.\n');
});
