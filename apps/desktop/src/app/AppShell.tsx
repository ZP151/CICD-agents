import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import {
  Component,
  lazy,
  Suspense,
  useEffect,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { UserFooter } from "./UserFooter.js";
import { WorkbenchSkeleton } from "../components/workbench/WorkbenchPrimitives.js";
import { Tooltip, TooltipProvider } from "../components/ui/Tooltip.js";

type RouteModuleLoader = () => Promise<unknown>;

const loadChat = () => import("../pages/Chat.js");
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

const Chat = lazy(loadChat);
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

export function pageShellContentClass(scroll: boolean): string {
  return `min-w-0 flex-1 px-4 pb-16 pt-4 sm:px-6 sm:pt-6 ${scroll ? "overflow-auto" : "overflow-hidden"}`;
}

export function pageShellFadeClass(): string {
  return "pointer-events-none absolute inset-x-0 bottom-0 h-10 border-t border-[rgb(var(--app-border))] bg-gradient-to-t from-[rgb(var(--app-bg))] via-[rgb(var(--app-bg))] to-transparent";
}

export function appShellFrameClass(): string {
  return "flex h-screen w-screen bg-[rgb(var(--app-bg))] text-[rgb(var(--app-text))]";
}

export function appShellSidebarClass(): string {
  return "app-shell-sidebar flex shrink-0 flex-col overflow-hidden border-r border-[rgb(var(--app-sidebar-border))] bg-[rgb(var(--app-sidebar))]";
}

export function appShellGroupLabelClass(): string {
  return "app-shell-group-label mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[rgb(var(--app-sidebar-muted))]";
}

export function appShellNavLinkClass(active: boolean): string {
  return `app-shell-nav-link rounded-lg border border-transparent text-[13px] font-medium leading-5 transition-[background-color,border-color,color,box-shadow] duration-[var(--app-motion-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[rgb(var(--app-focus))]/70 ${
    active
      ? "border-white/10 bg-[rgb(var(--app-sidebar-active))] text-[rgb(var(--app-sidebar-text))] shadow-[0_3px_8px_rgb(8_15_38_/_0.22)]"
      : "text-[rgb(var(--app-sidebar-muted))] hover:bg-[rgb(var(--app-sidebar-hover))] hover:text-[rgb(var(--app-sidebar-text))]"
  }`;
}

export function appShellNavLabelClass(): string {
  return "app-shell-nav-label min-w-0 truncate";
}

export function workspaceRouteFallbackTarget(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  if (normalized === "/review" || normalized === "/review-queue") return "/findings";
  if (normalized === "/pull-requests") return "/pulls";
  if (normalized === "/tasks") return "/activity";
  return "/chat";
}

export function routeErrorBoundaryResetKey(location: {
  pathname: string;
  search: string;
  hash: string;
}): string {
  return `${location.pathname}${location.search}${location.hash}`;
}

function IconChat() {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
    <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
    <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
    <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
    <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
    <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
    <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
    <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
      <Suspense fallback={<PageLoadingFallback />}><Chat mini /></Suspense>
    </div>
  );
}

function PageShell({
  children,
  scroll = true,
  showBottomFade = false,
}: {
  children: ReactNode;
  scroll?: boolean;
  showBottomFade?: boolean;
}) {
  return (
    <div className="relative flex min-w-0 flex-1 overflow-hidden">
      <div className={pageShellContentClass(scroll)}>{children}</div>
      {showBottomFade && <div className={pageShellFadeClass()} />}
    </div>
  );
}

export function PageLoadingFallback(): JSX.Element {
  return (
    <section
      aria-label="Preparing workspace page"
      aria-live="polite"
      className="mx-auto flex min-h-48 w-full max-w-5xl flex-col justify-center gap-4 py-6"
    >
      <div className="max-w-xl">
        <p className="text-sm font-medium text-[rgb(var(--app-text))]">Preparing workspace</p>
        <p className="mt-1 text-xs leading-5 text-[rgb(var(--app-text-muted))]">
          Loading this page and its local context.
        </p>
      </div>
      <div className="max-w-3xl">
        <WorkbenchSkeleton rows={2} />
      </div>
    </section>
  );
}

interface RouteErrorBoundaryProps {
  children: ReactNode;
  resetKey: string;
}

interface RouteErrorBoundaryState {
  error: Error | null;
}

export class RouteErrorBoundary extends Component<
  RouteErrorBoundaryProps,
  RouteErrorBoundaryState
> {
  override state: RouteErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): RouteErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Workspace route crashed", error, info.componentStack);
  }

  override componentDidUpdate(previousProps: RouteErrorBoundaryProps): void {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  override render(): ReactNode {
    if (this.state.error) return <RouteErrorFallback error={this.state.error} />;
    return this.props.children;
  }
}

export function RouteErrorFallback({ error }: { error: Error }): JSX.Element {
  return (
    <div className="mx-auto flex min-h-80 w-full max-w-3xl flex-col justify-center rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-4">
      <p className="text-xs font-semibold uppercase text-[rgb(var(--app-text-subtle))]">
        Page recovery
      </p>
      <h2 className="mt-2 text-base font-semibold text-[rgb(var(--app-text))]">
        This workspace page needs a refresh
      </h2>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-[rgb(var(--app-text-muted))]">
        MergePilot kept the app open, but this page hit an unexpected data or rendering state.
        Refresh the page data, switch routes, or return to Chat and try the workflow again.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-md bg-[rgb(var(--app-accent))] px-3 py-1.5 text-sm font-medium text-white"
        >
          Refresh page
        </button>
        <a
          href="#/chat"
          className="rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-3 py-1.5 text-sm text-[rgb(var(--app-text))]"
        >
          Back to Chat
        </a>
      </div>
      <details className="mt-4 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] p-2">
        <summary className="cursor-pointer text-xs font-medium text-[rgb(var(--app-text-muted))]">
          Technical detail
        </summary>
        <p className="mt-2 break-words font-mono text-xs text-[rgb(var(--app-text-subtle))]">
          {error.message}
        </p>
      </details>
    </div>
  );
}

function LazyPageShell({
  children,
  scroll = true,
  showBottomFade = false,
}: {
  children: ReactNode;
  scroll?: boolean;
  showBottomFade?: boolean;
}) {
  const location = useLocation();
  const routeResetKey = routeErrorBoundaryResetKey(location);

  return (
    <PageShell scroll={scroll} showBottomFade={showBottomFade}>
      <RouteErrorBoundary resetKey={routeResetKey}>
        <Suspense fallback={<PageLoadingFallback />}>{children}</Suspense>
      </RouteErrorBoundary>
    </PageShell>
  );
}

export function FullLayout() {
  const location = useLocation();

  useEffect(() => {
    void preloadWorkspaceRouteModules();
  }, []);

  return (
    <div className={appShellFrameClass()}>
      <aside className={appShellSidebarClass()}>
        <TooltipProvider>
          <nav className="app-shell-navigation flex-1 space-y-4 overflow-y-auto px-2 pb-3 pt-4">
            {NAV_GROUPS.map((group) => (
              <div key={group.label}>
                <p className={appShellGroupLabelClass()}>{group.label}</p>
                {group.items.map((item) => (
                  <Tooltip key={item.to} content={item.label} contentClassName="app-shell-compact-tooltip">
                    <NavLink
                      to={item.to}
                      title={item.label}
                      aria-label={item.label}
                      className={appShellNavLinkClass(
                        item.match ? location.pathname === item.match : location.pathname === item.to,
                      )}
                    >
                      <span aria-hidden="true" className="app-shell-nav-icon">
                        <item.Icon />
                      </span>
                      <span className={appShellNavLabelClass()}>{item.label}</span>
                    </NavLink>
                  </Tooltip>
                ))}
              </div>
            ))}
          </nav>
          <UserFooter />
        </TooltipProvider>
      </aside>

      <main className="flex min-w-0 flex-1 overflow-hidden">
        <Routes>
          <Route path="/" element={<Navigate to="/chat" replace />} />
          <Route path="/chat" element={<Suspense fallback={<PageLoadingFallback />}><Chat /></Suspense>} />
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
          <Route path="/review" element={<Navigate to="/findings" replace />} />
          <Route path="/review-queue" element={<Navigate to="/findings" replace />} />
          <Route path="/pull-requests" element={<Navigate to="/pulls" replace />} />
          <Route
            path="/activity"
            element={
              <LazyPageShell>
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
          <Route
            path="*"
            element={<Navigate to={workspaceRouteFallbackTarget(location.pathname)} replace />}
          />
        </Routes>
      </main>
    </div>
  );
}
