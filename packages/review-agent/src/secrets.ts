import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";

export interface SecretProvider {
  get(name: string): Promise<string>;
}

export class KeyVaultSecretProvider implements SecretProvider {
  private readonly client: SecretClient;
  constructor(vaultName: string) {
    const vaultUrl = `https://${vaultName}.vault.azure.net`;
    this.client = new SecretClient(vaultUrl, new DefaultAzureCredential());
  }
  async get(name: string): Promise<string> {
    const result = await this.client.getSecret(name);
    return result.value ?? "";
  }
}

export class EnvSecretProvider implements SecretProvider {
  constructor(private readonly map: Record<string, string> = {}) {}
  async get(name: string): Promise<string> {
    return this.map[name] ?? process.env[name] ?? "";
  }
}

export function defaultSecretProvider(keyVaultName: string): SecretProvider {
  return keyVaultName ? new KeyVaultSecretProvider(keyVaultName) : new EnvSecretProvider();
}
