"""Vosk speech-to-text adapter (local, offline, free). Implements the STT interface from docs/voice-stack.md.

Languages: en (Indian English by default, US as a second choice) and hi (Devanagari output). There is NO Vosk model
for Kannada and none for Hinglish, so those raise `Unsupported` and the caller falls back to another provider or to
typing. Audio must be WAV; it is converted to 16 kHz mono 16-bit here (box-average downsample, no decimation).

STT output never writes the Offer Facts lock: it becomes an editable transcript (docs/security.md).
"""
from __future__ import annotations

import io
import json
import threading
import time
import wave
from pathlib import Path

from app.config import ROOT

MODELS_DIR = ROOT / "models" / "vosk"
LANG_MODELS = {  # language -> preferred model directories, first installed wins
    "en": ["vosk-model-small-en-in-0.4", "vosk-model-small-en-us-0.15"],
    "en-in": ["vosk-model-small-en-in-0.4"],
    "en-us": ["vosk-model-small-en-us-0.15"],
    "hi": ["vosk-model-small-hi-0.22"],
    "gu": ["vosk-model-small-gu-0.42"],
    "te": ["vosk-model-small-te-0.42"],
}
MIN_WORD_CONF = 0.5  # drop words the model was unsure of (docs/voice.md ConfidentWords)

_cache: dict = {}
_lock = threading.Lock()


class Unsupported(Exception):
    pass


def available_languages() -> dict:
    out = {}
    for lang, names in LANG_MODELS.items():
        for n in names:
            if (MODELS_DIR / n).exists():
                out[lang] = n
                break
    return out


def _model(lang: str):
    if lang in ("kn", "hinglish", "hi-en", "kn-en"):
        raise Unsupported(f"Vosk has no model for '{lang}'. Use another STT provider or type the brief.")
    names = LANG_MODELS.get(lang)
    if not names:
        raise Unsupported(f"No Vosk model configured for '{lang}'")
    for n in names:
        path = MODELS_DIR / n
        if path.exists():
            from vosk import Model  # imported lazily: the app starts without vosk installed
            with _lock:
                if n not in _cache:
                    _cache[n] = Model(str(path))
                return _cache[n], n
    raise Unsupported(f"Vosk model for '{lang}' is not installed. Run apps/api/scripts/get_vosk_models.py")


def _to_16k_mono(wav_bytes: bytes) -> bytes:
    with wave.open(io.BytesIO(wav_bytes)) as w:
        ch, width, rate, frames = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.readframes(w.getnframes())
    if width != 2:
        raise ValueError("WAV must be 16-bit PCM")
    import array
    s = array.array("h")
    s.frombytes(frames)
    if ch > 1:
        s = array.array("h", [sum(s[i:i + ch]) // ch for i in range(0, len(s) - ch + 1, ch)])
    if rate > 16000:
        ratio = rate / 16000.0
        n = int(len(s) / ratio)
        out = array.array("h")
        for i in range(n):
            a, b = int(i * ratio), max(int((i + 1) * ratio), int(i * ratio) + 1)
            seg = s[a:min(b, len(s))]
            out.append(sum(seg) // max(len(seg), 1))
        s = out
    return s.tobytes()


def transcribe(wav_bytes: bytes, lang: str = "en") -> dict:
    """Returns {text, segments:[{start,end,text,conf}], lang, provider, model, latency_ms}."""
    model, name = _model(lang)
    from vosk import KaldiRecognizer
    pcm = _to_16k_mono(wav_bytes)
    t0 = time.monotonic()
    rec = KaldiRecognizer(model, 16000)
    rec.SetWords(True)
    segments = []

    def take(raw: str):
        d = json.loads(raw)
        words = [w for w in d.get("result", []) if w.get("conf", 0) >= MIN_WORD_CONF]
        if not words:
            return
        segments.append({"start": words[0]["start"], "end": words[-1]["end"],
                         "text": " ".join(w["word"] for w in words),
                         "conf": round(sum(w["conf"] for w in words) / len(words), 3)})

    step = 3200  # 100 ms of 16 kHz 16-bit audio
    for i in range(0, len(pcm), step):
        if rec.AcceptWaveform(pcm[i:i + step]):
            take(rec.Result())
    take(rec.FinalResult())
    return {"text": " ".join(s["text"] for s in segments), "segments": segments, "lang": lang, "provider": "vosk",
            "model": name, "latency_ms": int((time.monotonic() - t0) * 1000)}
