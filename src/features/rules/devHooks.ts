/**
 * E2E / 開発用のフック。開発ビルドか自動操作（navigator.webdriver）のときだけ window.__sekigae を生やす。
 */
import type { FixtureSize } from "@/test/factories";
import { history, useProjectStore } from "@/store/project";

declare global {
  interface Window {
    __sekigae?: Record<string, unknown>;
  }
}

export function installRulesDevHooks() {
  if (typeof window === "undefined") return;
  if (!(import.meta.env.DEV || navigator.webdriver)) return;
  window.__sekigae = {
    ...window.__sekigae,
    store: useProjectStore,
    history,
    /** テスト用のプロジェクトを読み込む（small / medium / large） */
    seed: async (size: FixtureSize = "medium") => {
      const { makeProject } = await import("@/test/factories");
      useProjectStore.getState().replaceProject(makeProject(size));
      history.clear();
    },
    rules: () => useProjectStore.getState().project.rules,
  };
}
