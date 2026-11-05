'use strict';
/* Audio helpers: WAV encoding for Rhubarb, and waveform peaks for the timeline. */
const AudioUtil = {
  // Rhubarb wants WAV or OGG. 16 kHz mono keeps the upload small and is all it needs.
  async toWav16kMono(buffer) {
    const rate = 16000;
    const len = Math.max(1, Math.ceil(buffer.duration * rate));
    const off = new OfflineAudioContext(1, len, rate);
    const src = off.createBufferSource();
    src.buffer = buffer;
    src.connect(off.destination);
    src.start();
    const out = await off.startRendering();
    return this.encodeWav(out.getChannelData(0), rate);
  },

  encodeWav(samples, rate) {
    const buf = new ArrayBuffer(44 + samples.length * 2);
    const v = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVE');
    w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    w(36, 'data'); v.setUint32(40, samples.length * 2, true);
    for (let i = 0, o = 44; i < samples.length; i++, o += 2) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return new Blob([buf], { type: 'audio/wav' });
  },

  blobToBase64(blob) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(',')[1]);
      r.onerror = () => rej(r.error);
      r.readAsDataURL(blob);
    });
  },

  /* ---- voice effects ---- */

  mono(buffer) {
    const n = buffer.length, chs = buffer.numberOfChannels, out = new Float32Array(n);
    for (let c = 0; c < chs; c++) {
      const d = buffer.getChannelData(c);
      for (let i = 0; i < n; i++) out[i] += d[i] / chs;
    }
    return out;
  },

  // Play the samples r times faster: shorter and higher (like speeding up a tape).
  resample(x, r) {
    const n = Math.max(1, Math.floor(x.length / r));
    const y = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const p = i * r, j = Math.floor(p), f = p - j;
      const a = x[j] || 0, b = x[j + 1] || 0;
      y[i] = a + (b - a) * f;
    }
    return y;
  },

  // Make audio `alpha` times longer without changing its pitch (WSOLA: overlap small
  // slices, nudging each one so its waveform lines up with the previous slice).
  stretch(x, alpha, sr) {
    const N = 1 << Math.round(Math.log2(sr * 0.04));   // ~40 ms slices
    const Hs = N / 2, Ha = Hs / alpha, tol = Math.round(sr * 0.008);
    const frames = Math.floor((x.length - N - tol) / Ha) + 1;
    if (frames < 2) return this.resample(x, 1 / alpha);
    const w = new Float32Array(N);
    for (let i = 0; i < N; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
    const outLen = Math.ceil(x.length * alpha);
    const y = new Float32Array(outLen + N), ws = new Float32Array(outLen + N);
    let prev = 0;
    for (let k = 0; k < frames; k++) {
      const nominal = Math.round(k * Ha);
      let best = nominal;
      const target = prev + Hs;
      if (k > 0 && target + N < x.length) {
        let bestC = -Infinity;
        for (let d = -tol; d <= tol; d += 2) {
          const p = nominal + d;
          if (p < 0 || p + N >= x.length) continue;
          let c = 0;
          for (let i = 0; i < N; i += 8) c += x[p + i] * x[target + i];
          if (c > bestC) { bestC = c; best = p; }
        }
      }
      prev = best;
      const o = k * Hs;
      for (let i = 0; i < N; i++) { y[o + i] += x[best + i] * w[i]; ws[o + i] += w[i]; }
    }
    for (let i = 0; i < y.length; i++) if (ws[i] > 1e-3) y[i] /= ws[i];
    return y.subarray(0, outLen);
  },

  // Raise or lower the pitch by ratio r but keep the same length.
  pitchShift(x, r, sr) {
    return this.resample(this.stretch(x, r, sr), r);
  },

  peaks(buffer, n) {
    const ch = buffer.getChannelData(0);
    const out = new Float32Array(n);
    const block = ch.length / n;
    const stride = Math.max(1, Math.floor(block / 200));
    for (let i = 0; i < n; i++) {
      let max = 0;
      const end = Math.min(ch.length, Math.floor((i + 1) * block));
      for (let j = Math.floor(i * block); j < end; j += stride) {
        const a = Math.abs(ch[j]);
        if (a > max) max = a;
      }
      out[i] = max;
    }
    return out;
  },
};
