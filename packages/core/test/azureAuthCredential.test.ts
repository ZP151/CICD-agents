import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetSettingsForTests } from "../src/settings.js";
import {
  getAzureCachedScopeCredential,
  shouldUsePersistentAzureTokenCache,
} from "../src/store/azureAuthCredential.js";
import { resetUserCache, setCachedUser } from "../src/store/azureAuthSessionCache.js";

const acquireTokenSilent = vi.fn();

vi.mock("../src/store/azureAuthMsal.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/store/azureAuthMsal.js")>();
  return {
    ...actual,
    createMsalClient: vi.fn(async () => ({
    getTokenCache: () => ({
      getAllAccounts: async () => [
        {
          homeAccountId: "home-1",
          tenantId: "tenant-1",
          username: "user@example.test",
        },
      ],
    }),
    acquireTokenSilent,
  })),
  };
});

describe("azureAuthCredential", () => {
  beforeEach(() => {
    resetSettingsForTests();
    resetUserCache();
    acquireTokenSilent.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetSettingsForTests();
    resetUserCache();
  });

  it("keeps the persistent token cache out of CI and test processes", () => {
    expect(shouldUsePersistentAzureTokenCache({})).toBe(true);
    expect(shouldUsePersistentAzureTokenCache({ CI: "true" })).toBe(false);
    expect(shouldUsePersistentAzureTokenCache({ NODE_ENV: "test" })).toBe(false);
    expect(shouldUsePersistentAzureTokenCache({ VITEST: "true" })).toBe(false);
  });

  it("preserves MSAL consent errors instead of falling back to disabled automatic auth", async () => {
    setCachedUser({
      oid: "user-1",
      homeAccountId: "home-1",
      username: "user@example.test",
    });
    acquireTokenSilent.mockRejectedValue(new Error("AADSTS65001: consent required"));

    const credential = getAzureCachedScopeCredential("https://vault.azure.net/.default");

    await expect(credential.getToken("https://vault.azure.net/.default")).rejects.toThrow(
      "AADSTS65001",
    );
  });

  it("retries transient MSAL cache lock failures", async () => {
    vi.useFakeTimers();
    setCachedUser({
      oid: "user-1",
      homeAccountId: "home-1",
      username: "user@example.test",
    });
    acquireTokenSilent
      .mockRejectedValueOnce(new Error("CrossPlatformLockError: EPERM: operation not permitted, unlink 'mergepilot.lockfile'"))
      .mockResolvedValueOnce({
        accessToken: "token-1",
        expiresOn: new Date(Date.now() + 3_600_000),
      });

    const credential = getAzureCachedScopeCredential("https://vault.azure.net/.default");
    const tokenPromise = credential.getToken("https://vault.azure.net/.default");

    await vi.advanceTimersByTimeAsync(75);

    await expect(tokenPromise).resolves.toMatchObject({ token: "token-1" });
    expect(acquireTokenSilent).toHaveBeenCalledTimes(2);
  });
});
