import { useCallback, useEffect, useRef, useState } from 'react';
import { API_URL, api } from '../../campaign/lib/api';
import { pickVoice } from '../../campaign/lib/speech';
import { pieces } from './speechText';

// The voice out for Talk. One thing speaks at a time, and speak() gives back a promise that settles when it has finished (true) or
// was cut off (false), so a conversation can wait for the voice before it listens.
//   server   ElevenLabs (or Gemini) through the app's /tts, when switched on in Settings. A reply is cut into sentence-sized pieces that
//            are all requested at once, so the first piece starts playing while the rest are still being made. Audio is cached.
//   browser  the voice built into the browser: free and offline, quality depends on the device.
// If the server voice is off or fails, the browser's voice takes over from where it stopped. Only the first MAX_SPOKEN characters of a
// reply are spoken (the whole reply is always on screen): the voice account has a monthly allowance, and long speeches are slow to hear.

const cache = new Map(); // `${lang}|${text}` -> { blob, engine }
const MAX_CACHE = 60;
export function useTalkVoice() {
  const [speaking, setSpeaking] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [engine, setEngine] = useState('browser');
  const [serverOn, setServerOn] = useState(null); // null until /languages answers
  const current = useRef({ id: 0, audio: null, settle: null });

  useEffect(() => {
    let live = true;
    api('/languages').then((r) => live && setServerOn(r.languages?.[0]?.tts !== 'browser')).catch(() => live && setServerOn(false));
    return () => { live = false; };
  }, []);

  const stop = useCallback(() => {
    const c = current.current;
    c.id += 1;
    c.audio?.pause();
    c.audio = null;
    window.speechSynthesis?.cancel();
    c.settle?.(false);
    c.settle = null;
    setSpeaking(false);
    setPreparing(false);
  }, []);

  useEffect(() => stop, [stop]);

  // One piece of server audio, from the cache or the server. Resolves to { blob, engine } or null.
  const fetchPiece = useCallback(async (text, lang) => {
    const key = `${lang}|${text}`;
    if (cache.has(key)) return cache.get(key);
    try {
      const r = await fetch(`${API_URL}/tts`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, lang }) });
      if (!r.ok) return null;
      const got = { blob: await r.blob(), engine: r.headers.get('X-TTS-Engine') || 'server' };
      if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
      cache.set(key, got);
      return got;
    } catch {
      return null;
    }
  }, []);

  const play = useCallback((blob, id) => new Promise((resolve) => {
    if (current.current.id !== id) return resolve(false);
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    current.current.audio = audio;
    current.current.settle = resolve;
    const done = (ok) => { URL.revokeObjectURL(url); resolve(ok); };
    audio.onended = () => done(true);
    audio.onerror = () => done(null);
    audio.play().catch(() => done(null));
  }), []);

  const viaBrowser = useCallback((text, lang, id) => new Promise((resolve) => {
    try {
      const synth = window.speechSynthesis;
      const voice = pickVoice(lang);
      if (!synth || !voice) return resolve(null);
      const u = new SpeechSynthesisUtterance(text);
      u.voice = voice;
      u.lang = voice.lang;
      current.current.settle = resolve;
      u.onend = () => resolve(true);
      u.onerror = () => resolve(current.current.id === id ? null : false);
      synth.cancel();
      synth.speak(u);
    } catch {
      resolve(null); // a browser that refuses to speak must not stall the conversation: the text is on screen
    }
  }), []);

  // Resolves true when finished, false when cut off, null when no voice could speak it (the text is still on screen).
  const speak = useCallback(async (text, lang = 'en') => {
    if (!text) return true;
    stop();
    const id = current.current.id;
    setSpeaking(true);
    let rest = null; // what the browser's voice should say, if the server voice could not
    if (serverOn) {
      const parts = pieces(text);
      const fetched = parts.map((p) => fetchPiece(p, lang)); // all requested now; they arrive while the first one plays
      setPreparing(true);
      for (let i = 0; i < parts.length; i++) {
        const got = await fetched[i];
        if (i === 0) setPreparing(false);
        if (current.current.id !== id) return false;
        const ok = got ? await play(got.blob, id) : null;
        if (ok === false) return false;
        if (ok === null) { rest = parts.slice(i).join(' '); break; }
        setEngine(got.engine);
      }
      if (rest === null) {
        if (current.current.id === id) { current.current.settle = null; setSpeaking(false); }
        return true;
      }
    }
    let outcome = null;
    if (current.current.id === id) {
      outcome = await viaBrowser(rest ?? text, lang, id);
      if (outcome !== null) setEngine('browser');
    }
    if (current.current.id === id) {
      current.current.settle = null;
      setSpeaking(false);
    }
    return outcome;
  }, [serverOn, stop, fetchPiece, play, viaBrowser]);

  return { speak, stop, speaking, preparing, engine, serverOn };
}
