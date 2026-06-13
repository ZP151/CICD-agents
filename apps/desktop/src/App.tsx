import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { NavLink, Route, Routes, Navigate, useLocation } from "react-router-dom";
import {
  fetchHealth,
  fetchAuthAccounts,
  fetchAuthStatus,
  fetchAuthMe,
  authLoginStream,
  authLogout,
  listProfiles,
  createProfile as apiCreateProfile,
  updateProfile as apiUpdateProfile,
  deleteProfile as apiDeleteProfile,
  type AuthUser,
  type AuthLoginEvent,
  type AuthCachedAccount,
  type AuthBrowserChoice,
  type WorkspaceProfile,
  type WorkspaceProfileInput,
} from "./api.js";
import Dashboard from "./pages/Dashboard.js";
import Repos from "./pages/Repos.js";
import TaskViewer from "./pages/TaskViewer.js";
import ReviewFindings from "./pages/ReviewFindings.js";
import PullRequests from "./pages/PullRequests.js";
import Pipelines from "./pages/Pipelines.js";
import Settings from "./pages/Settings.js";
import Chat from "./pages/Chat.js";
import Profiles from "./pages/Profiles.js";
import { withProjectLinkDefaults, withProjectLinkInputDefaults } from "./projectLinks.js";
import appIconUrl from "./assets/mergepilot-icon.png";

// ─── Global app data (profiles, etc.) ────────────────────────────────────────
// Loaded once after daemon is ready. All pages read from here — no per-page fetching.

const PROFILES_LS_KEY = "cicd_agent_profiles_v1";

function lsProfiles(): WorkspaceProfile[] {
  try {
    const raw = JSON.parse(localStorage.getItem(PROFILES_LS_KEY) ?? "[]") as Array<Partial<WorkspaceProfile>>;
    return raw.map(withProjectLinkDefaults);
  }
  catch { return []; }
}

interface AppData {
  profiles: WorkspaceProfile[];
  profilesLoading: boolean;
  cloudProfileStore: boolean;
  usingDaemon: boolean;
  refreshProfiles: () => Promise<void>;
  createProfile: (d: WorkspaceProfileInput) => Promise<WorkspaceProfile>;
  updateProfile: (id: string, d: Partial<WorkspaceProfileInput>) => Promise<WorkspaceProfile>;
  deleteProfile: (id: string) => Promise<void>;
}

const AppDataContext = createContext<AppData>({
  profiles: [],
  profilesLoading: false,
  cloudProfileStore: false,
  usingDaemon: false,
  refreshProfiles: async () => {},
  createProfile: async () => { throw new Error("not ready"); },
  updateProfile: async () => { throw new Error("not ready"); },
  deleteProfile: async () => {},
});

export function useAppData(): AppData {
  return useContext(AppDataContext);
}

function AppDataProvider({ children, daemonReady }: { children: React.ReactNode; daemonReady: boolean }) {
  const [profiles, setProfiles] = useState<WorkspaceProfile[]>(() => lsProfiles());
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [cloudProfileStore, setCloudProfileStore] = useState(false);
  const [usingDaemon, setUsingDaemon] = useState(false);
  const loadedRef = useRef(false);

  const syncToLs = (ps: WorkspaceProfile[]) => {
    localStorage.setItem(PROFILES_LS_KEY, JSON.stringify(ps.map(withProjectLinkDefaults)));
  };

  const refreshProfiles = useCallback(async () => {
    setProfilesLoading(true);
    try {
      const remote = (await listProfiles()).map(withProjectLinkDefaults);
      setProfiles(remote);
      setUsingDaemon(true);
      syncToLs(remote);
      // Check cloud status once
      fetchHealth().then(h => setCloudProfileStore(!!h.cloudProfileStore)).catch(() => {});
    } catch {
      const local = lsProfiles();
      setProfiles(local);
      setUsingDaemon(false);
    } finally {
      setProfilesLoading(false);
    }
  }, []);

  // Load once when daemon becomes ready
  useEffect(() => {
    if (!daemonReady || loadedRef.current) return;
    loadedRef.current = true;
    void refreshProfiles();
  }, [daemonReady, refreshProfiles]);

  // ── Local-only fallbacks (used when daemon is unreachable) ──────────────────
  function genId() { return crypto.randomUUID(); }
  function lsCreate(data: WorkspaceProfileInput): WorkspaceProfile {
    const now = Date.now() / 1000;
    return { ...withProjectLinkInputDefaults(data), id: genId(), createdAt: now, updatedAt: now };
  }
  function lsUpdate(id: string, data: Partial<WorkspaceProfileInput>, prev: WorkspaceProfile[]): WorkspaceProfile {
    const existing = prev.find(p => p.id === id);
    if (!existing) throw new Error("Profile not found");
    return { ...withProjectLinkDefaults({ ...existing, ...data }), id, updatedAt: Date.now() / 1000 };
  }

  const createProfile = useCallback(async (data: WorkspaceProfileInput): Promise<WorkspaceProfile> => {
    try {
      const p = withProjectLinkDefaults(await apiCreateProfile(withProjectLinkInputDefaults(data)));
      setUsingDaemon(true);
      setProfiles(prev => { const next = [...prev, p]; syncToLs(next); return next; });
      return p;
    } catch (err) {
      if (usingDaemon) throw err;
      const p = lsCreate(data);
      setProfiles(prev => { const next = [...prev, p]; syncToLs(next); return next; });
      return p;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usingDaemon]);

  const updateProfile = useCallback(async (id: string, data: Partial<WorkspaceProfileInput>): Promise<WorkspaceProfile> => {
    try {
      const updated = withProjectLinkDefaults(await apiUpdateProfile(id, data));
      setUsingDaemon(true);
      setProfiles(prev => { const next = prev.map(p => p.id === id ? updated : p); syncToLs(next); return next; });
      return updated;
    } catch (err) {
      if (usingDaemon) throw err;
      const updated = lsUpdate(id, data, profiles);
      setProfiles(prev => { const next = prev.map(p => p.id === id ? updated : p); syncToLs(next); return next; });
      return updated;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles, usingDaemon]);

  const deleteProfile = useCallback(async (id: string): Promise<void> => {
    try { await apiDeleteProfile(id); } catch { /* local-only delete still removes from state */ }
    setProfiles(prev => { const next = prev.filter(p => p.id !== id); syncToLs(next); return next; });
  }, []);

  return (
    <AppDataContext.Provider value={{ profiles, profilesLoading, cloudProfileStore, usingDaemon, refreshProfiles, createProfile, updateProfile, deleteProfile }}>
      {children}
    </AppDataContext.Provider>
  );
}

// ─── Daemon readiness ─────────────────────────────────────────────────────────

type DaemonState = "starting" | "ready" | "failed";

interface DaemonInfo {
  state: DaemonState;
  llmConfigured: boolean;
  cloudProfileStore: boolean;
  cloudSecrets: boolean;
  cloudSessions: boolean;
}

function useDaemonReady(): DaemonInfo {
  const [info, setInfo] = useState<DaemonInfo>({
    state: "starting",
    llmConfigured: false,
    cloudProfileStore: false,
    cloudSecrets: false,
    cloudSessions: false,
  });
  const attempts = useRef(0);

  useEffect(() => {
    // Only poll in Tauri (installed app). In the browser / tauri dev the daemon
    // is already running before the frontend loads.
    if (!("__TAURI__" in window)) {
      setInfo({ state: "ready", llmConfigured: true, cloudProfileStore: false, cloudSecrets: false, cloudSessions: false });
      return;
    }

    let cancelled = false;
    const MAX = 30; // 30 × 1 000 ms = 30 s timeout

    async function poll() {
      while (attempts.current < MAX && !cancelled) {
        try {
          const h = await fetchHealth();
          if (!cancelled) setInfo({
            state: "ready",
            llmConfigured: h.llmConfigured ?? false,
            cloudProfileStore: h.cloudProfileStore ?? false,
            cloudSecrets: h.cloudSecrets ?? false,
            cloudSessions: h.cloudSessions ?? false,
          });
          return;
        } catch {
          attempts.current += 1;
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
      if (!cancelled) setInfo({ state: "failed", llmConfigured: false, cloudProfileStore: false, cloudSecrets: false, cloudSessions: false });
    }

    void poll();
    return () => { cancelled = true; };
  }, []);

  return info;
}

function DaemonGate({ children }: { children: (info: DaemonInfo) => React.ReactNode }) {
  const info = useDaemonReady();

  if (info.state === "starting") {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-zinc-950 text-zinc-400">
        <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
        <span className="text-sm">Starting daemon…</span>
      </div>
    );
  }

  if (info.state === "failed") {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-zinc-950 text-zinc-400">
        <svg className="h-6 w-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
        <p className="text-sm font-medium text-zinc-300">Daemon failed to start</p>
        <p className="max-w-xs text-center text-xs text-zinc-600">
          The background service did not respond after 30 seconds. Try restarting the app.
        </p>
      </div>
    );
  }

  return (
    <>
      {children(info)}
    </>
  );
}

function useWindowState() {
  useEffect(() => {
    if (!("__TAURI__" in window)) return;
    async function restore() {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        const saved = localStorage.getItem("win_state");
        if (saved) {
          const { x, y, w, h } = JSON.parse(saved) as { x: number; y: number; w: number; h: number };
          const { LogicalSize, LogicalPosition } = await import("@tauri-apps/api/dpi");
          await win.setSize(new LogicalSize(w, h));
          await win.setPosition(new LogicalPosition(x, y));
        }
      } catch { /* ignore */ }
    }
    async function persist() {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        const pos = await win.outerPosition();
        const size = await win.outerSize();
        localStorage.setItem("win_state", JSON.stringify({ x: pos.x, y: pos.y, w: size.width, h: size.height }));
      } catch { /* ignore */ }
    }
    void restore();
    const interval = setInterval(() => { void persist(); }, 5000);
    window.addEventListener("beforeunload", () => { void persist(); });
    return () => clearInterval(interval);
  }, []);
}

// ─── Inline SVG icons ─────────────────────────────────────────────────────────

function IconChat() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
    </svg>
  );
}

function IconRepos() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
  );
}

function IconPR() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7h8m0 0l-3-3m3 3l-3 3M8 17H4m0 0l3 3m-3-3l3-3" />
    </svg>
  );
}

function IconReview() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function IconActivity() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 19V5m0 14h16M8 16v-5m4 5V8m4 8v-3" />
    </svg>
  );
}

function IconProfiles() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function IconPipeline() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 7h6m4 0h6M7 7v10m0 0h4m-4 0H4m13-10v4m0 6v-6m0 0h3m-3 0h-3" />
    </svg>
  );
}

function configuredAppName(): string {
  const envName = (import.meta.env.VITE_APP_DISPLAY_NAME ?? import.meta.env.VITE_APP_NAME) as string | undefined;
  if (envName?.trim()) return envName.trim();
  try {
    const stored = localStorage.getItem("cicd_agent_app_name");
    if (stored?.trim()) return stored.trim();
  } catch { /* ignore */ }
  return "MergePilot";
}

function initialsFromText(value: string | undefined, fallback = "?"): string {
  const source = value?.trim() || fallback;
  const parts = source.split(/[^A-Za-z0-9]+/).filter(Boolean);
  return (parts.length > 1 ? parts.map((part) => part[0]).join("") : source.slice(0, 2)).slice(0, 2).toUpperCase();
}

function InitialsAvatar({
  label,
  className,
}: {
  label?: string;
  className: string;
}) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-blue-600/80 font-semibold text-white ${className}`}>
      {initialsFromText(label)}
    </span>
  );
}

function SafeAvatar({
  src,
  label,
  imageClassName,
  fallbackClassName,
}: {
  src?: string;
  label?: string;
  imageClassName: string;
  fallbackClassName: string;
}) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return <img src={src} alt="" className={imageClassName} onError={() => setFailed(true)} />;
  }
  return <InitialsAvatar label={label} className={fallbackClassName} />;
}

// ─── useAuth hook ─────────────────────────────────────────────────────────────

const AUTH_CACHE_KEY = "cicd_agent_auth_user";

interface AuthState {
  user: AuthUser;
  checking: boolean;
  save: (u: AuthUser) => void;
  refresh: () => Promise<AuthUser>;
}

const AuthContext = createContext<AuthState>({
  user: { authenticated: false },
  checking: true,
  save: () => {},
  refresh: async () => ({ authenticated: false }),
});

function useAuth(): AuthState {
  return useContext(AuthContext);
}

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser>(() => {
    try {
      const raw = localStorage.getItem(AUTH_CACHE_KEY);
      if (raw) return JSON.parse(raw) as AuthUser;
    } catch { /* ignore */ }
    return { authenticated: false };
  });
  const [checking, setChecking] = useState(true);

  const save = useCallback((u: AuthUser) => {
    setUser(u);
    if (u.authenticated) {
      localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(u));
    } else {
      localStorage.removeItem(AUTH_CACHE_KEY);
    }
  }, []);

  const refresh = useCallback(async (): Promise<AuthUser> => {
    setChecking(true);
    try {
      const cached = await fetchAuthStatus();
      if (cached.authenticated) save(cached);
      const live = await fetchAuthMe();
      save(live);
      return live;
    } finally {
      setChecking(false);
    }
  }, [save]);

  // On mount: check daemon's instant cache, then do a live check in background
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setChecking(true);
      try {
        const cached = await fetchAuthStatus();
        if (!cancelled && cached.authenticated) save(cached);
        const live = await fetchAuthMe();
        if (!cancelled) save(live);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, [save]);

  return (
    <AuthContext.Provider value={{ user, checking, save, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Login modal ──────────────────────────────────────────────────────────────

function LoginModal({ onDone, onCancel }: { onDone: (u: AuthUser) => void; onCancel: () => void }) {
  const [accounts, setAccounts] = useState<AuthCachedAccount[]>([]);
  const [browser, setBrowser] = useState<AuthBrowserChoice>("default");
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  const [started, setStarted] = useState(false);
  const cancelRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const cached = await fetchAuthAccounts();
      if (cancelled) return;
      setAccounts(cached);
    })();
    return () => { cancelled = true; };
  }, []);

  const startLogin = (account?: AuthCachedAccount) => {
    cancelRef.current?.();
    setStarted(true);
    setDone(false);
    setMessage(account ? `Signing in as ${account.username ?? account.name ?? "selected account"}...` : `Opening ${browserLabel(browser)}...`);

    cancelRef.current = authLoginStream(browser, (e: AuthLoginEvent) => {
      if (e.type === "browser") {
        setMessage(e.message);
      } else if (e.type === "output") {
        setMessage(e.line);
      } else if (e.type === "status") {
        setMessage(e.message);
      } else if (e.type === "done") {
        setDone(true);
        setMessage(e.authenticated ? "Sign-in complete." : "Sign-in did not return a verified user.");
        if (e.authenticated) onDone({ authenticated: true, oid: e.oid, upn: e.upn, name: e.name, avatarDataUrl: e.avatarDataUrl });
        else onCancel();
      } else if (e.type === "error") {
        setMessage(e.message);
        setDone(true);
        setStarted(false);
      }
    }, { loginHint: account?.username, accountHomeId: account?.homeAccountId });
  };

  useEffect(() => () => { cancelRef.current?.(); }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-sm">
      <div className="w-[460px] rounded-xl border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[rgb(var(--app-text))]">Sign in with Microsoft</h2>
          {(done || !started) && (
            <button onClick={onCancel} className="text-xs text-[rgb(var(--app-text-muted))] hover:text-[rgb(var(--app-text))]">Close</button>
          )}
        </div>

        {!started && (
          <div className="space-y-3">
            {accounts.length > 0 && (
              <div className="space-y-2">
                {accounts.slice(0, 4).map((account) => (
                  <button
                    key={account.homeAccountId}
                    type="button"
                    onClick={() => startLogin(account)}
                    className="flex w-full items-center gap-3 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-3 py-2 text-left transition hover:border-[rgb(var(--app-accent))] hover:bg-[rgb(var(--app-accent-soft))]"
                  >
                    <AccountAvatar account={account} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-[rgb(var(--app-text))]">
                        {account.name ?? account.username ?? "Microsoft account"}
                      </span>
                      {account.username && (
                        <span className="block truncate text-xs text-[rgb(var(--app-text-muted))]">{account.username}</span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div className="flex rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))]">
              <button
                type="button"
                onClick={() => startLogin()}
                className="min-w-0 flex-1 rounded-l-md px-3 py-2 text-sm font-semibold text-[rgb(var(--app-text))] transition hover:bg-[rgb(var(--app-bg-muted))]"
              >
                {accounts.length > 0 ? "Use another account" : "Sign in with Microsoft"}
              </button>
              <div className="relative border-l border-[rgb(var(--app-border))]">
                <select
                  aria-label="Browser"
                  value={browser}
                  onChange={(e) => setBrowser(e.target.value as AuthBrowserChoice)}
                  className="h-full appearance-none rounded-r-md bg-[rgb(var(--app-bg-muted))] py-2 pl-3 pr-7 text-xs font-medium text-[rgb(var(--app-text))] outline-none transition hover:bg-[rgb(var(--app-accent-soft))]"
                >
                  <option value="default">Default</option>
                  <option value="edge">Edge</option>
                  <option value="chrome">Chrome</option>
                </select>
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[rgb(var(--app-text-muted))]">v</span>
              </div>
            </div>
          </div>
        )}

        {(started || message) && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-[rgb(var(--app-text-muted))]">{message}</span>
            {started && !done && (
              <button
                onClick={() => { cancelRef.current?.(); onCancel(); }}
                className="text-xs text-[rgb(var(--app-text-muted))] hover:text-[rgb(var(--app-text))]"
              >
                Cancel
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function browserLabel(browser: AuthBrowserChoice): string {
  if (browser === "edge") return "Microsoft Edge";
  if (browser === "chrome") return "Google Chrome";
  return "your default browser";
}

function AccountAvatar({ account }: { account: AuthCachedAccount }) {
  return (
    <SafeAvatar
      src={account.avatarDataUrl}
      label={account.name ?? account.username}
      imageClassName="h-8 w-8 shrink-0 rounded-full object-cover"
      fallbackClassName="h-8 w-8 text-xs"
    />
  );
}

function ProductionAuthGate({ children, info }: { children: React.ReactNode; info: DaemonInfo }) {
  const requiresAuth = info.cloudProfileStore || info.cloudSecrets || info.cloudSessions;
  const { user, checking, save, refresh } = useAuth();
  const [loggingIn, setLoggingIn] = useState(false);

  const handleLoginDone = (u: AuthUser) => {
    save(u);
    setLoggingIn(false);
    void refresh();
  };

  if (!requiresAuth) return <>{children}</>;

  if (checking) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-zinc-950 text-zinc-400">
        <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
        <span className="text-sm">Checking Microsoft sign-in...</span>
      </div>
    );
  }

  if (!user.authenticated) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-zinc-950 px-6 text-zinc-200">
        {loggingIn && (
          <LoginModal
            onDone={handleLoginDone}
            onCancel={() => setLoggingIn(false)}
          />
        )}
        <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
          <div className="mb-5 flex items-center gap-3">
            <svg className="h-5 w-5 shrink-0" fill="currentColor" viewBox="0 0 21 21">
              <rect x="1" y="1" width="9" height="9" fill="#f25022" />
              <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
              <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
              <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
            </svg>
            <div>
              <h1 className="text-sm font-semibold text-zinc-100">Corporate Microsoft sign-in required</h1>
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                Your Azure identity is used to load your Project Links and chat data from the company cloud store.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setLoggingIn(true)}
            className="flex w-full items-center justify-center rounded-md border border-blue-700/60 bg-blue-600/20 px-3 py-2 text-sm font-medium text-blue-200 transition hover:bg-blue-600/30"
          >
            Sign in with Microsoft
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

// ─── User footer ─────────────────────────────────────────────────────────────

function UserFooter() {
  const { user, save, refresh } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);

  const handleLogin = () => { setMenuOpen(false); setLoggingIn(true); };
  const handleLoginDone = (u: AuthUser) => {
    save(u);
    setLoggingIn(false);
    void refresh();
  };
  const handleLoginCancel = () => setLoggingIn(false);

  const handleLogout = async () => {
    setMenuOpen(false);
    await authLogout();
    save({ authenticated: false });
  };

  const displayName = user.name ?? user.upn ?? "Azure User";

  return (
    <>
      {loggingIn && <LoginModal onDone={handleLoginDone} onCancel={handleLoginCancel} />}

      {!user.authenticated ? (
        <div className="border-t border-zinc-800/60 p-2.5">
          <button
            className="flex w-full items-center gap-2 rounded-md border border-zinc-800 px-2 py-1.5 text-left transition-colors hover:border-zinc-700 hover:bg-zinc-800/40"
            onClick={handleLogin}
          >
            <svg className="h-4 w-4 shrink-0 text-zinc-600" fill="currentColor" viewBox="0 0 21 21">
              <rect x="1" y="1" width="9" height="9" fill="#f25022" />
              <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
              <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
              <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
            </svg>
            <span className="text-[12px] text-zinc-500">Sign in with Microsoft</span>
          </button>
        </div>
      ) : (
        <div className="relative border-t border-zinc-800/60 p-2.5">
          <button
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-zinc-800/60"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <SafeAvatar
              src={user.avatarDataUrl}
              label={displayName}
              imageClassName="h-7 w-7 shrink-0 rounded-full object-cover"
              fallbackClassName="h-7 w-7 text-xs"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-medium text-zinc-300">
                {displayName}
              </p>
              <p className="truncate text-[10px] text-zinc-600">{user.upn ?? user.oid}</p>
            </div>
            <svg className="h-3 w-3 shrink-0 text-zinc-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {menuOpen && (
            <div className="absolute bottom-full left-2.5 right-2.5 mb-1 rounded-lg border border-zinc-800 bg-zinc-900 py-1 shadow-xl">
              <div className="px-3 py-2 border-b border-zinc-800">
                <p className="text-[11px] font-medium text-zinc-300 truncate">{user.name ?? user.upn}</p>
                <p className="text-[10px] text-zinc-600 truncate">{user.upn}</p>
              </div>
              <hr className="my-1 border-zinc-800" />
              <button
                className="flex w-full items-center px-3 py-1.5 text-left text-xs text-red-400 hover:bg-zinc-800 transition-colors"
                onClick={() => void handleLogout()}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ─── Navigation groups ────────────────────────────────────────────────────────

const NAV_GROUPS = [
  {
    label: "Workspace",
    items: [
      { to: "/chat?new=1", match: "/chat", label: "New chat", Icon: IconChat },
      { to: "/pulls", label: "Pull Requests", Icon: IconPR },
      { to: "/profiles", label: "Project Links", Icon: IconProfiles },
    ],
  },
  {
    label: "Quality",
    items: [
      { to: "/findings", label: "Review Queue", Icon: IconReview },
      { to: "/pipelines", label: "Pipelines", Icon: IconPipeline },
    ],
  },
  {
    label: "System",
    items: [
      { to: "/activity", label: "Activity", Icon: IconActivity },
      { to: "/settings", label: "Settings", Icon: IconSettings },
    ],
  },
];

// ─── Product placeholder pages ────────────────────────────────────────────────

// ─── Layouts ──────────────────────────────────────────────────────────────────

function MiniLayout() {
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Chat mini />
    </div>
  );
}

function PageShell({
  children,
  scroll = true,
}: {
  children: React.ReactNode;
  scroll?: boolean;
}) {
  return (
    <div className="relative flex min-w-0 flex-1 overflow-hidden">
      <div
        className={`min-w-0 flex-1 px-6 pt-6 pb-16 ${
          scroll ? "overflow-auto" : "overflow-hidden"
        }`}
      >
        {children}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 border-t border-zinc-900/70 bg-gradient-to-t from-zinc-950 via-zinc-950/90 to-transparent" />
    </div>
  );
}

function FullLayout({ info }: { info: DaemonInfo }) {
  const location = useLocation();
  const anyCloud = info.cloudProfileStore || info.cloudSecrets || info.cloudSessions;
  const appName = configuredAppName();
  return (
    <div className="flex h-screen w-screen bg-zinc-950 text-zinc-100">
      {/* Sidebar */}
      <aside className="flex w-48 shrink-0 flex-col border-r border-zinc-800/80 overflow-hidden">
        {/* Logo / app name */}
        <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-zinc-800/60">
          <img src={appIconUrl} alt="" className="h-7 w-7 shrink-0 rounded-lg object-cover" />
          <span className="min-w-0 truncate text-sm font-semibold tracking-tight text-zinc-200">{appName}</span>
          {anyCloud && (
            <div title="Azure cloud persistence active" className="ml-auto flex items-center gap-0.5 shrink-0">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 opacity-60" />
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 opacity-30" />
            </div>
          )}
        </div>

        {/* Navigation groups */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                {group.label}
              </p>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors ${
                      (item.match ? location.pathname === item.match : isActive)
                        ? "bg-zinc-800 text-zinc-100"
                        : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300"
                    }`
                  }
                >
                  <item.Icon />
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* User / account footer */}
        <UserFooter />
      </aside>

      {/* Main content area */}
      <main className="flex min-w-0 flex-1 overflow-hidden">
        <Routes>
          <Route path="/" element={<Navigate to="/chat" replace />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/dashboard" element={<PageShell><Dashboard /></PageShell>} />
          <Route path="/repos" element={<PageShell><Repos /></PageShell>} />
          <Route path="/tasks" element={<Navigate to="/activity" replace />} />
          <Route path="/activity" element={<PageShell scroll={false}><TaskViewer /></PageShell>} />
          <Route path="/pulls" element={<PageShell><PullRequests /></PageShell>} />
          <Route path="/findings" element={<PageShell><ReviewFindings /></PageShell>} />
          <Route path="/pipelines" element={<PageShell><Pipelines /></PageShell>} />
          <Route path="/profiles" element={<PageShell><Profiles /></PageShell>} />
          <Route path="/settings" element={<PageShell><Settings /></PageShell>} />
        </Routes>
      </main>
    </div>
  );
}

export default function App(): JSX.Element {
  const location = useLocation();
  useWindowState();
  if (location.pathname === "/chat-mini") return <MiniLayout />;
  return (
    <DaemonGate>
      {(info) => (
        <AuthProvider>
          <ProductionAuthGate info={info}>
            <AppDataProvider daemonReady={info.state === "ready"}>
              <FullLayout info={info} />
            </AppDataProvider>
          </ProductionAuthGate>
        </AuthProvider>
      )}
    </DaemonGate>
  );
}
