/** ルール画面の一時的な UI 状態（永続化・Undo 対象外） */
import { create } from "zustand";
import type { RuleCategory } from "@/domain/rules";
import type { ID } from "@/domain/schema";

export interface RuleFilters {
  categories: RuleCategory[];
  strength: "all" | "hard" | "soft";
  enabled: "all" | "on" | "off";
  violations: boolean;
  related: { kind: "member" | "room"; id: ID } | null;
}

export const EMPTY_FILTERS: RuleFilters = {
  categories: [],
  strength: "all",
  enabled: "all",
  violations: false,
  related: null,
};

export interface RulesUiState {
  /** スクロール・ハイライトするルール */
  focusRuleId: ID | null;
  /** 追加直後に自動で開くスロット（path = 子ルールのパス） */
  pendingOpen: { ruleId: ID; path: string; slot: string } | null;
  view: "expanded" | "collapsed";
  filters: RuleFilters;
  focusRule: (id: ID | null) => void;
  requestOpenSlot: (ruleId: ID, slot: string, path?: string) => void;
  clearPendingOpen: () => void;
  setView: (v: RulesUiState["view"]) => void;
  setFilters: (patch: Partial<RuleFilters>) => void;
  resetFilters: () => void;
}

export const useRulesUi = create<RulesUiState>()((set) => ({
  focusRuleId: null,
  pendingOpen: null,
  view: "expanded",
  filters: EMPTY_FILTERS,
  focusRule: (focusRuleId) => set({ focusRuleId }),
  requestOpenSlot: (ruleId, slot, path = "") => set({ pendingOpen: { ruleId, slot, path } }),
  clearPendingOpen: () => set({ pendingOpen: null }),
  setView: (view) => set({ view }),
  setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
  resetFilters: () => set({ filters: EMPTY_FILTERS }),
}));

export const filtersActive = (f: RuleFilters) =>
  f.categories.length > 0 ||
  f.strength !== "all" ||
  f.enabled !== "all" ||
  f.violations ||
  f.related !== null;
