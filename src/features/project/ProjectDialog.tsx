import { Copy, Download, FolderOpen, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { useState, type DragEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { confirm } from "@/components/confirm";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatBytes, formatDateTime, formatPercent } from "@/lib/format";
import {
  createProject,
  deleteProject,
  duplicateProject,
  getStorageUsage,
  loadProject,
  renameProjectById,
  switchProject,
  usePersistence,
  type ProjectMeta,
} from "@/store/persistence";
import { useProjectStore } from "@/store/project";
import { useProjectDialog } from "./dialogStore";
import type { PartialKind } from "./envelope";
import { exportPartialJson, exportProjectJson, importJsonFile, pickAndImport } from "./io";

/** プロジェクト管理ダイアログ（一覧・新規・名前変更・複製・削除・JSON 入出力・使用量） */
export function ProjectDialog() {
  const { t } = useTranslation();
  const open = useProjectDialog((s) => s.open);
  return (
    <Dialog open={open} onOpenChange={(o) => useProjectDialog.setState({ open: o })}>
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl"
        data-testid="project-dialog"
      >
        <DialogHeader>
          <DialogTitle>{t("project.dialogTitle")}</DialogTitle>
          <DialogDescription>{t("project.dialogDescription")}</DialogDescription>
        </DialogHeader>
        {open && <ProjectDialogBody />}
      </DialogContent>
    </Dialog>
  );
}

function ProjectDialogBody() {
  const { t, i18n } = useTranslation();
  const projects = usePersistence((s) => s.projects);
  // 一覧の更新（保存）で再描画されるたびに計算し直す
  const usage = getStorageUsage();
  const lng = i18n.resolvedLanguage ?? "ja";
  const [dragging, setDragging] = useState(false);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void importJsonFile(file);
  };

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={() => {
              if (createProject()) toast.success(t("project.created"));
            }}
            data-testid="project-dialog-new"
          >
            <Plus className="size-4" />
            {t("project.new")}
          </Button>
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("project.name")}</TableHead>
                <TableHead className="hidden sm:table-cell">{t("project.updatedAt")}</TableHead>
                <TableHead className="text-right">{t("project.rooms")}</TableHead>
                <TableHead className="text-right">{t("project.members")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((m) => (
                <ProjectRow key={m.id} meta={m} lng={lng} />
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">{t("project.dataSection")}</h3>
        <div
          className={`flex flex-wrap items-center gap-2 rounded-md border border-dashed p-3 transition-colors ${
            dragging ? "border-primary bg-primary/5" : ""
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          data-testid="project-dropzone"
        >
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportProjectJson()}
            data-testid="export-project"
          >
            <Download className="size-4" />
            {t("project.exportProject")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void pickAndImport()}
            data-testid="import-json"
          >
            <Upload className="size-4" />
            {t("project.importProject")}
          </Button>
          <span className="text-muted-foreground text-xs">{t("project.dropHint")}</span>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">{t("project.partialSection")}</h3>
        <p className="text-muted-foreground text-xs">{t("project.partialHint")}</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {(["layout", "members", "rules"] as const).map((kind) => (
            <PartialRow key={kind} kind={kind} />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-1.5" data-testid="storage-usage">
        <p className="text-sm">
          {t("project.usage", {
            used: formatBytes(usage.used, lng),
            percent: formatPercent(usage.ratio, lng, 1),
          })}
        </p>
        <Progress value={Math.min(100, usage.ratio * 100)} />
        <p className="text-muted-foreground text-xs">{t("project.usageHint")}</p>
      </section>
    </div>
  );
}

const partialLabelKey = {
  layout: "project.exportLayout",
  members: "project.exportMembers",
  rules: "project.exportRules",
} as const;

function PartialRow({ kind }: { kind: PartialKind }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border p-2">
      <span className="text-sm">{t(partialLabelKey[kind])}</span>
      <div className="flex">
        <IconButton
          label={t("actions.export")}
          onClick={() => exportPartialJson(kind)}
          testId={`export-${kind}`}
        >
          <Download className="size-4" />
        </IconButton>
        <IconButton
          label={t("actions.import")}
          onClick={() => void pickAndImport(kind)}
          testId={`import-${kind}`}
        >
          <Upload className="size-4" />
        </IconButton>
      </div>
    </div>
  );
}

function ProjectRow({ meta, lng }: { meta: ProjectMeta; lng: string }) {
  const { t } = useTranslation();
  const currentId = useProjectStore((s) => s.project.id);
  const isCurrent = meta.id === currentId;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(meta.name);

  const commit = () => {
    setEditing(false);
    const name = draft.trim();
    if (name && name !== meta.name) {
      renameProjectById(meta.id, name);
      toast.success(t("project.renamed"));
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: t("project.deleteTitle", { name: meta.name }),
      description: t("project.deleteDescription"),
      confirmLabel: t("actions.delete"),
      destructive: true,
    });
    if (!ok) return;
    deleteProject(meta.id);
    toast.success(t("project.deleted", { name: meta.name }));
  };

  return (
    <TableRow data-testid="project-row" data-current={isCurrent || undefined}>
      <TableCell className="max-w-56">
        {editing ? (
          <Input
            autoFocus
            value={draft}
            placeholder={t("project.namePlaceholder")}
            aria-label={t("project.name")}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                e.stopPropagation();
                setDraft(meta.name);
                setEditing(false);
              }
            }}
            className="h-8"
            data-testid="project-rename-input"
          />
        ) : (
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-medium" data-testid="project-row-name">
              {meta.name}
            </span>
            {isCurrent && (
              <span className="bg-primary/10 text-primary shrink-0 rounded px-1.5 py-0.5 text-[10px]">
                {t("project.current")}
              </span>
            )}
          </div>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground hidden text-xs sm:table-cell">
        {formatDateTime(meta.updatedAt, lng)}
      </TableCell>
      <TableCell className="text-right tabular-nums">{meta.roomCount}</TableCell>
      <TableCell className="text-right tabular-nums">{meta.memberCount}</TableCell>
      <TableCell>
        <div className="flex justify-end">
          {!isCurrent && (
            <IconButton
              label={t("project.open")}
              onClick={() => switchProject(meta.id)}
              testId="project-open"
            >
              <FolderOpen className="size-4" />
            </IconButton>
          )}
          <IconButton
            label={t("actions.rename")}
            onClick={() => {
              setDraft(meta.name);
              setEditing(true);
            }}
            testId="project-rename"
          >
            <Pencil className="size-4" />
          </IconButton>
          <IconButton
            label={t("actions.duplicate")}
            onClick={() => {
              const id = duplicateProject(meta.id);
              const copy = id ? loadProject(id) : null;
              if (copy) toast.success(t("project.duplicated", { name: copy.name }));
            }}
            testId="project-duplicate"
          >
            <Copy className="size-4" />
          </IconButton>
          <IconButton
            label={t("actions.export")}
            onClick={() => {
              const p = loadProject(meta.id);
              if (p) exportProjectJson(p);
            }}
            testId="project-export"
          >
            <Download className="size-4" />
          </IconButton>
          <IconButton
            label={t("actions.delete")}
            onClick={() => void remove()}
            testId="project-delete"
          >
            <Trash2 className="size-4" />
          </IconButton>
        </div>
      </TableCell>
    </TableRow>
  );
}

function IconButton({
  label,
  onClick,
  testId,
  children,
}: {
  label: string;
  onClick: () => void;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={label}
          onClick={onClick}
          data-testid={testId}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
