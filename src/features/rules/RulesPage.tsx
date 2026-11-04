import { useMemo } from "react";
import type { ID } from "@/domain/schema";
import { useFeasibility, useViolations } from "@/features/engine";
import { installRulesDevHooks } from "./devHooks";
import { RulesEditor } from "./RulesEditor";

installRulesDevHooks();

/** ③ ルール画面。違反数（現在の配置案）と実行可能性を配置エンジンから渡す */
export default function RulesPage() {
  const evaluation = useViolations();
  const { result, pending } = useFeasibility();

  const violationCounts = useMemo(() => {
    const counts: Record<ID, number> = {};
    for (const v of evaluation.violations) {
      if (v.ruleId && v.violation > 0) counts[v.ruleId] = (counts[v.ruleId] ?? 0) + 1;
    }
    return counts;
  }, [evaluation]);

  const feasibility = useMemo(() => {
    if (pending && !result) return { status: "checking" as const };
    if (!result) return undefined;
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    const conflictRuleIds = [
      ...new Set(errors.flatMap((d) => ("ruleIds" in d.params ? (d.params.ruleIds as ID[]) : []))),
    ];
    return {
      status: result.ok ? ("ok" as const) : ("infeasible" as const),
      conflictRuleIds,
    };
  }, [result, pending]);

  return <RulesEditor violationCounts={violationCounts} feasibility={feasibility} />;
}
