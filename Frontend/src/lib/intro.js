// The opening animation: whether it should play, and a way for the rest of the app to wait for it.
// It plays when the site is opened (once per browser tab session). Settings can play it again.
export const INTRO_START = 'growit-intro-start';
export const INTRO_DONE = 'growit-intro-done';
const KEY = 'intro-seen';

let active = false;
export const introActive = () => active;
export const setIntroActive = (v) => {
  active = v;
  if (!v) window.dispatchEvent(new Event(INTRO_DONE));
};

export const shouldPlayIntro = () => {
  try {
    return sessionStorage.getItem(KEY) !== '1' && !new URLSearchParams(window.location.search).has('nointro');
  } catch {
    return false; // storage blocked: do not replay the intro on every load
  }
};

export const markIntroSeen = () => {
  try {
    sessionStorage.setItem(KEY, '1');
  } catch {
    // Storage blocked: it may play again on the next load.
  }
};

export const replayIntro = () => window.dispatchEvent(new Event(INTRO_START));
