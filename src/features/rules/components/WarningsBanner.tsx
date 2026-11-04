/** ルール画面上部の警告サマリー（#98）: 参照切れの一括修正と静的な矛盾 */
import { ChevronDown, TriangleAlert, Unlink } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { batch, getProject, useProjectStore } from "@/store/project";
import { stripDangling, type RulesAnalysis } from "../analysis";
import { useRT, useSummaryCtx } from "../hooks";
import { useRulesUi } from "../rulesUi";
import { memberName, seatLabel } from "../summary";

export function WarningsBanner({ analysis }: { analysis: RulesAnalysis }) {
  const { t } = useRT();
  const ctx = useSummaryCtx();
  const focusRule = useRulesUi((s) => s.focusRule);
  const [open, setOpen] = useState(true);
  const danglingIds = [...analysis.dangling.keys()];
  const total = danglingIds.length + analysis.contradictions.length;
  if (!total) return null;

  const fixAll = () => {
    const p = getProject();
    batch(() => {
      for (const id of danglingIds) {
        const r = p.rules.find((x) => x.id === id);
        if (r) useProjectStore.getState().setRuleBlock(id, stripDangling(r.block, p));
      }
    });
    toast.success(t("warnings.fixed"));
  };
  const deleteAll = () => {
    useProjectStore.getState().removeRules(danglingIds);
    toast.success(t("warnings.deleted", { n: danglingIds.length }));
  };

  return (
    <div
      className="rounded-xl border border-amber-500/40 bg-amber-500/8 text-sm"
      data-testid="rules-warnings"
      role="status"
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 font-semibold"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <TriangleAlert className="size-4 text-amber-600 dark:text-amber-400" />
        {t("warnings.title", { n: total })}
        <ChevronDown className={cn("ml-auto size-4 transition-transform", !open && "-rotate-90")} />
      </button>
      {open && (
        <div className="flex flex-col gap-2 px-3 pb-3">
          {danglingIds.length > 0 && (
            <div className="bg-background/70 flex flex-wrap items-center gap-2 rounded-lg border px-2.5 py-1.5">
              <Unlink className="text-destructive size-4" />
              <span className="text-destructive font-medium">
                {t("warnings.danglingCount", { n: danglingIds.length })}
              </span>
              <span className="text-muted-foreground text-xs">{t("warnings.dangling")}</span>
              <span className="flex-1" />
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                onClick={fixAll}
                data-testid="fix-all-dangling"
              >
                {t("warnings.removeRefs")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive h-7"
                onClick={deleteAll}
              >
                {t("warnings.deleteRules")}
              </Button>
            </div>
          )}
          {analysis.contradictions.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground text-xs font-semibold">
                {t("warnings.contradictions", { n: analysis.contradictions.length })}
              </span>
              {analysis.contradictions.map((c, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 text-xs"
                  data-contradiction={c.code}
                >
                  <span className="size-1.5 rounded-full bg-amber-500" />
                  <span className="flex-1">
                    {t(`warnings.${c.code}`, {
                      name: memberName(ctx, c.memberId),
                      seat: seatLabel(ctx, c.seatId),
                    })}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-xs"
                    onClick={() => c.ruleIds[0] && focusRule(c.ruleIds[0])}
                  >
                    {t("warnings.jump")}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
