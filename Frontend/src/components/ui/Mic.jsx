import { useEffect, useRef, useState } from 'react';
import { Mic as MicIcon, Square, Loader2 } from 'lucide-react';

const SpeechRecognition = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
const LOCALE = { en: 'en-IN', hi: 'hi-IN', kn: 'kn-IN' };

// Press and hold to talk, or tap to start and tap again to stop.
// Uses the browser's speech recognition when available; otherwise returns `mockText`.
// Backend version: send the recorded clip to POST /voice (docs/api-spec.md section 3).
const Mic = ({ lang = 'en', onResult, mockText, size = 'lg', label = 'Hold to talk' }) => {
  const [state, setState] = useState('idle'); // idle | listening | processing | denied
  const [interim, setInterim] = useState('');
  const recognition = useRef(null);
  const pressedAt = useRef(0);
  const finalText = useRef('');

  useEffect(() => () => recognition.current?.abort(), []);

  const finish = () => {
    setState('processing');
    const text = finalText.current.trim();
    setTimeout(() => {
      setState('idle');
      setInterim('');
      onResult(text || mockText || '', { provider: text ? 'Browser Web Speech' : 'Demo transcript', latency_ms: 600 });
    }, 500);
  };

  const start = () => {
    finalText.current = '';
    setInterim('');
    setState('listening');
    if (!SpeechRecognition) return;
    try {
      const r = new SpeechRecognition();
      r.lang = LOCALE[lang];
      r.interimResults = true;
      r.continuous = true;
      r.onresult = (e) => {
        let text = '';
        for (const res of e.results) text += res[0].transcript;
        finalText.current = text;
        setInterim(text);
      };
      r.onerror = (e) => {
        if (e.error === 'not-allowed') setState('denied');
      };
      r.start();
      recognition.current = r;
    } catch {
      recognition.current = null;
    }
  };

  const stop = () => {
    recognition.current?.stop();
    recognition.current = null;
    finish();
  };

  // mode: 'pending' while the first press is down, 'tap' after a short press, 'stopping' on the second tap.
  const mode = useRef(null);

  const onPointerDown = () => {
    if (state === 'listening' && mode.current === 'tap') {
      mode.current = 'stopping';
      return;
    }
    if (state === 'idle' || state === 'denied') {
      pressedAt.current = Date.now();
      mode.current = 'pending';
      start();
    }
  };

  const onPointerUp = () => {
    if (mode.current === 'stopping') {
      mode.current = null;
      stop();
    } else if (mode.current === 'pending') {
      const held = Date.now() - pressedAt.current;
      if (held > 350) {
        mode.current = null;
        stop();
      } else {
        mode.current = 'tap';
      }
    }
  };

  const onKeyDown = (e) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    if (state === 'listening') {
      mode.current = null;
      stop();
    } else if (state === 'idle' || state === 'denied') {
      mode.current = 'tap';
      start();
    }
  };

  const listening = state === 'listening';
  const dims = size === 'lg' ? 'size-28' : 'size-20';

  return (
    <div className="flex flex-col items-center gap-4">
      <button
        type="button"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onKeyDown={onKeyDown}
        aria-pressed={listening}
        aria-label={listening ? 'Stop recording' : label}
        className={`voice-mic voice-mic-dark relative grid ${dims} touch-none select-none place-items-center rounded-full ${listening ? 'voice-mic-live' : ''}`}
      >
        {state === 'processing' ? (
          <Loader2 size={size === 'lg' ? 36 : 28} className="animate-spin" />
        ) : listening ? (
          <Square size={size === 'lg' ? 30 : 24} fill="currentColor" />
        ) : (
          <MicIcon size={size === 'lg' ? 40 : 30} />
        )}
      </button>

      <div className="flex h-8 items-center gap-1" aria-hidden="true">
        {Array.from({ length: 24 }, (_, i) => (
          <span
            key={i}
            className={`w-1 rounded-full ${listening ? 'bg-white/80' : 'bg-white/20'}`}
            style={{
              height: listening ? `${20 + Math.abs(Math.sin(i * 1.7)) * 80}%` : '20%',
              animation: listening ? `wave 0.9s ${i * 0.04}s ease-in-out infinite alternate` : 'none',
            }}
          />
        ))}
      </div>

      <p className="text-center text-sm text-white/60" aria-live="polite">
        {state === 'denied'
          ? 'Microphone blocked. Allow it in the browser address bar, or type instead.'
          : state === 'processing'
            ? 'Transcribing…'
            : listening
              ? interim || 'Listening… release or tap again to stop'
              : `${label}, or tap once to start`}
      </p>
    </div>
  );
};


export default Mic;
