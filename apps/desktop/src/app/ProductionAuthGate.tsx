import { useState, type ReactNode } from "react";
import type { AuthUser } from "../api.js";
import type { DaemonInfo } from "./daemonGate.js";
import { LoginModal } from "./LoginModal.js";
import { useAuth } from "./authContext.js";

export function ProductionAuthGate({ children, info }: { children: ReactNode; info: DaemonInfo }) {
  const requiresAuth = info.cloudProjectLinkStore || info.cloudSecrets || info.cloudSessions;
  const { user, checking, save, refresh } = useAuth();
  const [loggingIn, setLoggingIn] = useState(false);

  const handleLoginDone = (nextUser: AuthUser) => {
    save(nextUser);
    setLoggingIn(false);
    void refresh();
  };

  if (!requiresAuth) return <>{children}</>;

  if (checking) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-[rgb(var(--app-bg))] text-[rgb(var(--app-text-muted))]">
        <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
          />
        </svg>
        <span className="text-sm">Checking Microsoft sign-in...</span>
      </div>
    );
  }

  if (!user.authenticated) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[rgb(var(--app-bg))] px-6 text-[rgb(var(--app-text))]">
        {loggingIn && <LoginModal onDone={handleLoginDone} onCancel={() => setLoggingIn(false)} />}
        <div className="w-full max-w-md rounded-xl border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-6 shadow-2xl">
          <div className="mb-5 flex items-center gap-3">
            <svg className="h-5 w-5 shrink-0" fill="currentColor" viewBox="0 0 21 21">
              <rect x="1" y="1" width="9" height="9" fill="#f25022" />
              <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
              <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
              <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
            </svg>
            <div>
              <h1 className="text-sm font-semibold text-[rgb(var(--app-text))]">
                Corporate Microsoft sign-in required
              </h1>
              <p className="mt-1 text-xs leading-5 text-[rgb(var(--app-text-muted))]">
                Your Azure identity is used to load your Project Links and chat data from the
                company cloud store.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setLoggingIn(true)}
            className="flex w-full items-center justify-center rounded-md border border-[rgb(var(--app-accent))]/45 bg-[rgb(var(--app-accent-soft))] px-3 py-2 text-sm font-medium text-[rgb(var(--app-accent))] transition hover:border-[rgb(var(--app-accent))]/65 hover:bg-[rgb(var(--app-accent-soft))]/80"
          >
            Sign in with Microsoft
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
