import { Link, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { STEPS, type StepId } from "./steps";
import { useStepBadges } from "./stepBadges";

/** ① 部屋 ② 名簿 ③ ルール ④ 席配置 ⑤ 出力 のステッパーナビ */
export function StepNav({ variant = "top" }: { variant?: "top" | "bottom" }) {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const badges = useStepBadges();
  return (
    <nav
      aria-label="steps"
      className={cn(
        variant === "top"
          ? "hidden items-center gap-1 md:flex"
          : "bg-background/95 fixed inset-x-0 bottom-0 z-40 flex justify-around border-t px-1 py-1 backdrop-blur md:hidden",
      )}
    >
      {STEPS.map((step, i) => {
        const active = pathname.startsWith(step.path);
        const Icon = step.icon;
        const badge = badges[step.id as StepId];
        return (
          <Link
            key={step.id}
            to={step.path}
            data-tour={`step-${step.id}`}
            className={cn(
              "group relative flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              variant === "bottom" && "flex-col gap-0.5 px-2 py-1 text-[11px]",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {variant === "top" ? (
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded-full border text-[11px] tabular-nums",
                  active ? "border-primary bg-primary text-primary-foreground" : "border-border",
                )}
              >
                {i + 1}
              </span>
            ) : (
              <Icon className="size-5" />
            )}
            <span>{t(`steps.${step.id}`)}</span>
            {badge != null && (
              <span className="bg-muted text-muted-foreground rounded-full px-1.5 text-[10px] tabular-nums">
                {badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
