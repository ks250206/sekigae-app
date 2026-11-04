/** ⑤ 出力画面。docs/DESIGN.md §7.6, issue #129 */
import {
  AlertTriangle,
  Download,
  FileSpreadsheet,
  Image,
  Loader2,
  Presentation,
  Printer,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ID } from "@/domain/schema";
import { SUPPORTED_LANGUAGES } from "@/i18n";
import { downloadBlob } from "@/lib/backup";
import { useProject } from "@/store/selectors";
import { FloorSvg, RoomSvg } from "./ExportSvg";
import {
  buildExportModel,
  COLOR_BY_MODES,
  defaultFilename,
  defaultPlan,
  EXPORT_COLUMNS,
  sanitizeFilename,
  type ExportFormat,
  type ExportModel,
} from "./model";
import { useExportPrefs } from "./prefs";
import { EXTENSIONS, generateOfficeFile, prefetchWriter, svgToPng, type Phase } from "./run";

if (typeof navigator !== "undefined" && navigator.webdriver)
  void import("./e2e").then((m) => m.installExportTestHook());

type Status = { phase: "idle" } | { phase: Phase } | { phase: "done"; filename: string };

const FORMAT_ICONS = { xlsx: FileSpreadsheet, pptx: Presentation, png: Image } as const;
const PROGRESS: Record<Phase, number> = { loading: 35, generating: 75 };

export default function ExportPage() {
  const { t, i18n } = useTranslation("export");
  const { t: tc } = useTranslation("common");
  const project = useProject();
  const [prefs, setPrefs] = useExportPrefs(i18n.resolvedLanguage);

  const fallbackPlan = defaultPlan(project);
  const [planId, setPlanId] = useState<ID | undefined>(undefined);
  const plan = project.plans.find((p) => p.id === planId) ?? fallbackPlan;

  const rooms = project.layout.rooms;
  const [roomSel, setRoomSel] = useState<Set<ID> | null>(null);
  const selectedRoomIds = useMemo(
    () => rooms.filter((r) => (roomSel ? roomSel.has(r.id) : !r.hidden)).map((r) => r.id),
    [rooms, roomSel],
  );

  const model: ExportModel = useMemo(
    () =>
      buildExportModel(project, {
        planId: plan?.id,
        roomIds: selectedRoomIds,
        lang: prefs.lang,
        columns: prefs.columns,
        colorBy: prefs.colorBy,
        floorSheet: prefs.floorSheet,
        compositionTable: prefs.compositionTable,
      }),
    [project, plan?.id, selectedRoomIds, prefs],
  );

  const [customName, setCustomName] = useState<string | null>(null);
  const filename = customName ?? defaultFilename(project.name, prefs.lang);
  const [status, setStatus] = useState<Status>({ phase: "idle" });
  const busy = status.phase === "loading" || status.phase === "generating";
  const floorRef = useRef<SVGSVGElement>(null);

  // 形式を選んだ時点でライブラリを先読み
  useEffect(() => prefetchWriter(prefs.format), [prefs.format]);

  const toggleRoom = (id: ID, on: boolean) => {
    const next = new Set(selectedRoomIds);
    if (on) next.add(id);
    else next.delete(id);
    setRoomSel(next);
  };
  const toggleColumn = (c: (typeof EXPORT_COLUMNS)[number], on: boolean) =>
    setPrefs({
      columns: EXPORT_COLUMNS.filter((x) => (x === c ? on : prefs.columns.includes(x))),
    });

  const warnings: { id: string; text: string }[] = [];
  if (!model.rooms.length) warnings.push({ id: "noRooms", text: t("dialog.warnings.noRooms") });
  else if (model.totals.assigned === 0)
    warnings.push({ id: "noMembers", text: t("dialog.warnings.noMembers") });
  if (model.totals.unassigned > 0)
    warnings.push({
      id: "unassigned",
      text: t("dialog.warnings.unassigned", { count: model.totals.unassigned }),
    });
  if (prefs.columns.includes("previous") && !model.hasPrevious)
    warnings.push({ id: "noPrevious", text: t("dialog.warnings.noPrevious") });

  async function download() {
    const format = prefs.format;
    const name = `${sanitizeFilename(filename)}.${EXTENSIONS[format]}`;
    try {
      let blob: Blob;
      if (format === "png") {
        setStatus({ phase: "generating" });
        if (!floorRef.current) throw new Error("preview not ready");
        blob = await svgToPng(floorRef.current, 1);
      } else {
        blob = await generateOfficeFile(model, format, (phase) => setStatus({ phase }));
      }
      downloadBlob(name, blob);
      setStatus({ phase: "done", filename: name });
      toast.success(t("dialog.progress.done", { filename: name }));
    } catch (e) {
      setStatus({ phase: "idle" });
      toast.error(t("dialog.error", { message: e instanceof Error ? e.message : String(e) }));
    }
  }

  if (!rooms.length) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader title={t("title")} description={t("description")} />
        <div
          className="text-muted-foreground m-auto max-w-sm p-6 text-center"
          data-testid="export-empty"
        >
          <p className="text-foreground font-medium">{t("dialog.empty.title")}</p>
          <p className="mt-1 text-sm">{t("dialog.empty.description")}</p>
        </div>
      </div>
    );
  }

  const downloadButton = (
    <Button
      onClick={() => void download()}
      onPointerEnter={() => prefetchWriter(prefs.format)}
      onFocus={() => prefetchWriter(prefs.format)}
      disabled={busy || !model.rooms.length}
      data-testid="export-download"
      data-tour="export-download"
    >
      {busy ? <Loader2 className="animate-spin" /> : <Download />}
      {t("dialog.download")}
    </Button>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => window.print()}
              disabled={!model.rooms.length}
              data-testid="export-print"
            >
              <Printer />
              {t("dialog.print")}
            </Button>
            {downloadButton}
          </>
        }
      />
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="grid gap-6 p-4 md:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] md:p-6">
          <form
            className="flex flex-col gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              void download();
            }}
            data-tour="export-options"
          >
            <Field label={t("dialog.format")}>
              <ToggleGroup
                type="single"
                variant="outline"
                value={prefs.format}
                onValueChange={(v) => v && setPrefs({ format: v as ExportFormat })}
                aria-label={t("dialog.format")}
                className="grid w-full grid-cols-3"
              >
                {(["xlsx", "pptx", "png"] as const).map((f) => {
                  const Icon = FORMAT_ICONS[f];
                  return (
                    <ToggleGroupItem
                      key={f}
                      value={f}
                      data-testid={`export-format-${f}`}
                      onPointerEnter={() => prefetchWriter(f)}
                      className="w-full"
                    >
                      <Icon />
                      {t(`dialog.formats.${f}`)}
                    </ToggleGroupItem>
                  );
                })}
              </ToggleGroup>
            </Field>

            <Field label={t("dialog.plan")} htmlFor="export-plan">
              <Select value={plan?.id ?? ""} onValueChange={setPlanId}>
                <SelectTrigger id="export-plan" className="w-full" data-testid="export-plan">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {project.plans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                      {p.final
                        ? ` (${t("dialog.planFinal")})`
                        : p.kind === "previous"
                          ? ` (${t("dialog.planPrevious")})`
                          : p.id === project.activePlanId
                            ? ` (${t("dialog.planActive")})`
                            : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <fieldset className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <legend className="text-sm font-medium">{t("dialog.rooms")}</legend>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    onClick={() => setRoomSel(new Set(rooms.map((r) => r.id)))}
                  >
                    {t("dialog.selectAll")}
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    onClick={() => setRoomSel(new Set())}
                  >
                    {t("dialog.selectNone")}
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {rooms.map((r) => (
                  <label key={r.id} className="flex min-w-0 items-center gap-2 text-sm">
                    <Checkbox
                      checked={selectedRoomIds.includes(r.id)}
                      onCheckedChange={(v) => toggleRoom(r.id, v === true)}
                      data-testid={`export-room-${r.id}`}
                    />
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ background: r.color }}
                    />
                    <span className="truncate">{r.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <Field label={t("dialog.language")}>
              <ToggleGroup
                type="single"
                variant="outline"
                value={prefs.lang}
                onValueChange={(v) =>
                  v && setPrefs({ lang: v as (typeof SUPPORTED_LANGUAGES)[number] })
                }
                aria-label={t("dialog.language")}
              >
                {SUPPORTED_LANGUAGES.map((l) => (
                  <ToggleGroupItem key={l} value={l} data-testid={`export-lang-${l}`}>
                    {tc(`language.${l}`)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">{t("dialog.columns")}</legend>
              <div className="grid grid-cols-2 gap-2">
                {EXPORT_COLUMNS.map((c) => (
                  <label key={c} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={prefs.columns.includes(c)}
                      onCheckedChange={(v) => toggleColumn(c, v === true)}
                      data-testid={`export-column-${c}`}
                    />
                    {t(`columns.${c}`)}
                  </label>
                ))}
              </div>
            </fieldset>

            <Field label={t("dialog.colorBy")}>
              <ToggleGroup
                type="single"
                variant="outline"
                value={prefs.colorBy}
                onValueChange={(v) =>
                  v && setPrefs({ colorBy: v as (typeof COLOR_BY_MODES)[number] })
                }
                aria-label={t("dialog.colorBy")}
              >
                {COLOR_BY_MODES.map((c) => (
                  <ToggleGroupItem key={c} value={c} data-testid={`export-color-${c}`}>
                    {t(`colorBy.${c}`)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>

            {prefs.format !== "png" && (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-sm font-medium">{t("dialog.options")}</legend>
                {prefs.format === "xlsx" ? (
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={prefs.floorSheet}
                      onCheckedChange={(v) => setPrefs({ floorSheet: v })}
                      data-testid="export-floor-sheet"
                    />
                    {t("dialog.floorSheet")}
                  </label>
                ) : (
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={prefs.compositionTable}
                      onCheckedChange={(v) => setPrefs({ compositionTable: v })}
                      data-testid="export-composition"
                    />
                    {t("dialog.compositionTable")}
                  </label>
                )}
              </fieldset>
            )}

            <Field label={t("dialog.filename")} htmlFor="export-filename">
              <div className="flex items-center gap-2">
                <Input
                  id="export-filename"
                  value={filename}
                  onChange={(e) => setCustomName(e.target.value)}
                  data-testid="export-filename"
                />
                <span className="text-muted-foreground text-sm">.{EXTENSIONS[prefs.format]}</span>
              </div>
            </Field>

            <div className="flex flex-col gap-2">
              {downloadButton}
              {status.phase !== "idle" && (
                <div className="flex flex-col gap-1" role="status" data-testid="export-progress">
                  <Progress value={status.phase === "done" ? 100 : PROGRESS[status.phase]} />
                  <p className="text-muted-foreground text-xs">
                    {status.phase === "done"
                      ? t("dialog.progress.done", { filename: status.filename })
                      : t(`dialog.progress.${status.phase}`)}
                  </p>
                </div>
              )}
            </div>
          </form>

          <section className="flex min-w-0 flex-col gap-4" aria-label={t("dialog.preview")}>
            {warnings.length > 0 && (
              <ul className="flex flex-col gap-2">
                {warnings.map((w) => (
                  <li
                    key={w.id}
                    className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
                    data-testid={`export-warning-${w.id}`}
                  >
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    {w.text}
                  </li>
                ))}
              </ul>
            )}
            <h2 className="text-sm font-medium">{t("dialog.preview")}</h2>
            {model.rooms.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("dialog.previewEmpty")}</p>
            ) : (
              <div
                className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-4"
                data-testid="export-preview"
              >
                {model.rooms.map((r) => (
                  <figure key={r.id} className="bg-card flex flex-col gap-2 rounded-lg border p-3">
                    {/* 出力は常にライト配色なのでプレビューも白背景 */}
                    <div className="rounded bg-white p-1">
                      <RoomSvg room={r} className="h-auto max-h-56 w-full" />
                    </div>
                    <figcaption className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate font-medium">{r.name}</span>
                      <span className="text-muted-foreground shrink-0 text-xs">{r.summary}</span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
            {model.legend.length > 0 && (
              <ul className="flex flex-wrap gap-2 text-xs">
                {model.legend.map((l) => (
                  <li
                    key={l.label}
                    className="rounded px-2 py-0.5"
                    style={{ background: l.fill, color: l.text }}
                  >
                    {l.label}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
      {prefs.format === "png" && model.rooms.length > 0 && (
        <div
          aria-hidden
          className="pointer-events-none fixed top-0 left-[-10000px] h-px w-px overflow-hidden"
        >
          <FloorSvg ref={floorRef} model={model} />
        </div>
      )}
      <PrintView model={model} />
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      {htmlFor ? (
        <Label htmlFor={htmlFor}>{label}</Label>
      ) : (
        <span className="text-sm leading-none font-medium">{label}</span>
      )}
      {children}
    </div>
  );
}

const PRINT_CSS = `
.sekigae-export-print { display: none; }
@media print {
  @page { size: A4 landscape; margin: 10mm; }
  body > *:not(.sekigae-export-print) { display: none !important; }
  .sekigae-export-print { display: block; color: #0f172a; background: #fff; font-family: system-ui, sans-serif; }
  .sekigae-export-print * { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  .sekigae-export-print section { break-after: page; page-break-after: always; break-inside: avoid; }
  .sekigae-export-print section:last-child { break-after: auto; page-break-after: auto; }
  .sekigae-export-print svg { width: 100%; max-height: 140mm; }
}
`;

/** 印刷用（画面では非表示）。UI を隠し、部屋ごとに改ページ。issue #136 */
function PrintView({ model }: { model: ExportModel }) {
  return createPortal(
    <div className="sekigae-export-print" data-testid="export-print-view">
      <style>{PRINT_CSS}</style>
      {model.rooms.map((r) => (
        <section key={r.id}>
          <h2 style={{ fontSize: "18pt", fontWeight: 700, margin: 0 }}>{r.name}</h2>
          <p style={{ fontSize: "10pt", color: "#475569", margin: "2mm 0 4mm" }}>
            {[r.summary, model.strings.plan, model.strings.createdOn].join("  ·  ")}
          </p>
          <RoomSvg room={r} detail="full" />
          {model.legend.length > 0 && (
            <p style={{ fontSize: "9pt", marginTop: "3mm" }}>
              {model.legend.map((l) => (
                <span
                  key={l.label}
                  style={{
                    background: l.fill,
                    color: l.text,
                    padding: "1px 6px",
                    marginRight: 6,
                    borderRadius: 3,
                    printColorAdjust: "exact",
                    WebkitPrintColorAdjust: "exact",
                  }}
                >
                  {l.label}
                </span>
              ))}
            </p>
          )}
        </section>
      ))}
    </div>,
    document.body,
  );
}
