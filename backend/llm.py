"""
Provider abstraction. All LLM / embedding access goes through this module.

Providers
---------
fastrouter  default for chat/generation   FASTROUTER_API_KEY + FASTROUTER_BASE_URL
openai      direct chat + embedding fallback  OPENAI_API_KEY
neysa       default for embeddings        NEYSA_API_KEY + NEYSA_BASE_URL

chat() / chat_json() use the provider set by CHAT_PROVIDER env var (default: fastrouter).
On primary provider failure they fall back to OpenAI automatically.

embed() tries Neysa first with a 4-second timeout; on any error or timeout it falls
back to OpenAI.  The last provider used is available via last_embed_provider().
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
        "url_default": "https://neysa-deepseek-v4flash.pipeshift.com/v1",
    },
}

# Neysa thinking models emit a slow reasoning pass by default; suppress it.
_THINKING_OFF: dict[str, dict] = {
    "deepseek-v4-flash":   {"chat_template_kwargs": {"thinking": False}},
    "gemma-4-26b-a4b-it":  {"chat_template_kwargs": {"enable_thinking": False}},
    "qwen3.6-27b":         {"chat_template_kwargs": {"enable_thinking": False}},
}


def _extra_body(model: str) -> dict:
    return _THINKING_OFF.get(model, {})


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
        os.environ.get("STRONG_MODEL", "deepseek-v4-flash")
        if tier == "strong"
        else os.environ.get("CHEAP_MODEL", "deepseek-v4-flash")
    )


def _chat_provider() -> str:
    return os.environ.get("CHAT_PROVIDER", "fastrouter")


async def chat(messages: list[dict], tier: str = "cheap") -> str:
    """
    Generate a chat completion.
    Uses CHAT_PROVIDER (default: fastrouter); falls back to OpenAI on any error.
    """
    model = _model(tier)
    provider = _chat_provider()
    try:
        resp = await get_client(provider).chat.completions.create(
            model=model,
            messages=messages,
            extra_body=_extra_body(model),
        )
        return resp.choices[0].message.content or ""
    except Exception as exc:
        if provider == "openai":
            raise
        logger.warning("chat: %s failed (%s) — falling back to openai", provider, exc)
        fallback_model = os.environ.get("OPENAI_FALLBACK_MODEL", "gpt-4o-mini")
        resp = await get_client("openai").chat.completions.create(
            model=fallback_model,
            messages=messages,
        )
        return resp.choices[0].message.content or ""


async def chat_json(messages: list[dict], tier: str = "cheap") -> dict:
    """
    Same as chat(), but enforces JSON output and parses it into a dict.
    Falls back to OpenAI on primary provider failure.
    """
    model = _model(tier)
    provider = _chat_provider()
    try:
        resp = await get_client(provider).chat.completions.create(
            model=model,
            messages=messages,
            response_format={"type": "json_object"},
            extra_body=_extra_body(model),
        )
        return json.loads(resp.choices[0].message.content or "{}")
    except Exception as exc:
        if provider == "openai":
            raise
        logger.warning("chat_json: %s failed (%s) — falling back to openai", provider, exc)
        fallback_model = os.environ.get("OPENAI_FALLBACK_MODEL", "gpt-4o-mini")
        resp = await get_client("openai").chat.completions.create(
            model=fallback_model,
            messages=messages,
            response_format={"type": "json_object"},
        )
        return json.loads(resp.choices[0].message.content or "{}")


async def embed(texts: list[str]) -> list[list[float]]:
    """
    Embed texts. Tries Neysa first (4-second timeout); falls back to OpenAI on any error.
    Logs which provider handled the call; result available via last_embed_provider().
    """
    global _last_embed_provider
    model = os.environ.get("EMBED_MODEL", "text-embedding-3-small")

    neysa_key = os.environ.get("NEYSA_API_KEY", "")
    if neysa_key:
        try:
            neysa_model = os.environ.get("NEYSA_EMBED_MODEL", model)
            resp = await asyncio.wait_for(
                get_client("neysa").embeddings.create(input=texts, model=neysa_model),
                timeout=4.0,
            )
            _last_embed_provider = "neysa"
            logger.info("embed: neysa (%d texts)", len(texts))
            return [item.embedding for item in resp.data]
        except Exception as exc:
            logger.warning("embed: neysa failed (%s) — falling back to openai", exc)

    resp = await get_client("openai").embeddings.create(input=texts, model=model)
    _last_embed_provider = "openai"
    logger.info("embed: openai (%d texts)", len(texts))
    return [item.embedding for item in resp.data]
