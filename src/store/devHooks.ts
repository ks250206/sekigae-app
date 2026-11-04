/**
 * E2E / 開発用のグローバルフック `window.__sekigae`。
 * 開発ビルドか自動操作ブラウザ（navigator.webdriver）のときだけ設定し、通常の利用では何もしない。
 */
import type { FixtureSize } from "@/test/factories";
import { history, useProjectStore } from "./project";

export interface SekigaeDevHooks {
  store: typeof useProjectStore;
  history: typeof history;
  /** テスト用のプロジェクトを読み込む（small / medium / large） */
  seed: (size?: FixtureSize) => Promise<void>;
  rules: () => ReturnType<typeof useProjectStore.getState>["project"]["rules"];
}

declare global {
  interface Window {
    __sekigae?: SekigaeDevHooks;
  }
}

export function installDevHooks() {
  if (typeof window === "undefined" || window.__sekigae) return;
  if (!(import.meta.env.DEV || navigator.webdriver)) return;
  window.__sekigae = {
    store: useProjectStore,
    history,
    seed: async (size = "medium") => {
      const { makeProject } = await import("@/test/factories");
      useProjectStore.getState().replaceProject(makeProject(size));
      history.clear();
    },
    rules: () => useProjectStore.getState().project.rules,
  };
}
