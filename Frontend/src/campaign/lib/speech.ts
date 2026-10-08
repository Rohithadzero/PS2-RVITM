import { useCallback, useEffect, useRef, useState } from "react";
import { speechLang } from "./format";

type RecResult = { isFinal: boolean; 0: { transcript: string } };
type RecEvent = { resultIndex: number; results: ArrayLike<RecResult> };
type Rec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function recognitionCtor(): (new () => Rec) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function useRecognizer(lang: string, onFinal: (text: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");
  const recRef = useRef<Rec | null>(null);
  const finalRef = useRef("");
  const erroredRef = useRef(false);
  const cbRef = useRef(onFinal);
  cbRef.current = onFinal;

  useEffect(() => setSupported(Boolean(recognitionCtor())), []);

  const stop = useCallback(() => recRef.current?.stop(), []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    setError("");
    setInterim("");
    finalRef.current = "";
    erroredRef.current = false;
    const rec = new Ctor();
    rec.lang = speechLang(lang);
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let live = "";
      let done = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) done += r[0].transcript;
        else live += r[0].transcript;
      }
      finalRef.current = done;
      setInterim((done + " " + live).trim());
    };
    rec.onerror = (e) => {
      const map: Record<string, string> = {
        "not-allowed": "Microphone access is blocked. Allow it in the browser, or type instead.",
        "service-not-allowed": "Speech service is blocked in this browser. Type instead.",
        "no-speech": "I did not hear anything. Tap the mic and try again.",
        "audio-capture": "No microphone found. Type instead.",
        network: "Speech recognition needs a network connection. Type instead.",
        "language-not-supported": "This browser cannot listen in this language. Type instead.",
      };
      erroredRef.current = true;
      if (e.error !== "aborted") setError(map[e.error] || "Speech recognition stopped. Type instead.");
    };
    rec.onend = () => {
      setListening(false);
      const text = finalRef.current.trim();
      setInterim("");
      if (text) cbRef.current(text);
      else if (!erroredRef.current) setError("I did not catch that. Tap the mic and try again, or type instead.");
    };
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setError("Could not start the microphone.");
    }
  }, [lang]);

  useEffect(() => () => recRef.current?.abort(), []);

  return { supported, listening, interim, error, start, stop, clearError: () => setError("") };
}

export function pickVoice(lang: string): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const tag = speechLang(lang).toLowerCase();
  const base = tag.split("-")[0];
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang.toLowerCase().replace("_", "-") === tag) ||
    voices.find((v) => v.lang.toLowerCase().startsWith(base)) ||
    null
  );
}

export function useSpeaker(lang: string) {
  const [available, setAvailable] = useState(false);
  const [hasVoice, setHasVoice] = useState(false);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    setAvailable(true);
    try { setMuted(localStorage.getItem("cv-muted") === "1"); } catch { /* storage blocked */ }
    const refresh = () => setHasVoice(Boolean(pickVoice(lang)));
    refresh();
    window.speechSynthesis.addEventListener?.("voiceschanged", refresh);
    return () => window.speechSynthesis.removeEventListener?.("voiceschanged", refresh);
  }, [lang]);

  const speak = useCallback((text: string, force = false) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    if (muted && !force) return;
    const voice = pickVoice(lang);
    if (!voice) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = voice.lang;
    window.speechSynthesis.speak(u);
  }, [lang, muted]);

  const toggleMute = () => {
    setMuted((m) => {
      const next = !m;
      try { localStorage.setItem("cv-muted", next ? "1" : "0"); } catch { /* ignore */ }
      if (next) window.speechSynthesis?.cancel();
      return next;
    });
  };

  return { available, hasVoice, muted, speak, toggleMute };
}
