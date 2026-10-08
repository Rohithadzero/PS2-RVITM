"""Token buckets per call class (docs/architecture.md section 5). Spacing = 60/RPM; async-safe, backoff on 429."""
import asyncio
import random
import time


class Bucket:
    def __init__(self, rpm: float):
        self.rpm = rpm
        self.interval = 60.0 / rpm
        self._next = 0.0
        self._lock = asyncio.Lock()
        self.queued = 0

    def set_rpm(self, rpm: float) -> None:
        self.rpm = max(rpm, 0.1)
        self.interval = 60.0 / self.rpm

    async def acquire(self) -> float:
        """Wait for a slot; returns seconds waited."""
        self.queued += 1
        try:
            async with self._lock:
                now = time.monotonic()
                wait = max(0.0, self._next - now)
                self._next = max(now, self._next) + self.interval
            if wait:
                await asyncio.sleep(wait)
            return wait
        finally:
            self.queued -= 1


class Limiter:
    def __init__(self, rpms: dict):
        self.buckets = {k: Bucket(v) for k, v in rpms.items()}

    def bucket(self, kind: str) -> Bucket:
        return self.buckets[kind]

    def set_rpm(self, kind: str, rpm: float) -> None:
        self.buckets[kind].set_rpm(rpm)


def backoff_delay(attempt: int, retry_after=None) -> float:
    if retry_after:
        return float(retry_after)
    return min(60.0, 2 ** attempt) * (0.5 + random.random() / 2)
