/**
 * ショートカット一覧ダイアログに表示する定義。各画面の定義をここで集約する。#143
 * keys は表示用（"Mod" は ⌘ / Ctrl に置換）。label は i18n キー（ns:key 形式可）。
 */
export interface ShortcutDef {
  keys: string[];
  label: string;
}
export interface ShortcutGroup {
  title: string;
  items: ShortcutDef[];
}

export const GLOBAL_SHORTCUTS: ShortcutGroup = {
  title: "onboarding:shortcuts.global",
  items: [
    { keys: ["Mod", "Z"], label: "onboarding:shortcuts.undo" },
    { keys: ["Mod", "Shift", "Z"], label: "onboarding:shortcuts.redo" },
    { keys: ["?"], label: "onboarding:shortcuts.help" },
  ],
};

/** 各画面のグループを追加する（統合時に rooms / seating の定義をここへ接続） */
export function getShortcutGroups(): ShortcutGroup[] {
  return [GLOBAL_SHORTCUTS];
}
