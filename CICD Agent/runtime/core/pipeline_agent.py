"""Pipeline Agent entrypoint used by the task queue runner.

The real work is delegated to the planner; this module wires together the
profile, indexer, context builder, tool executor and planner.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from runtime.config.profiles import get_profile
from runtime.core.task_queue import TaskHandle

log = logging.getLogger(__name__)


async def run_pipeline_task(handle: TaskHandle) -> dict[str, Any]:
    """Execute a single submit-pipeline task end-to-end.

    The body lives in `_execute`; this wrapper exists so the task queue can
    swap in alternative runners without changing import paths.
    """
    return await _execute(handle)


async def _execute(handle: TaskHandle) -> dict[str, Any]:
    payload = handle.payload
    repo_path = Path(payload["repoPath"]).expanduser().resolve()
    profile_name = payload.get("profile") or "default"
    handle.step("load_profile", "info", f"profile={profile_name}")
    profile = get_profile(profile_name)

    if not repo_path.exists() or not repo_path.is_dir():
        raise FileNotFoundError(f"repoPath does not exist: {repo_path}")

    # The full agent loop is wired in pipeline_agent_impl to keep this module
    # importable even when optional dependencies (tree-sitter, openai) are
    # missing during unit tests.
    from runtime.core.pipeline_agent_impl import run

    return await run(handle=handle, repo_path=repo_path, profile=profile, payload=payload)
