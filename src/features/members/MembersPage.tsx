import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/PageHeader";

export default function MembersPage() {
  const { t } = useTranslation("members");
  return (
    <div className="flex h-full flex-col">
      <PageHeader title={t("title")} description={t("description")} />
    </div>
  );
}
