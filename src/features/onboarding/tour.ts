/**
 * ガイドツアー基盤（driver.js）。#140
 * ステップは route + data-tour セレクタ + i18n キーで定義し、ルートをまたぐ場合は遷移して要素の出現を待つ。
 */
import { driver, type DriveStep, type Driver } from "driver.js";
import "driver.js/dist/driver.css";
import i18n from "@/i18n";
import { router } from "@/app/router";
import { usePrefs } from "@/store/prefs";

export interface TourStep {
  /** このステップを表示するルート（例: "/rooms"） */
  route: string;
  /** data-tour の値。省略時は画面中央に表示 */
  target?: string;
  /** onboarding 名前空間の i18n キー（`${key}.title` / `${key}.body`） */
  key: string;
  side?: "top" | "right" | "bottom" | "left";
}

let active: Driver | null = null;

function waitFor(selector: string | undefined, timeoutMs = 3000): Promise<Element | undefined> {
  if (!selector) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const start = performance.now();
    const tick = () => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);
      if (performance.now() - start > timeoutMs) return resolve(undefined);
      requestAnimationFrame(tick);
    };
    tick();
  });
}

const sel = (s: TourStep) => (s.target ? `[data-tour="${s.target}"]` : undefined);

async function goTo(step: TourStep) {
  const current = router.state.location.pathname;
  if (current !== step.route) await router.navigate({ to: step.route });
  await waitFor(sel(step));
}

export function isTourActive() {
  return active?.isActive() ?? false;
}

export async function startTour(steps: TourStep[], opts: { markSeen?: boolean } = {}) {
  active?.destroy();
  if (!steps.length) return;
  const t = (k: string): string => i18n.t(k as never, { ns: "onboarding" });
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const toDrive = (s: TourStep): DriveStep => ({
    element: sel(s) ? () => document.querySelector(sel(s)!) ?? document.body : undefined,
    popover: {
      title: t(`${s.key}.title`),
      description: t(`${s.key}.body`),
      side: s.side,
    },
  });

  const d = driver({
    animate: !reduce,
    showProgress: true,
    allowClose: true,
    smoothScroll: true,
    stagePadding: 6,
    stageRadius: 10,
    overlayOpacity: 0.55,
    popoverClass: "sekigae-tour",
    progressText: "{{current}} / {{total}}",
    nextBtnText: t("tour.next"),
    prevBtnText: t("tour.prev"),
    doneBtnText: t("tour.done"),
    steps: steps.map(toDrive),
    onNextClick: async (_el, _step, { driver: drv }) => {
      const i = drv.getActiveIndex() ?? 0;
      const next = steps[i + 1];
      if (!next) return drv.destroy();
      await goTo(next);
      drv.moveNext();
    },
    onPrevClick: async (_el, _step, { driver: drv }) => {
      const i = drv.getActiveIndex() ?? 0;
      const prev = steps[i - 1];
      if (!prev) return;
      await goTo(prev);
      drv.movePrevious();
    },
    onDestroyed: () => {
      if (opts.markSeen !== false) usePrefs.getState().setTourSeen(true);
      active = null;
    },
  });
  active = d;
  await goTo(steps[0]!);
  d.drive();
}
