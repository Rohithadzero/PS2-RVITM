from __future__ import annotations

import json

from app.channels import SPECS
from app.config import LANG_NAMES
from app.schemas import OfferFacts
from app.validator import DAYS, INDIC_DAYS, locked_days

from app import languages

SCRIPTS = {l["code"]: (chr(l["script"][0]), chr(l["script"][1])) for l in languages.LANGUAGES if l["script"]}


def day_names(facts: OfferFacts, lang: str) -> list[str]:
    """The locked weekdays spelled in the target language, so the writer never has to invent them."""
    days = [day for day in DAYS if day in locked_days(facts)]
    if lang not in SCRIPTS:
        return [day.capitalize() for day in days]
    low, high = SCRIPTS[lang]
    out = []
    for day in days:
        own = languages.day_words(lang, day)  # the language's own spelling first (Marathi and Hindi share a script, not words)
        out.append(own[0] if own else next(word for word in INDIC_DAYS[day] if low <= word[0] <= high))
    return out


def copy_messages(
    facts: OfferFacts, asset: dict, feedback: dict | None = None, context: dict | None = None
) -> list[dict[str, str]]:
    """One channel, one language. context holds the plan's business name, area, tone and CTA; nothing else is passed."""
    language = LANG_NAMES.get(asset["lang"], asset["lang"])
    spec = SPECS.get(asset["channel"], SPECS["whatsapp"])
    context = context or {}
    request = {
        "language": language,
        "language_code": asset["lang"],
        "channel": asset["channel"],
        "audiences": facts.audiences,
        "offer_facts": facts.model_dump(),
    }
    for key in ("business_name", "area", "tone", "cta", "owner_notes"):
        if context.get(key):
            request[key] = context[key]
    names = day_names(facts, asset["lang"])
    if names:
        request["weekday_words_to_use"] = names
    if feedback:
        request["rejected_attempt"] = feedback.get("previous")
        if feedback.get("issues"):
            request["problems_to_fix"] = feedback["issues"]
        if feedback.get("instruction"):
            request["owner_instruction"] = feedback["instruction"]
    return [
        {
            "role": "system",
            "content": (
                "You write one campaign asset for a small business. "
                "Write in the requested language natively. Do not translate an English draft. "
                "Prices, discounts, dates, weekdays, and terms must match the offer facts exactly. "
                "Do not add a number, date, weekday, or price that is not in the offer facts. "
                "Do not claim scarcity, unlimited use, or a wider scope than the offer facts state. "
                "State the offer days in every asset, using exactly the words in weekday_words_to_use. "
                "Do not mention a regular or original price. "
                "Use only the business name, area, tone, audiences and cta given in the request; invent no other fact. "
                "If cta is a phone number, handle or map, you may state it as given; if it is a url, do not write the url, "
                "a tracked link is added later. "
                "Use plain, everyday words a local customer would use. Keep it short and never repeat a sentence. "
                "If owner_notes is present, it holds the owner's own style notes and things to avoid: follow them for tone and wording only. "
                "They are never a source for a price, number, date, discount or offer. "
                "If rejected_attempt is present, it was rejected for problems_to_fix; write a new version that fixes all of them. "
                "If owner_instruction is present, rewrite rejected_attempt to follow it and keep every offer fact unchanged. "
                f"Channel: {asset['channel']}. {spec['write']} "
                f"Return only a JSON object with keys {spec['keys']}, and facts_used "
                "(array of the offer_facts keys the copy relies on, from: item, discount_percent, "
                "price_amount, dates, timings, terms)."
            ),
        },
        {
            "role": "user",
            "content": json.dumps(request, ensure_ascii=False),
        },
    ]


def brief_messages(transcript: str) -> list[dict[str, str]]:
    return [
        {
            "role": "system",
            "content": (
                "Extract only the offer facts a business owner stated. "
                "Use null for anything they did not say. Do not invent a price, discount, date, timing, term, or audience. "
                "Return only a JSON object with keys item, discount_percent, price_amount, currency, "
                "dates, timings, terms, audiences, brand_voice. "
                "dates is an array of YYYY-MM-DD strings. audiences is an array of strings."
            ),
        },
        {"role": "user", "content": transcript},
    ]


def review_messages(content: str, lang: str, names: list[str] | None = None, variant: int = 0) -> list[dict[str, str]]:
    """Blind reviewer: it sees only the copy and proper nouns, never prices, dates, days or the offer facts.

    variants 0, 1 and 2 are independently framed reviewers; a complaint blocks only if at least two report it.
    """
    language = LANG_NAMES.get(lang, lang)
    role = (
        f"You are a native {language} speaker checking marketing copy. ",
        f"You are a careful {language} proofreader giving a second, independent opinion on marketing copy. ",
        f"You are a {language}-speaking customer reading a shop's message on your phone, and you also edit {language} text for a living. ",
    )[variant % 3]
    allowed = [n for n in (names or []) if n]
    return [
        {
            "role": "system",
            "content": (
                role
                + "Translate it into English literally, sentence by sentence. Keep every number, price, percentage, "
                "date and weekday exactly as written, and do not correct, improve or complete anything. "
                "If a word is not a real word, keep it transliterated in [brackets]. "
                "In language_problems list only clear defects a customer would notice, each as an object with: "
                "quote (the exact text copied character for character from the input), "
                "type (one of: not_a_word, garbled, repeated, wrong_script), note (a few words), and "
                "fix (the corrected text, which must differ from the quote; if you cannot write a different "
                "correction, it is not a defect, so leave it out). "
                "Grammar, word choice, awkward phrasing and style are not defects. Common everyday words are real words. "
                "If a word exists in the language, it is not a defect even when you would choose another word; "
                "replacing a real word with a different real word is a rewrite, never a fix. "
                "Report not_a_word only for a string that is not a word of the language in any spelling. "
                "English loanwords and brand names written in the local script (for example dine-in, combo, order or regulars) "
                "and Hinglish particles such as wala are normal, not defects. "
                + (
                    "These names are proper nouns, in English or in any script, and so are their transliterations; "
                    f"never report them: {json.dumps(allowed, ensure_ascii=False)}. "
                    if allowed
                    else ""
                )
                + "A {name} placeholder is intentional and is not a defect. "
                "If the copy reads naturally, return an empty list. "
                "Separately, read the copy as a whole the way a native customer would. Check each sentence of your own literal "
                "translation: if it does not read as a sensible sentence a shop would say, its original is nonsense. "
                "In nonsense_sentences list each "
                "sentence, copied character for character from the input, that a native reader would not understand "
                "or that makes no sense as shop marketing, even when every word in it is real (word salad, meaningless, "
                "machine-garbled or self-contradicting sentences). A slightly clumsy sentence that is still understood "
                "is not nonsense. If every sentence makes sense, return an empty list. "
                "Return only a JSON object with keys back_translation (string), language_problems (array) "
                "and nonsense_sentences (array of strings)."
            ),
        },
        {"role": "user", "content": content},
    ]
