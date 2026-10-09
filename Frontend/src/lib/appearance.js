import { useState } from 'react';

// How the app looks on this device: accent colour, surface style and background.
// Kept in localStorage, because it is a per-device preference and not campaign data.
const KEY = 'appearance';

export const ACCENTS = [
  { id: 'marigold', label: 'Marigold', hex: '#f0b429' },
  { id: 'ember', label: 'Ember', hex: '#f26b1d' },
  { id: 'rose', label: 'Rose', hex: '#e0457b' },
  { id: 'violet', label: 'Violet', hex: '#8b5cf6' },
  { id: 'ocean', label: 'Ocean', hex: '#3d7be0' },
  { id: 'teal', label: 'Teal', hex: '#14a89a' },
  { id: 'leaf', label: 'Leaf', hex: '#4caf50' },
];

export const SURFACES = [
  { id: 'glass', label: 'Glass', hint: 'Frosted panels and cards. You see the background through them, and text stays easy to read.' },
  { id: 'clear', label: 'Clear glass', hint: 'More see-through and more blur.' },
  { id: 'solid', label: 'Solid', hint: 'No see-through. Best on slow machines.' },
];

export const BACKDROPS = [
  { id: 'animated', label: 'Moving gradient', hint: 'The colour blobs drift slowly.' },
  { id: 'still', label: 'Still gradient', hint: 'Same colours, no movement.' },
  { id: 'plain', label: 'Plain', hint: 'One soft gradient, no blobs.' },
];

export const DEFAULTS = { accent: '#f0b429', surface: 'glass', backdrop: 'animated' };

const isHex = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

export const readAppearance = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    return {
      accent: isHex(saved.accent) ? saved.accent : DEFAULTS.accent,
      surface: SURFACES.some((s) => s.id === saved.surface) ? saved.surface : DEFAULTS.surface,
      backdrop: BACKDROPS.some((b) => b.id === saved.backdrop) ? saved.backdrop : DEFAULTS.backdrop,
    };
  } catch {
    return { ...DEFAULTS };
  }
};

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const INK = '#1f1a14';

// Text on the accent: ink or white, whichever reads better on that colour.
export const onAccent = (hex) => {
  const l = luminance(hex);
  const withInk = (l + 0.05) / (luminance(INK) + 0.05);
  const withWhite = 1.05 / (l + 0.05);
  return withInk >= withWhite ? INK : '#ffffff';
};

// Hover, deep and soft accent shades are derived in index.css from --color-accent, so only two values are set here.
export const applyAppearance = ({ accent, surface, backdrop }) => {
  const root = document.documentElement;
  root.style.setProperty('--color-accent', accent);
  root.style.setProperty('--color-on-accent', onAccent(accent));
  root.dataset.surface = surface;
  root.dataset.backdrop = backdrop;
};

export const useAppearance = () => {
  const [value, setValue] = useState(readAppearance);
  const update = (patch) => {
    const next = { ...value, ...patch };
    setValue(next);
    applyAppearance(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Storage blocked: the change holds until the page reloads.
    }
  };
  return [value, update];
};
