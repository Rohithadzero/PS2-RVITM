"""Live check of Kannada speech to text: Gemini speaks a Kannada offer, Groq Whisper transcribes it, we compare.

Needs GEMINI_API_KEY and GROQ_API_KEY in the repo-root .env. Run from apps/api:  python calibration/kannada_stt_probe.py

The audio is synthetic (a clean studio-like voice), so the score is an upper bound: real shop-floor speech with noise and accents
will do worse. Use it to catch a broken key or a regression, then test with native speakers on real recordings.
"""
import asyncio
import base64
import io
import os
import sys
import wave
from difflib import SequenceMatcher
from pathlib import Path

import httpx
import numpy as np
from scipy.signal import resample_poly

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import config, speech  # noqa: E402,F401  (config loads .env)
from app.lab.voice import groq_stt  # noqa: E402

TEXT = "ಈ ವಾರಾಂತ್ಯ ಫಿಲ್ಟರ್ ಕಾಫಿ ಮೇಲೆ ಇಪ್ಪತ್ತು ಶೇಕಡಾ ರಿಯಾಯಿತಿ ಇದೆ. ಶನಿವಾರ ಮತ್ತು ಭಾನುವಾರ, ಬೆಳಿಗ್ಗೆ ಎಂಟರಿಂದ ಹನ್ನೊಂದರವರೆಗೆ."


def speak(text: str) -> bytes:
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not key:
        sys.exit("GEMINI_API_KEY is not set")
    body = {"contents": [{"parts": [{"text": "Say clearly in Kannada: " + text}]}],
            "generationConfig": {"responseModalities": ["AUDIO"],
                                 "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": "Kore"}}}}}
    r = httpx.post("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent",
                   headers={"x-goog-api-key": key}, json=body, timeout=90)
    r.raise_for_status()
    pcm = np.frombuffer(base64.b64decode(r.json()["candidates"][0]["content"]["parts"][0]["inlineData"]["data"]), dtype=np.int16)
    out = resample_poly(pcm.astype(np.float32), 2, 3).astype(np.int16)  # 24 kHz to 16 kHz
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        w.writeframes(out.tobytes())
    return buf.getvalue()


def main() -> None:
    key = os.environ.get("GROQ_API_KEY", "").strip()
    if not key:
        sys.exit("GROQ_API_KEY is not set")
    wav = speak(TEXT)
    heard = asyncio.run(groq_stt.transcribe(wav, "kn", key))
    norm = lambda t: "".join(ch for ch in t if ch.isalnum())
    print("said :", TEXT)
    print("heard:", heard["text"])
    print(f"{heard['latency_ms']} ms, {heard['model']}, character similarity {SequenceMatcher(None, norm(TEXT), norm(heard['text'])).ratio():.2f}")
    print("numbers:", speech.numbers(heard["text"]), "days:", speech.read_days(heard["text"]), "percents:", speech.percents(heard["text"]))


if __name__ == "__main__":
    main()
