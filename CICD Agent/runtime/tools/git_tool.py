"""Git tool (read + a small set of safe writes).

Allowed commands: `git`. All commands are pinned to `repo_path` as cwd.
"""

from __future__ import annotations

from typing import Any

from runtime.core.tool_executor import Tool, ToolContext, ToolError, run_command

ALLOWED = ("git",)


async def _git(ctx: ToolContext, args: list[str], timeout: float | None = None) -> dict[str, Any]:
    res = await run_command(
        ["git", *args],
        cwd=ctx.repo_path,
        timeout_sec=timeout or ctx.timeout_sec,
        allowed=ALLOWED,
    )
    return {
        "returncode": res.returncode,
        "stdout": res.stdout,
        "stderr": res.stderr,
        "duration_ms": res.duration_ms,
    }


async def git_status(ctx: ToolContext, _payload: dict[str, Any]) -> dict[str, Any]:
    return await _git(ctx, ["status", "--porcelain=v1", "-b"])


async def git_diff(ctx: ToolContext, payload: dict[str, Any]) -> dict[str, Any]:
    target = str(payload.get("target_branch") or "")
    extra: list[str] = []
    if target:
        extra.append(f"{target}...HEAD")
    if payload.get("name_only"):
        extra.append("--name-only")
    return await _git(ctx, ["diff", *extra])


async def git_current_branch(ctx: ToolContext, _payload: dict[str, Any]) -> dict[str, Any]:
    res = await _git(ctx, ["rev-parse", "--abbrev-ref", "HEAD"])
    res["branch"] = res["stdout"].strip()
    return res


async def git_log(ctx: ToolContext, payload: dict[str, Any]) -> dict[str, Any]:
    n = int(payload.get("limit", 20))
    return await _git(ctx, ["log", f"-n{n}", "--pretty=format:%h %an %ad %s", "--date=short"])


async def git_push(ctx: ToolContext, payload: dict[str, Any]) -> dict[str, Any]:
    remote = str(payload.get("remote", "origin"))
    branch = str(payload.get("branch") or "")
    if not branch:
        raise ToolError("git_push requires 'branch'")
    return await _git(ctx, ["push", "-u", remote, branch])


async def git_create_branch(ctx: ToolContext, payload: dict[str, Any]) -> dict[str, Any]:
    name = str(payload.get("name") or "")
    if not name:
        raise ToolError("git_create_branch requires 'name'")
    return await _git(ctx, ["checkout", "-b", name])


def tools() -> list[Tool]:
    return [
        Tool(
            name="git_status",
            description="Show working-tree status (porcelain v1, includes branch info).",
            parameters={"type": "object", "properties": {}},
            handler=git_status,
            allowed_commands=ALLOWED,
        ),
        Tool(
            name="git_diff",
            description="Show diff against an optional target branch (e.g. 'main').",
            parameters={
                "type": "object",
                "properties": {
                    "target_branch": {"type": "string"},
                    "name_only": {"type": "boolean"},
                },
            },
            handler=git_diff,
            allowed_commands=ALLOWED,
        ),
        Tool(
            name="git_current_branch",
            description="Return the current branch name.",
            parameters={"type": "object", "properties": {}},
            handler=git_current_branch,
            allowed_commands=ALLOWED,
        ),
        Tool(
            name="git_log",
            description="Recent commits (one-line summary).",
            parameters={
                "type": "object",
                "properties": {"limit": {"type": "integer", "default": 20}},
            },
            handler=git_log,
            allowed_commands=ALLOWED,
        ),
        Tool(
            name="git_push",
            description="Push a branch to a remote (defaults to origin).",
            parameters={
                "type": "object",
                "required": ["branch"],
                "properties": {
                    "branch": {"type": "string"},
                    "remote": {"type": "string", "default": "origin"},
                },
            },
            handler=git_push,
            allowed_commands=ALLOWED,
        ),
        Tool(
            name="git_create_branch",
            description="Create and switch to a new branch.",
            parameters={
                "type": "object",
                "required": ["name"],
                "properties": {"name": {"type": "string"}},
            },
            handler=git_create_branch,
            allowed_commands=ALLOWED,
        ),
    ]
