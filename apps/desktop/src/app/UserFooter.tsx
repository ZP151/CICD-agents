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
        <div ref={menuRef} className="relative border-t border-zinc-800/60 p-2.5">
          <button
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-zinc-800/60"
            onClick={() => setMenuOpen((value) => !value)}
          >
            <SafeAvatar
              src={user.avatarDataUrl}
              label={displayName}
              imageClassName="h-7 w-7 shrink-0 rounded-full object-cover"
              fallbackClassName="h-7 w-7 text-xs"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-medium text-zinc-300">{displayName}</p>
              <p className="truncate text-[10px] text-zinc-600">{user.upn ?? user.oid}</p>
            </div>
            <svg
              className="h-3 w-3 shrink-0 text-zinc-700"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>

          {menuOpen && (
            <div className="absolute bottom-full left-2.5 right-2.5 mb-1 rounded-lg border border-zinc-800 bg-zinc-900 py-1 shadow-xl">
              <div className="border-b border-zinc-800 px-3 py-2">
                <p className="truncate text-[11px] font-medium text-zinc-300">
                  {user.name ?? user.upn}
                </p>
                <p className="truncate text-[10px] text-zinc-600">{user.upn}</p>
              </div>
              <hr className="my-1 border-zinc-800" />
              <button
                className="flex w-full items-center px-3 py-1.5 text-left text-xs text-red-400 transition-colors hover:bg-zinc-800"
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
