from __future__ import annotations

import asyncio
import time

from app.config import Settings


# At most this many calls may start at once; the bucket then refills at rpm/60 per second.
MAX_BURST = 20


class TokenBucket:
    def __init__(self, rpm: float) -> None:
        self.capacity = max(min(rpm, MAX_BURST), 1)
        self.tokens = self.capacity
        self.rate = rpm / 60
        self.updated = time.monotonic()
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        while True:
            async with self._lock:
                now = time.monotonic()
                self.tokens = min(self.capacity, self.tokens + (now - self.updated) * self.rate)
                self.updated = now
                if self.tokens >= 1:
                    self.tokens -= 1
                    return
            await asyncio.sleep(0.25)


class Buckets:
    def __init__(self, settings: Settings) -> None:
        self.text = TokenBucket(settings.text_rpm)
        self.image = TokenBucket(settings.image_rpm)
        self.video = TokenBucket(settings.video_rpm)
