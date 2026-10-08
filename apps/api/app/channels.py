"""Per-channel structure of Campaign 0 copy: the JSON each channel returns, its limits, and the text a customer sees."""
from __future__ import annotations

from typing import Any

from app.schemas import OfferFacts
from app.validator import Issue, ValidationResult, validate_content

BLOG_WORDS = (200, 450)  # enforced range; the prompt asks for 250 to 400
GOOGLE_MAX_CHARS = 1500
STORY_HEADLINE_WORDS = 8
EMAIL_SUBJECT_MAX = 90
HASHTAGS_MAX = 10
BUTTONS = ("call", "learn_more")

# What each channel writes. "keys" is the JSON the model returns beside facts_used; "write" is the brief.
SPECS: dict[str, dict[str, str]] = {
    "cold_email": {
        "keys": "subject (string), content (string)",
        "write": (
            "A cold email to a local customer. subject is under 70 characters. content is the plain-text body, "
            "60 to 120 words, and must contain the literal placeholder {name} exactly once in the greeting. "
            "Do not invent a recipient name."
        ),
    },
    "instagram_post": {
        "keys": "content (string), hashtags (array of 3 to 6 strings starting with #)",
        "write": "An Instagram caption in content, short and warm, then hashtags. Hashtags carry no numbers.",
    },
    "instagram_story": {
        "keys": "headline (string), content (string)",
        "write": "headline is at most 8 words. content is one short line under 120 characters.",
    },
    "blog_post": {
        "keys": "title (string), content (string)",
        "write": "A local blog post. content is 250 to 400 words in short paragraphs, plain text, no headings markup.",
    },
    "whatsapp": {
        "keys": "content (string)",
        "write": "A WhatsApp broadcast message of two to four short lines. No hashtags.",
    },
    "poster": {
        "keys": "headline (string), subline (string), content (string)",
        "write": (
            "headline is at most 6 words. subline is one short line. content is one sentence stating the offer, "
            "which the app overlays on the poster."
        ),
    },
    "google_business_post": {
        "keys": 'content (string), button ("call" or "learn_more")',
        "write": "A Google Business Profile update, under 1500 characters, plain text. Choose the button that fits the call to action.",
    },
    "reel": {
        "keys": "script (array of 3 or 4 short strings, one line per scene)",
        "write": "A script for an 8 second reel. Each line is one scene, spoken or shown text, under 15 words.",
    },
}

# Extra fields a customer reads, in reading order.
VISIBLE_EXTRA = {
    "cold_email": ("subject",),
    "instagram_post": ("hashtags",),
    "instagram_story": ("headline",),
    "blog_post": ("title",),
    "poster": ("headline", "subline"),
}


def _words(text: str) -> int:
    return len(text.split())


def _clean_text(value: Any) -> str:
    return str(value).strip() if isinstance(value, str) else ""


def parse_output(channel: str, payload: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    """Turn the model's JSON into (content, extra). Shape problems are caught later by structure_issues."""
    if channel == "reel":
        script = payload.get("script")
        lines = [_clean_text(line) for line in script] if isinstance(script, list) else []
        return "\n".join(line for line in lines if line), {"script": lines}
    content = _clean_text(payload.get("content"))
    extra: dict[str, Any] = {}
    if channel == "cold_email":
        extra["subject"] = _clean_text(payload.get("subject"))
    elif channel == "instagram_post":
        tags = payload.get("hashtags")
        cleaned = []
        for tag in tags if isinstance(tags, list) else []:
            word = _clean_text(tag).replace(" ", "")
            if word:
                cleaned.append(word if word.startswith("#") else "#" + word)
        extra["hashtags"] = cleaned
    elif channel == "instagram_story":
        extra["headline"] = _clean_text(payload.get("headline"))
    elif channel == "blog_post":
        extra["title"] = _clean_text(payload.get("title"))
    elif channel == "poster":
        extra["headline"] = _clean_text(payload.get("headline"))
        extra["subline"] = _clean_text(payload.get("subline"))
    elif channel == "google_business_post":
        extra["button"] = _clean_text(payload.get("button")).lower()
    return content, extra


def structure_issues(channel: str, content: str, extra: dict[str, Any], strict: bool = False) -> list[Issue]:
    """Shape rules from the contract table. A broken shape blocks an asset like a wrong price does.

    Generated copy is strict. An owner-typed asset that has no extra fields yet (strict=False, extra empty) is only
    held to the rules about its body, so a hand-written post is not blocked for lacking a model-written headline.
    """
    issues: list[Issue] = []
    lenient = not strict and not extra

    def need(key: str) -> bool:
        if lenient:
            return bool(_clean_text(extra.get(key)))
        if not _clean_text(extra.get(key)):
            issues.append(Issue(f"{key}_missing", f"{channel} needs a {key}."))
            return False
        return True

    if channel == "cold_email":
        if need("subject") and len(extra["subject"]) > EMAIL_SUBJECT_MAX:
            issues.append(Issue("subject_long", f"Email subject is over {EMAIL_SUBJECT_MAX} characters."))
        if content and content.count("{name}") != 1:
            issues.append(Issue("name_placeholder", "Email body must contain the literal {name} placeholder once."))
    elif channel == "instagram_post":
        tags = extra.get("hashtags")
        if lenient:
            pass
        elif not isinstance(tags, list) or not tags:
            issues.append(Issue("hashtags_missing", "Instagram post needs hashtags."))
        elif len(tags) > HASHTAGS_MAX:
            issues.append(Issue("hashtags_many", f"Use at most {HASHTAGS_MAX} hashtags."))
    elif channel == "instagram_story":
        if need("headline") and _words(extra["headline"]) > STORY_HEADLINE_WORDS:
            issues.append(Issue("headline_long", f"Story headline is over {STORY_HEADLINE_WORDS} words."))
    elif channel == "blog_post":
        need("title")
        count = _words(content)
        if content and not BLOG_WORDS[0] <= count <= BLOG_WORDS[1]:
            issues.append(Issue("blog_length", f"Blog post is {count} words; it must be about 250 to 400."))
    elif channel == "poster":
        need("headline")
        need("subline")
    elif channel == "google_business_post":
        if len(content) > GOOGLE_MAX_CHARS:
            issues.append(Issue("google_long", f"Google post is over {GOOGLE_MAX_CHARS} characters."))
        if not lenient and extra.get("button") not in BUTTONS:
            issues.append(Issue("button_invalid", "Google post button must be call or learn_more."))
    elif channel == "reel":
        script = extra.get("script")
        if not lenient and (not isinstance(script, list) or not 3 <= len([line for line in script if line]) <= 4):
            issues.append(Issue("script_lines", "Reel script needs 3 or 4 lines."))
    return issues


def visible_text(channel: str, content: str, extra: dict[str, Any]) -> str:
    """Everything a customer reads for this asset: the extra fields first, then the body."""
    parts: list[str] = []
    for key in VISIBLE_EXTRA.get(channel, ()):
        value = extra.get(key)
        if isinstance(value, list):
            parts.append(" ".join(str(item) for item in value))
        elif value:
            parts.append(str(value))
    if content:
        parts.append(content)
    return "\n".join(parts)


def validate_asset(
    channel: str, content: str, extra: dict[str, Any], facts: OfferFacts, strict: bool = False
) -> ValidationResult:
    """Structure rules plus the deterministic fact validator over all customer-visible text."""
    text = visible_text(channel, content, extra)
    result = validate_content(text, facts)
    issues = structure_issues(channel, content, extra, strict) + list(result.issues)
    if text.strip() and not content.strip():
        issues.insert(0, Issue("empty", "Asset has no copy."))
    return ValidationResult(not issues, issues)
