/**
 * ヘッダーに差し込む各機能のコンポーネント。
 * 各 Epic の実装でこのファイルの中身（import 先）を差し替える。
 */
export function ProjectSwitcherSlot() {
  return null;
}
export function SaveStatusSlot() {
  return null;
}
export { UndoRedo as UndoRedoSlot } from "./UndoRedo";
export function HelpMenuSlot() {
  return null;
}
/** 全画面に重ねるグローバル要素（ウェルカムダイアログ、ツアー等） */
export function GlobalOverlaysSlot() {
  return null;
}
