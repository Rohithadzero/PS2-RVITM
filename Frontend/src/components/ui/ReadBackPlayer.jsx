import { useEffect, useRef, useState } from 'react';
import { Play, Pause, Volume2 } from 'lucide-react';
import { ProviderChip } from './index';
import { API_URL } from '../../campaign/lib/api';
import { speechLang } from '../../campaign/lib/format';

// Plays the template-generated read-back and shows the exact words spoken.
// Backend version: POST /tts/readback returns { audio_url, script_text } (docs/api-spec.md section 3).
// Until then the browser's speech synthesis reads the script.
const ReadBackPlayer = ({ script, lang = 'en', onPlayed }) => {
  const [playing, setPlaying] = useState(false);
  const [played, setPlayed] = useState(false);
  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const audio = useRef(null);

  useEffect(() => () => { audio.current?.pause(); if (canSpeak) window.speechSynthesis.cancel(); }, [canSpeak]);

  const finished = () => { setPlaying(false); setPlayed(true); onPlayed?.(); };

  // The server voice (Gemini, when switched on in Settings) speaks every language. Anything else falls back to the browser's voice.
  const serverVoice = async () => {
    try {
      const r = await fetch(`${API_URL}/tts`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: script.slice(0, 600), lang }) });
      if (!r.ok) return false;
      const url = URL.createObjectURL(await r.blob());
      const a = new Audio(url);
      audio.current = a;
      a.onended = () => { URL.revokeObjectURL(url); finished(); };
      a.onerror = () => setPlaying(false);
      await a.play();
      return true;
    } catch {
      return false;
    }
  };

  const toggle = async () => {
    if (playing) {
      audio.current?.pause();
      if (canSpeak) window.speechSynthesis.cancel();
      setPlaying(false);
      return;
    }
    setPlaying(true);
    if (await serverVoice()) return;
    if (!canSpeak) {
      setPlaying(false);
      setPlayed(true);
      onPlayed?.();
      return;
    }
    const u = new SpeechSynthesisUtterance(script);
    u.lang = speechLang(lang);
    u.rate = 0.95;
    u.onend = () => {
      setPlaying(false);
      setPlayed(true);
      onPlayed?.();
    };
    u.onerror = () => setPlaying(false);
    setPlaying(true);
    window.speechSynthesis.speak(u);
  };

  return (
    <div className="rounded-2xl bg-ink p-4 text-white">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-on-accent hover:bg-accent-hover"
          aria-label={playing ? 'Pause read-back' : 'Play read-back'}
        >
          {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="translate-x-px" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Volume2 size={14} /> Read-back {played && <span className="font-normal text-white/55">played</span>}
          </p>
          <p className="text-xs text-white/55">Exact words spoken:</p>
        </div>
        <ProviderChip name={canSpeak ? 'Browser speech' : 'No audio, on-screen only'} />
      </div>
      <p lang={lang} className="mt-3 rounded-xl bg-white/8 p-3 text-sm leading-relaxed">
        “{script}”
      </p>
    </div>
  );
};

export default ReadBackPlayer;
