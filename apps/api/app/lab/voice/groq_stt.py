"""Groq Whisper speech to text (cloud). Used for languages Vosk cannot do, such as Kannada, and only when the owner has
switched Groq on in Settings. The audio leaves this machine, so the toggle is the consent. The transcript is only text for the
owner to correct; it never writes the locked offer facts.
"""
from __future__ import annotations

import time

import httpx

URL = "https://api.groq.com/openai/v1/audio/transcriptions"
MODEL = "whisper-large-v3"
LANGS = {"en": "en", "hi": "hi", "kn": "kn"}


class GroqError(Exception):
    pass


async def transcribe(wav_bytes: bytes, lang: str, api_key: str, *, client: httpx.AsyncClient | None = None) -> dict:
    code = LANGS.get(lang)
    if code is None:
        raise GroqError(f"Groq speech is not set up for '{lang}'.")
    t0 = time.monotonic()
    own = client is None
    client = client or httpx.AsyncClient(timeout=60)
    try:
        r = await client.post(URL, headers={"Authorization": f"Bearer {api_key}"},
                              files={"file": ("speech.wav", wav_bytes, "audio/wav")},
                              data={"model": MODEL, "language": code, "response_format": "json", "temperature": "0"})
    except httpx.HTTPError as exc:
        raise GroqError(f"Could not reach Groq: {type(exc).__name__}") from exc
    finally:
        if own:
            await client.aclose()
    if r.status_code == 429:
        raise GroqError("Groq is rate limiting this key. Try again in a minute.")
    if r.status_code >= 400:
        raise GroqError(f"Groq said {r.status_code}.")  # the body can echo request details, so it is not passed on
    text = (r.json().get("text") or "").strip()
    return {"text": text, "segments": [], "lang": lang, "provider": "groq", "model": MODEL, "latency_ms": int((time.monotonic() - t0) * 1000)}
