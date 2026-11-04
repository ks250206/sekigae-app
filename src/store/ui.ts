import { create } from "zustand";
import type { ID } from "@/domain/schema";

/** 永続化・Undo 対象外の一時的な UI 状態 */
export interface UiState {
  /** 選択中の部屋・席・入口・メンバー */
  selection: { roomIds: ID[]; seatIds: ID[]; entranceIds: ID[]; memberIds: ID[] };
  /** 席配置画面で昨年度を編集中か */
  editingPrevious: boolean;
  setSelection: (patch: Partial<UiState["selection"]>) => void;
  clearSelection: () => void;
  setEditingPrevious: (v: boolean) => void;
}

const emptySelection = { roomIds: [], seatIds: [], entranceIds: [], memberIds: [] };

export const useUiStore = create<UiState>()((set) => ({
  selection: emptySelection,
  editingPrevious: false,
  setSelection: (patch) => set((s) => ({ selection: { ...s.selection, ...patch } })),
  clearSelection: () => set({ selection: emptySelection }),
  setEditingPrevious: (editingPrevious) => set({ editingPrevious }),
}));
