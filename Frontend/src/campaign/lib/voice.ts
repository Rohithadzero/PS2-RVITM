import { useCallback, useEffect, useRef, useState } from "react";
import { API_URL, api } from "./api";
import { recordingSupported, startRecording, type Recording } from "./recorder";
import { useRecognizer } from "./speech";

// One microphone hook for every screen. It picks the engine:
//   browser  the browser's own speech recognition (live words as you talk, nothing is uploaded by this app)
//   server   record, send the audio to this app's /stt, get text back (Vosk offline for English and Hindi, Groq for Kannada)
// Kannada goes to the server when Groq is on: browser recognition for Kannada is unreliable and Vosk has no Kannada model.
// The owner can force an engine in Settings. The transcript is only text to correct; it never writes locked facts.

export type VoicePref = "auto" | "server" | "browser";
const PREF_KEY = "ll-voice-engine";
export const readVoicePref = (): VoicePref => {
  try { const v = localStorage.getItem(PREF_KEY); return v === "server" || v === "browser" ? v : "auto"; } catch { return "auto"; }
};
export const saveVoicePref = (v: VoicePref) => { try { localStorage.setItem(PREF_KEY, v); } catch { /* storage blocked */ } };

type Engines = { engines: Record<string, string | null>; groq: { active: boolean } };

const SERVER_ERRORS: Record<string, string> = {
  stt_unsupported: "This language cannot be transcribed on this server. Type instead.",
  groq_failed: "The Kannada speech service did not answer. Try again in a moment, or type instead.",
  audio_too_large: "That recording was too long. Keep each answer under a minute.",
  bad_audio: "The recording could not be read. Try again, or type instead.",
};

export function useVoiceInput(lang: string, onFinal: (text: string) => void) {
  const browser = useRecognizer(lang, onFinal);
  const [engines, setEngines] = useState<Engines | null>(null);
  const [pref, setPref] = useState<VoicePref>(readVoicePref);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const recRef = useRef<Recording | null>(null);
  const cbRef = useRef(onFinal);
  cbRef.current = onFinal;

  useEffect(() => {
    let live = true;
    api<Engines>("/stt/languages").then((e) => live && setEngines(e)).catch(() => live && setEngines(null));
    const sync = () => setPref(readVoicePref());
    window.addEventListener("storage", sync);
    return () => { live = false; window.removeEventListener("storage", sync); };
  }, []);

  const serverOk = recordingSupported() && Boolean(engines?.engines?.[lang]);
  const engine: "browser" | "server" | null = (() => {
    if (pref === "server" && serverOk) return "server";
    if (pref === "browser") return browser.supported ? "browser" : null;
    if (lang === "kn" && serverOk) return "server";
    if (browser.supported) return "browser";
    return serverOk ? "server" : null;
  })();

  useEffect(() => {
    if (!recording) return undefined;
    setSeconds(0);
    const t = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [recording]);

  useEffect(() => () => recRef.current?.cancel(), []);

  const finish = useCallback(async () => {
    const rec = recRef.current;
    recRef.current = null;
    setRecording(false);
    if (!rec) return;
    setTranscribing(true);
    try {
      const wav = await rec.stop();
      if (!wav) { setError("I did not catch that. Tap the mic and try again, or type instead."); return; }
      const form = new FormData();
      form.append("audio", wav, "speech.wav");
      form.append("lang", lang);
      let response: Response;
      try {
        response = await fetch(`${API_URL}/stt`, { method: "POST", body: form, credentials: "include" });
      } catch {
        setError("Cannot reach the server. Type instead.");
        return;
      }
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const code = body?.detail?.code as string | undefined;
        setError((code && SERVER_ERRORS[code]) || body?.detail?.message || "Speech recognition failed. Type instead.");
        return;
      }
      const text = String(body?.text || "").trim();
      if (!text) setError(body?.silent ? "I did not hear anything. Tap the mic and try again." : "I did not catch that. Tap the mic and try again, or type instead.");
      else cbRef.current(text);
    } finally {
      setTranscribing(false);
    }
  }, [lang]);

  const start = useCallback(async () => {
    if (engine === "browser") { setError(""); browser.start(); return; }
    if (engine !== "server") return;
    setError("");
    window.speechSynthesis?.cancel();
    try {
      recRef.current = await startRecording(() => { void finish(); });
      setRecording(true);
    } catch (e) {
      const name = (e as DOMException)?.name;
      setError(name === "NotAllowedError" ? "Microphone access is blocked. Allow it in the browser, or type instead."
        : name === "NotFoundError" ? "No microphone found. Type instead." : "Could not start the microphone.");
    }
  }, [engine, browser, finish]);

  const stop = useCallback(() => {
    if (engine === "browser") browser.stop();
    else void finish();
  }, [engine, browser, finish]);

  const live = engine === "browser";
  return {
    supported: engine !== null,
    engine,
    listening: live ? browser.listening : recording,
    transcribing,
    interim: live ? browser.interim : transcribing ? "Transcribing" : recording ? `Recording ${seconds}s` : "",
    error: live ? browser.error || error : error,
    start,
    stop,
    clearError: () => { setError(""); browser.clearError(); },
    note: engine === "server" && engines?.engines?.[lang] === "groq" ? "This is sent to Groq to be transcribed. You can switch that off in Settings." : "",
  };
}
