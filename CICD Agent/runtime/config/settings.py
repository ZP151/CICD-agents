"""Environment-driven settings for the Local Agent Runtime.

Uses pydantic-settings so values come from environment variables and an optional
.env file at the workspace root. No secrets are persisted to SQLite.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def _default_data_dir() -> Path:
    return Path.home() / ".cicd-agent"


class Settings(BaseSettings):
    """Runtime configuration loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    azure_openai_endpoint: str = Field(default="", alias="AZURE_OPENAI_ENDPOINT")
    azure_openai_api_version: str = Field(
        default="2024-08-01-preview", alias="AZURE_OPENAI_API_VERSION"
    )
    azure_openai_api_key: str = Field(default="", alias="AZURE_OPENAI_API_KEY")
    azure_openai_chat_deployment: str = Field(
        default="gpt-4o", alias="AZURE_OPENAI_CHAT_DEPLOYMENT"
    )
    azure_openai_embedding_deployment: str = Field(
        default="text-embedding-3-small", alias="AZURE_OPENAI_EMBEDDING_DEPLOYMENT"
    )

    azure_devops_org: str = Field(default="", alias="AZURE_DEVOPS_ORG")
    azure_devops_project: str = Field(default="", alias="AZURE_DEVOPS_PROJECT")

    runtime_host: str = Field(default="127.0.0.1", alias="RUNTIME_HOST")
    runtime_port: int = Field(default=8787, alias="RUNTIME_PORT")
    runtime_idle_timeout_sec: int = Field(default=1800, alias="RUNTIME_IDLE_TIMEOUT_SEC")
    runtime_data_dir: str = Field(default="", alias="RUNTIME_DATA_DIR")
    runtime_log_level: str = Field(default="INFO", alias="RUNTIME_LOG_LEVEL")

    planner_max_steps: int = Field(default=12, alias="PLANNER_MAX_STEPS")
    planner_token_budget: int = Field(default=12000, alias="PLANNER_TOKEN_BUDGET")

    index_max_file_bytes: int = Field(default=512 * 1024, alias="INDEX_MAX_FILE_BYTES")
    index_embed_batch: int = Field(default=64, alias="INDEX_EMBED_BATCH")

    @property
    def data_dir(self) -> Path:
        base = Path(self.runtime_data_dir) if self.runtime_data_dir else _default_data_dir()
        base.mkdir(parents=True, exist_ok=True)
        return base

    @property
    def runtime_url(self) -> str:
        return f"http://{self.runtime_host}:{self.runtime_port}"

    @property
    def llm_configured(self) -> bool:
        return bool(self.azure_openai_endpoint and self.azure_openai_api_key)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Cached settings accessor."""
    return Settings()
