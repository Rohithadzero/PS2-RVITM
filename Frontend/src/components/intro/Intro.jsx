import { useEffect, useRef, useState } from 'react';

// Opening animation. Idea: a small business starts as scattered dots, ideas and customers everywhere, and GrowIt pulls them into a
// rising arrow. The dots come from the logo itself: the PNG is read once, every coloured pixel on a coarse grid becomes a particle,
// and each particle flies from a random place on the screen to its place in the logo. The arrow builds from the lower left to the
// upper right (the way growth reads), the wordmark follows, the yellow full stop lands last, and the tagline settles under it.
// The finished logo then fades in as the real SVG, so the resting frame is sharp. Move the pointer over it and the dots part and
// come back. At the end the dots scatter again, the dark clears, and the login screen (or the app) is underneath.

const BG = '#010714';
const COLOR = ['#0c9452', '#ffffff', '#ffde59', '#7ed957']; // arrow green, wordmark white, yellow (AI and the full stop), tagline lime
const SAMPLE = 520; // the logo is read at this many pixels square
const STEP = 3; // one particle per STEP x STEP block that holds a logo colour
const SETTLE = 3.3; // seconds until everything has landed
const HOLD = 1.0; // seconds the finished logo stays before it scatters
const EXIT = 0.8; // seconds the scatter and fade take

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeOutExpo = (p) => (p >= 1 ? 1 : 1 - 2 ** (-10 * p));
const easeInCubic = (p) => p * p * p;

// Which logo colour a pixel is, or -1 for the dark background and the soft edges between colours.
const classify = (r, g, b) => {
  if (r + g + b < 130) return -1;
  if (r > 215 && g > 215 && b > 215) return 1;
  if (r > 200 && g > 190 && b < 150) return 2;
  if (g > 190 && r > 90 && r < 190 && b < 150) return 3;
  if (g > 115 && r < 80) return 0;
  return -1;
};

const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = reject;
  img.src = src;
});

async function sampleLogo() {
  const img = await loadImage('/growit-logo.png');
  const c = document.createElement('canvas');
  c.width = SAMPLE;
  c.height = SAMPLE;
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0, SAMPLE, SAMPLE);
  const { data } = cx.getImageData(0, 0, SAMPLE, SAMPLE);
  const pts = [];
  for (let y = 0; y < SAMPLE; y += STEP) {
    for (let x = 0; x < SAMPLE; x += STEP) {
      const i = ((y + (STEP >> 1)) * SAMPLE + x + (STEP >> 1)) * 4;
      const k = classify(data[i], data[i + 1], data[i + 2]);
      if (k >= 0) pts.push({ x: (x + STEP / 2) / SAMPLE, y: (y + STEP / 2) / SAMPLE, k });
    }
  }
  return pts;
}

// One particle's timing, by what it is part of.
const timing = (k, x, y, rnd) => {
  if (k === 0) return { delay: 0.15 + 1.2 * clamp01((x + (1 - y)) / 2) + rnd * 0.18, dur: 1.15 + rnd * 0.4 }; // arrow: lower left to upper right
  if (k === 1) return { delay: 1.45 + 0.7 * x + rnd * 0.12, dur: 0.95 + rnd * 0.3 }; // wordmark, left to right
  if (k === 2) return { delay: 2.05 + 0.45 * x + rnd * 0.1, dur: 0.85 + rnd * 0.2 }; // AI and the full stop
  return { delay: 2.2 + 0.55 * x + rnd * 0.1, dur: 0.85 + rnd * 0.2 }; // tagline
};

export default function Intro({ onDone }) {
  const root = useRef(null);
  const canvas = useRef(null);
  const logo = useRef(null);
  const glow = useRef(null);
  const skipAt = useRef(null);
  const skipBtn = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let dead = false;
    let exitAt = null;
    const finish = () => { if (!dead) { dead = true; cancelAnimationFrame(raf); onDone(); } };

    // Reduced motion, or the logo could not be read: no particles, just the logo, briefly.
    const still = () => {
      const el = root.current;
      const img = logo.current;
      if (!el || !img) return finish();
      img.style.opacity = '1';
      const t1 = setTimeout(() => { el.style.transition = 'opacity .5s'; el.style.opacity = '0'; }, 900);
      const t2 = setTimeout(finish, 1500);
      skipAt.current = () => { clearTimeout(t1); clearTimeout(t2); el.style.transition = 'opacity .25s'; el.style.opacity = '0'; setTimeout(finish, 260); };
    };
    if (reduced) { still(); return () => { dead = true; }; }

    const cv = canvas.current;
    const ctx = cv.getContext('2d');
    let W = 0;
    let H = 0;
    let L = 0;
    let ox = 0;
    let oy = 0;
    let dpr = 1;
    let parts = null;
    const mouse = { x: -9999, y: -9999 };

    const layout = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth;
      H = window.innerHeight;
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      cv.style.width = `${W}px`;
      cv.style.height = `${H}px`;
      L = Math.min(W * 0.92, H * 0.88);
      ox = (W - L) / 2;
      oy = (H - L) / 2;
      const img = logo.current;
      if (img) Object.assign(img.style, { left: `${ox}px`, top: `${oy}px`, width: `${L}px`, height: `${L}px` });
    };
    layout();
    window.addEventListener('resize', layout);

    const onMove = (e) => { mouse.x = e.clientX; mouse.y = e.clientY; };
    window.addEventListener('pointermove', onMove);
    const requestExit = () => { if (exitAt === null) exitAt = performance.now() / 1000; };
    skipAt.current = requestExit;
    const onKey = (e) => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') requestExit(); };
    window.addEventListener('keydown', onKey);

    sampleLogo().then((pts) => {
      if (dead) return;
      const n = pts.length;
      parts = {
        n,
        tx: new Float32Array(n), ty: new Float32Array(n), k: new Uint8Array(n),
        sx: new Float32Array(n), sy: new Float32Array(n), delay: new Float32Array(n), dur: new Float32Array(n), wob: new Float32Array(n),
        dx: new Float32Array(n), dy: new Float32Array(n), vx: new Float32Array(n), vy: new Float32Array(n),
        ex: new Float32Array(n), ey: new Float32Array(n), size: new Float32Array(n),
      };
      pts.forEach((p, i) => {
        const r = Math.random();
        const t = timing(p.k, p.x, p.y, r);
        parts.tx[i] = p.x; parts.ty[i] = p.y; parts.k[i] = p.k;
        parts.delay[i] = t.delay; parts.dur[i] = t.dur; parts.wob[i] = (Math.random() - 0.5) * 2;
        // Start anywhere: most inside the screen, some from beyond its edges.
        if (Math.random() < 0.65) { parts.sx[i] = Math.random() * W; parts.sy[i] = Math.random() * H; }
        else {
          const a = Math.random() * Math.PI * 2;
          const rad = Math.max(W, H) * (0.6 + Math.random() * 0.5);
          parts.sx[i] = W / 2 + Math.cos(a) * rad; parts.sy[i] = H / 2 + Math.sin(a) * rad;
        }
        const a2 = Math.random() * Math.PI * 2;
        const d = Math.max(W, H) * (0.18 + Math.random() * 0.4);
        parts.ex[i] = Math.cos(a2) * d; parts.ey[i] = Math.sin(a2) * d; // where it flies at the end, relative to where it sat
        parts.size[i] = 0.82 + Math.random() * 0.3;
      });
      const t0 = performance.now() / 1000;
      let autoExit = t0 + SETTLE + HOLD;

      const frame = () => {
        if (dead) return;
        const now = performance.now() / 1000;
        const t = now - t0;
        if (exitAt === null && now >= autoExit) exitAt = now;
        const x = exitAt === null ? 0 : clamp01((now - exitAt) / EXIT);
        if (x >= 1) { finish(); return; }

        const cell = (L * STEP) / SAMPLE;
        const base = cell * 0.62;
        const rad = L * 0.085;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        const fade = clamp01(t / 0.6) * (1 - easeInCubic(x));

        // Settle progress drives the glow and the crossfade to the real logo.
        const settled = clamp01((t - (SETTLE - 0.25)) / 0.55);
        if (glow.current) glow.current.style.opacity = String(clamp01(t / 2.4) * 0.9 * (1 - x));
        if (x > 0 && skipBtn.current) skipBtn.current.style.display = 'none';
        if (logo.current) logo.current.style.opacity = String(settled * (1 - clamp01(x * 6)));

        for (let kk = 0; kk < 4; kk++) {
          ctx.fillStyle = COLOR[kk];
          ctx.globalAlpha = fade * (1 - settled * (x === 0 ? 0.85 : 0)); // behind the sharp logo the dots step back, but stay for the pointer effect
          ctx.beginPath();
          for (let i = 0; i < parts.n; i++) {
            if (parts.k[i] !== kk) continue;
            const p = clamp01((t - parts.delay[i]) / parts.dur[i]);
            const e = easeOutExpo(p);
            const wob = (1 - e) * parts.wob[i] * 70;
            let px = parts.sx[i] + (ox + parts.tx[i] * L - parts.sx[i]) * e + wob * (parts.ty[i] - 0.5);
            let py = parts.sy[i] + (oy + parts.ty[i] * L - parts.sy[i]) * e - wob * (parts.tx[i] - 0.5);
            if (p >= 1) {
              // Landed: the pointer pushes dots aside and a spring brings them back.
              const hx = px - mouse.x;
              const hy = py - mouse.y;
              const d2 = hx * hx + hy * hy;
              if (d2 < rad * rad && exitAt === null) {
                const d = Math.sqrt(d2) || 1;
                const f = (1 - d / rad) * 2.6;
                parts.vx[i] += (hx / d) * f; parts.vy[i] += (hy / d) * f;
              }
              parts.vx[i] += -parts.dx[i] * 0.07; parts.vy[i] += -parts.dy[i] * 0.07;
              parts.vx[i] *= 0.86; parts.vy[i] *= 0.86;
              parts.dx[i] += parts.vx[i]; parts.dy[i] += parts.vy[i];
              px += parts.dx[i]; py += parts.dy[i];
            }
            if (x > 0) { const q = easeInCubic(x); px += parts.ex[i] * q; py += parts.ey[i] * q; }
            const r = base * parts.size[i] * (0.4 + 0.6 * clamp01(p * 3 + (p >= 1 ? 1 : 0)));
            ctx.moveTo(px + r, py);
            ctx.arc(px, py, r, 0, Math.PI * 2);
          }
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        if (root.current) root.current.style.backgroundColor = x > 0 ? `rgba(1,7,20,${1 - easeInCubic(clamp01(x * 1.15))})` : BG;
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    }).catch(() => { if (!dead) { setFailed(true); still(); } });

    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', layout);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={root} role="img" aria-label="GrowIt, AI Marketing Studio" className="fixed inset-0 z-[300] overflow-hidden" style={{ backgroundColor: BG }}>
      <div ref={glow} aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-0" style={{ background: 'radial-gradient(60% 55% at 62% 40%, rgba(12,148,82,0.20), transparent 70%)' }} />
      <canvas ref={canvas} aria-hidden="true" className="absolute inset-0" />
      <img ref={logo} src="/growit-logo.svg" alt="" aria-hidden="true" draggable="false" className="pointer-events-none absolute select-none" style={{ opacity: 0, mixBlendMode: 'screen' }} />
      <button
        ref={skipBtn}
        type="button"
        onClick={() => skipAt.current?.()}
        className="absolute bottom-6 right-6 rounded-full px-4 py-2 text-xs font-medium text-white/55 ring-1 ring-white/15 transition-colors hover:text-white hover:ring-white/40 focus-visible:text-white"
      >
        Skip{failed ? '' : ' intro'}
      </button>
    </div>
  );
}
