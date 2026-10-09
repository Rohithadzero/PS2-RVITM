"""evals: replayable guardrail checks. They run offline (no model, no network), so they can run on every change.

Each check says what it proves and lists every failure. A failing check is a finding, not a test to loosen. `run_all()` backs
`GET /evals` (Settings, Guardrails tab) and `python -m app.evals`.

Data: the synthetic dataset's audit cases, ledgers and spoken-brief traps live in app/data/eval/.
"""
from __future__ import annotations

import json
import random
from datetime import date
from itertools import product
from pathlib import Path
from typing import Any, Callable

from fastapi import APIRouter

from app import agent, forecast, interview, panel, reply, speech
from app.schemas import OfferFacts
from app.validator import validate_content

router = APIRouter()
DATA = Path(__file__).parent / "data" / "eval"


def ensure_schema(db) -> None:
    """Nothing to create."""


def _load(name: str) -> Any:
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def _ledger_facts(ledger: dict[str, Any]) -> OfferFacts:
    names = {"Mon": "Monday", "Tue": "Tuesday", "Wed": "Wednesday", "Thu": "Thursday", "Fri": "Friday", "Sat": "Saturday", "Sun": "Sunday"}
    days = " ".join(names[d] for d in ledger.get("valid_days", []))
    return OfferFacts(item=ledger.get("applies_to") or " + ".join(ledger.get("items", [])) or ledger["offer"],
                      price_amount=ledger.get("price_inr"), discount_percent=ledger.get("discount_pct"),
                      timings=f"{days} {ledger.get('valid_time', '')}".strip() or None,
                      terms="; ".join(ledger.get("conditions", [])) or None, audiences=["all"])


def check_validator_audit() -> tuple[int, list[str]]:
    ledgers = {r["id"]: r for r in _load("ledgers.json")}
    cases = _load("audit_cases.json")
    failures = []
    for c in cases:
        ok = validate_content(c["text"], _ledger_facts(ledgers[c["ledger"]])).ok
        if ok != c["label"].startswith("GOOD"):
            failures.append(f"{c['label']} was {'passed' if ok else 'blocked'}: {c['text'][:70]}")
    return len(cases), failures


def check_voice_traps() -> tuple[int, list[str]]:
    t = [u["text"] for u in _load("voice_utterances.json")]
    q = {x.field: x for x in interview.SCRIPT}
    today = date(2026, 10, 9)
    failures = []

    def expect(label: str, ok: bool) -> None:
        if not ok:
            failures.append(label)

    expect("spoken 'two ninety nine' is read as 299", interview.read_deterministic(q["price_amount"], t[0], today).value == 299.0)
    expect("weekend and Saturday Sunday are read from speech", {"sat", "sun"} <= set(speech.read_days(t[0])))
    offer = interview.read_deterministic(q["offer_type"], t[2], today)
    expect("self-correction keeps the last offer type (buy one get one)", offer.status == "accepted" and offer.value == "buy_one_get_one")
    expect("self-correction says what it dropped", "Dropped" in (offer.reason or ""))
    expect("'next Sunday' after 'till Sunday' is ambiguous and asks", interview.read_deterministic(q["end_date"], t[3], today).status == "ambiguous")
    expect("'five hundred' is 500, not 50", 500.0 in speech.non_time_numbers(t[5]) and 50.0 not in speech.non_time_numbers(t[5]))
    expect("Kannada-English number words are read ('mooru nooru' is 300)", interview.read_deterministic(q["price_amount"], t[1], today).value == 300.0)
    return 7, failures


def check_agent_grounding() -> tuple[int, list[str]]:
    idea = "I run Brew Bandi Cafe in Indiranagar. 20% off filter coffee for students, on WhatsApp."
    cases = [
        ({"business_name": "Brew Bandi Cafe"}, True), ({"area": "Koramangala"}, False), ({"discount_percent": "25%"}, False),
        ({"channels": "Instagram and email"}, False), ({"offer_item": "FILTER   coffee"}, True),
        ({"audiences": "students and families"}, False), ({"cta": "call 9999999999"}, False),
    ]
    failures = []
    for fields, kept in cases:
        got = bool(agent.ground_brief(idea, {"fields": fields})["fields"])
        if got != kept:
            failures.append(f"{fields} was {'kept' if got else 'dropped'}")
    if "_budget_inr" in agent.ground_brief(idea, {"fields": {}, "budget_inr": 5000})["fields"]:
        failures.append("a budget that is not in the idea was kept")
    return len(cases) + 1, failures


def check_reply_guard() -> tuple[int, list[str]]:
    sensitive = ["I am allergic to nuts", "give me a refund", "my kid got sick after your coffee", "I will call my lawyer", "this is a scam",
                 "can you cater a wedding", "cancel my order", "I want to partner with you", "any job vacancy?", "the staff was rude",
                 "I am diabetic, is it ok", "I am very unhappy"]
    benign = ["how much off is the coffee?", "what time do you open?", "is it dine-in only?", "where are you?", "which days is the offer on?"]
    failures = [f"not escalated: {m}" for m in sensitive if not reply.SENSITIVE.search(m)]
    failures += [f"wrongly escalated: {m}" for m in benign if reply.SENSITIVE.search(m)]
    facts = OfferFacts(item="filter coffee", discount_percent=20, timings="Sunday only", audiences=["x"])
    hostile = {"answerable": True, "intent": "offer", "used": ["item"], "reply": "It is 40% off, and free delivery for 50 rupees."}
    if reply.decide("how much off?", json.dumps(hostile), facts, {"item": "filter coffee"})["status"] != "escalated":
        failures.append("a reply that contradicts the lock was offered")
    return len(sensitive) + len(benign) + 1, failures


def check_forecast_validation() -> tuple[int, list[str]]:
    mae = forecast.model_card()["leave_one_out_mae"]
    failures = []
    if not mae["channel_mean"] < mae["global_mean"]:
        failures.append("channel average no longer beats a single overall average in leave-one-out")
    if forecast.fit()["model"] == "ridge" and not mae["ridge"] < mae["channel_mean"]:
        failures.append("the larger model is in use but does not beat the channel average")
    if forecast.forecast_asset({"id": "x", "channel": "cold_email", "lang": "en", "content": "hi"}, "percent_off")["comparable"]:
        failures.append("a channel with no history was forecast")
    return 3, failures


def check_planner_limits() -> tuple[int, list[str]]:
    from app.lab.domain.planner import solve
    rng = random.Random(7)
    failures = []
    runs = 12
    for _ in range(runs):
        langs = rng.sample(["en", "kn", "hi"], rng.randint(1, 3))
        chans = rng.sample(["whatsapp", "poster", "instagram_post", "instagram_story"], rng.randint(1, 4))
        lim = {"time_s": rng.choice([60, 120, 300]), "money_inr": rng.choice([5, 20, 50]), "review_s": rng.choice([60, 180, 600])}
        wanted = [{"lang": l, "channel": c, "audience_id": "a"} for l, c in product(langs, chans)]
        r = solve({"wanted": wanted, "limits": lim}, poster_uses_photo=False)
        if r["feasible"] and (r["cost"]["time_s"] > lim["time_s"] + 1e-6 or r["cost"]["money_inr"] > lim["money_inr"] + 1e-6
                              or r["cost"]["review_s"] > lim["review_s"] + 1e-6):
            failures.append(f"over a limit with {lim}")
    return runs, failures


def check_referee() -> tuple[int, list[str]]:
    states = ["ok", "concern", "block", "unchecked"]
    failures = []
    total = 0
    for combo in product(states, repeat=4):
        total += 1
        r = panel.referee([panel.verdict(n, s) for n, s in zip(panel.REVIEWERS, combo)])
        if r["status"] == "clear" and set(combo) != {"ok"}:
            failures.append(f"clear with {combo}")
        if "block" in combo and r["status"] != "blocked":
            failures.append(f"not blocked with {combo}")
        if r["status"] != "clear" and not r["needs_human"]:
            failures.append(f"no human asked with {combo}")
    return total, failures


CHECKS: tuple[tuple[str, str, str, Callable[[], tuple[int, list[str]]]], ...] = (
    ("validator_audit", "Fact validator on the audit cases", "Every bad asset is blocked and every good one passes.", check_validator_audit),
    ("voice_traps", "Spoken-brief traps", "Number words, self-correction, ambiguous dates and 'five hundred' are read safely.", check_voice_traps),
    ("agent_grounding", "Agent only quotes the owner", "A phrase the owner did not say is dropped from the agent's brief.", check_agent_grounding),
    ("reply_guard", "Reply agent stays in its lane", "Sensitive messages go to the owner; a reply that contradicts the lock is never offered.", check_reply_guard),
    ("forecast_validation", "Forecast beats its baseline", "Leave-one-out error is lower than a single average, and unknown channels get no forecast.", check_forecast_validation),
    ("planner_limits", "Planner never exceeds a limit", "Random requests stay inside time, money and review limits.", check_planner_limits),
    ("referee", "Review referee never approves by default", "Unchecked or concerning assets always reach a human, over all 256 verdict combinations.", check_referee),
)


def run_all() -> dict[str, Any]:
    results = []
    for cid, title, proves, fn in CHECKS:
        try:
            total, failures = fn()
        except Exception as exc:  # noqa: BLE001 a crashing check is a failing check
            total, failures = 1, [f"check crashed: {exc}"]
        results.append({"id": cid, "title": title, "proves": proves, "total": total, "passed": total - len(failures), "failures": failures[:10],
                        "ok": not failures})
    return {"ok": all(r["ok"] for r in results), "checks": results,
            "note": "Offline checks on synthetic data. Passing does not mean the model never errs: it means these guards held."}


@router.get("/evals")
def evals() -> dict:
    return run_all()


if __name__ == "__main__":
    out = run_all()
    for r in out["checks"]:
        print(f"{'PASS' if r['ok'] else 'FAIL'}  {r['title']}: {r['passed']}/{r['total']}")
        for f in r["failures"]:
            print("      -", f)
    raise SystemExit(0 if out["ok"] else 1)
