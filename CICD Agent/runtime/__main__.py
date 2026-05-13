"""uvicorn entrypoint.

Run with: `python -m runtime`
"""

from __future__ import annotations

import uvicorn

from runtime.config.settings import get_settings


def main() -> None:
    settings = get_settings()
    uvicorn.run(
        "runtime.api.routes:app",
        host=settings.runtime_host,
        port=settings.runtime_port,
        log_level=settings.runtime_log_level.lower(),
        reload=False,
    )


if __name__ == "__main__":
    main()
