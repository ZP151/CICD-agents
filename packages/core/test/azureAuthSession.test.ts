import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resetSettingsForTests } from "../src/settings.js";
import {
  getCurrentUser,
  loginWithCachedAccount,
  loginWithBrowser,
} from "../src/store/azureAuthSession.js";
import {
  persistUserCache,
  resetUserCache,
  setCachedUser,
} from "../src/store/azureAuthSessionCache.js";

vi.mock("../src/store/azureAuthCredential.js", () => ({
  getAzureCredential: () => ({
    getToken: vi.fn(async () => {
      throw new Error("no azure identity credential");
    }),
  }),
}));

const acquireTokenSilent = vi.fn();
const acquireTokenInteractive = vi.fn();

vi.mock("../src/store/azureAuthMsal.js", () => ({
  createMsalClient: vi.fn(async () => ({
    getTokenCache: () => ({
      getAllAccounts: async () => [
        {
          homeAccountId: "home-1",
          tenantId: "tenant-1",
          username: "user@example.test",
          name: "Example User",
        },
      ],
    }),
    acquireTokenSilent,
    acquireTokenInteractive,
  })),
  withMsalCacheAccess: async <T>(operation: () => Promise<T>) => operation(),
}));

describe("azureAuthSession", () => {
  const originalFetch = global.fetch;
  const originalRuntimeDataDir = process.env.RUNTIME_DATA_DIR;
  const originalSecretSource = process.env.MERGEPILOT_SECRET_SOURCE;
  const originalAzureKeyVaultUrl = process.env.AZURE_KEYVAULT_URL;
  const originalAzureOpenAiApiKey = process.env.AZURE_OPENAI_API_KEY;
  const roots: string[] = [];

  beforeEach(() => {
    resetUserCache();
    resetSettingsForTests();
    acquireTokenSilent.mockReset();
    acquireTokenInteractive.mockReset();
    acquireTokenSilent.mockResolvedValue({
      accessToken: jwt({
        oid: "user-1",
        preferred_username: "user@example.test",
        name: "Example User",
      }),
      idToken: jwt({
        oid: "user-1",
        preferred_username: "user@example.test",
        name: "Example User",
      }),
    });
    global.fetch = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), {
      headers: { "content-type": "image/jpeg" },
      status: 200,
    }));
  });

  afterEach(() => {
    resetUserCache();
    resetSettingsForTests();
    if (originalRuntimeDataDir === undefined) {
      delete process.env.RUNTIME_DATA_DIR;
    } else {
      process.env.RUNTIME_DATA_DIR = originalRuntimeDataDir;
    }
    if (originalSecretSource === undefined) {
      delete process.env.MERGEPILOT_SECRET_SOURCE;
    } else {
      process.env.MERGEPILOT_SECRET_SOURCE = originalSecretSource;
    }
    if (originalAzureKeyVaultUrl === undefined) {
      delete process.env.AZURE_KEYVAULT_URL;
    } else {
      process.env.AZURE_KEYVAULT_URL = originalAzureKeyVaultUrl;
    }
    if (originalAzureOpenAiApiKey === undefined) {
      delete process.env.AZURE_OPENAI_API_KEY;
    } else {
      process.env.AZURE_OPENAI_API_KEY = originalAzureOpenAiApiKey;
    }
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
    global.fetch = originalFetch;
  });

  function tempDir(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "mergepilot-auth-session-"));
    roots.push(root);
    return root;
  }

  it("hydrates the persisted user before using live credentials", async () => {
    const dataDir = tempDir();
    process.env.RUNTIME_DATA_DIR = dataDir;
    resetSettingsForTests();
    persistUserCache({
      oid: "user-1",
      homeAccountId: "home-1",
      username: "user@example.test",
      name: "Persisted User",
      avatarDataUrl: "data:image/jpeg;base64,cGVyc2lzdGVk",
    }, dataDir);
    resetUserCache();

    await expect(getCurrentUser()).resolves.toMatchObject({
      name: "Persisted User",
      avatarDataUrl: "data:image/jpeg;base64,cGVyc2lzdGVk",
    });
    expect(acquireTokenSilent).not.toHaveBeenCalled();
  });

  it("keeps cached auth fast unless profile refresh is requested", async () => {
    setCachedUser({
      oid: "user-1",
      homeAccountId: "home-1",
      username: "user@example.test",
      name: "Cached User",
    });

    const cached = await getCurrentUser();
    expect(cached).toMatchObject({ name: "Cached User" });
    expect(cached).not.toHaveProperty("avatarDataUrl");
    expect(acquireTokenSilent).not.toHaveBeenCalled();

    await expect(getCurrentUser({ refreshProfile: true })).resolves.toMatchObject({
      name: "Example User",
      avatarDataUrl: "data:image/jpeg;base64,AQID",
    });
    expect(acquireTokenSilent).toHaveBeenCalledWith(expect.objectContaining({
      account: expect.objectContaining({ homeAccountId: "home-1" }),
    }));
  });

  it("does not request Key Vault consent during basic Microsoft sign-in", async () => {
    acquireTokenInteractive.mockResolvedValue({
      accessToken: jwt({
        oid: "user-1",
        preferred_username: "user@example.test",
        name: "Example User",
      }),
      idToken: jwt({
        oid: "user-1",
        preferred_username: "user@example.test",
        name: "Example User",
      }),
      account: {
        homeAccountId: "home-1",
        tenantId: "tenant-1",
        username: "user@example.test",
      },
    });

    await expect(loginWithBrowser("default")).resolves.toMatchObject({
      oid: "user-1",
      username: "user@example.test",
    });

    expect(acquireTokenInteractive).toHaveBeenCalledTimes(1);
    expect(acquireTokenInteractive).toHaveBeenCalledWith(expect.objectContaining({
      scopes: ["https://graph.microsoft.com/User.Read"],
    }));
    expect(acquireTokenSilent).not.toHaveBeenCalledWith(expect.objectContaining({
      scopes: ["499b84ac-1321-427f-aa17-267ca6975798/.default"],
    }));
    expect(acquireTokenSilent).not.toHaveBeenCalledWith(expect.objectContaining({
      scopes: ["499b84ac-1321-427f-aa17-267ca6975798/user_impersonation"],
    }));
    expect(acquireTokenInteractive).not.toHaveBeenCalledWith(expect.objectContaining({
      scopes: ["https://vault.azure.net/.default"],
    }));
    expect(acquireTokenInteractive).not.toHaveBeenCalledWith(expect.objectContaining({
      scopes: ["499b84ac-1321-427f-aa17-267ca6975798/.default"],
    }));
    expect(acquireTokenInteractive).not.toHaveBeenCalledWith(expect.objectContaining({
      scopes: ["499b84ac-1321-427f-aa17-267ca6975798/user_impersonation"],
    }));
  });

  it("keeps basic Microsoft sign-in identity-only even when Key Vault secret mode is configured", async () => {
    process.env.MERGEPILOT_SECRET_SOURCE = "key_vault";
    process.env.AZURE_KEYVAULT_URL = "https://devagentkv001.vault.azure.net/";
    process.env.AZURE_OPENAI_API_KEY = "kv://secret/mergepilot-aoai-key";
    acquireTokenInteractive.mockResolvedValue({
      accessToken: jwt({
        oid: "user-1",
        preferred_username: "user@example.test",
        name: "Example User",
      }),
      idToken: jwt({
        oid: "user-1",
        preferred_username: "user@example.test",
        name: "Example User",
      }),
      account: {
        homeAccountId: "home-1",
        tenantId: "tenant-1",
        username: "user@example.test",
      },
    });

    await expect(loginWithBrowser("default")).resolves.toMatchObject({
      oid: "user-1",
      username: "user@example.test",
    });

    expect(acquireTokenInteractive).toHaveBeenCalledTimes(1);
    expect(acquireTokenInteractive).toHaveBeenCalledWith(expect.objectContaining({
      scopes: ["https://graph.microsoft.com/User.Read"],
    }));
    expect(acquireTokenInteractive).not.toHaveBeenCalledWith(expect.objectContaining({
      scopes: ["https://vault.azure.net/.default"],
    }));
    expect(acquireTokenInteractive).not.toHaveBeenCalledWith(expect.objectContaining({
      scopes: ["499b84ac-1321-427f-aa17-267ca6975798/.default"],
    }));
    expect(acquireTokenInteractive).not.toHaveBeenCalledWith(expect.objectContaining({
      scopes: ["499b84ac-1321-427f-aa17-267ca6975798/user_impersonation"],
    }));
  });

  it("does not enable Azure DevOps when selecting a cached Microsoft account", async () => {
    await expect(loginWithCachedAccount("home-1")).resolves.toMatchObject({
      oid: "user-1",
      username: "user@example.test",
    });

    expect(acquireTokenSilent).toHaveBeenCalledWith(expect.objectContaining({
      scopes: ["https://graph.microsoft.com/User.Read"],
    }));
    expect(acquireTokenSilent).not.toHaveBeenCalledWith(expect.objectContaining({
      scopes: ["499b84ac-1321-427f-aa17-267ca6975798/.default"],
    }));
    expect(acquireTokenSilent).not.toHaveBeenCalledWith(expect.objectContaining({
      scopes: ["499b84ac-1321-427f-aa17-267ca6975798/user_impersonation"],
    }));
    expect(acquireTokenInteractive).not.toHaveBeenCalled();
  });
});

function jwt(payload: Record<string, unknown>): string {
  return [
    Buffer.from("{}").toString("base64url"),
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    "signature",
  ].join(".");
}
