/**
 * 部屋エディタのキーボードショートカット定義（単一の情報源）。
 * ヘルプのショートカット一覧ダイアログはこの配列を読む: 表示名は `rooms:shortcuts.<id>`。
 *
 * combo 記法: 小文字キー名を "+" で連結。`mod` は Ctrl（Mac は ⌘）。例: "mod+c", "shift+f", "arrowup"
 */
import { isMac } from "@/lib/keyboard";

export type ShortcutGroup = "tools" | "edit" | "view";

export interface ShortcutDef {
  id: string;
  group: ShortcutGroup;
  /** いずれかに一致すれば発火 */
  combos: string[];
  /** 押している間だけ有効（Space のパン） */
  hold?: boolean;
}

export const ROOM_SHORTCUTS = [
  // ツール
  { id: "toolSelect", group: "tools", combos: ["v"] },
  { id: "toolFloor", group: "tools", combos: ["b"] },
  { id: "toolVoid", group: "tools", combos: ["x"] },
  { id: "toolObstacle", group: "tools", combos: ["o"] },
  { id: "toolSeat", group: "tools", combos: ["s"] },
  { id: "toolEntrance", group: "tools", combos: ["e"] },
  { id: "toolEraser", group: "tools", combos: ["d"] },
  { id: "toolPan", group: "tools", combos: ["h"] },
  { id: "panHold", group: "tools", combos: ["space"], hold: true },
  // 編集
  { id: "rotate", group: "edit", combos: ["r"] },
  { id: "rotateBack", group: "edit", combos: ["shift+r"] },
  { id: "delete", group: "edit", combos: ["delete", "backspace"] },
  { id: "nudge", group: "edit", combos: ["arrowup", "arrowdown", "arrowleft", "arrowright"] },
  {
    id: "nudgeFar",
    group: "edit",
    combos: ["shift+arrowup", "shift+arrowdown", "shift+arrowleft", "shift+arrowright"],
  },
  { id: "copy", group: "edit", combos: ["mod+c"] },
  { id: "paste", group: "edit", combos: ["mod+v"] },
  { id: "duplicate", group: "edit", combos: ["mod+d"] },
  { id: "selectAll", group: "edit", combos: ["mod+a"] },
  { id: "escape", group: "edit", combos: ["escape"] },
  // 表示
  { id: "zoomIn", group: "view", combos: ["+", "="] },
  { id: "zoomOut", group: "view", combos: ["-", "_"] },
  { id: "zoomReset", group: "view", combos: ["0"] },
  { id: "fitAll", group: "view", combos: ["f"] },
  { id: "fitSelection", group: "view", combos: ["shift+f"] },
  { id: "toggleHeatmap", group: "view", combos: ["shift+h"] },
  { id: "toggleGrid", group: "view", combos: ["g"] },
  { id: "toggleMinimap", group: "view", combos: ["m"] },
] as const satisfies readonly ShortcutDef[];

export type ShortcutId = (typeof ROOM_SHORTCUTS)[number]["id"];

const keyName = (e: KeyboardEvent) => (e.key === " " ? "space" : e.key.toLowerCase());

/** キーイベントが combo に一致するか */
function parseCombo(combo: string): { key: string; mods: Set<string> } {
  if (combo === "+") return { key: "+", mods: new Set() };
  if (combo.endsWith("++")) return { key: "+", mods: new Set(combo.slice(0, -2).split("+")) };
  const parts = combo.split("+");
  const key = parts.pop()!;
  return { key, mods: new Set(parts) };
}

/** キーイベントが combo に一致するか */
export function matchCombo(e: KeyboardEvent, combo: string): boolean {
  const { key, mods } = parseCombo(combo);
  if (mods.has("mod") !== (e.ctrlKey || e.metaKey)) return false;
  if (mods.has("alt") !== e.altKey) return false;
  // 記号キー（+ など）は Shift の有無を問わない
  const symbol = !/^([a-z0-9]|arrow.*|space|delete|backspace|escape)$/.test(key);
  if (!symbol && mods.has("shift") !== e.shiftKey) return false;
  return keyName(e) === key;
}

export function matchShortcut(e: KeyboardEvent): ShortcutId | null {
  for (const s of ROOM_SHORTCUTS) if (s.combos.some((c) => matchCombo(e, c))) return s.id;
  return null;
}

/** 表示用（"mod+c" → "Ctrl+C" / "⌘C"） */
export function formatCombo(combo: string): string {
  const mac = isMac();
  const { key, mods } = parseCombo(combo);
  const name = (p: string) =>
    ({
      mod: mac ? "⌘" : "Ctrl",
      shift: mac ? "⇧" : "Shift",
      alt: mac ? "⌥" : "Alt",
      space: "Space",
      delete: "Delete",
      backspace: "Backspace",
      escape: "Esc",
      arrowup: "↑",
      arrowdown: "↓",
      arrowleft: "←",
      arrowright: "→",
    })[p] ?? p.toUpperCase();
  return [...mods, key].map(name).join(mac ? "" : "+");
}

/** ツールのショートカット（ツールパレットのツールチップ用） */
export const shortcutFor = (id: ShortcutId) =>
  formatCombo(ROOM_SHORTCUTS.find((s) => s.id === id)!.combos[0]);
