import { useTheme } from "@/app/theme";

/** 役職色などのライト / ダーク切替用 */
export function useScheme(): "light" | "dark" {
  return useTheme().resolvedTheme;
}
