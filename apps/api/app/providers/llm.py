"""Agnes client: text, image, video, with token-bucket queue, backoff on 429, and a prompt cache.

API shapes verified against the Agnes wiki on 8 Oct 2026 (docs/settings.md section 3). The key is held only in
memory for the request and is redacted from every error message (docs/security.md).
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import time
from dataclasses import dataclass, field
from pathlib import Path

import httpx

from ..ratelimit import Limiter, backoff_delay
from ..security import redact


class LLMError(Exception):
    def __init__(self, message: str, status: int | None = None, retry_after: float | None = None):
        super().__init__(message)
        self.status = status
        self.retry_after = retry_after


@dataclass
class ChatResult:
    text: str
    usage: dict = field(default_factory=dict)
    cache_hit: bool = False
    seconds: float = 0.0
    provider: str = "agnes"
    is_fallback: bool = False


class AgnesClient:
    provider = "agnes"

    def __init__(self, key: str, base: str, model: str, limiter: Limiter, cache_dir: Path | None = None,
                 image_model: str = "agnes-image-2.5-flash", video_model: str = "agnes-video-2.5",
                 poll_base: str = "https://apihub.agnes-ai.com/agnesapi", timeout_text: float = 120,
                 timeout_image: float = 240, max_retries: int = 4, transport: httpx.AsyncBaseTransport | None = None):
        self.key, self.base, self.model = key, base.rstrip("/"), model
        self.limiter = limiter
        self.cache_dir = cache_dir
        self.image_model, self.video_model, self.poll_base = image_model, video_model, poll_base
        self.timeout_text, self.timeout_image = timeout_text, timeout_image
        self.max_retries = max_retries
        self._transport = transport

    # ---- plumbing ---------------------------------------------------------------------------------------------
    def _headers(self):
        return {"Authorization": f"Bearer {self.key}", "Content-Type": "application/json"}

    def _cache_path(self, kind: str, payload: dict) -> Path | None:
        if not self.cache_dir:
            return None
        h = hashlib.sha256(json.dumps([kind, payload], sort_keys=True, ensure_ascii=False).encode()).hexdigest()
        return self.cache_dir / f"{h}.json"

    async def _post(self, path: str, body: dict, bucket: str, timeout: float) -> dict:
        last = None
        for attempt in range(self.max_retries + 1):
            await self.limiter.bucket(bucket).acquire()
            try:
                async with httpx.AsyncClient(timeout=timeout, transport=self._transport) as c:
                    r = await c.post(self.base + path, headers=self._headers(), json=body)
            except httpx.HTTPError as e:
                last = LLMError(redact(f"network error: {type(e).__name__}", self.key))
                await asyncio.sleep(backoff_delay(attempt))
                continue
            if r.status_code == 429:
                ra = r.headers.get("retry-after")
                last = LLMError("rate limited (429)", 429, float(ra) if ra and ra.replace(".", "").isdigit() else None)
                await asyncio.sleep(backoff_delay(attempt, last.retry_after))
                continue
            if r.status_code >= 500:
                last = LLMError(f"provider error {r.status_code}", r.status_code)
                await asyncio.sleep(backoff_delay(attempt))
                continue
            if r.status_code != 200:
                raise LLMError(redact(f"{r.status_code}: {r.text[:200]}", self.key), r.status_code)
            try:
                return r.json()
            except ValueError:
                raise LLMError("provider returned non-JSON")
        raise last or LLMError("request failed")

    # ---- text -------------------------------------------------------------------------------------------------
    async def chat(self, prompt: str | list, *, max_tokens: int = 1500, temperature: float = 0.0,
                   thinking: bool = False, cache: bool = True, system: str | None = None) -> ChatResult:
        messages = prompt if isinstance(prompt, list) else [{"role": "user", "content": prompt}]
        if system:
            messages = [{"role": "system", "content": system}, *messages]
        body = {"model": self.model, "messages": messages, "max_tokens": max_tokens, "temperature": temperature,
                "chat_template_kwargs": {"enable_thinking": thinking}}
        cp = self._cache_path("chat", body) if cache and temperature == 0 else None
        if cp and cp.exists():
            d = json.loads(cp.read_text(encoding="utf-8"))
            return ChatResult(d["text"], d.get("usage", {}), True, 0.0, self.provider)
        t0 = time.monotonic()
        data = await self._post("/chat/completions", body, "text", self.timeout_text)
        try:
            text = data["choices"][0]["message"].get("content") or ""
        except (KeyError, IndexError, TypeError):
            raise LLMError("unexpected response shape")
        res = ChatResult(text, data.get("usage") or {}, False, time.monotonic() - t0, self.provider)
        if cp:
            cp.parent.mkdir(parents=True, exist_ok=True)
            cp.write_text(json.dumps({"text": text, "usage": res.usage}, ensure_ascii=False), encoding="utf-8")
        return res

    async def chat_json(self, prompt: str, **kw) -> tuple[dict, ChatResult]:
        """Chat expecting a JSON object; retries once with a stricter reminder if it does not parse."""
        res = await self.chat(prompt, **kw)
        obj = parse_json_object(res.text)
        if obj is None:
            res = await self.chat(prompt + "\n\nReply with ONLY a valid JSON object, nothing else.", **{**kw, "cache": False})
            obj = parse_json_object(res.text)
        if obj is None:
            raise LLMError("model did not return valid JSON")
        return obj, res

    # ---- image ------------------------------------------------------------------------------------------------
    async def image(self, prompt: str, size: str = "1K", ratio: str = "1:1", reference_images: list | None = None) -> dict:
        body = {"model": self.image_model, "prompt": prompt, "size": size, "ratio": ratio}
        if reference_images:
            body["extra_body"] = {"image": reference_images}
        bucket = "image"
        data = await self._post("/images/generations", body, bucket, self.timeout_image)
        item = (data.get("data") or [{}])[0]
        return {"url": item.get("url"), "b64_json": item.get("b64_json")}

    # ---- video (async create + poll) --------------------------------------------------------------------------
    async def video_create(self, prompt: str, seconds: int = 8, size: str = "720P", mode: str = "text",
                           aspect_ratio: str = "9:16", images: list | None = None) -> str:
        if not 4 <= seconds <= 12:
            raise LLMError("video clips must be 4 to 12 seconds")
        body = {"model": self.video_model, "prompt": prompt, "mode": mode, "seconds": str(seconds), "size": size,
                "aspect_ratio": aspect_ratio}
        if images:
            body["images"] = images
        data = await self._post("/videos", body, "video", 60)
        vid = data.get("id") or data.get("video_id")
        if not vid:
            raise LLMError("video task id missing in response")
        return vid

    async def video_poll(self, video_id: str, interval: float = 2.0, max_wait: float = 600.0) -> dict:
        t0 = time.monotonic()
        while time.monotonic() - t0 < max_wait:
            async with httpx.AsyncClient(timeout=30, transport=self._transport) as c:
                r = await c.get(self.poll_base, params={"video_id": video_id, "model_name": self.video_model},
                                headers=self._headers())
            if r.status_code != 200:
                raise LLMError(redact(f"poll {r.status_code}", self.key), r.status_code)
            d = r.json()
            if d.get("status") in ("completed", "failed"):
                return {"status": d["status"], "url": d.get("url"), "seconds": d.get("seconds")}
            await asyncio.sleep(interval)
        raise LLMError("video timed out")


def parse_json_object(s: str):
    s = (s or "").strip()
    if s.startswith("```"):
        s = s.strip("`")
        s = s[s.find("{"):]
    a, b = s.find("{"), s.rfind("}")
    if a < 0 or b < a:
        return None
    try:
        v = json.loads(s[a:b + 1])
        return v if isinstance(v, dict) else None
    except ValueError:
        return None
