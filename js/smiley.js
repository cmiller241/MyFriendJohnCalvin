'use strict';
/*
 * The built-in smiley character. Drawn centred on (0,0) with a radius of 100.
 * mouth: a Rhubarb mouth shape (A–H or X). When it is null or X, the
 * character's expression mouth is drawn instead.
 */
const Smiley = (() => {
  const INK = '#3b2412', INSIDE = '#6b1426', TONGUE = '#ef6f8a', TEETH = '#ffffff';
  const TAU = Math.PI * 2;

  function shade(hex, amt) {
    let c = String(hex || '#ffd23f').replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const n = parseInt(c, 16) || 0;
    const f = v => Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt);
    return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }

  function stroke(ctx, w) {
    ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = INK; ctx.stroke();
  }

  // An open mouth: dark inside, optional teeth and tongue, outlined lips.
  function openMouth(ctx, cx, cy, w, h, o = {}) {
    ctx.save();
    ctx.beginPath(); ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, TAU);
    ctx.fillStyle = INSIDE; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = TONGUE;
    if (o.tongue === 'low') { ctx.beginPath(); ctx.ellipse(cx, cy + h * 0.42, w * 0.36, h * 0.32, 0, 0, TAU); ctx.fill(); }
    if (o.tongue === 'high') { ctx.beginPath(); ctx.ellipse(cx, cy - h * 0.02, w * 0.22, h * 0.3, 0, 0, TAU); ctx.fill(); }
    ctx.fillStyle = TEETH;
    if (o.top) ctx.fillRect(cx - w / 2, cy - h / 2, w, h * o.top);
    if (o.bottom) ctx.fillRect(cx - w / 2, cy + h / 2 - h * o.bottom, w, h * o.bottom);
    ctx.restore();
    ctx.beginPath(); ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, TAU);
    stroke(ctx, o.lip || 5);
    ctx.restore();
  }

  function expressionMouth(ctx, expr) {
    ctx.beginPath();
    switch (expr) {
      case 'grin': {
        ctx.moveTo(-50, 26); ctx.quadraticCurveTo(0, 38, 50, 26);
        ctx.quadraticCurveTo(0, 104, -50, 26); ctx.closePath();
        ctx.fillStyle = INSIDE; ctx.fill();
        ctx.save(); ctx.clip();
        ctx.fillStyle = TEETH; ctx.fillRect(-60, 20, 120, 20);
        ctx.fillStyle = TONGUE; ctx.beginPath(); ctx.ellipse(0, 66, 24, 12, 0, 0, TAU); ctx.fill();
        ctx.restore();
        ctx.beginPath(); ctx.moveTo(-50, 26); ctx.quadraticCurveTo(0, 38, 50, 26);
        ctx.quadraticCurveTo(0, 104, -50, 26); ctx.closePath();
        stroke(ctx, 6);
        return;
      }
      case 'neutral': ctx.moveTo(-30, 46); ctx.lineTo(30, 46); stroke(ctx, 7); return;
      case 'sad': ctx.moveTo(-36, 60); ctx.quadraticCurveTo(0, 28, 36, 60); stroke(ctx, 7); return;
      case 'surprised': openMouth(ctx, 0, 50, 34, 42, { lip: 6 }); return;
      default: ctx.moveTo(-42, 32); ctx.quadraticCurveTo(0, 72, 42, 32); stroke(ctx, 7);
    }
  }

  function shapeMouth(ctx, shape) {
    switch (shape) {
      case 'A': ctx.beginPath(); ctx.moveTo(-30, 46); ctx.quadraticCurveTo(0, 52, 30, 46); stroke(ctx, 8); return true;
      case 'B': openMouth(ctx, 0, 46, 62, 18, { top: 0.5, bottom: 0.5 }); return true;
      case 'C': openMouth(ctx, 0, 46, 64, 32, { top: 0.3, tongue: 'low' }); return true;
      case 'D': openMouth(ctx, 0, 50, 74, 56, { top: 0.2, tongue: 'low' }); return true;
      case 'E': openMouth(ctx, 0, 48, 44, 38, { tongue: 'low' }); return true;
      case 'F': openMouth(ctx, 0, 48, 22, 24, { lip: 8 }); return true;
      case 'G':
        openMouth(ctx, 0, 46, 58, 22, { top: 0.65 });
        ctx.beginPath(); ctx.moveTo(-26, 55); ctx.quadraticCurveTo(0, 61, 26, 55); stroke(ctx, 6);
        return true;
      case 'H': openMouth(ctx, 0, 48, 60, 40, { top: 0.22, tongue: 'high' }); return true;
      default: return false; // X or nothing: use the expression
    }
  }

  function eyes(ctx, blink, expr) {
    const big = expr === 'surprised';
    for (const sx of [-1, 1]) {
      const ex = sx * 36, ey = -28;
      if (blink) {
        ctx.beginPath(); ctx.moveTo(ex - 14, ey); ctx.quadraticCurveTo(ex, ey + 9, ex + 14, ey); stroke(ctx, 6);
      } else {
        ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(ex, ey, big ? 14 : 11, big ? 22 : 19, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(ex + 4, ey - 7, 4, 6, 0, 0, TAU); ctx.fill();
      }
      if (expr === 'sad') { ctx.beginPath(); ctx.moveTo(sx * 20, -66); ctx.lineTo(sx * 52, -56); stroke(ctx, 6); }
      if (big) { ctx.beginPath(); ctx.moveTo(sx * 22, -66); ctx.quadraticCurveTo(sx * 36, -78, sx * 50, -66); stroke(ctx, 6); }
    }
  }

  function draw(ctx, o = {}) {
    const color = o.color || '#ffd23f';
    const expr = o.expr || 'smile';
    ctx.save();
    const g = ctx.createRadialGradient(-30, -40, 10, 0, 0, 105);
    g.addColorStop(0, shade(color, 0.35)); g.addColorStop(1, color);
    ctx.beginPath(); ctx.arc(0, 0, 100, 0, TAU);
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 6; ctx.strokeStyle = shade(color, -0.45); ctx.stroke();
    ctx.fillStyle = 'rgba(255,110,130,0.35)';
    for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sx * 62, 18, 16, 10, 0, 0, TAU); ctx.fill(); }
    eyes(ctx, o.blink, expr);
    if (!shapeMouth(ctx, o.mouth)) expressionMouth(ctx, expr);
    ctx.restore();
  }

  return { draw, shade, bounds: { x: -106, y: -106, w: 212, h: 212 } };
})();
