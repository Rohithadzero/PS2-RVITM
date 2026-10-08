"""Code-mixed language probe: Kanglish / Hinglish understanding and casual-register copy.

Run: python apps/api/calibration/codemix_probe.py
Reads AGNES_API_KEY from project-root .env (via quick_calibrate.load_dotenv). Respects 10 RPM.
Saves data/calibration/codemix-<ts>.json for native-speaker review.
"""
import json
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import quick_calibrate as qc  # noqa: E402

# Spoken-style briefs (what STT would give). expected = the offer facts the owner meant.
EXTRACT_CASES = [
    ("kanglish_1", "Saturday mattu Sunday filter coffee mele ippattu percent off, bele nalvattentu rupayi, "
                   "beligge yenTu inda hattondu varege, dine-in mathra",
     {"discount_pct": 20, "price_inr": 48, "days": ["sat", "sun"], "terms": ["dine_in_only"]}),
    ("kanglish_2", "ee Sunday matra masala dosa mele hattu percent discount, nooraippattu rupayi alli sigutte, "
                   "sanje naalku inda aaru",
     {"discount_pct": 10, "price_inr": 120, "days": ["sun"]}),
    ("hinglish_1", "is weekend filter coffee pe bees percent off, price sirf achhtalis rupaye, Saturday aur Sunday, "
                   "subah aath se gyarah baje tak, sirf dine-in",
     {"discount_pct": 20, "price_inr": 48, "days": ["sat", "sun"], "terms": ["dine_in_only"]}),
    ("hinglish_2", "Sunday ko hi, masala dosa pe pachchees percent chhoot, sau rupaye mein, shaam paanch se saat",
     {"discount_pct": 25, "price_inr": 100, "days": ["sun"]}),
    ("selfcorrect_kanglish", "Saturday sunday offer, ippattu percent... alla alla hanneradu percent off, "
                            "filter coffee, bele hattu rupayi kadime",
     {"discount_pct": 12}),
    ("selfcorrect_hinglish", "Saturday ko offer hai, bees percent... nahi nahi pandrah percent off, filter coffee",
     {"discount_pct": 15, "days": ["sat"]}),
]

EXTRACT_PROMPT = (
    "The text is a spoken cafe-owner brief, transcribed from speech, in code-mixed Kannada/Hindi + English "
    "(possibly in Latin script). Extract the offer as JSON with keys: item, discount_pct (number), "
    "price_inr (number or null), days (list using sat,sun,mon,tue,wed,thu,fri), time_from, time_to, "
    "terms (list from: dine_in_only, while_stocks_last, one_per_customer, no_delivery). Apply any spoken "
    "self-correction (the last stated value wins). Do not guess: use null if not stated. "
    "Reply with ONLY JSON.\n\nText: "
)

REGISTERS = {
    "kn_formal_baseline": (
        "Write a short Instagram caption for a Bengaluru cafe offer in Kannada script. "
        "Placeholders to use exactly as written: {item}, {discount}, {price}, {days}, {time}, {terms}. "
        "Never write numbers, days or times yourself. Reply with ONLY the caption."),
    "kn_casual": (
        "Write a short Instagram caption for a neighbourhood cafe in Bengaluru, in the Kannada people actually "
        "speak in Bengaluru today: friendly, colloquial, like a cafe owner talking to regulars. Avoid formal or "
        "bookish Kannada (no ಸಂಸ್ಕೃತ-style words where a common spoken word exists). Kannada script only; the "
        "only Latin letters allowed are inside the placeholders. Common English words people really say in "
        "Kannada (like ಕಾಫಿ, ಆಫರ್, ಡೈನ್-ಇನ್) must be written in Kannada script. Placeholders exactly as written: "
        "{item}, {discount}, {price}, {days}, {time}, {terms}. Never write numbers, days or times yourself. "
        "Reply with ONLY the caption."),
    "kanglish": (
        "Write a short Instagram caption for a neighbourhood cafe in Bengaluru in Kanglish: casual spoken "
        "Kannada written in English (Latin) letters, with everyday English words mixed in, the way Bengaluru "
        "youngsters text. Not formal. Placeholders exactly as written: {item}, {discount}, {price}, {days}, "
        "{time}, {terms}. Never write numbers, days or times yourself. Reply with ONLY the caption."),
    "hinglish": (
        "Write a short Instagram caption for a neighbourhood cafe in Bengaluru in Hinglish: casual spoken Hindi "
        "written in English (Latin) letters, with everyday English words mixed in, the way young people text. "
        "Not formal. Placeholders exactly as written: {item}, {discount}, {price}, {days}, {time}, {terms}. "
        "Never write numbers, days or times yourself. Reply with ONLY the caption."),
    "hi_casual_devanagari": (
        "Write a short Instagram caption for a neighbourhood cafe in Bengaluru in casual spoken Hindi "
        "(Devanagari script) with everyday English words mixed in where natural, like friends talking. Not "
        "formal or bookish. Placeholders exactly as written: {item}, {discount}, {price}, {days}, {time}, "
        "{terms}. Never write numbers, days or times yourself. Reply with ONLY the caption."),
}


def close(a, b):
    return a is not None and b is not None and abs(float(a) - float(b)) < 1e-6


def main():
    qc.load_dotenv()
    key = os.environ.get("AGNES_API_KEY", "").strip()
    if not key:
        sys.exit("AGNES_API_KEY missing (put it in .env)")
    c = qc.Client(key)
    out = {"measured_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "extract": [], "copy": {}}

    print("== Understanding code-mixed briefs ==")
    ok_fields = total_fields = 0
    for name, text, expected in EXTRACT_CASES:
        resp, dt, err = c.chat(EXTRACT_PROMPT + text, max_tokens=300)
        if err:
            print(f"  {name}: FAILED {err}")
            out["extract"].append({"case": name, "error": err})
            continue
        got = qc.parse_json(qc.text_of(resp)) or {}
        checks = {}
        for k, v in expected.items():
            if k in ("discount_pct", "price_inr"):
                good = close(got.get(k), v)
            elif k in ("days", "terms"):
                good = set(got.get(k) or []) == set(v)
            else:
                good = got.get(k) == v
            checks[k] = good
            ok_fields += 1 if good else 0
            total_fields += 1
        print(f"  {name}: {dt:.1f}s {'OK ' if all(checks.values()) else 'MISS'} {checks}")
        out["extract"].append({"case": name, "input": text, "expected": expected, "got": got, "checks": checks})
    out["extract_field_accuracy"] = round(ok_fields / total_fields, 2) if total_fields else None
    print(f"  field accuracy: {ok_fields}/{total_fields}")

    print("\n== Casual-register copy (2 samples each) ==")
    for name, prompt in REGISTERS.items():
        samples = []
        for _ in range(2):
            resp, dt, err = c.chat(prompt, max_tokens=300)
            if err:
                samples.append({"error": err})
                print(f"  {name}: FAILED {err}")
                continue
            text = qc.text_of(resp).strip()
            latin_outside = ""
            import re
            stripped = re.sub(r"\{[a-z_]+\}", "", text)
            if name.startswith("kn_") or name.startswith("hi_"):
                latin_outside = "".join(ch for ch in stripped if ch.isascii() and ch.isalpha())
            samples.append({"text": text, "latin_letters_outside_slots": latin_outside, "seconds": round(dt, 2)})
            flag = f" LATIN='{latin_outside}'" if latin_outside else ""
            print(f"  {name} [{dt:.1f}s]{flag}: {text}")
        out["copy"][name] = samples

    d = Path(__file__).resolve().parents[3] / "data" / "calibration"
    d.mkdir(parents=True, exist_ok=True)
    f = d / f"codemix-{time.strftime('%Y%m%dT%H%M%S', time.gmtime())}.json"
    f.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nSaved {f}")


if __name__ == "__main__":
    main()
