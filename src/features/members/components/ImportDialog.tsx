/**
 * 名簿の一括取込（CSV / XLSX ファイル・Excel からの貼り付け）。#72 #73 #84
 * ソース選択 → 列マッピング + プレビュー → 取込（1 回の Undo）
 */
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardPaste,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { confirm } from "@/components/confirm";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/store/project";
import { applyImport, type ImportMode } from "../lib/applyImport";
import {
  decodeText,
  parseDelimited,
  parsePasted,
  readXlsx,
  type SheetData,
  type TextEncoding,
} from "../lib/fileIO";
import {
  IMPORT_FIELDS,
  buildImportRows,
  detectHeaderRow,
  guessMapping,
  guessMappingFromData,
  newLabNames,
  validRows,
  type ColumnMapping,
  type ImportField,
  type ImportRow,
} from "../lib/importRows";
import { useTemplateDownload } from "../lib/useTemplateDownload";
import { LabBadge, RoleBadge } from "./badges";

export type ImportSource = "file" | "paste";

const colLetter = (i: number): string =>
  i < 26 ? String.fromCharCode(65 + i) : colLetter(Math.floor(i / 26) - 1) + colLetter(i % 26);

export function ImportDialog({
  open,
  onOpenChange,
  initialSource = "file",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSource?: ImportSource;
}) {
  const { t } = useTranslation(["members", "common"]);
  const labs = useProjectStore((s) => s.project.labs);
  const rooms = useProjectStore((s) => s.project.layout.rooms);
  const memberCount = useProjectStore((s) => s.project.members.length);

  const [source, setSource] = useState<ImportSource>(initialSource);
  const [step, setStep] = useState<"source" | "map">("source");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [encoding, setEncoding] = useState<TextEncoding | "auto">("auto");
  const [detected, setDetected] = useState<TextEncoding | null>(null);
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [pasteText, setPasteText] = useState("");
  const [table, setTable] = useState<string[][]>([]);
  const [hasHeader, setHasHeader] = useState(false);
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<ColumnMapping>([]);
  const [mode, setMode] = useState<ImportMode>("add");
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /** 表を読み込んだらヘッダー検出とマッピング推定 */
  const loadTable = (rows: string[][]) => {
    if (!rows.length) {
      setError(t("import.emptyData"));
      return;
    }
    const h = detectHeaderRow(rows);
    setTable(rows);
    setHasHeader(h >= 0);
    setHeaderRow(Math.max(0, h));
    setMapping(h >= 0 ? guessMapping(rows[h]!) : guessMappingFromData(rows));
    setError(null);
    setStep("map");
  };

  const readFile = async (file: File) => {
    setBusy(true);
    setError(null);
    setFileName(file.name);
    try {
      if (/\.xls[xm]$/iu.test(file.name)) {
        const s = await readXlsx(await file.arrayBuffer());
        setSheets(s);
        setBytes(null);
        const idx = Math.max(
          0,
          s.findIndex((x) => x.rows.length > 0),
        );
        setSheetIndex(idx);
        loadTable(s[idx]?.rows ?? []);
      } else if (/\.xls$/iu.test(file.name)) {
        setError(t("import.xlsUnsupported"));
      } else {
        const b = new Uint8Array(await file.arrayBuffer());
        setBytes(b);
        setSheets([]);
        await loadText(b, encoding, file.name);
      }
    } catch (e) {
      console.error(e);
      setError(t("import.readError"));
    } finally {
      setBusy(false);
    }
  };

  const loadText = async (b: Uint8Array, enc: TextEncoding | "auto", name = fileName) => {
    const { text, encoding: used } = decodeText(b, enc);
    setDetected(used);
    loadTable(await parseDelimited(text, /\.tsv$/iu.test(name) ? "\t" : undefined));
  };

  const loadPaste = async (text: string) => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      setSheets([]);
      setFileName("");
      loadTable(await parsePasted(text));
    } finally {
      setBusy(false);
    }
  };

  const toggleHeader = (on: boolean) => {
    setHasHeader(on);
    const h = on ? Math.max(0, detectHeaderRow(table)) : 0;
    setHeaderRow(h);
    setMapping(on ? guessMapping(table[h] ?? []) : guessMappingFromData(table));
  };

  const width = Math.max(0, ...table.map((r) => r.length));
  const headers = hasHeader ? (table[headerRow] ?? []) : [];
  const data = hasHeader ? table.slice(headerRow + 1) : table;
  const rows = useMemo(
    () =>
      buildImportRows(
        hasHeader ? table.slice(headerRow + 1) : table,
        mapping,
        { labs, rooms },
        hasHeader ? headerRow + 2 : 1,
      ),
    [table, hasHeader, headerRow, mapping, labs, rooms],
  );
  const ok = validRows(rows);
  const errors = rows.length - ok.length;
  const warnings = ok.filter((r) => r.warnings.length).length;
  const newLabs = newLabNames(rows);
  const hasName = mapping.includes("name");

  const setField = (col: number, f: ImportField | null) =>
    setMapping((m) => {
      const next = Array.from({ length: width }, (_, i) => m[i] ?? null);
      if (f) for (let i = 0; i < next.length; i++) if (next[i] === f) next[i] = null;
      next[col] = f;
      return next;
    });

  const runImport = async () => {
    if (
      mode === "replace" &&
      memberCount > 0 &&
      !(await confirm({
        title: t("import.replaceConfirmTitle"),
        description: t("import.replaceConfirm", { count: memberCount }),
        confirmLabel: t("import.modes.replace"),
        destructive: true,
      }))
    )
      return;
    const res = applyImport(rows, mode, { previousPlanName: t("prev.defaultPlanName") });
    toast.success(t("import.done", { added: res.added, updated: res.updated }), {
      description: [
        res.labsCreated ? t("import.doneLabs", { count: res.labsCreated }) : "",
        res.prevSet ? t("import.donePrev", { count: res.prevSet }) : "",
        res.skipped ? t("import.doneSkipped", { count: res.skipped }) : "",
      ]
        .filter(Boolean)
        .join(" / "),
    });
    onOpenChange(false);
  };

  const downloadTemplate = useTemplateDownload();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex max-h-[92dvh] flex-col gap-4",
          step === "map" ? "sm:max-w-5xl" : "sm:max-w-2xl",
        )}
        data-testid="import-dialog"
      >
        <DialogHeader>
          <DialogTitle>{t("import.title")}</DialogTitle>
          <DialogDescription>
            {step === "source" ? t("import.description") : t("import.mapDescription")}
          </DialogDescription>
        </DialogHeader>

        {step === "source" ? (
          <Tabs value={source} onValueChange={(v) => setSource(v as ImportSource)}>
            <TabsList>
              <TabsTrigger value="file" data-testid="import-tab-file">
                <FileSpreadsheet />
                {t("import.fromFile")}
              </TabsTrigger>
              <TabsTrigger value="paste" data-testid="import-tab-paste">
                <ClipboardPaste />
                {t("import.fromPaste")}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="file" className="space-y-3">
              <div
                className={cn(
                  "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors",
                  dragOver ? "border-primary bg-primary/5" : "border-border",
                )}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const f = e.dataTransfer.files[0];
                  if (f) void readFile(f);
                }}
                data-testid="import-dropzone"
              >
                {busy ? (
                  <Loader2 className="text-muted-foreground size-8 animate-spin" />
                ) : (
                  <Upload className="text-muted-foreground size-8" />
                )}
                <p className="text-sm font-medium">{t("import.drop")}</p>
                <p className="text-muted-foreground text-xs">{t("import.formats")}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => fileRef.current?.click()}
                  disabled={busy}
                >
                  {t("import.chooseFile")}
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.tsv,.txt,.xlsx,.xlsm,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void readFile(f);
                    e.target.value = "";
                  }}
                  data-testid="import-file"
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground">{t("import.templateHint")}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={downloadTemplate}
                  data-testid="import-template"
                >
                  <Download />
                  {t("import.template.download")}
                </Button>
              </div>
            </TabsContent>
            <TabsContent value="paste" className="space-y-3">
              <Textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                onPaste={(e) => {
                  const text = e.clipboardData.getData("text/plain");
                  if (text && !pasteText) {
                    e.preventDefault();
                    setPasteText(text);
                    void loadPaste(text);
                  }
                }}
                rows={10}
                placeholder={t("import.pastePlaceholder")}
                className="font-mono text-xs"
                data-testid="import-paste"
              />
              <div className="flex justify-end">
                <Button
                  onClick={() => loadPaste(pasteText)}
                  disabled={!pasteText.trim() || busy}
                  data-testid="import-paste-next"
                >
                  {t("common:actions.next")}
                </Button>
              </div>
            </TabsContent>
            {error && (
              <p className="text-destructive mt-3 flex items-center gap-1.5 text-sm" role="alert">
                <AlertCircle className="size-4" />
                {error}
              </p>
            )}
          </Tabs>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
            {/* ソース情報・オプション */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              {fileName && (
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <FileSpreadsheet className="size-4" />
                  {fileName}
                </span>
              )}
              {sheets.length > 1 && (
                <div className="flex items-center gap-2">
                  <Label>{t("import.sheet")}</Label>
                  <Select
                    value={String(sheetIndex)}
                    onValueChange={(v) => {
                      setSheetIndex(Number(v));
                      loadTable(sheets[Number(v)]?.rows ?? []);
                    }}
                  >
                    <SelectTrigger size="sm" className="w-40" data-testid="import-sheet">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {sheets.map((s, i) => (
                        <SelectItem key={s.name} value={String(i)}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {bytes && (
                <div className="flex items-center gap-2">
                  <Label>{t("import.encoding")}</Label>
                  <Select
                    value={encoding}
                    onValueChange={(v) => {
                      const enc = v as TextEncoding | "auto";
                      setEncoding(enc);
                      void loadText(bytes, enc);
                    }}
                  >
                    <SelectTrigger size="sm" className="w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">
                        {t("import.encodingAuto", {
                          detected: detected === "shift_jis" ? "Shift_JIS" : "UTF-8",
                        })}
                      </SelectItem>
                      <SelectItem value="utf-8">UTF-8</SelectItem>
                      <SelectItem value="shift_jis">Shift_JIS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Switch
                  id="import-header"
                  checked={hasHeader}
                  onCheckedChange={toggleHeader}
                  data-testid="import-header"
                />
                <Label htmlFor="import-header" className="font-normal">
                  {hasHeader && headerRow > 0
                    ? t("import.headerAt", { row: headerRow + 1 })
                    : t("import.hasHeader")}
                </Label>
              </div>
            </div>

            {/* 列マッピング */}
            <div>
              <h3 className="mb-2 text-sm font-medium">{t("import.mapping")}</h3>
              <div className="flex gap-2 overflow-x-auto pb-1" data-testid="import-mapping">
                {Array.from({ length: width }, (_, i) => (
                  <div key={i} className="bg-muted/40 w-40 shrink-0 rounded-md border p-2">
                    <div className="mb-1.5 truncate text-xs font-medium" title={headers[i]}>
                      <span className="text-muted-foreground mr-1">{colLetter(i)}</span>
                      {headers[i] || (hasHeader ? "" : t("import.column", { col: colLetter(i) }))}
                    </div>
                    <Select
                      value={mapping[i] ?? "__skip"}
                      onValueChange={(v) => setField(i, v === "__skip" ? null : (v as ImportField))}
                    >
                      <SelectTrigger
                        size="sm"
                        className={cn("w-full", mapping[i] && "border-primary/60")}
                        data-testid={`import-map-${i}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__skip">
                          <span className="text-muted-foreground">{t("import.skip")}</span>
                        </SelectItem>
                        {IMPORT_FIELDS.map((f) => (
                          <SelectItem key={f} value={f} data-testid={`import-field-${f}`}>
                            {t(`import.fields.${f}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="text-muted-foreground mt-1.5 space-y-0.5 text-[11px]">
                      {data.slice(0, 2).map((r, j) => (
                        <div key={j} className="truncate">
                          {r[i] || "—"}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {!hasName && (
                <p className="text-destructive mt-2 flex items-center gap-1.5 text-xs" role="alert">
                  <AlertCircle className="size-3.5" />
                  {t("import.needName")}
                </p>
              )}
            </div>

            {/* モード */}
            <div>
              <h3 className="mb-2 text-sm font-medium">{t("import.mode")}</h3>
              <RadioGroup
                value={mode}
                onValueChange={(v) => setMode(v as ImportMode)}
                className="grid gap-2 sm:grid-cols-3"
              >
                {(["add", "update", "replace"] as const).map((m) => (
                  <Label
                    key={m}
                    htmlFor={`import-mode-${m}`}
                    className={cn(
                      "hover:bg-muted/50 flex cursor-pointer items-start gap-2 rounded-md border p-2.5 font-normal",
                      mode === m && "border-primary bg-primary/5",
                    )}
                  >
                    <RadioGroupItem
                      value={m}
                      id={`import-mode-${m}`}
                      className="mt-0.5"
                      data-testid={`import-mode-${m}`}
                    />
                    <span>
                      <span className="block text-sm font-medium">{t(`import.modes.${m}`)}</span>
                      <span className="text-muted-foreground block text-xs">
                        {t(`import.modeHelp.${m}`)}
                      </span>
                    </span>
                  </Label>
                ))}
              </RadioGroup>
            </div>

            {/* プレビュー */}
            <div className="min-h-0">
              <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
                <h3 className="font-medium">{t("import.preview")}</h3>
                <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="size-3.5" />
                  {t("import.okCount", { count: ok.length })}
                </span>
                {warnings > 0 && (
                  <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="size-3.5" />
                    {t("import.warnCount", { count: warnings })}
                  </span>
                )}
                {errors > 0 && (
                  <span
                    className="text-destructive inline-flex items-center gap-1"
                    data-testid="import-error-count"
                  >
                    <AlertCircle className="size-3.5" />
                    {t("import.errorCount", { count: errors })}
                  </span>
                )}
                {newLabs.length > 0 && (
                  <span className="text-muted-foreground text-xs">
                    {t("import.newLabs", { names: newLabs.join(", ") })}
                  </span>
                )}
              </div>
              <PreviewTable rows={rows} />
            </div>
          </div>
        )}

        {step === "map" && (
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="ghost" onClick={() => setStep("source")}>
              <ArrowLeft />
              {t("common:actions.back")}
            </Button>
            <Button
              onClick={runImport}
              disabled={!hasName || ok.length === 0}
              data-testid="import-run"
            >
              {t("import.run", { count: ok.length })}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PreviewTable({ rows }: { rows: readonly ImportRow[] }) {
  const { t } = useTranslation(["members", "common"]);
  const labs = useProjectStore((s) => s.project.labs);
  const rooms = useProjectStore((s) => s.project.layout.rooms);
  const seatLabel = (r: ImportRow) => {
    if (!r.prev) return "";
    const room = rooms.find((x) => x.key === r.prev!.roomKey);
    const seat = r.prev.seatId ? room?.seats.find((s) => s.id === r.prev!.seatId) : undefined;
    return seat
      ? `${room?.name} / ${seat.label}`
      : t("prev.roomOnlyLabel", { room: room?.name ?? "?" });
  };
  return (
    <div className="max-h-80 overflow-auto rounded-md border" data-testid="import-preview">
      <table className="w-full text-xs">
        <thead className="bg-muted/80 sticky top-0 backdrop-blur">
          <tr className="text-muted-foreground text-left">
            <th className="px-2 py-1.5 font-medium">#</th>
            <th className="px-2 py-1.5 font-medium">{t("columns.name")}</th>
            <th className="px-2 py-1.5 font-medium">{t("columns.kana")}</th>
            <th className="px-2 py-1.5 font-medium">{t("columns.lab")}</th>
            <th className="px-2 py-1.5 font-medium">{t("columns.gender")}</th>
            <th className="px-2 py-1.5 font-medium">{t("columns.role")}</th>
            <th className="px-2 py-1.5 font-medium">{t("columns.tags")}</th>
            <th className="px-2 py-1.5 font-medium">{t("columns.prev")}</th>
            <th className="px-2 py-1.5 font-medium">{t("import.issuesCol")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const lab = r.labId ? labs.find((l) => l.id === r.labId) : undefined;
            const issues = [...r.errors, ...r.warnings];
            return (
              <tr
                key={r.line}
                className={cn(
                  "border-t",
                  r.errors.length
                    ? "bg-destructive/10"
                    : r.warnings.length
                      ? "bg-amber-500/5"
                      : undefined,
                )}
                data-testid={r.errors.length ? "import-row-error" : "import-row"}
              >
                <td className="text-muted-foreground px-2 py-1 tabular-nums">{r.line}</td>
                <td className="px-2 py-1 font-medium">{r.name || "—"}</td>
                <td className="text-muted-foreground px-2 py-1">{r.kana}</td>
                <td className="px-2 py-1">
                  {lab ? (
                    <LabBadge lab={lab} />
                  ) : r.labName ? (
                    <span className="text-primary">{t("import.newLab", { name: r.labName })}</span>
                  ) : null}
                </td>
                <td className="px-2 py-1">{t(`common:genders.${r.gender}`)}</td>
                <td className="px-2 py-1">
                  <RoleBadge role={r.role} />
                </td>
                <td className="px-2 py-1">{r.tags.join(", ")}</td>
                <td className="px-2 py-1 whitespace-nowrap">{seatLabel(r)}</td>
                <td className="px-2 py-1">
                  {issues.map((i, k) => (
                    <div
                      key={k}
                      className={cn(
                        r.errors.includes(i)
                          ? "text-destructive"
                          : "text-amber-700 dark:text-amber-300",
                      )}
                    >
                      {t(`import.issues.${i.code}`, { raw: i.raw ?? "" })}
                    </div>
                  ))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
