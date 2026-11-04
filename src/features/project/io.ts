/**
 * JSON 書き出し / 読み込みのエントリポイント。
 * 他の画面からも呼べる（例: 部屋エディタのメニューから exportLayoutJson() / pickAndImport("layout")）。
 */
import { toast } from "sonner";
import type { Project } from "@/domain/schema";
import { SCHEMA_VERSION } from "@/domain/schema";
import i18n from "@/i18n";
import { downloadText } from "@/lib/backup";
import { importProject, projectExists } from "@/store/persistence";
import { getProject, useProjectStore } from "@/store/project";
import { choose } from "./choice";
import {
  exportFilename,
  extractPartial,
  ImportError,
  makeEnvelope,
  parseImport,
  type EnvelopeDataMap,
  type EnvelopeKind,
  type PartialKind,
} from "./envelope";
import { applyLayout, applyMembers, applyRules, type ApplyResult, type ImportMode } from "./merge";

const kindLabel = (kind: EnvelopeKind) => i18n.t(`project.kinds.${kind}`);

function downloadJson(filename: string, data: unknown) {
  downloadText(filename, `${JSON.stringify(data, null, 2)}\n`, "application/json");
}

// ---------------------------------------------------------------------------
// 書き出し
// ---------------------------------------------------------------------------

/** プロジェクト全体を `<名前>_<日付>.sekigae.json` でダウンロード */
export function exportProjectJson(project: Project = getProject()) {
  downloadJson(exportFilename(project.name, "project"), makeEnvelope("project", project));
}

export function exportPartialJson(kind: PartialKind, project: Project = getProject()) {
  downloadJson(
    exportFilename(project.name, kind),
    makeEnvelope(kind, extractPartial(project, kind)),
  );
}

export const exportLayoutJson = (p?: Project) => exportPartialJson("layout", p);
export const exportMembersJson = (p?: Project) => exportPartialJson("members", p);
export const exportRulesJson = (p?: Project) => exportPartialJson("rules", p);

// ---------------------------------------------------------------------------
// 読み込み
// ---------------------------------------------------------------------------

/** ファイル選択ダイアログを開く。キャンセル時は null */
export function pickJsonFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.style.display = "none";
    input.addEventListener("change", () => {
      resolve(input.files?.[0] ?? null);
      input.remove();
    });
    input.addEventListener("cancel", () => {
      resolve(null);
      input.remove();
    });
    document.body.appendChild(input);
    input.click();
  });
}

/** 読み込みエラーを利用者向けの文に */
export function describeImportError(e: unknown): string {
  if (!(e instanceof ImportError)) return e instanceof Error ? e.message : String(e);
  switch (e.code) {
    case "notJson":
      return i18n.t("project.import.errors.notJson");
    case "notSekigae":
      return i18n.t("project.import.errors.notSekigae");
    case "future":
      return i18n.t("project.import.errors.future", {
        version: e.version,
        supported: SCHEMA_VERSION,
      });
    case "invalid":
      return [i18n.t("project.import.errors.invalid"), ...e.issues.map((i) => `• ${i}`)].join("\n");
  }
}

function showError(message: string) {
  toast.error(i18n.t("project.import.errorTitle"), {
    description: message,
    classNames: { description: "whitespace-pre-line break-all" },
    duration: 10_000,
  });
}

/** プロジェクト全体を取り込む。ID が既にあれば「新規 / 上書き」を選ばせる */
export async function importProjectData(project: Project): Promise<boolean> {
  let mode: "new" | "overwrite" = "new";
  if (projectExists(project.id)) {
    const answer = await choose({
      title: i18n.t("project.import.collisionTitle"),
      description: i18n.t("project.import.collisionDescription", { name: project.name }),
      options: [
        { value: "new" as const, label: i18n.t("project.import.asNew") },
        {
          value: "overwrite" as const,
          label: i18n.t("project.import.overwrite"),
          destructive: true,
        },
      ],
    });
    if (!answer) return false;
    mode = answer;
  }
  if (!importProject(project, mode)) return false;
  toast.success(i18n.t("project.import.success", { name: project.name }));
  return true;
}

/** 部分データを開いているプロジェクトへ適用する（Undo 可能）。mode 省略時は選ばせる */
export async function importPartialData<K extends PartialKind>(
  kind: K,
  data: EnvelopeDataMap[K],
  mode?: ImportMode,
): Promise<boolean> {
  const label = kindLabel(kind);
  const chosen =
    mode ??
    (await choose<ImportMode>({
      title: i18n.t("project.import.modeTitle", { kind: label }),
      description: i18n.t("project.import.modeDescription", { name: getProject().name }),
      options: [
        {
          value: "merge",
          label: i18n.t("project.import.merge"),
          description: i18n.t("project.import.mergeHint", { kind: label }),
        },
        {
          value: "replace",
          label: i18n.t("project.import.replace"),
          description: i18n.t("project.import.replaceHint", { kind: label }),
          destructive: true,
        },
      ],
    }));
  if (!chosen) return false;
  let result: ApplyResult = { dangling: 0 };
  useProjectStore.getState().update((d) => {
    const p = d as Project;
    if (kind === "layout") result = applyLayout(p, data as EnvelopeDataMap["layout"], chosen);
    else if (kind === "members")
      result = applyMembers(p, data as EnvelopeDataMap["members"], chosen);
    else result = applyRules(p, data as EnvelopeDataMap["rules"], chosen);
  });
  toast.success(i18n.t("project.import.partialSuccess", { kind: label }));
  if (result.dangling > 0)
    toast.warning(i18n.t("project.import.dangling", { count: result.dangling }));
  return true;
}

/**
 * ファイルを読み込む。expect を指定するとその種類以外は拒否する。
 * 成功（取り込み完了）で true。
 */
export async function importJsonFile(
  file: File,
  opts: { expect?: EnvelopeKind; mode?: ImportMode } = {},
): Promise<boolean> {
  let parsed;
  try {
    parsed = parseImport(await file.text());
  } catch (e) {
    showError(describeImportError(e));
    return false;
  }
  if (opts.expect && parsed.kind !== opts.expect) {
    showError(i18n.t("project.import.errors.wrongKind", { kind: kindLabel(parsed.kind) }));
    return false;
  }
  if (parsed.kind === "project") return importProjectData(parsed.data);
  return importPartialData(parsed.kind, parsed.data, opts.mode);
}

/** ファイル選択 → 読み込み */
export async function pickAndImport(expect?: EnvelopeKind, mode?: ImportMode): Promise<boolean> {
  const file = await pickJsonFile();
  if (!file) return false;
  return importJsonFile(file, { expect, mode });
}
