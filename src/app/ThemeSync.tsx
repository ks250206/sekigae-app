import { useEffect } from "react";
import { useTheme } from "./theme";

/** <html class="dark"> と theme-color を同期する */
export function ThemeSync() {
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", resolvedTheme === "dark");
    root.style.colorScheme = resolvedTheme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", resolvedTheme === "dark" ? "#14161f" : "#f8f9fc");
  }, [resolvedTheme]);
  return null;
}
