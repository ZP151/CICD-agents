"""Azure OpenAI client wrapper.

Provides chat-completion (with tool-calls) and embeddings, plus simple retry,
token accounting and graceful degradation when no credentials are configured.
"""

from __future__ import annotations

import asyncio
import logging
import random
from dataclasses import dataclass, field
from typing import Any

from runtime.config.settings import Settings, get_settings

log = logging.getLogger(__name__)


@dataclass
class LLMUsage:
    prompt_tokens: int = 0
    completion_tokens: int = 0
    embed_tokens: int = 0

    def add_chat(self, usage: dict[str, int] | None) -> None:
        if not usage:
            return
        self.prompt_tokens += int(usage.get("prompt_tokens", 0))
        self.completion_tokens += int(usage.get("completion_tokens", 0))

    def add_embed(self, usage: dict[str, int] | None) -> None:
        if not usage:
            return
        self.embed_tokens += int(usage.get("prompt_tokens", 0))


@dataclass
class ChatToolCall:
    id: str
    name: str
    arguments: str


@dataclass
class ChatResult:
    content: str
    tool_calls: list[ChatToolCall] = field(default_factory=list)
    finish_reason: str = ""
    raw: dict[str, Any] = field(default_factory=dict)


class LLMUnavailableError(RuntimeError):
    pass


class LLMClient:
    """Thin wrapper around the Azure OpenAI Python SDK."""

    def __init__(self, settings: Settings | None = None):
        self.settings = settings or get_settings()
        self.usage = LLMUsage()
        self._client = None

    @property
    def configured(self) -> bool:
        return self.settings.llm_configured

    def _get_client(self) -> Any:
        if self._client is not None:
            return self._client
        if not self.configured:
            raise LLMUnavailableError(
                "Azure OpenAI is not configured (AZURE_OPENAI_ENDPOINT and "
                "AZURE_OPENAI_API_KEY required)."
            )
        from openai import AzureOpenAI  # local import to keep startup snappy

        self._client = AzureOpenAI(
            api_key=self.settings.azure_openai_api_key,
            api_version=self.settings.azure_openai_api_version,
            azure_endpoint=self.settings.azure_openai_endpoint,
        )
        return self._client

    async def chat(
        self,
        messages: list[dict[str, Any]],
        *,
        tools: list[dict[str, Any]] | None = None,
        temperature: float = 0.2,
        max_tokens: int = 1024,
        retries: int = 3,
    ) -> ChatResult:
        for attempt in range(retries):
            try:
                return await asyncio.to_thread(
                    self._chat_sync,
                    messages,
                    tools,
                    temperature,
                    max_tokens,
                )
            except LLMUnavailableError:
                raise
            except Exception as exc:
                if attempt == retries - 1:
                    raise
                backoff = (2**attempt) + random.uniform(0, 0.5)
                log.warning(
                    "chat call failed (attempt %d/%d): %s; retrying in %.1fs",
                    attempt + 1,
                    retries,
                    exc,
                    backoff,
                )
                await asyncio.sleep(backoff)
        raise RuntimeError("unreachable")

    def _chat_sync(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None,
        temperature: float,
        max_tokens: int,
    ) -> ChatResult:
        client = self._get_client()
        kwargs: dict[str, Any] = {
            "model": self.settings.azure_openai_chat_deployment,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if tools:
            kwargs["tools"] = tools
            kwargs["tool_choice"] = "auto"

        resp = client.chat.completions.create(**kwargs)
        choice = resp.choices[0]
        msg = choice.message
        tool_calls: list[ChatToolCall] = []
        if getattr(msg, "tool_calls", None):
            for tc in msg.tool_calls or []:
                tool_calls.append(
                    ChatToolCall(
                        id=tc.id,
                        name=tc.function.name,
                        arguments=tc.function.arguments or "{}",
                    )
                )

        usage_dict: dict[str, int] = {}
        if resp.usage is not None:
            usage_dict = {
                "prompt_tokens": resp.usage.prompt_tokens,
                "completion_tokens": resp.usage.completion_tokens,
            }
        self.usage.add_chat(usage_dict)

        return ChatResult(
            content=msg.content or "",
            tool_calls=tool_calls,
            finish_reason=str(choice.finish_reason or ""),
            raw=resp.model_dump() if hasattr(resp, "model_dump") else {},
        )

    async def embed(self, inputs: list[str], retries: int = 3) -> list[list[float]]:
        if not inputs:
            return []
        for attempt in range(retries):
            try:
                return await asyncio.to_thread(self._embed_sync, inputs)
            except LLMUnavailableError:
                raise
            except Exception as exc:
                if attempt == retries - 1:
                    raise
                backoff = (2**attempt) + random.uniform(0, 0.5)
                log.warning(
                    "embed call failed (attempt %d/%d): %s; retrying in %.1fs",
                    attempt + 1,
                    retries,
                    exc,
                    backoff,
                )
                await asyncio.sleep(backoff)
        raise RuntimeError("unreachable")

    def _embed_sync(self, inputs: list[str]) -> list[list[float]]:
        client = self._get_client()
        resp = client.embeddings.create(
            model=self.settings.azure_openai_embedding_deployment,
            input=inputs,
        )
        if resp.usage is not None:
            self.usage.add_embed(
                {"prompt_tokens": resp.usage.prompt_tokens}
            )
        return [d.embedding for d in resp.data]
