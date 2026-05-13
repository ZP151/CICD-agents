"""Azure DevOps tool.

Implements the small REST surface we need:
- create_pull_request
- link_work_item_to_pull_request
- trigger_pipeline_run

PAT is read from the OS keyring under service `cicd-agent`, user
`azure-devops-pat`. The PAT is *never* written to logs, the SQLite memory
store, or task results.
"""

from __future__ import annotations

import base64
import logging
from typing import Any

import httpx

from runtime.config.settings import get_settings
from runtime.core.tool_executor import Tool, ToolContext, ToolError

log = logging.getLogger(__name__)

PAT_KEYRING_SERVICE = "cicd-agent"
PAT_KEYRING_USER = "azure-devops-pat"

API_VERSION_GIT = "7.1-preview.1"
API_VERSION_WI = "7.1-preview.3"
API_VERSION_PIPELINES = "7.1-preview.1"


def _get_pat() -> str:
    try:
        import keyring

        pat = keyring.get_password(PAT_KEYRING_SERVICE, PAT_KEYRING_USER)
    except Exception as exc:
        raise ToolError(f"could not read PAT from keyring: {exc}") from exc
    if not pat:
        raise ToolError(
            "Azure DevOps PAT not configured. Run `dev-agent configure-pat`."
        )
    return pat


def _auth_header(pat: str) -> dict[str, str]:
    token = base64.b64encode(f":{pat}".encode()).decode("ascii")
    return {"Authorization": f"Basic {token}"}


def _ado_base(org: str) -> str:
    return f"https://dev.azure.com/{org}"


def _resolve_org_project(ctx: ToolContext, payload: dict[str, Any]) -> tuple[str, str]:
    settings = get_settings()
    org = (
        str(payload.get("organization") or "")
        or ctx.extra.get("ado_org", "")
        or settings.azure_devops_org
    )
    project = (
        str(payload.get("project") or "")
        or ctx.extra.get("ado_project", "")
        or settings.azure_devops_project
    )
    if not org or not project:
        raise ToolError(
            "Azure DevOps org/project missing. Set AZURE_DEVOPS_ORG and "
            "AZURE_DEVOPS_PROJECT, or pass them in the payload."
        )
    return org, project


async def create_pull_request(ctx: ToolContext, payload: dict[str, Any]) -> dict[str, Any]:
    org, project = _resolve_org_project(ctx, payload)
    repository = str(payload.get("repository") or ctx.extra.get("ado_repository") or "")
    if not repository:
        raise ToolError("create_pull_request requires 'repository'.")
    source = str(payload.get("source_branch") or "")
    target = str(payload.get("target_branch") or "main")
    title = str(payload.get("title") or "")
    description = str(payload.get("description") or "")
    draft = bool(payload.get("draft", False))
    if not source or not title:
        raise ToolError("create_pull_request requires 'source_branch' and 'title'.")

    pat = _get_pat()
    url = (
        f"{_ado_base(org)}/{project}/_apis/git/repositories/{repository}/pullrequests"
        f"?api-version={API_VERSION_GIT}"
    )
    body = {
        "sourceRefName": f"refs/heads/{source}",
        "targetRefName": f"refs/heads/{target}",
        "title": title,
        "description": description,
        "isDraft": draft,
    }
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        **_auth_header(pat),
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(url, json=body, headers=headers)
    if r.status_code >= 300:
        raise ToolError(f"ADO create_pull_request failed: HTTP {r.status_code}: {r.text[:400]}")
    data = r.json()
    pr_id = int(data.get("pullRequestId") or 0)
    pr_url = (
        f"{_ado_base(org)}/{project}/_git/{repository}/pullrequest/{pr_id}"
        if pr_id
        else ""
    )
    return {
        "pull_request_id": pr_id,
        "url": pr_url,
        "status": data.get("status", ""),
        "created_by": (data.get("createdBy") or {}).get("displayName", ""),
    }


async def link_work_item(ctx: ToolContext, payload: dict[str, Any]) -> dict[str, Any]:
    org, project = _resolve_org_project(ctx, payload)
    repository = str(payload.get("repository") or ctx.extra.get("ado_repository") or "")
    pr_id = int(payload.get("pull_request_id") or 0)
    work_item_id = int(payload.get("work_item_id") or 0)
    if not (repository and pr_id and work_item_id):
        raise ToolError(
            "link_work_item requires 'repository', 'pull_request_id', 'work_item_id'."
        )

    pat = _get_pat()
    artifact_id = (
        f"vstfs:///Git/PullRequestId/{project}%2F{repository}%2F{pr_id}"
    )
    url = (
        f"{_ado_base(org)}/{project}/_apis/wit/workitems/{work_item_id}"
        f"?api-version={API_VERSION_WI}"
    )
    body = [
        {
            "op": "add",
            "path": "/relations/-",
            "value": {
                "rel": "ArtifactLink",
                "url": artifact_id,
                "attributes": {"name": "Pull Request"},
            },
        }
    ]
    headers = {
        "Content-Type": "application/json-patch+json",
        "Accept": "application/json",
        **_auth_header(pat),
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.patch(url, json=body, headers=headers)
    if r.status_code >= 300:
        return {
            "ok": False,
            "status_code": r.status_code,
            "error": r.text[:400],
        }
    return {"ok": True, "work_item_id": work_item_id, "pull_request_id": pr_id}


async def trigger_pipeline_run(ctx: ToolContext, payload: dict[str, Any]) -> dict[str, Any]:
    org, project = _resolve_org_project(ctx, payload)
    pipeline_id = int(payload.get("pipeline_id") or 0)
    branch = str(payload.get("branch") or "")
    if not pipeline_id:
        raise ToolError("trigger_pipeline_run requires 'pipeline_id'.")

    pat = _get_pat()
    url = (
        f"{_ado_base(org)}/{project}/_apis/pipelines/{pipeline_id}/runs"
        f"?api-version={API_VERSION_PIPELINES}"
    )
    body: dict[str, Any] = {}
    if branch:
        body["resources"] = {"repositories": {"self": {"refName": f"refs/heads/{branch}"}}}
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        **_auth_header(pat),
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(url, json=body, headers=headers)
    if r.status_code >= 300:
        raise ToolError(
            f"ADO trigger_pipeline_run failed: HTTP {r.status_code}: {r.text[:400]}"
        )
    data = r.json()
    return {
        "run_id": data.get("id"),
        "state": data.get("state"),
        "name": data.get("name"),
        "url": (data.get("_links") or {}).get("web", {}).get("href", ""),
    }


def tools() -> list[Tool]:
    return [
        Tool(
            name="ado_create_pr",
            description="Create an Azure DevOps pull request.",
            parameters={
                "type": "object",
                "required": ["source_branch", "title"],
                "properties": {
                    "organization": {"type": "string"},
                    "project": {"type": "string"},
                    "repository": {"type": "string"},
                    "source_branch": {"type": "string"},
                    "target_branch": {"type": "string", "default": "main"},
                    "title": {"type": "string"},
                    "description": {"type": "string"},
                    "draft": {"type": "boolean", "default": False},
                },
            },
            handler=create_pull_request,
        ),
        Tool(
            name="ado_link_work_item",
            description="Attach a work item to a pull request via ArtifactLink.",
            parameters={
                "type": "object",
                "required": ["pull_request_id", "work_item_id"],
                "properties": {
                    "organization": {"type": "string"},
                    "project": {"type": "string"},
                    "repository": {"type": "string"},
                    "pull_request_id": {"type": "integer"},
                    "work_item_id": {"type": "integer"},
                },
            },
            handler=link_work_item,
        ),
        Tool(
            name="ado_trigger_pipeline",
            description="Queue a run of an Azure DevOps pipeline.",
            parameters={
                "type": "object",
                "required": ["pipeline_id"],
                "properties": {
                    "organization": {"type": "string"},
                    "project": {"type": "string"},
                    "pipeline_id": {"type": "integer"},
                    "branch": {"type": "string"},
                },
            },
            handler=trigger_pipeline_run,
        ),
    ]
