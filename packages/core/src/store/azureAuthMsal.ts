import { type Configuration, PublicClientApplication } from "@azure/msal-node";
import {
  DataProtectionScope,
  FilePersistence,
  FilePersistenceWithDataProtection,
  KeychainPersistence,
  LibSecretPersistence,
  PersistenceCachePlugin,
  type IPersistence,
} from "@azure/msal-node-extensions";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  desktopClientId,
  desktopTenantId,
  MSAL_CACHE_ACCOUNT,
  MSAL_CACHE_SERVICE,
  TOKEN_CACHE_NAME,
} from "./azureAuthConfig.js";

let cacheAccessQueue: Promise<void> = Promise.resolve();
const STALE_MSAL_LOCK_GRACE_MS = 15_000;

function getAuthority(): string {
  const tenantId = desktopTenantId();
  return `https://login.microsoftonline.com/${tenantId || "organizations"}`;
}

export async function withMsalCacheAccess<T>(operation: () => Promise<T>): Promise<T> {
  const previous = cacheAccessQueue.catch(() => undefined);
  const next = previous.then(() => retryMsalCacheAccess(operation));
  cacheAccessQueue = next.then(() => undefined, () => undefined);
  return next;
}

async function retryMsalCacheAccess<T>(operation: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastErr = err;
      if (!isMsalCacheLockError(err) || attempt === 4) break;
      await sleep(75 * 2 ** attempt);
    }
  }
  throw lastErr;
}

function isMsalCacheLockError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? "");
  return /CrossPlatformLockError|lockfile|IdentityService|EPERM|EBUSY|EACCES/i.test(message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function createMsalClient(): Promise<PublicClientApplication> {
  const clientId = desktopClientId();
  if (!clientId) {
    throw new Error("Missing Azure application client ID. Set MERGEPILOT_AZURE_CLIENT_ID for browser sign-in.");
  }

  const config: Configuration = {
    auth: {
      clientId,
      authority: getAuthority(),
    },
    cache: {
      cachePlugin: new PersistenceCachePlugin(await createMsalPersistence()),
    },
  };
  return new PublicClientApplication(config);
}

async function createMsalPersistence(): Promise<IPersistence> {
  const cachePath = path.join(localApplicationDataFolder(), ".IdentityService", TOKEN_CACHE_NAME);
  recoverStaleMsalCacheLock(cachePath);

  if (process.platform === "win32") {
    return FilePersistenceWithDataProtection.create(cachePath, DataProtectionScope.CurrentUser);
  }

  if (process.platform === "darwin") {
    try {
      const persistence = await KeychainPersistence.create(cachePath, MSAL_CACHE_SERVICE, MSAL_CACHE_ACCOUNT);
      await persistence.load();
      return persistence;
    } catch {
      return FilePersistence.create(cachePath);
    }
  }

  if (process.platform === "linux") {
    try {
      const persistence = await LibSecretPersistence.create(cachePath, MSAL_CACHE_SERVICE, MSAL_CACHE_ACCOUNT);
      await persistence.load();
      return persistence;
    } catch {
      return FilePersistence.create(cachePath);
    }
  }

  return FilePersistence.create(cachePath);
}

/**
 * The MSAL extensions lock is a plain `.lockfile` with a fixed 50-second
 * retry loop. A desktop process killed while holding it leaves an empty or
 * dead-PID file behind, making the next browser sign-in look permanently
 * stalled after Azure has already redirected back. Recover only our own
 * demonstrably stale lock; live owners keep exclusive access.
 */
export function recoverStaleMsalCacheLock(
  cachePath: string,
  options: {
    now?: number;
    ownerIsAlive?: (pid: number) => boolean;
    staleAfterMs?: number;
  } = {},
): boolean {
  const lockPath = `${cachePath}.lockfile`;
  let stat: fs.Stats;
  try {
    stat = fs.statSync(lockPath);
  } catch {
    return false;
  }

  const now = options.now ?? Date.now();
  const staleAfterMs = options.staleAfterMs ?? STALE_MSAL_LOCK_GRACE_MS;
  if (now - stat.mtimeMs < staleAfterMs) return false;

  let ownerPid: number | undefined;
  try {
    const parsed = Number.parseInt(fs.readFileSync(lockPath, "utf8").trim(), 10);
    if (Number.isInteger(parsed) && parsed > 0) ownerPid = parsed;
  } catch {
    return false;
  }

  const ownerIsAlive = options.ownerIsAlive ?? isProcessAlive;
  if (ownerPid && ownerIsAlive(ownerPid)) return false;

  try {
    fs.unlinkSync(lockPath);
    return true;
  } catch {
    return false;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function localApplicationDataFolder(): string {
  if (process.platform === "win32") {
    return process.env.APPDATA?.replace(/(\\Roaming)?$/, "\\Local")
      ?? process.env.LOCALAPPDATA
      ?? os.homedir();
  }
  return process.env.HOME ?? os.homedir();
}
