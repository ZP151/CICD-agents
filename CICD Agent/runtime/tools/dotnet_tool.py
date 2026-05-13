"""dotnet build/test tool."""

from __future__ import annotations

from typing import Any

from runtime.core.tool_executor import Tool, ToolContext, run_command

ALLOWED = ("dotnet",)


async def dotnet_build(ctx: ToolContext, payload: dict[str, Any]) -> dict[str, Any]:
    extra = list(payload.get("args") or [])
    res = await run_command(
        ["dotnet", "build", "--nologo", *extra],
        cwd=ctx.repo_path,
        timeout_sec=ctx.timeout_sec,
        allowed=ALLOWED,
    )
    return _result(res)


async def dotnet_test(ctx: ToolContext, payload: dict[str, Any]) -> dict[str, Any]:
    extra = list(payload.get("args") or [])
    res = await run_command(
        ["dotnet", "test", "--nologo", *extra],
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
            name="dotnet_build",
            description="Run `dotnet build --nologo` in the repo.",
            parameters={
                "type": "object",
                "properties": {
                    "args": {"type": "array", "items": {"type": "string"}}
                },
            },
            handler=dotnet_build,
            allowed_commands=ALLOWED,
        ),
        Tool(
            name="dotnet_test",
            description="Run `dotnet test --nologo` in the repo.",
            parameters={
                "type": "object",
                "properties": {
                    "args": {"type": "array", "items": {"type": "string"}}
                },
            },
            handler=dotnet_test,
            allowed_commands=ALLOWED,
        ),
    ]
