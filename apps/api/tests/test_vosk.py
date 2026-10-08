"""Vosk adapter tests. Skipped when the vosk package or the models are not installed."""
import io
import wave

import pytest

from app.lab.voice import vosk_stt as v


def _silence(seconds=1, rate=16000):
    b = io.BytesIO()
    w = wave.open(b, "wb")
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(rate)
    w.writeframes(b"\x00\x00" * rate * seconds)
    w.close()
    return b.getvalue()


def test_kannada_and_hinglish_are_unsupported_not_guessed():
    for lang in ("kn", "hinglish", "kn-en", "hi-en"):
        with pytest.raises(v.Unsupported):
            v._model(lang)


def test_unknown_language_is_unsupported():
    with pytest.raises(v.Unsupported):
        v._model("xx")


def test_downmix_and_downsample_to_16k_mono():
    b = io.BytesIO()
    w = wave.open(b, "wb")
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(48000)
    w.writeframes(b"\x01\x00\x03\x00" * 4800)  # 0.1 s stereo at 48 kHz
    w.close()
    pcm = v._to_16k_mono(b.getvalue())
    assert len(pcm) == 1600 * 2  # 0.1 s at 16 kHz, 16-bit mono


@pytest.mark.skipif(not v.available_languages(), reason="Vosk models not installed (run scripts/get_vosk_models.py)")
def test_models_load_and_silence_gives_empty_text():
    pytest.importorskip("vosk")
    lang = "en" if "en" in v.available_languages() else next(iter(v.available_languages()))
    r = v.transcribe(_silence(), lang)
    assert r["text"] == "" and r["provider"] == "vosk"
