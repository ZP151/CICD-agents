import fs from "node:fs";
import path from "node:path";
import {
  CosmosSessionStore,
  getSettings,
  isAzureAuthenticationRequiredError,
  resetCosmosClient,
} from "@mergepilot/core";
import {
  chatHistoryEntryFromSession,
  cosmosToStored,
  normalizeSession,
  normalizeStore,
  sortChatHistoryEntries,
  storedToCosmos,
} from "./chatHistorySerialization.js";
import type { ChatHistoryEntry, HistoryStore, StoredSession } from "./chatHistoryTypes.js";

export type {
  ChatHistoryEntry,
  HistoryStore,
  InlineProjectLink,
  StoredBubble,
  StoredSession,
} from "./chatHistoryTypes.js";
export {
  chatHistoryEntryFromSession,
  storedSessionProjectLinkId,
} from "./chatHistorySerialization.js";

let cosmosStore: CosmosSessionStore | null = null;
let cosmosEndpoint: string | null = null;

export function getCosmosStore(): CosmosSessionStore | null {
  const settings = getSettings();
  const endpoint = settings.azureCosmosEndpoint;
  if (!endpoint) return null;
  if (cosmosEndpoint !== endpoint) {
    resetCosmosClient();
    cosmosEndpoint = endpoint;
    cosmosStore = new CosmosSessionStore(endpoint, settings.azureCosmosSessionTtlSec);
  }
  return cosmosStore;
}

function historyPath(): string {
  return path.join(getSettings().dataDir, "chat-history.json");
}

export function loadStoreSync(): HistoryStore {
  const p = historyPath();
  if (!fs.existsSync(p)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(p, "utf8")) as HistoryStore;
    return normalizeStore(parsed);
  } catch {
    return {};
  }
}

export function saveStoreSync(store: HistoryStore): void {
  const p = historyPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(normalizeStore(store), null, 2), "utf8");
}

export async function loadSession(sessionId: string): Promise<StoredSession | null> {
  const cosmos = getCosmosStore();
  if (cosmos) {
    try {
      const doc = await cosmos.load(sessionId);
      if (doc) return cosmosToStored(doc);
    } catch (err) {
      if (isAzureAuthenticationRequiredError(err)) throw err;
    }
  }
  return loadStoreSync()[sessionId] ?? null;
}

export async function saveSession(session: StoredSession, now: () => number): Promise<void> {
  normalizeSession(session);
  session.updatedAt = now();
  const cosmos = getCosmosStore();
  if (cosmos) {
    try {
      await cosmos.save(storedToCosmos(session));
      return;
    } catch (err) {
      if (isAzureAuthenticationRequiredError(err)) throw err;
    }
  }
  const store = loadStoreSync();
  store[session.id] = session;
  saveStoreSync(store);
}

export async function listRecentSessions(limit: number): Promise<ChatHistoryEntry[]> {
  const cosmos = getCosmosStore();
  if (cosmos) {
    try {
      return await cosmos.listRecent(limit);
    } catch {
      // fall through to local
    }
  }
  return Object.values(loadStoreSync())
    .map(chatHistoryEntryFromSession)
    .sort(sortChatHistoryEntries)
    .slice(0, limit);
}

export async function deleteStoredSession(sessionId: string): Promise<boolean> {
  const existed = Boolean(await loadSession(sessionId));
  const cosmos = getCosmosStore();
  if (cosmos) {
    try {
      await cosmos.delete(sessionId);
      return existed;
    } catch {
      // fall through to local
    }
  }
  const store = loadStoreSync();
  if (!store[sessionId]) return existed;
  delete store[sessionId];
  saveStoreSync(store);
  return true;
}

export async function listStoredSessionsForActivity(limit: number): Promise<StoredSession[]> {
  const sessions: StoredSession[] = [];
  const cosmos = getCosmosStore();
  if (cosmos) {
    try {
      const recent = await cosmos.listRecent(Math.max(limit * 2, 30));
      for (const item of recent) {
        const session = await loadSession(item.sessionId);
        if (session) sessions.push(session);
      }
    } catch {
      // fall through to local
    }
  }
  if (sessions.length === 0) {
    sessions.push(...Object.values(loadStoreSync()));
  }
  return sessions;
}
