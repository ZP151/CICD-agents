/**
 * Azure Key Vault integration for storing secrets (ADO PAT, Azure OpenAI API key).
 *
 * Secret naming convention:
 *   ado-pat-{projectLinkId}      → ADO Personal Access Token per Project Link
 *   aoai-key-{shortUserId}       → Azure OpenAI API key per user
 *   kv://aoai-key                → Reference to the current user's AOAI key
 *   kv://secret/{secretName}     → Reference to an explicit Key Vault secret
 *
 * Usage:
 *   const kv = new KeyVaultSecrets("https://my-vault.vault.azure.net/");
 *   await kv.setAdoPat(projectLinkId, "patValue");
 *   const pat = await kv.getAdoPat(projectLinkId);
 */
import { SecretClient } from "@azure/keyvault-secrets";
import { KEY_VAULT_SCOPE } from "./azureAuthConfig.js";
import { getAzureCachedScopeCredential } from "./azureAuthCredential.js";
import { requireCurrentUser } from "./azureAuth.js";

export class KeyVaultSecrets {
  private readonly client: SecretClient;

  constructor(vaultUrl: string) {
    this.client = new SecretClient(vaultUrl, getAzureCachedScopeCredential(KEY_VAULT_SCOPE));
  }

  // ── ADO PAT (per Project Link) ──────────────────────────────────────────────

  async getAdoPat(projectLinkId: string): Promise<string | null> {
    try {
      const secret = await this.client.getSecret(`ado-pat-${projectLinkId}`);
      return secret.value ?? null;
    } catch (err: unknown) {
      if ((err as { statusCode?: number })?.statusCode === 404) return null;
      throw err;
    }
  }

  async setAdoPat(projectLinkId: string, pat: string): Promise<void> {
    await this.client.setSecret(`ado-pat-${projectLinkId}`, pat, {
      tags: { type: "ado-pat", projectLinkId },
      contentType: "text/plain",
    });
  }

  async deleteAdoPat(projectLinkId: string): Promise<void> {
    try {
      const poller = await this.client.beginDeleteSecret(`ado-pat-${projectLinkId}`);
      await poller.pollUntilDone();
    } catch (err: unknown) {
      if ((err as { statusCode?: number })?.statusCode !== 404) throw err;
    }
  }

  // ── Azure OpenAI API key (per user) ─────────────────────────────────────────

  async getAoaiKey(): Promise<string | null> {
    const user = await requireCurrentUser();
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
    const user = await requireCurrentUser();
    const shortId = user.oid.replace(/-/g, "").slice(0, 12);
    await this.client.setSecret(`aoai-key-${shortId}`, apiKey, {
      tags: { type: "aoai-key", userId: user.oid },
      contentType: "text/plain",
    });
  }

  async getAoaiKeyByRef(ref: string): Promise<string | null> {
    if (ref === "kv://aoai-key") return this.getAoaiKey();

    const explicitSecret = /^kv:\/\/secret\/([^/]+)$/.exec(ref);
    if (!explicitSecret?.[1]) return null;
    try {
      const secret = await this.client.getSecret(explicitSecret[1]);
      return secret.value ?? null;
    } catch (err: unknown) {
      if ((err as { statusCode?: number })?.statusCode === 404) return null;
      throw err;
    }
  }
}
