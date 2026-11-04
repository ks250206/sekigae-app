import { useTranslation } from "react-i18next";
import { GENDERS } from "@/domain/genders";
import { ROLE_ORDER } from "@/domain/roles";
import { downloadBlob } from "@/lib/backup";
import { buildTemplateXlsx } from "./fileIO";
import { IMPORT_FIELDS } from "./importRows";

/** 取込用テンプレート XLSX のダウンロード（ExcelJS は遅延ロード） */
export function useTemplateDownload() {
  const { t } = useTranslation(["members", "common"]);
  return async () => {
    const blob = await buildTemplateXlsx({
      sheet: t("import.template.sheet"),
      headers: IMPORT_FIELDS.map((f) => t(`import.fields.${f}`)),
      samples: [t("import.template.sample1").split("|"), t("import.template.sample2").split("|")],
      roleValues: ROLE_ORDER.map((r) => t(`common:roles.${r}`)),
      genderValues: GENDERS.map((g) => t(`common:genders.${g}`)),
      roleCol: IMPORT_FIELDS.indexOf("role"),
      genderCol: IMPORT_FIELDS.indexOf("gender"),
    });
    downloadBlob(t("import.template.filename"), blob);
  };
}
