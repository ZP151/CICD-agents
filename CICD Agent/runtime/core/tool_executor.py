"""Tool registry + safe subprocess wrapper.

Tools are simple callables that take a `ToolContext` and a JSON-serializable
payload and return a JSON-serializable result. The executor enforces:

- per-tool allowlist of *command names* (the first arg of the subprocess);
- working directory pinned to `repoPath`;
- per-invocation timeout;
- captured stdout/stderr (UTF-8, replaced on decode errors);
- redaction of well-known secret patterns from captured output before
  persisting to logs.
"""

from __future__ import annotations

import asyncio
import inspect
import logging
import os
import re
import shlex
import subprocess
import sys
from collections.abc import Awaitable, Callable, Iterable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)


_SECRET_PATTERNS = [
    re.compile(r"(?i)(authorization\s*:\s*basic\s+)[A-Za-z0-9+/=]+"),
    re.compile(r"(?i)(authorization\s*:\s*bearer\s+)\S+"),
    re.compile(r"(?i)(api[_-]?key\s*[:=]\s*)['\"]?[A-Za-z0-9_\-]{8,}['\"]?"),
    re.compile(r"(?i)(pat\s*[:=]\s*)['\"]?[A-Za-z0-9_\-]{16,}['\"]?"),
    re.compile(r"(?i)(password\s*[:=]\s*)['\"]?[^\s'\"\n]{4,}['\"]?"),
]


def redact(text: str) -> str:
    out = text
    for pat in _SECRET_PATTERNS:
        out = pat.sub(lambda m: f"{m.group(1)}***REDACTED***", out)
    return out


@dataclass
class CommandResult:
    cmd: list[str]
    returncode: int
    stdout: str
    stderr: str
    duration_ms: int


@dataclass
class ToolContext:
    repo_path: Path
    env: dict[str, str] = field(default_factory=dict)
    timeout_sec: float = 600.0
    extra: dict[str, Any] = field(default_factory=dict)


ToolFn = Callable[[ToolContext, dict[str, Any]], Awaitable[dict[str, Any]]] | Callable[
    [ToolContext, dict[str, Any]], dict[str, Any]
]


@dataclass
class Tool:
    name: str
    description: str
    parameters: dict[str, Any]
    handler: ToolFn
    allowed_commands: tuple[str, ...] = ()

    def schema(self) -> dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }


class ToolError(RuntimeError):
    pass


async def run_command(
    cmd: list[str],
    *,
    cwd: Path,
    timeout_sec: float = 600.0,
    env: dict[str, str] | None = None,
    allowed: Iterable[str] | None = None,
    input_text: str | None = None,
) -> CommandResult:
    if not cmd:
        raise ToolError("empty command")
    if allowed is not None and cmd[0] not in allowed:
        raise ToolError(
            f"command '{cmd[0]}' is not in the allowlist for this tool: "
            f"{sorted(allowed)}"
        )

    base_env = os.environ.copy()
    if env:
        base_env.update(env)

    log.info("exec [%s] in %s", " ".join(shlex.quote(c) for c in cmd), cwd)
    start = asyncio.get_event_loop().time()

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        cwd=str(cwd),
        env=base_env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        stdin=subprocess.PIPE if input_text is not None else subprocess.DEVNULL,
    )
    try:
        stdout_b, stderr_b = await asyncio.wait_for(
            proc.communicate(input_text.encode("utf-8") if input_text is not None else None),
            timeout=timeout_sec,
        )
    except asyncio.TimeoutError as e:
        proc.kill()
        raise ToolError(
            f"command timed out after {timeout_sec:.0f}s: {' '.join(cmd)}"
        ) from e

    duration_ms = int((asyncio.get_event_loop().time() - start) * 1000)
    stdout = stdout_b.decode("utf-8", errors="replace")
    stderr = stderr_b.decode("utf-8", errors="replace")
    return CommandResult(
        cmd=list(cmd),
        returncode=int(proc.returncode or 0),
        stdout=redact(stdout),
        stderr=redact(stderr),
        duration_ms=duration_ms,
    )


def split_command(command: str) -> list[str]:
    """Split a shell-ish command into argv, choosing the right strategy by OS."""
    if not command.strip():
        return []
    if sys.platform.startswith("win"):
        # Avoid shlex's POSIX rules for Windows; tolerate `\` separators.
        return command.strip().split()
    return shlex.split(command)


class ToolExecutor:
    def __init__(self, context: ToolContext):
        self.context = context
        self._tools: dict[str, Tool] = {}

    def register(self, tool: Tool) -> None:
        self._tools[tool.name] = tool

    def register_many(self, tools: Iterable[Tool]) -> None:
        for t in tools:
            self.register(t)

    def list(self) -> list[Tool]:
        return list(self._tools.values())

    def schemas(self) -> list[dict[str, Any]]:
        return [t.schema() for t in self._tools.values()]

    async def call(self, name: str, payload: dict[str, Any]) -> dict[str, Any]:
        tool = self._tools.get(name)
        if tool is None:
            raise ToolError(f"unknown tool: {name}")
        result = tool.handler(self.context, payload)
        if inspect.isawaitable(result):
            result = await result  # type: ignore[assignment]
        if not isinstance(result, dict):
            raise ToolError(f"tool '{name}' did not return a dict")
        return result
