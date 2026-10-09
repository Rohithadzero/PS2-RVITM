"""Keep the developer's real .env out of the tests: login gate, Google client and CORS settings must not leak in."""
import pytest

LOCAL_ONLY = ("REQUIRE_LOGIN", "ALLOWED_EMAILS", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "FRONTEND_URL", "SESSION_SECRET",
              "CORS_ORIGINS", "GOOGLE_REDIRECT_URI", "COOKIE_SECURE", "TEXT_RPM", "IMAGE_RPM", "VIDEO_RPM", "TOKEN_PLAN_KEY")


@pytest.fixture(autouse=True)
def isolate_environment(monkeypatch):
    for name in LOCAL_ONLY:
        monkeypatch.delenv(name, raising=False)
