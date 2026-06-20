"""
Provider abstraction. All LLM / embedding access goes through this module.

Providers
---------
neysa       default for chat/generation   NEYSA_API_KEY + NEYSA_BASE_URL
fastrouter  alternative for chat          FASTROUTER_API_KEY + FASTROUTER_BASE_URL
openai      embeddings (+ chat fallback)  OPENAI_API_KEY

chat() / chat_json() use the "neysa" provider by default (set CHAT_PROVIDER=fastrouter
to switch).  Neysa thinking models need chat_template_kwargs to suppress the reasoning
pass — _extra_body() handles this automatically based on the model name.

embed() tries OpenAI; falls back gracefully if no key is set (RAG index is empty).
"""

from __future__ import annotations

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
    return os.environ.get("CHAT_PROVIDER", "neysa")


async def chat(messages: list[dict], tier: str = "cheap") -> str:
    """Generate a chat completion. Provider selected by CHAT_PROVIDER env var (default: neysa)."""
    model = _model(tier)
    resp = await get_client(_chat_provider()).chat.completions.create(
        model=model,
        messages=messages,
        extra_body=_extra_body(model),
    )
    return resp.choices[0].message.content or ""


async def chat_json(messages: list[dict], tier: str = "cheap") -> dict:
    """Same as chat(), but enforces JSON output and parses it into a dict."""
    model = _model(tier)
    resp = await get_client(_chat_provider()).chat.completions.create(
        model=model,
        messages=messages,
        response_format={"type": "json_object"},
        extra_body=_extra_body(model),
    )
    return json.loads(resp.choices[0].message.content or "{}")


async def embed(texts: list[str]) -> list[list[float]]:
    """
    Embed texts via OpenAI text-embedding-3-small.
    Raises if OPENAI_API_KEY is not set (RAG index will be empty but app still boots).
    """
    global _last_embed_provider
    model = os.environ.get("EMBED_MODEL", "text-embedding-3-small")
    resp = await get_client("openai").embeddings.create(input=texts, model=model)
    _last_embed_provider = "openai"
    logger.info("embed: openai (%d texts)", len(texts))
    return [item.embedding for item in resp.data]
