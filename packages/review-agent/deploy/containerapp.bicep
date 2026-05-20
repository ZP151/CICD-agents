// Minimal Container Apps deployment for the Review Agent.
// Usage:
//   az deployment group create -g <rg> -f containerapp.bicep -p ...
// The container image must be pushed to your registry first.

@description('Resource name prefix')
param name string

@description('Container image (e.g. myregistry.azurecr.io/cicd-agent/review-agent:latest)')
param image string

@description('Azure region')
param location string = resourceGroup().location

@description('Azure OpenAI endpoint')
param azureOpenAiEndpoint string

@description('Azure OpenAI chat deployment name')
param azureOpenAiChatDeployment string = 'gpt-4o'

@description('Azure DevOps organization')
param azureDevOpsOrg string

@description('Key Vault name (must already exist)')
param keyVaultName string

@description('Storage account connection string secret name in Key Vault')
param tablesSecretName string = 'tables-connection-string'

@description('ADO service principal client secret name in Key Vault')
param spnSecretName string = 'ado-spn-secret'

@description('ADO service principal client id')
param spnClientId string

@description('ADO service principal tenant id')
param spnTenantId string

@description('Webhook shared secret name in Key Vault')
param webhookSecretName string = 'ado-webhook-secret'

@description('Application Insights connection string')
param appInsightsConnectionString string = ''

resource env 'Microsoft.App/managedEnvironments@2024-03-01' existing = {
  name: '${name}-env'
}

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: '${name}-identity'
}

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${name}-review-agent'
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identity.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: env.id
    configuration: {
      ingress: {
        external: true
        targetPort: 8080
        transport: 'http'
      }
      secrets: [
        {
          name: 'tables-connection-string'
          keyVaultUrl: 'https://${keyVaultName}.vault.azure.net/secrets/${tablesSecretName}'
          identity: identity.id
        }
        {
          name: 'ado-spn-secret'
          keyVaultUrl: 'https://${keyVaultName}.vault.azure.net/secrets/${spnSecretName}'
          identity: identity.id
        }
        {
          name: 'ado-webhook-secret'
          keyVaultUrl: 'https://${keyVaultName}.vault.azure.net/secrets/${webhookSecretName}'
          identity: identity.id
        }
      ]
    }
    template: {
      scale: {
        minReplicas: 0
        maxReplicas: 5
        rules: [
          {
            name: 'http'
            http: {
              metadata: {
                concurrentRequests: '10'
              }
            }
          }
        ]
      }
      containers: [
        {
          name: 'review-agent'
          image: image
          resources: {
            cpu: json('0.5')
            memory: '1.0Gi'
          }
          env: [
            { name: 'AZURE_OPENAI_ENDPOINT', value: azureOpenAiEndpoint }
            { name: 'AZURE_OPENAI_CHAT_DEPLOYMENT', value: azureOpenAiChatDeployment }
            { name: 'AZURE_DEVOPS_ORG', value: azureDevOpsOrg }
            { name: 'ADO_SPN_CLIENT_ID', value: spnClientId }
            { name: 'ADO_SPN_TENANT_ID', value: spnTenantId }
            { name: 'KEY_VAULT_NAME', value: keyVaultName }
            { name: 'AZURE_TABLES_CONNECTION_STRING', secretRef: 'tables-connection-string' }
            { name: 'ADO_SPN_SECRET', secretRef: 'ado-spn-secret' }
            { name: 'ADO_WEBHOOK_SECRET', secretRef: 'ado-webhook-secret' }
            { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
          ]
        }
      ]
    }
  }
}

output fqdn string = app.properties.configuration.ingress.fqdn
