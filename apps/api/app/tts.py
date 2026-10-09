"""tts: read text aloud, in any language GrowIT knows. And the list of languages with what speech each one has right now.

Voice out has two engines:
  gemini   Google's Gemini text-to-speech, used when the owner has switched Gemini on in Settings. The text leaves this machine, so the
           switch is the consent. It speaks any of the registered languages and returns a WAV.
  browser  the voice built into the browser. Used when Gemini is off or fails. The screen decides; this module only says what is available.

Voice in (speech to text) is chosen in extras.stt_engines: offline Vosk when a model is installed, else Groq Whisper when switched on,
else the browser's own mic. /languages shows both for every language, so the screen can say honestly what will happen.
"""
from __future__ import annotations

import base64
import io
import os
import wave

import httpx
from fastapi import APIRouter, Request, Response
from pydantic import BaseModel, Field

from app import extras, languages
from app.db import Database
from app.lab.voice import vosk_stt
from app.media import fail

router = APIRouter()

MODEL = "gemini-2.5-flash-preview-tts"
URL = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent"
VOICE = "Kore"
MAX_CHARS = 600
SAMPLE_RATE = 24000  # Gemini returns raw 16-bit mono PCM at 24 kHz


def ensure_schema(db: Database) -> None:
    """Nothing to create."""


def wav_from_pcm(pcm: bytes, rate: int = SAMPLE_RATE) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm)
    return buf.getvalue()


def tts_engine(db: Database) -> str:
    return "gemini" if extras.toggle_state(db, "gemini")["active"] else "browser"


def public_languages(db: Database) -> list[dict]:
    engines = extras.stt_engines(db)
    out = []
    for l in languages.LANGUAGES:
        stt = engines.get(l["code"])
        out.append({"code": l["code"], "name": l["name"], "native": l["native"], "locale": l["locale"], "tier": l["tier"],
                    "stt": stt or "browser", "stt_cloud": stt == "groq", "tts": tts_engine(db),
                    "note": "Draft: the words used to check this language have not been read by a native speaker yet." if l["tier"] == "draft" else None})
    return out


@router.get("/languages")
def list_languages(request: Request) -> dict:
    db: Database = request.app.state.db
    return {"languages": public_languages(db), "vosk_installed": sorted(vosk_stt.available_languages()),
            "note": "Speech to text: offline Vosk if its model is installed, else Groq Whisper when switched on, else your browser's mic. Text to speech: Gemini when switched on, else your browser's voice."}


class SpeakIn(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_CHARS)
    lang: str = Field(default="en", max_length=8)


@router.post("/tts")
async def speak(body: SpeakIn, request: Request) -> Response:
    """Audio for a short text. 409 tts_off when Gemini is not switched on: the screen then uses the browser's voice."""
    db: Database = request.app.state.db
    lang = languages.get(body.lang)
    if lang is None:
        raise fail("bad_lang", "That language is not supported.", 422)
    if not extras.toggle_state(db, "gemini")["active"]:
        raise fail("tts_off", "Server voices are off. Switch Gemini on in Settings, or use your browser's voice.", 409)
    prompt = f"Say this in {lang['name']}, clearly and at a natural pace: {body.text}"
    payload = {"contents": [{"parts": [{"text": prompt}]}],
               "generationConfig": {"responseModalities": ["AUDIO"], "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": VOICE}}}}}
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post(URL, headers={"x-goog-api-key": os.environ["GEMINI_API_KEY"].strip()}, json=payload)
    except httpx.HTTPError as exc:
        raise fail("tts_unreachable", f"Could not reach the voice service ({type(exc).__name__}).", 502) from exc
    if r.status_code == 429:
        raise fail("tts_rate_limited", "The voice service is busy. Try again in a minute, or use your browser's voice.", 429)
    if r.status_code >= 400:
        raise fail("tts_failed", f"The voice service said {r.status_code}.", 502)  # the body can echo request details, so it is not passed on
    try:
        data = r.json()["candidates"][0]["content"]["parts"][0]["inlineData"]["data"]
        pcm = base64.b64decode(data)
    except (KeyError, IndexError, ValueError):
        raise fail("tts_failed", "The voice service gave no audio for that text.", 502) from None
    return Response(wav_from_pcm(pcm), media_type="audio/wav", headers={"Cache-Control": "no-store", "X-TTS-Engine": "gemini"})
