import i18n from "@/i18n";
import { history, useProjectStore } from "@/store/project";
import { createSampleProject } from "./sampleProject";

/** サンプルプロジェクトを開く（現在の UI 言語版） */
export function openSampleProject() {
  const lang = i18n.resolvedLanguage === "en" ? "en" : "ja";
  useProjectStore.getState().replaceProject(createSampleProject(lang));
  history.clear();
}
