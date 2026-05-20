# ADR-0002: Review Agent runs on Azure Container Apps

- Status: Accepted
- Date: 2026-05-18

## Context

The Review Agent must:

- receive Azure DevOps `git.pullrequest.created` / `git.pullrequest.updated`
  service-hook callbacks,
- process them within seconds without keeping a warm pool 24/7,
- run a Node.js process that talks to Azure OpenAI and Azure DevOps,
- read secrets from Azure Key Vault using managed identity,
- emit logs and metrics to Application Insights.

## Decision

Host the Review Agent on Azure Container Apps with:

- min-replicas = 0, max-replicas = 5; HTTP-triggered scale via KEDA.
- A user-assigned managed identity granted `get` and `list` on the Key
  Vault that stores the Service Principal client secret.
- Application Insights connection string injected via Container Apps env.
- One container image built from `packages/review-agent/Dockerfile`.

## Consequences

- Positive: scales to zero (cheapest serverless option that still supports
  long-lived HTTP and arbitrary Node deps), supports managed identity
  natively, no Function-specific constraints.
- Negative: cold start of a few seconds on the first PR webhook; warm-up
  via a "wake-up" cron call once an hour during business hours if this
  becomes a UX issue.

## Alternatives considered

- Azure Functions (Consumption plan): rejected because of the 10 min
  execution limit (we have headroom now but want to grow) and the
  function-style programming model that adds boilerplate.
- Azure App Service (B1 SKU): rejected because it always-on and we'd pay
  even when no PRs are open.
- Self-hosted Kubernetes: rejected as over-engineering for v2.
