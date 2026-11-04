/**
 * プロジェクト状態ストア（Zustand + immer + zundo）。
 * - 状態は `project` のみ。アクションは slices/* に分割。
 * - Undo/Redo は `project` の差分を zundo で記録（UI ストア・prefs は対象外）。
 */
import { produce, type Draft } from "immer";
import { temporal } from "zundo";
import { create } from "zustand";
import { createEmptyProject, now } from "@/domain/factory";
import type { Project } from "@/domain/schema";
import { createLayoutSlice, type LayoutSlice } from "./slices/layout";
import { createMembersSlice, type MembersSlice } from "./slices/members";
import { createPlansSlice, type PlansSlice } from "./slices/plans";
import { createRulesSlice, type RulesSlice } from "./slices/rules";

export type Recipe = (draft: Draft<Project>) => void;

export interface CoreSlice {
  project: Project;
  /** プロジェクトを丸ごと差し替える（読み込み・切替時）。Undo 履歴は clearHistory で別途消す */
  replaceProject: (p: Project) => void;
  /** 任意の変更（immer レシピ）。updatedAt を更新する */
  update: (recipe: Recipe) => void;
  renameProject: (name: string) => void;
  setAdjacency: (mode: 4 | 8) => void;
}

export type ProjectStore = CoreSlice & LayoutSlice & MembersSlice & RulesSlice & PlansSlice;

export const useProjectStore = create<ProjectStore>()(
  temporal(
    (set, get) => {
      const update = (recipe: Recipe) =>
        set((s) => ({
          project: produce(s.project, (d) => {
            recipe(d);
            d.updatedAt = now();
          }),
        }));
      return {
        project: createEmptyProject(),
        replaceProject: (project) => set({ project }),
        update,
        renameProject: (name) => update((d) => void (d.name = name)),
        setAdjacency: (mode) => update((d) => void (d.settings.adjacency = mode)),
        ...createLayoutSlice(update, get),
        ...createMembersSlice(update, get),
        ...createRulesSlice(update, get),
        ...createPlansSlice(update, get),
      };
    },
    {
      partialize: (s) => ({ project: s.project }),
      equality: (a, b) => a.project === b.project,
      limit: 200,
    },
  ),
);

export const getProject = () => useProjectStore.getState().project;

// ---------------------------------------------------------------------------
// 履歴操作
// ---------------------------------------------------------------------------

export const history = {
  undo: () => useProjectStore.temporal.getState().undo(),
  redo: () => useProjectStore.temporal.getState().redo(),
  clear: () => useProjectStore.temporal.getState().clear(),
};

let txSnapshot: { project: Project } | null = null;

/**
 * ドラッグ等の連続更新を 1 回の Undo にまとめる。
 * begin → 何度でも update → commit。cancel で開始時の状態に戻す。
 */
export const transaction = {
  begin() {
    if (txSnapshot) return;
    txSnapshot = { project: useProjectStore.getState().project };
    useProjectStore.temporal.getState().pause();
  },
  commit() {
    if (!txSnapshot) return;
    const t = useProjectStore.temporal;
    t.getState().resume();
    if (useProjectStore.getState().project !== txSnapshot.project) {
      t.setState((s) => ({
        pastStates: [...s.pastStates, txSnapshot!].slice(-200),
        futureStates: [],
      }));
    }
    txSnapshot = null;
  },
  cancel() {
    if (!txSnapshot) return;
    useProjectStore.setState({ project: txSnapshot.project });
    useProjectStore.temporal.getState().resume();
    txSnapshot = null;
  },
  get active() {
    return txSnapshot !== null;
  },
};

/** fn 内の更新を 1 回の Undo にまとめる */
export function batch(fn: () => void) {
  const nested = transaction.active;
  if (!nested) transaction.begin();
  try {
    fn();
  } finally {
    if (!nested) transaction.commit();
  }
}
