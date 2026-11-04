import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useRegisterSW } from "virtual:pwa-register/react";

/** Service Worker 登録と更新通知（registerType: prompt） */
export function PwaPrompt() {
  const { t } = useTranslation();
  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true });

  useEffect(() => {
    if (!needRefresh) return;
    toast(t("pwa.updateAvailable"), {
      duration: Infinity,
      action: { label: t("pwa.update"), onClick: () => void updateServiceWorker(true) },
    });
  }, [needRefresh, t, updateServiceWorker]);

  useEffect(() => {
    if (!offlineReady) return;
    toast.success(t("pwa.offlineReady"));
    setOfflineReady(false);
  }, [offlineReady, setOfflineReady, t]);

  return null;
}
