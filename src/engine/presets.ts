/**
 * 席配置プリセット = ソフト目的関数のテンプレート（#108, docs/DESIGN.md §6）。
 * 各プリセットは soft ルールブロックの組（+ 名前順の特別項）として表し、組み合わせると重みを合算する。
 */
import type { RuleBlock } from "@/domain/rules";
import type { PresetTermInput } from "./model";
import type { PresetId, PresetSpec } from "./types";

const ALL = { op: "all" } as const;

export const PRESET_IDS: readonly PresetId[] = [
  "mixLab",
  "seniorBack",
  "seniorFront",
  "clusterLab",
  "clusterRole",
  "mixRole",
  "keepPrevious",
  "movePrevious",
  "nameOrder",
  "random",
];

/** 複合研究室向けの既定おすすめ */
export const DEFAULT_PRESET: PresetId = "mixLab";

/** プリセット項の既定の重み（soft ルールの重み 1〜5 と同じ尺度） */
export const PRESET_DEFAULT_WEIGHT: Record<PresetId, number> = {
  seniorBack: 2,
  seniorFront: 2,
  clusterLab: 2,
  clusterRole: 2,
  mixRole: 2,
  mixLab: 2,
  keepPrevious: 2,
  movePrevious: 2,
  nameOrder: 2,
  random: 0,
};

/** 昨年度の案が必要なプリセット */
export const PRESET_NEEDS_PREVIOUS: ReadonlySet<PresetId> = new Set([
  "keepPrevious",
  "movePrevious",
]);

/**
 * プリセットを「ルールとして保存」するときのブロック（soft で保存する想定）。
 * 名前順・完全ランダムは対応するブロックが無いので空配列。
 */
export function presetToRuleBlocks(id: PresetId): RuleBlock[] {
  switch (id) {
    case "seniorBack":
      return [{ type: "depth.order", people: ALL, direction: "seniorBack" }];
    case "seniorFront":
      return [{ type: "depth.order", people: ALL, direction: "seniorFront" }];
    case "clusterLab":
      return [{ type: "group.cluster", people: ALL, attr: "lab" }];
    case "clusterRole":
      return [{ type: "group.cluster", people: ALL, attr: "role" }];
    case "mixRole":
      return [{ type: "group.mixAdjacent", people: ALL, attr: "role" }];
    case "mixLab":
      return [
        { type: "group.labBalance", people: ALL },
        { type: "group.mixAdjacent", people: ALL, attr: "lab" },
      ];
    case "keepPrevious":
      return [{ type: "prev.same", people: ALL, scope: "seat" }];
    case "movePrevious":
      return [{ type: "prev.different", people: ALL, scope: "room" }];
    case "nameOrder":
    case "random":
      return [];
  }
}

/** プリセット指定を正規化（同じプリセットは重みを合算） */
export function presetTerms(specs: readonly PresetSpec[] = []): PresetTermInput[] {
  const weights = new Map<PresetId, number>();
  for (const spec of specs) {
    const id = typeof spec === "string" ? spec : spec.id;
    const w =
      typeof spec === "string"
        ? PRESET_DEFAULT_WEIGHT[id]
        : (spec.weight ?? PRESET_DEFAULT_WEIGHT[id]);
    weights.set(id, (weights.get(id) ?? 0) + w);
  }
  return [...weights].map(([id, weight]) => ({ id, weight, blocks: presetToRuleBlocks(id) }));
}
