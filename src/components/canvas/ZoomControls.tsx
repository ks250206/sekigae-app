/** ズーム操作: − / % 表示（クリックで 100%）/ ＋ / 全体表示 / 選択範囲を表示 */
import { Focus, Maximize, Minus, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useViewState } from "./context";
import { BASE_SCALE, MAX_SCALE, MIN_SCALE, type ViewportController } from "./viewport";

export interface ZoomControlsProps {
  viewport: ViewportController;
  onFitAll?: () => void;
  /** 未指定なら「選択範囲を表示」ボタンは無効 */
  onFitSelection?: () => void;
  className?: string;
}

export function ZoomControls({ viewport, onFitAll, onFitSelection, className }: ZoomControlsProps) {
  const { t } = useTranslation("rooms");
  const scale = useViewState(viewport, (s) => s.scale);
  const pct = Math.round((scale / BASE_SCALE) * 100);
  return (
    <div
      className={cn(
        "bg-popover/90 flex items-center gap-0.5 rounded-lg border p-0.5 shadow-lg backdrop-blur",
        className,
      )}
      data-testid="zoom-controls"
    >
      <Tip label={`${t("canvas.zoomOut")} (−)`}>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={t("canvas.zoomOut")}
          disabled={scale <= MIN_SCALE}
          onClick={() => viewport.zoomBy(1 / 1.25)}
        >
          <Minus className="size-3.5" />
        </Button>
      </Tip>
      <Tip label={`${t("canvas.zoomReset")} (0)`}>
        <button
          type="button"
          className="hover:bg-accent h-7 min-w-12 rounded-md px-1 text-xs font-medium tabular-nums transition-colors"
          onClick={() => viewport.reset()}
          data-testid="zoom-percent"
        >
          {pct}%
        </button>
      </Tip>
      <Tip label={`${t("canvas.zoomIn")} (+)`}>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={t("canvas.zoomIn")}
          disabled={scale >= MAX_SCALE}
          onClick={() => viewport.zoomBy(1.25)}
        >
          <Plus className="size-3.5" />
        </Button>
      </Tip>
      {onFitAll && (
        <>
          <div className="bg-border mx-0.5 h-5 w-px" />
          <Tip label={`${t("canvas.fitAll")} (F)`}>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={t("canvas.fitAll")}
              onClick={onFitAll}
            >
              <Maximize className="size-3.5" />
            </Button>
          </Tip>
          <Tip label={`${t("canvas.fitSelection")} (Shift+F)`}>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={t("canvas.fitSelection")}
              disabled={!onFitSelection}
              onClick={onFitSelection}
            >
              <Focus className="size-3.5" />
            </Button>
          </Tip>
        </>
      )}
    </div>
  );
}

function Tip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}
