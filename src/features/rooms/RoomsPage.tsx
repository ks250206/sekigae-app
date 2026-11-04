import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/PageHeader";

export default function RoomsPage() {
  const { t } = useTranslation("rooms");
  return (
    <div className="flex h-full flex-col">
      <PageHeader title={t("title")} description={t("description")} />
    </div>
  );
}
