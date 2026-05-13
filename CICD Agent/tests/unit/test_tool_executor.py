import sys
from pathlib import Path

import pytest

from runtime.core.tool_executor import (
    Tool,
    ToolContext,
    ToolError,
    ToolExecutor,
    redact,
    run_command,
)


def test_redact_strips_known_secrets():
    text = "Authorization: Bearer abcdef\napikey = supersecret123\n"
    out = redact(text)
    assert "abcdef" not in out
    assert "supersecret123" not in out
    assert "***REDACTED***" in out


async def test_run_command_allowlist(tmp_path: Path):
    with pytest.raises(ToolError):
        await run_command(["nonexistent-cmd"], cwd=tmp_path, allowed=("ls",))


async def test_run_command_python_echo(tmp_path: Path):
    res = await run_command(
        [sys.executable, "-c", "print('hello')"],
        cwd=tmp_path,
        allowed=(sys.executable,),
    )
    assert res.returncode == 0
    assert "hello" in res.stdout


async def test_tool_executor_dispatch(tmp_path: Path):
    async def handler(_ctx, payload):
        return {"echo": payload}

    tool = Tool(
        name="echo",
        description="echoes",
        parameters={"type": "object"},
        handler=handler,
    )
    executor = ToolExecutor(ToolContext(repo_path=tmp_path))
    executor.register(tool)
    out = await executor.call("echo", {"x": 1})
    assert out == {"echo": {"x": 1}}

    with pytest.raises(ToolError):
        await executor.call("missing", {})
