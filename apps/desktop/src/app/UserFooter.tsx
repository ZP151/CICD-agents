import { useEffect, useRef, useState } from "react";
import { authLogout, type AuthUser } from "../api.js";
import { SafeAvatar } from "./avatar.js";
import { LoginModal } from "./LoginModal.js";
import { useAuth } from "./authContext.js";

export function UserFooter() {
  const { user, save, refresh } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleLogin = () => {
    setMenuOpen(false);
    setLoggingIn(true);
  };
  const handleLoginDone = (nextUser: AuthUser) => {
    save(nextUser);
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
  const accountTitle = user.upn ? `${displayName} (${user.upn})` : displayName;

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && menuRef.current?.contains(target)) return;
      setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  return (
    <>
      {loggingIn && <LoginModal onDone={handleLoginDone} onCancel={handleLoginCancel} />}

      {!user.authenticated ? (
        <div className="app-shell-account-footer flex justify-start border-t border-[rgb(var(--app-sidebar-border))] p-2.5">
          <button
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-transparent p-2 text-left transition-colors hover:bg-[rgb(var(--app-sidebar-hover))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-focus))]/60"
            onClick={handleLogin}
            title="Sign in with Microsoft"
            aria-label="Sign in with Microsoft"
          >
            <svg
              className="h-4 w-4 shrink-0 text-[rgb(var(--app-text-subtle))]"
              fill="currentColor"
              viewBox="0 0 21 21"
            >
              <rect x="1" y="1" width="9" height="9" fill="#f25022" />
              <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
              <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
              <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
            </svg>
            <span className="sr-only">
              Sign in with Microsoft
            </span>
          </button>
        </div>
      ) : (
        <div ref={menuRef} className="app-shell-account-footer relative flex justify-start border-t border-[rgb(var(--app-sidebar-border))] p-2.5">
          <button
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-transparent p-1 text-left transition-colors hover:bg-[rgb(var(--app-sidebar-hover))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-focus))]/60"
            onClick={() => setMenuOpen((value) => !value)}
            title={accountTitle}
            aria-label={`Account: ${displayName}`}
            aria-expanded={menuOpen}
          >
            <SafeAvatar
              src={user.avatarDataUrl}
              label={displayName}
              imageClassName="h-9 w-9 shrink-0 rounded-full bg-[rgb(var(--app-accent))] object-cover ring-1 ring-[rgb(var(--app-border-strong))]"
              fallbackClassName="h-9 w-9 text-sm ring-1 ring-[rgb(var(--app-border-strong))]"
            />
            <span className="sr-only">Signed in as {accountTitle}</span>
          </button>

          {menuOpen && (
            <div className="absolute bottom-full left-2 z-40 mb-2 w-56 rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] py-1 shadow-xl">
              <div className="border-b border-[rgb(var(--app-border))] px-3 py-2">
                <p className="truncate text-[11px] font-medium text-[rgb(var(--app-text))]">
                  {user.name ?? user.upn}
                </p>
                <p className="truncate text-[10px] text-[rgb(var(--app-text-subtle))]">
                  {user.upn}
                </p>
              </div>
              <hr className="my-1 border-[rgb(var(--app-border))]" />
              <button
                className="flex w-full items-center px-3 py-1.5 text-left text-xs text-[rgb(var(--app-danger))] transition-colors hover:bg-[rgb(var(--app-surface-raised))]"
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
