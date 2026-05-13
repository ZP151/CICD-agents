"""Profile loader.

Profiles live in `runtime/config/profiles.yaml` by default, but the user can
override with an env var `CICD_AGENT_PROFILES_PATH` to point at a per-machine
or per-repo file (e.g. `<repo>/.cicd-agent/profiles.yaml`).
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

DEFAULT_PROFILES_PATH = Path(__file__).with_name("profiles.yaml")


@dataclass(frozen=True)
class BuildSpec:
    command: str = ""


@dataclass(frozen=True)
class TestSpec:
    command: str = ""


@dataclass(frozen=True)
class AzureDevOpsSpec:
    organization: str = ""
    project: str = ""
    repository: str = ""
    default_target_branch: str = "main"
    pipeline_id: int | None = None


@dataclass(frozen=True)
class Profile:
    name: str
    description: str = ""
    languages: tuple[str, ...] = ()
    build: BuildSpec = field(default_factory=BuildSpec)
    test: TestSpec = field(default_factory=TestSpec)
    azure_devops: AzureDevOpsSpec = field(default_factory=AzureDevOpsSpec)
    ignored_globs: tuple[str, ...] = ()


def _resolve_path() -> Path:
    override = os.environ.get("CICD_AGENT_PROFILES_PATH")
    if override:
        p = Path(override)
        if p.exists():
            return p
    return DEFAULT_PROFILES_PATH


def _coerce_profile(name: str, raw: dict[str, Any]) -> Profile:
    build_raw = raw.get("build") or {}
    test_raw = raw.get("test") or {}
    ado_raw = raw.get("azure_devops") or {}
    return Profile(
        name=name,
        description=str(raw.get("description", "")),
        languages=tuple(raw.get("languages") or ()),
        build=BuildSpec(command=str(build_raw.get("command", ""))),
        test=TestSpec(command=str(test_raw.get("command", ""))),
        azure_devops=AzureDevOpsSpec(
            organization=str(ado_raw.get("organization", "")),
            project=str(ado_raw.get("project", "")),
            repository=str(ado_raw.get("repository", "")),
            default_target_branch=str(ado_raw.get("default_target_branch", "main")),
            pipeline_id=ado_raw.get("pipeline_id"),
        ),
        ignored_globs=tuple(raw.get("ignored_globs") or ()),
    )


def load_profiles(path: Path | None = None) -> dict[str, Profile]:
    """Load all profiles from YAML. Returns dict keyed by profile name."""
    target = path or _resolve_path()
    if not target.exists():
        return {"default": Profile(name="default")}
    with target.open("r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    profiles_raw = data.get("profiles") or {}
    return {name: _coerce_profile(name, raw or {}) for name, raw in profiles_raw.items()}


def get_profile(name: str, path: Path | None = None) -> Profile:
    """Return a single profile by name, falling back to `default`."""
    profiles = load_profiles(path)
    if name in profiles:
        return profiles[name]
    if "default" in profiles:
        return profiles["default"]
    return Profile(name=name)
