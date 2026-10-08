"""Key encryption for user-supplied provider keys and SSRF checks for custom endpoints (docs/security.md)."""
import base64
import hashlib
import ipaddress
import socket
from urllib.parse import urlparse

from cryptography.fernet import Fernet, InvalidToken

import os


def _fernet() -> Fernet:
    master = os.environ.get("KEY_ENCRYPTION_MASTER") or os.environ.get("SESSION_SECRET") or "dev-only-change-me"
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(master.encode()).digest()))


def encrypt_key(key: str) -> bytes:
    return _fernet().encrypt(key.encode())


def decrypt_key(blob):
    try:
        return _fernet().decrypt(blob).decode()
    except (InvalidToken, TypeError):
        return None


def last4(key: str) -> str:
    return key[-4:] if len(key) >= 4 else "****"


def redact(text: str, *secrets: str) -> str:
    for s in secrets:
        if s and len(s) > 6:
            text = text.replace(s, "****")
    return text


class BlockedUrl(ValueError):
    pass


def _blocked_ip(ip: str) -> bool:
    a = ipaddress.ip_address(ip)
    return (a.is_private or a.is_loopback or a.is_link_local or a.is_multicast or a.is_reserved
            or a.is_unspecified)


def check_custom_base_url(url: str, resolve: bool = True) -> str:
    """HTTPS only; reject private/loopback/link-local/metadata hosts (also after DNS resolution)."""
    p = urlparse(url)
    if p.scheme != "https" or not p.hostname:
        raise BlockedUrl("Only https URLs are allowed")
    host = p.hostname
    try:
        ipaddress.ip_address(host)
        is_ip = True
    except ValueError:
        is_ip = False
    if is_ip:
        if _blocked_ip(host):
            raise BlockedUrl("That address is not allowed")
        return url
    if host == "localhost" or host.endswith((".internal", ".local", ".localhost")):
        raise BlockedUrl("That address is not allowed")
    if resolve:
        try:
            for _fam, _t, _p, _c, sa in socket.getaddrinfo(host, p.port or 443):
                if _blocked_ip(sa[0]):
                    raise BlockedUrl("That address is not allowed")
        except socket.gaierror:
            raise BlockedUrl("Host could not be resolved")
    return url
