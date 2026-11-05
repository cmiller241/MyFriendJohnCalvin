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

async function serveStatic(pathname, res) {
  let rel = decodeURIComponent(pathname);
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
      return sendJson(res, 200, { rhubarb: !!exe, version: exe ? rhubarbVersion(exe) : '' });
    }
    if (url.pathname === '/api/rhubarb' && req.method === 'POST') return await handleRhubarb(req, res);
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
  console.log('\n  Keep this window open while you work. Close it to stop the editor.\n');
});
