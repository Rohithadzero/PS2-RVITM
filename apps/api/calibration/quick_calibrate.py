"""Quick calibration for the default Agnes provider (see docs/calibration.md).

Usage (key from environment only, never printed or written to disk):
    set AGNES_API_KEY=...            (PowerShell: $env:AGNES_API_KEY="...")
    python apps/api/calibration/quick_calibrate.py [--no-image] [--repeats 3]

Writes data/calibration/agnes-<timestamp>.json and prints a summary.
Respects the Free tier: text 10 RPM, image 1K 10 RPM (calls spaced >= 6.5 s apart).
"""
import argparse
import json
import os
import statistics
import sys
import time
from pathlib import Path

import requests

BASE = "https://apihub.agnes-ai.com/v1"
TEXT_MODEL = "agnes-3.0-flash"
IMAGE_MODEL = "agnes-image-2.5-flash"
SPACING_S = 6.5  # 60 / 10 RPM plus margin
TEXT_TIMEOUT = 120
IMAGE_TIMEOUT = 240

FACTS_SENTENCE = ("Weekend filter coffee offer, 20 percent off, price 48 rupees instead of 60, "
                  "Saturday and Sunday, 8 to 11 in the morning, dine-in only.")

JSON_PROMPT = (
    "Extract the offer from the text as JSON with keys item, discount_pct, price_inr, "
    "original_price_inr, days (list of sat/sun/...), time_from, time_to, terms (list). "
    "Reply with ONLY JSON.\n\nText: " + FACTS_SENTENCE
)

COPY_PROMPT = (
    "Write one short Instagram caption for a cafe offer in each of Kannada, Hindi and English. "
    "Write natively in each language (do not translate word for word). Never write numbers, days "
    "or times yourself: use ONLY these placeholders exactly as written: {item}, {discount}, "
    "{price}, {days}, {time}, {terms}. Reply with ONLY JSON: "
    '{"kn":"...","hi":"...","en":"..."}'
)

PAIR_PROMPT = (
    "You are a customer: office worker, lunch rush, prefers English with some Hindi. Two captions "
    "for the same cafe offer follow. Which would you respond to? Reply with ONLY JSON: "
    '{"winner":"A"|"B","clarity":1-10,"appeal":1-10,"trust":1-10,"local_feel":1-10,"cta":1-10,'
    '"reason":"..."}\n\nA: Weekend special at our cafe! {discount} off {item}, {days} {time}. {terms}\n'
    "B: Hungry? Grab {item} at {price} this {days}, {time}. {terms}"
)

TOOLS = [{
    "type": "function",
    "function": {
        "name": "record_offer",
        "description": "Record the extracted offer",
        "parameters": {
            "type": "object",
            "properties": {"item": {"type": "string"}, "discount_pct": {"type": "number"}},
            "required": ["item", "discount_pct"],
        },
    },
}]


def pct(values, q):
    if not values:
        return None
    s = sorted(values)
    idx = max(0, min(len(s) - 1, int(round(q * len(s) + 0.5)) - 1))
    return round(s[idx], 2)


class Client:
    def __init__(self, key):
        self.h = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
        self.last_call = 0.0
        self.rate_headers = {}

    def _wait(self):
        gap = SPACING_S - (time.monotonic() - self.last_call)
        if gap > 0:
            time.sleep(gap)

    def post(self, path, body, timeout):
        self._wait()
        t0 = time.monotonic()
        try:
            r = requests.post(BASE + path, headers=self.h, json=body, timeout=timeout)
        except requests.RequestException as e:
            self.last_call = time.monotonic()
            return None, time.monotonic() - t0, f"{type(e).__name__}"
        self.last_call = time.monotonic()
        dt = self.last_call - t0
        for k, v in r.headers.items():
            if k.lower().startswith("x-ratelimit") or k.lower() == "retry-after":
                self.rate_headers[k.lower()] = v
        if r.status_code != 200:
            # never echo request headers/body; response text is truncated and key-free
            return None, dt, f"HTTP {r.status_code}: {r.text[:200]}"
        try:
            return r.json(), dt, None
        except ValueError:
            return None, dt, "non-JSON response"

    def chat(self, content, tools=None, max_tokens=1200):
        body = {
            "model": TEXT_MODEL,
            "messages": [{"role": "user", "content": content}],
            "max_tokens": max_tokens,
            "temperature": 0,
            "chat_template_kwargs": {"enable_thinking": False},
        }
        if tools:
            body["tools"] = tools
            body["tool_choice"] = {"type": "function", "function": {"name": "record_offer"}}
        return self.post("/chat/completions", body, TEXT_TIMEOUT)


def text_of(resp):
    try:
        return resp["choices"][0]["message"].get("content") or ""
    except (KeyError, IndexError, TypeError):
        return ""


def parse_json(s):
    s = s.strip()
    if s.startswith("```"):
        s = s.strip("`")
        s = s[s.find("{"):]
    try:
        return json.loads(s[s.find("{"): s.rfind("}") + 1])
    except ValueError:
        return None


def has_kannada(s):
    return any("ಀ" <= ch <= "೿" for ch in s)


def has_devanagari(s):
    return any("ऀ" <= ch <= "ॿ" for ch in s)


def load_dotenv():
    """Load KEY=VALUE lines from the project-root .env into os.environ (without overriding)."""
    root = Path(__file__).resolve().parents[3]
    env = root / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def run(args):
    load_dotenv()
    key = os.environ.get("AGNES_API_KEY", "").strip()
    if not key:
        sys.exit("AGNES_API_KEY is not set (environment only; do not pass keys on the command line).")
    c = Client(key)
    result = {
        "provider": "agnes", "model": TEXT_MODEL, "mode": "quick",
        "measured_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "tier_assumed": "free", "limits": {"rpm_text": 10, "rpm_image_1k": 10, "source": "tier_preset"},
        "latency_s": {}, "tokens": {}, "errors": [],
    }
    lat = {"ping": [], "json": [], "copy_batch": [], "pairwise": []}
    tok = {}
    json_ok = json_n = 0

    def note(name, resp, dt, err):
        if err:
            result["errors"].append({"probe": name, "error": err})
            print(f"  {name}: FAILED {err}")
            return False
        lat[name].append(dt)
        u = resp.get("usage") or {}
        tok.setdefault(name, []).append((u.get("prompt_tokens"), u.get("completion_tokens")))
        return True

    print(f"Agnes quick calibration ({TEXT_MODEL}); calls spaced {SPACING_S}s for 10 RPM")

    # P1 ping
    resp, dt, err = c.chat("Reply with exactly: OK", max_tokens=16)
    if note("ping", resp, dt, err):
        print(f"  ping: {dt:.2f}s -> {text_of(resp).strip()[:20]!r}")
    if not lat["ping"]:
        print("Ping failed; stopping (check key/plan/network).")
        finish(result, lat, tok, 0, 0, c, args)
        return

    # P2 json (repeated)
    for _ in range(args.repeats):
        resp, dt, err = c.chat(JSON_PROMPT, max_tokens=300)
        if note("json", resp, dt, err):
            json_n += 1
            parsed = parse_json(text_of(resp))
            ok = bool(parsed) and parsed.get("discount_pct") == 20 and parsed.get("price_inr") == 48
            json_ok += 1 if ok else 0
            print(f"  json: {dt:.2f}s valid={ok}")

    # P3 tools
    resp, dt, err = c.chat("Record this offer: 20 percent off filter coffee.", tools=TOOLS, max_tokens=200)
    tools_supported = False
    if err:
        result["errors"].append({"probe": "tools", "error": err})
        print(f"  tools: FAILED {err}")
    else:
        tools_supported = bool((resp["choices"][0]["message"].get("tool_calls")))
        print(f"  tools: {dt:.2f}s supported={tools_supported}")

    # P4 copy batch (Kannada/Hindi/English with slots)
    kn_ok = hi_ok = slots_ok = False
    sample = None
    for _ in range(args.repeats):
        resp, dt, err = c.chat(COPY_PROMPT, max_tokens=1500)
        if note("copy_batch", resp, dt, err):
            data = parse_json(text_of(resp)) or {}
            sample = data or sample
            kn_ok = kn_ok or has_kannada(data.get("kn", ""))
            hi_ok = hi_ok or has_devanagari(data.get("hi", ""))
            slots_ok = all("{" in data.get(k, "") for k in ("kn", "hi", "en")) or slots_ok
            stray = any(ch.isdigit() for k in ("kn", "hi", "en") for ch in data.get(k, "") if True)
            print(f"  copy_batch: {dt:.2f}s kn_script={has_kannada(data.get('kn',''))} "
                  f"hi_script={has_devanagari(data.get('hi',''))} digits_outside_slots={stray}")

    # P5 pairwise
    for _ in range(args.repeats):
        resp, dt, err = c.chat(PAIR_PROMPT, max_tokens=500)
        if note("pairwise", resp, dt, err):
            ok = bool((parse_json(text_of(resp)) or {}).get("winner"))
            print(f"  pairwise: {dt:.2f}s valid={ok}")

    # Image 1K
    image = None
    if not args.no_image:
        body = {"model": IMAGE_MODEL, "prompt": "Warm cafe table with an empty ceramic cup, soft morning light, "
                "no text, no logos", "size": "1K", "ratio": "1:1"}
        resp, dt, err = c.post("/images/generations", body, IMAGE_TIMEOUT)
        if err:
            result["errors"].append({"probe": "image_1k", "error": err})
            print(f"  image 1K: FAILED {err}")
        else:
            item = (resp.get("data") or [{}])[0]
            image = {"size": "1K", "seconds": round(dt, 2), "has_url": bool(item.get("url")),
                     "has_b64": bool(item.get("b64_json"))}
            print(f"  image 1K: {dt:.2f}s url={image['has_url']}")

    result["kannada"] = {"script_ok": kn_ok, "hindi_script_ok": hi_ok, "slots_used": slots_ok,
                         "needs_native_review": True,
                         "sample_for_native_review": sample}
    result["tools_supported"] = tools_supported
    result["image"] = image
    finish(result, lat, tok, json_ok, json_n, c, args)


def finish(result, lat, tok, json_ok, json_n, c, args):
    for name, vals in lat.items():
        result["latency_s"][name] = {"n": len(vals), "p50": pct(vals, 0.5), "p90": pct(vals, 0.9)}
    for name, pairs in tok.items():
        ins = [p[0] for p in pairs if p[0] is not None]
        outs = [p[1] for p in pairs if p[1] is not None]
        result["tokens"][name] = {"in": round(statistics.mean(ins)) if ins else None,
                                  "out": round(statistics.mean(outs)) if outs else None}
    result["json_valid_rate"] = round(json_ok / json_n, 2) if json_n else None
    result["rate_limit_headers_seen"] = c.rate_headers
    out_dir = Path(__file__).resolve().parents[3] / "data" / "calibration"
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"agnes-{time.strftime('%Y%m%dT%H%M%S', time.gmtime())}.json"
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nSaved {out}")
    print(json.dumps({k: result[k] for k in ("latency_s", "tokens", "json_valid_rate", "tools_supported",
                                              "errors") if k in result}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-image", action="store_true")
    ap.add_argument("--repeats", type=int, default=3)
    run(ap.parse_args())
