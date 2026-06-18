import {
  AzureTableProjectLinkStore,
  createProjectLink,
  deleteProjectLink,
  getProjectLink,
  isAzureAuthenticationRequiredError,
  KeyVaultSecrets,
  listProjectLinks,
  updateProjectLink,
  type Settings,
  type ProjectLinkInput,
} from "@mergepilot/core";
import type { InlineProjectLink } from "./chatSession.js";

export interface ProjectLinkStoreAdapter {
  getTableStore(): AzureTableProjectLinkStore | null;
  getKvSecrets(): KeyVaultSecrets | null;
  injectAdoPat<T extends { id: string; adoPat: string }>(projectLink: T): Promise<T>;
  getProjectLinkForRequest(
    projectLinkId: string,
    inlineProjectLink?: InlineProjectLink,
  ): Promise<Awaited<ReturnType<typeof getProjectLink>> | null>;
  listProjectLinks(): Promise<Awaited<ReturnType<typeof listProjectLinks>>>;
  getProjectLink(projectLinkId: string): Promise<Awaited<ReturnType<typeof getProjectLink>> | null>;
  createProjectLink(data: ProjectLinkInput): Promise<Awaited<ReturnType<typeof createProjectLink>>>;
  updateProjectLink(
    projectLinkId: string,
    data: Partial<ProjectLinkInput>,
  ): Promise<Awaited<ReturnType<typeof updateProjectLink>> | null>;
  deleteProjectLink(projectLinkId: string): Promise<boolean>;
  migrateLocalProjectLinksToCloud(): Promise<
    | { ok: false; error: "cloud_not_configured"; message: string }
    | { ok: true; migrated: number; skipped: number; total: number }
  >;
}

export function createProjectLinkStoreAdapter(settings: Settings): ProjectLinkStoreAdapter {
  let tableCache: { url: string; store: AzureTableProjectLinkStore } | null = null;
  const getTableStore = (): AzureTableProjectLinkStore | null => {
    const url = settings.azureStorageAccount;
    if (!url) return null;
    if (tableCache?.url !== url) tableCache = { url, store: new AzureTableProjectLinkStore(url) };
    return tableCache.store;
  };

  let kvCache: { url: string; kv: KeyVaultSecrets } | null = null;
  const getKvSecrets = (): KeyVaultSecrets | null => {
    const url = settings.azureKeyVaultUrl;
    if (!url) return null;
    if (kvCache?.url !== url) kvCache = { url, kv: new KeyVaultSecrets(url) };
    return kvCache.kv;
  };

  async function resolveAdoPat(projectLinkId: string, bodyPat: string): Promise<string> {
    const kv = getKvSecrets();
    if (kv && bodyPat) {
      await kv.setAdoPat(projectLinkId, bodyPat);
      return "";
    }
    return bodyPat;
  }

  async function injectAdoPat<T extends { id: string; adoPat: string }>(projectLink: T): Promise<T> {
    const kv = getKvSecrets();
    if (kv) {
      const pat = await kv.getAdoPat(projectLink.id);
      return { ...projectLink, adoPat: pat ?? "" };
    }
    return projectLink;
  }

  async function getProjectLinkForRequest(
    projectLinkId: string,
    inlineProjectLink?: InlineProjectLink,
  ): Promise<Awaited<ReturnType<typeof getProjectLink>> | null> {
    if (inlineProjectLink?.adoOrgUrl && inlineProjectLink.adoProject && inlineProjectLink.adoRepoName) {
      return {
        id: projectLinkId,
        name: inlineProjectLink.name ?? "",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ...inlineProjectLink,
      };
    }

    const tableStore = getTableStore();
    if (tableStore) {
      try {
        const cloudProjectLink = await tableStore.get(projectLinkId);
        return cloudProjectLink ? await injectAdoPat(cloudProjectLink) : null;
      } catch (err) {
        if (isAzureAuthenticationRequiredError(err)) throw err;
        return getProjectLink(settings.dataDir, projectLinkId);
      }
    }
    return getProjectLink(settings.dataDir, projectLinkId);
  }

  async function listProjectLinksForStore(): Promise<Awaited<ReturnType<typeof listProjectLinks>>> {
    const tableStore = getTableStore();
    if (tableStore) {
      const projectLinks = await tableStore.list();
      return Promise.all(projectLinks.map(injectAdoPat));
    }
    return listProjectLinks(settings.dataDir);
  }

  async function getProjectLinkForStore(
    projectLinkId: string,
  ): Promise<Awaited<ReturnType<typeof getProjectLink>> | null> {
    const tableStore = getTableStore();
    if (tableStore) {
      const projectLink = await tableStore.get(projectLinkId);
      return projectLink ? injectAdoPat(projectLink) : null;
    }
    return getProjectLink(settings.dataDir, projectLinkId);
  }

  async function createProjectLinkForStore(
    data: ProjectLinkInput,
  ): Promise<Awaited<ReturnType<typeof createProjectLink>>> {
    const tableStore = getTableStore();
    if (tableStore) {
      const safePat = await resolveAdoPat("__new__", data.adoPat);
      const projectLink = await tableStore.create({ ...data, adoPat: safePat });
      const kv = getKvSecrets();
      if (kv && data.adoPat) await kv.setAdoPat(projectLink.id, data.adoPat);
      return injectAdoPat(projectLink);
    }
    return createProjectLink(settings.dataDir, data);
  }

  async function updateProjectLinkForStore(
    projectLinkId: string,
    data: Partial<ProjectLinkInput>,
  ): Promise<Awaited<ReturnType<typeof updateProjectLink>> | null> {
    const tableStore = getTableStore();
    if (tableStore) {
      const kv = getKvSecrets();
      const cloudData = { ...data };
      if (cloudData.adoPat !== undefined && kv) {
        if (cloudData.adoPat) await kv.setAdoPat(projectLinkId, cloudData.adoPat);
        cloudData.adoPat = "";
      }
      const updated = await tableStore.update(projectLinkId, cloudData);
      return updated ? injectAdoPat(updated) : null;
    }
    return updateProjectLink(settings.dataDir, projectLinkId, data);
  }

  async function deleteProjectLinkForStore(projectLinkId: string): Promise<boolean> {
    const tableStore = getTableStore();
    if (tableStore) {
      const kv = getKvSecrets();
      if (kv) await kv.deleteAdoPat(projectLinkId);
      return tableStore.delete(projectLinkId);
    }
    return deleteProjectLink(settings.dataDir, projectLinkId);
  }

  async function migrateLocalProjectLinksToCloud(): Promise<
    | { ok: false; error: "cloud_not_configured"; message: string }
    | { ok: true; migrated: number; skipped: number; total: number }
  > {
    const tableStore = getTableStore();
    if (!tableStore) {
      return {
        ok: false,
        error: "cloud_not_configured",
        message: "AZURE_STORAGE_ACCOUNT is not set. Configure it in Settings first.",
      };
    }
    const local = listProjectLinks(settings.dataDir);
    if (local.length === 0) return { ok: true, migrated: 0, skipped: 0, total: 0 };

    const kv = getKvSecrets();
    let migrated = 0;
    let skipped = 0;
    for (const projectLink of local) {
      try {
        const existing = await tableStore.get(projectLink.id);
        if (existing) {
          skipped++;
          continue;
        }
        if (kv && projectLink.adoPat) {
          await kv.setAdoPat(projectLink.id, projectLink.adoPat);
          await tableStore.create({ ...projectLink, adoPat: "" });
        } else {
          await tableStore.create(projectLink);
        }
        migrated++;
      } catch {
        skipped++;
      }
    }
    return { ok: true, migrated, skipped, total: local.length };
  }

  return {
    getTableStore,
    getKvSecrets,
    injectAdoPat,
    getProjectLinkForRequest,
    listProjectLinks: listProjectLinksForStore,
    getProjectLink: getProjectLinkForStore,
    createProjectLink: createProjectLinkForStore,
    updateProjectLink: updateProjectLinkForStore,
    deleteProjectLink: deleteProjectLinkForStore,
    migrateLocalProjectLinksToCloud,
  };
}
