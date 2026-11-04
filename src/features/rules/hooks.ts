import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useProject } from "@/store/selectors";
import { analyzeRules } from "./analysis";
import { makeSummaryCtx, type LooseT, type SummaryCtx } from "./summary";

/** rules 名前空間の t（動的キー用に緩く型付け） */
export function useRT(): { t: LooseT; tc: LooseT; lng: string } {
  const { t, i18n } = useTranslation("rules");
  const { t: tc } = useTranslation("common");
  return {
    t: t as unknown as LooseT,
    tc: tc as unknown as LooseT,
    lng: i18n.resolvedLanguage ?? i18n.language,
  };
}

/** 現在の言語・プロジェクトでのサマリーコンテキスト */
export function useSummaryCtx(): SummaryCtx {
  const { lng } = useRT();
  const project = useProject();
  return useMemo(() => makeSummaryCtx(project, lng), [project, lng]);
}

export function useRulesAnalysis() {
  const project = useProject();
  return useMemo(() => analyzeRules(project), [project]);
}
