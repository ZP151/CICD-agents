"""End-to-end test of the Pipeline Agent in offline mode (no LLM).

We exercise: index -> diff -> context -> planner (offline) -> build/test
skip (default profile has empty commands) -> PR creation skip (no ADO repo).
"""

from __future__ import annotations

from pathlib import Path

import pytest

from runtime.config.profiles import get_profile
from runtime.core import pipeline_agent_impl


class _FakeHandle:
    def __init__(self):
        self.steps: list[tuple[str, str, str]] = []
        self.task_id = "task_test_offline"

    def step(self, name: str, status: str = "info", detail: str = "") -> None:
        self.steps.append((name, status, detail))

    @property
    def payload(self):
        return {}


@pytest.mark.asyncio
async def test_offline_pipeline_agent_against_fixture(fixture_repo: Path, monkeypatch):
    # Make absolutely sure no LLM is configured.
    monkeypatch.setenv("AZURE_OPENAI_ENDPOINT", "")
    monkeypatch.setenv("AZURE_OPENAI_API_KEY", "")
    from runtime.config import settings as settings_mod

    settings_mod.get_settings.cache_clear()

    handle = _FakeHandle()
    profile = get_profile("default")
    payload = {
        "repoPath": str(fixture_repo),
        "profile": "default",
        "targetBranch": "main",
        "autoCreatePr": False,
        "triggerPipeline": False,
    }

    result = await pipeline_agent_impl.run(
        handle=handle,
        repo_path=fixture_repo,
        profile=profile,
        payload=payload,
    )

    step_names = [name for name, _, _ in handle.steps]
    assert "index_repo" in step_names
    assert "compute_diff" in step_names
    assert "build_context" in step_names
    assert "plan" in step_names

    plan = result["plan"]
    assert plan["used_llm"] is False
    assert "What" in plan["summary"]
    assert plan["risk_level"] in {"low", "medium", "high"}

    # Diff against main from the feature branch should detect changes to app.py.
    changed = {cf["path"] for cf in result["changed_files"]}
    assert "app.py" in changed
