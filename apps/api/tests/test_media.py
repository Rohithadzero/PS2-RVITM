"""Image generation, media serving and client render upload. Agnes and the download are scripted."""
import re

import pytest

from app import media, plan
from app.agnes import AgnesError
from b_helpers import PLAN, make_client, png_bytes, seed, wait_for, write_copy


class ImageAgnes:
    def __init__(self, fail=False):
        self.fail = fail
        self.calls = []

    async def image(self, prompt, *, size="1K", ratio="4:3", references=None):
        self.calls.append({"prompt": prompt, "size": size, "ratio": ratio})
        if self.fail:
            raise AgnesError("Agnes 500: boom")
        return {"data": [{"url": "https://platform-outputs.example/a.png", "b64_json": ""}], "task_id": "task_1"}


@pytest.fixture
def rig(tmp_path, monkeypatch):
    agnes = ImageAgnes()
    app, client = make_client(tmp_path, agnes)
    monkeypatch.setattr(plan, "get_plan", lambda db, cid: PLAN)

    async def fake_fetch(url):
        return png_bytes(6, 8)

    monkeypatch.setattr(media, "fetch_bytes", fake_fetch)
    with client:
        campaign_id, assets = seed(client, app)
        yield app, client, campaign_id, assets, agnes


def test_prompt_is_text_free_and_built_from_plan(rig):
    app, _, _, assets, _ = rig
    prompt = media.build_prompt(assets["instagram_post"], 'filter coffee 20% "Sunday"', PLAN)
    assert not re.search(r"[0-9\"']", prompt)
    for part in ("cafe", "Indiranagar, Bengaluru", "filter coffee", "warm, homely"):
        assert part in prompt
    assert "no text, no letters, no numbers" in prompt


def test_image_job_runs_and_serves_same_origin(rig):
    app, client, _, assets, agnes = rig
    asset = assets["instagram_post"]
    created = client.post(f"/assets/{asset['id']}/image")
    assert created.status_code == 200
    body = created.json()
    assert body["kind"] == "base" and body["ratio"] == "3:4" and body["status"] in ("queued", "generating", "ready")
    job_id = body["job_id"]
    wait_for(lambda: client.get(f"/jobs/{job_id}").json()["status"] == "completed")
    state = client.get(f"/campaign/{asset['campaign_id']}/assets/state").json()[asset["id"]]
    ready = state["media"][0]
    assert ready["status"] == "ready" and ready["url"].startswith("/media/") and ready["width"] == 6
    assert agnes.calls[0]["size"] == "1K" and agnes.calls[0]["ratio"] == "3:4"
    served = client.get(ready["url"])
    assert served.status_code == 200 and served.headers["content-type"] == "image/png"
    assert served.content == png_bytes(6, 8)


def test_request_while_a_generation_is_open_returns_that_entry(rig):
    app, client, _, assets, agnes = rig
    asset = assets["instagram_post"]
    app.state.db.execute(
        "INSERT INTO media (id, asset_id, campaign_id, kind, ratio, status, created_at) VALUES ('open1', ?, ?, 'base', '3:4', 'generating', 't')",
        (asset["id"], asset["campaign_id"]),
    )
    assert client.post(f"/assets/{asset['id']}/image").json()["id"] == "open1"
    assert agnes.calls == []


def test_failed_generation_is_recorded(tmp_path, monkeypatch):
    app, client = make_client(tmp_path, ImageAgnes(fail=True))
    monkeypatch.setattr(plan, "get_plan", lambda db, cid: PLAN)
    with client:
        _, assets = seed(client, app)
        body = client.post(f"/assets/{assets['instagram_post']['id']}/image").json()
        wait_for(lambda: client.get(f"/jobs/{body['job_id']}").json()["status"] == "failed")
        row = app.state.db.query_one("SELECT * FROM media WHERE id = ?", (body["id"],))
        assert row["status"] == "failed" and "boom" in row["detail"]


def test_image_guards(rig, tmp_path):
    app, client, _, assets, _ = rig
    assert client.post(f"/assets/{assets['whatsapp']['id']}/image").json()["detail"]["code"] == "no_image_for_channel"
    assert client.post("/assets/nope/image").status_code == 404
    other_app, other = make_client(tmp_path / "nokey", key=None)
    with other:
        _, other_assets = seed(other, other_app)
        resp = other.post(f"/assets/{other_assets['instagram_post']['id']}/image")
        assert resp.status_code == 409 and resp.json()["detail"]["code"] == "agnes_not_configured"


def test_media_route_rejects_traversal_and_unknown_files(rig):
    app, client, *_ = rig
    (app.state.settings.assets_dir / "secret.txt").write_text("no")
    for name in ("secret.txt", "..%2Fcampaign.db", "%2e%2e%2fcampaign.db", "a.png", "G" * 32 + ".png"):
        assert client.get(f"/media/{name}").status_code == 404
    assert client.get("/media/" + "0" * 32 + ".png").status_code == 404


def test_render_accepts_png_only_and_replaces_previous(rig):
    app, client, _, assets, _ = rig
    asset = assets["instagram_post"]
    url = f"/assets/{asset['id']}/render"
    first = client.post(url, files={"file": ("a.png", png_bytes(4, 5), "image/png")})
    assert first.status_code == 200 and first.json()["kind"] == "final" and first.json()["width"] == 4
    second = client.post(url, files={"file": ("b.png", png_bytes(7, 9), "image/png")}).json()
    finals = [m for m in client.get(f"/campaign/{asset['campaign_id']}/assets/state").json()[asset["id"]]["media"] if m["kind"] == "final"]
    assert [m["id"] for m in finals] == [second["id"]]
    assert client.get(first.json()["id"] and f"/media/{first.json()['id']}.png").status_code == 404
    assert client.post(url, files={"file": ("c.png", b"GIF89a not a png", "image/png")}).status_code == 415
    big = png_bytes() + b"\x00" * (media.MAX_RENDER_BYTES + 10)
    assert client.post(url, files={"file": ("d.png", big, "image/png")}).status_code == 413
    assert client.post("/assets/nope/render", files={"file": ("a.png", png_bytes(), "image/png")}).status_code == 404


# ---- reel video ----

import json
import uuid

MP4 = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 3000


class VideoAgnes:
    def __init__(self, statuses=(), queue_full=0):
        self.statuses = list(statuses)
        self.queue_full = queue_full
        self.created = []
        self.polled = []

    async def video(self, prompt, *, seconds="8", aspect_ratio="9:16"):
        if self.queue_full:
            self.queue_full -= 1
            raise AgnesError('Agnes 503: {"code":"video_queue_full"}')
        self.created.append({"prompt": prompt, "seconds": seconds, "aspect_ratio": aspect_ratio})
        return {"id": "task_1", "video_id": "vid_1", "status": "queued"}

    async def video_status(self, video_id):
        self.polled.append(video_id)
        return self.statuses.pop(0) if self.statuses else {"status": "pending", "progress": 10, "url": None}


@pytest.fixture
def reel_rig(tmp_path, monkeypatch):
    monkeypatch.setattr(plan, "get_plan", lambda db, cid: PLAN)
    monkeypatch.setattr(media, "VIDEO_POLL", 0.01)
    monkeypatch.setattr(media, "VIDEO_QUEUE_WAIT", 0.01)
    box = {"bytes": MP4}

    async def fake_fetch(url, limit=0):
        return box["bytes"]

    monkeypatch.setattr(media, "fetch_bytes", fake_fetch)

    def build(agnes):
        app, client = make_client(tmp_path, agnes)
        client.__enter__()
        _, assets = seed(client, app)
        row = dict(assets["whatsapp"])
        row.update(id=uuid.uuid4().hex, channel="reel", type="reel")
        app.state.db.asset_insert(row)
        app.state.db.execute(
            "UPDATE asset SET extra = ? WHERE id = ?",
            (json.dumps({"script": ["Steam rises from a cup at 8am", "Sunday filter coffee"]}), row["id"]),
        )
        return app, client, assets, row["id"]

    return build, box


def test_video_requires_reel_and_explicit_opt_in(reel_rig):
    build, _ = reel_rig
    agnes = VideoAgnes()
    app, client, assets, reel = build(agnes)
    assert client.post(f"/assets/{reel}/video", json={}).json()["detail"]["code"] == "motion_not_opted_in"
    refused = client.post(f"/assets/{reel}/video", json={"motion_opt_in": False, "aspect": "9:16"})
    assert refused.status_code == 409
    wrong = client.post(f"/assets/{assets['instagram_post']['id']}/video", json={"motion_opt_in": True})
    assert wrong.status_code == 400 and wrong.json()["detail"]["code"] == "no_video_for_channel"
    assert client.post(f"/assets/{reel}/video", json={"motion_opt_in": True, "aspect": "4:3"}).status_code == 422
    assert agnes.created == [] and app.state.db.query("SELECT * FROM media WHERE kind = 'video'") == []
    client.__exit__(None, None, None)


def test_video_polls_to_ready_downloads_and_serves(reel_rig):
    build, _ = reel_rig
    agnes = VideoAgnes(statuses=[{"status": "pending"}, {"status": "processing", "url": None}, {"status": "completed", "url": "https://cdn.example/v.mp4"}])
    app, client, assets, reel = build(agnes)
    body = client.post(f"/assets/{reel}/video", json={"motion_opt_in": True}).json()
    assert body["kind"] == "video" and body["ratio"] == "16:9" and body["status"] in ("queued", "generating")
    wait_for(lambda: client.get(f"/jobs/{body['job_id']}").json()["status"] == "completed")
    assert agnes.polled == ["vid_1"] * 3
    created = agnes.created[0]
    assert created["seconds"] == "8" and created["aspect_ratio"] == "16:9"
    assert "Steam rises from a cup at am" in created["prompt"] and "no camera movement" in created["prompt"]
    assert "Locked-off static camera" in created["prompt"] and not re.search(r"[0-9]", created["prompt"])
    state = client.get(f"/campaign/{assets['whatsapp']['campaign_id']}/assets/state").json()[reel]["media"][0]
    assert state["kind"] == "video" and state["status"] == "ready" and state["url"].endswith(".mp4")
    served = client.get(state["url"])
    assert served.status_code == 200 and served.headers["content-type"] == "video/mp4" and served.content == MP4
    row = app.state.db.query_one("SELECT * FROM media WHERE id = ?", (body["id"],))
    assert row["video_id"] == "vid_1" and row["model"] == "agnes-video-2.5-flash"
    assert app.state.db.job_get(body["job_id"])["provider_ref"] == "vid_1"
    client.__exit__(None, None, None)


def test_video_aspect_9_16_and_queue_full_is_retried(reel_rig):
    build, _ = reel_rig
    agnes = VideoAgnes(statuses=[{"status": "completed", "url": "https://cdn.example/v.mp4"}], queue_full=2)
    app, client, _, reel = build(agnes)
    body = client.post(f"/assets/{reel}/video", json={"motion_opt_in": True, "aspect": "9:16"}).json()
    wait_for(lambda: client.get(f"/jobs/{body['job_id']}").json()["status"] == "completed")
    assert agnes.created[0]["aspect_ratio"] == "9:16" and body["ratio"] == "9:16"
    client.__exit__(None, None, None)


def test_video_times_out_to_failed(reel_rig, monkeypatch):
    build, _ = reel_rig
    monkeypatch.setattr(media, "VIDEO_TIMEOUT", 0.05)
    agnes = VideoAgnes()
    app, client, _, reel = build(agnes)
    body = client.post(f"/assets/{reel}/video", json={"motion_opt_in": True}).json()
    wait_for(lambda: client.get(f"/jobs/{body['job_id']}").json()["status"] == "failed")
    row = app.state.db.query_one("SELECT * FROM media WHERE id = ?", (body["id"],))
    assert row["status"] == "failed" and "10 minutes" in row["detail"] and row["file"] is None
    client.__exit__(None, None, None)


def test_video_never_ready_without_a_real_file(reel_rig):
    build, box = reel_rig
    box["bytes"] = b""
    agnes = VideoAgnes(statuses=[{"status": "completed", "url": "https://cdn.example/v.mp4"}])
    app, client, _, reel = build(agnes)
    body = client.post(f"/assets/{reel}/video", json={"motion_opt_in": True}).json()
    wait_for(lambda: client.get(f"/jobs/{body['job_id']}").json()["status"] == "failed")
    assert app.state.db.query_one("SELECT status, file FROM media WHERE id = ?", (body["id"],)) == {"status": "failed", "file": None}
    failed = VideoAgnes(statuses=[{"status": "failed", "error": "content rejected"}])
    app.state.agnes = failed
    again = client.post(f"/assets/{reel}/video", json={"motion_opt_in": True}).json()
    wait_for(lambda: client.get(f"/jobs/{again['job_id']}").json()["status"] == "failed")
    assert "content rejected" in app.state.db.query_one("SELECT detail FROM media WHERE id = ?", (again["id"],))["detail"]
    client.__exit__(None, None, None)


def test_mp4_path_guard(reel_rig):
    build, _ = reel_rig
    app, client, _, _ = build(VideoAgnes())
    (app.state.settings.assets_dir / "secret.mp4").write_bytes(MP4)
    good = "0" * 32 + ".mp4"
    (app.state.settings.assets_dir / good).write_bytes(MP4)
    assert client.get(f"/media/{good}").status_code == 200
    for name in ("secret.mp4", "..%2F" + good, "%2e%2e%2f" + good, "A" * 32 + ".mp4", "0" * 32 + ".mp4.exe", "0" * 32 + ".mov"):
        assert client.get(f"/media/{name}").status_code == 404
    client.__exit__(None, None, None)


def test_video_daily_budget(reel_rig):
    build, _ = reel_rig
    app, client, assets, reel = build(VideoAgnes())
    for i in range(media.VIDEO_DAILY_SECONDS // media.VIDEO_SECONDS):
        app.state.db.execute(
            "INSERT INTO media (id, asset_id, campaign_id, kind, ratio, status, created_at) VALUES (?, 'x', 'x', 'video', '16:9', 'ready', ?)",
            (f"b{i}", media.now()),
        )
    resp = client.post(f"/assets/{reel}/video", json={"motion_opt_in": True})
    assert resp.status_code == 409 and resp.json()["detail"]["code"] == "video_budget_exhausted"
    client.__exit__(None, None, None)
