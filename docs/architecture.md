# Production architecture (v2)

This document is the consolidated output of ADRs 0001-0007. The diagrams
here are the ones embedded in [README.md](../README.md) "Production
architecture" section.

## Surfaces

```mermaid
flowchart TD
    subgraph LocalMachine[Developer machine]
        DevCLI["dev-agent CLI / TUI (Node)"]
        DevDaemon["Local Dev Agent daemon (Node, Fastify)"]
        LocalDB[("SQLite + sqlite-vec\nper-repo index + memory")]
        DevCLI -->|"HTTP + SSE"| DevDaemon
        DevDaemon --> LocalDB
    end

    subgraph Azure[Azure subscription]
        ReviewSvc["Review Agent (Container Apps)"]
        Foundry["Azure AI Foundry"]
        KV["Key Vault"]
        Tables[("Table Storage")]
        AI["Application Insights"]
    end

    ADO["Azure DevOps"]

    DevDaemon -->|"chat + embeddings"| Foundry
    DevDaemon -->|"REST (PAT)"| ADO
    ReviewSvc -->|"chat"| Foundry
    ReviewSvc -->|"REST (SPN)"| ADO
    ADO -->|"PR webhook"| ReviewSvc
    ReviewSvc --> KV
    ReviewSvc --> Tables
    ReviewSvc --> AI
    DevDaemon --> AI

    DesktopGUI["Desktop GUI (Phase 4)"] -->|"HTTP + SSE"| DevDaemon
```

## Data flow: Pipeline Agent (local)

```mermaid
sequenceDiagram
    participant Dev
    participant CLI
    participant Daemon as Dev Agent daemon
    participant Idx as Indexer
    participant LLM as Azure AI Foundry
    participant ADO
    Dev->>CLI: dev-agent submit-pipeline
    CLI->>Daemon: POST /tasks/submit-pipeline
    Daemon-->>CLI: { taskId }
    CLI->>Daemon: GET /tasks/{id}/events (SSE)
    Daemon->>Idx: incremental update
    Daemon->>LLM: chat (streaming) + tool calls
    Daemon->>ADO: create PR, link work item, trigger pipeline
    Daemon-->>CLI: step + token deltas (SSE)
```

## Data flow: Review Agent (cloud)

```mermaid
sequenceDiagram
    participant ADO
    participant Webhook as Review Agent
    participant Tables as Table Storage
    participant LLM as Azure AI Foundry
    ADO->>Webhook: POST /webhooks/ado/pr (signed)
    Webhook->>Tables: read lastIterationId(prId)
    alt new iteration
        Webhook->>ADO: getPullRequest + iterations + changes
        Webhook->>LLM: chat (review prompt)
        Webhook->>ADO: createThread (summary + inline findings)
        Webhook->>Tables: upsert lastIterationId, findingCount
    else duplicate
        Webhook-->>ADO: 200 No-op
    end
```
