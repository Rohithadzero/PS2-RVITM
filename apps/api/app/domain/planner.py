"""Budget planner: multi-dimensional knapsack with fixed charges (docs/knapsack-planner.md).

Resources: rate-limit time T, money M (list price, INR), owner review effort R. Copy is one batched call per
language, so picking any asset in a language pays that language's fixed charge once (binary y_lang). Reels are
a multiple-choice group enumerated outside the ILP. Solved exactly with scipy.optimize.milp (<= ~40 variables).
"""
from __future__ import annotations

import itertools
from dataclasses import dataclass, field

import numpy as np
from scipy.optimize import Bounds, LinearConstraint, milp

# ---- defaults (replaced by measured calibration values when present) ----------------------------------------------
DEFAULT_RPM = {"text": 10, "image": 10, "video": 1}
DEFAULT_LATENCY = {"text": 7.1, "image": 9.5, "video": 150.0}  # p50 seconds; text/image from calibration-results.md
USD_INR = 88.0
PRICE = {"text_in": 0.05 / 1e6, "text_out": 0.15 / 1e6, "image_1k": 0.010, "video_s": 0.025}  # USD, Agnes list price
TOKENS = {"copy_batch": (2200, 2600), "base": (1500, 1200), "pairwise": (1800, 900), "backtranslate": (1800, 900)}
REVIEW_S = {"copy": 20, "poster": 30, "reel": 45}
OVERHEAD_S = 12  # validation + scoring tail that cannot overlap
CHANNEL_WEIGHT = {"instagram": 1.0, "whatsapp": 1.0, "poster": 0.9, "sms": 0.8}
COVERAGE_BONUS = 3.0  # extra value the first time an (audience, language) pair is covered
REEL_VALUE = 4.0
BASE_TEXT_CALLS = 3          # brief, planner/diff, scoring
PER_LANG_TEXT_CALLS = 2      # copy batch + back-translation batch
OPTIMIZER_TEXT_CALLS = 2


@dataclass
class Calibration:
    rpm: dict = field(default_factory=lambda: dict(DEFAULT_RPM))
    latency: dict = field(default_factory=lambda: dict(DEFAULT_LATENCY))
    source: str = "defaults"


def _money_inr(text_calls_tokens: tuple[int, int], images: int, video_seconds: int) -> float:
    usd = text_calls_tokens[0] * PRICE["text_in"] + text_calls_tokens[1] * PRICE["text_out"]
    usd += images * PRICE["image_1k"] + video_seconds * PRICE["video_s"]
    return usd * USD_INR


def reel_clip_options(seconds: int, max_options: int = 3) -> list[tuple[int, ...]]:
    """Compositions of `seconds` into 4-12 s clips, fewest clips first (video calls cost 60 s each at 1 RPM)."""
    if seconds < 4:
        return []
    found = []
    for n in range(1, seconds // 4 + 1):
        for combo in itertools.combinations_with_replacement(range(4, 13), n):
            if sum(combo) == seconds:
                found.append(tuple(sorted(combo, reverse=True)))
        if found and n >= found[0].__len__() + 1:
            break
    found = sorted(set(found), key=lambda c: (len(c), c))
    return found[:max_options]


def _class_time(n_calls: int, rpm: float, latency: float) -> float:
    if n_calls <= 0:
        return 0.0
    return (n_calls - 1) * (60.0 / rpm) + latency


def _core(req: dict, calib: Calibration, poster_uses_photo: bool):
    """Best plan for a request (no alternatives). Returns (best_dict|None, reel_options, reels)."""
    wanted = req.get("wanted", [])
    limits = req.get("limits", {})
    t_lim = float(limits.get("time_s", 180))
    m_lim = float(limits.get("money_inr", 50))
    r_lim = float(limits.get("review_s", 480))
    reel_seconds = int(req.get("reel_seconds", 0) or 0)
    reels = int(req.get("reels", 1 if reel_seconds else 0) or 0)
    options = [()]
    if reel_seconds and reels:
        options += [tuple(c for _ in range(reels) for c in opt) for opt in reel_clip_options(reel_seconds)]
    best = None
    for opt in options:
        res = _solve_assets(wanted, opt, t_lim, m_lim, r_lim, calib, poster_uses_photo, reels if opt else 0)
        if res is None:
            continue
        res["total_value"] = res["value"] + (REEL_VALUE * reels if opt else 0)
        res["reel_clips"] = list(opt)
        if best is None or res["total_value"] > best["total_value"] + 1e-9:
            best = res
    return best, reel_seconds, reels


def solve(req: dict, calib: Calibration | None = None, poster_uses_photo: bool = True) -> dict:
    """req: {wanted:[{lang,channel,audience_id,priority?}], reel_seconds:int, reels:int, limits:{time_s,money_inr,review_s}}"""
    calib = calib or Calibration()
    wanted = req.get("wanted", [])
    t_lim = float(req.get("limits", {}).get("time_s", 180))
    best, reel_seconds, reels = _core(req, calib, poster_uses_photo)
    if best is None:
        return {"feasible": False, "chosen": {"assets": [], "reel_clips": []},
                "dropped": [{"item": "everything", "reason": "even the cheapest plan exceeds a limit"}],
                "cost": None, "binding": ["limits"], "alternatives": []}
    chosen_keys = set(best["chosen"])
    dropped = [{"item": _key(w), "reason": best["why_dropped"]} for w in wanted if _key(w) not in chosen_keys]
    if reel_seconds and reels and not best["reel_clips"]:
        opts = reel_clip_options(reel_seconds)
        calls = len(opts[0]) * reels if opts else 1
        need = _class_time(calls, calib.rpm["video"], calib.latency["video"])
        dropped.append({"item": f"{reels} reel(s) of {reel_seconds}s",
                        "reason": f"video queue needs about {round(need)} s ({calls} clip(s) at {calib.rpm['video']} RPM); "
                                  f"time limit {round(t_lim)} s"})
    return {
        "feasible": True,
        "chosen": {"assets": sorted(chosen_keys), "reel_clips": best["reel_clips"]},
        "dropped": dropped,
        "cost": best["cost"],
        "binding": best["binding"],
        "calibration": {"source": calib.source, "rpm": calib.rpm, "latency_s": calib.latency},
        "alternatives": _alternatives(req, calib, poster_uses_photo),
    }


def _alternatives(req: dict, calib: Calibration, poster_uses_photo: bool) -> list[dict]:
    variants = []
    if req.get("reel_seconds"):
        variants.append(("without reels", {**req, "reel_seconds": 0, "reels": 0}))
    if not (req.get("reel_seconds") == 12 and int(req.get("reels", 1)) == 1):
        variants.append(("one 12 s reel", {**req, "reel_seconds": 12, "reels": 1}))
    alts = []
    for label, rq in variants:
        best, _, _ = _core(rq, calib, poster_uses_photo)
        if best:
            alts.append({"label": f"{len(best['chosen'])} assets + {len(best['reel_clips'])} clip(s), {label}",
                         "cost": best["cost"], "fits": True})
    return alts


def _key(w: dict) -> str:
    return f"{w['audience_id']}-{w['lang']}-{w['channel']}"


def _solve_assets(wanted, reel_clips, t_lim, m_lim, r_lim, calib, poster_uses_photo, reels):
    n = len(wanted)
    langs = sorted({w["lang"] for w in wanted})
    auds = sorted({w["audience_id"] for w in wanted})
    pairs = sorted({(w["audience_id"], w["lang"]) for w in wanted})
    posters_aud = sorted({w["audience_id"] for w in wanted if w["channel"] == "poster"})
    # variable layout: x_0..x_{n-1} assets, y_lang, z_audience(image), c_pair coverage
    nv = n + len(langs) + len(auds) + len(pairs)
    iy = {l: n + i for i, l in enumerate(langs)}
    iz = {a: n + len(langs) + i for i, a in enumerate(auds)}
    ic = {p: n + len(langs) + len(auds) + i for i, p in enumerate(pairs)}

    rpm, lat = calib.rpm, calib.latency
    text_spacing = 60.0 / rpm["text"]
    img_spacing = 60.0 / rpm["image"]
    base_text = BASE_TEXT_CALLS + OPTIMIZER_TEXT_CALLS

    video_calls = len(reel_clips)
    video_seconds = sum(reel_clips)
    video_time = _class_time(video_calls, rpm["video"], lat["video"])

    # ---- objective (milp minimizes) ----
    c = np.zeros(nv)
    for i, w in enumerate(wanted):
        c[i] = -(float(w.get("priority", 3)) * CHANNEL_WEIGHT.get(w["channel"], 1.0))
    for p in pairs:
        c[ic[p]] = -COVERAGE_BONUS

    A, lo, hi = [], [], []

    def row(coefs, low, high):
        r = np.zeros(nv)
        for k, v in coefs.items():
            r[k] = v
        A.append(r); lo.append(low); hi.append(high)

    # linking: x_i <= y_lang ; poster x_i <= z_aud ; c_pair <= sum x in pair
    for i, w in enumerate(wanted):
        row({i: 1, iy[w["lang"]]: -1}, -np.inf, 0)
        if w["channel"] == "poster" and not poster_uses_photo:
            row({i: 1, iz[w["audience_id"]]: -1}, -np.inf, 0)
    for p in pairs:
        row({**{i: -1 for i, w in enumerate(wanted) if (w["audience_id"], w["lang"]) == p}, ic[p]: 1}, -np.inf, 0)
    # image fixed charges only matter when posters need generated backgrounds
    for a in auds:
        if poster_uses_photo or a not in posters_aud:
            row({iz[a]: 1}, 0, 0)

    # text calls: base + per language batches
    text_coefs = {iy[l]: PER_LANG_TEXT_CALLS for l in langs}
    img_coefs = {iz[a]: 1 for a in auds}
    # time per class (parallel buckets): (calls-1)*spacing + latency <= t_lim - overhead
    row({k: v * text_spacing for k, v in text_coefs.items()}, -np.inf, t_lim - OVERHEAD_S - lat["text"] + text_spacing - base_text * text_spacing)
    if not poster_uses_photo:
        row({k: v * img_spacing for k, v in img_coefs.items()}, -np.inf, t_lim - OVERHEAD_S - lat["image"] + img_spacing)
    if video_calls and video_time > t_lim - OVERHEAD_S:
        return None  # this reel option cannot finish inside the time limit
    # money
    per_text_call_money = _money_inr(TOKENS["copy_batch"], 0, 0)
    money_const = _money_inr((TOKENS["base"][0] * BASE_TEXT_CALLS + TOKENS["pairwise"][0] * OPTIMIZER_TEXT_CALLS,
                              TOKENS["base"][1] * BASE_TEXT_CALLS + TOKENS["pairwise"][1] * OPTIMIZER_TEXT_CALLS), 0, video_seconds)
    money_coefs = {iy[l]: per_text_call_money + _money_inr(TOKENS["backtranslate"], 0, 0) for l in langs}
    if not poster_uses_photo:
        money_coefs.update({iz[a]: _money_inr((0, 0), 1, 0) for a in auds})
    row(money_coefs, -np.inf, m_lim - money_const)
    # review effort
    review_const = REVIEW_S["reel"] * reels
    row({i: REVIEW_S["poster"] if w["channel"] == "poster" else REVIEW_S["copy"] for i, w in enumerate(wanted)},
        -np.inf, r_lim - review_const)

    cons = LinearConstraint(np.array(A), np.array(lo), np.array(hi)) if A else None
    res = milp(c, constraints=cons, integrality=np.ones(nv), bounds=Bounds(0, 1))
    if not res.success:
        return None
    x = np.round(res.x).astype(int)
    chosen = [_key(w) for i, w in enumerate(wanted) if x[i]]
    chosen_langs = [l for l in langs if x[iy[l]]]
    text_calls = base_text + PER_LANG_TEXT_CALLS * len(chosen_langs)
    image_calls = 0 if poster_uses_photo else sum(int(x[iz[a]]) for a in auds)
    t_text = _class_time(text_calls, rpm["text"], lat["text"])
    t_img = _class_time(image_calls, rpm["image"], lat["image"])
    time_est = max(t_text, t_img, video_time) + OVERHEAD_S
    money = money_const + sum(money_coefs.get(iy[l], 0) for l in chosen_langs) + \
        (sum(money_coefs.get(iz[a], 0) * int(x[iz[a]]) for a in auds) if not poster_uses_photo else 0)
    review = review_const + sum((REVIEW_S["poster"] if w["channel"] == "poster" else REVIEW_S["copy"])
                                for i, w in enumerate(wanted) if x[i])
    cost = {"time_s": round(time_est, 1), "money_inr": round(money, 2), "review_s": round(review),
            "calls": {"text": text_calls, "image": image_calls, "video": video_calls}}
    binding = [name for name, used, lim in (("time_s", time_est, t_lim), ("money_inr", money, m_lim), ("review_s", review, r_lim))
               if used >= 0.9 * lim]
    value = float(-res.fun)
    why = "over the review limit" if "review_s" in binding else ("over the time limit" if "time_s" in binding else "over a limit")
    return {"chosen": chosen, "cost": cost, "binding": binding, "value": value, "why_dropped": why}
