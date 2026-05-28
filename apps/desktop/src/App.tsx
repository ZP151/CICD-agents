import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import { NavLink, Route, Routes, Navigate, useLocation } from "react-router-dom";
import {
  fetchHealth,
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
  type WorkspaceProfile,
  type WorkspaceProfileInput,
} from "./api.js";
import Dashboard from "./pages/Dashboard.js";
import Repos from "./pages/Repos.js";
import TaskViewer from "./pages/TaskViewer.js";
import ReviewFindings from "./pages/ReviewFindings.js";
import PullRequests from "./pages/PullRequests.js";
import Settings from "./pages/Settings.js";
import Chat from "./pages/Chat.js";
import Profiles from "./pages/Profiles.js";

// ─── Global app data (profiles, etc.) ────────────────────────────────────────
// Loaded once after daemon is ready. All pages read from here — no per-page fetching.

const PROFILES_LS_KEY = "cicd_agent_profiles_v1";

function lsProfiles(): WorkspaceProfile[] {
  try { return JSON.parse(localStorage.getItem(PROFILES_LS_KEY) ?? "[]") as WorkspaceProfile[]; }
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
    localStorage.setItem(PROFILES_LS_KEY, JSON.stringify(ps));
  };

  const refreshProfiles = useCallback(async () => {
    setProfilesLoading(true);
    try {
      const remote = await listProfiles();
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
    return { ...data, id: genId(), createdAt: now, updatedAt: now };
  }
  function lsUpdate(id: string, data: Partial<WorkspaceProfileInput>, prev: WorkspaceProfile[]): WorkspaceProfile {
    const existing = prev.find(p => p.id === id);
    if (!existing) throw new Error("Profile not found");
    return { ...existing, ...data, id, updatedAt: Date.now() / 1000 };
  }

  const createProfile = useCallback(async (data: WorkspaceProfileInput): Promise<WorkspaceProfile> => {
    let p: WorkspaceProfile;
    try {
      p = await apiCreateProfile(data);
      setUsingDaemon(true);
    } catch {
      p = lsCreate(data);
    }
    setProfiles(prev => { const next = [...prev, p]; syncToLs(next); return next; });
    return p;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateProfile = useCallback(async (id: string, data: Partial<WorkspaceProfileInput>): Promise<WorkspaceProfile> => {
    let updated: WorkspaceProfile;
    try {
      updated = await apiUpdateProfile(id, data);
      setUsingDaemon(true);
    } catch {
      updated = lsUpdate(id, data, profiles);
    }
    setProfiles(prev => { const next = prev.map(p => p.id === id ? updated : p); syncToLs(next); return next; });
    return updated!;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles]);

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
  const [setupDismissed, setSetupDismissed] = useState(
    () => localStorage.getItem("setup_banner_dismissed") === "1"
  );

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

  // Show first-run setup banner when the daemon is reachable but LLM is not configured
  const showSetup = info.state === "ready" && !info.llmConfigured && !setupDismissed;

  return (
    <>
      {showSetup && (
        <SetupBanner onDismiss={() => {
          setSetupDismissed(true);
          localStorage.setItem("setup_banner_dismissed", "1");
        }} />
      )}
      {children(info)}
    </>
  );
}

function SetupBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-between gap-3 bg-amber-900/90 px-4 py-2.5 text-sm text-amber-100 backdrop-blur-sm border-b border-amber-700/60">
      <div className="flex items-center gap-2">
        <svg className="h-4 w-4 shrink-0 text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
        <span>
          <strong>LLM not configured.</strong>{" "}
          Open <strong>Settings</strong>, enter your Azure OpenAI or OpenAI credentials, then click <strong>Apply to Daemon</strong>.
        </span>
      </div>
      <button
        onClick={onDismiss}
        className="shrink-0 rounded px-2 py-0.5 text-xs text-amber-300 hover:bg-amber-800/50 transition"
      >
        Dismiss
      </button>
    </div>
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

// ─── useAuth hook ─────────────────────────────────────────────────────────────

const AUTH_CACHE_KEY = "cicd_agent_auth_user";

function useAuth() {
  const [user, setUser] = useState<AuthUser>(() => {
    try {
      const raw = localStorage.getItem(AUTH_CACHE_KEY);
      if (raw) return JSON.parse(raw) as AuthUser;
    } catch { /* ignore */ }
    return { authenticated: false };
  });

  const save = useCallback((u: AuthUser) => {
    setUser(u);
    if (u.authenticated) {
      localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(u));
    } else {
      localStorage.removeItem(AUTH_CACHE_KEY);
    }
  }, []);

  // On mount: check daemon's instant cache, then do a live check in background
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Fast path: daemon file cache (no Azure round-trip)
      const cached = await fetchAuthStatus();
      if (!cancelled && cached.authenticated) save(cached);

      // Slow path: live credential check (updates token validity)
      const live = await fetchAuthMe();
      if (!cancelled) save(live);
    })();
    return () => { cancelled = true; };
  }, [save]);

  return { user, save };
}

// ─── Login modal ──────────────────────────────────────────────────────────────

function LoginModal({ onDone, onCancel }: { onDone: (u: AuthUser) => void; onCancel: () => void }) {
  const [lines, setLines] = useState<string[]>(["Waiting for az login…"]);
  const [done, setDone] = useState(false);
  const cancelRef = useRef<(() => void) | null>(null);

  // Parse device code URL and code from az login output
  const [deviceUrl, setDeviceUrl] = useState<string | null>(null);
  const [deviceCode, setDeviceCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [browserOpened, setBrowserOpened] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    cancelRef.current = authLoginStream((e: AuthLoginEvent) => {
      if (e.type === "output") {
        setLines((l) => [...l.slice(-40), e.line]);
        // Parse "https://microsoft.com/devicelogin" URL
        const urlMatch = e.line.match(/https:\/\/\S+/);
        if (urlMatch) setDeviceUrl(urlMatch[0]);
        // Parse 8-char device code like "ABCD1234"
        const codeMatch = e.line.match(/\b([A-Z0-9]{8,9})\b/);
        if (codeMatch && !e.line.toLowerCase().includes("http")) setDeviceCode(codeMatch[1] ?? null);
      } else if (e.type === "status") {
        setLines((l) => [...l, e.message]);
      } else if (e.type === "done") {
        setDone(true);
        if (e.authenticated) onDone({ authenticated: true, oid: e.oid, upn: e.upn, name: e.name });
        else onCancel();
      } else if (e.type === "error") {
        setLines((l) => [...l, `Error: ${e.message}`]);
        setDone(true);
      }
    });
    return () => { cancelRef.current?.(); };
  }, [onDone, onCancel]);

  // Auto-open browser and auto-copy code as soon as both are available
  useEffect(() => {
    if (deviceUrl && !browserOpened) {
      void openUrl(deviceUrl);
      setBrowserOpened(true);
    }
  }, [deviceUrl, browserOpened]);

  useEffect(() => {
    if (deviceCode) {
      void navigator.clipboard.writeText(deviceCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [deviceCode]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  const copyCode = () => {
    if (!deviceCode) return;
    void navigator.clipboard.writeText(deviceCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm">
      <div className="w-[520px] rounded-xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-200">Sign in with Microsoft</h2>
          {done && (
            <button onClick={onCancel} className="text-xs text-zinc-500 hover:text-zinc-300">Close</button>
          )}
        </div>

        {/* Device code card — shown once az outputs the URL/code */}
        {deviceUrl && (
          <div className="rounded-lg border border-blue-800/50 bg-blue-950/20 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-green-400 font-medium">
                {browserOpened ? "Browser opened automatically" : "Opening browser…"}
              </span>
              <button
                onClick={() => void openUrl(deviceUrl)}
                className="ml-auto rounded border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-400 hover:bg-zinc-800 transition"
              >
                Reopen
              </button>
            </div>
            {deviceCode && (
              <div className="flex items-center gap-3">
                <span className="text-xs text-zinc-400">Enter this code in the browser:</span>
                <span className="rounded bg-zinc-800 px-3 py-1 font-mono text-base font-bold text-zinc-100 tracking-widest">
                  {deviceCode}
                </span>
                <button
                  onClick={copyCode}
                  className="rounded border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-400 hover:bg-zinc-800 transition"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            )}
            <p className="text-[10px] text-zinc-500">
              Sign in with your company Microsoft account at{" "}
              <button
                onClick={() => void openUrl(deviceUrl)}
                className="text-blue-500 underline hover:text-blue-400"
              >
                {deviceUrl}
              </button>
            </p>
          </div>
        )}

        {/* Raw output log */}
        <div className="h-28 overflow-y-auto rounded-md bg-zinc-950 p-2 font-mono text-[11px] text-zinc-500 leading-relaxed">
          {lines.map((l, i) => <div key={i}>{l}</div>)}
          <div ref={bottomRef} />
        </div>

        {!done && (
          <div className="flex justify-end">
            <button
              onClick={() => { cancelRef.current?.(); onCancel(); }}
              className="text-xs text-zinc-500 hover:text-zinc-300"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── User footer ─────────────────────────────────────────────────────────────

function UserFooter() {
  const { user, save } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);

  const handleLogin = () => { setMenuOpen(false); setLoggingIn(true); };
  const handleLoginDone = (u: AuthUser) => { save(u); setLoggingIn(false); };
  const handleLoginCancel = () => setLoggingIn(false);

  const handleLogout = async () => {
    setMenuOpen(false);
    await authLogout();
    save({ authenticated: false });
  };

  const initials = user.name
    ? user.name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()
    : user.upn?.[0]?.toUpperCase() ?? "?";

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
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600/80 text-xs font-semibold text-white">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-medium text-zinc-300">
                {user.name ?? user.upn ?? "Azure User"}
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
      { to: "/chat", label: "New chat", Icon: IconChat },
      { to: "/pulls", label: "Pull Requests", Icon: IconPR },
      { to: "/profiles", label: "Profiles", Icon: IconProfiles },
    ],
  },
  {
    label: "Quality",
    items: [
      { to: "/findings", label: "Review Queue", Icon: IconReview },
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

function FullLayout({ info }: { info: DaemonInfo }) {
  const anyCloud = info.cloudProfileStore || info.cloudSecrets || info.cloudSessions;
  return (
    <div className="flex h-screen w-screen bg-zinc-950 text-zinc-100">
      {/* Sidebar */}
      <aside className="flex w-48 shrink-0 flex-col border-r border-zinc-800/80 overflow-hidden">
        {/* Logo / app name */}
        <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-zinc-800/60">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-600 text-[11px] font-bold text-white shrink-0">
            D
          </div>
          <span className="text-sm font-semibold tracking-tight text-zinc-200">Dev Agent</span>
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
                      isActive
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
          <Route path="/dashboard" element={<div className="flex flex-1 overflow-auto p-6"><Dashboard /></div>} />
          <Route path="/repos" element={<div className="flex flex-1 overflow-auto p-6"><Repos /></div>} />
          <Route path="/tasks" element={<Navigate to="/activity" replace />} />
          <Route path="/activity" element={<div className="flex flex-1 overflow-hidden p-6"><TaskViewer /></div>} />
          <Route path="/pulls" element={<div className="flex flex-1 overflow-auto p-6"><PullRequests /></div>} />
          <Route path="/findings" element={<div className="flex flex-1 overflow-auto p-6"><ReviewFindings /></div>} />
          <Route path="/pipelines" element={<Navigate to="/pulls" replace />} />
          <Route path="/profiles" element={<div className="flex flex-1 overflow-auto p-6"><Profiles /></div>} />
          <Route path="/settings" element={<div className="flex flex-1 overflow-auto p-6"><Settings /></div>} />
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
        <AppDataProvider daemonReady={info.state === "ready"}>
          <FullLayout info={info} />
        </AppDataProvider>
      )}
    </DaemonGate>
  );
}
