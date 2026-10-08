"""Process-wide objects: rate limiter, LLM client factory, tracked background tasks, calibration loader."""
from __future__ import annotations

import asyncio
import json
from pathlib import Path

from . import db
from .config import settings
from .domain.planner import DEFAULT_LATENCY, DEFAULT_RPM, Calibration
from .providers.llm import AgnesClient
from .providers.offline import OfflineLLM
from .ratelimit import Limiter
from .security import decrypt_key

limiter = Limiter({**DEFAULT_RPM, **settings.rpm})
_override = None  # tests inject a fake LLM here
_tasks: set = set()


def set_llm_override(obj) -> None:
    global _override
    _override = obj


def spawn(coro) -> asyncio.Task:
    t = asyncio.get_event_loop().create_task(coro)
    _tasks.add(t)
    t.add_done_callback(_tasks.discard)
    return t


def get_llm(owner_id: str | None = None):
    """Agnes by default (shared key); the owner's own key when they set one (Settings)."""
    if _override is not None:
        return _override
    if settings.offline_llm:
        return OfflineLLM()
    key, base, model = settings.agnes_api_key, settings.agnes_base, settings.text_model
    if owner_id:
        row = db.one("SELECT * FROM provider_config WHERE owner_id=? AND capability='text' AND mode='byo' AND enabled=1 "
                     "ORDER BY priority LIMIT 1", (owner_id,))
        if row and row.get("key_ciphertext"):
            own = decrypt_key(row["key_ciphertext"])
            if own:
                key, base, model = own, row.get("base_url") or settings.agnes_base, row.get("model") or model
    if not key:
        return OfflineLLM()
    return AgnesClient(key, base, model, limiter, cache_dir=settings.data_dir / "cache",
                       image_model=settings.image_model, video_model=settings.video_model,
                       poll_base=settings.agnes_poll_base)


def load_calibration() -> Calibration:
    """Latest measured values from data/calibration/agnes-*.json (written by apps/api/calibration), else defaults."""
    d = settings.data_dir / "calibration"
    files = sorted(d.glob("agnes-*.json")) if d.exists() else []
    cal = Calibration()
    cal.rpm = {**DEFAULT_RPM, **settings.rpm}
    if not files:
        return cal
    try:
        data = json.loads(Path(files[-1]).read_text(encoding="utf-8"))
        lat = data.get("latency_s", {})
        cal.latency = dict(DEFAULT_LATENCY)
        if lat.get("copy_batch", {}).get("p50"):
            cal.latency["text"] = lat["copy_batch"]["p50"]
        if data.get("image", {}) and data["image"].get("seconds"):
            cal.latency["image"] = data["image"]["seconds"]
        cal.source = f"calibration file {files[-1].name}"
    except (ValueError, OSError):
        pass
    return cal
