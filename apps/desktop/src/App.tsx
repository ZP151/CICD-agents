import { useEffect } from "react";
import { NavLink, Route, Routes, Navigate, useLocation } from "react-router-dom";
import Dashboard from "./pages/Dashboard.js";
import Repos from "./pages/Repos.js";
import TaskViewer from "./pages/TaskViewer.js";
import ReviewFindings from "./pages/ReviewFindings.js";
import Settings from "./pages/Settings.js";
import Chat from "./pages/Chat.js";

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

function IconTasks() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
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

function IconPipelines() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 10V3L4 14h7v7l9-11h-7z" />
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

// ─── Navigation groups ────────────────────────────────────────────────────────

const NAV_GROUPS = [
  {
    label: "Workspace",
    items: [
      { to: "/chat", label: "Chat", Icon: IconChat },
      { to: "/tasks", label: "Tasks", Icon: IconTasks },
      { to: "/repos", label: "Repositories", Icon: IconRepos },
      { to: "/pulls", label: "Pull Requests", Icon: IconPR },
    ],
  },
  {
    label: "Quality",
    items: [
      { to: "/findings", label: "Review Findings", Icon: IconReview },
      { to: "/pipelines", label: "Pipelines", Icon: IconPipelines },
    ],
  },
  {
    label: "System",
    items: [
      { to: "/settings", label: "Settings", Icon: IconSettings },
    ],
  },
];

// ─── Placeholder page ─────────────────────────────────────────────────────────

function Placeholder({ title }: { title: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-zinc-700">
      <p className="text-lg font-semibold">{title}</p>
      <p className="text-sm">Coming soon</p>
    </div>
  );
}

// ─── Layouts ──────────────────────────────────────────────────────────────────

function MiniLayout() {
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Chat mini />
    </div>
  );
}

function FullLayout() {
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

        {/* User info footer */}
        <div className="border-t border-zinc-800/60 p-2.5">
          <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-zinc-800/60">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600/80 text-xs font-semibold text-white">
              P
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-medium text-zinc-300">Ping Zhou</p>
              <p className="truncate text-[10px] text-zinc-600">Azure DevOps</p>
            </div>
          </button>
        </div>
      </aside>

      {/* Main content area */}
      <main className="flex min-w-0 flex-1 overflow-hidden">
        <Routes>
          <Route path="/" element={<Navigate to="/chat" replace />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/dashboard" element={<div className="flex flex-1 overflow-auto p-6"><Dashboard /></div>} />
          <Route path="/repos" element={<div className="flex flex-1 overflow-auto p-6"><Repos /></div>} />
          <Route path="/tasks" element={<div className="flex flex-1 overflow-auto p-6"><TaskViewer /></div>} />
          <Route path="/pulls" element={<Placeholder title="Pull Requests" />} />
          <Route path="/findings" element={<div className="flex flex-1 overflow-auto p-6"><ReviewFindings /></div>} />
          <Route path="/pipelines" element={<Placeholder title="Pipelines" />} />
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
  return <FullLayout />;
}
