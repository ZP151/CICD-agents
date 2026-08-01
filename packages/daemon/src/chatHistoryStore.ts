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
  // A desktop Turn is local-first.  Waiting for a cloud session fetch here
  // placed Cosmos authentication/container initialization on the path from a
  // model-authored opening narrative to its first actual command.  A slow or
  // offline cloud mirror must never freeze an active local conversation.
  const local = loadStoreSync()[sessionId] ?? null;
  if (local) return local;

  const cosmos = getCosmosStore();
  if (cosmos) {
    try {
      const doc = await withinCloudReadBudget(cosmos.load(sessionId));
      if (doc) {
        const restored = cosmosToStored(doc);
        writeSessionLocally(restored);
        return restored;
      }
    } catch (err) {
      if (isAzureAuthenticationRequiredError(err)) throw err;
    }
  }
  return null;
}

export async function saveSession(session: StoredSession, now: () => number): Promise<void> {
  normalizeSession(session);
  session.updatedAt = now();
  writeSessionLocally(session);

  // Cloud persistence is a durability mirror, not a prerequisite for the
  // current chat turn.  This keeps local history/reconnect reliable while
  // preventing an unavailable Cosmos endpoint from blocking SSE, tool
  // execution, or terminal Turn completion.
  const cosmos = getCosmosStore();
  if (cosmos) {
    void cosmos.save(storedToCosmos(session)).catch(() => undefined);
  }
}

function writeSessionLocally(session: StoredSession): void {
  const store = loadStoreSync();
  // Planner persistence and SSE Timeline persistence are intentionally
  // independent async paths. Preserve an already-written public Timeline
  // when a slower legacy bubble snapshot is saved afterwards.
  const existing = store[session.id];
  if (existing?.timelineEvents?.length || session.timelineEvents?.length) {
    session.timelineEvents = mergeTimelineEvents(existing?.timelineEvents, session.timelineEvents);
  }
  store[session.id] = session;
  saveStoreSync(store);
}

async function withinCloudReadBudget<T>(promise: Promise<T>, budgetMs = 350): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), budgetMs); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function mergeTimelineEvents(
  previous: StoredSession["timelineEvents"],
  incoming: StoredSession["timelineEvents"],
): NonNullable<StoredSession["timelineEvents"]> {
  const unique = new Map<string, NonNullable<StoredSession["timelineEvents"]>[number]>();
  for (const event of [...(previous ?? []), ...(incoming ?? [])]) {
    unique.set(`${event.turnId}:${event.sequence}`, event);
  }
  return [...unique.values()]
    .sort((left, right) => left.emittedAt - right.emittedAt || left.sequence - right.sequence)
    .slice(-1_600);
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
  // Deletion is intentionally local-first and must not use `loadSession`.
  // `loadSession` correctly makes a bounded Cosmos read for history restore,
  // but even that bounded network hop makes a Delete button feel stuck when
  // the cloud mirror is slow or unavailable. A DELETE is idempotent: remove
  // the local transcript now and mirror the request to Cosmos in the
  // background. If a session exists only in Cosmos, accepting the local
  // deletion is still the right UX; a refresh cannot resurrect it.
  const store = loadStoreSync();
  const localExisted = Boolean(store[sessionId]);
  if (localExisted) {
    delete store[sessionId];
    saveStoreSync(store);
  }
  const cosmos = getCosmosStore();
  if (cosmos) {
    // The local copy is the live desktop transcript. Delete it immediately;
    // cloud mirroring must never keep the UI waiting on Cosmos availability.
    // Calling an async Cosmos method still runs its synchronous client/setup
    // work before it returns a Promise, so defer the call itself rather than
    // merely declining to await its result.
    setTimeout(() => {
      void cosmos.delete(sessionId).catch(() => undefined);
    }, 0);
  }
  return localExisted || Boolean(cosmos);
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
