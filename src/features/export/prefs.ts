/** 出力ダイアログの選択内容の記憶（prefs.ui.export）。プロジェクト固有の値（案・部屋）は保存しない */
import { useCallback } from "react";
import { SUPPORTED_LANGUAGES, type Language } from "@/i18n";
import { usePrefs } from "@/store/prefs";
import {
  COLOR_BY_MODES,
  EXPORT_COLUMNS,
  type ColorBy,
  type ExportColumn,
  type ExportFormat,
} from "./model";

export interface ExportPrefs {
  format: ExportFormat;
  lang: Language;
  columns: ExportColumn[];
  colorBy: ColorBy;
  floorSheet: boolean;
  compositionTable: boolean;
}

export const EXPORT_PREFS_KEY = "export";
const FORMATS: readonly ExportFormat[] = ["xlsx", "pptx", "png"];

export function defaultExportPrefs(uiLanguage: string | undefined): ExportPrefs {
  return {
    format: "xlsx",
    lang: uiLanguage?.startsWith("ja") ? "ja" : "en",
    columns: ["role", "lab"],
    colorBy: "role",
    floorSheet: false,
    compositionTable: false,
  };
}

/** 保存値を検証して既定値に重ねる */
export function normalizeExportPrefs(raw: unknown, defaults: ExportPrefs): ExportPrefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pick = <T>(v: unknown, allowed: readonly T[], d: T): T =>
    allowed.includes(v as T) ? (v as T) : d;
  return {
    format: pick(r.format, FORMATS, defaults.format),
    lang: pick(r.lang, SUPPORTED_LANGUAGES, defaults.lang),
    columns: Array.isArray(r.columns)
      ? EXPORT_COLUMNS.filter((c) => (r.columns as unknown[]).includes(c))
      : defaults.columns,
    colorBy: pick(r.colorBy, COLOR_BY_MODES, defaults.colorBy),
    floorSheet: typeof r.floorSheet === "boolean" ? r.floorSheet : defaults.floorSheet,
    compositionTable:
      typeof r.compositionTable === "boolean" ? r.compositionTable : defaults.compositionTable,
  };
}

export function useExportPrefs(uiLanguage: string | undefined) {
  const raw = usePrefs((s) => s.ui[EXPORT_PREFS_KEY]);
  const setUi = usePrefs((s) => s.setUi);
  const prefs = normalizeExportPrefs(raw, defaultExportPrefs(uiLanguage));
  const update = useCallback(
    (patch: Partial<ExportPrefs>) => {
      const current = normalizeExportPrefs(
        usePrefs.getState().ui[EXPORT_PREFS_KEY],
        defaultExportPrefs(uiLanguage),
      );
      setUi(EXPORT_PREFS_KEY, { ...current, ...patch });
    },
    [setUi, uiLanguage],
  );
  return [prefs, update] as const;
}
