import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  authLoginStream,
  fetchAuthAccounts,
  fetchAuthStatus,
  type AuthBrowserChoice,
  type AuthCachedAccount,
  type AuthLoginEvent,
  type AuthUser,
} from "../api.js";
import { SafeAvatar } from "./avatar.js";

function browserLabel(browser: AuthBrowserChoice): string {
  if (browser === "edge") return "Microsoft Edge";
  if (browser === "chrome") return "Google Chrome";
  return "your default browser";
}

function dialogFocusableElements(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(
    'button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled]), [href]',
  ));
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

export function loginModalPanelClass(): string {
  return [
    "w-[min(440px,calc(100vw-2rem))] max-h-[calc(100vh-2rem)] overflow-y-auto",
    "space-y-3 rounded-lg border border-[rgb(var(--app-border))]",
    "bg-[rgb(var(--app-surface))] p-5 shadow-lg",
  ].join(" ");
}

export function loginModalMessageClass(): string {
  return "min-w-0 break-words text-xs leading-relaxed text-[rgb(var(--app-text-muted))]";
}

export function LoginModal({
  onDone,
  onCancel,
}: {
  onDone: (user: AuthUser) => void;
  onCancel: () => void;
}) {
  const [accounts, setAccounts] = useState<AuthCachedAccount[]>([]);
  const [browser, setBrowser] = useState<AuthBrowserChoice>("default");
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  const [started, setStarted] = useState(false);
  const cancelRef = useRef<(() => void) | null>(null);
  const completionHandledRef = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const complete = useCallback((user: AuthUser) => {
    if (completionHandledRef.current) return;
    completionHandledRef.current = true;
    setDone(true);
    setStarted(false);
    setMessage("Sign-in complete.");
    onDone(user);
  }, [onDone]);

  const cancelLogin = useCallback(() => {
    completionHandledRef.current = true;
    cancelRef.current?.();
    onCancel();
  }, [onCancel]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const cached = await fetchAuthAccounts();
      if (!cancelled) setAccounts(cached);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const startLogin = (account?: AuthCachedAccount) => {
    cancelRef.current?.();
    completionHandledRef.current = false;
    setStarted(true);
    setDone(false);
    setMessage(
      account
        ? `Signing in as ${account.username ?? account.name ?? "selected account"}...`
        : `Opening ${browserLabel(browser)}...`,
    );

    cancelRef.current = authLoginStream(
      browser,
      (event: AuthLoginEvent) => {
        if (event.type === "browser") {
          setMessage(event.message);
        } else if (event.type === "output") {
          setMessage(event.line);
        } else if (event.type === "status") {
          setMessage(event.message);
        } else if (event.type === "done") {
          if (event.authenticated) {
            complete({
              authenticated: true,
              oid: event.oid,
              upn: event.upn,
              name: event.name,
              avatarDataUrl: event.avatarDataUrl,
            });
          } else {
            setDone(true);
            setMessage("Sign-in did not return a verified user.");
            onCancel();
          }
        } else if (event.type === "error") {
          setMessage(event.message);
          setDone(true);
          setStarted(false);
        }
      },
      {
        loginHint: account?.username,
        accountHomeId: account?.homeAccountId,
      },
    );
  };

  useEffect(() => {
    if (!started || done) return;

    let cancelled = false;
    const checkForCompletedSignIn = async () => {
      const user = await fetchAuthStatus();
      if (!cancelled && user.authenticated) complete(user);
    };

    void checkForCompletedSignIn();
    const interval = window.setInterval(() => {
      void checkForCompletedSignIn();
    }, 750);

    // The deep-link return is the fast path.  Focus/visibility checks are
    // deliberate fallbacks for development, where an OS can focus the WebView
    // before the deep-link event listener is registered.
    let unlisten: (() => void) | undefined;
    void listen("mergepilot-auth-complete", () => {
      void checkForCompletedSignIn();
    }).then((dispose) => {
      if (cancelled) dispose();
      else unlisten = dispose;
    }).catch(() => {
      // Browser-only development does not expose Tauri's event bridge; the
      // interval and focus fallbacks above remain active there.
    });
    const onWindowFocus = () => void checkForCompletedSignIn();
    const onVisibilityChange = () => {
      if (!document.hidden) void checkForCompletedSignIn();
    };
    window.addEventListener("focus", onWindowFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onWindowFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      unlisten?.();
    };
  }, [complete, done, started]);

  useEffect(
    () => () => {
      cancelRef.current?.();
    },
    [],
  );

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFirstDialogControl = () => dialogFocusableElements(panel)[0]?.focus();
    const focusTimer = window.setTimeout(focusFirstDialogControl, 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelLogin();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = dialogFocusableElements(panel);
      if (controls.length === 0) return;
      const first = controls[0]!;
      const last = controls[controls.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey ? active === first || !panel.contains(active) : active === last || !panel.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [cancelLogin]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-4 backdrop-blur-sm">
      <div
        ref={panelRef}
        className={loginModalPanelClass()}
        data-testid="login-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-modal-title"
      >
        <div className="flex items-center justify-between">
          <h2 id="login-modal-title" className="text-sm font-semibold text-[rgb(var(--app-text))]">
            Sign in with Microsoft
          </h2>
          {(done || !started) && (
            <button
              onClick={cancelLogin}
              className="rounded px-1 text-xs text-[rgb(var(--app-text-muted))] hover:text-[rgb(var(--app-text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-focus))]/60"
            >
              Close
            </button>
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
                        <span className="block truncate text-xs text-[rgb(var(--app-text-muted))]">
                          {account.username}
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => startLogin()}
              className="flex w-full items-center justify-center rounded-md bg-[rgb(var(--app-accent))] px-3 py-2 text-sm font-semibold text-white transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-focus))]/70"
            >
              {accounts.length > 0 ? "Use another account" : "Sign in with Microsoft"}
            </button>
            <label className="grid gap-1.5 text-xs font-medium text-[rgb(var(--app-text-muted))]">
              Open sign-in in
              <select
                aria-label="Browser"
                value={browser}
                onChange={(event) => setBrowser(event.target.value as AuthBrowserChoice)}
                className="min-h-9 w-full rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-bg-muted))] px-2 text-sm font-medium text-[rgb(var(--app-text))] outline-none transition hover:border-[rgb(var(--app-border-strong))] focus:border-[rgb(var(--app-accent))] focus:ring-2 focus:ring-[rgb(var(--app-focus))]/30"
              >
                <option value="default">Default browser</option>
                <option value="edge">Microsoft Edge</option>
                <option value="chrome">Google Chrome</option>
              </select>
            </label>
          </div>
        )}

        {(started || message) && (
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
            <span className={loginModalMessageClass()}>{message}</span>
            {started && !done && (
              <button
                onClick={() => {
                  completionHandledRef.current = true;
                  cancelRef.current?.();
                  cancelLogin();
                }}
                className="rounded px-1 text-xs text-[rgb(var(--app-text-muted))] hover:text-[rgb(var(--app-text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-focus))]/60"
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
