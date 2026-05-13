"""FastAPI app exposing the runtime API."""

from __future__ import annotations

import logging
import os
import signal
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, status
from fastapi.responses import JSONResponse

from runtime import __version__
from runtime.api.schemas import (
    HealthResponse,
    SubmitPipelineRequest,
    TaskCreatedResponse,
    TaskView,
)
from runtime.config.settings import get_settings
from runtime.core.task_queue import TaskQueue

log = logging.getLogger(__name__)


def _build_queue() -> TaskQueue:
    # Local import keeps a clean dependency direction: api -> core -> pipeline_agent.
    from runtime.core.pipeline_agent import run_pipeline_task

    return TaskQueue(runner=run_pipeline_task)


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    logging.basicConfig(
        level=getattr(logging, settings.runtime_log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s - %(message)s",
    )
    queue = _build_queue()
    await queue.start()
    app.state.queue = queue
    app.state.started_at = time.time()
    try:
        yield
    finally:
        await queue.stop()


app = FastAPI(title="cicd-agent runtime", version=__version__, lifespan=_lifespan)


@app.get("/healthz", response_model=HealthResponse)
async def healthz() -> HealthResponse:
    settings = get_settings()
    return HealthResponse(
        ok=True,
        version=__version__,
        uptimeSec=time.time() - app.state.started_at,
        llmConfigured=settings.llm_configured,
    )


@app.post(
    "/tasks/submit-pipeline",
    response_model=TaskCreatedResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def submit_pipeline(req: SubmitPipelineRequest) -> TaskCreatedResponse:
    queue: TaskQueue = app.state.queue
    task_id = await queue.submit("submit-pipeline", req.model_dump(by_alias=True))
    return TaskCreatedResponse(taskId=task_id, status="queued")


@app.get("/tasks/{task_id}", response_model=TaskView)
async def get_task(task_id: str) -> TaskView:
    queue: TaskQueue = app.state.queue
    view = queue.get(task_id)
    if view is None:
        raise HTTPException(status_code=404, detail="task not found")
    return view


@app.post("/shutdown")
async def shutdown() -> JSONResponse:
    # Schedule the signal slightly after returning the response so the HTTP
    # client gets a clean acknowledgement.
    pid = os.getpid()

    def _kill() -> None:
        try:
            os.kill(pid, signal.SIGTERM)
        except Exception:
            log.exception("failed to deliver SIGTERM during /shutdown")

    import threading

    threading.Timer(0.25, _kill).start()
    return JSONResponse({"ok": True, "message": "shutting down"})
