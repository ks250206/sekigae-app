import { projectSchema } from "@/domain/schema";
import { history, useProjectStore } from "@/store/project";

/**
 * バックアップ JSON を読み込んで現在のプロジェクトにする（簡易版）。
 * 永続化機能の import が使える場合はそちらに差し替える。
 */
export async function importBackupFile(file: File): Promise<boolean> {
  try {
    const json: unknown = JSON.parse(await file.text());
    const data =
      json && typeof json === "object" && "data" in json ? (json as { data: unknown }).data : json;
    const parsed = projectSchema.safeParse(data);
    if (!parsed.success) return false;
    useProjectStore.getState().replaceProject(parsed.data);
    history.clear();
    return true;
  } catch {
    return false;
  }
}
