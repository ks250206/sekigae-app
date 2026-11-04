import { AlertTriangle, Check, CloudOff, Loader2, PauseCircle, RotateCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDateTime } from "@/lib/format";
import { retrySave, usePersistence } from "@/store/persistence";

type View = "saved" | "pending" | "error" | "paused" | "memory";

/** ヘッダーの保存状態（保存済み / 保存中 / 失敗 + 再試行） */
export function SaveStatus() {
  const { t, i18n } = useTranslation();
  const { status, savedAt, mode, conflict, recovery } = usePersistence();
  const view: View =
    status === "error"
      ? "error"
      : conflict || recovery?.atBoot
        ? "paused"
        : mode === "memory"
          ? "memory"
          : status;

  const lng = i18n.resolvedLanguage ?? "ja";
  const label = {
    saved: t("save.saved"),
    pending: t("save.pending"),
    error: t("save.failed"),
    paused: t("save.paused"),
    memory: t("save.memoryOnly"),
  }[view];
  const tip =
    view === "saved" && savedAt ? t("save.savedAt", { time: formatDateTime(savedAt, lng) }) : label;
  const Icon = {
    saved: Check,
    pending: Loader2,
    error: AlertTriangle,
    paused: PauseCircle,
    memory: CloudOff,
  }[view];
  const tone =
    view === "error"
      ? "text-destructive"
      : view === "paused" || view === "memory"
        ? "text-amber-600 dark:text-amber-400"
        : "text-muted-foreground";

  return (
    <div
      className="hidden items-center gap-1 md:flex"
      data-testid="save-status"
      data-state={view}
      aria-live="polite"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`flex items-center gap-1 text-xs whitespace-nowrap ${tone}`}
            role="status"
            aria-label={`${t("save.status")}: ${tip}`}
          >
            <Icon className={`size-3.5 ${view === "pending" ? "animate-spin" : ""}`} />
            <span className="hidden lg:inline">{label}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent>{tip}</TooltipContent>
      </Tooltip>
      {view === "error" && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => retrySave()}
          data-testid="save-retry"
        >
          <RotateCw className="size-3.5" />
          {t("save.retry")}
        </Button>
      )}
    </div>
  );
}
