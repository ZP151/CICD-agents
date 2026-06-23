import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resetSettingsForTests } from "../src/settings.js";
import {
  getCurrentUser,
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
  })),
}));

describe("azureAuthSession", () => {
  const originalFetch = global.fetch;
  const originalRuntimeDataDir = process.env.RUNTIME_DATA_DIR;
  const roots: string[] = [];

  beforeEach(() => {
    resetUserCache();
    resetSettingsForTests();
    acquireTokenSilent.mockReset();
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
});

function jwt(payload: Record<string, unknown>): string {
  return [
    Buffer.from("{}").toString("base64url"),
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    "signature",
  ].join(".");
}
