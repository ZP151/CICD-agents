/**
 * Azure Cosmos DB for NoSQL — chat session persistence.
 *
 * Database:  cicd-agent  (created on first use)
 * Container: chat-sessions
 * Partition: /userId
 * TTL:       7_776_000 s = 90 days (configurable via COSMOS_SESSION_TTL_SEC)
 *
 * Documents mirror the local StoredSession shape with an added `userId` field.
 * Fallback: if Cosmos is unavailable, callers should catch and use the local JSON store.
 */
import { CosmosClient, type ContainerRequest } from "@azure/cosmos";
import { DefaultAzureCredential } from "@azure/identity";
import { getCurrentUser } from "./azureAuth.js";

const DB_NAME = "cicd-agent";
const CONTAINER_NAME = "chat-sessions";
const DEFAULT_TTL = 7_776_000; // 90 days

export interface CosmosStoredSession {
  id: string;           // Cosmos document id = sessionId
  userId: string;       // AAD OID — partition key
  createdAt: number;
  updatedAt: number;
  repoPath: string;
  profileId?: string;
  messages: unknown[];
  bubbles: unknown[];
  approvalProposal?: unknown;
  /** @deprecated Use approvalProposal. */
  pendingAction?: unknown;
  workflowState?: unknown;
  llmConfig?: unknown;
  inlineProfile?: unknown;
  ttl?: number;         // auto-expire via Cosmos TTL
}

let _client: CosmosClient | null = null;
let _ready = false;

function makeClient(endpoint: string): CosmosClient {
  if (!_client) {
    _client = new CosmosClient({ endpoint, aadCredentials: new DefaultAzureCredential() });
  }
  return _client;
}

async function ensureContainer(endpoint: string, ttlSec: number): Promise<void> {
  if (_ready) return;
  const client = makeClient(endpoint);
  const { database } = await client.databases.createIfNotExists({ id: DB_NAME });
  const containerDef: ContainerRequest = {
    id: CONTAINER_NAME,
    partitionKey: { paths: ["/userId"] },
    defaultTtl: ttlSec,
    // Composite index required for ORDER BY on updatedAt.
    // Cosmos DB ignores duplicate indexingPolicy on createIfNotExists.
    indexingPolicy: {
      automatic: true,
      indexingMode: "consistent",
      includedPaths: [{ path: "/*" }],
      excludedPaths: [{ path: "/messages/*" }, { path: "/bubbles/*" }],
      compositeIndexes: [
        [
          { path: "/userId", order: "ascending" },
          { path: "/updatedAt", order: "descending" },
        ],
      ],
    },
  };
  await database.containers.createIfNotExists(containerDef);
  _ready = true;
}

export class CosmosSessionStore {
  private readonly endpoint: string;
  private readonly ttlSec: number;

  constructor(endpoint: string, ttlSec = DEFAULT_TTL) {
    this.endpoint = endpoint;
    this.ttlSec = ttlSec;
  }

  private container() {
    return makeClient(this.endpoint).database(DB_NAME).container(CONTAINER_NAME);
  }

  private async init(): Promise<void> {
    await ensureContainer(this.endpoint, this.ttlSec);
  }

  async load(sessionId: string): Promise<CosmosStoredSession | null> {
    await this.init();
    const user = await getCurrentUser();
    try {
      const { resource } = await this.container()
        .item(sessionId, user.oid)
        .read<CosmosStoredSession>();
      return resource ?? null;
    } catch (err: unknown) {
      if ((err as { code?: number })?.code === 404) return null;
      throw err;
    }
  }

  async save(session: Omit<CosmosStoredSession, "userId" | "updatedAt">): Promise<void> {
    await this.init();
    const user = await getCurrentUser();
    const doc: CosmosStoredSession = {
      ...session,
      userId:    user.oid,
      updatedAt: Math.floor(Date.now() / 1000),
      ttl:       this.ttlSec,
    };
    await this.container().items.upsert(doc);
  }

  async delete(sessionId: string): Promise<void> {
    await this.init();
    const user = await getCurrentUser();
    try {
      await this.container().item(sessionId, user.oid).delete();
    } catch (err: unknown) {
      if ((err as { code?: number })?.code !== 404) throw err;
    }
  }

  async listRecent(limit = 30): Promise<Array<{ sessionId: string; preview: string; createdAt: number }>> {
    await this.init();
    const user = await getCurrentUser();
    const query = {
      query: `SELECT c.id, c.createdAt, ARRAY_SLICE(c.messages, -1) AS lastMsg
              FROM c
              WHERE c.userId = @uid
              ORDER BY c.updatedAt DESC
              OFFSET 0 LIMIT @lim`,
      parameters: [
        { name: "@uid", value: user.oid },
        { name: "@lim", value: limit },
      ],
    };
    type Row = { id: string; createdAt: number; lastMsg: Array<{ content?: string }> };
    const { resources } = await this.container().items.query<Row>(query).fetchAll();
    return resources.map((r) => ({
      sessionId: r.id,
      createdAt: r.createdAt,
      preview:   (r.lastMsg?.[0]?.content ?? "").slice(0, 100),
    }));
  }
}

export function resetCosmosClient(): void {
  _client = null;
  _ready = false;
}
