import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  clearPersistedUser,
  getCachedUser,
  hydrateCachedUser,
  loadPersistedUser,
  persistUserCache,
  resetUserCache,
  setCachedUser,
} from "../src/store/azureAuthSessionCache.js";

describe("azureAuthSessionCache", () => {
  const roots: string[] = [];

  afterEach(() => {
    resetUserCache();
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  function tempDir(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "mergepilot-auth-cache-"));
    roots.push(root);
    return root;
  }

  it("persists and hydrates the selected Azure user", () => {
    const dataDir = tempDir();
    const user = {
      oid: "user-1",
      homeAccountId: "home-1",
      tenantId: "tenant-1",
      username: "user@example.test",
      name: "Example User",
    };

    persistUserCache(user, dataDir);
    resetUserCache();

    expect(hydrateCachedUser(dataDir)).toEqual(user);
    expect(getCachedUser()).toEqual(user);
  });

  it("treats persisted cache IO as best effort", () => {
    const missingDataDir = path.join(tempDir(), "missing", "child");

    expect(loadPersistedUser(missingDataDir)).toBeNull();
    expect(() => clearPersistedUser(missingDataDir)).not.toThrow();
    expect(getCachedUser()).toBeNull();
  });

  it("does not persist anonymous users", () => {
    const dataDir = tempDir();

    persistUserCache({ oid: "anonymous" }, dataDir);

    expect(fs.existsSync(path.join(dataDir, "auth-cache.json"))).toBe(false);
    expect(setCachedUser(null)).toBeNull();
  });
});
