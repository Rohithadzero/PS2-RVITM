from __future__ import annotations

import asyncio
import json
import re
from typing import Any

from fastapi import FastAPI

from app import channels, plan, review
from app.agnes import AgnesError
from app.prompts import brief_messages, copy_messages, review_messages
from app.schemas import OfferFacts
from app.service import Service, now

# One rewrite with the rejection reasons fed back. More would spend the 10 RPM text budget on a lost cause.
REPAIR_LIMIT = 1


def parse_json_object(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start >= 0 and end > start:
        cleaned = cleaned[start : end + 1]
    parsed = json.loads(cleaned)
    if not isinstance(parsed, dict):
        raise ValueError("model output was not a JSON object")
    return parsed


def spawn(app: FastAPI, coro) -> None:
    task = asyncio.create_task(coro)
    app.state.tasks.add(task)
    task.add_done_callback(app.state.tasks.discard)


def start_jobs(app: FastAPI, jobs: list[dict[str, Any]]) -> None:
    runners = {"copy": run_copy_job, "review": run_review_job}
    for job in jobs:
        spawn(app, runners[job["kind"]](app, job["id"]))


def _payload(job: dict[str, Any]) -> dict[str, Any]:
    return json.loads(job["payload"]) if job.get("payload") else {}


def _repair(app: FastAPI, service: Service, asset: dict[str, Any], content: str, issues: list[str], attempt: int) -> None:
    if attempt >= REPAIR_LIMIT:
        service.db.log(now(), "system", "repair_exhausted", "Left blocked for the owner.", asset["campaign_id"])
        return
    job = service.queue_job(
        asset,
        "copy",
        has_key=True,
        payload={"attempt": attempt + 1, "feedback": {"previous": content, "issues": issues}},
        detail="Rewriting with the rejection reasons.",
    )
    start_jobs(app, [job])


async def run_copy_job(app: FastAPI, job_id: str) -> None:
    db = app.state.db
    job = db.job_get(job_id)
    if not job or job["status"] != "queued" or job["kind"] != "copy":
        return
    db.job_update(job_id, now(), status="running", detail="Writing copy.")
    service = Service(db)
    attempt = int(_payload(job).get("attempt", 0))
    try:
        asset = db.asset_get(job["asset_id"])
        facts_row = db.facts_approved(job["campaign_id"])
        if asset is None or facts_row is None:
            raise ValueError("asset or locked facts disappeared")
        facts = OfferFacts.model_validate_json(facts_row["json"])
        messages = copy_messages(facts, asset, _payload(job).get("feedback"), plan.copy_context(db, job["campaign_id"]))
        raw = await app.state.agnes.chat(messages, cache_kind="copy", max_tokens=2400)
        payload = parse_json_object(raw)
        content, extra = channels.parse_output(asset["channel"], payload)
        declared = payload.get("facts_used")
        declared = [str(field) for field in declared] if isinstance(declared, list) else []
        result = channels.validate_asset(asset["channel"], content, extra, facts, strict=True)
        needs_review = result.ok and asset["lang"] != "en"
        service.store_copy(
            asset["id"],
            content,
            result,
            facts,
            facts_row["version"],
            declared,
            review_status=review.CHECKING if needs_review else review.NOT_NEEDED if result.ok else None,
            extra=extra,
        )
        text = channels.visible_text(asset["channel"], content, extra)
        db.job_update(
            job_id,
            now(),
            status="completed" if result.ok else "blocked",
            detail="Copy ready for review." if result.ok else result.messages()[0],
        )
        if needs_review:
            check = service.queue_job(
                asset,
                "review",
                has_key=True,
                payload={"attempt": attempt, "content_hash": review.content_hash(text)},
                detail="Checking the meaning by back-translation.",
            )
            start_jobs(app, [check])
        elif not result.ok:
            _repair(app, service, asset, text, result.messages(), attempt)
    except (AgnesError, ValueError, json.JSONDecodeError) as exc:
        db.job_update(job_id, now(), status="failed", detail=str(exc)[:500])
        db.log(now(), "system", "copy_failed", str(exc)[:500], job["campaign_id"])


async def run_review_job(app: FastAPI, job_id: str) -> None:
    db = app.state.db
    job = db.job_get(job_id)
    if not job or job["status"] != "queued" or job["kind"] != "review":
        return
    db.job_update(job_id, now(), status="running", detail="Back-translating.")
    service = Service(db)
    payload = _payload(job)
    try:
        asset = db.asset_get(job["asset_id"])
        facts_row = db.facts_approved(job["campaign_id"])
        if asset is None or facts_row is None:
            raise ValueError("asset or locked facts disappeared")
        content = service.asset_text(asset)
        if review.content_hash(content) != payload.get("content_hash"):
            db.job_update(job_id, now(), status="superseded", detail="The copy changed before the check finished.")
            return
        facts = OfferFacts.model_validate_json(facts_row["json"])
        ctx = plan.copy_context(db, job["campaign_id"]) or {}
        names = [ctx.get("business_name"), ctx.get("area"), facts.item]
        # Three independent blind passes. A complaint blocks only when 2 of them agree; a failed pass abstains.
        replies = await asyncio.gather(
            *(
                app.state.agnes.chat(review_messages(content, asset["lang"], names, v), cache_kind=kind, temperature=0)
                for v, kind in enumerate(("review", "review2", "review3"))
            ),
            return_exceptions=True,
        )
        parsed: list[dict[str, Any] | None] = []
        for reply in replies:
            try:
                parsed.append(None if isinstance(reply, BaseException) else parse_json_object(reply))
            except (ValueError, json.JSONDecodeError):
                parsed.append(None)
        if not any(parsed):
            raise next(r for r in replies if isinstance(r, BaseException)) if any(
                isinstance(r, BaseException) for r in replies
            ) else ValueError("no usable review pass")
        lead = next(i for i, p in enumerate(parsed) if p is not None)
        # Back-translation rules run on the first usable pass (pass 1 unless it failed).
        outcome = review.assess(parsed[lead], facts, content, *(p for i, p in enumerate(parsed) if i != lead))
        if not service.store_review(asset["id"], outcome):
            db.job_update(job_id, now(), status="superseded", detail="The copy changed before the check finished.")
            return
        flagged = outcome["status"] == review.FLAGGED
        db.job_update(
            job_id,
            now(),
            status="blocked" if flagged else "completed",
            detail=outcome["issues"][0] if outcome["issues"] else "Meaning matches the locked offer.",
        )
        if flagged:
            # The owner's own words are flagged for them to fix, never rewritten behind their back.
            attempt = REPAIR_LIMIT if payload.get("owner_edit") else int(payload.get("attempt", 0))
            _repair(app, service, asset, content, outcome["issues"], attempt)
    except (AgnesError, ValueError, json.JSONDecodeError) as exc:
        asset = db.asset_get(job["asset_id"])
        if asset and review.content_hash(service.asset_text(asset)) == payload.get("content_hash"):
            service.store_review(asset["id"], {"status": review.FAILED, "issues": [str(exc)[:300]],
                                               "content_hash": payload.get("content_hash")})
        db.job_update(job_id, now(), status="failed", detail=str(exc)[:500])
        db.log(now(), "system", "review_failed", str(exc)[:500], job["campaign_id"])


async def run_brief_job(app: FastAPI, job_id: str) -> None:
    db = app.state.db
    job = db.job_get(job_id)
    if not job or job["status"] != "queued" or job["kind"] != "brief":
        return
    db.job_update(job_id, now(), status="running", detail="Reading the transcript.")
    service = Service(db)
    try:
        campaign = db.campaign_get(job["campaign_id"])
        if campaign is None:
            raise ValueError("campaign disappeared")
        raw = await app.state.agnes.chat(brief_messages(campaign["transcript"]), cache_kind="brief")
        payload = parse_json_object(raw)
        service.store_suggestion(job["campaign_id"], payload)
        db.job_update(job_id, now(), status="completed", detail="Suggestion stored. It is not locked.")
    except (AgnesError, ValueError, json.JSONDecodeError) as exc:
        db.job_update(job_id, now(), status="failed", detail=str(exc)[:500])
        db.log(now(), "system", "brief_failed", str(exc)[:500], job["campaign_id"])
