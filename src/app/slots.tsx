/**
 * ヘッダーに差し込む各機能のコンポーネント。
 * 各 Epic の実装でこのファイルの中身（import 先）を差し替える。
 */
export { ProjectSwitcher as ProjectSwitcherSlot } from "@/features/project/ProjectSwitcher";
export { SaveStatus as SaveStatusSlot } from "@/features/project/SaveStatus";
/** 永続化まわりのグローバル UI（復旧ダイアログ・他タブ通知・プロジェクト管理ダイアログ等） */
export { PersistenceHost as PersistenceSlot } from "@/features/project/PersistenceHost";
export { UndoRedo as UndoRedoSlot } from "./UndoRedo";
export function HelpMenuSlot() {
  return null;
}
/** 全画面に重ねるグローバル要素（ウェルカムダイアログ、ツアー等） */
export function GlobalOverlaysSlot() {
  return null;
}
