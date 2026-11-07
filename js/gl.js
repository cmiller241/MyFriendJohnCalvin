'use strict';
/*
 * Graphics-card (WebGL 2) effects.
 *  - layerFx: colour changes, blur and glow for one character, drawn from its own picture.
 *  - film:    an old-film look over the whole frame (grain, flicker, scratches, sepia, vignette).
 * If WebGL 2 isn't available, available() is false and the editor uses its slower built-in filters.
 *
 * Pictures are uploaded upside-down (WebGL counts rows from the bottom), so they come out the
 * right way up. Every working picture lives in a texture at least as big as needed; `scale`
 * says how much of it is used.
 */
const GFX = (() => {
  let gl = null, cv = null, tried = false;
  const progs = {}, targets = {};
  let upload = null, quad = null;

  const VS = `#version 300 es
in vec2 p; out vec2 uv;
void main() { uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;
  const HEAD = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D t; uniform vec2 inScale;
vec4 src(vec2 q) { return texture(t, q * inScale); }
`;
  const FS = {
    // Copy the used corner of an uploaded canvas (sub = used fraction; rows are flipped).
    copy: HEAD + `uniform vec2 sub;
void main() { o = texture(t, vec2(uv.x * sub.x, 1.0 - (1.0 - uv.y) * sub.y)); }`,
    pass: HEAD + `void main() { o = src(uv); }`,
    // One direction of a Gaussian blur (run twice: across, then down).
    blur: HEAD + `uniform vec2 dir; uniform float sigma;
void main() {
  if (sigma < 0.3) { o = src(uv); return; }
  int r = min(int(ceil(sigma * 2.5)), 40);
  vec4 acc = vec4(0.0); float ws = 0.0;
  for (int i = -40; i <= 40; i++) {
    if (i < -r || i > r) continue;
    float w = exp(-0.5 * float(i * i) / (sigma * sigma));
    acc += src(uv + dir * float(i)) * w; ws += w;
  }
  o = acc / ws;
}`,
    // Colour changes (the same maths as the browser's CSS filters, in the same order), then glow behind.
    final: HEAD + `uniform sampler2D h1; uniform sampler2D h2; uniform vec2 hScale;
uniform int glow; uniform vec3 gcol; uniform float g1, g2;
uniform float gray, sep, bri, con, sat, hue, inv;
vec3 rows(vec3 c, vec3 r0, vec3 r1, vec3 r2) { return vec3(dot(c, r0), dot(c, r1), dot(c, r2)); }
vec3 adjust(vec3 c) {
  float s = 1.0 - gray;
  c = rows(c, vec3(0.2126 + 0.7874 * s, 0.7152 - 0.7152 * s, 0.0722 - 0.0722 * s),
              vec3(0.2126 - 0.2126 * s, 0.7152 + 0.2848 * s, 0.0722 - 0.0722 * s),
              vec3(0.2126 - 0.2126 * s, 0.7152 - 0.7152 * s, 0.0722 + 0.9278 * s));
  s = 1.0 - sep;
  c = rows(c, vec3(0.393 + 0.607 * s, 0.769 - 0.769 * s, 0.189 - 0.189 * s),
              vec3(0.349 - 0.349 * s, 0.686 + 0.314 * s, 0.168 - 0.168 * s),
              vec3(0.272 - 0.272 * s, 0.534 - 0.534 * s, 0.131 + 0.869 * s));
  c *= bri;
  c = (c - 0.5) * con + 0.5;
  s = sat;
  c = rows(c, vec3(0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s),
              vec3(0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s),
              vec3(0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s));
  float a = radians(hue), cs = cos(a), sn = sin(a);
  c = rows(c, vec3(0.213 + cs * 0.787 - sn * 0.213, 0.715 - cs * 0.715 - sn * 0.715, 0.072 - cs * 0.072 + sn * 0.928),
              vec3(0.213 - cs * 0.213 + sn * 0.143, 0.715 + cs * 0.285 + sn * 0.140, 0.072 - cs * 0.072 - sn * 0.283),
              vec3(0.213 - cs * 0.213 - sn * 0.787, 0.715 - cs * 0.715 + sn * 0.715, 0.072 + cs * 0.928 + sn * 0.072));
  c = mix(c, 1.0 - c, inv);
  return clamp(c, 0.0, 1.0);
}
void main() {
  vec4 s = src(uv);
  vec3 c = s.a > 0.0 ? s.rgb / s.a : vec3(0.0);
  vec4 col = vec4(adjust(c) * s.a, s.a);
  if (glow == 1) {
    float a1 = texture(h1, uv * hScale).a * g1, a2 = texture(h2, uv * hScale).a * g2;
    float ha = clamp(1.0 - (1.0 - a1) * (1.0 - a2), 0.0, 1.0);
    col += vec4(gcol * ha, ha) * (1.0 - col.a);
  }
  o = col;
}`,
    // Old film: sepia, flicker, grain, scratches and a darker edge.
    film: HEAD + `uniform float time, grain, vig, flick, scratch, sepiaAmt; uniform vec2 res;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec3 c = src(uv).rgb;
  vec3 sp = vec3(dot(c, vec3(0.393, 0.769, 0.189)), dot(c, vec3(0.349, 0.686, 0.168)), dot(c, vec3(0.272, 0.534, 0.131)));
  c = mix(c, sp, sepiaAmt);
  c *= 1.0 + flick * (hash(vec2(time, 1.7)) - 0.5) * 0.22;
  c += grain * (hash(floor(uv * res / 2.0) + time * 13.1) - 0.5) * 0.22;
  for (int i = 0; i < 3; i++) {
    float x = hash(vec2(time, float(i) * 7.3));
    float on = step(0.6, hash(vec2(float(i) + 0.5, time * 3.1)));
    float d = abs(uv.x - x) * res.x;
    c = mix(c, vec3(0.88, 0.85, 0.8), scratch * on * (1.0 - smoothstep(0.0, 1.6, d)) * 0.7);
  }
  vec2 d = (uv - 0.5) * vec2(1.0, res.y / res.x);
  c *= 1.0 - vig * smoothstep(0.3, 0.95, length(d) * 1.35);
  o = vec4(clamp(c, 0.0, 1.0), 1.0);
}`,
  };

  function compile(type, srcText) {
    const s = gl.createShader(type);
    gl.shaderSource(s, srcText); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function init() {
    if (tried) return !!gl;
    tried = true;
    try {
      cv = document.createElement('canvas');
      cv.width = 16; cv.height = 16;
      gl = cv.getContext('webgl2', { premultipliedAlpha: true, alpha: true, preserveDrawingBuffer: true, antialias: false });
      if (!gl) return false;
      const vs = compile(gl.VERTEX_SHADER, VS);
      for (const [name, fs] of Object.entries(FS)) {
        const p = gl.createProgram();
        gl.attachShader(p, vs); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
        gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
        progs[name] = { p, u: {} };
      }
      quad = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);  // one triangle covering the screen
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      upload = newTex();
      gl.disable(gl.BLEND);
      return true;
    } catch (err) {
      console.warn('WebGL effects unavailable, using built-in filters instead:', err);
      gl = null;
      return false;
    }
  }
  function newTex() {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  // A working picture of at least w × h (sizes rounded up so they don't change every frame).
  function target(name, w, h) {
    const tw = Math.ceil(w / 64) * 64, th = Math.ceil(h / 64) * 64;
    let T = targets[name];
    if (!T) { T = targets[name] = { tex: newTex(), fb: gl.createFramebuffer(), tw: 0, th: 0 }; }
    if (T.tw !== tw || T.th !== th) {
      gl.bindTexture(gl.TEXTURE_2D, T.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, tw, th, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, T.fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, T.tex, 0);
      T.tw = tw; T.th = th;
    }
    T.w = w; T.h = h;
    T.scale = [w / tw, h / th];
    return T;
  }
  function ensureCanvas(w, h) {
    if (cv.width < w || cv.height < h) { cv.width = Math.max(cv.width, w); cv.height = Math.max(cv.height, h); }
  }
  // Run a program into a target (or the visible canvas when out is null).
  function run(name, out, w, h, inputs, uni) {
    const P = progs[name];
    gl.useProgram(P.p);
    if (out) {
      // Clear the whole working picture first, so nothing from an earlier frame bleeds in at the edges.
      gl.bindFramebuffer(gl.FRAMEBUFFER, out.fb);
      gl.viewport(0, 0, out.tw, out.th); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.viewport(0, 0, w, h);
    }
    else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, w, h); }
    let unit = 0;
    for (const [uname, tex] of Object.entries(inputs)) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(loc(P, uname), unit++);
    }
    for (const [uname, v] of Object.entries(uni)) {
      const l = loc(P, uname);
      if (l === null) continue;
      if (Array.isArray(v)) [null, null, gl.uniform2fv, gl.uniform3fv, gl.uniform4fv][v.length].call(gl, l, v);
      else if (Number.isInteger(v) && (uname === 'glow' || uname === 'n')) gl.uniform1i(l, v);
      else gl.uniform1f(l, v);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function loc(P, n) { if (!(n in P.u)) P.u[n] = gl.getUniformLocation(P.p, n); return P.u[n]; }
  function uploadCanvas(c) {
    gl.bindTexture(gl.TEXTURE_2D, upload);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    return upload;
  }
  function blur2(srcT, sigma, outName) {
    const tmp = target(outName + 'Tmp', srcT.w, srcT.h), out = target(outName, srcT.w, srcT.h);
    run('blur', tmp, srcT.w, srcT.h, { t: srcT.tex }, { inScale: srcT.scale, dir: [1 / srcT.tw, 0], sigma });
    run('blur', out, srcT.w, srcT.h, { t: tmp.tex }, { inScale: tmp.scale, dir: [0, 1 / tmp.th], sigma });
    return out;
  }
  function shrink(srcT, q, name) {
    const out = target(name, Math.max(1, Math.ceil(srcT.w * q)), Math.max(1, Math.ceil(srcT.h * q)));
    run('pass', out, out.w, out.h, { t: srcT.tex }, { inScale: srcT.scale });
    return out;
  }
  const hex = c => { const h = parseInt(String(c || '#ffe27a').slice(1), 16); return [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255]; };

  /* p: { gray, sepia, bright, contrast, sat, hue, invert, blur, glow, glowSize, glowColor } */
  function layerFx(sheet, bw, bh, p) {
    if (!init()) return null;
    ensureCanvas(bw, bh);
    const up = uploadCanvas(sheet);
    const base = target('base', bw, bh);
    run('copy', base, bw, bh, { t: up }, { inScale: [1, 1], sub: [bw / sheet.width, bh / sheet.height] });
    // Blur the character itself at a smaller size (a blurry picture doesn't need every pixel).
    let ch = base;
    if (p.blur > 0.05) { const q = Math.min(1, 8 / p.blur); ch = blur2(q < 1 ? shrink(base, q, 'bSmall') : base, p.blur * q, 'bOut'); }
    // Glow: the character's shape, blurred into a wide halo and a tight halo, at a small size.
    let h1 = base, h2 = base, glow = 0;
    if (p.glow > 0.001) {
      const r = p.glowSize || 40, q = Math.min(0.25, 12 / r), small = shrink(base, q, 'gSmall');
      h1 = blur2(small, Math.max(0.5, r * q), 'h1');
      h2 = blur2(small, Math.max(0.5, r * 0.35 * q), 'h2');
      glow = 1;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, bw, bh); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    run('final', null, bw, bh, { t: ch.tex, h1: h1.tex, h2: h2.tex }, {
      inScale: ch.scale, hScale: h1.scale, glow, gcol: hex(p.glowColor),
      g1: Math.min(1, p.glow * 0.9), g2: Math.min(1, p.glow * 1.1),
      gray: p.gray, sep: p.sepia, bri: p.bright, con: p.contrast, sat: p.sat, hue: p.hue, inv: p.invert,
    });
    return { canvas: cv, sx: 0, sy: cv.height - bh, w: bw, h: bh };
  }

  /* p: { grain, vignette, flicker, scratches, sepia }, frame: frame number (changes the grain) */
  function film(src, w, h, p, frame) {
    if (!init()) return null;
    ensureCanvas(w, h);
    const up = uploadCanvas(src);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    run('film', null, w, h, { t: up }, {
      inScale: [w / src.width, h / src.height], res: [w, h], time: (frame % 997) * 0.618,
      grain: p.grain || 0, vig: p.vignette || 0, flick: p.flicker || 0, scratch: p.scratches || 0, sepiaAmt: p.sepia || 0,
    });
    return { canvas: cv, sx: 0, sy: cv.height - h, w, h };
  }

  /* ---- the head: painting + eyes + mouth combined, with the beard bent, in one pass ---- */
  // Pictures are copied to the graphics card once and kept there.
  const texCache = new WeakMap();
  function texFor(img) {
    let t = texCache.get(img);
    if (t) return t;
    t = newTex();
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    texCache.set(img, t);
    return t;
  }
  const HEAD_FS = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D t0, t1, t2;
uniform vec4 r0, r1, r2;          // where each picture sits: x, y, width, height (picture pixels, y down)
uniform int n;                    // how many pictures
uniform vec2 size;                // output size in pixels
uniform float pad, y0, ih, sway;  // room at the sides, where the beard starts, picture height, sway (px)
uniform vec4 l0, l1, l2, l3;      // soft lifts (smile): x, y, radius, how far up (px)
uniform vec4 bp0, bp1;            // eyebrow lifts: x, y, half width, half height (px)…
uniform vec2 bl;                  // …and how far each one moves up (px)
// Everything near a lift point moves up, most at the point, fading smoothly to nothing.
vec2 lift(vec2 P, vec4 l) { if (l.w == 0.0) return vec2(0.0); vec2 d = (P - l.xy) / vec2(l.z, l.z * 2.6); return vec2(0.0, l.w * exp(-dot(d, d) * 1.5)); }
// A wide, short lift for an eyebrow, so the eye below barely moves.
vec2 brow(vec2 P, vec4 b, float up) { if (up == 0.0) return vec2(0.0); vec2 d = (P - b.xy) / b.zw; return vec2(0.0, up * exp(-dot(d, d) * 1.5)); }
vec4 part(sampler2D t, vec4 r, vec2 p) {
  vec2 q = (p - r.xy) / r.zw;
  if (q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0) return vec4(0.0);
  return texture(t, vec2(q.x, 1.0 - q.y));
}
void main() {
  vec2 P = vec2(uv.x * size.x - pad, (1.0 - uv.y) * size.y);   // picture pixels, y down
  // Smile: a positive lift looks a little further down, so the picture there appears lifted.
  P += lift(P, l0) + lift(P, l1) + lift(P, l2) + lift(P, l3) + brow(P, bp0, bl.x) + brow(P, bp1, bl.y);
  // Below where the beard starts, everything slides sideways, more and more toward the tip.
  float t = clamp((P.y - y0) / max(1.0, ih - y0), 0.0, 1.0);
  P.x -= sway * pow(t, 1.6);
  vec4 c = part(t0, r0, P);
  if (n > 1) { vec4 e = part(t1, r1, P); c = e + c * (1.0 - e.a); }
  if (n > 2) { vec4 m = part(t2, r2, P); c = m + c * (1.0 - m.a); }
  o = c;
}`;
  // parts: up to 3 of { img, x, y, w, h } in picture pixels (bottom picture first).
  function headWarp(parts, iw, ih, y0, sway, pad, lifts = [], brows = []) {
    if (!init() || !parts.length) return null;
    if (!progs.head) {
      const p = gl.createProgram();
      gl.attachShader(p, compile(gl.VERTEX_SHADER, VS)); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, HEAD_FS));
      gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      progs.head = { p, u: {} };
    }
    const w = iw + pad * 2, h = ih;
    ensureCanvas(w, h);
    const inputs = {}, uni = { n: parts.length, size: [w, h], pad, y0, ih, sway };
    for (let i = 0; i < 4; i++) uni['l' + i] = lifts[i] || [0, 0, 1, 0];
    // brows: up to two of [x, y, half width, half height, lift]
    for (let i = 0; i < 2; i++) uni['bp' + i] = brows[i] ? brows[i].slice(0, 4) : [0, 0, 1, 1];
    uni.bl = [brows[0] ? brows[0][4] : 0, brows[1] ? brows[1][4] : 0];
    parts.forEach((pt, i) => { inputs['t' + i] = texFor(pt.img); uni['r' + i] = [pt.x, pt.y, pt.w, pt.h]; });
    for (let i = parts.length; i < 3; i++) { inputs['t' + i] = inputs.t0; uni['r' + i] = [0, 0, 1, 1]; }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    run('head', null, w, h, inputs, uni);
    return { canvas: cv, sx: 0, sy: cv.height - h, w, h };
  }

  /* ---- fur: fine hair strands grown inside a shape ----
     mask: where the fur grows (its alpha). flow: which way the hair lies at each spot, stored as a
     direction in the red/green colours (0.5 = none). The hair roots must be inside the mask, so
     strands near the edge stick out past it, giving a fluffy outline. */
  const FUR_FS = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D mask, flow, thick;   // thick: the mask blurred, i.e. how deep inside the fur a spot is
uniform vec2 res;          // size in pixels
uniform vec3 col;          // fur colour
uniform float hairLen, seed, grain;
vec4 at(sampler2D t, vec2 p) { return texture(t, vec2(p.x / res.x, 1.0 - p.y / res.y)); }
float h1(float n) { return fract(sin(n * 127.1 + seed * 13.7) * 43758.5453); }
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + seed * 7.3) * 43758.5453); }
// Smooth noise: random values that blend into each other, so tufts have no hard edges.
float vn(float x) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h1(i), h1(i + 1.0), f); }
void main() {
  vec2 P = vec2(uv.x * res.x, (1.0 - uv.y) * res.y);   // pixels, y down
  vec2 f = at(flow, P).rg * 2.0 - 1.0;
  if (length(f) < 0.2) f = vec2(0.0, 1.0);
  f = normalize(f);
  if (f.y < 0.0) f = -f;                              // hair falls downward along the band
  vec2 d0 = normalize(f + vec2(0.0, 0.6));
  // Depth into the fur: 0 outside, about 0.5 at the edge, 1 deep inside. Near the edges the hair
  // fans outward, away from the middle, so it sticks out past the edge.
  float th = at(thick, P).a;
  vec2 e = vec2(3.0, 0.0);
  vec2 grad = vec2(at(thick, P + e.xy).a - at(thick, P - e.xy).a, at(thick, P + e.yx).a - at(thick, P - e.yx).a);
  float edgeW = 1.0 - smoothstep(0.25, 0.75, th);
  if (length(grad) > 1e-4) d0 = normalize(d0 - normalize(grad) * edgeW * 1.1);
  // Rounded look: lighter along the middle of the fur, darker toward its edges.
  float shade = mix(0.55, 1.08, smoothstep(0.3, 1.0, th));
  // The undercoat: a darker base so there are never gaps between strands.
  float base = smoothstep(0.38, 0.7, th);
  vec3 c = col * 0.4 * shade;
  float A = base;
  // Three layers of strands, grouped into tufts that each lean a little differently.
  for (int L = 0; L < 3; L++) {
    float fl = float(L);
    float sp = grain * (3.4 - fl * 0.8);              // gap between strands (px)
    vec2 n0 = vec2(-d0.y, d0.x);
    float tx = dot(P, n0) / (sp * 7.0) + fl * 0.37;
    float tr = vn(tx + fl * 53.0 + 500.0);
    float ang = (vn(tx * 1.3 + fl * 21.0 + 900.0) - 0.5) * 0.6;
    vec2 d = vec2(d0.x * cos(ang) - d0.y * sin(ang), d0.x * sin(ang) + d0.y * cos(ang)), n = vec2(-d.y, d.x);
    float len = hairLen * (1.0 - fl * 0.2) * (0.75 + 0.5 * tr);
    float r = h1(floor(dot(P, n) / sp) + fl * 91.0);
    float along = dot(P, d) / len + r * 3.0;
    float t = fract(along), seg = floor(along);       // t: 0 at the root, 1 at the tip
    float idx = floor(dot(P, n) / sp);
    float r2 = h2(vec2(idx, seg + fl * 17.0));
    float across = fract(dot(P, n) / sp + 0.3 * sin(t * 3.0 + r * 6.28));   // a little wavy
    vec2 root = P - d * (t * len);
    float m = at(mask, root).a;                       // strands only grow from inside the shape
    float w = (0.48 - 0.33 * t) * (0.6 + 0.4 * r2);   // tapers toward the tip
    float strand = smoothstep(w, w * 0.35, abs(across - 0.5)) * m * step(0.12, r2) * (1.0 - t * t * 0.5);
    float b = mix(0.5, 1.08, t) * (0.75 + 0.4 * r2) * (0.82 + 0.3 * tr) * (0.88 + 0.1 * fl) * shade;   // roots darker, tips lighter
    c = mix(c, col * b, strand);
    A = max(A, strand);
  }
  o = vec4(clamp(c, 0.0, 1.0) * A, A);
}`;
  function fur(maskCanvas, flowCanvas, thickCanvas, w, h, p) {
    if (!init()) return null;
    if (!progs.fur) {
      const pr = gl.createProgram();
      gl.attachShader(pr, compile(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, compile(gl.FRAGMENT_SHADER, FUR_FS));
      gl.bindAttribLocation(pr, 0, 'p'); gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
      progs.fur = { p: pr, u: {} };
    }
    ensureCanvas(w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    run('fur', null, w, h, { mask: texFor(maskCanvas), flow: texFor(flowCanvas), thick: texFor(thickCanvas) },
      { res: [w, h], col: hex(p.color), hairLen: p.hairLen || 20, seed: p.seed || 1, grain: p.grain || 1 });
    return { canvas: cv, sx: 0, sy: cv.height - h, w, h };
  }

  // Is WebGL running on a real graphics card? Some computers only have a software stand-in,
  // which is slower than the browser's own filters, so character effects skip it there.
  let hw = null;
  function hardware() {
    if (hw !== null) return hw;
    if (!init()) return (hw = false);
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    return (hw = !/swiftshader|llvmpipe|software|basic render/i.test(name));
  }

  return { available: () => init(), hardware, layerFx, film, headWarp, fur };
})();
