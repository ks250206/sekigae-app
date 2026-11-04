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
export { HelpMenu as HelpMenuSlot } from "@/features/onboarding/HelpMenu";
/** 全画面に重ねるグローバル要素（ウェルカムダイアログ、ツアー等） */
export { OnboardingOverlays as GlobalOverlaysSlot } from "@/features/onboarding/OnboardingOverlays";
