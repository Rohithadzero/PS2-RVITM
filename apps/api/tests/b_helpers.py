"""Shared setup for the media, outreach, dashboard and persona tests. No network."""
import struct
import time
import uuid
import zlib

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.service import Service, now

FACTS = {
    "item": "filter coffee",
    "discount_percent": 20,
    "price_amount": 80,
    "timings": "Sunday only",
    "audiences": ["regulars"],
    "languages": ["en"],
    "channels": ["whatsapp"],
}
CHANNELS = ("instagram_post", "whatsapp", "cold_email", "poster")
GOOD_COPY = "Filter coffee 20% off on Sunday only, just ₹80."
PLAN = {
    "campaign_id": "x",
    "status": "locked",
    "business": {"name": "Brew House", "type": "cafe", "area": "Indiranagar, Bengaluru"},
    "tone": "warm_local",
    "audiences": ["regulars", "students"],
    "cta": {"kind": "url", "value": "https://brewhouse.example/visit", "destination_url": "https://brewhouse.example/visit"},
    "email_recipients": [{"name": "Asha", "email": "asha@example.com"}],
}


def png_bytes(width=2, height=2) -> bytes:
    def chunk(kind, data):
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    raw = b"".join(b"\x00" + b"\x00\x00\x00" * width for _ in range(height))
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw))
        + chunk(b"IEND", b"")
    )


def make_client(tmp_path, agnes=None, key="test-key"):
    settings = Settings(
        agnes_api_key=key,
        agnes_base_url="http://agnes.invalid/v1",
        agnes_origin="http://agnes.invalid",
        database_path=tmp_path / "campaign.db",
        assets_dir=tmp_path / "assets",
    )
    app = create_app(settings)
    if agnes is not None:
        app.state.agnes = agnes
    return app, TestClient(app)


def seed(client, app, facts=None):
    """A campaign with locked facts and its asset slots. Returns (campaign_id, {channel: asset})."""
    # The asset.extra column belongs to the orchestrator's db.py; add it here when it is not migrated yet.
    app.state.db.ensure("", (("asset", "extra", "TEXT"),))
    service = Service(app.state.db)
    campaign_id = service.create_campaign("Sunday coffee", None)["id"]
    put = client.put(f"/campaigns/{campaign_id}/facts", json=facts or FACTS)
    assert put.status_code == 200, put.text
    client.post("/facts/approve", json={"campaign_id": campaign_id})
    # Asset rows are inserted directly so channels the current FactsIn schema does not list yet can be tested.
    for channel in CHANNELS:
        app.state.db.asset_insert(
            {
                "id": uuid.uuid4().hex,
                "campaign_id": campaign_id,
                "audience": "regulars",
                "lang": "en",
                "channel": channel,
                "type": "copy",
                "content": None,
                "facts_used": "[]",
                "facts_version": 1,
                "status": "pending",
                "block_reason": None,
                "score": None,
                "score_detail": None,
                "created_at": now(),
            }
        )
    return campaign_id, {a["channel"]: a for a in app.state.db.assets_for(campaign_id)}


def write_copy(app, asset, content=GOOD_COPY, status="pending"):
    app.state.db.asset_update(asset["id"], content=content, status=status)


def wait_for(check, seconds=8.0):
    deadline = time.time() + seconds
    while time.time() < deadline:
        value = check()
        if value:
            return value
        time.sleep(0.05)
    raise AssertionError("condition not met in time")
