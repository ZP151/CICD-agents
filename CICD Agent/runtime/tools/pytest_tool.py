"""pytest tool."""

from __future__ import annotations

import sys
from typing import Any

from runtime.core.tool_executor import Tool, ToolContext, run_command

ALLOWED = (sys.executable, "pytest", "py.test")


async def pytest_run(ctx: ToolContext, payload: dict[str, Any]) -> dict[str, Any]:
    args = list(payload.get("args") or ["-q"])
    cmd = [sys.executable, "-m", "pytest", *args]
    res = await run_command(
        cmd,
        cwd=ctx.repo_path,
        timeout_sec=ctx.timeout_sec,
        allowed=ALLOWED,
    )
    return {
        "returncode": res.returncode,
        "stdout": res.stdout[-20000:],
        "stderr": res.stderr[-4000:],
        "duration_ms": res.duration_ms,
    }


def tools() -> list[Tool]:
    return [
        Tool(
            name="pytest_run",
            description="Run pytest via `python -m pytest` (default args: -q).",
            parameters={
                "type": "object",
                "properties": {
                    "args": {"type": "array", "items": {"type": "string"}}
                },
            },
            handler=pytest_run,
            allowed_commands=ALLOWED,
        ),
    ]
