/** フローティングのツールパレット（左側） */
import { ArrowUp, LayoutTemplate } from "lucide-react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FACING_ANGLE } from "@/components/canvas";
import { cn } from "@/lib/utils";
import { rotate } from "../actions";
import { useEditor } from "../editorStore";
import { shortcutFor } from "../shortcuts";
import { TOOLS } from "../tools";
import { TemplatePicker } from "./TemplatePicker";

export function ToolPalette() {
  const { t } = useTranslation("rooms");
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  const facing = useEditor((s) => s.facing);
  const templateActive = useEditor(
    (s) => s.placement?.kind === "seats" && s.placement.source === "template",
  );

  return (
    <div
      className="bg-popover/90 absolute top-1/2 left-3 z-10 flex -translate-y-1/2 flex-col gap-0.5 rounded-xl border p-1 shadow-lg backdrop-blur"
      role="toolbar"
      aria-orientation="vertical"
      aria-label={t("tools.label")}
      data-tour="room-tools"
      data-testid="tool-palette"
    >
      {TOOLS.map(({ id, icon: Icon, shortcut }) => {
        const active = tool === id;
        return (
          <Tooltip key={id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={t(`tools.${id}`)}
                aria-pressed={active}
                data-testid={`tool-${id}`}
                onClick={() => setTool(id)}
                className={cn(
                  "relative grid size-9 place-items-center rounded-lg transition-colors",
                  "focus-visible:ring-ring/50 outline-none focus-visible:ring-2",
                  active
                    ? "text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="room-tool-active"
                    className="bg-primary absolute inset-0 rounded-lg shadow-sm"
                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  />
                )}
                <Icon className="relative size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <div className="font-medium">
                {t(`tools.${id}`)} <kbd className="ml-1 opacity-70">{shortcutFor(shortcut)}</kbd>
              </div>
              <div className="opacity-80">{t(`tools.hint.${id}`)}</div>
            </TooltipContent>
          </Tooltip>
        );
      })}
      <div className="bg-border mx-1.5 my-1 h-px" />
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="text-muted-foreground hover:bg-accent hover:text-foreground grid size-9 place-items-center rounded-lg transition-colors"
            aria-label={t("tools.facing", { dir: t(`facing.${facing}`) })}
            data-testid="default-facing"
            onClick={() => rotate(1)}
          >
            <ArrowUp
              className="size-4 transition-transform duration-200"
              style={{ transform: `rotate(${FACING_ANGLE[facing]}deg)` }}
            />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">
          {t("tools.facing", { dir: t(`facing.${facing}`) })}{" "}
          <kbd className="ml-1 opacity-70">R</kbd>
        </TooltipContent>
      </Tooltip>
      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  "grid size-9 place-items-center rounded-lg transition-colors",
                  templateActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
                aria-label={t("templates.title")}
                data-testid="template-button"
                data-tour="room-templates"
              >
                <LayoutTemplate className="size-4" />
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="right">{t("templates.title")}</TooltipContent>
        </Tooltip>
        <PopoverContent side="right" align="center" className="w-80 p-3">
          <TemplatePicker />
        </PopoverContent>
      </Popover>
    </div>
  );
}
