import { create } from "zustand";

/** ヘルプ系ダイアログの開閉（グローバル） */
export const useOnboardingUi = create<{
  welcomeOpen: boolean;
  shortcutsOpen: boolean;
  setWelcomeOpen: (v: boolean) => void;
  setShortcutsOpen: (v: boolean) => void;
}>()((set) => ({
  welcomeOpen: false,
  shortcutsOpen: false,
  setWelcomeOpen: (welcomeOpen) => set({ welcomeOpen }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
}));
