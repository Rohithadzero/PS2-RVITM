"""Live eval of the Kannada/Hindi copy gate: 8 labelled cases through the real three-pass reviewer.

Run from apps/api:  .venv/bin/python scripts/eval_review_live.py
Uses the key in the repo .env. Each case makes 2 reviewer calls (three passes in parallel), 16 calls in all.
A case is judged the way the pipeline judges it: the deterministic validator on the copy, then review.assess.
Exit code 1 on any miss.
"""
from __future__ import annotations

import asyncio
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import channels, review  # noqa: E402
from app.agnes import Agnes  # noqa: E402
from app.config import load_settings  # noqa: E402
from app.db import Database  # noqa: E402
from app.prompts import review_messages  # noqa: E402
from app.queue import Buckets  # noqa: E402
from app.schemas import OfferFacts  # noqa: E402
from app.worker import parse_json_object  # noqa: E402

NAMES = ["Brew Bandi Cafe", "Indiranagar", "filter coffee"]


def facts(timings: str) -> OfferFacts:
    return OfferFacts(item="filter coffee", discount_percent=20, price_amount=80, timings=timings,
                      terms="dine-in only", audiences=["regulars"])


SUN, SATSUN = facts("Sunday only"), facts("Saturday and Sunday")

CASES = [
    ("BAD", "kn", "repetitive gibberish", SUN,
     "ಗ್ರಹದ ಗಿಳಿಗಳು, ಫೈಲ್ಟರ್ ಕಾಫಿ ತುಂಬಿರುವ ಒಂದು ಅಚ್ಚುಮೆಚ್ಚಿನ ಅನುಭವವನ್ನು ನಿಮ್ಮೊಂದಿಗೆ ಹಂಚಿಕೊಳ್ಳುತ್ತೇವೆ! ಈ ಏಳೈದು ಪ್ರಶಂಸೆಗಳ ನೆರಳಿನಲ್ಲಿ, "
     "ಕೆಳಗಿನ ಒಂದು ಅನುಚಿತ ದಾಖಲೆ ಇದ್ದರೆ, ಶ್ರೀಕೆರಿಯಲ್ಲಿ ಒಂದೇ ಏಳೈದು ನೆರೆಗಳಿಸುವ ಪ್ರಯೋಜನವಾಗಿದೆ. ಈ ಏಳೈದು ಪ್ರಯೋಜನದ ಫೈಲ್ಟರ್ ಕಾಫಿ ಭಾನುವಾರ "
     "80 ರೂಪಾಯಿಗೆ 20% ರಿಯಾಯಿತಿ. ನೀವು ಇದನ್ನು ಬಳಸಿಕೊಳ್ಳಬೇಕಾದರೆ, ಈ ಏಳೈದು ಕೆಳಗಿನ ಒಂದು ದಾಖಲೆಯನ್ನು ಒಂದು ಇ-ಮೇಲ್ ಮೂಲಕ ಒಂದು ಪಿಡಿಎಫ್ ಆಗಿ "
     "ನಮಗೂ ಕಳುಹಿಸಿ. ಈ ಏಳೈದು ಕೆಳಗಿನ ಒಂದು ದಾಖಲೆಯನ್ನು ಒಂದು ಇ-ಮೇಲ್ ಮೂಲಕ ಒಂದು ಪಿಡಿಎಫ್ ಆಗಿ ನಮಗೂ ಕಳುಹಿಸಿ."),
    ("BAD", "kn", "garbled sentences, valid facts", SUN,
     "ನಮ್ಮ ಫಿಲ್ಟರ್ ಕೆಫೀಗಿಗೆ 20% ರಿಯಾಯಿತಿ. ಭಾನುವಾರ ಮಾತ್ರ ಒಂದು ದಿನ. ಬೆಲೆ 80 ರೂಪಾಯಿ. ಖಾತೆ ಒಳಗೆ ಕುಳಿತು ಕಾಯಿಂಗೊಳ್ಳಿ. "
     "ನಮ್ಮ ಸ್ವಂತರು ಬಂದು ಗಿಡುಗಿಡ ಮಾಡಿರಿ!"),
    ("BAD", "kn", "invented weekday, sat+sun lock", SATSUN,
     "ನಮ್ಮ ದಿನಬಳಕೆಯ ಕುಶಲುಗಳಿಗೆ! ಪ್ರತಿ ಶನಿವಾರ ಮತ್ತು ಏಳವಾರದಿಂದ ನಿಮ್ಮ ಪಾಲಿಗೆ ವಿಶೇಷ ಫಿಲ್ಟರ್ ಕಾಫಿ ಆಫರ್ 20% ರಿಯಾಯಿತಿ ₹80."),
    ("BAD", "hi", "garbled Hindi, repeated line", SUN,
     "रविवार केलिए खसल: आपकस फिल्टर कफी अब सिर्फ 80 रुपरस म, याने पहीले क मुल्यक 20% चोट। यद डइनइन केले करेन, तर य सलामत हए। "
     "रविवार केलिए, रविवार केलिए, रविवार केलिए!"),
    ("BAD", "kn", "wrong weekday", SUN,
     "ಶನಿವಾರ ಮಾತ್ರ ನಮ್ಮ ಫಿಲ್ಟರ್ ಕಾಫಿಗೆ 20% ರಿಯಾಯಿತಿ, ಕೇವಲ ₹80. ಒಳಗೆ ಕುಳಿತು ಸವಿಯಲು ಮಾತ್ರ."),
    ("GOOD", "kn", "plain Kannada", SUN,
     "ನಮಸ್ಕಾರ! ಭಾನುವಾರ ಫಿಲ್ಟರ್ ಕಾಫಿಗೆ 20% ರಿಯಾಯಿತಿ ಅನ್ವಯಿಸುತ್ತದೆ. ಒಟ್ಟು ಬಿಲ್ 80 ರೂಪಾಯಿ. ಇದು ಡೈನ್-ಇನ್ ಮೂಲಕವೇ ಪಡೆಯಲು ಸಾಧ್ಯವಿದೆ."),
    ("GOOD", "kn", "plain Kannada, short", SUN,
     "ಭಾನುವಾರ ಮಾತ್ರ ಫಿಲ್ಟರ್ ಕಾಫಿಗೆ 20% ರಿಯಾಯಿತಿ, ಕೇವಲ ₹80. ಬನ್ನಿ, ಒಳಗೆ ಕುಳಿತು ಸವಿಯಿರಿ."),
    ("GOOD", "hi", "plain Hindi", SUN,
     "रविवार को फिल्टर कॉफ़ी खास दाम पर। केवल ₹80 में। 20% छूट केवल डाइन-इन के लिए।"),
]


async def judge(agnes: Agnes, lang: str, offer: OfferFacts, content: str) -> tuple[str, list[str], str]:
    """The pipeline's verdict: (BAD or GOOD, reasons, review status)."""
    result = channels.validate_asset("whatsapp", content, {}, offer, strict=True)
    if not result.ok:
        return "BAD", [f"validator:{code}" for code in result.codes], "not_reached"
    replies = await asyncio.gather(
        *(agnes.chat(review_messages(content, lang, NAMES, v), cache_kind=f"review{v}", temperature=0) for v in range(3))
    )
    passes = [parse_json_object(r) for r in replies]
    outcome = review.assess(passes[0], offer, content, *passes[1:])
    reasons = [issue[:80] for issue in outcome["issues"]]
    reasons.append(f"dropped unverified={outcome['dropped_unverified']} unconfirmed={outcome['dropped_unconfirmed']}"
                   f" nonsense_unconfirmed={outcome['dropped_nonsense_unconfirmed']}")
    return ("BAD" if outcome["status"] == review.FLAGGED else "GOOD"), reasons, outcome["status"]


async def main() -> int:
    settings = load_settings()
    if not settings.agnes_api_key:
        print("No Agnes key in the environment or .env.")
        return 2
    db = Database(Path(tempfile.mkdtemp()) / "eval.db")
    db.migrate()
    agnes = Agnes(settings, Buckets(settings), db)
    verdicts = await asyncio.gather(*(judge(agnes, lang, offer, text) for _e, lang, _n, offer, text in CASES))
    misses = 0
    counts = {("BAD", "BAD"): 0, ("BAD", "GOOD"): 0, ("GOOD", "BAD"): 0, ("GOOD", "GOOD"): 0}
    for (expected, lang, name, _offer, _text), (got, reasons, status) in zip(CASES, verdicts):
        counts[(expected, got)] += 1
        ok = expected == got
        misses += not ok
        print(f"{'ok  ' if ok else 'MISS'} expected={expected:<4} got={got:<4} {lang} {name} [{status}]")
        for reason in reasons:
            print(f"       {reason}")
    print("\nconfusion (rows expected, columns got)")
    print("             got BAD   got GOOD")
    print(f"exp BAD      {counts[('BAD', 'BAD')]:>7}   {counts[('BAD', 'GOOD')]:>8}")
    print(f"exp GOOD     {counts[('GOOD', 'BAD')]:>7}   {counts[('GOOD', 'GOOD')]:>8}")
    print(f"score {len(CASES) - misses}/{len(CASES)}")
    return 1 if misses else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
