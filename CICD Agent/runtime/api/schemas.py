"""Pydantic models for the runtime HTTP API."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

TaskStatus = Literal["queued", "running", "succeeded", "failed", "cancelled"]
StepStatus = Literal["info", "ok", "warn", "error"]


class SubmitPipelineRequest(BaseModel):
    repo_path: str = Field(..., alias="repoPath")
    profile: str = "default"
    target_branch: str | None = Field(default=None, alias="targetBranch")
    work_item: str | int | None = Field(default=None, alias="workItem")
    title: str | None = None
    draft: bool = False
    auto_create_pr: bool = Field(default=True, alias="autoCreatePr")
    trigger_pipeline: bool = Field(default=False, alias="triggerPipeline")

    model_config = {"populate_by_name": True}


class TaskCreatedResponse(BaseModel):
    task_id: str = Field(..., alias="taskId")
    status: TaskStatus

    model_config = {"populate_by_name": True}


class TaskStep(BaseModel):
    seq: int
    name: str
    detail: str = ""
    status: StepStatus
    created_at: int = Field(..., alias="createdAt")

    model_config = {"populate_by_name": True}


class TaskView(BaseModel):
    id: str
    kind: str
    status: TaskStatus
    payload: dict[str, Any]
    result: dict[str, Any] = Field(default_factory=dict)
    error: str = ""
    created_at: int = Field(..., alias="createdAt")
    started_at: int | None = Field(default=None, alias="startedAt")
    finished_at: int | None = Field(default=None, alias="finishedAt")
    steps: list[TaskStep] = Field(default_factory=list)

    model_config = {"populate_by_name": True}


class HealthResponse(BaseModel):
    ok: bool
    version: str
    uptime_sec: float = Field(..., alias="uptimeSec")
    llm_configured: bool = Field(..., alias="llmConfigured")

    model_config = {"populate_by_name": True}
