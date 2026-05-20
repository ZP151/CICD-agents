# ADR-0004: Storage strategy

- Status: Accepted
- Date: 2026-05-18

## Context

Two surfaces persist state:

- The local Dev Agent: per-repo code index (files, symbols, imports,
  chunks, embeddings), memory tables (PR history, conventions,
  reviewer_map, known_flaky_tests), and the task queue.
- The cloud Review Agent: review history (PR id -> last reviewed
  iteration), per-repo conventions, optional finding history.

Neither surface stores secrets (PATs, API keys).

## Decision

- Local: SQLite per repo, file at `<data_dir>/repos/<repo_id>/index.db`.
  Vector search uses the `sqlite-vec` extension when available; falls
  back to a brute-force cosine search over a BLOB column when not.
  Schema lives in [runtime/index/schema.sql](runtime/index/schema.sql)
  in v1 and is reused verbatim in `packages/core/src/db/schema.sql` in v2.
- Cloud: Azure Table Storage, two tables:
  - `ReviewHistory` (PartitionKey = repo, RowKey = pullRequestId; columns:
    lastIterationId, findingCount, lastRunAt, lastTokensIn, lastTokensOut).
  - `Conventions` (PartitionKey = repo, RowKey = rule_id; columns: scope,
    text, severity).
- Cloud writes only to ephemeral disk during a single PR review; durable
  state is exclusively in Table Storage.

## Consequences

- Positive: zero-cost when idle; horizontally scalable for the cloud
  surface; the local file-per-repo model preserves user data isolation.
- Negative: no global cross-repo analytics in v2; revisit with a small
  warehouse in v3 if needed.

## Alternatives considered

- DuckDB locally: rejected because the vector ecosystem is weaker than
  sqlite-vec right now.
- Cosmos DB (NoSQL) for the cloud: rejected because Table Storage covers
  the access patterns at lower cost; can be migrated later behind a
  repository interface.
- Postgres: rejected as over-engineering for the v2 access patterns.
