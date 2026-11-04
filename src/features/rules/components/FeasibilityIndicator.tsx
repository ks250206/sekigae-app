/**
 * 実行可能性インジケータ（§7.4 右上）。エンジン側（useFeasibility）が props を渡すまで何も描画しない。
 */
import { CircleCheck, CircleHelp, CircleX, LoaderCircle } from "lucide-react";
import type { ID } from "@/domain/schema";
import { cn } from "@/lib/utils";
import { useRT } from "../hooks";

export interface FeasibilityIndicatorProps {
  /** 未指定なら何も描画しない */
  status?: "ok" | "infeasible" | "checking" | "unknown";
  /** 補足（例: 衝突しているルールの説明） */
  message?: string;
  /** 満たせない原因のルール（クリックでハイライトなどに使う） */
  conflictRuleIds?: ID[];
  onClick?: () => void;
}

export function FeasibilityIndicator({ status, message, onClick }: FeasibilityIndicatorProps) {
  const { t } = useRT();
  if (!status) return null;
  const Icon =
    status === "ok"
      ? CircleCheck
      : status === "infeasible"
        ? CircleX
        : status === "checking"
          ? LoaderCircle
          : CircleHelp;
  return (
    <button
      type="button"
      onClick={onClick}
      title={message ?? t(`feasibility.${status}`)}
      data-testid="feasibility-indicator"
      data-status={status}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        status === "ok" && "border-success/40 bg-success/10 text-success",
        status === "infeasible" && "border-destructive/40 bg-destructive/10 text-destructive",
        (status === "checking" || status === "unknown") && "text-muted-foreground",
      )}
    >
      <Icon className={cn("size-4", status === "checking" && "animate-spin")} />
      {t(`feasibility.${status}`)}
    </button>
  );
}
