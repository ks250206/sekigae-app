import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/PageHeader";
import { EditorCanvas } from "./canvas/EditorCanvas";
import { useEditor } from "./editorStore";
import { Inspector } from "./panels/Inspector";
import { RoomListPanel } from "./panels/RoomListPanel";

export default function RoomsPage() {
  const { t } = useTranslation("rooms");
  // 画面を離れたら一時状態（配置プレビューなど）を捨てる
  useEffect(
    () => () => {
      const ed = useEditor.getState();
      ed.setPlacement(null);
      ed.setPreview(null);
      ed.setHover(null);
    },
    [],
  );
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title={t("title")} description={t("description")} />
      <div className="flex min-h-0 flex-1">
        <div className="hidden md:flex">
          <RoomListPanel />
        </div>
        <div className="relative min-w-0 flex-1" data-tour="room-canvas">
          <EditorCanvas />
        </div>
        <div className="hidden lg:flex">
          <Inspector />
        </div>
      </div>
    </div>
  );
}
