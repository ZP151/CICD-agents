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

function isCloudProjectLinkStoreUnavailable(err: unknown): boolean {
  if (isAzureAuthenticationRequiredError(err)) return true;
  const message = err instanceof Error ? err.message : String(err ?? "");
  return /AADSTS65001|consent|Automatic authentication has been disabled|CredentialUnavailable|InteractiveBrowserCredential|No cached account|requires? authentication|login required|network error|getaddrinfo|ENOTFOUND|ECONNREFUSED|ETIMEDOUT/i.test(
    message,
  );
}

async function withLocalProjectLinkFallback<T>(
  cloudOperation: () => Promise<T>,
  localFallback: () => T | Promise<T>,
): Promise<T> {
  // Project Links are selected on the first interactive screen and therefore
  // cannot wait indefinitely for Azure Table authentication/container
  // discovery. Preserve a healthy cloud store as the source of truth, but
  // fall back to the local cache after a short fixed budget.
  const localPromise = Promise.resolve(localFallback());
  try {
    const cloud = await withinCloudProjectLinkBudget(cloudOperation());
    return cloud ?? await localPromise;
  } catch (err) {
    if (!isCloudProjectLinkStoreUnavailable(err)) throw err;
    return localPromise;
  }
}

async function withinCloudProjectLinkBudget<T>(promise: Promise<T>, budgetMs = 350): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<undefined>((resolve) => { timer = setTimeout(() => resolve(undefined), budgetMs); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
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
    if (settings.secretSource === "local_env") return null;
    const url = settings.azureKeyVaultUrl;
    if (!url) return null;
    if (kvCache?.url !== url) kvCache = { url, kv: new KeyVaultSecrets(url) };
    return kvCache.kv;
  };

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
        // The session snapshot no longer carries pipeline/MCP/template fields
        // (removed in Phase 3); the store type keeps them as legacy read
        // defaults and every consumer resolves "" through withLegacyReadDefaults.
        adoPipelineId: "",
        adoPipelineName: "",
        adoMcpCommand: "",
        adoMcpAuthentication: "",
        projectTemplate: "",
        ...inlineProjectLink,
      };
    }

    const tableStore = getTableStore();
    if (tableStore) {
      return withLocalProjectLinkFallback(
        async () => {
        const cloudProjectLink = await tableStore.get(projectLinkId);
        return cloudProjectLink ? await injectAdoPat(cloudProjectLink) : null;
        },
        () => getProjectLink(settings.dataDir, projectLinkId),
      );
    }
    return getProjectLink(settings.dataDir, projectLinkId);
  }

  async function listProjectLinksForStore(): Promise<Awaited<ReturnType<typeof listProjectLinks>>> {
    const tableStore = getTableStore();
    if (tableStore) {
      return withLocalProjectLinkFallback(
        async () => {
          const projectLinks = await tableStore.list();
          return Promise.all(projectLinks.map(injectAdoPat));
        },
        () => listProjectLinks(settings.dataDir),
      );
    }
    return listProjectLinks(settings.dataDir);
  }

  async function getProjectLinkForStore(
    projectLinkId: string,
  ): Promise<Awaited<ReturnType<typeof getProjectLink>> | null> {
    const tableStore = getTableStore();
    if (tableStore) {
      return withLocalProjectLinkFallback(
        async () => {
          const projectLink = await tableStore.get(projectLinkId);
          return projectLink ? injectAdoPat(projectLink) : null;
        },
        () => getProjectLink(settings.dataDir, projectLinkId),
      );
    }
    return getProjectLink(settings.dataDir, projectLinkId);
  }

  async function createProjectLinkForStore(
    data: ProjectLinkInput,
  ): Promise<Awaited<ReturnType<typeof createProjectLink>>> {
    // Create locally first. A remote create generates a second id and cannot
    // safely be left running after a timeout; explicit migration owns that
    // durable cloud synchronization path.
    return createProjectLink(settings.dataDir, data);
  }

  async function updateProjectLinkForStore(
    projectLinkId: string,
    data: Partial<ProjectLinkInput>,
  ): Promise<Awaited<ReturnType<typeof updateProjectLink>> | null> {
    const tableStore = getTableStore();
    if (tableStore) {
      return withLocalProjectLinkFallback(
        async () => {
          const kv = getKvSecrets();
          const cloudData = { ...data };
          if (cloudData.adoPat !== undefined && kv) {
            if (cloudData.adoPat) await kv.setAdoPat(projectLinkId, cloudData.adoPat);
            cloudData.adoPat = "";
          }
          const updated = await tableStore.update(projectLinkId, cloudData);
          return updated ? injectAdoPat(updated) : null;
        },
        () => updateProjectLink(settings.dataDir, projectLinkId, data),
      );
    }
    return updateProjectLink(settings.dataDir, projectLinkId, data);
  }

  async function deleteProjectLinkForStore(projectLinkId: string): Promise<boolean> {
    const tableStore = getTableStore();
    if (tableStore) {
      return withLocalProjectLinkFallback(
        async () => {
          const kv = getKvSecrets();
          if (kv) await kv.deleteAdoPat(projectLinkId);
          return tableStore.delete(projectLinkId);
        },
        () => deleteProjectLink(settings.dataDir, projectLinkId),
      );
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
