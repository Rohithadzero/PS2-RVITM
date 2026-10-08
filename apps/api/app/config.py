"""Settings from environment / project-root .env. Secrets never leave the server (docs/security.md)."""
import os
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def _load_dotenv() -> None:
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_load_dotenv()


def _bool(name: str, default: bool) -> bool:
    return os.environ.get(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


@dataclass
class Settings:
    data_dir: Path = field(default_factory=lambda: Path(os.environ.get("DATA_DIR", ROOT / "data")))
    agnes_api_key: str = field(default_factory=lambda: os.environ.get("AGNES_API_KEY", ""))
    agnes_base: str = field(default_factory=lambda: os.environ.get("AGNES_BASE", "https://apihub.agnes-ai.com/v1"))
    agnes_poll_base: str = field(default_factory=lambda: os.environ.get("AGNES_POLL_BASE", "https://apihub.agnes-ai.com/agnesapi"))
    text_model: str = "agnes-3.0-flash"
    image_model: str = "agnes-image-2.5-flash"
    video_model: str = "agnes-video-2.5"
    # AUTH_MODE=dev signs everyone in as the demo owner (local only). google = OAuth (not implemented yet).
    auth_mode: str = field(default_factory=lambda: os.environ.get("AUTH_MODE", "dev"))
    session_secret: str = field(default_factory=lambda: os.environ.get("SESSION_SECRET", "dev-only-change-me"))
    key_encryption_master: str = field(default_factory=lambda: os.environ.get("KEY_ENCRYPTION_MASTER", ""))
    allow_list: list = field(default_factory=lambda: [e.strip() for e in os.environ.get("ALLOW_LIST", "").split(",") if e.strip()])
    cors_origins: list = field(default_factory=lambda: os.environ.get(
        "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(","))
    calibrate_on_start: bool = field(default_factory=lambda: _bool("CALIBRATE_ON_START", False))
    # Free-tier RPM presets (docs/settings.md). Tier can be raised per provider in Settings.
    rpm: dict = field(default_factory=lambda: {"text": 10, "image": 10, "video": 1})
    offline_llm: bool = field(default_factory=lambda: _bool("OFFLINE_LLM", False))  # canned outputs, no network

    @property
    def db_path(self) -> Path:
        return self.data_dir / "app.db"


settings = Settings()
