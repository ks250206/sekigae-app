/**
 * E2E 用: 自動操作ブラウザ（navigator.webdriver）でのみストアを公開し、
 * 部屋などの前提データをテストから用意できるようにする。通常の利用では何もしない。
 */
import { history, useProjectStore } from "@/store/project";

declare global {
  interface Window {
    __sekigae?: { store: typeof useProjectStore; history: typeof history };
  }
}

if (typeof navigator !== "undefined" && navigator.webdriver && typeof window !== "undefined")
  window.__sekigae = { store: useProjectStore, history };
