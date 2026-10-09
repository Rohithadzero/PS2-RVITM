"""ElevenLabs: the voice. Text to speech (the voice GrowIt talks in) and speech to text (Scribe, which understands every language GrowIt
works in). Both send the text or audio to ElevenLabs, so both sit behind the owner's switch in Settings.

Models: Flash v2.5 is fast (a short reply in well under a second) and covers English, Hindi, Tamil and many others. It does not
cover Kannada, Telugu, Malayalam, Marathi, Bengali, Gujarati or Punjabi, so those use Eleven v3, which does and is a little slower.
The account has a monthly character allowance, so callers keep what they send short.
"""
from __future__ import annotations

import os
import time

import httpx

BASE = "https://api.elevenlabs.io/v1"
KEY_NAMES = ("AGNEZ_ELEVENLABS_API_KEY", "ELEVENLABS_API_KEY")
AGENT_NAMES = ("AGNEZ_AGENT_ID", "ELEVENLABS_AGENT_ID")
DEFAULT_VOICE = "EXAVITQu4vr4xnSDxMaL"  # Sarah: clear and reassuring (a premade voice, available on every plan)
FLASH_LANGS = {"en", "hi", "ta"}  # what Flash v2.5 speaks well among GrowIt's languages
STT_MODEL = "scribe_v1"


class ElevenLabsError(Exception):
    def __init__(self, code: str, message: str, status: int = 502):
        super().__init__(message)
        self.code = code
        self.status = status


def _first(names: tuple[str, ...]) -> str:
    for n in names:
        v = (os.environ.get(n) or "").strip()
        if v:
            return v
    return ""


def api_key() -> str:
    return _first(KEY_NAMES)


def agent_id() -> str:
    return _first(AGENT_NAMES)


def model_for(lang: str) -> str:
    return os.environ.get("ELEVENLABS_MODEL") or ("eleven_flash_v2_5" if lang in FLASH_LANGS else "eleven_v3")


def _fail(r: httpx.Response, what: str) -> ElevenLabsError:
    if r.status_code in (401, 403):
        return ElevenLabsError("elevenlabs_key", f"ElevenLabs refused the key while {what}. Check the key in the server's .env.", 502)
    if r.status_code == 402 or (r.status_code == 401 and "quota" in r.text.lower()):
        return ElevenLabsError("elevenlabs_quota", "The ElevenLabs allowance for this month is used up.", 502)
    if r.status_code == 429:
        return ElevenLabsError("elevenlabs_busy", "ElevenLabs is busy. Try again in a moment.", 429)
    return ElevenLabsError("elevenlabs_failed", f"ElevenLabs said {r.status_code} while {what}.", 502)  # the body can echo request details


async def speak(text: str, lang: str, *, client: httpx.AsyncClient | None = None) -> bytes:
    """MP3 audio of the text. Raises ElevenLabsError."""
    voice = os.environ.get("ELEVENLABS_VOICE_ID") or DEFAULT_VOICE
    model = model_for(lang)
    body: dict = {"text": text, "model_id": model}
    if model == "eleven_flash_v2_5":
        body["language_code"] = lang  # Flash takes the language; v3 works it out from the text
    own = client is None
    client = client or httpx.AsyncClient(timeout=45)
    try:
        r = await client.post(f"{BASE}/text-to-speech/{voice}", params={"output_format": "mp3_44100_64"}, headers={"xi-api-key": api_key()}, json=body)
    except httpx.HTTPError as exc:
        raise ElevenLabsError("elevenlabs_unreachable", f"Could not reach ElevenLabs ({type(exc).__name__}).") from exc
    finally:
        if own:
            await client.aclose()
    if r.status_code != 200:
        raise _fail(r, "speaking")
    return r.content


async def transcribe(audio: bytes, lang: str, *, client: httpx.AsyncClient | None = None, filename: str = "speech.wav", mime: str = "audio/wav") -> dict:
    """Text from speech. Same shape as the other engines."""
    t0 = time.monotonic()
    own = client is None
    client = client or httpx.AsyncClient(timeout=90)
    data = {"model_id": STT_MODEL, "tag_audio_events": "false"}
    if lang and lang != "hinglish":
        data["language_code"] = lang
    try:
        r = await client.post(f"{BASE}/speech-to-text", headers={"xi-api-key": api_key()}, data=data, files={"file": (filename, audio, mime)})
    except httpx.HTTPError as exc:
        raise ElevenLabsError("elevenlabs_unreachable", f"Could not reach ElevenLabs ({type(exc).__name__}).") from exc
    finally:
        if own:
            await client.aclose()
    if r.status_code != 200:
        raise _fail(r, "listening")
    text = (r.json().get("text") or "").strip()
    return {"text": text, "segments": [], "lang": lang, "provider": "elevenlabs", "model": STT_MODEL, "latency_ms": int((time.monotonic() - t0) * 1000)}


async def signed_url(client: httpx.AsyncClient | None = None) -> str:
    """A short-lived address for a live conversation with the ElevenLabs agent, so the browser never holds the key."""
    own = client is None
    client = client or httpx.AsyncClient(timeout=20)
    try:
        r = await client.get(f"{BASE}/convai/conversation/get-signed-url", params={"agent_id": agent_id()}, headers={"xi-api-key": api_key()})
    except httpx.HTTPError as exc:
        raise ElevenLabsError("elevenlabs_unreachable", f"Could not reach ElevenLabs ({type(exc).__name__}).") from exc
    finally:
        if own:
            await client.aclose()
    if r.status_code != 200:
        raise _fail(r, "opening the live agent")
    url = r.json().get("signed_url")
    if not url:
        raise ElevenLabsError("elevenlabs_failed", "ElevenLabs gave no address for the live agent.")
    return url
