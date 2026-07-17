import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { lazy, Suspense, useEffect, type ReactNode } from "react";
import Chat from "../pages/Chat.js";
import { UserFooter } from "./UserFooter.js";

type RouteModuleLoader = () => Promise<unknown>;

const loadDashboard = () => import("../pages/Dashboard.js");
const loadRepos = () => import("../pages/Repos.js");
const loadTaskViewer = () => import("../pages/TaskViewer.js");
const loadReviewFindings = () => import("../pages/ReviewFindings.js");
const loadPullRequests = () => import("../pages/PullRequests.js");
const loadPipelines = () => import("../pages/Pipelines.js");
const loadSettings = () => import("../pages/Settings.js");
const loadProjectLinks = () => import("../pages/ProjectLinks.js");

const routeModuleLoaders: RouteModuleLoader[] = [
  loadDashboard,
  loadRepos,
  loadTaskViewer,
  loadReviewFindings,
  loadPullRequests,
  loadPipelines,
  loadSettings,
  loadProjectLinks,
];

const Dashboard = lazy(loadDashboard);
const Repos = lazy(loadRepos);
const TaskViewer = lazy(loadTaskViewer);
const ReviewFindings = lazy(loadReviewFindings);
const PullRequests = lazy(loadPullRequests);
const Pipelines = lazy(loadPipelines);
const Settings = lazy(loadSettings);
const ProjectLinks = lazy(loadProjectLinks);

export async function preloadWorkspaceRouteModules(
  loaders: RouteModuleLoader[] = routeModuleLoaders,
): Promise<void> {
  await Promise.all(
    loaders.map(async (load) => {
      try {
        await load();
      } catch {
        // Keep Suspense fallback as the recovery path if a chunk fails to preload.
      }
    }),
  );
}

function IconChat() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
      />
    </svg>
  );
}

function IconRepos() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
      />
    </svg>
  );
}

function IconPR() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M8 7h8m0 0l-3-3m3 3l-3 3M8 17H4m0 0l3 3m-3-3l3-3"
      />
    </svg>
  );
}

function IconReview() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function IconActivity() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M4 19V5m0 14h16M8 16v-5m4 5V8m4 8v-3"
      />
    </svg>
  );
}

function IconProjectLinks() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
      />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );
}

function IconPipeline() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M4 7h6m4 0h6M7 7v10m0 0h4m-4 0H4m13-10v4m0 6v-6m0 0h3m-3 0h-3"
      />
    </svg>
  );
}

const NAV_GROUPS = [
  {
    label: "Workspace",
    items: [
      { to: "/chat?new=1", match: "/chat", label: "New chat", Icon: IconChat },
      { to: "/pulls", label: "Pull Requests", Icon: IconPR },
      { to: "/project-links", label: "Project Links", Icon: IconProjectLinks },
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

export function MiniLayout() {
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Chat mini />
    </div>
  );
}

function PageShell({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  return (
    <div className="relative flex min-w-0 flex-1 overflow-hidden">
      <div
        className={`min-w-0 flex-1 px-6 pb-16 pt-6 ${scroll ? "overflow-auto" : "overflow-hidden"}`}
      >
        {children}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 border-t border-zinc-900/70 bg-gradient-to-t from-zinc-950 via-zinc-950/90 to-transparent" />
    </div>
  );
}

function PageLoadingFallback() {
  return (
    <div
      aria-label="Preparing page"
      className="flex min-h-24 items-center justify-center text-xs text-[rgb(var(--app-text-subtle))]"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-[rgb(var(--app-text-subtle))]/60" />
    </div>
  );
}

function LazyPageShell({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  return (
    <PageShell scroll={scroll}>
      <Suspense fallback={<PageLoadingFallback />}>{children}</Suspense>
    </PageShell>
  );
}

export function FullLayout() {
  const location = useLocation();

  useEffect(() => {
    void preloadWorkspaceRouteModules();
  }, []);

  return (
    <div className="flex h-screen w-screen bg-zinc-950 text-zinc-100">
      <aside className="flex w-48 shrink-0 flex-col overflow-hidden border-r border-zinc-800/80">
        <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
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
        <UserFooter />
      </aside>

      <main className="flex min-w-0 flex-1 overflow-hidden">
        <Routes>
          <Route path="/" element={<Navigate to="/chat" replace />} />
          <Route path="/chat" element={<Chat />} />
          <Route
            path="/dashboard"
            element={
              <LazyPageShell>
                <Dashboard />
              </LazyPageShell>
            }
          />
          <Route
            path="/repos"
            element={
              <LazyPageShell>
                <Repos />
              </LazyPageShell>
            }
          />
          <Route path="/tasks" element={<Navigate to="/activity" replace />} />
          <Route
            path="/activity"
            element={
              <LazyPageShell scroll={false}>
                <TaskViewer />
              </LazyPageShell>
            }
          />
          <Route
            path="/pulls"
            element={
              <LazyPageShell>
                <PullRequests />
              </LazyPageShell>
            }
          />
          <Route
            path="/findings"
            element={
              <LazyPageShell>
                <ReviewFindings />
              </LazyPageShell>
            }
          />
          <Route
            path="/pipelines"
            element={
              <LazyPageShell>
                <Pipelines />
              </LazyPageShell>
            }
          />
          <Route
            path="/project-links"
            element={
              <LazyPageShell>
                <ProjectLinks />
              </LazyPageShell>
            }
          />
          <Route
            path="/settings"
            element={
              <LazyPageShell>
                <Settings />
              </LazyPageShell>
            }
          />
        </Routes>
      </main>
    </div>
  );
}
