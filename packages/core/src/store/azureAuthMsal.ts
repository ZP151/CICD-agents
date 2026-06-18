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
import os from "node:os";
import path from "node:path";
import {
  desktopClientId,
  desktopTenantId,
  MSAL_CACHE_ACCOUNT,
  MSAL_CACHE_SERVICE,
  TOKEN_CACHE_NAME,
} from "./azureAuthConfig.js";

function getAuthority(): string {
  const tenantId = desktopTenantId();
  return `https://login.microsoftonline.com/${tenantId || "organizations"}`;
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

function localApplicationDataFolder(): string {
  if (process.platform === "win32") {
    return process.env.APPDATA?.replace(/(\\Roaming)?$/, "\\Local")
      ?? process.env.LOCALAPPDATA
      ?? os.homedir();
  }
  return process.env.HOME ?? os.homedir();
}
