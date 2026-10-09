"""Notifications: website order taps through a locked redirect, Instagram gains, due reminders, suggestions, read state, isolation."""
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, unquote, urlparse

import pytest

from app import notifications
from b_helpers import make_client, seed

PROFILE = {"name": "Brew Bandi", "phone": "98450 12345", "menu": [{"name": "Filter coffee", "price": 60}, {"name": "Masala dosa", "price": 90}], "langs": ["en", "ta"]}


@pytest.fixture
def rig(tmp_path):
    app, c = make_client(tmp_path)
    seed(c, app)
    c.put("/business", json=PROFILE)
    c.post("/business/site/publish", json={"slug": "brew-bandi"})
    return app, c


def test_empty_feed(tmp_path):
    _, c = make_client(tmp_path)
    assert c.get("/notifications").json() == {"unread": 0, "suggestion_count": 0, "badge": 0, "suggestions": [], "items": []}


def test_live_page_counts_taps_preview_does_not(rig):
    _, c = rig
    live = c.get("/site/brew-bandi").text
    assert "/site/brew-bandi/order?lang=en&amp;i=1" in live and "/site/brew-bandi/order?lang=en" in live and "wa.me" not in live
    preview = c.get("/business/site/preview").json()["html"]
    assert "wa.me/919845012345" in preview and "/order?" not in preview


def test_an_order_tap_is_counted_once_per_minute_and_redirects_to_the_shops_number(rig):
    _, c = rig
    r = c.get("/site/brew-bandi/order", params={"lang": "en", "i": 1}, follow_redirects=False)
    assert r.status_code == 302
    loc = urlparse(r.headers["location"])
    assert loc.netloc == "wa.me" and loc.path == "/919845012345" and "Masala dosa" in unquote(parse_qs(loc.query)["text"][0])
    c.get("/site/brew-bandi/order", params={"i": 1}, follow_redirects=False)
    items = c.get("/notifications").json()["items"]
    assert len(items) == 1 and items[0]["kind"] == "order" and "Masala dosa" in items[0]["title"] and "cannot see whether" in items[0]["body"]


def test_the_redirect_cannot_be_steered_elsewhere(rig):
    _, c = rig
    for params in ({"lang": "https://evil.example", "i": 99}, {"i": -1}, {"lang": "ta", "i": 0}):
        r = c.get("/site/brew-bandi/order", params=params, follow_redirects=False)
        assert r.status_code == 302 and urlparse(r.headers["location"]).netloc == "wa.me"
    assert "evil" not in r.headers["location"]


def test_unpublished_or_unknown_sites_have_no_order_link(rig):
    _, c = rig
    assert c.get("/site/nope/order", follow_redirects=False).status_code == 404
    c.delete("/business/site/publish")
    assert c.get("/site/brew-bandi/order", follow_redirects=False).status_code == 404


def test_instagram_gains_between_two_reads():
    old = [{"id": "1", "caption": "Dosa day", "likes": 10, "comments": 1}, {"id": "2", "likes": 5, "comments": 0}]
    new = [{"id": "1", "caption": "Dosa day", "likes": 25, "comments": 3, "shares": 2}, {"id": "2", "likes": 5, "comments": 0}, {"id": "3", "likes": 99}]
    ch = notifications.engagement_change(old, new)
    assert ch["likes"] == 15 and ch["comments"] == 2 and ch["shares"] == 2 and ch["top"] == "Dosa day"  # the brand-new post is not a "gain"
    assert notifications.engagement_change(old, old) is None and notifications.engagement_change([], new) is None


def test_saving_a_new_instagram_read_notifies_once(rig):
    app, c = rig
    from app import connections
    old = [{"id": "1", "caption": "Dosa day", "likes": 10, "comments": 1}]
    new = [{"id": "1", "caption": "Dosa day", "likes": 14, "comments": 1}]
    connections._save(app.state.db, "local", "tok", 5000000, {"username": "u", "user_id": "1"}, old)
    assert c.get("/notifications").json()["items"] == []  # first connect: nothing to compare
    connections._save(app.state.db, "local", "tok", 5000000, {"username": "u", "user_id": "1"}, new)
    items = c.get("/notifications").json()["items"]
    assert len(items) == 1 and "+4 likes" in items[0]["body"] and items[0]["page"] == "insights"


def test_a_due_reminder_and_a_sent_email_appear_once(rig):
    app, c = rig
    assets = app.state.db.assets_for(app.state.db.campaign_list()[0]["id"])
    ig = [a for a in assets if a["channel"] == "instagram_post"][0]
    app.state.db.asset_update(ig["id"], content="Filter coffee 20% off Sunday", status="approved")
    when = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    item = c.post(f"/assets/{ig['id']}/schedule", json={"kind": "reminder", "at": when, "note": "Use the cappuccino photo"}).json()
    app.state.db.execute("UPDATE scheduled_item SET run_at = ? WHERE id = ?", ((datetime.now(timezone.utc) - timedelta(minutes=2)).isoformat(timespec="seconds"), item["id"]))
    for _ in range(3):
        feed = c.get("/notifications").json()
    due = [i for i in feed["items"] if i["title"] == "Time to post"]
    assert len(due) == 1 and "cappuccino" in due[0]["body"]


def test_suggestions_count_in_the_badge_and_read_state_works(rig):
    app, c = rig
    c.post("/memory/refresh")
    feed = c.get("/notifications").json()
    assert feed["suggestion_count"] >= 2 and len(feed["suggestions"]) <= 3
    c.get("/site/brew-bandi/order", follow_redirects=False)
    feed = c.get("/notifications").json()
    assert feed["unread"] == 1 and feed["badge"] == 1 + feed["suggestion_count"]
    nid = feed["items"][0]["id"]
    c.post(f"/notifications/{nid}/read")
    assert c.get("/notifications").json()["unread"] == 0
    assert c.post("/notifications/nope/read").status_code == 404
    c.get("/site/brew-bandi/order", params={"i": 0}, follow_redirects=False)
    c.post("/notifications/read-all")
    assert c.get("/notifications").json()["unread"] == 0


def test_notifications_belong_to_their_owner(rig):
    app, c = rig
    c.get("/site/brew-bandi/order", follow_redirects=False)
    nid = c.get("/notifications").json()["items"][0]["id"]
    app.state.db.execute("UPDATE notification SET owner = 'other@x.com'")
    assert c.get("/notifications").json()["items"] == [] and c.post(f"/notifications/{nid}/read").status_code == 404


def test_the_list_is_capped(rig):
    app, c = rig
    for n in range(notifications.KEEP + 15):
        notifications.notify(app.state.db, "local", "system", f"n{n}", key=f"k{n}")
    assert app.state.db.query_one("SELECT COUNT(*) AS n FROM notification WHERE owner = 'local'")["n"] == notifications.KEEP


def test_sync_skips_when_not_connected_or_fresh(rig):
    _, c = rig
    assert c.post("/notifications/sync").json() == {"synced": False, "reason": "not_connected"}
