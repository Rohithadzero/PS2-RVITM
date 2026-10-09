"""Business profile and the one-page site: validated saves, escaped output, a working WhatsApp order link, public only when published."""
from urllib.parse import parse_qs, unquote, urlparse

import pytest

from app import business
from b_helpers import make_client, seed

PROFILE = {"name": "Brew Bandi", "phone": "98450 12345", "address": "12 Church St, Bengaluru", "maps_url": "https://maps.example/x", "hours": "8am to 9pm",
           "about": {"en": "A small cafe.", "kn": "ಒಂದು ಸಣ್ಣ ಕೆಫೆ.", "hi": ""}, "tagline": {"en": "Coffee, your way", "kn": "", "hi": ""},
           "menu": [{"name": "Filter coffee", "price": 60}, {"name": "Masala dosa", "price": 90.5}], "langs": ["en", "kn"]}


@pytest.fixture
def rig(tmp_path):
    app, client = make_client(tmp_path)
    seed(client, app)  # a campaign with approved facts: filter coffee, 20% off, Sunday only
    return app, client


def test_save_merges_and_normalises_the_phone(rig):
    _, c = rig
    r = c.put("/business", json={"name": "Brew Bandi", "phone": "098450 12345"}).json()
    assert r["profile"]["phone"] == "919845012345"
    r = c.put("/business", json={"hours": "9 to 5"}).json()
    assert r["profile"]["name"] == "Brew Bandi" and r["profile"]["hours"] == "9 to 5"
    assert c.get("/business").json()["profile"]["phone"] == "919845012345"


@pytest.mark.parametrize("bad", [{"phone": "call me"}, {"maps_url": "http://x.example"}, {"palette": {"bg": "red"}}, {"langs": ["xx"]}, {"menu": [{"name": "x", "price": 0}]}, {"palette": {"zzz": "#ffffff"}}])
def test_bad_input_is_refused(rig, bad):
    _, c = rig
    assert c.put("/business", json=bad).status_code in (422,)


def test_page_has_a_real_order_link_per_item_and_the_approved_offer(rig):
    _, c = rig
    c.put("/business", json=PROFILE)
    out = c.get("/business/site/preview").json()
    page = out["html"]
    assert out["order_button"] and out["warnings"] == []
    assert "Filter coffee" in page and "20% off" in page and "₹80" in page and "Sunday only" in page
    links = [l.split('"')[0].replace("&amp;", "&") for l in page.split('href="')[1:] if l.startswith("https://wa.me/")]
    assert len(links) == 3  # hero + two menu items
    q = urlparse(links[0])
    assert q.path == "/919845012345" and "like to order" in unquote(parse_qs(q.query)["text"][0]) and "Brew Bandi" in unquote(parse_qs(q.query)["text"][0])
    assert "Masala dosa" in unquote(links[2])


def test_language_switch_and_missing_pieces_are_reported(rig):
    _, c = rig
    c.put("/business", json={"name": "Brew Bandi", "langs": ["en", "kn"], "tagline": {"kn": "ನಿಮ್ಮ ಕಾಫಿ"}})
    out = c.get("/business/site/preview", params={"lang": "kn"}).json()
    assert 'lang="kn"' in out["html"] and "ನಿಮ್ಮ ಕಾಫಿ" in out["html"] and not out["order_button"]
    assert any("WhatsApp number" in w for w in out["warnings"]) and any("menu" in w.lower() for w in out["warnings"])
    assert "wa.me" not in out["html"]


def test_everything_user_typed_is_escaped(rig):
    _, c = rig
    c.put("/business", json={"name": "<script>alert(1)</script>", "phone": "98450 12345", "about": {"en": "<img src=x onerror=alert(1)>"},
                              "menu": [{"name": "\"><b>x", "price": 5}], "address": "a & b"})
    page = c.get("/business/site/preview").json()["html"]
    assert "<script>" not in page and "<img" not in page and "<b>x" not in page and "a &amp; b" in page


def test_no_offer_shown_until_facts_are_approved(tmp_path):
    app, c = make_client(tmp_path)
    from app.service import Service
    cid = Service(app.state.db).create_campaign("x", None)["id"]
    c.put(f"/campaigns/{cid}/facts", json={"item": "saffron latte", "audiences": ["regulars"]})  # saved, not approved
    c.put("/business", json={"name": "Cafe One", "phone": "98450 12345"})
    out = c.get("/business/site/preview").json()
    assert "saffron" not in out["html"].lower() and any("approved offer" in w for w in out["warnings"])


def test_publish_makes_the_page_public_with_a_locked_policy(rig):
    _, c = rig
    c.put("/business", json=PROFILE)
    assert c.get("/site/brew-bandi").status_code == 404  # not published
    assert c.post("/business/site/publish", json={"slug": "Brew Bandi!"}).json()["detail"]["code"] == "bad_slug"
    assert c.post("/business/site/publish", json={"slug": "admin"}).json()["detail"]["code"] == "bad_slug"
    site = c.post("/business/site/publish", json={"slug": "brew-bandi"}).json()["site"]
    assert site["published"] and site["url"].endswith("/site/brew-bandi")
    r = c.get("/site/brew-bandi")
    assert r.status_code == 200 and "Brew Bandi" in r.text
    assert "default-src 'none'" in r.headers["content-security-policy"] and r.headers["x-content-type-options"] == "nosniff"
    c.delete("/business/site/publish")
    assert c.get("/site/brew-bandi").status_code == 404


def test_slug_belongs_to_one_owner(rig):
    app, c = rig
    c.put("/business", json=PROFILE)
    c.post("/business/site/publish", json={"slug": "brew-bandi"})
    app.state.db.execute("UPDATE business SET owner = 'other@x.com'")
    c.put("/business", json={"name": "Mine"})
    assert c.post("/business/site/publish", json={"slug": "brew-bandi"}).json()["detail"]["code"] == "slug_taken"


def test_publish_needs_a_name(rig):
    _, c = rig
    assert c.post("/business/site/publish", json={"slug": "no-name"}).json()["detail"]["code"] == "no_name"
