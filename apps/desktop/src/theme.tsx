import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type AppTheme = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

const THEME_STORAGE_KEY = "dev_agent_theme";

interface ThemeContextValue {
  theme: AppTheme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: AppTheme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  resolvedTheme: "dark",
  setTheme: () => {},
  toggleTheme: () => {},
});

function readStoredTheme(): AppTheme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "dark" || stored === "light" || stored === "system" ? stored : "system";
  } catch {
    return "system";
  }
}

function resolveTheme(theme: AppTheme): ResolvedTheme {
  if (theme !== "system") return theme;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [theme, setThemeState] = useState<AppTheme>(readStoredTheme);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveTheme(readStoredTheme()));

  useEffect(() => {
    const applyTheme = () => {
      const next = resolveTheme(theme);
      setResolvedTheme(next);
      document.documentElement.dataset.theme = next;
      document.documentElement.style.colorScheme = next;
    };

    applyTheme();
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    if (theme !== "system") return;

    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    media?.addEventListener("change", applyTheme);
    return () => media?.removeEventListener("change", applyTheme);
  }, [theme]);

  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    resolvedTheme,
    setTheme: setThemeState,
    toggleTheme: () => setThemeState((current) => {
      const currentResolved = current === "system" ? resolveTheme(current) : current;
      return currentResolved === "dark" ? "light" : "dark";
    }),
  }), [resolvedTheme, theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
