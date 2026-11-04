import { Redo2, Undo2 } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { history } from "@/store/project";
import { useHistoryState } from "@/store/selectors";
import { isEditableTarget, modKey } from "@/lib/keyboard";

export function UndoRedo() {
  const { t } = useTranslation();
  const { canUndo, canRedo } = useHistoryState();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return; // 入力中はブラウザ標準の Undo
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        history.undo();
      } else if ((k === "z" && e.shiftKey) || k === "y") {
        e.preventDefault();
        history.redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="hidden items-center md:flex">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            disabled={!canUndo}
            onClick={history.undo}
            aria-label={t("header.undo")}
            data-testid="undo"
          >
            <Undo2 className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {t("header.undo")} ({modKey()}+Z)
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            disabled={!canRedo}
            onClick={history.redo}
            aria-label={t("header.redo")}
            data-testid="redo"
          >
            <Redo2 className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {t("header.redo")} ({modKey()}+Shift+Z)
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
