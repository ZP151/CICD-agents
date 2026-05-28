/**
 * Azure Key Vault integration for storing secrets (ADO PAT, Azure OpenAI API key).
 *
 * Secret naming convention:
 *   ado-pat-{profileId}          → ADO Personal Access Token per profile
 *   aoai-key-{shortUserId}       → Azure OpenAI API key per user
 *
 * Usage:
 *   const kv = new KeyVaultSecrets("https://my-vault.vault.azure.net/");
 *   await kv.setAdoPat(profileId, "patValue");
 *   const pat = await kv.getAdoPat(profileId);
 */
import { SecretClient } from "@azure/keyvault-secrets";
import { DefaultAzureCredential } from "@azure/identity";
import { getCurrentUser } from "./azureAuth.js";

export class KeyVaultSecrets {
  private readonly client: SecretClient;

  constructor(vaultUrl: string) {
    this.client = new SecretClient(vaultUrl, new DefaultAzureCredential());
  }

  // ── ADO PAT (per profile) ───────────────────────────────────────────────────

  async getAdoPat(profileId: string): Promise<string | null> {
    try {
      const secret = await this.client.getSecret(`ado-pat-${profileId}`);
      return secret.value ?? null;
    } catch (err: unknown) {
      if ((err as { statusCode?: number })?.statusCode === 404) return null;
      throw err;
    }
  }

  async setAdoPat(profileId: string, pat: string): Promise<void> {
    await this.client.setSecret(`ado-pat-${profileId}`, pat, {
      tags: { type: "ado-pat", profileId },
      contentType: "text/plain",
    });
  }

  async deleteAdoPat(profileId: string): Promise<void> {
    try {
      const poller = await this.client.beginDeleteSecret(`ado-pat-${profileId}`);
      await poller.pollUntilDone();
    } catch (err: unknown) {
      if ((err as { statusCode?: number })?.statusCode !== 404) throw err;
    }
  }

  // ── Azure OpenAI API key (per user) ─────────────────────────────────────────

  async getAoaiKey(): Promise<string | null> {
    const user = await getCurrentUser();
    const shortId = user.oid.replace(/-/g, "").slice(0, 12);
    try {
      const secret = await this.client.getSecret(`aoai-key-${shortId}`);
      return secret.value ?? null;
    } catch (err: unknown) {
      if ((err as { statusCode?: number })?.statusCode === 404) return null;
      throw err;
    }
  }

  async setAoaiKey(apiKey: string): Promise<void> {
    const user = await getCurrentUser();
    const shortId = user.oid.replace(/-/g, "").slice(0, 12);
    await this.client.setSecret(`aoai-key-${shortId}`, apiKey, {
      tags: { type: "aoai-key", userId: user.oid },
      contentType: "text/plain",
    });
  }
}
