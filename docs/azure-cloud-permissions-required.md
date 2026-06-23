# Azure Cloud Permissions Required

## Purpose

MergePilot uses the signed-in Microsoft Entra user to access Azure resources on behalf of that user. The desktop app is a public client and does not use a client secret.

This document records the permissions required for the current Azure-backed configuration:

- Azure Table Storage for Project Links and review history.
- Azure Cosmos DB for chat/session persistence.
- Azure Key Vault for optional centralized secrets.
- Azure DevOps for repository, pull request, and pipeline operations.

## Current Azure Resources

| Resource | Type | Name / URL |
|---|---|---|
| Storage account | Azure Storage / Table Storage | `devagentstorage001` |
| Key Vault | Azure Key Vault | `https://devagentkv001.vault.azure.net/` |
| Cosmos DB | Azure Cosmos DB for NoSQL | `https://devagentcosmos001.documents.azure.com:443/` |
| Resource group | Azure resource group | `developmentagent` |
| Subscription | Visual Studio Enterprise Subscription | `a99512b0-3dc5-476f-8f43-d7db40fbc923` |
| Tenant | Total eBiz Solutions Pte Ltd | `1f432b2e-9e7a-4aa0-ace2-53af62d309f6` |

## MergePilot App Registration

| Field | Value |
|---|---|
| Display name | `DevCICDAgent` |
| Application / client ID | `03da33ef-7161-4b27-ae80-3079313f131d` |
| Enterprise application object ID | `905ca0fd-c3d8-4300-9fc8-9693f0ed3df2` |
| App owner tenant | `1f432b2e-9e7a-4aa0-ace2-53af62d309f6` |

## Signed-In User Checked

| Field | Value |
|---|---|
| User principal name | `Zhou.Ping@totalebizsolutions.com` |
| Display name | `Zhou Ping` |
| User object ID | `8f74dcbd-1729-4b19-83be-577f45d5a55b` |

## Required App API Permissions

The app registration must include these delegated API permissions. After adding them, a tenant administrator must grant admin consent.

| API | Resource app ID | Delegated permission | Why MergePilot needs it |
|---|---:|---|---|
| Microsoft Graph | `00000003-0000-0000-c000-000000000000` | `User.Read` | Read signed-in user identity and profile metadata. |
| Azure DevOps | `499b84ac-1321-427f-aa17-267ca6975798` | `user_impersonation` | Access Azure DevOps repositories, pull requests, projects, and pipelines as the signed-in user. |
| Azure Storage | `e406a681-f3d4-42a8-90b6-c2b029497af1` | `user_impersonation` | Access Azure Table Storage using Entra ID tokens. |
| Azure Key Vault | `cfa8b339-82a2-471a-a3c9-0fc0be7a4093` | `user_impersonation` | Read or write Key Vault secrets when the secret source is configured as Key Vault. |
| Azure Cosmos DB | `a232010e-820c-4083-83bb-3ace5fc29d0b` | `user_impersonation` | Access Cosmos DB data using Entra ID tokens. |

### Current App Consent Finding

The app-side permission probe failed with:

```text
AADSTS65001: The user or administrator has not consented to use the application with ID '03da33ef-7161-4b27-ae80-3079313f131d' named 'DevCICDAgent'.
```

At the time of checking, the app registration only showed:

- Microsoft Graph `User.Read`
- Azure DevOps delegated scope

It still needs Azure Storage, Azure Key Vault, and Azure Cosmos DB delegated permissions plus admin consent.

## Required User / Group Azure RBAC

The signed-in user also needs data-plane access to the Azure resources. ARM `Contributor` on the resource group is not enough for Key Vault secrets, Table entities, or Cosmos SQL data.

Recommended assignment target: assign these roles to a security group used by MergePilot users, then add users to the group.

| Resource | Required role | Scope | Why |
|---|---|---|---|
| `devagentstorage001` | `Storage Table Data Contributor` | Storage account | Create/list/update/delete Project Links and review history rows in Azure Table Storage. |
| `devagentcosmos001` | `Cosmos DB Built-in Data Contributor` | Cosmos DB account, database, or container | Read/write chat sessions in Cosmos DB. |
| `devagentkv001` | `Key Vault Secrets User` | Key Vault | Read centralized secrets such as model keys when Key Vault secret source is enabled. |
| `devagentkv001` | `Key Vault Secrets Officer` | Key Vault | Required only if MergePilot should create or update secrets in Key Vault. |

## Current User RBAC Findings

The checked user currently has:

```text
Contributor on /subscriptions/a99512b0-3dc5-476f-8f43-d7db40fbc923/resourceGroups/developmentagent
```

This allows resource visibility and ARM management, but not all required data-plane operations.

Observed checks:

| Check | Result | Meaning |
|---|---|---|
| Storage account ARM read | Passed | User can see `devagentstorage001`. |
| Storage table list | Passed | User can list table names. |
| Storage table entity query | Failed | User needs `Storage Table Data Reader` or `Storage Table Data Contributor`; MergePilot needs Contributor. |
| Key Vault secret list | Failed with `ForbiddenByRbac` | User needs Key Vault secret data-plane role. |
| Cosmos DB ARM database list | Passed | User can see Cosmos DB metadata. |
| Cosmos SQL role assignment list | No assignments found | User still needs Cosmos SQL data-plane role for runtime session reads/writes. |

## Validation Commands

Use the correct subscription when checking these resources:

```powershell
$sub = "a99512b0-3dc5-476f-8f43-d7db40fbc923"
$userObjectId = "8f74dcbd-1729-4b19-83be-577f45d5a55b"
```

Check current Azure CLI account:

```powershell
az account show --query "{name:name,id:id,tenantId:tenantId,user:user.name}" -o json
```

Check resource visibility:

```powershell
az storage account show --subscription $sub --resource-group developmentagent --name devagentstorage001
az keyvault show --subscription $sub --resource-group developmentagent --name devagentkv001
az cosmosdb show --subscription $sub --resource-group developmentagent --name devagentcosmos001
```

Check Table Storage data access:

```powershell
az storage table list --subscription $sub --account-name devagentstorage001 --auth-mode login
az storage entity query --subscription $sub --account-name devagentstorage001 --auth-mode login --table-name CicdAgentProfiles --num-results 1
```

Check Key Vault secret data access:

```powershell
az keyvault secret list --vault-name devagentkv001
```

Check Cosmos SQL data-plane role assignments:

```powershell
az cosmosdb sql role assignment list --subscription $sub --resource-group developmentagent --account-name devagentcosmos001
az cosmosdb sql role definition list --subscription $sub --resource-group developmentagent --account-name devagentcosmos001
```

Check app registration API permissions:

```powershell
az ad app permission list --id 03da33ef-7161-4b27-ae80-3079313f131d -o json
```

Granting admin consent requires a tenant administrator:

```powershell
az ad app permission admin-consent --id 03da33ef-7161-4b27-ae80-3079313f131d
```

## Runtime Notes

- MergePilot can use local `.env` for model secrets while Key Vault permissions are not ready.
- If the secret source is local `.env`, Azure OpenAI model calls do not require Key Vault access.
- Project Links that store PAT fallback secrets in Key Vault still require Key Vault secret permissions unless that storage path is also moved to local/user-scoped secret storage.
- After App API permissions are added and admin consent is granted, users should sign out and sign in again so the desktop app can obtain tokens for the new resource scopes.

## Minimum Practical Setup

For the current Azure-backed app to work end-to-end:

1. Add the missing delegated API permissions to `DevCICDAgent`.
2. Have a tenant administrator grant admin consent.
3. Assign the user or MergePilot users group:
   - `Storage Table Data Contributor` on `devagentstorage001`
   - `Cosmos DB Built-in Data Contributor` on `devagentcosmos001`
   - `Key Vault Secrets User` on `devagentkv001` if Key Vault secret read is enabled
   - `Key Vault Secrets Officer` on `devagentkv001` if Key Vault secret write is enabled
4. Restart MergePilot or sign out/sign in again.
5. Re-run the permission probe.
