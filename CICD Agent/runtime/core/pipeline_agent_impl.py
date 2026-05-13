"""End-to-end Pipeline Agent implementation.

Steps:
1. Load profile + open per-repo index/memory.
2. Refresh index (incremental) and embeddings.
3. Compute git diff vs target branch (or staged diff for empty target).
4. Build context bundle.
5. Run planner with tool registry.
6. Optionally run build/test commands per profile.
7. Optionally create PR + link work item + trigger pipeline via ADO.
8. Persist a row in pr_history.

All long-running pieces report progress via `handle.step(...)`.
"""

from __future__ import annotations

import logging
from datetime import datetime
from pathlib import Path
from typing import Any

from runtime.config.profiles import Profile
from runtime.core.context_builder import ContextBuilder
from runtime.core.llm_client import LLMClient
from runtime.core.memory_store import MemoryStore
from runtime.core.planner import Planner, PlannerResult
from runtime.core.repo_indexer import RepoIndexer
from runtime.core.task_queue import TaskHandle
from runtime.core.tool_executor import (
    ToolContext,
    ToolError,
    ToolExecutor,
    run_command,
    split_command,
)
from runtime.core.vector_index import VectorIndex
from runtime.tools.azure_devops_tool import tools as ado_tools
from runtime.tools.dotnet_tool import tools as dotnet_tools
from runtime.tools.git_tool import tools as git_tools
from runtime.tools.npm_tool import tools as npm_tools
from runtime.tools.pytest_tool import tools as pytest_tools

log = logging.getLogger(__name__)


async def run(
    *,
    handle: TaskHandle,
    repo_path: Path,
    profile: Profile,
    payload: dict[str, Any],
) -> dict[str, Any]:
    indexer = RepoIndexer(repo_path, profile=profile)
    vectors = VectorIndex(repo_path)
    memory = MemoryStore(repo_path)
    llm = LLMClient()

    try:
        return await _run(
            handle=handle,
            repo_path=repo_path,
            profile=profile,
            payload=payload,
            indexer=indexer,
            vectors=vectors,
            memory=memory,
            llm=llm,
        )
    finally:
        indexer.close()
        vectors.close()
        memory.close()


async def _run(
    *,
    handle: TaskHandle,
    repo_path: Path,
    profile: Profile,
    payload: dict[str, Any],
    indexer: RepoIndexer,
    vectors: VectorIndex,
    memory: MemoryStore,
    llm: LLMClient,
) -> dict[str, Any]:
    handle.step("index_repo", "info", "incremental scan")
    stats = indexer.update()
    handle.step(
        "index_repo",
        "ok",
        f"files seen={stats.files_seen}, indexed={stats.files_indexed}, "
        f"removed={stats.files_removed}, symbols={stats.symbols_added}",
    )

    if llm.configured:
        handle.step("embed_chunks", "info", "embedding new chunks")
        embedded = await vectors.embed_pending(llm)
        handle.step("embed_chunks", "ok", f"embedded {embedded} chunks")
    else:
        handle.step(
            "embed_chunks",
            "warn",
            "Azure OpenAI not configured; skipping embeddings (vector search disabled)",
        )

    await _ensure_git_initialized(repo_path, handle)
    await _ensure_feature_branch(repo_path, profile, payload, handle)

    target_branch = (
        payload.get("targetBranch") or profile.azure_devops.default_target_branch or "main"
    )

    handle.step("compute_diff", "info", f"target={target_branch}")
    diff_text, current_branch = await _compute_diff(repo_path, target_branch)
    handle.step(
        "compute_diff",
        "ok",
        f"current_branch={current_branch}, diff_chars={len(diff_text)}",
    )

    builder = ContextBuilder(repo_path, indexer, vectors)
    bundle = await builder.build(diff_text, target_branch, llm)
    handle.step(
        "build_context",
        "ok",
        f"changed_files={len(bundle.changed_files)}, "
        f"related_chunks={len(bundle.related_chunks)}",
    )

    executor = ToolExecutor(
        ToolContext(
            repo_path=repo_path,
            timeout_sec=900.0,
            extra={
                "ado_org": profile.azure_devops.organization,
                "ado_project": profile.azure_devops.project,
                "ado_repository": profile.azure_devops.repository,
            },
        )
    )
    executor.register_many(git_tools())
    executor.register_many(dotnet_tools())
    executor.register_many(npm_tools())
    executor.register_many(pytest_tools())
    executor.register_many(ado_tools())

    planner = Planner(llm=llm, executor=executor)
    if llm.configured:
        handle.step("plan", "info", "calling Azure OpenAI")
    else:
        handle.step("plan", "warn", "LLM unavailable; using deterministic summary")
    plan: PlannerResult = await planner.run(bundle)
    handle.step(
        "plan",
        "ok",
        f"risk={plan.risk_level}, tool_calls={len(plan.tool_calls_made)}, "
        f"used_llm={plan.used_llm}",
    )

    build_result = await _maybe_run(repo_path, profile.build.command, handle, "build")
    test_result = await _maybe_run(repo_path, profile.test.command, handle, "test")

    pr_info: dict[str, Any] = {}
    if payload.get("autoCreatePr", True):
        try:
            pr_info = await _maybe_create_pr(
                repo_path=repo_path,
                executor=executor,
                profile=profile,
                payload=payload,
                plan=plan,
                source_branch=current_branch,
                handle=handle,
            )
        except ToolError as exc:
            handle.step("create_pr", "error", str(exc))

    pipeline_run: dict[str, Any] = {}
    if payload.get("triggerPipeline") and profile.azure_devops.pipeline_id:
        try:
            pipeline_run = await executor.call(
                "ado_trigger_pipeline",
                {
                    "pipeline_id": int(profile.azure_devops.pipeline_id),
                    "branch": current_branch,
                },
            )
            handle.step(
                "trigger_pipeline",
                "ok",
                f"run_id={pipeline_run.get('run_id')}",
            )
        except ToolError as exc:
            handle.step("trigger_pipeline", "error", str(exc))

    memory.record_pr(
        task_id=handle.task_id,
        pr_id=int(pr_info.get("pull_request_id") or 0) or None,
        pr_url=str(pr_info.get("url") or ""),
        title=plan.title,
        summary=plan.summary,
        risk_level=plan.risk_level,
    )

    return {
        "plan": plan.as_dict(),
        "changed_files": [
            {
                "path": cf.path,
                "status": cf.status,
                "additions": cf.additions,
                "deletions": cf.deletions,
            }
            for cf in bundle.changed_files
        ],
        "build": build_result,
        "test": test_result,
        "pull_request": pr_info,
        "pipeline_run": pipeline_run,
        "llm_usage": {
            "prompt_tokens": llm.usage.prompt_tokens,
            "completion_tokens": llm.usage.completion_tokens,
            "embed_tokens": llm.usage.embed_tokens,
        },
    }


async def _ensure_git_initialized(repo_path: Path, handle: TaskHandle) -> None:
    """Run git init + initial commit if the directory is not a git repo."""
    check = await run_command(
        ["git", "rev-parse", "--git-dir"],
        cwd=repo_path,
        allowed=("git",),
    )
    if check.returncode == 0:
        return

    handle.step("git_init", "info", f"no git repo found in {repo_path}; initialising")
    await run_command(["git", "init"], cwd=repo_path, allowed=("git",))
    await run_command(["git", "add", "."], cwd=repo_path, allowed=("git",))
    commit = await run_command(
        ["git", "commit", "-m", "chore: initial commit (cicd-agent)"],
        cwd=repo_path,
        allowed=("git",),
    )
    if commit.returncode == 0:
        handle.step("git_init", "ok", "repository initialised with initial commit")
    else:
        handle.step("git_init", "warn", f"git init succeeded but commit failed: {commit.stderr[:200]}")


async def _ensure_feature_branch(
    repo_path: Path,
    profile: "Profile",  # noqa: F821
    payload: dict[str, Any],
    handle: TaskHandle,
) -> None:
    """If currently on the default target branch, create and checkout a feature branch."""
    branch_res = await run_command(
        ["git", "rev-parse", "--abbrev-ref", "HEAD"],
        cwd=repo_path,
        allowed=("git",),
    )
    current = branch_res.stdout.strip()
    target = (
        payload.get("targetBranch")
        or profile.azure_devops.default_target_branch
        or "main"
    )

    if current not in ("HEAD", target):
        return

    work_item = str(payload.get("workItem") or "").strip()
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    new_branch = (
        f"feature/workitem-{work_item}" if work_item else f"feature/cicd-agent-{timestamp}"
    )

    handle.step(
        "checkout_branch",
        "info",
        f"currently on '{current}' (same as target); creating feature branch '{new_branch}'",
    )
    result = await run_command(
        ["git", "checkout", "-b", new_branch],
        cwd=repo_path,
        allowed=("git",),
    )
    if result.returncode == 0:
        handle.step("checkout_branch", "ok", f"checked out '{new_branch}'")
    else:
        handle.step(
            "checkout_branch",
            "warn",
            f"could not create branch '{new_branch}': {result.stderr[:200]}",
        )


async def _compute_diff(repo_path: Path, target_branch: str) -> tuple[str, str]:
    """Return (diff_text, current_branch). Falls back gracefully when target ref is missing."""
    branch_res = await run_command(
        ["git", "rev-parse", "--abbrev-ref", "HEAD"],
        cwd=repo_path,
        allowed=("git",),
    )
    current_branch = branch_res.stdout.strip() or "HEAD"

    diff_res = await run_command(
        ["git", "diff", f"{target_branch}...HEAD"],
        cwd=repo_path,
        allowed=("git",),
    )
    if diff_res.returncode != 0 or not diff_res.stdout.strip():
        # Either branch doesn't exist locally or there is no committed diff;
        # fall back to staged + working-tree diff.
        fallback = await run_command(
            ["git", "diff", "HEAD"],
            cwd=repo_path,
            allowed=("git",),
        )
        return fallback.stdout, current_branch
    return diff_res.stdout, current_branch


async def _maybe_run(
    repo_path: Path,
    command: str,
    handle: TaskHandle,
    label: str,
) -> dict[str, Any]:
    if not command.strip():
        handle.step(label, "info", "skipped (no command in profile)")
        return {"skipped": True}
    cmd = split_command(command)
    handle.step(label, "info", " ".join(cmd))
    try:
        # We don't enforce an allowlist here because the operator wrote the
        # command into their own profile; we still pin cwd and timeout.
        res = await run_command(cmd, cwd=repo_path, timeout_sec=900.0)
    except Exception as exc:
        handle.step(label, "error", str(exc))
        return {"ok": False, "error": str(exc)}
    handle.step(
        label,
        "ok" if res.returncode == 0 else "error",
        f"exit={res.returncode} in {res.duration_ms}ms",
    )
    return {
        "ok": res.returncode == 0,
        "returncode": res.returncode,
        "stdout_tail": res.stdout[-4000:],
        "stderr_tail": res.stderr[-2000:],
        "duration_ms": res.duration_ms,
    }


async def _push_branch(
    repo_path: Path,
    branch: str,
    pat: str,
    org: str,
    project: str,
    repository: str,
    handle: TaskHandle,
) -> bool:
    """Push branch to ADO using PAT via http.extraheader (avoids URL-encoding issues on Windows)."""
    import base64 as _b64

    token = _b64.b64encode(f":{pat}".encode()).decode("ascii")
    remote_url = f"https://dev.azure.com/{org}/{project}/_git/{repository}"
    auth_header = f"AUTHORIZATION: Basic {token}"

    handle.step("push_branch", "info", f"pushing '{branch}' to ADO remote")
    result = await run_command(
        [
            "git",
            "-c", f"http.extraheader={auth_header}",
            "push", remote_url,
            f"{branch}:{branch}",
        ],
        cwd=repo_path,
        allowed=("git",),
    )

    if result.returncode == 0:
        handle.step("push_branch", "ok", f"branch '{branch}' pushed successfully")
        return True

    # Redact token from logged output
    safe_err = result.stderr.replace(token, "***").replace(pat, "***")
    handle.step("push_branch", "warn", f"push failed (exit={result.returncode}): {safe_err[:300]}")
    return False


async def _maybe_create_pr(
    *,
    repo_path: Path,
    executor: ToolExecutor,
    profile: Profile,
    payload: dict[str, Any],
    plan: PlannerResult,
    source_branch: str,
    handle: TaskHandle,
) -> dict[str, Any]:
    if not profile.azure_devops.repository:
        handle.step(
            "create_pr",
            "warn",
            "profile missing azure_devops.repository; skipping PR creation",
        )
        return {"skipped": True}
    if source_branch in ("HEAD", profile.azure_devops.default_target_branch):
        handle.step(
            "create_pr",
            "warn",
            f"source branch '{source_branch}' is invalid for a PR; "
            "checkout a feature branch first",
        )
        return {"skipped": True}

    from runtime.tools.azure_devops_tool import _get_pat
    from runtime.config.settings import get_settings as _get_settings

    settings = _get_settings()
    org = profile.azure_devops.organization or settings.azure_devops_org
    project = profile.azure_devops.project or settings.azure_devops_project

    try:
        pat = _get_pat()
        await _push_branch(
            repo_path=repo_path,
            branch=source_branch,
            pat=pat,
            org=org,
            project=project,
            repository=profile.azure_devops.repository,
            handle=handle,
        )
    except Exception as exc:
        handle.step("push_branch", "warn", f"could not push branch: {exc}")

    title = (
        str(payload.get("title") or "").strip()
        or plan.title
        or f"Update from {source_branch}"
    )
    description = plan.summary
    work_item = payload.get("workItem")
    if work_item:
        description = f"Work Item: AB#{work_item}\n\n" + description

    handle.step("create_pr", "info", f"opening PR {source_branch} -> "
                f"{profile.azure_devops.default_target_branch}")
    pr = await executor.call(
        "ado_create_pr",
        {
            "source_branch": source_branch,
            "target_branch": payload.get("targetBranch")
            or profile.azure_devops.default_target_branch,
            "title": title,
            "description": description,
            "draft": bool(payload.get("draft", False)),
        },
    )
    handle.step(
        "create_pr",
        "ok",
        f"PR #{pr.get('pull_request_id')} ({pr.get('url')})",
    )

    if work_item:
        try:
            link = await executor.call(
                "ado_link_work_item",
                {
                    "pull_request_id": int(pr.get("pull_request_id") or 0),
                    "work_item_id": int(work_item),
                },
            )
            handle.step(
                "link_work_item",
                "ok" if link.get("ok") else "warn",
                f"work_item={work_item}, ok={link.get('ok')}",
            )
        except Exception as exc:
            handle.step("link_work_item", "warn", str(exc))

    return pr
