"""Typer CLI entrypoint.

Acts as a thin entrance over the Local Agent Runtime. Use `dev-agent --help`
once installed, or `python -m cli.main --help` during development.
"""

from __future__ import annotations

import getpass
import os
import sys
import time
from pathlib import Path

import typer
from rich.console import Console
from rich.json import JSON
from rich.table import Table

from cli.runtime_client import RuntimeClient, RuntimeUnavailableError, ensure_running
from runtime.config.settings import get_settings

app = typer.Typer(
    no_args_is_help=True,
    add_completion=False,
    help="Local Agent Runtime for CI/CD (entrance only).",
)
console = Console()

PAT_KEYRING_SERVICE = "cicd-agent"
PAT_KEYRING_USER = "azure-devops-pat"


def _client() -> RuntimeClient:
    url = ensure_running()
    return RuntimeClient(url)


@app.command()
def healthz() -> None:
    """Print runtime health (auto-starts the runtime)."""
    try:
        data = _client().healthz()
    except RuntimeUnavailableError as e:
        console.print(f"[red]Runtime unavailable:[/] {e}")
        raise typer.Exit(code=2) from e
    console.print(JSON.from_data(data))


@app.command("submit-pipeline")
def submit_pipeline(
    repo_path: Path = typer.Option(
        Path.cwd(), "--repo", "-r", help="Path to the local git repo.",
        exists=True, file_okay=False, dir_okay=True, resolve_path=True,
    ),
    profile: str = typer.Option("default", "--profile", "-p"),
    target_branch: str | None = typer.Option(None, "--target-branch", "-t"),
    work_item: str | None = typer.Option(None, "--work-item", "-w"),
    title: str | None = typer.Option(None, "--title"),
    draft: bool = typer.Option(False, "--draft", help="Create the PR as draft."),
    no_pr: bool = typer.Option(False, "--no-pr", help="Skip PR creation."),
    trigger_pipeline: bool = typer.Option(
        False, "--trigger-pipeline", help="Queue the ADO pipeline after PR creation."
    ),
    wait: bool = typer.Option(True, "--wait/--no-wait", help="Stream progress until done."),
) -> None:
    """Submit a pipeline task and (by default) wait for completion."""
    payload = {
        "repoPath": str(repo_path),
        "profile": profile,
        "targetBranch": target_branch,
        "workItem": work_item,
        "title": title,
        "draft": draft,
        "autoCreatePr": not no_pr,
        "triggerPipeline": trigger_pipeline,
    }
    try:
        client = _client()
        resp = client.submit_pipeline(payload)
    except RuntimeUnavailableError as e:
        console.print(f"[red]Runtime unavailable:[/] {e}")
        raise typer.Exit(code=2) from e
    task_id = resp["taskId"]
    console.print(f"submitted [bold]{task_id}[/] (status={resp['status']})")
    if not wait:
        return
    _stream_task(client, task_id)


@app.command()
def status(task_id: str) -> None:
    """Show task status as JSON."""
    client = _client()
    view = client.get_task(task_id)
    console.print(JSON.from_data(view))


@app.command()
def logs(task_id: str, tail: bool = typer.Option(False, "--tail", "-f")) -> None:
    """Print task steps. With --tail, follow until terminal status."""
    client = _client()
    if tail:
        _stream_task(client, task_id)
        return
    view = client.get_task(task_id)
    _render_steps(view)


@app.command()
def stop() -> None:
    """Ask the runtime to shut down."""
    settings = get_settings()
    try:
        client = RuntimeClient(settings.runtime_url)
        client.shutdown()
        console.print("[green]runtime shutdown requested.[/]")
    except Exception as e:
        console.print(f"[yellow]could not reach runtime: {e}[/]")


@app.command("configure-pat")
def configure_pat() -> None:
    """Store the Azure DevOps PAT in the OS keyring."""
    import keyring  # local import to keep CLI startup snappy

    pat = getpass.getpass("Azure DevOps PAT: ")
    if not pat.strip():
        console.print("[red]empty PAT, aborted.[/]")
        raise typer.Exit(code=1)
    keyring.set_password(PAT_KEYRING_SERVICE, PAT_KEYRING_USER, pat.strip())
    console.print(
        f"[green]stored PAT in OS keyring under service '{PAT_KEYRING_SERVICE}'.[/]"
    )


def _render_steps(view: dict) -> None:
    table = Table(title=f"task {view['id']} ({view['status']})", show_lines=False)
    table.add_column("seq", justify="right")
    table.add_column("name")
    table.add_column("status")
    table.add_column("detail", overflow="fold")
    for s in view.get("steps", []):
        color = {"ok": "green", "warn": "yellow", "error": "red"}.get(s["status"], "white")
        table.add_row(str(s["seq"]), s["name"], f"[{color}]{s['status']}[/]", s.get("detail", ""))
    console.print(table)
    if view.get("error"):
        console.print(f"[red]error:[/] {view['error']}")
    if view.get("result"):
        console.print("[bold]result:[/]")
        console.print(JSON.from_data(view["result"]))


def _stream_task(client: RuntimeClient, task_id: str) -> None:
    last_seq = 0
    terminal = {"succeeded", "failed", "cancelled"}
    while True:
        view = client.get_task(task_id)
        steps = view.get("steps", [])
        new_steps = [s for s in steps if s["seq"] > last_seq]
        for s in new_steps:
            color = {"ok": "green", "warn": "yellow", "error": "red"}.get(
                s["status"], "white"
            )
            detail = f" - {s['detail']}" if s.get("detail") else ""
            console.print(f"  [{color}]{s['status']:>5}[/] {s['name']}{detail}")
            last_seq = s["seq"]
        if view["status"] in terminal:
            _render_final(view)
            if view["status"] != "succeeded":
                sys.exit(1)
            return
        time.sleep(1.0)


def _render_final(view: dict) -> None:
    color = {"succeeded": "green", "failed": "red", "cancelled": "yellow"}.get(
        view["status"], "white"
    )
    console.print(f"[{color}]task {view['status']}[/]")
    if view.get("error"):
        console.print(f"[red]error:[/] {view['error']}")
    if view.get("result"):
        console.print(JSON.from_data(view["result"]))


def main() -> None:
    app()


if __name__ == "__main__":
    # Allow `python -m cli.main`
    os.environ.setdefault("PYTHONUTF8", "1")
    main()
