import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";

export type AppTheme = "standard" | "light" | "dark";
export type ResolvedTheme = AppTheme;

const THEME_STORAGE_KEY = "dev_agent_theme";

interface ThemeContextValue {
  theme: AppTheme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: AppTheme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "standard",
  resolvedTheme: "standard",
  setTheme: () => {},
  toggleTheme: () => {},
});

function readStoredTheme(): AppTheme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "standard" || stored === "dark" || stored === "light" ? stored : "standard";
  } catch {
    return "standard";
  }
}

function resolveTheme(theme: AppTheme): ResolvedTheme {
  return theme;
}

function applyDocumentTheme(theme: ResolvedTheme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme === "dark" ? "dark" : "light";
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function ThemeProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [theme, setThemeState] = useState<AppTheme>(readStoredTheme);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveTheme(readStoredTheme()));

  useEffect(() => {
    const next = resolveTheme(theme);
    setResolvedTheme(next);
    applyDocumentTheme(next);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const setTheme = useCallback((nextTheme: AppTheme) => {
    if (nextTheme === theme || typeof document === "undefined") {
      return;
    }

    const commit = () => {
      applyDocumentTheme(resolveTheme(nextTheme));
      flushSync(() => setThemeState(nextTheme));
    };

    const transitionDocument = document as Document & {
      startViewTransition?: (callback: () => void) => { finished: Promise<void> };
    };

    if (transitionDocument.startViewTransition && !prefersReducedMotion()) {
      document.documentElement.dataset.themeTransition = "true";
      const transition = transitionDocument.startViewTransition(commit);
      void transition.finished.finally(() => {
        delete document.documentElement.dataset.themeTransition;
      });
      return;
    }

    if (!prefersReducedMotion()) {
      document.documentElement.dataset.themeTransition = "true";
      window.setTimeout(() => {
        delete document.documentElement.dataset.themeTransition;
      }, 360);
    }

    commit();
  }, [theme]);

  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    resolvedTheme,
    setTheme,
    toggleTheme: () => setTheme(theme === "standard" ? "dark" : "standard"),
  }), [resolvedTheme, setTheme, theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
