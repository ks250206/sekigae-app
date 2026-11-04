import { AlertTriangle, CloudOff, Download, RefreshCw, Save } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { downloadText } from "@/lib/backup";
import {
  overwriteWithThisTab,
  recoveryDiscard,
  recoveryDismiss,
  recoveryStartEmpty,
  reloadFromStorage,
  usePersistence,
} from "@/store/persistence";
import { answerChoice, useChoiceStore } from "./choice";
import { exportProjectJson, importJsonFile } from "./io";
import { ProjectDialog } from "./ProjectDialog";

/** 永続化まわりのグローバル UI（AppShell に 1 つ置く） */
export function PersistenceHost() {
  return (
    <>
      <StorageBanners />
      <RecoveryDialog />
      <ChoiceHost />
      <ProjectDialog />
      <QuotaNotifier />
      <GlobalFileDrop />
    </>
  );
}

function StorageBanners() {
  const { t } = useTranslation();
  const mode = usePersistence((s) => s.mode);
  const conflict = usePersistence((s) => s.conflict);
  if (!conflict && mode !== "memory") return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-40 flex flex-col items-center gap-2 px-3">
      {conflict && (
        <div
          role="alert"
          className="bg-background pointer-events-auto flex max-w-2xl flex-wrap items-center gap-3 rounded-lg border border-amber-500/50 px-4 py-2 text-sm shadow-lg"
          data-testid="conflict-banner"
        >
          <AlertTriangle className="size-4 shrink-0 text-amber-500" />
          <span className="flex-1">
            {conflict.deleted ? t("storage.conflictDeleted") : t("storage.conflict")}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={reloadFromStorage}
            data-testid="conflict-reload"
          >
            <RefreshCw className="size-4" />
            {t("storage.reload")}
          </Button>
          <Button size="sm" onClick={overwriteWithThisTab} data-testid="conflict-overwrite">
            <Save className="size-4" />
            {t("storage.overwrite")}
          </Button>
        </div>
      )}
      {mode === "memory" && (
        <div
          role="alert"
          className="bg-background pointer-events-auto flex max-w-2xl flex-wrap items-center gap-3 rounded-lg border border-amber-500/50 px-4 py-2 text-sm shadow-lg"
          data-testid="memory-banner"
        >
          <CloudOff className="size-4 shrink-0 text-amber-500" />
          <span className="flex-1">{t("storage.memoryOnly")}</span>
          <Button size="sm" variant="outline" onClick={() => exportProjectJson()}>
            <Download className="size-4" />
            {t("storage.exportJson")}
          </Button>
        </div>
      )}
    </div>
  );
}

function RecoveryDialog() {
  const { t } = useTranslation();
  const recovery = usePersistence((s) => s.recovery);
  const open = recovery !== null;
  const download = () => {
    if (!recovery) return;
    downloadText(`${recovery.projectId}_recovered.json`, recovery.raw, "application/json");
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && recoveryDismiss()}>
      <DialogContent
        showCloseButton={!recovery?.atBoot}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => recovery?.atBoot && e.preventDefault()}
        data-testid="recovery-dialog"
      >
        {recovery && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="text-destructive size-5" />
                {recovery.reason === "future"
                  ? t("storage.recovery.titleFuture")
                  : t("storage.recovery.titleCorrupt")}
              </DialogTitle>
              <DialogDescription>
                {recovery.reason === "future"
                  ? t("storage.recovery.descriptionFuture", { version: recovery.version })
                  : t("storage.recovery.descriptionCorrupt")}
              </DialogDescription>
            </DialogHeader>
            {recovery.backupKey && (
              <p className="text-muted-foreground text-xs break-all">
                {t("storage.recovery.backupKey", { key: recovery.backupKey })}
              </p>
            )}
            {recovery.issues.length > 0 && (
              <details className="text-muted-foreground text-xs">
                <summary>{t("storage.recovery.details")}</summary>
                <pre className="bg-muted mt-2 max-h-40 overflow-auto rounded p-2 whitespace-pre-wrap">
                  {recovery.issues.join("\n")}
                </pre>
              </details>
            )}
            <DialogFooter className="flex-wrap gap-2">
              <Button variant="outline" onClick={download} data-testid="recovery-download">
                <Download className="size-4" />
                {t("storage.recovery.download")}
              </Button>
              {recovery.reason === "corrupt" && (
                <Button
                  variant="destructive"
                  onClick={recoveryDiscard}
                  data-testid="recovery-discard"
                >
                  {t("storage.recovery.discard")}
                </Button>
              )}
              <Button onClick={recoveryStartEmpty} data-testid="recovery-start-empty">
                {t("storage.recovery.startEmpty")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ChoiceHost() {
  const { t } = useTranslation();
  const request = useChoiceStore((s) => s.request);
  return (
    <Dialog open={request !== null} onOpenChange={(o) => !o && answerChoice(null)}>
      <DialogContent data-testid="choice-dialog">
        {request && (
          <>
            <DialogHeader>
              <DialogTitle>{request.title}</DialogTitle>
              {request.description && <DialogDescription>{request.description}</DialogDescription>}
            </DialogHeader>
            <div className="flex flex-col gap-2">
              {request.options.map((o) => (
                <Button
                  key={o.value}
                  variant={o.destructive ? "outline" : "default"}
                  className="h-auto flex-col items-start gap-0.5 py-2 text-left whitespace-normal"
                  onClick={() => answerChoice(o.value)}
                  data-testid={`choice-${o.value}`}
                >
                  <span className={o.destructive ? "text-destructive" : undefined}>{o.label}</span>
                  {o.description && (
                    <span className="text-xs font-normal opacity-80">{o.description}</span>
                  )}
                </Button>
              ))}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => answerChoice(null)}>
                {t("actions.cancel")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** 保存失敗（容量超過など）をトーストで知らせる */
function QuotaNotifier() {
  const { t } = useTranslation();
  const error = usePersistence((s) => s.error);
  const shown = useRef<number | null>(null);
  const failing = useRef(false);
  useEffect(() => {
    if (!error) {
      failing.current = false;
      return;
    }
    // 失敗が続いている間は 1 回だけ通知
    if (failing.current || shown.current === error.at) return;
    failing.current = true;
    shown.current = error.at;
    toast.error(error.kind === "quota" ? t("storage.quotaExceeded") : t("storage.saveFailed"), {
      description: error.kind === "quota" ? t("storage.quotaDescription") : error.message,
      duration: 15_000,
      action: { label: t("storage.exportJson"), onClick: () => exportProjectJson() },
    });
  }, [error, t]);
  return null;
}

const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files") ?? false;

/**
 * 画面のどこに JSON をドロップしても読み込む。
 * 他の機能のドロップ領域が preventDefault した場合は何もしない。
 */
function GlobalFileDrop() {
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (hasFiles(e) && !e.defaultPrevented) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e) || e.defaultPrevented) return;
      // ブラウザがファイルを開いて画面遷移するのを防ぐ
      e.preventDefault();
      const file = e.dataTransfer?.files[0];
      if (file && /\.json$/i.test(file.name)) void importJsonFile(file);
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, []);
  return null;
}
