import { Download, FileJson, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { PartialKind } from "./envelope";
import { exportPartialJson, pickAndImport } from "./io";

/**
 * 各画面のヘッダーに置ける「JSON 書き出し / 読み込み」メニュー。
 * 例: `<PageHeader actions={<PartialIoMenu kind="layout" />} />`
 */
export function PartialIoMenu({ kind }: { kind: PartialKind }) {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" data-testid={`partial-io-${kind}`}>
          <FileJson className="size-4" />
          JSON
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => exportPartialJson(kind)}>
          <Download className="size-4" />
          {t("actions.export")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void pickAndImport(kind)}>
          <Upload className="size-4" />
          {t("actions.import")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
