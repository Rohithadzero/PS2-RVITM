"""Per-language words the validator and renderer need (docs/validator-and-scoring.md).

IMPORTANT: Kannada (kn) and Hindi (hi) phrases below are DRAFTS written by a model. They must be checked
by native speakers before the demo (see docs/native-review.md). `VERIFIED` tracks that; nothing here may be
described as verified until the team flips the flag after review.
"""

LANGS = ("en", "hi", "kn")

VERIFIED = {"en": True, "hi": False, "kn": False}

DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]

DAYS = {
    "en": {"mon": "Monday", "tue": "Tuesday", "wed": "Wednesday", "thu": "Thursday", "fri": "Friday",
           "sat": "Saturday", "sun": "Sunday"},
    "hi": {"mon": "सोमवार", "tue": "मंगलवार", "wed": "बुधवार", "thu": "गुरुवार", "fri": "शुक्रवार",
           "sat": "शनिवार", "sun": "रविवार"},
    "kn": {"mon": "ಸೋಮವಾರ", "tue": "ಮಂಗಳವಾರ", "wed": "ಬುಧವಾರ", "thu": "ಗುರುವಾರ", "fri": "ಶುಕ್ರವಾರ",
           "sat": "ಶನಿವಾರ", "sun": "ಭಾನುವಾರ"},
}

MONTHS = {
    "en": ["January", "February", "March", "April", "May", "June", "July", "August", "September",
           "October", "November", "December"],
    "hi": ["जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्टूबर",
           "नवंबर", "दिसंबर"],
    "kn": ["ಜನವರಿ", "ಫೆಬ್ರವರಿ", "ಮಾರ್ಚ್", "ಏಪ್ರಿಲ್", "ಮೇ", "ಜೂನ್", "ಜುಲೈ", "ಆಗಸ್ಟ್", "ಸೆಪ್ಟೆಂಬರ್",
           "ಅಕ್ಟೋಬರ್", "ನವೆಂಬರ್", "ಡಿಸೆಂಬರ್"],
}

AND = {"en": "and", "hi": "और", "kn": "ಮತ್ತು"}

# Controlled vocabulary of conditions (docs/data-model.md). Dropping one must be detectable.
TERMS = {
    "dine_in_only": {"en": "Dine-in only", "hi": "सिर्फ़ कैफ़े में बैठकर", "kn": "ಕೇವಲ ಕೆಫೆಯಲ್ಲಿ ಕುಳಿತು ಸವಿಯಲು ಮಾತ್ರ"},
    "while_stocks_last": {"en": "While stocks last", "hi": "स्टॉक रहने तक", "kn": "ಸ್ಟಾಕ್ ಇರುವವರೆಗೆ"},
    "one_per_customer": {"en": "One per customer", "hi": "प्रति ग्राहक एक", "kn": "ಪ್ರತಿ ಗ್ರಾಹಕರಿಗೆ ಒಂದು"},
    "no_delivery": {"en": "Not available for delivery", "hi": "डिलीवरी उपलब्ध नहीं", "kn": "ಡೆಲಿವರಿ ಲಭ್ಯವಿಲ್ಲ"},
}

# time-of-day words (first hour decides). Drafts for hi/kn; need native check.
PERIOD = {
    "en": {"am": "am", "pm": "pm"},
    "hi": {"morning": "सुबह", "afternoon": "दोपहर", "evening": "शाम", "suffix": "बजे"},
    "kn": {"morning": "ಬೆಳಿಗ್ಗೆ", "afternoon": "ಮಧ್ಯಾಹ್ನ", "evening": "ಸಂಜೆ", "suffix": ""},
}

# Words that must only come from slots (validator V2-V5). Lowercase; matched as whole tokens.
NUMBER_WORDS = {
    "en": ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven",
           "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
           "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety", "hundred",
           "thousand", "half", "double", "triple"],
    # Romanized Hindi/Kannada number words (also used for Kanglish/Hinglish assets). Subset; extend with natives.
    "hi_latin": ["ek", "do", "teen", "char", "paanch", "chhe", "saat", "aath", "nau", "das", "gyarah", "barah",
                 "pandrah", "bees", "pachchees", "tees", "chaalis", "pachaas", "sau", "hazaar"],
    "kn_latin": ["ondu", "eradu", "mooru", "naalku", "aidu", "aaru", "elu", "entu", "ombattu", "hattu",
                 "hannondu", "hanneradu", "hadinaidu", "ippattu", "muvattu", "nalavattu", "aivattu", "nooru"],
    "hi": ["एक", "दो", "तीन", "चार", "पांच", "पाँच", "छह", "छः", "सात", "आठ", "नौ", "दस", "ग्यारह", "बारह",
           "पंद्रह", "बीस", "पच्चीस", "तीस", "चालीस", "पचास", "सौ", "हज़ार", "हजार"],
    "kn": ["ಒಂದು", "ಎರಡು", "ಮೂರು", "ನಾಲ್ಕು", "ಐದು", "ಆರು", "ಏಳು", "ಎಂಟು", "ಒಂಬತ್ತು", "ಹತ್ತು", "ಹನ್ನೊಂದು",
           "ಹನ್ನೆರಡು", "ಹದಿನೈದು", "ಇಪ್ಪತ್ತು", "ಮೂವತ್ತು", "ನಲವತ್ತು", "ಐವತ್ತು", "ನೂರು"],
}

PERCENT_WORDS = ["%", "percent", "per cent", "pct", "प्रतिशत", "फ़ीसदी", "फीसदी", "ಶೇಕಡಾ", "ಶೇಕಡ", "ಪರ್ಸೆಂಟ್", "ಪರ್ಸೆಂಟ"]

# Day/date/time words outside slots are claims the lock did not authorise (V4/V5).
RELATIVE_TIME_WORDS = {
    "en": ["weekend", "weekday", "today", "tomorrow", "tonight", "yesterday", "daily", "everyday", "weekly",
           "noon", "midnight", "morning", "evening", "afternoon", "all day", "24/7", "this week", "next week"],
    "hi": ["सप्ताहांत", "आज", "कल", "आज रात", "रोज़", "रोज", "हर दिन", "दिन भर", "सुबह", "शाम", "दोपहर"],
    "kn": ["ವಾರಾಂತ್ಯ", "ಇಂದು", "ಇವತ್ತು", "ನಾಳೆ", "ಪ್ರತಿದಿನ", "ದಿನವಿಡೀ", "ಬೆಳಿಗ್ಗೆ", "ಸಂಜೆ", "ಮಧ್ಯಾಹ್ನ"],
}

# Implied promises (V7): must map to a lock field or the asset is blocked.
IMPLIED_PROMISES = {
    "en": ["all drinks", "all items", "everything", "free", "unlimited", "every day", "buy one get one", "bogo",
           "no minimum", "guaranteed", "refill", "complimentary", "best price", "lowest price", "cheapest"],
    "hi": ["सभी ड्रिंक्स", "सब कुछ", "मुफ़्त", "मुफ्त", "फ्री", "असीमित", "हर दिन", "एक के साथ एक", "गारंटी"],
    "kn": ["ಎಲ್ಲಾ ಪಾನೀಯ", "ಎಲ್ಲವೂ", "ಉಚಿತ", "ಫ್ರೀ", "ಅನಿಯಮಿತ", "ಪ್ರತಿದಿನ", "ಒಂದರ ಜೊತೆ ಒಂದು", "ಗ್ಯಾರಂಟಿ"],
}

# Latin words allowed inside hi/kn text without flagging (V12): written in the intended script are preferred.
LATIN_ALLOW = {"hi": set(), "kn": set()}
