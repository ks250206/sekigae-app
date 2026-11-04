import { ArrowRight, FileJson, FlaskConical, Lock, Sparkles, SquarePlus } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { STEPS } from "@/app/steps";
import { useTheme } from "@/app/theme";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { usePrefs, type LanguagePref, type ThemePref } from "@/store/prefs";
import { useProjectStore } from "@/store/project";
import { openSampleProject } from "./actions";
import { importBackupFile } from "./importBackup";
import { useOnboardingUi } from "./onboardingStore";
import { startTour } from "./tour";
import { MAIN_TOUR } from "./tourSteps";

/** 初回起動時のウェルカムダイアログ。#139 */
export function WelcomeDialog() {
  const { t, i18n } = useTranslation("onboarding");
  const { t: tc } = useTranslation();
  const open = useOnboardingUi((s) => s.welcomeOpen);
  const setOpen = useOnboardingUi((s) => s.setWelcomeOpen);
  const completed = usePrefs((s) => s.onboardingCompleted);
  const setCompleted = usePrefs((s) => s.setOnboardingCompleted);
  const setLanguage = usePrefs((s) => s.setLanguage);
  const { theme, setTheme } = useTheme();
  const isEmpty = useProjectStore(
    (s) => s.project.layout.rooms.length === 0 && s.project.members.length === 0,
  );
  const [withTour, setWithTour] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!completed && isEmpty) setOpen(true);
    // 初回マウント時のみ判定
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = (tour: boolean) => {
    setCompleted(true);
    setOpen(false);
    if (tour) setTimeout(() => void startTour(MAIN_TOUR), 250);
  };

  const choose = async (kind: "sample" | "empty" | "import") => {
    if (kind === "sample") {
      openSampleProject();
      finish(withTour);
    } else if (kind === "empty") {
      finish(withTour);
    } else {
      fileRef.current?.click();
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const ok = await importBackupFile(file);
    if (ok) {
      toast.success(t("welcome.imported"));
      finish(false);
    } else toast.error(t("welcome.importFailed"));
  };

  const lang = (i18n.resolvedLanguage ?? "ja") as LanguagePref;

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : finish(false))}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-2xl" data-testid="welcome-dialog">
        <div className="from-primary/15 via-primary/5 relative bg-gradient-to-br to-transparent px-6 pt-6 pb-4">
          <div className="flex items-center gap-3">
            <img src="./favicon.svg" alt="" className="size-10 drop-shadow" />
            <div>
              <DialogTitle className="text-xl">{t("welcome.title")}</DialogTitle>
              <DialogDescription>{t("welcome.subtitle")}</DialogDescription>
            </div>
          </div>
          <ol className="mt-5 flex flex-wrap items-center gap-1.5 text-xs">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <motion.li
                  key={s.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 * i }}
                  className="flex items-center gap-1.5"
                >
                  <span className="bg-background/80 flex items-center gap-1.5 rounded-full border px-2.5 py-1 shadow-sm">
                    <Icon className="text-primary size-3.5" />
                    {tc(`steps.${s.id}`)}
                  </span>
                  {i < STEPS.length - 1 && <ArrowRight className="text-muted-foreground size-3" />}
                </motion.li>
              );
            })}
          </ol>
        </div>

        <div className="grid gap-3 px-6 sm:grid-cols-3">
          {(
            [
              { kind: "sample", icon: FlaskConical, accent: true },
              { kind: "empty", icon: SquarePlus, accent: false },
              { kind: "import", icon: FileJson, accent: false },
            ] as const
          ).map(({ kind, icon: Icon, accent }) => (
            <button
              key={kind}
              type="button"
              data-testid={`welcome-${kind}`}
              onClick={() => void choose(kind)}
              className={cn(
                "group hover:border-primary/60 hover:bg-accent/50 flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md",
                accent && "border-primary/40 bg-primary/5",
              )}
            >
              <span
                className={cn(
                  "flex size-9 items-center justify-center rounded-lg",
                  accent ? "bg-primary text-primary-foreground" : "bg-muted",
                )}
              >
                <Icon className="size-5" />
              </span>
              <span className="font-medium">{t(`welcome.${kind}.title`)}</span>
              <span className="text-muted-foreground text-xs leading-relaxed">
                {t(`welcome.${kind}.body`)}
              </span>
              {accent && (
                <span className="text-primary flex items-center gap-1 text-[11px] font-medium">
                  <Sparkles className="size-3" />
                  {t("welcome.recommended")}
                </span>
              )}
            </button>
          ))}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />

        <div className="bg-muted/40 mt-2 flex flex-wrap items-center gap-x-6 gap-y-3 border-t px-6 py-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs">{tc("header.language")}</span>
            <ToggleGroup
              type="single"
              size="sm"
              variant="outline"
              value={lang}
              onValueChange={(v) => {
                if (!v) return;
                setLanguage(v as LanguagePref);
                void i18n.changeLanguage(v);
              }}
            >
              <ToggleGroupItem value="ja">日本語</ToggleGroupItem>
              <ToggleGroupItem value="en">English</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs">{tc("header.theme")}</span>
            <ToggleGroup
              type="single"
              size="sm"
              variant="outline"
              value={theme}
              onValueChange={(v) => v && setTheme(v as ThemePref)}
            >
              {(["light", "dark", "system"] as const).map((k) => (
                <ToggleGroupItem key={k} value={k}>
                  {tc(`theme.${k}`)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="welcome-tour"
              checked={withTour}
              onCheckedChange={(v) => setWithTour(v === true)}
            />
            <Label htmlFor="welcome-tour" className="text-xs">
              {t("welcome.showTour")}
            </Label>
          </div>
          <p className="text-muted-foreground flex w-full items-center gap-1.5 text-xs">
            <Lock className="size-3" />
            {t("welcome.privacy")}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
