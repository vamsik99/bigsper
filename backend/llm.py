"""
Provider abstraction. All LLM / embedding access goes through this module.

Providers
---------
fastrouter  default for chat/generation   FASTROUTER_API_KEY + FASTROUTER_BASE_URL
openai      direct fallback + embeddings  OPENAI_API_KEY
neysa       default for embeddings        NEYSA_API_KEY + NEYSA_BASE_URL

embed() tries Neysa with a 4-second timeout; falls back to OpenAI on any error or timeout.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os

from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

_last_embed_provider: str = "not_run"


def last_embed_provider() -> str:
    """Return which provider handled the most recent embed() call."""
    return _last_embed_provider


_PROVIDER_CFG: dict[str, dict[str, str | None]] = {
    "fastrouter": {
        "key_env":     "FASTROUTER_API_KEY",
        "url_env":     "FASTROUTER_BASE_URL",
        "url_default": "https://api.fastrouter.ai/v1",
    },
    "openai": {
        "key_env":     "OPENAI_API_KEY",
        "url_env":     None,
        "url_default": None,
    },
    "neysa": {
        "key_env":     "NEYSA_API_KEY",
        "url_env":     "NEYSA_BASE_URL",
        "url_default": "https://api.neysa.ai/v1",
    },
}


def get_client(provider: str) -> AsyncOpenAI:
    """Return an OpenAI-SDK-compatible async client for the named provider."""
    cfg = _PROVIDER_CFG.get(provider)
    if cfg is None:
        raise ValueError(f"Unknown provider {provider!r}. Known: {list(_PROVIDER_CFG)}")
    api_key = os.environ.get(cfg["key_env"], "") or "placeholder"  # type: ignore[arg-type]
    kwargs: dict = {"api_key": api_key}
    if cfg["url_env"]:
        base_url = os.environ.get(cfg["url_env"], cfg["url_default"])  # type: ignore[arg-type]
        if base_url:
            kwargs["base_url"] = base_url
    return AsyncOpenAI(**kwargs)


def _model(tier: str) -> str:
    return (
        os.environ.get("STRONG_MODEL", "gpt-4o")
        if tier == "strong"
        else os.environ.get("CHEAP_MODEL", "gpt-4o-mini")
    )


async def chat(messages: list[dict], tier: str = "cheap") -> str:
    """Generate a chat completion via FastRouter. tier='cheap'|'strong'."""
    resp = await get_client("fastrouter").chat.completions.create(
        model=_model(tier),
        messages=messages,
    )
    return resp.choices[0].message.content or ""


async def chat_json(messages: list[dict], tier: str = "cheap") -> dict:
    """Same as chat(), but enforces JSON output and parses it into a dict."""
    resp = await get_client("fastrouter").chat.completions.create(
        model=_model(tier),
        messages=messages,
        response_format={"type": "json_object"},
    )
    return json.loads(resp.choices[0].message.content or "{}")


async def embed(texts: list[str]) -> list[list[float]]:
    """
    Embed texts via Neysa (4-second timeout).
    Falls back to OpenAI on any error or timeout. Logs which path ran.
    """
    global _last_embed_provider
    model = os.environ.get("EMBED_MODEL", "text-embedding-3-small")
    try:
        resp = await asyncio.wait_for(
            get_client("neysa").embeddings.create(input=texts, model=model),
            timeout=4.0,
        )
        _last_embed_provider = "neysa"
        logger.info("embed: neysa (%d texts)", len(texts))
        return [item.embedding for item in resp.data]
    except Exception as exc:  # noqa: BLE001
        logger.warning("embed: neysa failed (%s) — falling back to openai", exc)
        resp = await get_client("openai").embeddings.create(input=texts, model=model)
        _last_embed_provider = "openai"
        logger.info("embed: openai fallback (%d texts)", len(texts))
        return [item.embedding for item in resp.data]
