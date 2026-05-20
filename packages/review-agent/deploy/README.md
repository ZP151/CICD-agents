# Review Agent - deployment

The Review Agent is a Fastify HTTP server packaged in a Docker image and
hosted on Azure Container Apps.

## Prerequisites (you must own these)

- A resource group with:
  - a Container Apps managed environment named `<name>-env`,
  - a user-assigned managed identity named `<name>-identity`,
  - a Key Vault holding the secrets listed below,
  - a storage account with the Tables service enabled.
- A service principal (SPN) for the agent to call Azure DevOps:
  - permissions: `vso.code` (read), `vso.code_status`, `vso.threads_full`,
    `vso.serviceendpoint_query`.
- A PAT on your local machine (for `dev-agent review enable`).

## Required Key Vault secrets

| Secret name             | Purpose                                              |
| ----------------------- | ---------------------------------------------------- |
| `tables-connection-string` | Storage account connection string (Tables endpoint) |
| `ado-spn-secret`        | ADO service principal client secret                  |
| `ado-webhook-secret`    | Shared HTTP Basic password for ADO service-hooks     |

The managed identity must have `get` permission on these secrets and the
Container App must be configured to use the identity for secret resolution
(the bicep template handles this).

## Build the image

```bash
# from the repo root
docker build -f packages/review-agent/Dockerfile -t <registry>/cicd-agent/review-agent:<tag> .
docker push <registry>/cicd-agent/review-agent:<tag>
```

## Deploy

```bash
az deployment group create \
  -g <rg> \
  -f packages/review-agent/deploy/containerapp.bicep \
  -p name=<prefix> \
      image=<registry>/cicd-agent/review-agent:<tag> \
      azureOpenAiEndpoint=https://<aoai>.openai.azure.com/ \
      azureDevOpsOrg=<org> \
      keyVaultName=<kv> \
      spnClientId=<guid> \
      spnTenantId=<guid> \
      appInsightsConnectionString=<conn-string>
```

The output value `fqdn` is the URL you pass to `dev-agent review enable
--url https://<fqdn>`.

## Register the webhook from your laptop

```bash
dev-agent configure-pat                  # one-time
dev-agent review enable \
  --project <project> \
  --repository <repo-uuid> \
  --url https://<fqdn> \
  --password <ado-webhook-secret value>
```

ADO will start posting `git.pullrequest.created` and
`git.pullrequest.updated` events to the agent within seconds.

## Smoke test

```bash
curl https://<fqdn>/healthz
# expected: {"ok":true}
```

If the Container App reports cold starts, increase `min-replicas` to 1
during business hours.

## Owner-driven follow-ups (NOT done by the agent code)

- Provision the resource group, Container Apps environment, managed
  identity, Key Vault, storage account, and the SPN itself.
- Push the first image and update the bicep with the registry URL.
- Configure ADO with the SPN's tenant.
- Run `dev-agent review enable` once per repository.
