"""languages: the one list of languages GrowIt works in, and what each one needs.

For every language: its name, the script it is written in, the locale the browser mic and voice use, the Whisper code for cloud
speech-to-text (Groq), the offline Vosk model if one exists, and the words the fact checker needs (weekdays, "percent", "rupees",
"free"). The fact checker can only check a language it has these words for, so a language is only listed here once they are in.

Three tiers of care:
  checked   English, Hindi, Kannada: words reviewed in earlier rounds of this project
  draft     the other Indian languages: words written by a model from general knowledge, NOT yet read by a native speaker.
            Everything works, the screens say "draft", and a native speaker should read each word list before it goes to customers.

Speech has two directions. Speech to text (STT): the offline Vosk model when installed, else Groq Whisper when switched on, else the
browser's own mic. Text to speech (TTS): Gemini when switched on, else the browser's voice.
"""
from __future__ import annotations

import re
from typing import Any

# day order: Monday .. Sunday. The first word is how the writer is told to spell the day; the rest are accepted spellings.
LANGUAGES: list[dict[str, Any]] = [
    {"code": "en", "name": "English", "native": "English", "locale": "en-IN", "script": None, "groq": "en", "vosk": ["en", "en-in"], "tier": "checked",
     "ui": {"order": "Order on WhatsApp", "menu": "Menu", "about": "About us", "hours": "Hours and place", "hello": "Hi {name}, I'd like to order", "map": "Open the map", "off": "off"}},
    {"code": "hi", "name": "Hindi", "native": "हिन्दी", "locale": "hi-IN", "script": (0x0900, 0x097F), "groq": "hi", "vosk": ["hi"], "tier": "checked",
     "ui": {"order": "व्हाट्सऐप पर ऑर्डर करें", "menu": "मेन्यू", "about": "हमारे बारे में", "hours": "समय और जगह", "hello": "नमस्ते {name}, मैं ऑर्डर करना चाहता/चाहती हूँ", "map": "नक्शा खोलें", "off": "की छूट"}},
    {"code": "kn", "name": "Kannada", "native": "ಕನ್ನಡ", "locale": "kn-IN", "script": (0x0C80, 0x0CFF), "groq": "kn", "vosk": [], "tier": "checked",
     "ui": {"order": "ವಾಟ್ಸಾಪ್‌ನಲ್ಲಿ ಆರ್ಡರ್ ಮಾಡಿ", "menu": "ಮೆನು", "about": "ನಮ್ಮ ಬಗ್ಗೆ", "hours": "ಸಮಯ ಮತ್ತು ಸ್ಥಳ", "hello": "ನಮಸ್ಕಾರ {name}, ನಾನು ಆರ್ಡರ್ ಮಾಡಲು ಬಯಸುತ್ತೇನೆ", "map": "ನಕ್ಷೆ ತೆರೆಯಿರಿ", "off": "ರಿಯಾಯಿತಿ"}},
    {"code": "ta", "name": "Tamil", "native": "தமிழ்", "locale": "ta-IN", "script": (0x0B80, 0x0BFF), "groq": "ta", "vosk": [], "tier": "draft",
     "days": [("திங்கள்", "திங்கட்கிழமை"), ("செவ்வாய்", "செவ்வாய்க்கிழமை"), ("புதன்", "புதன்கிழமை"), ("வியாழன்", "வியாழக்கிழமை"), ("வெள்ளி", "வெள்ளிக்கிழமை"), ("சனி", "சனிக்கிழமை"), ("ஞாயிறு", "ஞாயிற்றுக்கிழமை")],
     "percent": ["சதவீதம்", "சதவிகிதம்"], "rupee": ["ரூபாய்", "ரூ"], "free": ["இலவசம்", "இலவச"],
     "ui": {"order": "வாட்ஸ்அப்பில் ஆர்டர் செய்யுங்கள்", "menu": "மெனு", "about": "எங்களைப் பற்றி", "hours": "நேரம் மற்றும் இடம்", "hello": "வணக்கம் {name}, நான் ஆர்டர் செய்ய விரும்புகிறேன்", "map": "வரைபடத்தைத் திறக்கவும்", "off": "தள்ளுபடி"}},
    {"code": "te", "name": "Telugu", "native": "తెలుగు", "locale": "te-IN", "script": (0x0C00, 0x0C7F), "groq": "te", "vosk": ["te"], "tier": "draft",
     "days": [("సోమవారం",), ("మంగళవారం",), ("బుధవారం",), ("గురువారం",), ("శుక్రవారం",), ("శనివారం",), ("ఆదివారం",)],
     "percent": ["శాతం"], "rupee": ["రూపాయలు", "రూపాయి", "రూ"], "free": ["ఉచితం", "ఉచిత"],
     "ui": {"order": "వాట్సాప్‌లో ఆర్డర్ చేయండి", "menu": "మెనూ", "about": "మా గురించి", "hours": "సమయం మరియు చోటు", "hello": "నమస్కారం {name}, నేను ఆర్డర్ చేయాలనుకుంటున్నాను", "map": "మ్యాప్ తెరవండి", "off": "తగ్గింపు"}},
    {"code": "ml", "name": "Malayalam", "native": "മലയാളം", "locale": "ml-IN", "script": (0x0D00, 0x0D7F), "groq": "ml", "vosk": [], "tier": "draft",
     "days": [("തിങ്കൾ", "തിങ്കളാഴ്ച"), ("ചൊവ്വ", "ചൊവ്വാഴ്ച"), ("ബുധൻ", "ബുധനാഴ്ച"), ("വ്യാഴം", "വ്യാഴാഴ്ച"), ("വെള്ളി", "വെള്ളിയാഴ്ച"), ("ശനി", "ശനിയാഴ്ച"), ("ഞായർ", "ഞായറാഴ്ച")],
     "percent": ["ശതമാനം"], "rupee": ["രൂപ", "രൂ"], "free": ["സൗജന്യം", "സൗജന്യ"],
     "ui": {"order": "വാട്സ്ആപ്പിൽ ഓർഡർ ചെയ്യൂ", "menu": "മെനു", "about": "ഞങ്ങളെക്കുറിച്ച്", "hours": "സമയവും സ്ഥലവും", "hello": "നമസ്കാരം {name}, എനിക്ക് ഓർഡർ ചെയ്യണം", "map": "മാപ്പ് തുറക്കൂ", "off": "കിഴിവ്"}},
    {"code": "mr", "name": "Marathi", "native": "मराठी", "locale": "mr-IN", "script": (0x0900, 0x097F), "groq": "mr", "vosk": [], "tier": "draft",
     "days": [("सोमवार",), ("मंगळवार",), ("बुधवार",), ("गुरुवार",), ("शुक्रवार",), ("शनिवार",), ("रविवार",)],
     "percent": ["टक्के", "टक्का", "टक्केवारी"], "rupee": ["रुपये", "रुपया", "रु"], "free": ["मोफत", "फुकट"],
     "ui": {"order": "व्हॉट्सॲपवर ऑर्डर करा", "menu": "मेनू", "about": "आमच्याबद्दल", "hours": "वेळ आणि ठिकाण", "hello": "नमस्कार {name}, मला ऑर्डर करायची आहे", "map": "नकाशा उघडा", "off": "सूट"}},
    {"code": "bn", "name": "Bengali", "native": "বাংলা", "locale": "bn-IN", "script": (0x0980, 0x09FF), "groq": "bn", "vosk": [], "tier": "draft",
     "days": [("সোমবার",), ("মঙ্গলবার",), ("বুধবার",), ("বৃহস্পতিবার",), ("শুক্রবার",), ("শনিবার",), ("রবিবার",)],
     "percent": ["শতাংশ", "শতকরা"], "rupee": ["টাকা"], "free": ["বিনামূল্যে", "ফ্রি", "বিনা মূল্যে"],
     "ui": {"order": "হোয়াটসঅ্যাপে অর্ডার করুন", "menu": "মেনু", "about": "আমাদের সম্পর্কে", "hours": "সময় ও ঠিকানা", "hello": "নমস্কার {name}, আমি অর্ডার করতে চাই", "map": "মানচিত্র খুলুন", "off": "ছাড়"}},
    {"code": "gu", "name": "Gujarati", "native": "ગુજરાતી", "locale": "gu-IN", "script": (0x0A80, 0x0AFF), "groq": "gu", "vosk": ["gu"], "tier": "draft",
     "days": [("સોમવાર",), ("મંગળવાર",), ("બુધવાર",), ("ગુરુવાર",), ("શુક્રવાર",), ("શનિવાર",), ("રવિવાર",)],
     "percent": ["ટકા", "ટકાવારી"], "rupee": ["રૂપિયા", "રૂપિયો", "રૂ"], "free": ["મફત", "ફ્રી"],
     "ui": {"order": "વોટ્સએપ પર ઓર્ડર કરો", "menu": "મેનુ", "about": "અમારા વિશે", "hours": "સમય અને સ્થળ", "hello": "નમસ્તે {name}, મારે ઓર્ડર કરવો છે", "map": "નકશો ખોલો", "off": "છૂટ"}},
    {"code": "pa", "name": "Punjabi", "native": "ਪੰਜਾਬੀ", "locale": "pa-IN", "script": (0x0A00, 0x0A7F), "groq": "pa", "vosk": [], "tier": "draft",
     "days": [("ਸੋਮਵਾਰ",), ("ਮੰਗਲਵਾਰ",), ("ਬੁੱਧਵਾਰ",), ("ਵੀਰਵਾਰ",), ("ਸ਼ੁੱਕਰਵਾਰ",), ("ਸ਼ਨੀਵਾਰ",), ("ਐਤਵਾਰ",)],
     "percent": ["ਪ੍ਰਤੀਸ਼ਤ", "ਫ਼ੀਸਦੀ", "ਫੀਸਦੀ"], "rupee": ["ਰੁਪਏ", "ਰੁਪਈਆ", "ਰੁ"], "free": ["ਮੁਫ਼ਤ", "ਮੁਫ਼ਤ", "ਫ੍ਰੀ"],
     "ui": {"order": "ਵਟਸਐਪ 'ਤੇ ਆਰਡਰ ਕਰੋ", "menu": "ਮੇਨੂ", "about": "ਸਾਡੇ ਬਾਰੇ", "hours": "ਸਮਾਂ ਅਤੇ ਥਾਂ", "hello": "ਸਤ ਸ੍ਰੀ ਅਕਾਲ {name}, ਮੈਂ ਆਰਡਰ ਕਰਨਾ ਚਾਹੁੰਦਾ ਹਾਂ", "map": "ਨਕਸ਼ਾ ਖੋਲ੍ਹੋ", "off": "ਛੋਟ"}},
]

BY_CODE = {l["code"]: l for l in LANGUAGES}
CODES = tuple(l["code"] for l in LANGUAGES)
DAYS_EN = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")
LANG_PATTERN = "^(" + "|".join(CODES) + ")$"


def get(code: str) -> dict[str, Any] | None:
    return BY_CODE.get(code)


def names() -> dict[str, str]:
    return {l["code"]: l["name"] for l in LANGUAGES}


def draft(code: str) -> bool:
    return (BY_CODE.get(code) or {}).get("tier") == "draft"


def day_words(code: str, day: str) -> tuple[str, ...]:
    """Accepted spellings of an English weekday name ("monday") in a language, canonical spelling first. Empty if unknown."""
    l = BY_CODE.get(code) or {}
    return tuple(l["days"][DAYS_EN.index(day)]) if l.get("days") else ()


def extra_day_words() -> dict[str, tuple[str, ...]]:
    """Every registry spelling for each weekday, to be merged into the fact checker's table."""
    out: dict[str, list[str]] = {d: [] for d in DAYS_EN}
    for l in LANGUAGES:
        for d, words in zip(DAYS_EN, l.get("days") or []):
            out[d].extend(words)
    return {d: tuple(dict.fromkeys(v)) for d, v in out.items()}


def words(key: str) -> list[str]:
    """All words of one kind ("percent", "rupee", "free") across the registry, longest first so alternations match fully."""
    found = {w for l in LANGUAGES for w in (l.get(key) or [])}
    return sorted(found, key=lambda w: (-len(w), w))


def alternation(key: str) -> str:
    return "|".join(re.escape(w) for w in words(key))


def in_script(code: str, char: str) -> bool:
    rng = (BY_CODE.get(code) or {}).get("script")
    return bool(rng) and rng[0] <= ord(char) <= rng[1]


def site_text(code: str) -> dict[str, str]:
    """Words for the one-page website. English where a language has none."""
    return (BY_CODE.get(code) or {}).get("ui") or {}


def spoken_names() -> dict[str, list[str]]:
    """How an owner might say each language when asked which ones they want: English name, native name."""
    return {l["code"]: [l["name"].lower(), l["native"]] for l in LANGUAGES}
