import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  createProjectLink as apiCreateProjectLink,
  deleteProjectLink as apiDeleteProjectLink,
  fetchHealth,
  listProjectLinks,
  updateProjectLink as apiUpdateProjectLink,
  type ProjectLink,
  type ProjectLinkInput,
} from "../api.js";
import { withProjectLinkDefaults, withProjectLinkInputDefaults } from "../projectLinks.js";

const PROJECT_LINKS_LS_KEY = "mergepilot_project_links_v1";

function lsProjectLinks(): ProjectLink[] {
  try {
    const raw = JSON.parse(localStorage.getItem(PROJECT_LINKS_LS_KEY) ?? "[]") as Array<
      Partial<ProjectLink>
    >;
    return raw.map(withProjectLinkDefaults);
  } catch {
    return [];
  }
}

function syncProjectLinksToLocalStorage(projectLinks: ProjectLink[]) {
  // Credential containment (ADR-0005): the daemon response may carry a
  // runtime-injected PAT; localStorage is a persistent store, so strip the
  // value before writing. Requests re-send "" and the daemon re-injects.
  const redacted = projectLinks.map((link) =>
    withProjectLinkDefaults({ ...link, adoPat: "" }),
  );
  localStorage.setItem(PROJECT_LINKS_LS_KEY, JSON.stringify(redacted));
}

interface AppData {
  projectLinks: ProjectLink[];
  projectLinksLoading: boolean;
  cloudProjectLinkStore: boolean;
  usingDaemon: boolean;
  refreshProjectLinks: () => Promise<void>;
  createProjectLink: (data: ProjectLinkInput) => Promise<ProjectLink>;
  updateProjectLink: (id: string, data: Partial<ProjectLinkInput>) => Promise<ProjectLink>;
  deleteProjectLink: (id: string) => Promise<void>;
}

const AppDataContext = createContext<AppData>({
  projectLinks: [],
  projectLinksLoading: false,
  cloudProjectLinkStore: false,
  usingDaemon: false,
  refreshProjectLinks: async () => {},
  createProjectLink: async () => {
    throw new Error("not ready");
  },
  updateProjectLink: async () => {
    throw new Error("not ready");
  },
  deleteProjectLink: async () => {},
});

export function useAppData(): AppData {
  return useContext(AppDataContext);
}

export function AppDataProvider({
  children,
  daemonReady,
}: {
  children: ReactNode;
  daemonReady: boolean;
}) {
  const [projectLinks, setProjectLinks] = useState<ProjectLink[]>(() => lsProjectLinks());
  const [projectLinksLoading, setProjectLinksLoading] = useState(() => projectLinks.length === 0);
  const [cloudProjectLinkStore, setCloudProjectLinkStore] = useState(false);
  const [usingDaemon, setUsingDaemon] = useState(false);
  const loadedRef = useRef(false);

  const refreshProjectLinks = useCallback(async () => {
    setProjectLinksLoading(projectLinks.length === 0);
    try {
      const remote = (await listProjectLinks()).map(withProjectLinkDefaults);
      setProjectLinks(remote);
      setUsingDaemon(true);
      syncProjectLinksToLocalStorage(remote);
      fetchHealth()
        .then((health) =>
          setCloudProjectLinkStore(!!health.cloudProjectLinkStore),
        )
        .catch(() => {});
    } catch {
      setProjectLinks(lsProjectLinks());
      setUsingDaemon(false);
    } finally {
      setProjectLinksLoading(false);
    }
  }, [projectLinks.length]);

  useEffect(() => {
    if (!daemonReady || loadedRef.current) return;
    loadedRef.current = true;
    void refreshProjectLinks();
  }, [daemonReady, refreshProjectLinks]);

  const createProjectLink = useCallback(
    async (data: ProjectLinkInput): Promise<ProjectLink> => {
      try {
        const projectLink = withProjectLinkDefaults(
          await apiCreateProjectLink(withProjectLinkInputDefaults(data)),
        );
        setUsingDaemon(true);
        setProjectLinks((previous) => {
          const next = [...previous, projectLink];
          syncProjectLinksToLocalStorage(next);
          return next;
        });
        return projectLink;
      } catch (error) {
        if (usingDaemon) throw error;
        const now = Date.now() / 1000;
        const projectLink = {
          ...withProjectLinkInputDefaults(data),
          id: crypto.randomUUID(),
          createdAt: now,
          updatedAt: now,
        };
        setProjectLinks((previous) => {
          const next = [...previous, projectLink];
          syncProjectLinksToLocalStorage(next);
          return next;
        });
        return projectLink;
      }
    },
    [usingDaemon],
  );

  const updateProjectLink = useCallback(
    async (id: string, data: Partial<ProjectLinkInput>): Promise<ProjectLink> => {
      try {
        const updated = withProjectLinkDefaults(await apiUpdateProjectLink(id, data));
        setUsingDaemon(true);
        setProjectLinks((previous) => {
          const next = previous.map((projectLink) =>
            projectLink.id === id ? updated : projectLink,
          );
          syncProjectLinksToLocalStorage(next);
          return next;
        });
        return updated;
      } catch (error) {
        if (usingDaemon) throw error;
        const existing = projectLinks.find((projectLink) => projectLink.id === id);
        if (!existing) throw new Error("Project Link not found");
        const updated = {
          ...withProjectLinkDefaults({ ...existing, ...data }),
          id,
          updatedAt: Date.now() / 1000,
        };
        setProjectLinks((previous) => {
          const next = previous.map((projectLink) =>
            projectLink.id === id ? updated : projectLink,
          );
          syncProjectLinksToLocalStorage(next);
          return next;
        });
        return updated;
      }
    },
    [projectLinks, usingDaemon],
  );

  const deleteProjectLink = useCallback(async (id: string): Promise<void> => {
    try {
      await apiDeleteProjectLink(id);
    } catch {
      // Local-only delete still removes from state.
    }
    setProjectLinks((previous) => {
      const next = previous.filter((projectLink) => projectLink.id !== id);
      syncProjectLinksToLocalStorage(next);
      return next;
    });
  }, []);

  return (
    <AppDataContext.Provider
      value={{
        projectLinks,
        projectLinksLoading,
        cloudProjectLinkStore,
        usingDaemon,
        refreshProjectLinks,
        createProjectLink,
        updateProjectLink,
        deleteProjectLink,
      }}
    >
      {children}
    </AppDataContext.Provider>
  );
}
