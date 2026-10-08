// Real (not mock) brand maths and rendering that run in the browser: WCAG contrast and starter logo marks.

const hex = (h) => {
  const v = h.replace('#', '');
  const n = v.length === 3 ? v.split('').map((c) => c + c).join('') : v;
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
};

const lum = ([r, g, b]) => {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

export const isHex = (h) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(h);

// WCAG 2.2 contrast ratio between two hex colours.
export const contrast = (a, b) => {
  if (!isHex(a) || !isHex(b)) return 0;
  const [x, y] = [lum(hex(a)), lum(hex(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

export const grade = (ratio) => (ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : ratio >= 3 ? 'AA large only' : 'Fails');

export const initials = (name) =>
  name.replace(/[^A-Za-zऀ-ॿಀ-೿ ]/g, '').split(' ').filter(Boolean).slice(0, 2).map((w) => [...w][0].toUpperCase()).join('') || '?';

// Three starter marks made locally from the initials and palette. Placeholders for a real logo service.
export const LogoMark = ({ name, palette, variant = 0, size = 72 }) => {
  const text = initials(name);
  const common = { width: size, height: size, viewBox: '0 0 72 72', role: 'img', 'aria-label': `Starter logo ${variant + 1} for ${name}` };
  const label = (fill) => (
    <text x="36" y="45" textAnchor="middle" fontSize="26" fontWeight="700" fontFamily="Poppins, Noto Sans, sans-serif" fill={fill}>{text}</text>
  );
  if (variant === 0) return (
    <svg {...common}><circle cx="36" cy="36" r="34" fill={palette.accent} />{label(palette.bg)}</svg>
  );
  if (variant === 1) return (
    <svg {...common}><rect x="2" y="2" width="68" height="68" rx="16" fill={palette.soft} stroke={palette.accent} strokeWidth="3" />{label(palette.accent)}</svg>
  );
  return (
    <svg {...common}><rect x="2" y="2" width="68" height="68" rx="34" fill={palette.ink} /><circle cx="36" cy="36" r="27" fill="none" stroke={palette.accent} strokeWidth="3" />{label(palette.bg)}</svg>
  );
};
