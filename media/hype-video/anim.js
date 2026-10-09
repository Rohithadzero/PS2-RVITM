'use strict';
// GrowIt hype video. Every frame is a pure function of time, except the fluid
// solver, which is stepped once per frame in order (renderFrame steps it up to i).

const W = 1920, H = 1080, FPS = 30, DUR = 48, NF = DUR * FPS;
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
const FONT = '"Inter Display","KN","DV",sans-serif';
const COL = {
  bg: '#050a14', green: '#0c9452', lime: '#2fd583', amber: '#f0b429', paper: '#f3efe6',
  ink: '#1f1a14', muted: '#6d645b', red: '#d63a3a', blue: '#3d7be0', frost: '#a8dcff',
  white: '#f6f3ec', card: '#fbf8f1', line: '#cfc4b4', dim: '#8e9bb0',
};

// ---------- math ----------
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const prog = (t, a, d) => clamp((t - a) / d);
const ease = {
  oc: t => 1 - (1 - t) ** 3,
  ic: t => t * t * t,
  ioc: t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  oe: t => (t >= 1 ? 1 : 1 - 2 ** (-10 * t)),
  ioe: t => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2),
  ob: t => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; },
  ios: t => -(Math.cos(Math.PI * t) - 1) / 2,
  el: t => (t <= 0 ? 0 : t >= 1 ? 1 : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1),
};
function hash(a, b = 0, c = 0) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1440662683)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mix(c1, c2, t) { const a = hexRgb(c1), b = hexRgb(c2); return `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], t))).join(',')})`; }
function rgba(h, a) { const c = hexRgb(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }

// ---------- fluid (Stam stable fluids + vorticity confinement) ----------
const FW = 192, FH = 108, SW = FW + 2, SZ = SW * (FH + 2);
const IX = (i, j) => i + SW * j;
const F = {};
for (const k of ['u', 'v', 'u0', 'v0', 'a', 'b', 'a0', 'b0', 'p', 'div', 'w']) F[k] = new Float32Array(SZ);
function bnd(b, x) {
  for (let j = 1; j <= FH; j++) {
    x[IX(0, j)] = b === 1 ? -x[IX(1, j)] : x[IX(1, j)];
    x[IX(FW + 1, j)] = b === 1 ? -x[IX(FW, j)] : x[IX(FW, j)];
  }
  for (let i = 1; i <= FW; i++) {
    x[IX(i, 0)] = b === 2 ? -x[IX(i, 1)] : x[IX(i, 1)];
    x[IX(i, FH + 1)] = b === 2 ? -x[IX(i, FH)] : x[IX(i, FH)];
  }
}
function project(u, v, p, div) {
  for (let j = 1; j <= FH; j++) for (let i = 1; i <= FW; i++) {
    div[IX(i, j)] = -0.5 * (u[IX(i + 1, j)] - u[IX(i - 1, j)] + v[IX(i, j + 1)] - v[IX(i, j - 1)]);
    p[IX(i, j)] = 0;
  }
  bnd(0, div); bnd(0, p);
  for (let k = 0; k < 24; k++) {
    for (let j = 1; j <= FH; j++) for (let i = 1; i <= FW; i++) {
      const id = IX(i, j);
      p[id] = (div[id] + p[id - 1] + p[id + 1] + p[id - SW] + p[id + SW]) * 0.25;
    }
    bnd(0, p);
  }
  for (let j = 1; j <= FH; j++) for (let i = 1; i <= FW; i++) {
    const id = IX(i, j);
    u[id] -= 0.5 * (p[id + 1] - p[id - 1]);
    v[id] -= 0.5 * (p[id + SW] - p[id - SW]);
  }
  bnd(1, u); bnd(2, v);
}
function advect(b, d, d0, u, v, dt) {
  for (let j = 1; j <= FH; j++) for (let i = 1; i <= FW; i++) {
    const id = IX(i, j);
    let x = i - dt * u[id], y = j - dt * v[id];
    x = clamp(x, 0.5, FW + 0.5); y = clamp(y, 0.5, FH + 0.5);
    const i0 = x | 0, j0 = y | 0, s1 = x - i0, t1 = y - j0, s0 = 1 - s1, t0 = 1 - t1;
    d[id] = s0 * (t0 * d0[IX(i0, j0)] + t1 * d0[IX(i0, j0 + 1)]) + s1 * (t0 * d0[IX(i0 + 1, j0)] + t1 * d0[IX(i0 + 1, j0 + 1)]);
  }
  bnd(b, d);
}
function vorticity(eps, dt) {
  const { u, v, w } = F;
  for (let j = 1; j <= FH; j++) for (let i = 1; i <= FW; i++) {
    const id = IX(i, j);
    w[id] = 0.5 * (v[id + 1] - v[id - 1] - (u[id + SW] - u[id - SW]));
  }
  for (let j = 2; j < FH; j++) for (let i = 2; i < FW; i++) {
    const id = IX(i, j);
    const gx = 0.5 * (Math.abs(w[id + 1]) - Math.abs(w[id - 1]));
    const gy = 0.5 * (Math.abs(w[id + SW]) - Math.abs(w[id - SW]));
    const l = Math.hypot(gx, gy) + 1e-5;
    u[id] += dt * eps * (gy / l) * w[id];
    v[id] -= dt * eps * (gx / l) * w[id];
  }
}
function splat(x, y, fx, fy, da, db, r) {
  const cx = x * FW + 0.5, cy = y * FH + 0.5, R = Math.ceil(r * 3);
  for (let j = Math.max(1, (cy - R) | 0); j <= Math.min(FH, (cy + R) | 0); j++)
    for (let i = Math.max(1, (cx - R) | 0); i <= Math.min(FW, (cx + R) | 0); i++) {
      const g = Math.exp(-((i - cx) ** 2 + (j - cy) ** 2) / (r * r));
      const id = IX(i, j);
      F.u[id] += fx * g; F.v[id] += fy * g; F.a[id] += da * g; F.b[id] += db * g;
    }
}
// one-shot bursts: radial puffs at story beats
const BURSTS = [
  { t: 0.2, x: 0.5, y: 0.5, a: 1.4, b: 0.2, s: 140 },
  { t: 4.0, x: 0.1, y: 0.5, a: 1.0, b: 0.8, s: 160 },
  { t: 5.5, x: 0.62, y: 0.5, a: 0.3, b: 1.0, s: 120 },
  { t: 6.5, x: 0.62, y: 0.5, a: 1.0, b: 0.3, s: 120 },
  { t: 7.5, x: 0.62, y: 0.5, a: 0.3, b: 1.0, s: 120 },
  { t: 8.6, x: 0.5, y: 0.62, a: 1.2, b: 0.8, s: 140 },
  { t: 16.0, x: 0.0, y: 0.5, a: 1.0, b: 0.6, s: 160 },
  { t: 19.0, x: 0.5, y: 0.65, a: 1.6, b: 0.4, s: 220 },
  { t: 22.0, x: 0.5, y: 0.5, a: 0.8, b: 0.8, s: 150 },
  { t: 36.2, x: 0.25, y: 0.2, a: 0.4, b: 1.2, s: 160 },
  { t: 40.0, x: 0.3, y: 0.9, a: 0.2, b: 1.2, s: 140 },
  { t: 40.5, x: 0.7, y: 0.9, a: 1.2, b: 0.1, s: 140 },
  { t: 42.4, x: 0.25, y: 0.5, a: 1.2, b: 0.2, s: 180 },
  { t: 42.9, x: 0.5, y: 0.5, a: 0.6, b: 0.6, s: 180 },
  { t: 43.4, x: 0.75, y: 0.5, a: 0.2, b: 1.4, s: 200 },
  { t: 45.0, x: 0.33, y: 0.5, a: 1.6, b: 0.3, s: 160 },
];
let fluidFrame = -1;
function fluidStep(fi) {
  const dt = 1 / FPS, T = fi / FPS;
  const lvl = T < 0.3 ? 0 : 1;
  // two orbiting emitters keep the ink alive
  const e = [
    [0.5 + 0.34 * Math.cos(0.47 * T), 0.5 + 0.3 * Math.sin(0.61 * T), 0.47, 0.61, 0.5, 0.0],
    [0.5 + 0.32 * Math.cos(0.39 * T + 2.1), 0.5 + 0.28 * Math.sin(0.53 * T + 1.3), 0.39, 0.53, 0.0, 0.42],
  ];
  for (const [x, y, wx, wy, da, db] of e) {
    const dx = -0.34 * wx * Math.sin(wx * T), dy = 0.3 * wy * Math.cos(wy * T);
    const l = Math.hypot(dx, dy) + 1e-6;
    splat(x, y, (dx / l) * 70 * lvl, (dy / l) * 70 * lvl, da * 0.22 * lvl, db * 0.22 * lvl, 4.5);
  }
  for (const bu of BURSTS) {
    if (T >= bu.t && T < bu.t + 0.1) {
      for (let k = 0; k < 10; k++) {
        const an = (k / 10) * Math.PI * 2 + bu.t;
        splat(bu.x + Math.cos(an) * 0.02, bu.y + Math.sin(an) * 0.035, Math.cos(an) * bu.s, Math.sin(an) * bu.s, bu.a * 0.5, bu.b * 0.5, 5);
      }
    }
  }
  for (const fx of flowFronts(T)) splat(fx.x, fx.y, fx.fx, fx.fy, fx.a, fx.b, 4);
  vorticity(22, dt);
  project(F.u, F.v, F.p, F.div);
  F.u0.set(F.u); F.v0.set(F.v);
  advect(1, F.u, F.u0, F.u0, F.v0, dt);
  advect(2, F.v, F.v0, F.u0, F.v0, dt);
  project(F.u, F.v, F.p, F.div);
  F.a0.set(F.a); F.b0.set(F.b);
  advect(0, F.a, F.a0, F.u, F.v, dt);
  advect(0, F.b, F.b0, F.u, F.v, dt);
  for (let k = 0; k < SZ; k++) { F.a[k] *= 0.986; F.b[k] *= 0.986; F.u[k] *= 0.996; F.v[k] *= 0.996; }
}
function fluidAdvanceTo(fi) { while (fluidFrame < fi) fluidStep(++fluidFrame); }

const fc = document.createElement('canvas'); fc.width = FW; fc.height = FH;
const fctx = fc.getContext('2d');
const fimg = fctx.createImageData(FW, FH);
let fImgFrame = -2;
function fluidImage() {
  if (fImgFrame === fluidFrame) return fc;
  fImgFrame = fluidFrame;
  const g = hexRgb(COL.green), am = hexRgb(COL.amber), d = fimg.data;
  for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) {
    const id = IX(i + 1, j + 1);
    const A = 1 - Math.exp(-1.6 * Math.max(0, F.a[id])), B = 1 - Math.exp(-1.6 * Math.max(0, F.b[id]));
    const s = A + B + 1e-6, al = clamp(A + B);
    const o = (i + j * FW) * 4;
    d[o] = (g[0] * A + am[0] * B) / s; d[o + 1] = (g[1] * A + am[1] * B) / s; d[o + 2] = (g[2] * A + am[2] * B) / s;
    d[o + 3] = al * 255;
  }
  fctx.putImageData(fimg, 0, 0);
  return fc;
}
function drawFluid(c, alpha = 1, blur = 18) {
  c.save();
  c.globalAlpha = alpha;
  c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
  c.filter = `blur(${blur}px)`;
  c.drawImage(fluidImage(), -20, -20, W + 40, H + 40);
  c.restore();
}
function sampleDye(x, y) {
  const gx = clamp(x / W * FW + 0.5, 1, FW), gy = clamp(y / H * FH + 0.5, 1, FH);
  const i0 = gx | 0, j0 = gy | 0, s = gx - i0, t = gy - j0;
  const f = arr => lerp(lerp(arr[IX(i0, j0)], arr[IX(i0 + 1, j0)], s), lerp(arr[IX(i0, j0 + 1)], arr[IX(i0 + 1, j0 + 1)], s), t);
  return [Math.max(0, f(F.a)), Math.max(0, f(F.b))];
}
// halftone rendering of the fluid: the brand's dot language
function drawFluidHalftone(c, step = 24, gain = 1) {
  const buckets = Array.from({ length: 7 }, () => new Path2D());
  for (let y = step / 2, row = 0; y < H + step; y += step * 0.866, row++) {
    for (let x = (row % 2 ? step / 2 : 0); x < W + step; x += step) {
      const [A, B] = sampleDye(x, y);
      const m = 1 - Math.exp(-1.7 * (A + B) * gain);
      const r = step * 0.56 * Math.sqrt(m);
      if (r < 0.7) continue;
      const k = Math.round((B / (A + B + 1e-6)) * 6);
      buckets[k].moveTo(x + r, y); buckets[k].arc(x, y, r, 0, Math.PI * 2);
    }
  }
  buckets.forEach((p, k) => { c.fillStyle = mix(COL.green, COL.amber, k / 6); c.fill(p); });
}

// ---------- text ----------
function font(c, size, weight = 900, fam = FONT) { c.font = `${weight} ${size}px ${fam}`; }
function measure(c, s, size, weight = 900, track = 0) {
  c.save(); font(c, size, weight); c.letterSpacing = track + 'px'; const w = c.measureText(s).width; c.restore(); return w;
}
function text(c, s, x, y, o = {}) {
  c.save();
  font(c, o.size || 100, o.weight || 900);
  c.fillStyle = o.color || COL.white;
  c.textAlign = o.align || 'left';
  c.textBaseline = o.base || 'alphabetic';
  c.letterSpacing = (o.track || 0) + 'px';
  c.globalAlpha *= o.alpha ?? 1;
  c.fillText(s, x, y);
  c.restore();
}
function leftOf(c, s, x, o) {
  const w = measure(c, s, o.size || 100, o.weight || 900, o.track || 0);
  return { w, l: o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x };
}
// whole-string reveal from below through a mask (works for every script)
function maskUp(c, s, x, y, t, t0, o = {}) {
  const size = o.size || 100;
  const p = ease.oe(prog(t, t0, o.dur || 0.55));
  if (p <= 0) return;
  const q = o.out != null ? ease.ioc(prog(t, o.out, o.outDur || 0.32)) : 0;
  if (q >= 1) return;
  const { w, l } = leftOf(c, s, x, o);
  c.save();
  c.beginPath(); c.rect(l - 40, y - size * 1.12, w + 80, size * 1.5); c.clip();
  text(c, s, x, y + (1 - p) * size * 1.25 - q * size * 1.3, { ...o, align: o.align || 'left' });
  c.restore();
}
// per-letter kinetic reveal (Latin)
function letters(c, s, x, y, t, t0, o = {}) {
  const size = o.size || 100, st = o.st ?? 0.035;
  const { l } = leftOf(c, s, x, o);
  const q = o.out != null ? ease.ic(prog(t, o.out, 0.35)) : 0;
  if (q >= 1) return;
  c.save();
  font(c, size, o.weight || 900); c.letterSpacing = (o.track || 0) + 'px';
  const cols = o.colors;
  for (let i = 0; i < s.length; i++) {
    const lt = t - t0 - i * st;
    const p = ease.ob(prog(lt, 0, o.dur || 0.5));
    if (p <= 0) continue;
    const px = l + c.measureText(s.slice(0, i)).width;
    const cw = c.measureText(s[i]).width;
    c.save();
    c.beginPath(); c.rect(px - 20, y - size * 1.15, cw + 40, size * 1.5); c.clip();
    c.translate(px + cw / 2, y + (1 - p) * size * 1.2 - q * size * 1.3);
    c.rotate((1 - clamp(p)) * 0.5 * (hash(i, 7) - 0.3));
    c.fillStyle = cols ? cols[i] : o.color || COL.white;
    c.textAlign = 'center';
    c.fillText(s[i], 0, 0);
    c.restore();
  }
  c.restore();
}
// slam in with overshoot and speed ghosts
function slam(c, s, x, y, t, t0, o = {}) {
  const p = prog(t, t0, o.dur || 0.38);
  if (t < t0) return;
  const q = o.out != null ? ease.ic(prog(t, o.out, 0.3)) : 0;
  if (q >= 1) return;
  const sc = lerp(o.from || 2.4, 1, ease.ob(p)) * (o.outY ? 1 : 1 - q * 0.6);
  const al = prog(t, t0, 0.07) * (1 - q);
  c.save();
  c.translate(x, y - (o.outY || 0) * q);
  c.rotate((o.rot || 0) * (1 - ease.oc(p)));
  for (let k = 3; k >= 1; k--) {
    if (p > 0.45) break;
    c.save(); c.scale(sc * (1 + 0.1 * k), sc * (1 + 0.1 * k));
    text(c, s, 0, 0, { ...o, alpha: al * 0.12 * (1 - p / 0.45), align: o.align || 'center', base: 'middle' });
    c.restore();
  }
  c.scale(sc, sc);
  text(c, s, 0, 0, { ...o, alpha: al, align: o.align || 'center', base: 'middle' });
  c.restore();
}
function wordsIn(c, words, x, y, t, t0, o = {}) {
  const size = o.size || 60, gap = size * 0.28;
  const ws = words.map(w => measure(c, w.s, size, o.weight || 800));
  const total = ws.reduce((a, b) => a + b, 0) + gap * (words.length - 1);
  let px = o.align === 'center' ? x - total / 2 : x;
  words.forEach((w, i) => {
    maskUp(c, w.s, px, y, t, t0 + i * (o.st || 0.09), { size, weight: o.weight || 800, color: w.c || o.color, dur: 0.5, out: o.out });
    px += ws[i] + gap;
  });
  return { left: o.align === 'center' ? x - total / 2 : x, total, ws, gap };
}

// ---------- vector strokes ----------
function arcPts(cx, cy, r, a0, a1, n = 48) { const p = []; for (let k = 0; k <= n; k++) { const a = lerp(a0, a1, k / n); p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return p; }
function rrPts(x, y, w, h, r) {
  const P = Math.PI;
  return [
    ...arcPts(x + r, y + r, r, P, 1.5 * P, 12), ...arcPts(x + w - r, y + r, r, 1.5 * P, 2 * P, 12),
    ...arcPts(x + w - r, y + h - r, r, 0, 0.5 * P, 12), ...arcPts(x + r, y + h - r, r, 0.5 * P, P, 12), [x, y + r],
  ];
}
function polyLen(p) { let L = 0; for (let k = 1; k < p.length; k++) L += Math.hypot(p[k][0] - p[k - 1][0], p[k][1] - p[k - 1][1]); return L; }
function strokePoly(c, p, f) {
  if (f <= 0) return;
  const L = polyLen(p) * clamp(f);
  c.beginPath(); c.moveTo(p[0][0], p[0][1]);
  let acc = 0;
  for (let k = 1; k < p.length; k++) {
    const d = Math.hypot(p[k][0] - p[k - 1][0], p[k][1] - p[k - 1][1]);
    if (acc + d >= L) { const u = (L - acc) / (d || 1); c.lineTo(lerp(p[k - 1][0], p[k][0], u), lerp(p[k - 1][1], p[k][1], u)); break; }
    c.lineTo(p[k][0], p[k][1]); acc += d;
  }
  c.stroke();
}
function strokeAll(c, polys, f, o = {}) {
  c.save();
  c.strokeStyle = o.color || COL.white; c.lineWidth = o.lw || 6; c.lineCap = 'round'; c.lineJoin = 'round';
  polys.forEach((p, k) => strokePoly(c, p, clamp(f * (1 + (o.stg || 0) * polys.length) - k * (o.stg || 0))));
  c.restore();
}
const ICON = {
  mic: (s) => [
    rrPts(-0.17 * s, -0.5 * s, 0.34 * s, 0.6 * s, 0.17 * s),
    arcPts(0, -0.02 * s, 0.3 * s, 0, Math.PI, 40),
    [[0, 0.28 * s], [0, 0.45 * s]], [[-0.18 * s, 0.45 * s], [0.18 * s, 0.45 * s]],
  ],
  lockBody: (s) => [rrPts(-0.42 * s, -0.08 * s, 0.84 * s, 0.62 * s, 0.1 * s), [...arcPts(0, 0.16 * s, 0.07 * s, 0, Math.PI * 2, 24)], [[0, 0.22 * s], [0, 0.34 * s]]],
  shackle: (s) => [[[-0.27 * s, -0.08 * s], [-0.27 * s, -0.3 * s], ...arcPts(0, -0.3 * s, 0.27 * s, Math.PI, 2 * Math.PI, 30), [0.27 * s, -0.08 * s]]],
  insta: (s) => [rrPts(-0.42 * s, -0.42 * s, 0.84 * s, 0.84 * s, 0.24 * s), arcPts(0, 0, 0.2 * s, 0, Math.PI * 2, 32), arcPts(0.24 * s, -0.24 * s, 0.025 * s, 0, Math.PI * 2, 8)],
  chat: (s) => [[...arcPts(0, -0.04 * s, 0.4 * s, 0.75 * Math.PI, 2.6 * Math.PI, 48), [-0.38 * s, 0.4 * s], [-0.29 * s, 0.24 * s]]],
  poster: (s) => [rrPts(-0.32 * s, -0.44 * s, 0.64 * s, 0.88 * s, 0.05 * s), [[-0.18 * s, -0.2 * s], [0.18 * s, -0.2 * s]], [[-0.18 * s, 0.0], [0.1 * s, 0]], [[-0.18 * s, 0.2 * s], [0.14 * s, 0.2 * s]]],
  check: (s) => [[[-0.3 * s, 0.02 * s], [-0.08 * s, 0.24 * s], [0.32 * s, -0.22 * s]]],
  snow: (s) => {
    const r = [];
    for (let k = 0; k < 3; k++) {
      const a = k * Math.PI / 3 + Math.PI / 2, ca = Math.cos(a) * 0.45 * s, sa = Math.sin(a) * 0.45 * s;
      r.push([[-ca, -sa], [ca, sa]]);
    }
    return r;
  },
};
function icon(c, name, x, y, s, f, o = {}) { c.save(); c.translate(x, y); strokeAll(c, ICON[name](s), f, o); c.restore(); }

// ---------- dots ----------
// halftone-masked reveal of an image: dots grow (with jitter) until they tile the area
function dotReveal(c, img, x, y, w, h, p, seed = 0, step = 14, out = false) {
  if (p <= 0) return;
  if (p >= 1) { c.drawImage(img, x, y, w, h); return; }
  const path = new Path2D();
  const cols = Math.ceil(w / step) + 1, rows = Math.ceil(h / step) + 1;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const d = (i / cols) * 0.45 + hash(i, j, seed) * 0.25;
    const rp = clamp((p - d) / 0.3);
    if (rp <= 0) continue;
    const r = step * 0.76 * ease.oc(rp);
    const jit = step * 0.3 * Math.sin(Math.PI * rp);
    const px = x + i * step + (hash(i, j, seed + ((p * 40) | 0)) - 0.5) * jit;
    const py = y + j * step + (hash(j, i, seed + ((p * 40) | 0)) - 0.5) * jit;
    path.moveTo(px + r, py); path.arc(px, py, r, 0, Math.PI * 2);
  }
  c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); c.clip(path); c.drawImage(img, x, y, w, h); c.restore();
}

// GrowIt mark sampled from the real logo into dot positions
let MARK = [];
function initMark(img) {
  const k = document.createElement('canvas'); k.width = k.height = 256;
  const kc = k.getContext('2d'); kc.drawImage(img, 0, 0, 256, 256);
  const d = kc.getImageData(0, 0, 256, 256).data;
  const step = 17;
  for (let gy = 0; gy < 256; gy += step) for (let gx = 0; gx < 256; gx += step) {
    let n = 0;
    for (let y = gy; y < gy + step && y < 256; y++) for (let x = gx; x < gx + step && x < 256; x++) {
      const o = (y * 256 + x) * 4;
      if (d[o + 1] > 110 && d[o] < 80) n++;
    }
    if (n > step * step * 0.22) MARK.push({ u: (gx + step / 2) / 256 - 0.5, v: (gy + step / 2) / 256 - 0.5, k: MARK.length });
  }
  MARK.step = step / 256;
}
function markDot(m, size, p) { return size * MARK.step * 0.43 * (0.8 + 0.3 * (m.u + 0.5)) * p; }

// ---------- lockup (mark + wordmark) ----------
function lockupLayout(c) {
  const size = 400, ws = measure(c, 'GrowIt', 210, 900, -4);
  const total = size * 0.86 + 60 + ws;
  const left = (W - total) / 2;
  return { size, mx: left + size * 0.43, my: H / 2 - 20, wx: left + size * 0.86 + 60, wy: H / 2 + 52 };
}
function drawWordmark(c, t, t0, L, o = {}) {
  letters(c, 'GrowIt', L.wx, L.wy, t, t0, { size: 210, track: -4, st: 0.05, colors: [COL.white, COL.white, COL.white, COL.white, COL.lime, COL.lime] });
  maskUp(c, 'Voice-first campaigns for small businesses', L.wx + 6, L.wy + 78, t, t0 + 0.45, { size: 40, weight: 600, color: COL.dim });
  if (o.footer) maskUp(c, 'Kannada · हिंदी · English   ·   built on Agnes', W / 2, H - 110, t, t0 + 0.9, { size: 32, weight: 600, color: COL.amber, align: 'center', track: 1 });
}

// ---------- backgrounds ----------
function bgDark(c, fluidAlpha = 1, halftone = false) {
  c.fillStyle = COL.bg; c.fillRect(0, 0, W, H);
  if (halftone) drawFluidHalftone(c, 26, 1.1);
  else drawFluid(c, fluidAlpha);
  const g = c.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 1.05);
  g.addColorStop(0, 'rgba(5,10,20,0)'); g.addColorStop(1, 'rgba(5,10,20,0.75)');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
}
function bgLight(c) {
  c.fillStyle = COL.paper; c.fillRect(0, 0, W, H);
  drawFluid(c, 0.16, 24);
}
function shake(T) {
  const ev = [[19.0, 7], [32.5, 22], [42.5, 12], [43.0, 12], [43.5, 16], [5.5, 6], [6.5, 6], [7.5, 6]];
  let x = 0, y = 0;
  for (const [t, a] of ev) {
    const d = T - t;
    if (d < 0 || d > 0.4) continue;
    const k = a * (1 - d / 0.4) ** 2, f = Math.floor(T * 60);
    x += (hash(f, 1) - 0.5) * 2 * k; y += (hash(f, 2) - 0.5) * 2 * k;
  }
  return [x, y];
}
function ring(c, x, y, t, t0, o = {}) {
  const p = prog(t, t0, o.dur || 0.6);
  if (p <= 0 || p >= 1) return;
  c.save(); c.strokeStyle = o.color || COL.white; c.globalAlpha = 1 - p; c.lineWidth = (o.lw || 10) * (1 - p) + 1;
  c.beginPath(); c.arc(x, y, lerp(o.r0 || 40, o.r1 || 420, ease.oc(p)), 0, Math.PI * 2); c.stroke(); c.restore();
}

// ---------- scenes ----------
function S0(c, T) {
  bgDark(c, 0.55);
  const L = lockupLayout(c);
  const mv = ease.ioc(prog(T, 1.75, 0.65));
  const cx = lerp(W / 2, L.mx, mv), cy = L.my;
  // radial glow
  const ga = prog(T, 0.6, 1.0) * 0.5;
  const g = c.createRadialGradient(cx, cy, 10, cx, cy, 420);
  g.addColorStop(0, rgba(COL.green, ga)); g.addColorStop(1, rgba(COL.green, 0));
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  const path = new Path2D(), hot = new Path2D();
  for (const m of MARK) {
    const delay = (m.u + 0.5) * 0.55 + hash(m.k, 3) * 0.3;
    const p = ease.oe(prog(T, 0.15 + delay, 0.85));
    if (p <= 0) continue;
    const sx = hash(m.k, 1) * W, sy = hash(m.k, 2) * H;
    const tx = cx + m.u * L.size, ty = cy + m.v * L.size;
    const jit = (1 - p) * 40, f = Math.floor(T * 15);
    const x = lerp(sx, tx, p) + (hash(m.k, f, 5) - 0.5) * jit, y = lerp(sy, ty, p) + (hash(m.k, f, 6) - 0.5) * jit;
    const r = markDot(m, L.size, lerp(0.35, 1, p));
    (hash(m.k, 9) < 0.08 && p < 0.98 ? hot : path).moveTo(x + r, y);
    (hash(m.k, 9) < 0.08 && p < 0.98 ? hot : path).arc(x, y, r, 0, Math.PI * 2);
  }
  c.fillStyle = COL.green; c.fill(path); c.fillStyle = COL.amber; c.fill(hot);
  drawWordmark(c, T, 2.3, L);
}

function S1(c, T) {
  const t = T - 4;
  bgDark(c, 1, true);
  c.fillStyle = 'rgba(5,10,20,0.45)'; c.fillRect(0, 0, W, H);
  // Meet Priya
  letters(c, 'Meet Priya.', W / 2, 560, t, 0.1, { size: 220, align: 'center', st: 0.045, out: 1.35 });
  maskUp(c, 'CAFÉ OWNER  ·  INDIRANAGAR, BENGALURU', W / 2, 690, t, 0.55, { size: 38, weight: 700, color: COL.amber, align: 'center', track: 10, out: 1.3 });
  // No ___. slot roll on the beat
  const nx = 700, ny = 600;
  maskUp(c, 'No', nx, ny, t, 1.5, { size: 200, align: 'right', out: 4.0 });
  const words = ['designer.', 'marketer.', 'time.'];
  words.forEach((w, i) => maskUp(c, w, nx + 50, ny, t, 1.5 + i, { size: 200, color: i === 2 ? COL.lime : COL.amber, dur: 0.4, out: i < 2 ? 2.47 + i : 4.0, outDur: 0.26 }));
  // three languages
  maskUp(c, 'Her customers speak', W / 2, 360, t, 4.15, { size: 96, align: 'center', color: COL.white });
  const langs = [['ಕನ್ನಡ', 500, 690, COL.lime, -0.25], ['हिंदी', 960, 730, COL.amber, 0.2], ['English', 1420, 690, COL.white, -0.15]];
  langs.forEach(([s, x, y, col, rot], i) => slam(c, s, x, y, t, 4.5 + i * 0.25, { size: 170, color: col, rot, from: 0.2 }));
}

function S2(c, T) {
  const t = T - 10;
  bgLight(c);
  letters(c, 'She just talks.', 140, 235, t, 0.15, { size: 130, color: COL.ink, st: 0.03 });
  // mic, drawn as a vector
  const mx = 430, my = 600;
  const live = prog(t, 1.0, 0.2) * (1 - prog(t, 4.0, 0.4));
  for (let k = 0; k < 4; k++) {
    const ph = ((t - 1.0) * 0.9 + k / 4) % 1;
    if (t < 1.0 || live <= 0) break;
    c.save(); c.globalAlpha = (1 - ph) * 0.55 * live; c.strokeStyle = COL.amber; c.lineWidth = 5;
    c.beginPath(); c.arc(mx, my - 40, 140 + ph * 220, 0, Math.PI * 2); c.stroke(); c.restore();
  }
  const mp = ease.ioc(prog(t, 0.35, 0.9));
  c.save(); c.fillStyle = rgba(COL.amber, prog(t, 0.9, 0.3)); c.beginPath(); c.arc(mx, my - 40, 130, 0, Math.PI * 2); c.fill(); c.restore();
  icon(c, 'mic', mx, my - 20, 260, mp, { color: COL.ink, lw: 12, stg: 0.15 });
  // transcript card
  const cx = 760, cy = 330, cw = 1020, ch = 500;
  const cp = ease.oe(prog(t, 0.6, 0.6));
  c.save();
  c.globalAlpha = cp;
  c.translate(0, (1 - cp) * 60);
  c.fillStyle = COL.card; c.strokeStyle = COL.line; c.lineWidth = 2;
  c.beginPath(); c.roundRect(cx, cy, cw, ch, 28); c.fill(); c.stroke();
  const blink = Math.floor(t * 2) % 2 === 0 && live > 0 ? 1 : 0.25;
  c.fillStyle = rgba(COL.red, blink); c.beginPath(); c.arc(cx + 56, cy + 62, 10, 0, Math.PI * 2); c.fill();
  text(c, 'LIVE TRANSCRIPT', cx + 80, cy + 72, { size: 26, weight: 700, color: COL.muted, track: 6 });
  // tokens
  const toks = ['Weekend', 'filter', 'coffee', 'offer —', '20%', 'off,', '₹48', 'a', 'cup,', 'Saturday', '&', 'Sunday,', '8', 'to', '11', 'am.'];
  const hi = { 4: 1, 5: 1, 6: 2, 9: 3, 10: 3, 11: 3, 12: 4, 13: 4, 14: 4, 15: 4 };
  const size = 64, lh = 92, maxW = cw - 120;
  font(c, size, 800);
  const sp = c.measureText(' ').width;
  let px = cx + 60, py = cy + 180;
  const placed = toks.map((s, k) => {
    const w = c.measureText(s).width;
    if (px + w > cx + 60 + maxW) { px = cx + 60; py += lh; }
    const r = { s, x: px, y: py, w, k };
    px += w + sp;
    return r;
  });
  let lastShown = null;
  placed.forEach(r => {
    const ta = 1.15 + r.k * 0.16;
    if (hi[r.k]) {
      const nextSame = hi[r.k + 1] === hi[r.k] && placed[r.k + 1].y === r.y;
      const hp = ease.oc(prog(t, ta + 0.25, 0.25));
      c.fillStyle = rgba(COL.amber, 0.85);
      c.beginPath(); c.roundRect(r.x - 8, r.y - size * 0.82, (r.w + 16 + (nextSame ? sp - 16 : 0)) * hp, size * 1.08, 8); c.fill();
    }
    maskUp(c, r.s, r.x, r.y, t, ta, { size, weight: 800, color: COL.ink, dur: 0.3 });
    if (t >= ta) lastShown = r;
  });
  if (lastShown && live > 0 && Math.floor(t * 3) % 2 === 0) {
    c.fillStyle = COL.ink; c.fillRect(lastShown.x + lastShown.w + 8, lastShown.y - size * 0.75, 5, size * 0.95);
  }
  // waveform
  const bars = 64, bw = (cw - 120) / bars;
  for (let k = 0; k < bars; k++) {
    const a = (0.25 + 0.75 * Math.abs(Math.sin(k * 0.37 + t * 7.1) * Math.sin(k * 0.13 - t * 3.3) + 0.3 * Math.sin(k * 1.7 + t * 13))) * live;
    const hgt = 6 + a * 70;
    c.fillStyle = k / bars < (t - 1.1) / 2.6 ? COL.ink : COL.line;
    c.beginPath(); c.roundRect(cx + 60 + k * bw, cy + ch - 70 - hgt / 2, bw * 0.55, hgt, 3); c.fill();
  }
  c.restore();
  wordsIn(c, [{ s: 'Kannada · हिंदी · English.' }, { s: 'Speech becomes text she can fix.', c: COL.muted }], 760, 920, t, 3.9, { size: 36, weight: 700, color: COL.ink });
}

function chip(c, x, y, w, h, label, value, o = {}) {
  c.save();
  c.fillStyle = o.fill || 'rgba(255,255,255,0.06)';
  c.beginPath(); c.roundRect(x, y, w, h, 22); c.fill();
  strokeAll(c, [rrPts(x, y, w, h, 22)], o.border ?? 1, { color: o.stroke || 'rgba(255,255,255,0.55)', lw: 3 });
  text(c, label, x + 30, y + 52, { size: 26, weight: 700, color: o.labelColor || COL.dim, track: 6 });
  let vs = o.vsize || 66;
  const vw = measure(c, value, vs, 900);
  if (vw > w - 60) vs *= (w - 60) / vw;
  text(c, value, x + 30, y + h - 44, { size: vs, color: o.valueColor || COL.white });
  c.restore();
}

function S3(c, T) {
  const t = T - 16;
  bgDark(c, 0.75);
  letters(c, 'Every number, locked.', W / 2, 225, t, 0.15, { size: 112, align: 'center', st: 0.025 });
  const facts = [['OFFER', '20% OFF'], ['PRICE', '₹48'], ['DAYS', 'SAT + SUN'], ['TIME', '8–11 AM']];
  const cw = 370, chh = 200, gap = 30, x0 = (W - (4 * cw + 3 * gap)) / 2, y0 = 320;
  const locked = t >= 3.0;
  facts.forEach(([l, v], k) => {
    const t0 = 0.55 + k * 0.14;
    const p = prog(t, t0, 0.75);
    if (p <= 0) return;
    const e = ease.ob(p);
    const x = x0 + k * (cw + gap), y = y0 + (1 - e) * 520;
    c.save();
    c.translate(x + cw / 2, y + chh / 2);
    c.rotate((1 - ease.oc(p)) * (hash(k, 4) - 0.5) * 0.9);
    c.translate(-cw / 2, -chh / 2);
    chip(c, 0, 0, cw, chh, l, v, {
      border: ease.ioc(prog(t, t0 + 0.2, 0.6)),
      stroke: locked ? COL.lime : 'rgba(255,255,255,0.55)',
      fill: locked ? rgba(COL.green, 0.22) : 'rgba(255,255,255,0.06)',
    });
    if (locked) {
      const bp = ease.ob(prog(t, 3.05 + k * 0.08, 0.35));
      c.save(); c.translate(cw - 44, 44); c.scale(bp, bp);
      c.fillStyle = COL.lime; c.beginPath(); c.arc(0, 0, 24, 0, Math.PI * 2); c.fill();
      icon(c, 'check', 0, 0, 34, 1, { color: COL.bg, lw: 6 });
      c.restore();
    }
    c.restore();
  });
  // lock
  const lx = W / 2, ly = 700, ls = 170;
  const drawP = ease.ioc(prog(t, 1.6, 0.9));
  const drop = t < 2.9 ? 0 : t < 3.0 ? ease.ic(prog(t, 2.9, 0.1)) : 1 - 0.08 * Math.sin(prog(t, 3.0, 0.25) * Math.PI);
  if (locked) {
    c.save(); c.fillStyle = COL.green; c.beginPath(); c.roundRect(lx - 0.42 * ls, ly - 0.08 * ls, 0.84 * ls, 0.62 * ls, 0.1 * ls); c.fill(); c.restore();
  }
  icon(c, 'lockBody', lx, ly, ls, drawP, { color: locked ? COL.lime : COL.white, lw: 9 });
  c.save(); c.translate(0, -0.22 * ls * (1 - drop));
  icon(c, 'shackle', lx, ly, ls, ease.ioc(prog(t, 2.0, 0.6)), { color: locked ? COL.lime : COL.white, lw: 9 });
  c.restore();
  ring(c, lx, ly, t, 3.0, { color: COL.lime, r0: 80, r1: 520, dur: 0.7, lw: 14 });
  ring(c, lx, ly, t, 3.08, { color: COL.amber, r0: 60, r1: 360, dur: 0.6, lw: 8 });
  maskUp(c, 'FACTS v1 · APPROVED', lx, ly + 150, t, 3.2, { size: 26, weight: 800, color: COL.lime, align: 'center', track: 6 });
  wordsIn(c, [{ s: 'The' }, { s: 'model' }, { s: 'writes' }, { s: 'the' }, { s: 'words.' }], W / 2, 952, t, 3.6, { size: 54, align: 'center', st: 0.07 });
  wordsIn(c, [{ s: 'Code' }, { s: 'fills' }, { s: 'the' }, { s: 'numbers.' }], W / 2, 1022, t, 4.15, { size: 54, align: 'center', st: 0.07, color: COL.amber });
}

// asset cells for the 18-up grid
const LANGS = [
  { k: 'kn', name: 'ಕನ್ನಡ', head: 'ಫಿಲ್ಟರ್ ಕಾಫಿ', off: '20% ರಿಯಾಯಿತಿ', days: 'ಶನಿವಾರ, ಭಾನುವಾರ', sun: 'ಭಾನುವಾರ ಮಾತ್ರ' },
  { k: 'hi', name: 'हिंदी', head: 'फ़िल्टर कॉफ़ी', off: '20% छूट', days: 'शनिवार, रविवार', sun: 'सिर्फ़ रविवार' },
  { k: 'en', name: 'English', head: 'Filter coffee', off: '20% OFF', days: 'SAT + SUN · 8–11 AM', sun: 'SUNDAY ONLY · 8–11 AM' },
];
const CHANNELS = [
  { name: 'Instagram', icon: 'insta', bg: COL.amber, fg: COL.ink, acc: COL.ink },
  { name: 'WhatsApp', icon: 'chat', bg: COL.green, fg: COL.white, acc: COL.amber },
  { name: 'Poster', icon: 'poster', bg: COL.ink, fg: COL.paper, acc: COL.amber },
];
const AUD = ['Regulars', 'Office crowd'];
const cellCache = {};
function cellImg(r, col, sunday) {
  const key = `${r}-${col}-${sunday}`;
  if (cellCache[key]) return cellCache[key];
  const cw = 232 * 2, ch = 168 * 2;
  const k = document.createElement('canvas'); k.width = cw; k.height = ch;
  const c = k.getContext('2d'); c.scale(2, 2);
  const L = LANGS[r], CH = CHANNELS[col >> 1], b = col & 1;
  c.fillStyle = b ? mix(CH.bg, '#000000', 0.12) : CH.bg; c.fillRect(0, 0, 232, 168);
  // brand halftone corner
  c.fillStyle = rgba(CH.acc, 0.22);
  for (let y = 0; y < 5; y++) for (let x = 0; x < 6 - y; x++) { c.beginPath(); c.arc(232 - 10 - x * 14, 10 + y * 14, 4.2 - y * 0.6, 0, Math.PI * 2); c.fill(); }
  text(c, `${CH.name.toUpperCase()} · ${AUD[b].toUpperCase()}`, 14, 24, { size: 11, weight: 800, color: rgba(CH.fg === COL.ink ? '#1f1a14' : '#ffffff', 0.7), track: 1.5 });
  const fit = (s, size, w, wt = 900) => { const m = measure(c, s, size, wt); return m > w ? size * w / m : size; };
  text(c, L.head, 14, 66, { size: fit(L.head, 26, 200, 800), weight: 800, color: CH.fg });
  text(c, L.off, 14, 112, { size: fit(L.off, 40, 204), color: CH.acc === COL.ink ? COL.ink : CH.acc });
  const d = sunday ? L.sun : L.days;
  text(c, d, 14, 148, { size: fit(d, 16, 204, 800), weight: 800, color: sunday ? (CH.bg === COL.amber ? COL.ink : COL.lime) : CH.fg });
  return (cellCache[key] = k);
}
function gridGeom(mini) {
  if (!mini) { const cw = 232, ch = 168, g = 14, lw = 200; return { cw, ch, g, lw, x0: (W - (lw + 6 * cw + 5 * g)) / 2, y0: 345 }; }
  const cw = 196, ch = 142, g = 12, lw = 150; return { cw, ch, g, lw, x0: (W - (lw + 6 * cw + 5 * g)) / 2, y0: 410 };
}
function drawGridHeads(c, t, t0, G, light = false) {
  LANGS.forEach((L, r) => maskUp(c, L.name, G.x0, G.y0 + r * (G.ch + G.g) + G.ch / 2 + 18, t, t0 + r * 0.08, { size: G.lw > 160 ? 46 : 36, weight: 800, color: COL.white }));
  for (let col = 0; col < 6; col++) {
    const CH = CHANNELS[col >> 1];
    const x = G.x0 + G.lw + col * (G.cw + G.g);
    icon(c, CH.icon, x + 26, G.y0 - 48, 38, ease.ioc(prog(t, t0 + col * 0.06, 0.6)), { color: col & 1 ? COL.dim : COL.white, lw: 4 });
    maskUp(c, AUD[col & 1], x + 56, G.y0 - 36, t, t0 + 0.1 + col * 0.06, { size: 24, weight: 700, color: COL.dim });
  }
}

function S4(c, T) {
  const t = T - 22;
  bgDark(c, 0.6);
  // kinetic equation
  const out = 2.55;
  const eq = [['3 languages', COL.white], ['×', COL.dim], ['3 channels', COL.white], ['×', COL.dim], ['2 audiences', COL.white]];
  const size = 92;
  const ws = eq.map(([s]) => measure(c, s, size, 900));
  const tot = ws.reduce((a, b) => a + b, 0) + 40 * 4;
  let px = (W - tot) / 2;
  eq.forEach(([s, col], k) => {
    slam(c, s, px + ws[k] / 2, 470, t, 0.15 + k * 0.25, { size, color: col, out: out + k * 0.04, from: 1.8, outY: 380 });
    px += ws[k] + 40;
  });
  const n = Math.round(18 * ease.oc(prog(t, 1.45, 0.6)));
  if (t >= 1.4) slam(c, `= ${n} assets`, W / 2, 650, t, 1.4, { size: 150, color: COL.amber, out: out + 0.2, from: 1.4, outY: 560 });
  // grid
  letters(c, 'One idea. 18 assets.', W / 2, 165, t, 2.65, { size: 76, align: 'center', st: 0.025, colors: [...'One idea. '].map(() => COL.white).concat([...'18 assets.'].map(() => COL.amber)) });
  const G = gridGeom(false);
  drawGridHeads(c, t, 2.8, G);
  for (let r = 0; r < 3; r++) for (let col = 0; col < 6; col++) {
    const x = G.x0 + G.lw + col * (G.cw + G.g), y = G.y0 + r * (G.ch + G.g), idx = r * 6 + col;
    strokeAll(c, [rrPts(x, y, G.cw, G.ch, 14)], ease.ioc(prog(t, 2.95 + idx * 0.025, 0.45)), { color: 'rgba(255,255,255,0.35)', lw: 2 });
    c.save(); c.beginPath(); c.roundRect(x, y, G.cw, G.ch, 14); c.clip();
    dotReveal(c, cellImg(r, col, false), x, y, G.cw, G.ch, prog(t, 3.3 + (r + col) * 0.08, 0.75), idx * 13, 13);
    // shimmer sweep
    const sp = prog(t, 5.9 + (r + col) * 0.05, 0.6);
    if (sp > 0 && sp < 1) {
      const g = c.createLinearGradient(x + lerp(-120, G.cw + 120, sp) - 60, 0, x + lerp(-120, G.cw + 120, sp) + 60, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(x, y, G.cw, G.ch);
    }
    c.restore();
    const bp = ease.ob(prog(t, 4.5 + idx * 0.03, 0.35));
    if (bp > 0) {
      c.save(); c.translate(x + G.cw - 22, y + G.ch - 22); c.scale(bp, bp);
      c.fillStyle = COL.blue; c.beginPath(); c.arc(0, 0, 15, 0, Math.PI * 2); c.fill();
      icon(c, 'check', 0, 0, 22, 1, { color: '#fff', lw: 4 }); c.restore();
    }
  }
  wordsIn(c, [{ s: 'Written natively.' }, { s: 'Back-translated.', c: COL.amber }, { s: 'Checked against the lock.', c: COL.lime }], W / 2, 990, t, 5.2, { size: 44, align: 'center', st: 0.16 });
}

function S5(c, T) {
  const t = T - 30;
  bgLight(c);
  // poster
  const px = 200, py = 170, pw = 560, ph = 740;
  const pk = 'poster5';
  if (!cellCache[pk]) {
    const k = document.createElement('canvas'); k.width = pw; k.height = ph; const q = k.getContext('2d');
    q.fillStyle = COL.ink; q.beginPath(); q.roundRect(0, 0, pw, ph, 26); q.fill();
    q.fillStyle = rgba(COL.amber, 0.18);
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9 - y; x++) { q.beginPath(); q.arc(pw - 24 - x * 30, 24 + y * 30, 10 - y, 0, Math.PI * 2); q.fill(); }
    text(q, 'WEEKEND SPECIAL', 48, 110, { size: 30, weight: 800, color: COL.amber, track: 6 });
    text(q, 'Filter', 48, 230, { size: 110, color: COL.paper });
    text(q, 'coffee', 48, 335, { size: 110, color: COL.paper });
    text(q, '₹50', 48, 560, { size: 200, color: COL.amber });
    text(q, 'SAT + SUN · 8–11 AM', 48, 650, { size: 34, weight: 800, color: COL.paper, track: 2 });
    text(q, 'Dine-in only', 48, 696, { size: 28, weight: 600, color: '#bdb3a5' });
    cellCache[pk] = k;
  }
  dotReveal(c, cellCache[pk], px, py, pw, ph, prog(t, 0.05, 0.75), 77, 22);
  // scan
  const sp = prog(t, 1.0, 0.9);
  if (sp > 0 && sp < 1) {
    const sy = py + sp * ph;
    const g = c.createLinearGradient(0, sy - 120, 0, sy);
    g.addColorStop(0, rgba(COL.blue, 0)); g.addColorStop(1, rgba(COL.blue, 0.35));
    c.fillStyle = g; c.fillRect(px, sy - 120, pw, 120);
    c.fillStyle = COL.blue; c.fillRect(px - 20, sy - 2, pw + 40, 4);
  }
  // price box
  const bx = px + 36, by = py + 400, bw = 370, bh = 190;
  if (t >= 1.55) strokeAll(c, [rrPts(bx, by, bw, bh, 18)], ease.ioc(prog(t, 1.55, 0.3)), { color: COL.red, lw: 8 });
  // right column
  const rx = 880;
  letters(c, 'Wrong price?', rx, 290, t, 0.35, { size: 120, color: COL.ink, st: 0.03 });
  const cp = ease.ob(prog(t, 1.2, 0.5));
  if (cp > 0) {
    c.save(); c.translate(rx, 340 + (1 - cp) * 80); c.globalAlpha = clamp(cp);
    chip(c, 0, 0, 400, 170, 'LOCKED PRICE', '₹48', { fill: '#ffffff', stroke: COL.ink, labelColor: COL.muted, valueColor: COL.ink, vsize: 80 });
    c.restore();
  }
  // connector
  const lp = ease.ioc(prog(t, 1.85, 0.35));
  if (lp > 0) {
    c.save(); c.setLineDash([14, 12]);
    strokeAll(c, [[[bx + bw + 10, by + bh / 2], [rx - 30, by + bh / 2], [rx - 30, 425], [rx - 6, 425]]], lp, { color: COL.red, lw: 5 });
    c.restore();
    const np = ease.ob(prog(t, 2.15, 0.3));
    c.save(); c.translate((bx + bw + rx - 30) / 2 + 10, by + bh / 2); c.scale(np, np);
    c.fillStyle = COL.red; c.beginPath(); c.arc(0, 0, 34, 0, Math.PI * 2); c.fill();
    text(c, '≠', 0, 3, { size: 48, color: '#fff', align: 'center', base: 'middle' });
    c.restore();
  }
  // stamp
  if (t >= 2.5) {
    c.save(); c.translate(px + pw / 2, py + 655);
    const s = lerp(2.6, 1, ease.ob(prog(t, 2.5, 0.28)));
    c.rotate(-0.1); c.scale(s, s); c.globalAlpha = prog(t, 2.5, 0.06);
    c.strokeStyle = COL.red; c.lineWidth = 12; c.beginPath(); c.roundRect(-250, -80, 500, 160, 16); c.stroke();
    c.fillStyle = rgba(COL.red, 0.12); c.fill();
    text(c, 'BLOCKED', 0, 6, { size: 112, color: COL.red, align: 'center', base: 'middle', track: 4 });
    c.restore();
  }
  slam(c, 'Blocked.', rx + 330, 650, t, 2.5, { size: 150, color: COL.red, from: 2.0 });
  // approve button: disabled, cursor bounces off
  const bp = ease.oe(prog(t, 3.0, 0.4));
  if (bp > 0) {
    const shakeX = t > 3.65 && t < 4.0 ? Math.sin((t - 3.65) * 70) * 14 * (1 - (t - 3.65) / 0.35) : 0;
    c.save(); c.globalAlpha = bp; c.translate(rx + shakeX, 740);
    c.fillStyle = '#e2dccf'; c.beginPath(); c.roundRect(0, 0, 330, 92, 46); c.fill();
    text(c, 'Approve', 165, 48, { size: 38, weight: 800, color: '#a59b8d', align: 'center', base: 'middle' });
    c.restore();
    const cu = ease.ioc(prog(t, 3.05, 0.55));
    const cx = lerp(1560, rx + 250, cu), cyy = lerp(1000, 800, cu) + (t > 3.6 && t < 3.7 ? 4 : 0);
    c.save(); c.translate(cx, cyy); c.globalAlpha = bp;
    c.fillStyle = COL.ink; c.strokeStyle = '#fff'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(0, 46); c.lineTo(12, 35); c.lineTo(22, 56); c.lineTo(30, 52); c.lineTo(20, 32); c.lineTo(36, 32); c.closePath(); c.fill(); c.stroke();
    c.restore();
    maskUp(c, '₹50 ≠ locked ₹48. Approve stays off.', rx + 360, 800, t, 3.75, { size: 30, weight: 700, color: COL.red });
  }
  const wr = wordsIn(c, [{ s: 'A' }, { s: 'wrong' }, { s: 'price' }, { s: 'can' }, { s: 'never', c: COL.red }, { s: 'reach' }, { s: 'Approved.' }], W / 2, 1010, t, 4.25, { size: 54, align: 'center', color: COL.ink, st: 0.08 });
  const nvx = wr.left + wr.ws.slice(0, 4).reduce((a, b) => a + b, 0) + wr.gap * 4;
  strokeAll(c, [[[nvx, 1026], [nvx + wr.ws[4], 1026]]], ease.oc(prog(t, 4.9, 0.3)), { color: COL.red, lw: 6 });
}

function S6(c, T) {
  const t = T - 36;
  bgDark(c, 0.7);
  // speech bubble
  const bx = 140, by = 120, bw = 960, bh = 200;
  strokeAll(c, [[...rrPts(bx, by, bw, bh, 40)], [[bx + 120, by + bh], [bx + 80, by + bh + 60], [bx + 190, by + bh]]], ease.ioc(prog(t, 0.1, 0.5)), { color: COL.amber, lw: 6 });
  letters(c, '“Make it Sunday only.”', bx + 60, by + 128, t, 0.35, { size: 78, st: 0.022 });
  // days chip v1 -> v2
  const cx = 1180, cy = 135;
  const cp = ease.ob(prog(t, 0.9, 0.45));
  if (cp > 0) {
    c.save(); c.translate(cx, cy + (1 - cp) * 60); c.globalAlpha = clamp(cp);
    const v2 = t >= 1.68;
    c.fillStyle = v2 ? rgba(COL.amber, 0.16) : 'rgba(255,255,255,0.06)'; c.beginPath(); c.roundRect(0, 0, 600, 170, 22); c.fill();
    strokeAll(c, [rrPts(0, 0, 600, 170, 22)], 1, { color: v2 ? COL.amber : 'rgba(255,255,255,0.55)', lw: 3 });
    text(c, v2 ? 'DAYS · FACTS v2' : 'DAYS · FACTS v1', 30, 50, { size: 26, weight: 700, color: v2 ? COL.amber : COL.dim, track: 6 });
    maskUp(c, 'SAT + SUN', 30, 132, t, 0.9, { size: 72, out: 1.5, outDur: 0.25 });
    if (t < 1.5) strokeAll(c, [[[24, 108], [24 + measure(c, 'SAT +', 72, 900) + 10, 108]]], ease.oc(prog(t, 1.2, 0.25)), { color: COL.red, lw: 8 });
    maskUp(c, 'SUNDAY ONLY', 30, 132, t, 1.68, { size: 72, color: COL.amber });
    c.restore();
  }
  // grid: 6 regenerate, 12 freeze
  const G = gridGeom(true);
  drawGridHeads(c, t, 1.6, G);
  for (let r = 0; r < 3; r++) for (let col = 0; col < 6; col++) {
    const x = G.x0 + G.lw + col * (G.cw + G.g), y = G.y0 + r * (G.ch + G.g), idx = r * 6 + col;
    const hit = col >= 4;
    c.save(); c.beginPath(); c.roundRect(x, y, G.cw, G.ch, 12); c.clip();
    const inP = prog(t, 1.7 + (r + col) * 0.04, 0.5);
    if (!hit) {
      dotReveal(c, cellImg(r, col, false), x, y, G.cw, G.ch, inP, idx * 7, 11);
      const fp = ease.oc(prog(t, 2.6 + idx * 0.03, 0.5));
      if (fp > 0) {
        c.fillStyle = rgba(COL.frost, 0.42 * fp); c.fillRect(x, y, G.cw, G.ch);
        const fg = c.createLinearGradient(x, y, x + G.cw, y + G.ch);
        fg.addColorStop(0, `rgba(255,255,255,${0.35 * fp})`); fg.addColorStop(0.5, 'rgba(255,255,255,0)'); fg.addColorStop(1, `rgba(255,255,255,${0.2 * fp})`);
        c.fillStyle = fg; c.fillRect(x, y, G.cw, G.ch);
      }
    } else {
      const outP = prog(t, 3.0 + r * 0.12 + (col - 4) * 0.08, 0.45);
      const newP = prog(t, 3.4 + r * 0.12 + (col - 4) * 0.08, 0.55);
      if (outP < 1) {
        // old asset dissolves into dots
        if (outP <= 0) dotReveal(c, cellImg(r, col, false), x, y, G.cw, G.ch, inP, idx * 7, 11);
        else dotReveal(c, cellImg(r, col, false), x, y, G.cw, G.ch, 1 - outP, idx * 7 + 3, 11);
      }
      dotReveal(c, cellImg(r, col, true), x, y, G.cw, G.ch, newP, idx * 7 + 5, 11);
    }
    c.restore();
    if (!hit) {
      icon(c, 'snow', x + G.cw - 24, y + 24, 26, ease.ioc(prog(t, 2.7 + idx * 0.03, 0.4)), { color: '#ffffff', lw: 3.5 });
    } else {
      const pulse = prog(t, 2.3, 0.2) * (1 - prog(t, 4.2, 0.3));
      if (pulse > 0) {
        c.save(); c.globalAlpha = pulse * (0.6 + 0.4 * Math.sin(t * 12));
        c.strokeStyle = COL.amber; c.lineWidth = 5; c.beginPath(); c.roundRect(x - 4, y - 4, G.cw + 8, G.ch + 8, 14); c.stroke(); c.restore();
      }
      const np = ease.ob(prog(t, 4.0 + r * 0.1, 0.35));
      if (np > 0) {
        c.save(); c.translate(x + G.cw - 20, y + G.ch - 20); c.scale(np, np);
        c.fillStyle = COL.amber; c.beginPath(); c.arc(0, 0, 13, 0, Math.PI * 2); c.fill();
        text(c, 'v2', 0, 1, { size: 12, weight: 900, color: COL.ink, align: 'center', base: 'middle' }); c.restore();
      }
    }
  }
  slam(c, '6 change.', 640, 1000, t, 4.0, { size: 92, color: COL.amber, from: 2 });
  slam(c, '12 stay frozen.', 1290, 1000, t, 4.5, { size: 92, color: COL.frost, from: 2 });
}

let TEXTDOTS = null;
function textDots() {
  if (TEXTDOTS) return TEXTDOTS;
  const k = document.createElement('canvas'); k.width = W; k.height = H; const q = k.getContext('2d');
  const L = tellLayout(q);
  L.forEach(w => text(q, w.s, w.x, w.y, { size: 250, align: 'center', base: 'middle' }));
  const d = q.getImageData(0, 0, W, H).data;
  const pts = [], step = 13;
  for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) {
    if (d[(y * W + x) * 4 + 3] > 128) {
      let col = COL.white; for (const w of L) if (x > w.x - w.w / 2 - 10 && x < w.x + w.w / 2 + 10) col = w.c;
      pts.push({ x, y, c: col });
    }
  }
  return (TEXTDOTS = pts);
}
function tellLayout(c) {
  const words = [['Tell', COL.white], ['it', COL.white], ['once.', COL.amber]];
  const ws = words.map(([s]) => measure(c, s, 250, 900));
  const gap = 70, tot = ws.reduce((a, b) => a + b, 0) + gap * 2;
  let x = (W - tot) / 2;
  return words.map(([s, col], k) => { const r = { s, c: col, w: ws[k], x: x + ws[k] / 2, y: H / 2 }; x += ws[k] + gap; return r; });
}
function S7(c, T) {
  const t = T - 42;
  bgDark(c, lerp(0.8, 0.3, ease.ioc(prog(t, 2.2, 1.2))));
  const L = tellLayout(c);
  const morph = 1.95;
  if (t < morph) {
    L.forEach((w, k) => {
      slam(c, w.s, w.x, w.y, t, 0.4 + k * 0.5, { size: 250, color: w.c, from: 3, rot: (k - 1) * 0.15 });
      ring(c, w.x, w.y, t, 0.4 + k * 0.5, { color: w.c, r0: 60, r1: 600, dur: 0.6, lw: 12 });
    });
  } else {
    const pts = textDots();
    const LK = lockupLayout(c);
    const n = MARK.length;
    const path = new Path2D(), hot = new Path2D(), wht = new Path2D();
    const f = Math.floor(t * 15);
    pts.forEach((p, k) => {
      const tgt = k % Math.ceil(pts.length / n) === 0 ? MARK[Math.floor(k / Math.ceil(pts.length / n))] : null;
      const d = (p.x / W) * 0.35;
      const q = ease.ioe(prog(t, morph + 0.05 + d, 1.1));
      let x, y, r;
      if (tgt) {
        x = lerp(p.x, LK.mx + tgt.u * LK.size, q); y = lerp(p.y, LK.my + tgt.v * LK.size, q);
        r = lerp(5.8, markDot(tgt, LK.size, 1), q);
      } else {
        const an = hash(k, 11) * Math.PI * 2, sp = 200 + hash(k, 12) * 900;
        x = p.x + Math.cos(an) * sp * ease.oc(q); y = p.y + Math.sin(an) * sp * ease.oc(q);
        r = 5.8 * (1 - q);
      }
      const jit = Math.sin(Math.PI * q) * 18;
      x += (hash(k, f, 1) - 0.5) * jit; y += (hash(k, f, 2) - 0.5) * jit;
      if (r < 0.3) return;
      const tp = tgt ? (q > 0.6 ? path : p.c === COL.amber ? hot : wht) : p.c === COL.amber ? hot : wht;
      tp.moveTo(x + r, y); tp.arc(x, y, r, 0, Math.PI * 2);
    });
    c.fillStyle = COL.white; c.fill(wht); c.fillStyle = COL.amber; c.fill(hot); c.fillStyle = COL.green; c.fill(path);
    drawWordmark(c, t, 3.05, LK, { footer: true });
  }
  const fo = prog(t, 5.35, 0.6);
  if (fo > 0) { c.fillStyle = `rgba(0,0,0,${fo})`; c.fillRect(0, 0, W, H); }
}

const SCENES = [[0, 4, S0], [4, 10, S1], [10, 16, S2], [16, 22, S3], [22, 30, S4], [30, 36, S5], [36, 42, S6], [42, 48, S7]];
const TRANS = { 4: 'dots', 10: 'flow', 16: 'dots', 22: 'flow', 30: 'dots', 36: 'flow', 42: 'dots' };
const TD = { dots: 0.8, flow: 0.9 };
const SCENE_BG = [COL.bg, COL.bg, COL.paper, COL.bg, COL.bg, COL.paper, COL.bg, COL.bg];

// fluid also follows the flow wipes (ink is dragged along the liquid edge)
function flowFronts(T) {
  const out = [];
  for (const cut of [10, 22, 36]) {
    const p = (T - (cut - TD.flow / 2)) / TD.flow;
    if (p < 0 || p > 1) continue;
    const X = flowX(ease.ioc(p));
    for (let k = 0; k < 6; k++) {
      const y = (k + 0.5) / 6;
      out.push({ x: clamp(X / W, 0, 1), y, fx: 260, fy: Math.sin(k * 2 + T * 5) * 60, a: 0.25, b: 0.35 });
    }
  }
  return out;
}
const flowX = e => lerp(-420, W + 420, e);
function flowEdge(T, X, off) {
  const pts = [];
  for (let y = -20; y <= H + 20; y += 20) {
    pts.push([X + off + 110 * Math.sin(y * 0.0055 + T * 5.5) + 55 * Math.sin(y * 0.017 - T * 8) + 22 * Math.sin(y * 0.041 + T * 3), y]);
  }
  return pts;
}
function fillLeftOf(c, pts) {
  c.beginPath(); c.moveTo(-50, -50);
  for (const [x, y] of pts) c.lineTo(x, y);
  c.lineTo(-50, H + 50); c.closePath();
}

// dot cover: halftone grid grows with jitter, sweeping left to right like the mark
function dotCover(c, p, T, color, accent, rev = false) {
  const s = 46, path = new Path2D(), hot = new Path2D(), f = Math.floor(T * 15);
  for (let j = -1, row = 0; j * s * 0.866 < H + s; j++, row++) {
    for (let i = -1; i * s < W + s; i++) {
      const x0 = i * s + (row % 2 ? s / 2 : 0), y0 = j * s * 0.866;
      const d = ((rev ? W - x0 : x0) / W) * 0.5 + hash(i, j, 3) * 0.12 + (1 - y0 / H) * 0.04;
      const rp = clamp((p - d) / 0.38);
      if (rp <= 0) continue;
      const r = s * 0.62 * ease.oc(rp);
      const jit = s * 0.45 * Math.sin(Math.PI * rp);
      const x = x0 + (hash(i, j, f) - 0.5) * jit, y = y0 + (hash(j, i, f + 9) - 0.5) * jit;
      const tgt = hash(i, j, 21) < 0.07 && rp < 1 ? hot : path;
      tgt.moveTo(x + r, y); tgt.arc(x, y, r, 0, Math.PI * 2);
    }
  }
  c.fillStyle = color; c.fill(path); c.fillStyle = accent; c.fill(hot);
}

const bufA = document.createElement('canvas'); bufA.width = W; bufA.height = H;
const bufB = document.createElement('canvas'); bufB.width = W; bufB.height = H;
function drawScene(k, c, T) {
  c.save();
  c.fillStyle = SCENE_BG[k]; c.fillRect(0, 0, W, H);
  const [sx, sy] = shake(T);
  c.translate(sx, sy);
  SCENES[k][2](c, T);
  c.restore();
}
function sceneAt(T) { for (let k = 0; k < SCENES.length; k++) if (T < SCENES[k][1]) return k; return SCENES.length - 1; }

function renderFrame(fi) {
  fluidAdvanceTo(fi);
  const T = fi / FPS;
  for (const cut of Object.keys(TRANS).map(Number)) {
    const type = TRANS[cut], d = TD[type];
    if (T >= cut - d / 2 && T < cut + d / 2) {
      const p = (T - (cut - d / 2)) / d;
      const kOld = sceneAt(cut - 0.001), kNew = sceneAt(cut + 0.001);
      if (type === 'dots') {
        const cover = SCENE_BG[kNew] === COL.paper ? COL.amber : COL.green;
        const accent = cover === COL.green ? COL.amber : COL.green;
        if (p < 0.5) { drawScene(kOld, ctx, T); dotCover(ctx, p * 2 * 1.02, T, cover, accent); }
        else {
          drawScene(kNew, bufA.getContext('2d'), T);
          // shrinking dots reveal the next scene: punch holes = draw next scene clipped to inverse dots
          const q = (p - 0.5) * 2;
          const bc = bufB.getContext('2d');
          bc.clearRect(0, 0, W, H);
          dotCover(bc, 1.02 - q * 1.02 + 0.0001, T, '#000', '#000', true);
          ctx.save(); ctx.drawImage(bufA, 0, 0);
          ctx.restore();
          // recolor: where dots remain, paint cover color
          const tc = bufB.getContext('2d');
          tc.globalCompositeOperation = 'source-in';
          tc.fillStyle = cover; tc.fillRect(0, 0, W, H);
          tc.globalCompositeOperation = 'source-over';
          ctx.drawImage(bufB, 0, 0);
        }
      } else {
        const e = ease.ioc(p), X = flowX(e);
        drawScene(kOld, ctx, T);
        drawScene(kNew, bufA.getContext('2d'), T);
        const lead = SCENE_BG[kNew] === COL.paper ? [COL.amber, COL.green] : [COL.green, COL.amber];
        ctx.save(); fillLeftOf(ctx, flowEdge(T, X, 230)); ctx.fillStyle = lead[0]; ctx.fill(); ctx.restore();
        ctx.save(); fillLeftOf(ctx, flowEdge(T + 0.7, X, 120)); ctx.fillStyle = lead[1]; ctx.fill(); ctx.restore();
        ctx.save(); fillLeftOf(ctx, flowEdge(T + 1.3, X, 0)); ctx.clip(); ctx.drawImage(bufA, 0, 0); ctx.restore();
        // droplets shed from the leading edge
        const edge = flowEdge(T, X, 230);
        for (let k = 0; k < 26; k++) {
          const yi = Math.floor(hash(k, 1) * (edge.length - 1));
          const life = (p * 3 + hash(k, 2)) % 1;
          const x = edge[yi][0] + life * 160 + 20, y = edge[yi][1] + Math.sin(k + T * 4) * 10;
          const r = (1 - life) * (6 + hash(k, 3) * 16);
          ctx.fillStyle = lead[0]; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        }
      }
      return;
    }
  }
  drawScene(sceneAt(T), ctx, T);
}

window.renderFrame = renderFrame;
window.NF = NF;
window.ready = (async () => {
  await Promise.all([document.fonts.load('900 100px "Inter Display"'), document.fonts.load('800 100px KN', 'ಕನ್ನಡ'), document.fonts.load('800 100px DV', 'हिंदी')]);
  const img = new Image(); img.src = 'mark.png'; await img.decode();
  initMark(img);
  return { marks: MARK.length, fonts: [...document.fonts].map(f => f.family + ':' + f.status) };
})();
