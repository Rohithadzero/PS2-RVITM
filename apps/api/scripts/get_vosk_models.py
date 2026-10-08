"""Download Vosk speech models into <project>/models/vosk (not committed to git).

Usage:
    python apps/api/scripts/get_vosk_models.py            # the default set: en-in en-us hi
    python apps/api/scripts/get_vosk_models.py gu te fr   # any tag from MODELS below
    python apps/api/scripts/get_vosk_models.py --list

Models come from https://alphacephei.com/vosk/models (small models, built for phones/laptops). Vosk has NO Kannada
model and NO Hinglish model: Kannada needs another engine (Whisper, Sarvam, AI4Bharat) and Hinglish in Latin script
is handled by the Hindi or Indian-English model plus a transliteration/cleanup step (see docs/voice-stack.md).
"""
import shutil
import sys
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DEST = ROOT / "models" / "vosk"
BASE = "https://alphacephei.com/vosk/models/"

# tag -> (model directory name, approx zip MB). Same catalogue the NDial Recorder app uses (checked 2026-09-15).
MODELS = {
    "en-in": ("vosk-model-small-en-in-0.4", 36),
    "en-us": ("vosk-model-small-en-us-0.15", 40),
    "hi": ("vosk-model-small-hi-0.22", 42),
    "gu": ("vosk-model-small-gu-0.42", 100),
    "te": ("vosk-model-small-te-0.42", 58),
    "fr": ("vosk-model-small-fr-0.22", 41),
    "de": ("vosk-model-small-de-0.15", 45),
    "es": ("vosk-model-small-es-0.42", 39),
    "pt": ("vosk-model-small-pt-0.3", 31),
    "ru": ("vosk-model-small-ru-0.22", 45),
    "zh": ("vosk-model-small-cn-0.22", 42),
    "ja": ("vosk-model-small-ja-0.22", 48),
    "ko": ("vosk-model-small-ko-0.22", 82),
    "ar-tn": ("vosk-model-small-ar-tn-0.1-linto", 158),
    "fa": ("vosk-model-small-fa-0.5", 60),
    "tr": ("vosk-model-small-tr-0.3", 35),
}
DEFAULT = ["en-in", "en-us", "hi"]


def installed(name: str) -> bool:
    d = DEST / name
    return (d / "am" / "final.mdl").exists() or (d / "conf" / "model.conf").exists()


def fetch(tag: str) -> bool:
    name, mb = MODELS[tag]
    if installed(name):
        print(f"  {tag}: already installed ({name})")
        return True
    DEST.mkdir(parents=True, exist_ok=True)
    tmp = DEST / f"{name}.zip"
    print(f"  {tag}: downloading {name} (~{mb} MB)")
    try:
        urllib.request.urlretrieve(BASE + name + ".zip", tmp)
        with zipfile.ZipFile(tmp) as z:
            bad = z.testzip()
            if bad:
                raise zipfile.BadZipFile(f"corrupt entry {bad}")
            z.extractall(DEST)
    except Exception as e:  # noqa: BLE001 report and continue with the next model
        print(f"  {tag}: FAILED ({e})")
        tmp.unlink(missing_ok=True)
        return False
    tmp.unlink(missing_ok=True)
    ok = installed(name)
    print(f"  {tag}: {'installed' if ok else 'extracted but model files not found'} -> {DEST / name}")
    return ok


def main(argv):
    if "--list" in argv:
        for tag, (name, mb) in MODELS.items():
            print(f"{tag:6} {name} (~{mb} MB) {'[installed]' if installed(name) else ''}")
        return 0
    tags = [a for a in argv if not a.startswith("-")] or DEFAULT
    unknown = [t for t in tags if t not in MODELS]
    if unknown:
        print(f"Unknown tags: {unknown}. Try --list. (There is no Vosk model for kn or Hinglish.)")
        return 2
    results = {t: fetch(t) for t in tags}
    return 0 if all(results.values()) else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
