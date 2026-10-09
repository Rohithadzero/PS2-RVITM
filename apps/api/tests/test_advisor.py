"""Post advisor: hashtags pass the filter, captions are checked, times come with reasons, own posts shift the timing."""
from datetime import datetime, timedelta, timezone

import pytest

from app import advisor, plan
from b_helpers import PLAN, make_client, seed, write_copy

IST = advisor.IST


def test_hashtags_are_few_clean_and_explained():
    tags = advisor.hashtags("filter coffee", "Brew House", "Indiranagar", ["students"], "", {"en": 3})
    assert 1 <= len(tags) <= advisor.MAX_TAGS
    texts = [t["tag"] for t in tags]
    assert "#BrewHouse" in texts and "#FilterCoffee" in texts and "#Indiranagar" in texts
    assert len({t.lower() for t in texts}) == len(texts)
    assert all(t["why"] and t["kind"] in ("brand", "item", "local", "community") for t in tags)


@pytest.mark.parametrize("raw,ok", [("#Coffee", True), ("f4f", False), ("12345", False), ("x" * 31, False), ("ab", False), ("Brew House!", True), ("", False)])
def test_tag_filter(raw, ok):
    assert (advisor.clean_tag(raw) is not None) is ok


def test_spam_tags_never_appear():
    tags = advisor.hashtags("follow4follow", None, None, [], "", {})
    assert not any(t["tag"].lower() == "#follow4follow" for t in tags)


def test_caption_checks_flag_missing_hook_and_too_many_tags():
    bad = advisor.caption_checks("Hello everyone. " * 10 + "filter coffee #a1 #b2 #c3 #d4 #e5 #f6", "filter coffee", "Indiranagar", 6)
    by = {c["id"]: c for c in bad}
    assert not by["hook"]["ok"] and not by["hashtag-count"]["ok"] and not by["keywords"]["ok"]
    good = advisor.caption_checks("Filter coffee 20% off in Indiranagar, Sunday only. Come by and tell a friend.", "filter coffee", "Indiranagar", 0)
    assert all(c["ok"] for c in good)


def test_times_are_future_ist_and_on_different_days():
    now = datetime(2026, 10, 9, 6, 0, tzinfo=timezone.utc)
    out = advisor.suggest_times(now, {d: 0.3 for d in advisor.DAYS}, {}, 0)
    assert len(out["slots"]) == 3 and out["confidence"] == "low" and "Connect Instagram" in out["note"]
    ats = [datetime.fromisoformat(s["at"]) for s in out["slots"]]
    assert all(a > now for a in ats) and len({a.date() for a in ats}) == 3
    assert all(a.utcoffset() == timedelta(hours=5, minutes=30) for a in ats)
    assert all(s["reasons"] for s in out["slots"])


def test_own_posts_move_the_best_slot_and_raise_confidence():
    now = datetime(2026, 10, 9, 6, 0, tzinfo=timezone.utc)  # a Friday
    # 30 posts, the only strong ones on Saturdays at 8 pm IST (a slot the general windows rate high but not top)
    media = []
    for i in range(30):
        t = datetime(2026, 8, 1, 14, 30, tzinfo=timezone.utc) + timedelta(days=7 * (i % 8))  # Saturday 20:00 IST
        media.append({"timestamp": t.isoformat().replace("+00:00", "+0000"), "likes": 200, "comments": 10})
    mine = advisor.own_slots(media)
    assert (5, 20) in mine
    out = advisor.suggest_times(now, {d: 0.3 for d in advisor.DAYS}, mine, len(media))
    assert out["confidence"] == "medium" and out["own_posts_used"] == 30
    assert any(datetime.fromisoformat(s["at"]).weekday() == 5 for s in out["slots"])
    assert any("own posts" in r for s in out["slots"] for r in s["reasons"])


def test_few_posts_do_not_override_general_advice():
    out = advisor.suggest_times(datetime(2026, 10, 9, 6, 0, tzinfo=timezone.utc), {d: 0.3 for d in advisor.DAYS}, {(5, 20): 99.0}, 3)
    assert out["confidence"] == "low" and out["own_posts_used"] == 0


def test_audience_uses_the_channel_and_says_it_is_synthetic():
    a = advisor.audience_stats("instagram_post")
    assert "synthetic" in a["basis"] and a["channel_match"] > 0 and abs(sum(a["days"].values()) - sum(a["days"].values())) < 1e-9


@pytest.fixture
def rig(tmp_path, monkeypatch):
    app, client = make_client(tmp_path)
    monkeypatch.setattr(plan, "get_plan", lambda db, cid: PLAN)
    cid, assets = seed(client, app)
    write_copy(app, assets["instagram_post"], status="approved")
    return app, client, assets


def test_endpoint_returns_every_section_with_sources(rig):
    app, client, assets = rig
    r = client.post(f"/assets/{assets['instagram_post']['id']}/advice", json={"brand": "Brew House", "area": "Indiranagar"})
    assert r.status_code == 200
    out = r.json()
    assert out["hashtags"]["tags"] and len(out["hashtags"]["tags"]) <= 5 and out["hashtags"]["text"].startswith("#")
    assert out["timing"]["slots"] and out["caption_checks"] and out["audience"]["personas"]["top_segments"]
    assert out["rules"] and all(x["source_url"].startswith("https://") for x in out["rules"])
    assert "does not publish" in out["disclaimer"]


def test_endpoint_uses_the_owners_customers_and_instagram_posts(rig):
    app, client, assets = rig
    client.post("/customers", json={"name": "Asha", "phone": "98450 12345", "language": "kn", "tags": "regular"})
    out = client.post(f"/assets/{assets['instagram_post']['id']}/advice", json={}).json()
    assert out["audience"]["customers"]["total"] == 1 and out["audience"]["customers"]["languages"] == {"kn": 1}


def test_unknown_asset_is_404(rig):
    _, client, _ = rig
    assert client.post("/assets/nope/advice", json={}).status_code == 404
