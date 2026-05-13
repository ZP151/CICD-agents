# cicd-agent

A local-first AI agent for CI/CD work. A lightweight FastAPI runtime lives on
your machine, indexes your repos with Tree-sitter and a vector store, and
runs a single **Pipeline Agent** workflow that turns a `git diff` into:

- a structured PR summary + risk assessment via Azure OpenAI,
- an Azure DevOps pull request (with optional work-item link),
- an optional Azure Pipelines run.

The CLI (`dev-agent`) is a thin entrance that auto-starts the runtime on
demand.

```
Developer CLI
    |
    v   HTTP localhost:8787
+--------------------------+
| Local Agent Runtime      |
|  - repo indexer          |
|  - vector index          |
|  - context builder       |
|  - planner (ReAct-lite)  |
|  - tool executor         |
|  - memory store          |
+--------------------------+
    |             |
    v             v
 Azure OpenAI   Azure DevOps REST
```

## Requirements

- Python 3.10+
- Git in PATH
- (Optional) Azure OpenAI deployment for chat + embeddings
- (Optional) Azure DevOps PAT for PR / pipeline calls

## Install

```bash
python -m venv .venv
.\.venv\Scripts\activate    # PowerShell: .\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
```

This exposes a `dev-agent` console script. During development you can also
run `python -m cli.main ...`.

## Configure

1. Copy `.env.example` to `.env` at the project root and fill in:
  - `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`,
   `AZURE_OPENAI_CHAT_DEPLOYMENT`, `AZURE_OPENAI_EMBEDDING_DEPLOYMENT`.
  - `AZURE_DEVOPS_ORG`, `AZURE_DEVOPS_PROJECT`.
   Without Azure OpenAI the runtime still works in **offline mode**:
   embeddings and the LLM planner are skipped and a deterministic PR summary
   is produced from the diff.
2. Store your Azure DevOps PAT in the OS keyring (never in `.env`):
  ```bash
   dev-agent configure-pat
  ```
   The PAT is stored under service `cicd-agent`, user `azure-devops-pat`.
3. Edit `runtime/config/profiles.yaml` (or point `CICD_AGENT_PROFILES_PATH`
  at a per-machine override). Each profile sets the build/test commands and
   the Azure DevOps org/project/repo for one type of repository.

## Run the Pipeline Agent

From inside any repo:

```bash
python -m cli.main submit-pipeline `
  --repo "C:\path\to\your\repo" `
  --profile dotnet-api `
  --target-branch develop `
  --no-pr `
  --wait `
  --repo .                            `
  --profile dotnet-api                `
  --target-branch develop             `
  --work-item 12345                   `
  --trigger-pipeline                  `
  --wait
```

The first call auto-starts the runtime in the background (logs go to
`%USERPROFILE%\.cicd-agent\logs\runtime.log`). Subsequent calls reuse the
already-running instance.

Other CLI commands:

```bash
dev-agent healthz                # check runtime + LLM configuration
dev-agent status <task-id>       # JSON view of a task
dev-agent logs <task-id>         # printed step log
dev-agent logs <task-id> --tail  # follow until task ends
dev-agent stop                   # ask the runtime to exit
```

## How it works

1. **Index** - `RepoIndexer` walks the repo respecting `.gitignore` and
  ignored globs from the profile, then uses Tree-sitter to extract
   classes/functions/methods/interfaces and imports into SQLite. Updates are
   incremental: files are re-parsed only when their SHA-1 content hash
   changes.
2. **Embed** - new chunks are embedded with the configured Azure OpenAI
  embedding deployment and stored either in `sqlite-vec` (when the
   extension is available) or in a parallel BLOB table with brute-force
   cosine search.
3. **Context Builder** - takes `git diff` and produces a token-budgeted
  bundle of the diff plus affected symbols, related tests and configs, and
   vector-similar chunks.
4. **Planner** - a small ReAct-style loop calls Azure OpenAI with the tool
  registry; the model can invoke `git_`*, `dotnet_*`, `npm_*`, `pytest_*`
   and `ado_*` tools to inspect/build/test/create PRs before emitting a
   JSON answer with title, summary, risk level and reasoning.
5. **Pipeline Agent** - wires everything together, then runs the profile's
  build/test commands and (optionally) creates an Azure DevOps PR and
   queues a pipeline run.

## Safety guarantees

- All subprocesses run with `cwd` pinned to the repo path.
- Each per-language tool advertises an allowlist of acceptable executables.
- Captured stdout/stderr is run through a redaction filter before being
persisted in task step logs.
- The Azure DevOps PAT is read at call time from the OS keyring; it is
never written to SQLite, task results, or log files.

## Project layout

```
cli/                      # Typer entrance + auto-start client
runtime/
  api/                    # FastAPI routes + schemas
  core/                   # indexer, builder, planner, executor, queue, llm
  tools/                  # git, dotnet, npm, pytest, azure_devops
  index/                  # SQLite schema + connection helpers
  config/                 # settings + profiles.yaml loader
tests/
  unit/                   # fast, no-network unit tests
  integration/            # offline pipeline-agent run on a fixture repo
```

## Troubleshooting

- **"Runtime unavailable" on first call** - check
`%USERPROFILE%\.cicd-agent\logs\runtime.log` for the failed startup; the
most common cause is a port conflict on 8787 (set `RUNTIME_PORT` in
`.env`).
- `**tree_sitter_languages` import failure** - the indexer falls back to a
files-only mode; affected symbols and vector search degrade but the
pipeline still runs.
- **Azure OpenAI auth errors** - re-check `AZURE_OPENAI_ENDPOINT` (must end
with `/`), the API key, and that your `*_DEPLOYMENT` names match what is
deployed in your Azure resource (not the underlying model name).
- **"PAT not configured"** - run `dev-agent configure-pat` again; the PAT
is per-user, per-OS keyring.
- **PR creation refuses to run** - the source branch cannot equal the
target branch and the profile must have a non-empty
`azure_devops.repository`.

## Roadmap (deferred for v1)

- Review Agent (PR comment posting).
- Windows Service / tray-app packaging (currently on-demand only).
- LSP-based symbol fallback for C# generics/partials.
- Multi-repo orchestration.

