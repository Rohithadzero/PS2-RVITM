"""Planner, calibration, provider-key and STT routes."""
import io
import wave

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def client(tmp_path):
    s = Settings(agnes_api_key=None, agnes_base_url="https://x.test/v1", agnes_origin="https://x.test",
                 database_path=tmp_path / "t.db", assets_dir=tmp_path / "assets")
    return TestClient(create_app(s))


WANTED = [{"lang": l, "channel": c, "audience_id": "a1"} for l in ("en", "kn", "hi") for c in ("instagram", "whatsapp")]


def test_planner_route_fits_within_limits(tmp_path):
    r = client(tmp_path).post("/planner/solve", json={"wanted": WANTED, "limits": {"time_s": 180, "money_inr": 50, "review_s": 480}})
    assert r.status_code == 200 and r.json()["feasible"]
    assert r.json()["cost"]["review_s"] <= 480


def test_calibration_route_reports_source(tmp_path):
    r = client(tmp_path).get("/calibration")
    assert r.status_code == 200 and r.json()["rpm"]["text"] == 10


def test_provider_keys_are_write_only_and_encrypted(tmp_path):
    c = client(tmp_path)
    r = c.put("/settings/providers/text", json={"provider": "agnes", "api_key": "sk-secret-123456"})
    assert r.status_code == 200 and r.json()["last4"] == "3456" and "api_key" not in r.json()
    assert "sk-secret" not in c.get("/settings/providers").text
    raw = c.app.state.db.query_one("SELECT key_enc FROM provider_keys WHERE capability='text'")["key_enc"]
    assert b"sk-secret" not in raw
    # a blank key on the next save keeps the stored one
    c.put("/settings/providers/text", json={"provider": "agnes", "model": "agnes-3.0-flash"})
    assert c.get("/settings/providers").json()["providers"][0]["last4"] == "3456"
    assert c.app.state.agnes._require_key() == "sk-secret-123456"
    c.delete("/settings/providers/text")
    assert c.get("/settings/providers").json()["providers"][0]["key_set"] is False


def test_provider_custom_url_blocks_private_hosts(tmp_path):
    r = client(tmp_path).put("/settings/providers/text", json={"provider": "custom", "base_url": "https://127.0.0.1/v1"})
    assert r.status_code == 422 and r.json()["detail"]["code"] == "blocked_url"


def test_stt_rejects_kannada_and_bad_audio(tmp_path):
    c = client(tmp_path)
    b = io.BytesIO()
    w = wave.open(b, "wb"); w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000); w.writeframes(b"\0\0" * 1600); w.close()
    r = c.post("/stt", files={"audio": ("a.wav", b.getvalue(), "audio/wav")}, data={"lang": "kn"})
    assert r.status_code == 422 and r.json()["detail"]["code"] == "stt_unsupported"
    r = c.post("/stt", files={"audio": ("a.wav", b"not audio", "audio/wav")}, data={"lang": "en"})
    assert r.status_code == 422
