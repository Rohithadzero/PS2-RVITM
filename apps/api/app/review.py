from __future__ import annotations

import hashlib
import re
import unicodedata
from difflib import SequenceMatcher
from typing import Any

from app.schemas import OfferFacts
from app.validator import validate_content

# Language defects that may block an asset. Grammar and style never do.
DEFECT_TYPES = {"not_a_word", "garbled", "repeated", "wrong_script"}

# Review statuses. Only "checking" and "flagged" stop an asset from being approved.
CHECKING = "checking"
OK = "ok"
FLAGGED = "flagged"
FAILED = "failed"
UNAVAILABLE = "unavailable"
NOT_NEEDED = "not_needed"
BLOCKS_APPROVAL = {CHECKING, FLAGGED}


def content_hash(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()[:16]


def _squash(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


NEAR_SENTENCE = 0.85
FIX_LOOKS_LIKE_QUOTE = 0.5
_NOT_A_DEFECT_NOTE = re.compile(r"awkward|phras|style|stylistic|literal|unnatural|idiom|clumsy", re.IGNORECASE)


def _plain(text: str) -> str:
    """Letters, marks and digits only, lowercased: two strings that differ only in spacing or punctuation compare equal."""
    return "".join(ch for ch in _squash(text).lower() if unicodedata.category(ch)[0] in "LMN")


def _whole_words(quote: str, text: str) -> bool:
    """True when the quote is a run of whole words of the copy, so a clipped word ('ಸವಿಯಿರ' for 'ಸವಿಯಿರಿ') is not a defect."""
    wanted = [w for w in (_plain(x) for x in quote.split()) if w]
    have = [w for w in (_plain(x) for x in text.split()) if w]
    n = len(wanted)
    return bool(n) and any(have[i : i + n] == wanted for i in range(len(have) - n + 1))


def problem_items(raw: Any, content: str) -> tuple[list[dict[str, str]], int]:
    """Keep a reviewer complaint only if it is a verifiable defect.

    The quote must occur in the copy, the type must be a real defect, and the reviewer must give a `fix` that
    really differs from the quote. A multi-word not_a_word, or one the note calls awkward or stylistic, is a
    style remark, not a defect.
    """
    if not isinstance(raw, list):
        return [], 0
    text = _squash(content)
    kept: list[dict[str, str]] = []
    dropped = 0
    for item in raw:
        if not isinstance(item, dict):
            dropped += 1
            continue
        quote = _squash(str(item.get("quote") or ""))
        kind = str(item.get("type") or "")
        note = str(item.get("note") or "").strip()
        fix = _squash(str(item.get("fix") or ""))
        if not quote or kind not in DEFECT_TYPES or quote not in text or not _whole_words(quote, text):
            dropped += 1
        elif not fix or _plain(fix) == _plain(quote) or (kind == "not_a_word" and _plain(quote) in _plain(fix)):
            dropped += 1
        elif kind == "not_a_word" and SequenceMatcher(None, _plain(quote), _plain(fix)).ratio() < FIX_LOOKS_LIKE_QUOTE:
            dropped += 1  # a "fix" that is a different word is a rewrite of a real word, not a spelling correction
        elif _NOT_A_DEFECT_NOTE.search(note) or (kind == "not_a_word" and len(quote.split()) > 1):
            dropped += 1
        else:
            kept.append({"quote": quote, "type": kind, "note": note, "fix": fix})
    return kept, dropped


_SENTENCE_SPLIT = re.compile(r"(?<=[.!?\u0964])\s+|\n+")


def nonsense_items(raw: Any, content: str) -> tuple[list[str], int]:
    """Whole sentences a reviewer calls unreadable, each mapped to the real sentence of the copy it points at.

    A quote counts if it sits inside one sentence of the copy (spacing and punctuation ignored) or is a near copy
    of one (a dropped letter or a stray character). Anything that matches no sentence is dropped.
    """
    if not isinstance(raw, list):
        return [], 0
    sentences = [_squash(part) for part in _SENTENCE_SPLIT.split(content) if _plain(part)]
    kept: list[str] = []
    dropped = 0
    for item in raw:
        quote = _plain(item) if isinstance(item, str) else ""
        match = None
        if quote:
            match = next((s for s in sentences if quote in _plain(s)), None)
            if match is None:
                best = max(sentences, key=lambda s: SequenceMatcher(None, quote, _plain(s)).ratio(), default=None)
                if best and SequenceMatcher(None, quote, _plain(best)).ratio() >= NEAR_SENTENCE:
                    match = best
        if match is None:
            dropped += 1
        elif match not in kept:
            kept.append(match)
    return kept, dropped


def _describe(item: dict[str, str]) -> str:
    return f"{item['type'].replace('_', ' ')}: \u201c{item['quote']}\u201d" + (f" ({item['note']})" if item["note"] else "")


def grounded_problems(raw: Any, content: str) -> tuple[list[str], int]:
    items, dropped = problem_items(raw, content)
    return [_describe(item) for item in items], dropped


def _overlap(a: str, b: str) -> bool:
    a, b = _plain(a), _plain(b)
    return bool(a and b and (a in b or b in a))


def _item_words(item: str) -> list[str]:
    return [word for word in re.findall(r"[a-z]+", item.lower()) if len(word) >= 4]


def _vote(per_pass: list[list[str]], usable: int) -> tuple[list[str], int]:
    """Quotes named by at least 2 usable passes (overlapping quotes count as the same complaint).

    Returns (confirmed quotes, number of distinct complaints that did not get 2 votes).
    With fewer than 2 usable passes nothing can be confirmed.
    """
    confirmed: list[str] = []
    seen: list[str] = []
    unconfirmed = 0
    for quotes in per_pass:
        for quote in quotes:
            if any(_overlap(quote, other) for other in seen):
                continue
            seen.append(quote)
            votes = sum(1 for other in per_pass if any(_overlap(quote, q) for q in other))
            if usable >= 2 and votes >= 2:
                confirmed.append(quote)
            else:
                unconfirmed += 1
    return confirmed, unconfirmed


def _back_translation_issues(passes: list[dict[str, Any] | None], facts: OfferFacts) -> list[str]:
    """Run the English rules on each pass's back-translation. A translation can drop a word by chance, so an issue
    stands only when at least 2 usable passes raise it (or, with a single usable pass, when that pass does)."""
    words = _item_words(facts.item)
    per_pass: list[dict[str, str]] = []
    for p in passes:
        text = str((p or {}).get("back_translation") or "").strip()
        if p is None or not text:
            continue
        found = {issue.code: f"Back-translation: {issue.message}" for issue in validate_content(text, facts).issues}
        if words and not any(word in text.lower() for word in words):
            found["item_missing"] = f"Back-translation never mentions {facts.item}."
        per_pass.append(found)
    need = 2 if len(per_pass) >= 2 else 1
    codes = [code for code in dict.fromkeys(c for found in per_pass for c in found)
             if sum(code in found for found in per_pass) >= need]
    return [next(found[code] for found in per_pass if code in found) for code in codes]


def assess(parsed: dict[str, Any], facts: OfferFacts, content: str, *others: dict[str, Any] | None) -> dict[str, Any]:
    """Decide the meaning check in code. The reviewers only translate and report language problems.

    `parsed` is pass 1 and `others` are the further independent passes (None for a pass that failed).
    The full deterministic validator runs on the English back-translation of pass 1, so every English rule
    (days, widening, prices, scarcity, scope) also applies to Kannada and Hindi copy. A language problem or a
    nonsense sentence blocks only when at least 2 usable passes name overlapping quotes.
    """
    back = str(parsed.get("back_translation") or "").strip()
    passes = [parsed, *others]
    usable = sum(1 for p in passes if p is not None)
    items: list[list[dict[str, str]]] = []
    dropped: list[int] = []
    senses: list[list[str]] = []
    for p in passes:
        found, gone = problem_items((p or {}).get("language_problems"), content)
        items.append(found)
        dropped.append(gone)
        senses.append(nonsense_items((p or {}).get("nonsense_sentences"), content)[0])
    confirmed_quotes, unconfirmed = _vote([[i["quote"] for i in found] for found in items], usable)
    by_quote = {i["quote"]: i for found in reversed(items) for i in found}
    confirmed = [by_quote[q] for q in confirmed_quotes]
    problems = [_describe(item) for item in confirmed]
    nonsense, nonsense_unconfirmed = _vote(senses, usable)
    base = {
        "nonsense_sentences": nonsense,
        "dropped_nonsense_unconfirmed": nonsense_unconfirmed,
        "content_hash": content_hash(content),
        "back_translation": back,
        "language_problems": problems,
        "dropped_unverified": dropped[0],
        "dropped_unconfirmed": unconfirmed,
        "usable_passes": usable,
        "passes": [
            None if p is None else {
                "back_translation": str(p.get("back_translation") or "").strip(),
                "problems": items[i],
                "dropped_unverified": dropped[i],
                "nonsense_sentences": senses[i],
            }
            for i, p in enumerate(passes)
        ],
    }
    if not back:
        return {**base, "status": FAILED, "issues": ["The reviewer returned no back-translation."]}

    issues = _back_translation_issues(passes, facts)
    issues.extend(f"Language: {problem}" for problem in problems)
    issues.extend(f"Language: nonsense sentence: \u201c{sentence}\u201d" for sentence in nonsense)
    return {**base, "status": FLAGGED if issues else OK, "issues": issues}
