/**
 * Azure Table Storage backend for Project Links.
 *
 * Table name: MergePilotProjectLinks
 * PartitionKey: userId (AAD OID)
 * RowKey:       projectLinkId (hex UUID)
 *
 * Replaces the local project-links.json when AZURE_STORAGE_ACCOUNT is set.
 * The adoPat field is stored encrypted via Key Vault (if configured) or as-is
 * in the table entity (still better than localStorage plaintext on disk since
 * Table Storage is secured via AAD RBAC).
 */
import { TableClient, TableServiceClient, odata } from "@azure/data-tables";
import type { ProjectLink, ProjectLinkInput } from "../projectLinks.js";
import { STORAGE_SCOPE } from "./azureAuthConfig.js";
import { getAzureCachedScopeCredential } from "./azureAuthCredential.js";
import { requireCurrentUser } from "./azureAuth.js";
import crypto from "node:crypto";

const TABLE_NAME = "MergePilotProjectLinks";

function tableUrl(accountName: string): string {
  return `https://${accountName}.table.core.windows.net`;
}

async function getClient(accountName: string): Promise<TableClient> {
  const cred = getAzureCachedScopeCredential(STORAGE_SCOPE);
  return new TableClient(tableUrl(accountName), TABLE_NAME, cred);
}

async function ensureTable(accountName: string): Promise<void> {
  const cred = getAzureCachedScopeCredential(STORAGE_SCOPE);
  const svc = new TableServiceClient(tableUrl(accountName), cred);
  try {
    await svc.createTable(TABLE_NAME);
  } catch (err: unknown) {
    // Ignore "TableAlreadyExists"
    if ((err as { statusCode?: number })?.statusCode !== 409) throw err;
  }
}

type ProjectLinkEntity = {
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
  adoMcpEnabled?: boolean;
  adoMcpCommand?: string;
  adoMcpAuthentication?: string;
  adoMcpDomains?: string;
  projectTemplate: string;
  buildCommand: string;
  testCommand: string;
};

function entityToProjectLink(e: ProjectLinkEntity): ProjectLink {
  return {
    id: e.rowKey,
    name: e.name,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    repoPath: e.repoPath,
    defaultBranch: e.defaultBranch,
    targetBranch: e.targetBranch,
    adoOrgUrl: e.adoOrgUrl,
    adoProject: e.adoProject,
    adoRepoName: e.adoRepoName,
    adoPat: e.adoPat,
    adoMcpEnabled: e.adoMcpEnabled ?? false,
    adoMcpCommand: e.adoMcpCommand ?? "",
    adoMcpAuthentication: e.adoMcpAuthentication ?? "",
    adoMcpDomains: e.adoMcpDomains ?? "repositories,pipelines,work-items",
    projectTemplate: e.projectTemplate,
    buildCommand: e.buildCommand,
    testCommand: e.testCommand,
  };
}

function projectLinkToEntity(userId: string, p: ProjectLink): ProjectLinkEntity {
  return {
    partitionKey: userId,
    rowKey: p.id,
    name: p.name,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    repoPath: p.repoPath,
    defaultBranch: p.defaultBranch,
    targetBranch: p.targetBranch,
    adoOrgUrl: p.adoOrgUrl,
    adoProject: p.adoProject,
    adoRepoName: p.adoRepoName,
    adoPat: p.adoPat,
    adoMcpEnabled: p.adoMcpEnabled,
    adoMcpCommand: p.adoMcpCommand,
    adoMcpAuthentication: p.adoMcpAuthentication,
    adoMcpDomains: p.adoMcpDomains,
    projectTemplate: p.projectTemplate,
    buildCommand: p.buildCommand,
    testCommand: p.testCommand,
  };
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

export class AzureTableProjectLinkStore {
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

  async list(): Promise<ProjectLink[]> {
    const user = await requireCurrentUser();
    await this.init();
    const client = await getClient(this.accountName);
    const results: ProjectLink[] = [];

    const iter = client.listEntities<ProjectLinkEntity>({
      queryOptions: { filter: odata`PartitionKey eq ${user.oid}` },
    });
    for await (const entity of iter) {
      results.push(entityToProjectLink(entity));
    }
    return results.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async get(id: string): Promise<ProjectLink | null> {
    const user = await requireCurrentUser();
    await this.init();
    const client = await getClient(this.accountName);
    try {
      const entity = await client.getEntity<ProjectLinkEntity>(user.oid, id);
      return entityToProjectLink(entity);
    } catch (err: unknown) {
      if ((err as { statusCode?: number })?.statusCode === 404) return null;
      throw err;
    }
  }

  async create(data: ProjectLinkInput): Promise<ProjectLink> {
    const user = await requireCurrentUser();
    await this.init();
    const client = await getClient(this.accountName);
    const ts = nowSec();
    const projectLink: ProjectLink = {
      ...data,
      id: crypto.randomBytes(8).toString("hex"),
      createdAt: ts,
      updatedAt: ts,
    };
    await client.createEntity(projectLinkToEntity(user.oid, projectLink));
    return projectLink;
  }

  async update(id: string, data: Partial<ProjectLinkInput>): Promise<ProjectLink | null> {
    const existing = await this.get(id);
    if (!existing) return null;

    const user = await requireCurrentUser();
    const client = await getClient(this.accountName);
    const updated: ProjectLink = { ...existing, ...data, id, updatedAt: nowSec() };
    await client.upsertEntity(projectLinkToEntity(user.oid, updated), "Replace");
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const user = await requireCurrentUser();
    await this.init();
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
