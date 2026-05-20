# ADR-0003: AI endpoint is Azure AI Foundry (OpenAI-compatible)

- Status: Accepted
- Date: 2026-05-18

## Context

We need a hosted LLM that:

- supports tool-calling (function-calling) for the planner loop,
- supports streaming chat completions for the SSE transcript,
- supports embeddings for the local vector index,
- is governed by our enterprise tenant (PII / data residency),
- exposes an OpenAI-compatible API surface so we can keep using the
  `openai` SDK with a base-URL override.

## Decision

Azure AI Foundry (formerly Azure OpenAI Service) endpoints are the canonical
backend.

- Deployment names are env-driven (`AZURE_OPENAI_CHAT_DEPLOYMENT`,
  `AZURE_OPENAI_EMBEDDING_DEPLOYMENT`), never hard-coded.
- API version pinned in `.env.example` and the daemon refuses to start if
  the env var is missing.
- Local Dev Agent authenticates with the user's API key (env or OS
  keyring).
- Review Agent authenticates with a managed-identity-protected client
  secret pulled from Key Vault.

## Consequences

- Positive: governance + DLP through the Azure tenant; same SDK as
  OpenAI direct so future-portability is preserved.
- Negative: tied to Azure regional availability of specific model versions;
  noted in the env documentation.

## Alternatives considered

- OpenAI direct: rejected due to enterprise data-handling policy.
- Anthropic / Google / Mistral hosted: deferred; can be added later behind
  the `llm_client` interface if a Foundry alternative is needed.
- Local models (Ollama, llama.cpp): rejected for v2 because tool-calling
  quality and embedding quality on consumer hardware do not meet the
  Pipeline Agent SLA.
