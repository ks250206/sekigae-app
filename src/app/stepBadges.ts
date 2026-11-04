import type { StepId } from "./steps";

/**
 * ステッパーの完了度バッジ（例: 名簿 24 人、未配置 3 人）。
 * 各機能の実装時にここへ派生値を接続する。
 */
export function useStepBadges(): Partial<Record<StepId, string | number>> {
  return {};
}
