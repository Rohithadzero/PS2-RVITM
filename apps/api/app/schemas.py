from __future__ import annotations

from pydantic import BaseModel, Field, field_validator

from app.config import CHANNELS, LANGS
from app.dates import require_iso_date


def _clean_list(value: object) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        parts = value.split(",")
    elif isinstance(value, list):
        parts = value
    else:
        raise ValueError("expected a list of strings")
    return [str(part).strip() for part in parts if str(part).strip()]


class OfferFacts(BaseModel):
    item: str = Field(min_length=1, max_length=200)
    discount_percent: float | None = None
    price_amount: float | None = None
    currency: str | None = "INR"
    dates: list[str] = Field(default_factory=list)
    timings: str | None = None
    terms: str | None = None
    audiences: list[str] = Field(min_length=1)
    languages: list[str] = Field(default_factory=lambda: ["en", "kn", "hi"])
    channels: list[str] = Field(default_factory=lambda: ["instagram_post", "whatsapp", "poster"])

    @field_validator("timings", "terms", "currency", mode="before")
    @classmethod
    def _blank_to_none(cls, value: object) -> object:
        if isinstance(value, str):
            stripped = value.strip()
            return stripped or None
        return value

    @field_validator("item", mode="before")
    @classmethod
    def _item(cls, value: object) -> str:
        if not isinstance(value, str) or not value.strip():
            raise ValueError("item is required")
        return value.strip()

    @field_validator("audiences", "languages", "channels", mode="before")
    @classmethod
    def _lists(cls, value: object) -> list[str]:
        return _clean_list(value)

    @field_validator("dates", mode="before")
    @classmethod
    def _dates_in(cls, value: object) -> list[str]:
        return _clean_list(value)

    @field_validator("dates")
    @classmethod
    def _dates(cls, value: list[str]) -> list[str]:
        seen: list[str] = []
        for item in value:
            iso = require_iso_date(item)
            if iso not in seen:
                seen.append(iso)
        return seen

    @field_validator("languages")
    @classmethod
    def _languages(cls, value: list[str]) -> list[str]:
        unknown = [lang for lang in value if lang not in LANGS]
        if unknown:
            raise ValueError(f"languages must be one of {', '.join(LANGS)} (got {', '.join(unknown)})")
        if not value:
            raise ValueError("at least one language is required")
        return value

    @field_validator("channels")
    @classmethod
    def _channels(cls, value: list[str]) -> list[str]:
        unknown = [channel for channel in value if channel not in CHANNELS]
        if unknown:
            raise ValueError(
                f"channels must be one of {', '.join(CHANNELS)} (got {', '.join(unknown)})"
            )
        if not value:
            raise ValueError("at least one channel is required")
        return value

    @field_validator("audiences")
    @classmethod
    def _audiences(cls, value: list[str]) -> list[str]:
        if not value:
            raise ValueError("at least one audience is required")
        return value

    @field_validator("discount_percent", "price_amount")
    @classmethod
    def _non_negative(cls, value: float | None) -> float | None:
        if value is not None and value < 0:
            raise ValueError("must be zero or greater")
        return value


class TranscriptIn(BaseModel):
    transcript: str = Field(min_length=1, max_length=8000)
    brand_voice: str | None = None


class CampaignIdIn(BaseModel):
    campaign_id: str = Field(min_length=1)


class ChangeIn(BaseModel):
    campaign_id: str = Field(min_length=1)
    text: str = Field(min_length=1, max_length=2000)
    patch: dict | None = None


class ContentIn(BaseModel):
    content: str = Field(max_length=6000)
