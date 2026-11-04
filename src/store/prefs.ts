import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type ThemePref = "light" | "dark" | "system";
export type LanguagePref = "ja" | "en";

/** 端末ごとの設定（プロジェクトに属さない）。Undo 対象外。 */
export interface PrefsState {
  theme: ThemePref;
  language: LanguagePref | null;
  onboardingCompleted: boolean;
  tourSeen: boolean;
  lastProjectId: string | null;
  canvas: { showGrid: boolean; showHeatmap: boolean; showMinimap: boolean };
  /** 機能ごとの自由な設定置き場（例: 出力ダイアログの選択内容、色分けモード） */
  ui: Record<string, unknown>;
  setTheme: (theme: ThemePref) => void;
  setLanguage: (language: LanguagePref) => void;
  setOnboardingCompleted: (v: boolean) => void;
  setTourSeen: (v: boolean) => void;
  setLastProjectId: (id: string | null) => void;
  setCanvas: (patch: Partial<PrefsState["canvas"]>) => void;
  setUi: (key: string, value: unknown) => void;
}

export const PREFS_KEY = "sekigae:v1:prefs";

function safeStorage(): Storage {
  try {
    const k = "__sekigae_probe__";
    localStorage.setItem(k, "1");
    localStorage.removeItem(k);
    return localStorage;
  } catch {
    const mem = new Map<string, string>();
    return {
      get length() {
        return mem.size;
      },
      clear: () => mem.clear(),
      getItem: (k) => mem.get(k) ?? null,
      key: (i) => [...mem.keys()][i] ?? null,
      removeItem: (k) => void mem.delete(k),
      setItem: (k, v) => void mem.set(k, v),
    };
  }
}

export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      theme: "system",
      language: null,
      onboardingCompleted: false,
      tourSeen: false,
      lastProjectId: null,
      canvas: { showGrid: true, showHeatmap: false, showMinimap: true },
      ui: {},
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      setOnboardingCompleted: (onboardingCompleted) => set({ onboardingCompleted }),
      setTourSeen: (tourSeen) => set({ tourSeen }),
      setLastProjectId: (lastProjectId) => set({ lastProjectId }),
      setCanvas: (patch) => set((s) => ({ canvas: { ...s.canvas, ...patch } })),
      setUi: (key, value) => set((s) => ({ ui: { ...s.ui, [key]: value } })),
    }),
    { name: PREFS_KEY, version: 1, storage: createJSONStorage(safeStorage) },
  ),
);
