import { useEffect, useRef, useState } from "react";
import {
  authLoginStream,
  fetchAuthAccounts,
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
          setDone(true);
          setMessage(
            event.authenticated ? "Sign-in complete." : "Sign-in did not return a verified user.",
          );
          if (event.authenticated) {
            onDone({
              authenticated: true,
              oid: event.oid,
              upn: event.upn,
              name: event.name,
              avatarDataUrl: event.avatarDataUrl,
            });
          } else {
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

  useEffect(
    () => () => {
      cancelRef.current?.();
    },
    [],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-sm">
      <div className="w-[460px] space-y-4 rounded-xl border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[rgb(var(--app-text))]">
            Sign in with Microsoft
          </h2>
          {(done || !started) && (
            <button
              onClick={onCancel}
              className="text-xs text-[rgb(var(--app-text-muted))] hover:text-[rgb(var(--app-text))]"
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
                  onChange={(event) => setBrowser(event.target.value as AuthBrowserChoice)}
                  className="h-full appearance-none rounded-r-md bg-[rgb(var(--app-bg-muted))] py-2 pl-3 pr-7 text-xs font-medium text-[rgb(var(--app-text))] outline-none transition hover:bg-[rgb(var(--app-accent-soft))]"
                >
                  <option value="default">Default</option>
                  <option value="edge">Edge</option>
                  <option value="chrome">Chrome</option>
                </select>
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[rgb(var(--app-text-muted))]">
                  v
                </span>
              </div>
            </div>
          </div>
        )}

        {(started || message) && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-[rgb(var(--app-text-muted))]">{message}</span>
            {started && !done && (
              <button
                onClick={() => {
                  cancelRef.current?.();
                  onCancel();
                }}
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
