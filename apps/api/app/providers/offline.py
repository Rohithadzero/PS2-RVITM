"""Offline stand-in for the LLM: canned, clearly-labelled output so the app runs with no key or network.

Used when OFFLINE_LLM=1 and in tests. Every result is flagged `is_fallback=True`, which the UI shows as
"saved demo output". It follows the same interface as AgnesClient (chat / chat_json / image).
"""
from __future__ import annotations

import json
import re

from .llm import ChatResult, parse_json_object

COPY_TEMPLATES = {
    "en": {
        "instagram": "Mornings taste better with {item}. {discount} off, just {price} (was {original_price}), {days}, {time}. {terms}",
        "whatsapp": "Hi! {item} is {discount} off on {days}, {time}. Only {price}. {terms}. See you at the counter.",
        "poster": "{item} {discount} off / {days} / {time} / Now {price} / {terms}",
        "sms": "{item} {discount} off, {price}, {days} {time}. {terms}",
    },
    "hi": {
        "instagram": "{days}, {time} - {item} पर {discount} की छूट! सिर्फ़ {price} (पहले {original_price})। {terms}",
        "whatsapp": "नमस्ते! {item} पर {discount} की छूट, {days}, {time}। सिर्फ़ {price}। {terms}",
        "poster": "{item} पर {discount} छूट / {days} / {time} / अब {price} / {terms}",
        "sms": "{item} {discount} छूट, {price}, {days} {time}. {terms}",
    },
    "kn": {
        "instagram": "ಈ {days} {time}, {item} ಮೇಲೆ {discount} ರಿಯಾಯಿತಿ - ಬೆಲೆ {price} (ಮೊದಲು {original_price}). {terms}",
        "whatsapp": "ನಮಸ್ಕಾರ! {item} ಮೇಲೆ {discount} ರಿಯಾಯಿತಿ, {days}, {time}. ಬೆಲೆ ಕೇವಲ {price}. {terms}",
        "poster": "{item} ಮೇಲೆ {discount} ರಿಯಾಯಿತಿ / {days} / {time} / ಈಗ {price} / {terms}",
        "sms": "{item} {discount} ರಿಯಾಯಿತಿ, {price}, {days} {time}. {terms}",
    },
}


class OfflineLLM:
    provider = "offline"

    def __init__(self):
        self.calls = []

    async def chat(self, prompt, **kw) -> ChatResult:
        self.calls.append(prompt if isinstance(prompt, str) else json.dumps(prompt))
        return ChatResult(self._answer(prompt if isinstance(prompt, str) else json.dumps(prompt)), {}, False, 0.0,
                          self.provider, is_fallback=True)

    async def chat_json(self, prompt: str, **kw):
        res = await self.chat(prompt, **kw)
        return parse_json_object(res.text) or {}, res

    def _answer(self, p: str) -> str:
        if "COPY_BATCH" in p:
            m = re.search(r"LANG=(\w+)", p)
            lang = m.group(1) if m else "en"
            keys = re.findall(r"KEY=([\w\-]+)", p)
            out = {}
            for k in keys:
                channel = k.split("__")[-1]
                out[k] = COPY_TEMPLATES.get(lang, COPY_TEMPLATES["en"]).get(channel, COPY_TEMPLATES["en"]["instagram"])
            return json.dumps(out, ensure_ascii=False)
        if "PAIRWISE" in p:
            return json.dumps({"winner": "A", "clarity": 7, "appeal": 7, "trust": 7, "local_feel": 7, "cta": 7,
                               "reason": "offline placeholder, not a real judgement"})
        if "BACKTRANSLATE_BATCH" in p:
            return json.dumps({"items": []})
        if "EXTRACT_OFFER" in p:
            return json.dumps({"item": None, "discount_pct": None, "price_inr": None, "days": [], "time_from": None,
                               "time_to": None, "terms": []})
        if "CLASSIFY_CHANGE" in p:
            return json.dumps({"class": "fact", "patch": {}})
        return "OK"

    async def image(self, prompt: str, **kw) -> dict:
        return {"url": None, "b64_json": None, "is_fallback": True}
