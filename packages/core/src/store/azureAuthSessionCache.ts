import type { AzureUser } from "./azureAuthTypes.js";
import {
  clearPersistedUserFile,
  loadPersistedUserFile,
  persistUserCacheFile,
} from "./azureAuthUserCache.js";

let cached: AzureUser | null = null;

export function getCachedUser(): AzureUser | null {
  return cached;
}

export function setCachedUser(user: AzureUser | null): AzureUser | null {
  cached = user;
  return cached;
}

export function hydrateCachedUser(dataDir: string): AzureUser | null {
  if (cached?.homeAccountId) return cached;
  try {
    const persisted = loadPersistedUser(dataDir);
    if (persisted?.homeAccountId) cached = persisted;
  } catch {
    // loadPersistedUser is best-effort, but keep hydration defensive.
  }
  return cached;
}

export function resetUserCache(): void {
  cached = null;
}

export function persistUserCache(user: AzureUser, dataDir: string): void {
  if (user.oid === "anonymous") return;
  try {
    cached = user;
    persistUserCacheFile(user, dataDir);
  } catch {
    // Non-fatal; cache miss is handled gracefully.
  }
}

export function loadPersistedUser(dataDir: string): AzureUser | null {
  try {
    const user = loadPersistedUserFile(dataDir);
    if (user) cached = user;
    return user;
  } catch {
    return null;
  }
}

export function clearPersistedUser(dataDir: string): void {
  try {
    clearPersistedUserFile(dataDir);
  } catch {
    // ignore
  }
  cached = null;
}
