"""Shared pytest fixtures.

We isolate the runtime data dir per test so tests never touch the user's real
`~/.cicd-agent`.
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

import pytest


@pytest.fixture(autouse=True)
def _isolated_data_dir(tmp_path, monkeypatch):
    """Force RUNTIME_DATA_DIR into a tmp_path so DBs are sandboxed."""
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    monkeypatch.setenv("RUNTIME_DATA_DIR", str(data_dir))
    # Reset cached settings/profiles so the env var is picked up.
    from runtime.config import settings as settings_mod

    settings_mod.get_settings.cache_clear()
    yield


@pytest.fixture
def fixture_repo(tmp_path) -> Path:
    """Create a tiny git repo with two commits."""
    repo = tmp_path / "demo-repo"
    repo.mkdir()
    _git(repo, "init", "-q", "-b", "main")
    _git(repo, "config", "user.email", "test@example.com")
    _git(repo, "config", "user.name", "Test")

    (repo / "app.py").write_text(
        "def add(a, b):\n"
        "    return a + b\n"
        "\n"
        "class Calculator:\n"
        "    def square(self, x):\n"
        "        return x * x\n",
        encoding="utf-8",
    )
    (repo / "test_app.py").write_text(
        "from app import add, Calculator\n"
        "\n"
        "def test_add():\n"
        "    assert add(2, 3) == 5\n"
        "\n"
        "def test_square():\n"
        "    assert Calculator().square(4) == 16\n",
        encoding="utf-8",
    )
    (repo / "README.md").write_text("# demo repo\n", encoding="utf-8")
    (repo / "pyproject.toml").write_text(
        "[project]\nname = 'demo'\nversion = '0'\n",
        encoding="utf-8",
    )

    _git(repo, "add", "-A")
    _git(repo, "commit", "-q", "-m", "initial commit")

    _git(repo, "checkout", "-q", "-b", "feature/multiply")
    (repo / "app.py").write_text(
        "def add(a, b):\n"
        "    return a + b\n"
        "\n"
        "def multiply(a, b):\n"
        "    return a * b\n"
        "\n"
        "class Calculator:\n"
        "    def square(self, x):\n"
        "        return x * x\n"
        "\n"
        "    def cube(self, x):\n"
        "        return x * x * x\n",
        encoding="utf-8",
    )
    _git(repo, "add", "-A")
    _git(repo, "commit", "-q", "-m", "add multiply + cube")
    return repo


def _git(repo: Path, *args: str) -> None:
    subprocess.run(
        ["git", *args],
        cwd=repo,
        check=True,
        env={**os.environ, "GIT_TERMINAL_PROMPT": "0"},
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
