"""Per-campaign event hub for SSE with resume (docs/api-spec.md section 9). Phone and laptop see the same board."""
from __future__ import annotations

import asyncio
import itertools
import json
from collections import defaultdict, deque


class Hub:
    def __init__(self, backlog: int = 200):
        self._ids = itertools.count(1)
        self._buf: dict = defaultdict(lambda: deque(maxlen=backlog))
        self._subs: dict = defaultdict(set)

    def publish(self, owner_id: str, campaign_id: str, event: str, data: dict) -> int:
        eid = next(self._ids)
        item = (eid, event, json.dumps(data, ensure_ascii=False))
        self._buf[(owner_id, campaign_id)].append(item)
        for q in list(self._subs[(owner_id, campaign_id)]):
            q.put_nowait(item)
        return eid

    async def stream(self, owner_id: str, campaign_id: str, last_event_id: int = 0, heartbeat: float = 15.0):
        key = (owner_id, campaign_id)
        q: asyncio.Queue = asyncio.Queue()
        self._subs[key].add(q)
        try:
            for eid, ev, data in list(self._buf[key]):
                if eid > last_event_id:
                    yield _fmt(eid, ev, data)
            while True:
                try:
                    eid, ev, data = await asyncio.wait_for(q.get(), timeout=heartbeat)
                    yield _fmt(eid, ev, data)
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"
        finally:
            self._subs[key].discard(q)


def _fmt(eid: int, ev: str, data: str) -> str:
    return f"id: {eid}\nevent: {ev}\ndata: {data}\n\n"


hub = Hub()
