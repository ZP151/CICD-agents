/**
 * Azure user identity resolution via DefaultAzureCredential.
 *
 * Requires `az login` (or any credential source supported by DefaultAzureCredential).
 * Returns the AAD Object ID (oid) as the stable userId used to partition all
 * cloud-backed stores.
 */
import { DefaultAzureCredential } from "@azure/identity";
import fs from "node:fs";
import path from "node:path";

export interface AzureUser {
  /** AAD Object ID — stable, unique per user per tenant */
  oid: string;
  /** User Principal Name (email) if present in token */
  upn?: string;
  /** Display name if present */
  name?: string;
}

let cached: AzureUser | null = null;

/**
 * Resolve the current user's identity from the active Azure credential.
 * Falls back to { oid: "anonymous" } when no credential is available.
 *
 * The token is acquired for the Azure Storage scope (always available for
 * storage-level RBAC) and the OID is decoded from the JWT payload.
 * No Graph API call is needed.
 */
export async function getCurrentUser(): Promise<AzureUser> {
  if (cached) return cached;

  try {
    const cred = new DefaultAzureCredential();
    const token = await cred.getToken("https://storage.azure.com/.default");
    if (token?.token) {
      const parts = token.token.split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(
          Buffer.from(parts[1]!, "base64url").toString("utf-8"),
        ) as Record<string, unknown>;

        cached = {
          oid:  (payload["oid"]  as string | undefined) ?? (payload["sub"] as string | undefined) ?? "anonymous",
          upn:  payload["upn"]  as string | undefined,
          name: payload["name"] as string | undefined,
        };
        return cached;
      }
    }
  } catch {
    // No credential available — offline / no az login
  }

  cached = { oid: "anonymous" };
  return cached;
}

/** Whether Azure credential is available on this machine. */
export async function isAzureAuthAvailable(): Promise<boolean> {
  const u = await getCurrentUser();
  return u.oid !== "anonymous";
}

export function resetUserCache(): void {
  cached = null;
}

// ── File-based user cache (~/.cicd-agent/auth-cache.json) ────────────────────

interface PersistedAuth {
  oid: string;
  upn?: string;
  name?: string;
  cachedAt: number; // unix seconds
}

function authCachePath(dataDir: string): string {
  return path.join(dataDir, "auth-cache.json");
}

/**
 * Write the resolved user identity to disk so subsequent daemon startups can
 * show the user instantly without waiting for a credential round-trip.
 */
export function persistUserCache(user: AzureUser, dataDir: string): void {
  if (user.oid === "anonymous") return;
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    const data: PersistedAuth = { ...user, cachedAt: Math.floor(Date.now() / 1000) };
    fs.writeFileSync(authCachePath(dataDir), JSON.stringify(data, null, 2), "utf-8");
  } catch {
    // Non-fatal — cache miss is handled gracefully
  }
}

/**
 * Load the previously persisted user from disk.
 * Returns null if not found or stale (>7 days old).
 */
export function loadPersistedUser(dataDir: string): AzureUser | null {
  try {
    const raw = fs.readFileSync(authCachePath(dataDir), "utf-8");
    const data = JSON.parse(raw) as PersistedAuth;
    const age = Math.floor(Date.now() / 1000) - (data.cachedAt ?? 0);
    if (age > 7 * 24 * 3600) return null; // stale after 7 days
    return { oid: data.oid, upn: data.upn, name: data.name };
  } catch {
    return null;
  }
}

/**
 * Clear the persisted user cache (call after az logout).
 */
export function clearPersistedUser(dataDir: string): void {
  try {
    const p = authCachePath(dataDir);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch {
    // ignore
  }
  cached = null;
}
