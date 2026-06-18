import fs from "node:fs";
import path from "node:path";
import type { AzureUser } from "./azureAuthTypes.js";

interface PersistedAuth {
  oid: string;
  homeAccountId?: string;
  tenantId?: string;
  username?: string;
  upn?: string;
  name?: string;
  avatarDataUrl?: string;
  cachedAt: number;
}

function authCachePath(dataDir: string): string {
  return path.join(dataDir, "auth-cache.json");
}

export function persistUserCacheFile(user: AzureUser, dataDir: string): void {
  if (user.oid === "anonymous") return;
  fs.mkdirSync(dataDir, { recursive: true });
  const data: PersistedAuth = { ...user, cachedAt: Math.floor(Date.now() / 1000) };
  fs.writeFileSync(authCachePath(dataDir), JSON.stringify(data, null, 2), "utf-8");
}

export function loadPersistedUserFile(dataDir: string): AzureUser | null {
  const raw = fs.readFileSync(authCachePath(dataDir), "utf-8");
  const data = JSON.parse(raw) as PersistedAuth;
  const age = Math.floor(Date.now() / 1000) - (data.cachedAt ?? 0);
  if (age > 7 * 24 * 3600) return null;
  return {
    oid: data.oid,
    homeAccountId: data.homeAccountId,
    tenantId: data.tenantId,
    username: data.username,
    upn: data.upn,
    name: data.name,
    avatarDataUrl: data.avatarDataUrl,
  };
}

export function clearPersistedUserFile(dataDir: string): void {
  const cachePath = authCachePath(dataDir);
  if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath);
}
