import { useCallback, useEffect, useRef, useState } from 'react';
import { API_URL, api } from '../../campaign/lib/api';
import { pickVoice } from '../../campaign/lib/speech';

// The voice out for Talk. One thing speaks at a time, and speak() gives back a promise that settles when it has finished (true) or
// was cut off (false), so a conversation can wait for the voice before it listens.
//   server   Gemini, when switched on in Settings: every language, one consistent voice. Audio is cached, so "say it again" is instant.
//   browser  the voice built into the browser: free and offline, quality depends on the device.
// If the server voice is off or fails, the browser's voice is used and the screen says which one spoke.

const cache = new Map(); // `${lang}|${text}` -> Blob
const MAX_CACHE = 40;

export function useTalkVoice() {
  const [speaking, setSpeaking] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [engine, setEngine] = useState('browser');
  const [serverOn, setServerOn] = useState(null); // null until /languages answers
  const current = useRef({ id: 0, audio: null, settle: null });

  useEffect(() => {
    let live = true;
    api('/languages').then((r) => live && setServerOn(r.languages?.[0]?.tts === 'gemini')).catch(() => live && setServerOn(false));
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

  const viaServer = useCallback(async (text, lang, id) => {
    const key = `${lang}|${text}`;
    let blob = cache.get(key);
    if (!blob) {
      setPreparing(true);
      try {
        const r = await fetch(`${API_URL}/tts`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: text.slice(0, 600), lang }) });
        if (!r.ok) return null;
        blob = await r.blob();
      } catch {
        return null;
      } finally {
        setPreparing(false);
      }
      if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
      cache.set(key, blob);
    }
    if (current.current.id !== id) return false; // cut off while the audio was being made
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    current.current.audio = audio;
    return new Promise((resolve) => {
      current.current.settle = resolve;
      const done = (ok) => { URL.revokeObjectURL(url); resolve(ok); };
      audio.onended = () => done(true);
      audio.onerror = () => done(null);
      audio.play().catch(() => done(null));
    });
  }, []);

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
    let outcome = null;
    if (serverOn) {
      outcome = await viaServer(text, lang, id);
      if (outcome !== null) setEngine('gemini');
    }
    if (outcome === null && current.current.id === id) {
      outcome = await viaBrowser(text, lang, id);
      if (outcome !== null) setEngine('browser');
    }
    if (current.current.id === id) {
      current.current.settle = null;
      setSpeaking(false);
    }
    return outcome;
  }, [serverOn, stop, viaServer, viaBrowser]);

  return { speak, stop, speaking, preparing, engine, serverOn };
}
