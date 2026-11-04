/**
 * 現在の配置の違反をメインスレッドでライブ評価する（#111）。
 * ルール・名簿・レイアウト・昨年度が変わらない限りコンパイル済みの評価器を再利用し、
 * 手動編集（割当の変更）では評価だけをやり直す（100 人規模で 1ms 未満）。
 */
import { useMemo } from "react";
import type { ID } from "@/domain/schema";
import { createPlanEvaluator, type PlanEvaluation, type PresetSpec } from "@/engine";
import { useProjectStore } from "@/store/project";

const EMPTY: Record<ID, ID> = {};

export function useViolations(planId?: ID, opts: { presets?: PresetSpec[] } = {}): PlanEvaluation {
  const project = useProjectStore((s) => s.project);
  const pid = planId ?? project.activePlanId;
  const plan = project.plans.find((p) => p.id === pid);
  const prev = project.previousPlanId
    ? project.plans.find((p) => p.id === project.previousPlanId)
    : undefined;
  const { members, labs, rules, layout, settings } = project;
  const presetKey = JSON.stringify(opts.presets ?? []);

  // 割当以外の入力（名簿・研究室・ルール・レイアウト・設定・昨年度）が変わったときだけコンパイルし直す
  const evaluator = useMemo(
    () =>
      createPlanEvaluator(
        {
          ...useProjectStore.getState().project,
          members,
          labs,
          rules,
          layout,
          settings,
          plans: prev ? [prev] : [],
          previousPlanId: prev?.id,
        },
        null,
        { presets: JSON.parse(presetKey) as PresetSpec[] },
      ),
    [members, labs, rules, layout, settings, prev, presetKey],
  );
  const assignment = plan?.assignment ?? EMPTY;
  return useMemo(() => evaluator.evaluate(assignment), [evaluator, assignment]);
}
