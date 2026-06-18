import { useEffect, useRef, useState, type ReactNode } from "react";
import { fetchHealth } from "../api.js";

export type DaemonState = "starting" | "ready" | "failed";

export interface DaemonInfo {
  state: DaemonState;
  llmConfigured: boolean;
  cloudProjectLinkStore: boolean;
  cloudSecrets: boolean;
  cloudSessions: boolean;
}

const failedDaemonInfo: DaemonInfo = {
  state: "failed",
  llmConfigured: false,
  cloudProjectLinkStore: false,
  cloudSecrets: false,
  cloudSessions: false,
};

function useDaemonReady(): DaemonInfo {
  const [info, setInfo] = useState<DaemonInfo>({
    state: "starting",
    llmConfigured: false,
    cloudProjectLinkStore: false,
    cloudSecrets: false,
    cloudSessions: false,
  });
  const attempts = useRef(0);

  useEffect(() => {
    if (!("__TAURI__" in window)) {
      setInfo({
        state: "ready",
        llmConfigured: true,
        cloudProjectLinkStore: false,
        cloudSecrets: false,
        cloudSessions: false,
      });
      return;
    }

    let cancelled = false;
    const maxAttempts = 30;

    async function poll() {
      while (attempts.current < maxAttempts && !cancelled) {
        try {
          const health = await fetchHealth();
          if (!cancelled) {
            setInfo({
              state: "ready",
              llmConfigured: health.llmConfigured ?? false,
              cloudProjectLinkStore: health.cloudProjectLinkStore ?? false,
              cloudSecrets: health.cloudSecrets ?? false,
              cloudSessions: health.cloudSessions ?? false,
            });
          }
          return;
        } catch {
          attempts.current += 1;
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
      if (!cancelled) setInfo(failedDaemonInfo);
    }

    void poll();
    return () => {
      cancelled = true;
    };
  }, []);

  return info;
}

export function DaemonGate({ children }: { children: (info: DaemonInfo) => ReactNode }) {
  const info = useDaemonReady();

  if (info.state === "starting") {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-zinc-950 text-zinc-400">
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
        <span className="text-sm">Starting daemon...</span>
      </div>
    );
  }

  if (info.state === "failed") {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-zinc-950 text-zinc-400">
        <svg className="h-6 w-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
          />
        </svg>
        <p className="text-sm font-medium text-zinc-300">Daemon failed to start</p>
        <p className="max-w-xs text-center text-xs text-zinc-600">
          The background service did not respond after 30 seconds. Try restarting the app.
        </p>
      </div>
    );
  }

  return <>{children(info)}</>;
}
