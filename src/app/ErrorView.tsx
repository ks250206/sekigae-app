import type { ErrorComponentProps } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { downloadLocalBackup } from "@/lib/backup";

/** ルート単位のエラーバウンダリ表示 */
export function ErrorView({ error, reset }: ErrorComponentProps) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 p-10 text-center">
      <AlertTriangle className="text-destructive size-10" />
      <h1 className="text-xl font-semibold">{t("error.title")}</h1>
      <p className="text-muted-foreground text-sm">{t("error.description")}</p>
      <div className="flex gap-2">
        <Button onClick={() => (reset(), window.location.reload())}>{t("error.reload")}</Button>
        <Button variant="outline" onClick={downloadLocalBackup}>
          {t("error.downloadBackup")}
        </Button>
      </div>
      <details className="text-muted-foreground w-full text-left text-xs">
        <summary>{t("error.details")}</summary>
        <pre className="bg-muted mt-2 overflow-auto rounded p-2 whitespace-pre-wrap">
          {error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error)}
        </pre>
      </details>
    </div>
  );
}

export function NotFoundView() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-4 p-10">
      <h1 className="text-xl font-semibold">{t("notFound.title")}</h1>
      <Button asChild variant="outline">
        <a href="#/rooms">{t("notFound.back")}</a>
      </Button>
    </div>
  );
}
