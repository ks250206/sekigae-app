/**
 * E2E 専用フック。navigator.webdriver のときだけ ExportPage から dynamic import される。
 * 配置済みのサンプルプロジェクトをストアに読み込む。
 */
import { useProjectStore } from "@/store/project";
import { makeExportFixture } from "./fixture";

declare global {
  interface Window {
    __sekigaeExportTest?: { loadFixture: () => void };
  }
}

export function installExportTestHook(): void {
  window.__sekigaeExportTest = {
    loadFixture: () => useProjectStore.getState().replaceProject(makeExportFixture()),
  };
}
