"""Persistent asyncio task queue.

Tasks are stored in a dedicated SQLite DB at `<data_dir>/tasks.db`. A single
asyncio worker drains the queue; new tasks are enqueued through `submit()`.

The actual work is delegated to a `runner` callable injected at construction
time so we keep this module agnostic of the Pipeline Agent specifics.
"""

from __future__ import annotations

import asyncio
import json
import logging
import sqlite3
import time
import uuid
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

from runtime.api.schemas import StepStatus, TaskStatus, TaskStep, TaskView
from runtime.config.settings import get_settings

log = logging.getLogger(__name__)

TASKS_SCHEMA = """
CREATE TABLE IF NOT EXISTS tasks (
    id            TEXT PRIMARY KEY,
    kind          TEXT NOT NULL,
    status        TEXT NOT NULL,
    payload_json  TEXT NOT NULL,
    result_json   TEXT NOT NULL DEFAULT '',
    error         TEXT NOT NULL DEFAULT '',
    created_at    INTEGER NOT NULL,
    started_at    INTEGER,
    finished_at   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

CREATE TABLE IF NOT EXISTS task_steps (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    seq         INTEGER NOT NULL,
    name        TEXT NOT NULL,
    detail      TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL,
    created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_steps_task ON task_steps(task_id, seq);
"""


def _now() -> int:
    return int(time.time())


class TaskQueue:
    """Persistent FIFO queue with a single background worker."""

    def __init__(self, runner: Callable[[TaskHandle], Awaitable[dict[str, Any]]]):
        self._runner = runner
        settings = get_settings()
        self._db_path: Path = settings.data_dir / "tasks.db"
        self._conn = sqlite3.connect(
            self._db_path, check_same_thread=False, isolation_level=None
        )
        self._conn.row_factory = sqlite3.Row
        self._conn.executescript(TASKS_SCHEMA)
        self._lock = asyncio.Lock()
        self._wake = asyncio.Event()
        self._worker: asyncio.Task[None] | None = None
        self._stopped = False

    async def start(self) -> None:
        # Re-queue any tasks that were running at shutdown so they get retried
        # rather than left in a half-run state.
        self._conn.execute(
            "UPDATE tasks SET status='queued', started_at=NULL "
            "WHERE status='running'"
        )
        self._wake.set()
        self._worker = asyncio.create_task(self._loop(), name="task-queue-worker")

    async def stop(self) -> None:
        self._stopped = True
        self._wake.set()
        if self._worker:
            self._worker.cancel()
            try:
                await self._worker
            except (asyncio.CancelledError, Exception):
                pass

    async def submit(self, kind: str, payload: dict[str, Any]) -> str:
        task_id = f"task_{time.strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
        self._conn.execute(
            "INSERT INTO tasks(id, kind, status, payload_json, created_at) "
            "VALUES (?, ?, 'queued', ?, ?)",
            (task_id, kind, json.dumps(payload), _now()),
        )
        self._wake.set()
        return task_id

    def get(self, task_id: str) -> TaskView | None:
        row = self._conn.execute(
            "SELECT * FROM tasks WHERE id = ?", (task_id,)
        ).fetchone()
        if not row:
            return None
        step_rows = self._conn.execute(
            "SELECT seq, name, detail, status, created_at "
            "FROM task_steps WHERE task_id = ? ORDER BY seq ASC",
            (task_id,),
        ).fetchall()
        return TaskView(
            id=row["id"],
            kind=row["kind"],
            status=row["status"],
            payload=json.loads(row["payload_json"]) if row["payload_json"] else {},
            result=json.loads(row["result_json"]) if row["result_json"] else {},
            error=row["error"] or "",
            createdAt=row["created_at"],
            startedAt=row["started_at"],
            finishedAt=row["finished_at"],
            steps=[
                TaskStep(
                    seq=s["seq"],
                    name=s["name"],
                    detail=s["detail"],
                    status=s["status"],
                    createdAt=s["created_at"],
                )
                for s in step_rows
            ],
        )

    def add_step(self, task_id: str, name: str, status: StepStatus, detail: str = "") -> None:
        seq_row = self._conn.execute(
            "SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM task_steps WHERE task_id = ?",
            (task_id,),
        ).fetchone()
        seq = int(seq_row["next"] if seq_row else 1)
        self._conn.execute(
            "INSERT INTO task_steps(task_id, seq, name, detail, status, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (task_id, seq, name, detail, status, _now()),
        )

    def _set_status(
        self,
        task_id: str,
        status: TaskStatus,
        *,
        error: str | None = None,
        result: dict[str, Any] | None = None,
        started: bool = False,
        finished: bool = False,
    ) -> None:
        fields = ["status = ?"]
        values: list[Any] = [status]
        if error is not None:
            fields.append("error = ?")
            values.append(error)
        if result is not None:
            fields.append("result_json = ?")
            values.append(json.dumps(result))
        if started:
            fields.append("started_at = ?")
            values.append(_now())
        if finished:
            fields.append("finished_at = ?")
            values.append(_now())
        values.append(task_id)
        self._conn.execute(
            f"UPDATE tasks SET {', '.join(fields)} WHERE id = ?", values
        )

    async def _next_queued(self) -> str | None:
        async with self._lock:
            row = self._conn.execute(
                "SELECT id FROM tasks WHERE status = 'queued' "
                "ORDER BY created_at ASC LIMIT 1"
            ).fetchone()
            if not row:
                return None
            self._set_status(row["id"], "running", started=True)
            return str(row["id"])

    async def _loop(self) -> None:
        while not self._stopped:
            task_id = await self._next_queued()
            if not task_id:
                self._wake.clear()
                try:
                    await asyncio.wait_for(self._wake.wait(), timeout=5.0)
                except asyncio.TimeoutError:
                    pass
                continue

            handle = TaskHandle(self, task_id)
            try:
                result = await self._runner(handle)
                self._set_status(task_id, "succeeded", result=result, finished=True)
            except asyncio.CancelledError:
                self._set_status(
                    task_id, "cancelled", error="cancelled", finished=True
                )
                raise
            except Exception as exc:
                log.exception("task %s failed", task_id)
                self._set_status(task_id, "failed", error=str(exc), finished=True)


class TaskHandle:
    """Handle passed to runners so they can log steps."""

    def __init__(self, queue: TaskQueue, task_id: str):
        self._queue = queue
        self.task_id = task_id

    def step(self, name: str, status: StepStatus = "info", detail: str = "") -> None:
        self._queue.add_step(self.task_id, name, status, detail)

    @property
    def payload(self) -> dict[str, Any]:
        view = self._queue.get(self.task_id)
        return view.payload if view else {}
