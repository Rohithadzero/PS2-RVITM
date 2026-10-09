import { useEffect, useRef } from 'react';
import { Mesh, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, Vector2, Vector3, WebGLRenderer } from 'three';

// A flowing, warped gradient drawn by a small fragment shader on one full-screen triangle pair.
// It draws at a reduced resolution (the blur hides it), pauses while the tab is hidden, stands still for people who ask
// for reduced motion, and removes itself if WebGL is missing so the CSS gradient underneath shows instead.
const SPEED = 0.3;
const SCALE = 0.55; // render at 55% of the screen size, then let the browser stretch it

const VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const FRAG = `
precision mediump float;
varying vec2 vUv;
uniform float uTime;
uniform vec2 uRes;
uniform vec3 uAccent;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.02 + 17.0; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = vUv;
  uv.x *= uRes.x / uRes.y;
  float t = uTime;
  vec2 q = vec2(fbm(uv * 1.6 + vec2(0.0, t * 0.55)), fbm(uv * 1.6 + vec2(5.2, -t * 0.45)));
  vec2 r = vec2(fbm(uv * 2.0 + 3.0 * q + vec2(1.7, 9.2) + t * 0.35), fbm(uv * 2.0 + 3.0 * q + vec2(8.3, 2.8) - t * 0.30));
  float f = fbm(uv * 1.4 + 3.2 * r);

  vec3 ink = vec3(0.105, 0.088, 0.070);
  vec3 ochre = vec3(0.48, 0.35, 0.12);
  vec3 ember = vec3(0.84, 0.55, 0.24);
  vec3 sea = vec3(0.12, 0.30, 0.42);
  vec3 col = mix(ink, ochre, smoothstep(0.15, 0.75, f));
  col = mix(col, sea, smoothstep(0.35, 1.0, length(q)) * 0.55);
  col = mix(col, uAccent, smoothstep(0.45, 0.95, r.x) * 0.55);
  col += ember * smoothstep(0.6, 1.0, f * r.y * 1.6) * 0.35;
  col *= 0.8 + 0.35 * smoothstep(0.0, 1.0, vUv.y);
  gl_FragColor = vec4(col, 1.0);
}`;

const cssAccent = () => {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim();
  const m = /^#?([0-9a-f]{6})$/i.exec(v);
  if (!m) return [0.94, 0.7, 0.16];
  const n = parseInt(m[1], 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

export default function ShaderBackdrop() {
  const host = useRef(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return undefined;
    let renderer;
    try {
      renderer = new WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'low-power' });
    } catch {
      return undefined; // no WebGL: the CSS gradient stays
    }
    const canvas = renderer.domElement;
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    el.appendChild(canvas);

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const uniforms = { uTime: { value: 0 }, uRes: { value: new Vector2(1, 1) }, uAccent: { value: new Vector3(...cssAccent()) } };
    const scene = new Scene();
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    scene.add(new Mesh(new PlaneGeometry(2, 2), new ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms })));

    const resize = () => {
      const w = Math.max(2, Math.floor(window.innerWidth * SCALE));
      const h = Math.max(2, Math.floor(window.innerHeight * SCALE));
      renderer.setPixelRatio(1);
      renderer.setSize(w, h, false);
      uniforms.uRes.value.set(w, h);
    };
    resize();
    window.addEventListener('resize', resize);

    // The accent can change in Settings while this is on screen.
    const watch = new MutationObserver(() => uniforms.uAccent.value.set(...cssAccent()));
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'data-accent'] });

    let raf = 0;
    let last = performance.now();
    const frame = (now) => {
      uniforms.uTime.value += ((now - last) / 1000) * SPEED;
      last = now;
      renderer.render(scene, camera);
      raf = reduced.matches || document.hidden ? 0 : requestAnimationFrame(frame);
    };
    const start = () => {
      cancelAnimationFrame(raf);
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };
    start();
    document.addEventListener('visibilitychange', start);
    reduced.addEventListener?.('change', start);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', start);
      reduced.removeEventListener?.('change', start);
      watch.disconnect();
      scene.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
      renderer.dispose();
      canvas.remove();
    };
  }, []);

  return <div ref={host} className="shader-backdrop" aria-hidden="true" />;
}
