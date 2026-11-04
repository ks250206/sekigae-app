/** 部屋の追加フォーム（名前・サイズ・部屋テンプレート） */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAX_ROOM_SIZE } from "@/domain/schema";
import { nextPaletteColor, ROOM_PALETTE } from "@/graphics/palette";
import { cn } from "@/lib/utils";
import { useRooms } from "@/store/selectors";
import { addRoomFromTemplate } from "../actions";
import { ROOM_TEMPLATES, type RoomTemplateId } from "../lib/templates";
import { RoomThumb } from "../canvas/TemplatePicker";

const clampSize = (n: number) => Math.max(1, Math.min(MAX_ROOM_SIZE, Math.round(n) || 1));

export function AddRoomForm({ onDone }: { onDone?: () => void }) {
  const { t } = useTranslation("rooms");
  const rooms = useRooms();
  const [name, setName] = useState("");
  const [template, setTemplate] = useState<RoomTemplateId>("empty");
  const [width, setWidth] = useState(8);
  const [height, setHeight] = useState(6);
  const color = nextPaletteColor(
    ROOM_PALETTE,
    rooms.map((r) => r.color),
  );

  const submit = () => {
    addRoomFromTemplate({ name, template, width: clampSize(width), height: clampSize(height) });
    onDone?.();
  };

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      data-testid="add-room-form"
    >
      <div className="space-y-1">
        <Label htmlFor="new-room-name">{t("add.name")}</Label>
        <Input
          id="new-room-name"
          autoFocus
          value={name}
          placeholder={t("list.defaultName", { n: rooms.length + 1 })}
          onChange={(e) => setName(e.target.value)}
          data-testid="add-room-name"
        />
      </div>
      <div>
        <Label className="mb-1">{t("add.template")}</Label>
        <div className="grid grid-cols-4 gap-1.5">
          {ROOM_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              aria-pressed={template === tpl.id}
              data-testid={`room-template-${tpl.id}`}
              onClick={() => {
                setTemplate(tpl.id);
                setWidth(tpl.width);
                setHeight(tpl.height);
              }}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-lg border p-1 text-[11px] transition-all",
                template === tpl.id
                  ? "border-primary bg-accent ring-primary/30 ring-2"
                  : "hover:bg-accent/50 hover:border-primary/40",
              )}
            >
              <RoomThumb tpl={tpl} color={color} className="h-10 w-full" />
              {t(`templates.room.${tpl.id}`)}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1">
          <Label htmlFor="new-room-w">{t("add.width")}</Label>
          <Input
            id="new-room-w"
            type="number"
            min={1}
            max={MAX_ROOM_SIZE}
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
            data-testid="add-room-width"
          />
        </div>
        <span className="text-muted-foreground pb-2">×</span>
        <div className="flex-1 space-y-1">
          <Label htmlFor="new-room-h">{t("add.height")}</Label>
          <Input
            id="new-room-h"
            type="number"
            min={1}
            max={MAX_ROOM_SIZE}
            value={height}
            onChange={(e) => setHeight(Number(e.target.value))}
            data-testid="add-room-height"
          />
        </div>
      </div>
      <p className="text-muted-foreground text-xs">{t("add.autoPlace")}</p>
      <Button type="submit" className="w-full" data-testid="add-room-submit">
        {t("add.submit")}
      </Button>
    </form>
  );
}
