"""ScaleKit RBAC auth layer — active only when AUTH_ENABLED=true.

Falls back silently to no-auth on any init/config error so the core demo
is never blocked.
"""

from __future__ import annotations

import logging
import os
import secrets
from typing import Optional

logger = logging.getLogger(__name__)

AUTH_ENABLED: bool = os.getenv("AUTH_ENABLED", "false").lower() == "true"

# In-memory session store: token -> user_dict
# Acceptable for a single-process demo; no persistence needed.
_sessions: dict[str, dict] = {}

_client = None  # ScalekitClient instance, or None if unavailable


def _try_init() -> None:
    global _client
    if not AUTH_ENABLED:
        return
    try:
        from scalekit import ScalekitClient  # type: ignore[import]

        env_url = os.getenv("SCALEKIT_ENV_URL", "")
        client_id = os.getenv("SCALEKIT_CLIENT_ID", "")
        client_secret = os.getenv("SCALEKIT_CLIENT_SECRET", "")

        if not (env_url and client_id and client_secret):
            logger.warning(
                "AUTH_ENABLED=true but SCALEKIT_ENV_URL / SCALEKIT_CLIENT_ID / "
                "SCALEKIT_CLIENT_SECRET are not all set; falling back to no-auth"
            )
            return

        _client = ScalekitClient(
            env_url=env_url,
            client_id=client_id,
            client_secret=client_secret,
        )
        logger.info("ScaleKit client initialized (env=%s)", env_url)
    except Exception as exc:
        logger.warning("ScaleKit init failed, falling back to no-auth: %s", exc)
        _client = None


_try_init()


def is_active() -> bool:
    """True only when auth is enabled AND ScaleKit client initialized successfully."""
    return AUTH_ENABLED and _client is not None


def get_login_url(redirect_uri: str) -> Optional[str]:
    if not is_active():
        return None
    try:
        # options=None → SDK uses default scopes (openid profile email)
        return _client.get_authorization_url(  # type: ignore[union-attr]
            redirect_uri=redirect_uri,
            options=None,
        )
    except Exception as exc:
        logger.warning("ScaleKit get_authorization_url failed: %s", exc)
        return None


def exchange_code(code: str, redirect_uri: str) -> Optional[dict]:
    if not is_active():
        return None
    try:
        from scalekit.client import CodeAuthenticationOptions  # type: ignore[import]

        opts = CodeAuthenticationOptions()
        result = _client.authenticate_with_code(  # type: ignore[union-attr]
            code=code,
            redirect_uri=redirect_uri,
            options=opts,
        )
        # result is a dict: {user, id_token, access_token, ...}
        user: dict = result.get("user", {})

        # Decode raw claims from id_token to extract RBAC roles
        raw_claims: dict = {}
        id_token = result.get("id_token", "")
        if id_token:
            try:
                raw_claims = _client.validate_token(id_token)  # type: ignore[union-attr]
            except Exception as exc:
                logger.warning("ScaleKit validate_token failed: %s", exc)

        raw_roles = raw_claims.get("roles") or []
        if isinstance(raw_roles, str):
            raw_roles = [raw_roles]
        role = "faculty" if "faculty" in raw_roles else "student"

        return {
            "user_id": user.get("id", ""),
            "email": user.get("email", ""),
            "name": user.get("name") or user.get("givenName") or user.get("email", ""),
            "role": role,
        }
    except Exception as exc:
        logger.warning("ScaleKit code exchange failed: %s", exc)
        return None


def create_session(user_info: dict) -> str:
    token = secrets.token_urlsafe(32)
    _sessions[token] = user_info
    return token


def get_session(token: Optional[str]) -> Optional[dict]:
    if not token:
        return None
    return _sessions.get(token)


def delete_session(token: str) -> None:
    _sessions.pop(token, None)
