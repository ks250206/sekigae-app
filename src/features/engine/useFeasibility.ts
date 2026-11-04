/**
 * ルール画面の実行可能性インジケータ用（#111）。プロジェクトの変更からデバウンスしてチェックする。
 */
import { useEffect, useMemo, useState } from "react";
import type { ID } from "@/domain/schema";
import { checkFeasibility, type FeasibilityResult, type SolveScope } from "@/engine";
import { useProjectStore } from "@/store/project";

export interface UseFeasibility {
  /** 最後のチェック結果（初回のチェック前は null） */
  result: FeasibilityResult | null;
  /** 変更後、チェック待ち */
  pending: boolean;
}

export function useFeasibility(
  opts: { planId?: ID; scope?: SolveScope; debounceMs?: number } = {},
): UseFeasibility {
  const { planId, scope, debounceMs = 300 } = opts;
  const project = useProjectStore((s) => s.project);
  const pid = planId ?? project.activePlanId;
  const plan = project.plans.find((p) => p.id === pid);
  const prev = project.previousPlanId
    ? project.plans.find((p) => p.id === project.previousPlanId)
    : undefined;
  const { members, rules, layout } = project;
  const scopeKey = JSON.stringify(scope ?? { kind: "all" });
  const locks = plan?.locks;
  const assignment = plan?.assignment;
  // 入力（ルール・名簿・レイアウト・昨年度・ロックとその住人・範囲）が変わるたびに新しいトークン
  const token = useMemo(
    () => ({ members, rules, layout, prev, locks, assignment, pid, scopeKey }),
    [members, rules, layout, prev, locks, assignment, pid, scopeKey],
  );
  const [state, setState] = useState<{ result: FeasibilityResult | null; token: object | null }>({
    result: null,
    token: null,
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      const result = checkFeasibility(useProjectStore.getState().project, token.pid, {
        scope: JSON.parse(token.scopeKey) as SolveScope,
      });
      setState({ result, token });
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [token, debounceMs]);

  return { result: state.result, pending: state.token !== token };
}
