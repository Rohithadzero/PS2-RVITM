import { useEffect, useState } from 'react';
import { navigate } from '../../lib/router';
import { SLUG } from './route';

// The campaign the owner is working on. Kept in localStorage so every screen opens on it.
const KEY = 'll-campaign';
const EVT = 'll-campaign-change';

const read = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
};

export const setCurrent = (patch) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...read(), ...patch }));
  } catch {
    // Storage blocked: screens fall back to the campaign in the URL.
  }
  window.dispatchEvent(new Event(EVT));
};

export const useCurrent = () => {
  const [cur, setCur] = useState(read);
  useEffect(() => {
    const on = () => setCur(read());
    window.addEventListener(EVT, on);
    return () => window.removeEventListener(EVT, on);
  }, []);
  return cur;
};

// Route objects (from the campaign components) to the hash router.
export const go = (r) => {
  if (r.name === 'home') return navigate('home');
  if (r.name === 'talk') return navigate(SLUG.talk, r.sid);
  setCurrent({ id: r.id });
  return navigate(SLUG[r.name], r.id);
};
