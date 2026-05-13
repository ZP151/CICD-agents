"""npm test/build tool."""

from __future__ import annotations

import sys
from typing import Any

from runtime.core.tool_executor import Tool, ToolContext, run_command

ALLOWED = ("npm", "npm.cmd")


def _npm_binary() -> str:
    return "npm.cmd" if sys.platform.startswith("win") else "npm"


async def npm_test(ctx: ToolContext, payload: dict[str, Any]) -> dict[str, Any]:
    script = str(payload.get("script") or "test")
    res = await run_command(
        [_npm_binary(), "run", script, "--silent"],
        cwd=ctx.repo_path,
        timeout_sec=ctx.timeout_sec,
        allowed=ALLOWED,
    )
    return _result(res)


async def npm_build(ctx: ToolContext, payload: dict[str, Any]) -> dict[str, Any]:
    script = str(payload.get("script") or "build")
    res = await run_command(
        [_npm_binary(), "run", script],
        cwd=ctx.repo_path,
        timeout_sec=ctx.timeout_sec,
        allowed=ALLOWED,
    )
    return _result(res)


def _result(res: Any) -> dict[str, Any]:
    return {
        "returncode": res.returncode,
        "stdout": res.stdout[-12000:],
        "stderr": res.stderr[-4000:],
        "duration_ms": res.duration_ms,
    }


def tools() -> list[Tool]:
    return [
        Tool(
            name="npm_test",
            description="Run `npm run <script> --silent` (default: test).",
            parameters={
                "type": "object",
                "properties": {"script": {"type": "string", "default": "test"}},
            },
            handler=npm_test,
            allowed_commands=ALLOWED,
        ),
        Tool(
            name="npm_build",
            description="Run `npm run <script>` (default: build).",
            parameters={
                "type": "object",
                "properties": {"script": {"type": "string", "default": "build"}},
            },
            handler=npm_build,
            allowed_commands=ALLOWED,
        ),
    ]
