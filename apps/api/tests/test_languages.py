"""Language registry: every language has what the fact checker needs, the checker catches wrong facts in the new scripts, speech routing."""
import base64
import wave
import io

import httpx
import pytest

from app import extras, languages, prompts, tts, validator
from app.schemas import OfferFacts
from b_helpers import make_client

NEW = [l["code"] for l in languages.LANGUAGES if l["tier"] == "draft"]


def test_registry_is_complete_and_consistent():
    assert len(languages.CODES) == len(set(languages.CODES)) >= 10
    assert set(NEW) == {"ta", "te", "ml", "mr", "bn", "gu", "pa"}
    for l in languages.LANGUAGES:
        assert l["name"] and l["native"] and l["locale"].endswith("-IN") or l["code"] == "en"
        assert l["groq"] == l["code"]
        assert set(l["ui"]) == {"order", "menu", "about", "hours", "hello", "map", "off"}, l["code"]
        assert "{name}" in l["ui"]["hello"]
        if l["tier"] == "draft":  # Hindi and Kannada keep their word lists in the fact checker itself
            lo, hi = l["script"]
            assert len(l["days"]) == 7 and all(w for d in l["days"] for w in d), l["code"]
            assert all(lo <= ord(ch) <= hi for d in l["days"] for w in d for ch in w if ch.isalpha() or ord(ch) > 0x900), l["code"]
    for l in languages.LANGUAGES:
        if l["tier"] == "draft":
            assert l["percent"] and l["rupee"] and l["free"]


FACTS = OfferFacts(item="filter coffee", discount_percent=20, price_amount=48, timings="8 am to 11 am", dates=[], audiences=["regulars"], languages=["en"], channels=["whatsapp"],
                   terms=None)


@pytest.mark.parametrize("code", NEW)
def test_the_checker_reads_weekdays_in_every_new_script(code):
    tuesday = languages.day_words(code, "tuesday")[0]
    assert "tuesday" in validator._days_in(f"Offer on {tuesday} only")
    sunday = languages.day_words(code, "sunday")[0]
    assert "sunday" in validator._days_in(sunday)


@pytest.mark.parametrize("code", NEW)
def test_percent_rupee_and_free_words_are_caught(code):
    l = languages.get(code)
    assert validator._percents(f"20 {l['percent'][0]} off")  # a percent written in words is still a percent
    assert validator.PERCENT_RE.search("20%")
    assert validator.PRICE_RE.search(f"48 {l['rupee'][0]}")
    assert validator.FREE_RE.search(f"coffee {l['free'][0]}")


def test_a_wrong_percent_in_tamil_is_blocked_and_a_right_one_passes():
    ok = validator.validate_content("வடிகட்டி காபி 20 சதவீதம் தள்ளுபடி, 8 am to 11 am", FACTS)
    bad = validator.validate_content("வடிகட்டி காபி 30 சதவீதம் தள்ளுபடி, 8 am to 11 am", FACTS)
    assert not bad.ok and any("30" in m for m in bad.messages())
    assert not any("20" in m for m in ok.messages()) or ok.ok


def test_a_wrong_weekday_in_marathi_is_blocked():
    facts = OfferFacts(item="coffee", discount_percent=20, dates=[], timings="Saturday only", audiences=["regulars"], languages=["mr"], channels=["whatsapp"])
    res = validator.validate_content("कॉफी 20% सूट, रविवार", facts)
    assert not res.ok


def test_the_writer_is_told_each_language_own_weekday_spelling():
    facts = OfferFacts(item="coffee", dates=[], timings="Tuesday only", audiences=["regulars"], languages=["mr"], channels=["whatsapp"])
    assert prompts.day_names(facts, "mr")[0] == "मंगळवार"  # Marathi, not the Hindi मंगलवार that shares its script
    assert prompts.day_names(facts, "hi")[0] == "मंगलवार"


def test_schema_accepts_new_languages_and_refuses_unknown():
    assert OfferFacts(item="x", audiences=["a"], languages=["ta", "en"]).languages == ["ta", "en"]
    with pytest.raises(ValueError):
        OfferFacts(item="x", audiences=["a"], languages=["xx"])


def test_stt_engine_per_language_follows_the_switches(tmp_path, monkeypatch):
    app, c = make_client(tmp_path)
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    off = extras.stt_engines(app.state.db)
    assert set(off) == set(languages.CODES) and off["ta"] is None
    monkeypatch.setenv("GROQ_API_KEY", "k")
    on = extras.stt_engines(app.state.db)
    assert on["ta"] == "groq" and on["kn"] == "groq"
    out = c.get("/languages").json()
    assert {x["code"] for x in out["languages"]} == set(languages.CODES)
    ta = [x for x in out["languages"] if x["code"] == "ta"][0]
    assert ta["stt"] == "groq" and ta["stt_cloud"] and ta["tts"] == "browser" and "Draft" in ta["note"]


class FakeGemini:
    calls = []

    def __init__(self, *a, **k):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def post(self, url, headers=None, json=None):
        FakeGemini.calls.append((url, json))
        pcm = b"\x01\x00" * 2400
        return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"inlineData": {"data": base64.b64encode(pcm).decode()}}]}}]})


def test_tts_is_off_until_gemini_is_on_then_returns_a_wav(tmp_path, monkeypatch):
    app, c = make_client(tmp_path)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    r = c.post("/tts", json={"text": "hello", "lang": "ta"})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "tts_off"
    monkeypatch.setenv("GEMINI_API_KEY", "g-key")
    monkeypatch.setattr(tts.httpx, "AsyncClient", FakeGemini)
    r = c.post("/tts", json={"text": "வணக்கம்", "lang": "ta"})
    assert r.status_code == 200 and r.headers["content-type"] == "audio/wav" and r.headers["x-tts-engine"] == "gemini"
    with wave.open(io.BytesIO(r.content)) as w:
        assert w.getframerate() == 24000 and w.getnchannels() == 1 and w.getnframes() == 2400
    assert "Tamil" in FakeGemini.calls[-1][1]["contents"][0]["parts"][0]["text"]
    assert c.get("/languages").json()["languages"][0]["tts"] == "gemini"
    assert c.post("/tts", json={"text": "x", "lang": "xx"}).status_code == 422
    assert c.post("/tts", json={"text": "x" * 601, "lang": "en"}).status_code == 422
