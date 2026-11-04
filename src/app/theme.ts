import { useSyncExternalStore } from "react";
import { usePrefs, type ThemePref } from "@/store/prefs";

const query = "(prefers-color-scheme: dark)";

function subscribeSystem(cb: () => void) {
  const mql = window.matchMedia(query);
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
}
const getSystemDark = () => window.matchMedia(query).matches;

export function useTheme() {
  const theme = usePrefs((s) => s.theme);
  const setTheme = usePrefs((s) => s.setTheme);
  const systemDark = useSyncExternalStore(subscribeSystem, getSystemDark, () => false);
  const resolvedTheme: "light" | "dark" =
    theme === "system" ? (systemDark ? "dark" : "light") : theme;
  return { theme, setTheme, resolvedTheme } as {
    theme: ThemePref;
    setTheme: (t: ThemePref) => void;
    resolvedTheme: "light" | "dark";
  };
}
