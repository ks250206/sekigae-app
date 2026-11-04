/**
 * キャンバスのポインタ操作をツールごとに振り分ける。
 * - 1 ストローク / 1 ドラッグ = 1 回の Undo（transaction.begin → commit）
 * - プレビュー（矩形・移動・リサイズ）は editorStore に書き、オーバーレイが描く
 */
import type { CanvasPointerEvent } from "@/components/canvas";
import type { ID, Room } from "@/domain/schema";
import { seatAt } from "@/domain/geometry/room";
import { getProject, transaction, useProjectStore } from "@/store/project";
import { useUiStore } from "@/store/ui";
import {
  addSeatsAt,
  clearSelection,
  commitPlacement,
  eraseCells,
  findRoom,
  resizeWithConfirm,
  selectEntrance,
  selectRoom,
  selectSeats,
  toggleEntrance,
} from "./actions";
import { isPaintTool, useEditor, type Hover, type PaintTool } from "./editorStore";
import {
  bresenham,
  canMoveSeats,
  entranceAt,
  nearestPerimeterEdge,
  normRect,
  rectCells,
  resizeLoss,
  resizeRect,
  roomAt,
  toLocal,
  type Pt,
  type ResizeHandle,
} from "./lib/editing";

type Drag =
  | { kind: "paint"; roomId: ID; tool: PaintTool; last: Pt; start: Pt; rect: boolean }
  | { kind: "seat"; roomId: ID; mode: "add" | "remove"; last: Pt }
  | { kind: "moveSeats"; roomId: ID; ids: ID[]; start: Pt; dx: number; dy: number; moved: boolean }
  | { kind: "marquee"; roomId: ID; start: Pt; cur: Pt; additive: boolean; moved: boolean }
  | { kind: "moveRoom"; roomId: ID; origin: Pt; start: { x: number; y: number } }
  | { kind: "resize"; roomId: ID; handle: ResizeHandle; start: { x: number; y: number } };

const store = () => useProjectStore.getState();
const visibleRooms = () => getProject().layout.rooms.filter((r) => !r.hidden);

/** 入口ツール用: 点の近くの外周辺（部屋の少し外側も含む） */
function edgeNear(rooms: Room[], wx: number, wy: number) {
  for (let i = rooms.length - 1; i >= 0; i--) {
    const r = rooms[i]!;
    const l = toLocal(r, wx, wy);
    if (l.x < -0.7 || l.y < -0.7 || l.x > r.width + 0.7 || l.y > r.height + 0.7) continue;
    const e = nearestPerimeterEdge(r, l.x, l.y);
    if (e) return { room: r, edge: e };
  }
  return null;
}

/** 選択ツール用: 入口の辺の近く（辺から 0.3 以内） */
function entranceNear(room: Room, lx: number, ly: number) {
  const e = nearestPerimeterEdge(room, lx, ly, 0.3);
  return e ? entranceAt(room, e) : undefined;
}

export function computeHover(e: CanvasPointerEvent): Hover {
  const tool = useEditor.getState().tool;
  const rooms = visibleRooms();
  const h: Hover = { wx: e.x, wy: e.y, cellX: e.cellX, cellY: e.cellY };
  if (tool === "entrance") {
    const near = edgeNear(rooms, e.x, e.y);
    if (near) {
      h.roomId = near.room.id;
      h.edge = near.edge;
      h.x = near.edge.x;
      h.y = near.edge.y;
      h.entranceId = entranceAt(near.room, near.edge)?.id;
    }
    return h;
  }
  const room = roomAt(rooms, e.x, e.y);
  if (!room) return h;
  const l = toLocal(room, e.cellX, e.cellY);
  h.roomId = room.id;
  h.x = l.x;
  h.y = l.y;
  h.seatId = seatAt(room, l.x, l.y)?.id;
  if (tool === "select") {
    const fl = toLocal(room, e.x, e.y);
    h.entranceId = entranceNear(room, fl.x, fl.y)?.id;
  }
  return h;
}

export function createInteraction() {
  let drag: Drag | null = null;

  const ed = () => useEditor.getState();

  const paintStep = (roomId: ID, tool: PaintTool, cells: Pt[]) => {
    const room = findRoom(roomId);
    if (!room) return;
    const inside = cells.filter(
      (c) => c.x >= 0 && c.y >= 0 && c.x < room.width && c.y < room.height,
    );
    if (!inside.length) return;
    if (tool === "eraser") eraseCells(roomId, inside);
    else store().paintCells(roomId, inside, tool);
  };

  const seatStep = (roomId: ID, mode: "add" | "remove", cells: Pt[]) => {
    const room = findRoom(roomId);
    if (!room) return;
    if (mode === "add") addSeatsAt(roomId, cells);
    else {
      const ids = cells.map((c) => seatAt(room, c.x, c.y)?.id).filter((x): x is ID => !!x);
      if (ids.length) store().removeSeats(roomId, ids);
    }
  };

  const onPointerDown = (e: CanvasPointerEvent) => {
    const editor = ed();
    const native = e.native;
    const target = native.target as Element;
    const additive = native.shiftKey || native.metaKey || native.ctrlKey;
    const hover = computeHover(e);

    // 配置プレビュー中ならクリックで確定
    if (editor.placement) {
      const room = roomAt(visibleRooms(), e.x, e.y);
      const placed = commitPlacement(e.cellX, e.cellY, room?.id);
      if (placed && !native.shiftKey) editor.setPlacement(null);
      return;
    }

    // ハンドル（ツールに依らず）: 部屋ヘッダー → 移動、リサイズハンドル
    const resizeEl = target.closest?.("[data-resize]");
    if (resizeEl) {
      const roomId = resizeEl.getAttribute("data-room-id")!;
      drag = {
        kind: "resize",
        roomId,
        handle: resizeEl.getAttribute("data-resize") as ResizeHandle,
        start: { x: e.x, y: e.y },
      };
      return;
    }
    const headerEl = target.closest?.("[data-room-header]");
    if (headerEl) {
      const roomId = headerEl.getAttribute("data-room-header")!;
      const room = findRoom(roomId);
      if (!room) return;
      if (!useUiStore.getState().selection.roomIds.includes(roomId) || !additive)
        selectRoom(roomId);
      transaction.begin();
      drag = { kind: "moveRoom", roomId, origin: { ...room.position }, start: { x: e.x, y: e.y } };
      return;
    }

    const tool = editor.tool;
    const room = hover.roomId ? findRoom(hover.roomId) : undefined;

    if (tool === "entrance") {
      if (room && hover.edge) toggleEntrance(room.id, hover.edge);
      editor.setHover(computeHover(e));
      return;
    }

    if (isPaintTool(tool)) {
      if (!room || hover.x === undefined || hover.y === undefined) return;
      const p = { x: hover.x, y: hover.y };
      if (native.shiftKey) {
        drag = { kind: "paint", roomId: room.id, tool, last: p, start: p, rect: true };
        editor.setPreview({
          kind: "rect",
          roomId: room.id,
          x: p.x,
          y: p.y,
          w: 1,
          h: 1,
          mode: "paint",
        });
        return;
      }
      transaction.begin();
      drag = { kind: "paint", roomId: room.id, tool, last: p, start: p, rect: false };
      paintStep(room.id, tool, [p]);
      return;
    }

    if (tool === "seat") {
      if (!room || hover.x === undefined || hover.y === undefined) return;
      const p = { x: hover.x, y: hover.y };
      const mode = hover.seatId ? "remove" : "add";
      transaction.begin();
      drag = { kind: "seat", roomId: room.id, mode, last: p };
      seatStep(room.id, mode, [p]);
      return;
    }

    if (tool === "select") {
      if (!room) {
        if (!additive) clearSelection();
        return;
      }
      if (hover.entranceId) {
        selectEntrance(room.id, hover.entranceId, additive);
        return;
      }
      if (hover.seatId) {
        const sel = useUiStore.getState().selection;
        const already = sel.seatIds.includes(hover.seatId);
        if (additive) selectSeats(room.id, [hover.seatId], true);
        else if (!already) selectSeats(room.id, [hover.seatId]);
        const now = useUiStore.getState().selection.seatIds;
        if (!now.includes(hover.seatId)) return;
        const ids = room.seats.filter((s) => now.includes(s.id)).map((s) => s.id);
        drag = {
          kind: "moveSeats",
          roomId: room.id,
          ids,
          start: { x: e.cellX, y: e.cellY },
          dx: 0,
          dy: 0,
          moved: false,
        };
        return;
      }
      if (!additive) selectRoom(room.id);
      const l = toLocal(room, e.x, e.y);
      drag = { kind: "marquee", roomId: room.id, start: l, cur: l, additive, moved: false };
    }
  };

  const onPointerMove = (e: CanvasPointerEvent) => {
    const editor = ed();
    if (!drag) {
      editor.setHover(computeHover(e));
      return;
    }
    const d = drag;
    if (d.kind === "moveRoom") {
      const dx = Math.round(e.x - d.start.x);
      const dy = Math.round(e.y - d.start.y);
      const room = findRoom(d.roomId);
      const next = { x: d.origin.x + dx, y: d.origin.y + dy };
      if (room && (room.position.x !== next.x || room.position.y !== next.y))
        store().moveRoom(d.roomId, next);
      return;
    }
    if (d.kind === "resize") {
      const room = findRoom(d.roomId);
      if (!room) return;
      const r = resizeRect(
        room,
        d.handle,
        Math.round(e.x - d.start.x),
        Math.round(e.y - d.start.y),
      );
      const loss = resizeLoss(room, r.w, r.h, {
        dx: room.position.x - r.x,
        dy: room.position.y - r.y,
      });
      editor.setPreview({
        kind: "resize",
        roomId: d.roomId,
        handle: d.handle,
        x: r.x,
        y: r.y,
        w: r.w,
        h: r.h,
        loss: loss.seats.length + loss.entrances.length,
      });
      return;
    }
    const room = findRoom(d.roomId);
    if (!room) return;
    const cell = { x: e.cellX - room.position.x, y: e.cellY - room.position.y };
    editor.setHover(computeHover(e));
    if (d.kind === "paint") {
      if (cell.x === d.last.x && cell.y === d.last.y) return;
      if (d.rect) {
        const r = normRect(d.start, cell);
        editor.setPreview({ kind: "rect", roomId: room.id, ...r, mode: "paint" });
      } else paintStep(room.id, d.tool, bresenham(d.last.x, d.last.y, cell.x, cell.y).slice(1));
      d.last = cell;
      return;
    }
    if (d.kind === "seat") {
      if (cell.x === d.last.x && cell.y === d.last.y) return;
      seatStep(room.id, d.mode, bresenham(d.last.x, d.last.y, cell.x, cell.y).slice(1));
      d.last = cell;
      return;
    }
    if (d.kind === "moveSeats") {
      const dx = e.cellX - d.start.x;
      const dy = e.cellY - d.start.y;
      if (dx === d.dx && dy === d.dy) return;
      d.dx = dx;
      d.dy = dy;
      d.moved = true;
      editor.setPreview({
        kind: "moveSeats",
        roomId: room.id,
        ids: d.ids,
        dx,
        dy,
        valid: canMoveSeats(room, new Set(d.ids), dx, dy),
      });
      return;
    }
    if (d.kind === "marquee") {
      const l = toLocal(room, e.x, e.y);
      d.cur = l;
      if (!d.moved && Math.hypot(l.x - d.start.x, l.y - d.start.y) < 0.3) return;
      d.moved = true;
      const a = { x: Math.floor(d.start.x), y: Math.floor(d.start.y) };
      const b = { x: Math.floor(l.x), y: Math.floor(l.y) };
      editor.setPreview({ kind: "rect", roomId: room.id, ...normRect(a, b), mode: "marquee" });
    }
  };

  const finish = async () => {
    const d = drag;
    drag = null;
    const editor = ed();
    const preview = editor.preview;
    editor.setPreview(null);
    if (!d) return;
    if (d.kind === "moveRoom" || d.kind === "seat") {
      transaction.commit();
      return;
    }
    if (d.kind === "paint") {
      if (d.rect && preview?.kind === "rect") {
        const cells = rectCells(
          { x: preview.x, y: preview.y },
          { x: preview.x + preview.w - 1, y: preview.y + preview.h - 1 },
        );
        transaction.begin();
        paintStep(d.roomId, d.tool, cells);
        transaction.commit();
      } else transaction.commit();
      return;
    }
    if (d.kind === "moveSeats") {
      const room = findRoom(d.roomId);
      if (!room || !d.moved || (d.dx === 0 && d.dy === 0)) return;
      if (!canMoveSeats(room, new Set(d.ids), d.dx, d.dy)) return;
      const ids = new Set(d.ids);
      store().moveSeats(
        room.id,
        room.seats
          .filter((s) => ids.has(s.id))
          .map((s) => ({ id: s.id, x: s.x + d.dx, y: s.y + d.dy })),
      );
      return;
    }
    if (d.kind === "marquee") {
      if (!d.moved || preview?.kind !== "rect") return;
      const room = findRoom(d.roomId);
      if (!room) return;
      const ids = room.seats
        .filter(
          (s) =>
            s.x >= preview.x &&
            s.y >= preview.y &&
            s.x < preview.x + preview.w &&
            s.y < preview.y + preview.h,
        )
        .map((s) => s.id);
      if (d.additive) {
        const cur = useUiStore.getState().selection.seatIds;
        selectSeats(room.id, [...new Set([...cur, ...ids])]);
      } else selectSeats(room.id, ids);
      return;
    }
    if (d.kind === "resize") {
      if (preview?.kind !== "resize") return;
      const room = findRoom(d.roomId);
      if (!room) return;
      const { x, y, w, h } = preview;
      if (x === room.position.x && y === room.position.y && w === room.width && h === room.height)
        return;
      await resizeWithConfirm(room.id, w, h, { dx: room.position.x - x, dy: room.position.y - y });
    }
  };

  const onPointerUp = () => void finish();

  const onPointerLeave = () => {
    if (!drag) ed().setHover(null);
  };

  /** Esc: ドラッグ中なら取り消す */
  const cancel = (): boolean => {
    if (!drag) return false;
    const d = drag;
    drag = null;
    ed().setPreview(null);
    if (d.kind === "moveRoom" || d.kind === "seat" || (d.kind === "paint" && !d.rect))
      transaction.cancel();
    return true;
  };

  return { onPointerDown, onPointerMove, onPointerUp, onPointerLeave, cancel };
}

export type Interaction = ReturnType<typeof createInteraction>;
