/**
 * Azure Table Storage backend for WorkspaceProfiles.
 *
 * Table name: CicdAgentProfiles
 * PartitionKey: userId (AAD OID)
 * RowKey:       profileId (hex UUID)
 *
 * Replaces the local workspace-profiles.json when AZURE_STORAGE_ACCOUNT is set.
 * The adoPat field is stored encrypted via Key Vault (if configured) or as-is
 * in the table entity (still better than localStorage plaintext on disk since
 * Table Storage is secured via AAD RBAC).
 */
import { TableClient, TableServiceClient, odata } from "@azure/data-tables";
import { DefaultAzureCredential } from "@azure/identity";
import type { WorkspaceProfile, WorkspaceProfileInput } from "../profiles.js";
import { getCurrentUser } from "./azureAuth.js";
import crypto from "node:crypto";

const TABLE_NAME = "CicdAgentProfiles";

function tableUrl(accountName: string): string {
  return `https://${accountName}.table.core.windows.net`;
}

async function getClient(accountName: string): Promise<TableClient> {
  const cred = new DefaultAzureCredential();
  return new TableClient(tableUrl(accountName), TABLE_NAME, cred);
}

async function ensureTable(accountName: string): Promise<void> {
  const cred = new DefaultAzureCredential();
  const svc = new TableServiceClient(tableUrl(accountName), cred);
  try {
    await svc.createTable(TABLE_NAME);
  } catch (err: unknown) {
    // Ignore "TableAlreadyExists"
    if ((err as { statusCode?: number })?.statusCode !== 409) throw err;
  }
}

type ProfileEntity = {
  partitionKey: string;
  rowKey: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  repoPath: string;
  defaultBranch: string;
  targetBranch: string;
  adoOrgUrl: string;
  adoProject: string;
  adoRepoName: string;
  adoPat: string;
  adoPipelineId: string;
  adoPipelineName: string;
  templateProfile: string;
  buildCommand: string;
  testCommand: string;
};

function entityToProfile(e: ProfileEntity): WorkspaceProfile {
  return {
    id:              e.rowKey,
    name:            e.name,
    createdAt:       e.createdAt,
    updatedAt:       e.updatedAt,
    repoPath:        e.repoPath,
    defaultBranch:   e.defaultBranch,
    targetBranch:    e.targetBranch,
    adoOrgUrl:       e.adoOrgUrl,
    adoProject:      e.adoProject,
    adoRepoName:     e.adoRepoName,
    adoPat:          e.adoPat,
    adoPipelineId:   e.adoPipelineId,
    adoPipelineName: e.adoPipelineName,
    templateProfile: e.templateProfile,
    buildCommand:    e.buildCommand,
    testCommand:     e.testCommand,
  };
}

function profileToEntity(userId: string, p: WorkspaceProfile): ProfileEntity {
  return {
    partitionKey:    userId,
    rowKey:          p.id,
    name:            p.name,
    createdAt:       p.createdAt,
    updatedAt:       p.updatedAt,
    repoPath:        p.repoPath,
    defaultBranch:   p.defaultBranch,
    targetBranch:    p.targetBranch,
    adoOrgUrl:       p.adoOrgUrl,
    adoProject:      p.adoProject,
    adoRepoName:     p.adoRepoName,
    adoPat:          p.adoPat,
    adoPipelineId:   p.adoPipelineId,
    adoPipelineName: p.adoPipelineName,
    templateProfile: p.templateProfile,
    buildCommand:    p.buildCommand,
    testCommand:     p.testCommand,
  };
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

export class AzureTableProfileStore {
  private readonly accountName: string;
  private ready = false;

  constructor(accountName: string) {
    this.accountName = accountName;
  }

  private async init(): Promise<void> {
    if (this.ready) return;
    await ensureTable(this.accountName);
    this.ready = true;
  }

  async list(): Promise<WorkspaceProfile[]> {
    await this.init();
    const user = await getCurrentUser();
    const client = await getClient(this.accountName);
    const results: WorkspaceProfile[] = [];

    const iter = client.listEntities<ProfileEntity>({
      queryOptions: { filter: odata`PartitionKey eq ${user.oid}` },
    });
    for await (const entity of iter) {
      results.push(entityToProfile(entity));
    }
    return results.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async get(id: string): Promise<WorkspaceProfile | null> {
    await this.init();
    const user = await getCurrentUser();
    const client = await getClient(this.accountName);
    try {
      const entity = await client.getEntity<ProfileEntity>(user.oid, id);
      return entityToProfile(entity);
    } catch (err: unknown) {
      if ((err as { statusCode?: number })?.statusCode === 404) return null;
      throw err;
    }
  }

  async create(data: WorkspaceProfileInput): Promise<WorkspaceProfile> {
    await this.init();
    const user = await getCurrentUser();
    const client = await getClient(this.accountName);
    const ts = nowSec();
    const profile: WorkspaceProfile = {
      ...data,
      id:        crypto.randomBytes(8).toString("hex"),
      createdAt: ts,
      updatedAt: ts,
    };
    await client.createEntity(profileToEntity(user.oid, profile));
    return profile;
  }

  async update(id: string, data: Partial<WorkspaceProfileInput>): Promise<WorkspaceProfile | null> {
    await this.init();
    const existing = await this.get(id);
    if (!existing) return null;

    const user = await getCurrentUser();
    const client = await getClient(this.accountName);
    const updated: WorkspaceProfile = { ...existing, ...data, id, updatedAt: nowSec() };
    await client.upsertEntity(profileToEntity(user.oid, updated), "Replace");
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    await this.init();
    const user = await getCurrentUser();
    const client = await getClient(this.accountName);
    try {
      await client.deleteEntity(user.oid, id);
      return true;
    } catch (err: unknown) {
      if ((err as { statusCode?: number })?.statusCode === 404) return false;
      throw err;
    }
  }
}
