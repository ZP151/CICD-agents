"""HTTP client + auto-start helper for the Local Agent Runtime."""

from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

# Project root is two levels up from this file (cli/runtime_client.py -> project root).
# The runtime must always start from here so it can find .env.
_AGENT_ROOT = Path(__file__).resolve().parent.parent

import httpx

from runtime.config.settings import get_settings


class RuntimeUnavailableError(RuntimeError):
    pass


def _is_running(url: str, timeout: float = 1.0) -> bool:
    try:
        r = httpx.get(f"{url}/healthz", timeout=timeout)
        return r.status_code == 200 and bool(r.json().get("ok"))
    except Exception:
        return False


def _spawn_runtime(log_path: Path) -> int:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    creationflags = 0
    start_new_session = False
    if sys.platform.startswith("win"):
        # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP keeps the runtime alive
        # after the CLI exits.
        creationflags = 0x00000008 | 0x00000200
    else:
        start_new_session = True

    log_file = open(log_path, "ab", buffering=0)  # noqa: SIM115 - intentionally leaked
    proc = subprocess.Popen(
        [sys.executable, "-m", "runtime"],
        stdout=log_file,
        stderr=log_file,
        stdin=subprocess.DEVNULL,
        cwd=str(_AGENT_ROOT),
        env={**os.environ},
        close_fds=True,
        creationflags=creationflags,
        start_new_session=start_new_session,
    )
    return proc.pid


def ensure_running(timeout: float = 20.0) -> str:
    """Make sure a runtime is running; return its base URL."""
    settings = get_settings()
    url = settings.runtime_url
    if _is_running(url):
        return url

    log_path = settings.data_dir / "logs" / "runtime.log"
    _spawn_runtime(log_path)

    deadline = time.time() + timeout
    while time.time() < deadline:
        if _is_running(url):
            return url
        time.sleep(0.4)
    raise RuntimeUnavailableError(
        f"runtime did not become healthy within {timeout:.0f}s. "
        f"See log: {log_path}"
    )


class RuntimeClient:
    def __init__(self, base_url: str | None = None):
        self.base_url = base_url or get_settings().runtime_url

    def submit_pipeline(self, payload: dict[str, Any]) -> dict[str, Any]:
        r = httpx.post(
            f"{self.base_url}/tasks/submit-pipeline",
            json=payload,
            timeout=15.0,
        )
        r.raise_for_status()
        return r.json()

    def get_task(self, task_id: str) -> dict[str, Any]:
        r = httpx.get(f"{self.base_url}/tasks/{task_id}", timeout=15.0)
        r.raise_for_status()
        return r.json()

    def shutdown(self) -> dict[str, Any]:
        r = httpx.post(f"{self.base_url}/shutdown", timeout=5.0)
        r.raise_for_status()
        return r.json()

    def healthz(self) -> dict[str, Any]:
        r = httpx.get(f"{self.base_url}/healthz", timeout=3.0)
        r.raise_for_status()
        return r.json()
