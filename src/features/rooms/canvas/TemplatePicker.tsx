/** 席テンプレートのピッカー（サムネイル付き）と、部屋テンプレートのサムネイル */
import { Popover as PopoverPrimitive } from "radix-ui";
import { useTranslation } from "react-i18next";
import {
  CanvasDefs,
  DEF,
  defUrl,
  floorPath,
  SeatGlyph,
  wallPath,
  DoorGlyph,
} from "@/components/canvas";
import type { Room } from "@/domain/schema";
import { startTemplate } from "../actions";
import { useEditor } from "../editorStore";
import { itemsSize, SEAT_TEMPLATES, type PlacementItem, type RoomTemplate } from "../lib/templates";

export function TemplatePicker() {
  const { t } = useTranslation("rooms");
  const facing = useEditor((s) => s.facing);
  return (
    <div className="space-y-2" data-testid="template-picker">
      <div>
        <div className="text-sm font-medium">{t("templates.title")}</div>
        <p className="text-muted-foreground text-xs">{t("templates.hint")}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {SEAT_TEMPLATES.map((tpl) => (
          <PopoverPrimitive.Close asChild key={tpl.id}>
            <button
              type="button"
              className="group hover:border-primary/60 hover:bg-accent/50 flex flex-col items-center gap-1 rounded-lg border p-2 text-xs transition-all hover:shadow-sm"
              data-testid={`template-${tpl.id}`}
              onClick={() => startTemplate(tpl.items)}
            >
              <ItemsThumb
                items={tpl.items}
                className="h-14 w-full transition-transform group-hover:scale-105"
              />
              <span className="font-medium">{t(`templates.seat.${tpl.id}`)}</span>
              <span className="text-muted-foreground">
                {t("canvas.seatBadge", { count: tpl.items.length })}
              </span>
            </button>
          </PopoverPrimitive.Close>
        ))}
      </div>
      <p className="text-muted-foreground text-xs">
        {t("templates.rotateHint", { dir: t(`facing.${facing}`) })}
      </p>
    </div>
  );
}

export function ItemsThumb({ items, className }: { items: PlacementItem[]; className?: string }) {
  const { w, h } = itemsSize(items);
  return (
    <svg viewBox={`-0.3 -0.3 ${w + 0.6} ${h + 0.6}`} className={className} aria-hidden>
      <rect
        x={-0.3}
        y={-0.3}
        width={w + 0.6}
        height={h + 0.6}
        rx={0.3}
        fill="var(--canvas-floor)"
      />
      {items.map((it, i) => (
        <SeatGlyph key={i} x={it.dx} y={it.dy} facing={it.facing} lod="mid" />
      ))}
    </svg>
  );
}

export function RoomThumb({
  tpl,
  color,
  className,
}: {
  tpl: RoomTemplate;
  color: string;
  className?: string;
}) {
  const room: Pick<Room, "width" | "height" | "cells"> = {
    width: tpl.width,
    height: tpl.height,
    cells: tpl.cells ?? Array.from({ length: tpl.width * tpl.height }, () => "floor" as const),
  };
  return (
    <svg
      viewBox={`-0.6 -0.6 ${tpl.width + 1.2} ${tpl.height + 1.2}`}
      className={className}
      aria-hidden
    >
      <CanvasDefs />
      <path d={floorPath(room)} fill={defUrl(DEF.floor)} />
      <path d={floorPath(room)} fill={color} fillOpacity={0.08} />
      {room.cells.map((k, i) =>
        k === "obstacle" ? (
          <rect
            key={i}
            x={(i % tpl.width) + 0.05}
            y={Math.floor(i / tpl.width) + 0.05}
            width={0.9}
            height={0.9}
            fill={defUrl(DEF.hatch)}
          />
        ) : null,
      )}
      <path
        d={wallPath(room)}
        stroke="var(--canvas-wall)"
        strokeWidth={0.15}
        strokeLinecap="square"
        fill="none"
      />
      {tpl.entrances.map((e, i) => (
        <DoorGlyph key={i} {...e} />
      ))}
      {tpl.seats.map((s, i) => (
        <SeatGlyph key={i} x={s.x} y={s.y} facing={s.facing} lod="mid" />
      ))}
    </svg>
  );
}
