/** 部屋エディタのキャンバス: FloorCanvas + 部屋レイヤー + プレビュー + ツール類 */
import { Flame, Grid3x3, Hash, Map as MapIcon, Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  DepthHeatmapOverlay,
  FloorCanvas,
  HeatmapLegend,
  Minimap,
  roomBounds,
  roomsBounds,
  unionBounds,
  useViewport,
  visibleBounds,
  ZoomControls,
  type ViewportController,
} from "@/components/canvas";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ROOM_PALETTE } from "@/graphics/palette";
import { cn } from "@/lib/utils";
import { usePrefs } from "@/store/prefs";
import { getProject } from "@/store/project";
import { seatIndex, useRooms } from "@/store/selectors";
import { useUiStore } from "@/store/ui";
import { addRoomFromTemplate } from "../actions";
import { useEditor } from "../editorStore";
import { createInteraction } from "../interaction";
import { ROOM_TEMPLATES } from "../lib/templates";
import { formatCombo, ROOM_SHORTCUTS } from "../shortcuts";
import { TOOLS } from "../tools";
import { useRoomShortcuts } from "../useRoomShortcuts";
import { EditorRooms } from "./EditorRooms";
import { DragPreview, HoverPreview, PlacementPreview } from "./Overlays";
import { RoomThumb } from "./TemplatePicker";
import { ToolPalette } from "./ToolPalette";

export function EditorCanvas() {
  const { t } = useTranslation("rooms");
  const rooms = useRooms();
  const visible = useMemo(() => rooms.filter((r) => !r.hidden), [rooms]);
  const viewport = useViewport();
  const [interaction] = useState(createInteraction);
  const tool = useEditor((s) => s.tool);
  const placing = useEditor((s) => s.placement !== null);
  const showRanks = useEditor((s) => s.showRanks);
  const canvas = usePrefs((s) => s.canvas);
  const selection = useUiStore((s) => s.selection);
  const [initialFit] = useState(() => roomsBounds(visible));

  const fitAll = useCallback(
    () => viewport.fit(roomsBounds(visibleRoomsNow()), { padding: 72 }),
    [viewport],
  );

  const selectionBounds = useMemo(() => {
    const idx = seatIndex(rooms);
    const seatBoxes = selection.seatIds
      .map((id) => idx.get(id))
      .filter((r) => r !== undefined)
      .map(({ room, seat }) => ({
        x: room.position.x + seat.x,
        y: room.position.y + seat.y,
        width: 1,
        height: 1,
      }));
    if (seatBoxes.length) return unionBounds(seatBoxes);
    return unionBounds(rooms.filter((r) => selection.roomIds.includes(r.id)).map(roomBounds));
  }, [rooms, selection]);

  const fitSelection = useCallback(() => {
    if (selectionBounds) viewport.fit(selectionBounds, { padding: 96 });
  }, [viewport, selectionBounds]);

  useRoomShortcuts({ viewport, interaction, fitAll, fitSelection });
  useFollowSelection(viewport, selection.roomIds[0]);

  const cursor = placing ? "copy" : (TOOLS.find((x) => x.id === tool)?.cursor ?? "default");

  return (
    <FloorCanvas
      viewport={viewport}
      initialFit={initialFit}
      showGrid={canvas.showGrid}
      panMode={tool === "pan"}
      cursor={cursor}
      aria-label={t("canvas.label")}
      data-testid="floor-canvas"
      onPointerDown={interaction.onPointerDown}
      onPointerMove={interaction.onPointerMove}
      onPointerUp={interaction.onPointerUp}
      onPointerLeave={interaction.onPointerLeave}
      overlay={
        <>
          <AnimatePresence>
            {canvas.showHeatmap && (
              <DepthHeatmapOverlay key="heat" rooms={visible} showRank={showRanks} />
            )}
          </AnimatePresence>
          <HoverPreview />
          <DragPreview />
          <PlacementPreview />
        </>
      }
      chrome={
        <>
          <ToolPalette />
          <ViewToggles />
          <ToolHint />
          <div className="absolute right-3 bottom-3 z-10 flex flex-col items-end gap-2">
            <AnimatePresence>
              {canvas.showMinimap && visible.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                >
                  <Minimap
                    rooms={visible}
                    viewport={viewport}
                    selectedRoomIds={selection.roomIds}
                  />
                </motion.div>
              )}
            </AnimatePresence>
            <ZoomControls
              viewport={viewport}
              onFitAll={fitAll}
              onFitSelection={selectionBounds ? fitSelection : undefined}
            />
          </div>
          <AnimatePresence>
            {canvas.showHeatmap && (
              <motion.div
                className="absolute bottom-3 left-3 z-10"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
              >
                <HeatmapLegend />
              </motion.div>
            )}
          </AnimatePresence>
          {rooms.length === 0 && <EmptyState />}
        </>
      }
    >
      <EditorRooms />
    </FloorCanvas>
  );
}

/** ストアから直接読む（コールバックを安定させるため） */
const getRoomsSnapshot = () => getProject().layout.rooms;
const visibleRoomsNow = () => getRoomsSnapshot().filter((r) => !r.hidden);

/** 選択した部屋が画面外なら、そこまでスクロールする（リスト ⇔ キャンバス同期） */
function useFollowSelection(viewport: ViewportController, roomId: string | undefined) {
  useEffect(() => {
    if (!roomId) return;
    const room = getRoomsSnapshot().find((r) => r.id === roomId);
    if (!room) return;
    const v = visibleBounds(viewport.getState());
    const b = roomBounds(room);
    const inside =
      b.x >= v.x &&
      b.y >= v.y &&
      b.x + b.width <= v.x + v.width &&
      b.y + b.height <= v.y + v.height;
    if (!inside) viewport.centerOn(b.x + b.width / 2, b.y + b.height / 2, true);
  }, [viewport, roomId]);
}

function ViewToggles() {
  const { t } = useTranslation("rooms");
  const canvas = usePrefs((s) => s.canvas);
  const setCanvas = usePrefs((s) => s.setCanvas);
  const showRanks = useEditor((s) => s.showRanks);
  const setShowRanks = useEditor((s) => s.setShowRanks);
  const items: {
    key: string;
    icon: ReactNode;
    on: boolean;
    toggle: () => void;
    label: string;
    kbd?: string;
  }[] = [
    {
      key: "grid",
      icon: <Grid3x3 className="size-4" />,
      on: canvas.showGrid,
      toggle: () => setCanvas({ showGrid: !canvas.showGrid }),
      label: t("canvas.toggleGrid"),
      kbd: "G",
    },
    {
      key: "heatmap",
      icon: <Flame className="size-4" />,
      on: canvas.showHeatmap,
      toggle: () => setCanvas({ showHeatmap: !canvas.showHeatmap }),
      label: t("canvas.toggleHeatmap"),
      kbd: formatCombo("shift+h"),
    },
    ...(canvas.showHeatmap
      ? [
          {
            key: "ranks",
            icon: <Hash className="size-4" />,
            on: showRanks,
            toggle: () => setShowRanks(!showRanks),
            label: t("canvas.toggleRanks"),
          },
        ]
      : []),
    {
      key: "minimap",
      icon: <MapIcon className="size-4" />,
      on: canvas.showMinimap,
      toggle: () => setCanvas({ showMinimap: !canvas.showMinimap }),
      label: t("canvas.toggleMinimap"),
      kbd: "M",
    },
  ];
  return (
    <div className="bg-popover/90 absolute top-3 right-3 z-10 flex gap-0.5 rounded-xl border p-1 shadow-lg backdrop-blur">
      {items.map((it) => (
        <Tooltip key={it.key}>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-pressed={it.on}
              aria-label={it.label}
              data-testid={`toggle-${it.key}`}
              onClick={it.toggle}
              className={cn(
                "grid size-8 place-items-center rounded-lg transition-colors",
                it.on
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              {it.icon}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {it.label}
            {it.kbd && <kbd className="ml-1 opacity-70">{it.kbd}</kbd>}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

/** 画面上部の操作ヒント（ツール・配置中） */
function ToolHint() {
  const { t } = useTranslation("rooms");
  const tool = useEditor((s) => s.tool);
  const placement = useEditor((s) => s.placement);
  const text = placement
    ? t(placement.kind === "room" ? "hint.placeRoom" : "hint.placeSeats")
    : t(`hint.${tool}`);
  return (
    <div className="pointer-events-none absolute top-3 left-1/2 z-10 -translate-x-1/2">
      <AnimatePresence mode="wait">
        <motion.div
          key={text}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.15 }}
          className={cn(
            "rounded-full border px-3 py-1 text-xs shadow-sm backdrop-blur",
            placement
              ? "bg-primary text-primary-foreground"
              : "bg-popover/85 text-muted-foreground",
          )}
          data-testid="tool-hint"
        >
          {text}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function EmptyState() {
  const { t } = useTranslation("rooms");
  return (
    <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-popover/95 pointer-events-auto max-w-md rounded-2xl border p-6 text-center shadow-xl backdrop-blur"
        data-testid="rooms-empty"
      >
        <h2 className="text-lg font-semibold">{t("empty.title")}</h2>
        <p className="text-muted-foreground mt-1 text-sm">{t("empty.description")}</p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {ROOM_TEMPLATES.filter((x) => x.id !== "empty").map((tpl, i) => (
            <button
              key={tpl.id}
              type="button"
              className="hover:border-primary/60 hover:bg-accent/50 flex flex-col items-center gap-1 rounded-xl border p-2 text-xs transition-all hover:-translate-y-0.5 hover:shadow-md"
              onClick={() => addRoomFromTemplate({ template: tpl.id })}
              data-testid={`empty-template-${tpl.id}`}
            >
              <RoomThumb tpl={tpl} color={ROOM_PALETTE[i]!} className="h-16 w-full" />
              <span className="font-medium">{t(`templates.room.${tpl.id}`)}</span>
              <span className="text-muted-foreground">
                {tpl.width}×{tpl.height}
              </span>
            </button>
          ))}
        </div>
        <Button
          className="mt-4"
          onClick={() => addRoomFromTemplate({})}
          data-testid="empty-add-room"
        >
          <Plus className="size-4" />
          {t("empty.blank")}
        </Button>
        <p className="text-muted-foreground mt-3 text-xs">
          {t("empty.shortcutsHint", {
            keys: ROOM_SHORTCUTS.filter((s) => s.group === "tools")
              .slice(0, 6)
              .map((s) => formatCombo(s.combos[0]))
              .join(" "),
          })}
        </p>
      </motion.div>
    </div>
  );
}
