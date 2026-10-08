"""Follow-up probe: mitigations for number-word errors and formal Kannada. See docs/calibration-results.md."""
import json, os, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import quick_calibrate as qc
import codemix_probe as cp

GLOSSARY = (
    "Number words (Latin script, spoken): "
    "Hindi: ek=1 do=2 teen=3 char=4 paanch=5 chhe=6 saat=7 aath=8 nau=9 das=10 gyarah=11 barah=12 pandrah=15 "
    "bees=20 pachchees=25 tees=30 chaalis=40 pachaas=50 sau=100 ek sau bees=120 achhtalis=48 "
    "Kannada: ondu=1 eradu=2 mooru=3 naalku=4 aidu=5 aaru=6 elu=7 entu=8 ombattu=9 hattu=10 hannondu=11 "
    "hanneradu=12 hadinaidu=15 ippattu=20 ippattaidu=25 muvattu=30 nalavattu=40 aivattu=50 nooru=100 "
    "nooraippattu=120 nalvattentu=48. "
    "Convert every spoken number to digits carefully; percent means discount_pct, rupayi/rupaye/rupees means price_inr. ")

def run():
    cp.qc.load_dotenv()
    c = qc.Client(os.environ["AGNES_API_KEY"])
    out = {"extract": {}, "kn_rewrite": []}
    variants = {
        "thinking_on": (cp.EXTRACT_PROMPT, True),
        "glossary": (GLOSSARY + cp.EXTRACT_PROMPT, False),
        "glossary_thinking": (GLOSSARY + cp.EXTRACT_PROMPT, True),
    }
    for vname, (prompt, think) in variants.items():
        ok = tot = 0; rows = []
        for name, text, expected in cp.EXTRACT_CASES:
            body = {"model": qc.TEXT_MODEL, "messages": [{"role": "user", "content": prompt + text}],
                    "max_tokens": 1500 if think else 300, "temperature": 0,
                    "chat_template_kwargs": {"enable_thinking": think}}
            resp, dt, err = c.post("/chat/completions", body, 180)
            if err: rows.append({"case": name, "error": err}); continue
            got = qc.parse_json(qc.text_of(resp)) or {}
            row = {"case": name, "dt": round(dt, 1)}
            for k in ("discount_pct", "price_inr"):
                if k in expected:
                    tot += 1; good = cp.close(got.get(k), expected[k]); ok += good; row[k] = (got.get(k), expected[k], good)
            rows.append(row)
        out["extract"][vname] = {"numeric_accuracy": f"{ok}/{tot}", "rows": rows}
        print(vname, f"{ok}/{tot}", [(r["case"], r.get("discount_pct"), r.get("price_inr")) for r in rows])
    baseline = ("ಈ ವಾರಾಂತ್ಯದಲ್ಲಿ {item} ಮೇಲೆ {discount} ರಿಯಾಯಿತಿ! {days}, {time}. {terms}")
    prompt = ("Below is a Kannada cafe offer caption. A native Kannada speaker said it is correct but TOO FORMAL. "
              "Rewrite it the way a friendly Bengaluru cafe owner would actually speak to regulars: use short "
              "spoken forms (e.g. ಇವತ್ತು, ಬನ್ನಿ, ಸಿಗುತ್ತೆ, ಮಾಡ್ತೀವಿ) and common words, keep the SAME facts and the "
              "SAME placeholders exactly ({item},{discount},{days},{time},{terms}), add no new facts and no new "
              "words you are unsure of. Kannada script only. Reply with ONLY the caption.\n\nCaption: " + baseline)
    for _ in range(3):
        resp, dt, err = c.chat(prompt, max_tokens=300)
        t = qc.text_of(resp).strip() if not err else err
        out["kn_rewrite"].append(t); print("kn_rewrite:", t)
    d = Path(__file__).resolve().parents[3] / "data" / "calibration"
    (d / f"codemix2-{time.strftime('%Y%m%dT%H%M%S', time.gmtime())}.json").write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
run()
