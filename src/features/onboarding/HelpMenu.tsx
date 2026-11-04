import { useRouterState } from "@tanstack/react-router";
import { BookOpen, CircleHelp, FlaskConical, Info, Keyboard, Map } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { confirm } from "@/components/confirm";
import { isEditableTarget } from "@/lib/keyboard";
import { openSampleProject } from "./actions";
import { useOnboardingUi } from "./onboardingStore";
import { startTour } from "./tour";
import { MAIN_TOUR, PAGE_TOURS } from "./tourSteps";

export const APP_VERSION = "1.0.0";

export function HelpMenu() {
  const { t } = useTranslation("onboarding");
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const setShortcutsOpen = useOnboardingUi((s) => s.setShortcutsOpen);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "?" && !isEditableTarget(e.target)) {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setShortcutsOpen]);

  const pageTour = PAGE_TOURS[pathname];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("help.title")} data-testid="help-menu">
          <CircleHelp className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>{t("help.title")}</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => void startTour(MAIN_TOUR)}>
          <Map className="size-4" />
          {t("help.tour")}
        </DropdownMenuItem>
        {pageTour && pageTour.length > 0 && (
          <DropdownMenuItem onSelect={() => void startTour(pageTour, { markSeen: false })}>
            <BookOpen className="size-4" />
            {t("help.pageTour")}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => setShortcutsOpen(true)}>
          <Keyboard className="size-4" />
          {t("help.shortcuts")}
          <span className="text-muted-foreground ml-auto text-xs">?</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            if (
              await confirm({
                title: t("help.sampleConfirmTitle"),
                description: t("help.sampleConfirmBody"),
              })
            )
              openSampleProject();
          }}
        >
          <FlaskConical className="size-4" />
          {t("help.sample")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          <Info className="size-4" />
          {t("help.version", { version: APP_VERSION })}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
