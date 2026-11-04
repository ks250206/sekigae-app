import { Link, Outlet } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LanguageMenu, ThemeMenu } from "./HeaderMenus";
import { PwaPrompt } from "./PwaPrompt";
import {
  GlobalOverlaysSlot,
  HelpMenuSlot,
  ProjectSwitcherSlot,
  SaveStatusSlot,
  UndoRedoSlot,
} from "./slots";
import { StepNav } from "./StepNav";
import { ThemeSync } from "./ThemeSync";

export function AppShell() {
  const { t } = useTranslation();
  return (
    <TooltipProvider delayDuration={300}>
      <ThemeSync />
      <div className="flex h-dvh flex-col">
        <header className="bg-background/80 sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b px-3 backdrop-blur md:px-4">
          <Link to="/rooms" className="flex items-center gap-2 font-semibold tracking-tight">
            <img src="./favicon.svg" alt="" className="size-7" />
            <span className="hidden sm:inline">{t("app.name")}</span>
          </Link>
          <ProjectSwitcherSlot />
          <div className="flex-1" />
          <StepNav />
          <div className="flex-1" />
          <SaveStatusSlot />
          <UndoRedoSlot />
          <LanguageMenu />
          <ThemeMenu />
          <HelpMenuSlot />
        </header>
        <main className="relative min-h-0 flex-1 pb-14 md:pb-0">
          <Outlet />
        </main>
        <StepNav variant="bottom" />
      </div>
      <GlobalOverlaysSlot />
      <PwaPrompt />
      <Toaster richColors closeButton position="bottom-right" />
    </TooltipProvider>
  );
}
