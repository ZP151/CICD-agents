import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { fetchAuthMe, fetchAuthStatus, type AuthUser } from "../api.js";

const AUTH_CACHE_KEY = "mergepilot_auth_user";

interface AuthState {
  user: AuthUser;
  checking: boolean;
  save: (user: AuthUser) => void;
  refresh: () => Promise<AuthUser>;
}

const AuthContext = createContext<AuthState>({
  user: { authenticated: false },
  checking: true,
  save: () => {},
  refresh: async () => ({ authenticated: false }),
});

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser>(() => {
    try {
      const raw = localStorage.getItem(AUTH_CACHE_KEY);
      if (raw) return JSON.parse(raw) as AuthUser;
    } catch {
      // Ignore invalid cache entries.
    }
    return { authenticated: false };
  });
  const [checking, setChecking] = useState(true);

  const save = useCallback((nextUser: AuthUser) => {
    setUser(nextUser);
    if (nextUser.authenticated) {
      localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(nextUser));
    } else {
      localStorage.removeItem(AUTH_CACHE_KEY);
    }
  }, []);

  const refresh = useCallback(async (): Promise<AuthUser> => {
    setChecking(true);
    try {
      const cached = await fetchAuthStatus();
      if (cached.authenticated) save(cached);
      const live = await fetchAuthMe();
      save(live);
      return live;
    } finally {
      setChecking(false);
    }
  }, [save]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setChecking(true);
      try {
        const cached = await fetchAuthStatus();
        if (!cancelled && cached.authenticated) save(cached);
        const live = await fetchAuthMe();
        if (!cancelled) save(live);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [save]);

  return (
    <AuthContext.Provider value={{ user, checking, save, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}
