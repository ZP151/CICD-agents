import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { recoverStaleMsalCacheLock } from "../src/store/azureAuthMsal.js";

const roots: string[] = [];

function cachePath(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mergepilot-msal-lock-"));
  roots.push(root);
  return path.join(root, "mergepilot");
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("recoverStaleMsalCacheLock", () => {
  it("removes only a stale lock whose recorded owner is no longer alive", () => {
    const target = cachePath();
    const lock = `${target}.lockfile`;
    fs.writeFileSync(lock, "999999", "utf8");
    const old = new Date(Date.now() - 60_000);
    fs.utimesSync(lock, old, old);

    expect(recoverStaleMsalCacheLock(target, { ownerIsAlive: () => false })).toBe(true);
    expect(fs.existsSync(lock)).toBe(false);
  });

  it("does not remove a recent lock or one held by a live process", () => {
    const recentTarget = cachePath();
    const recentLock = `${recentTarget}.lockfile`;
    fs.writeFileSync(recentLock, "999999", "utf8");
    expect(recoverStaleMsalCacheLock(recentTarget, { ownerIsAlive: () => false })).toBe(false);
    expect(fs.existsSync(recentLock)).toBe(true);

    const liveTarget = cachePath();
    const liveLock = `${liveTarget}.lockfile`;
    fs.writeFileSync(liveLock, "12345", "utf8");
    const old = new Date(Date.now() - 60_000);
    fs.utimesSync(liveLock, old, old);
    expect(recoverStaleMsalCacheLock(liveTarget, { ownerIsAlive: () => true })).toBe(false);
    expect(fs.existsSync(liveLock)).toBe(true);
  });
});
