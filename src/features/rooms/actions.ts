/**
 * 部屋エディタの編集コマンド。ポインタ操作・ショートカット・パネルから共通に呼ぶ。
 * ストアは getState() で読むので React 外からも使える。
 */
import { toast } from "sonner";
import { confirm } from "@/components/confirm";
import type { CellKind, Facing, ID, Room, Seat } from "@/domain/schema";
import { nextPaletteColor, ROOM_PALETTE } from "@/graphics/palette";
import i18n from "@/i18n";
import { newId } from "@/lib/id";
import { batch, getProject, useProjectStore } from "@/store/project";
import { seatIndex } from "@/store/selectors";
import { useUiStore } from "@/store/ui";
import { useEditor } from "./editorStore";
import {
  assignedSeatCount,
  canMoveSeats,
  canPlaceSeat,
  entranceAt,
  findFreeSpot,
  nextSeatLabels,
  numberSeats,
  rotateFacing,
  type NumberingOrder,
  type Pt,
} from "./lib/editing";
import {
  itemsAnchor,
  itemsFromSeats,
  ROOM_TEMPLATES,
  rotateItems,
  type PlacementItem,
  type RoomTemplateId,
} from "./lib/templates";

const tr = () => i18n.getFixedT(null, "rooms");
const store = () => useProjectStore.getState();
const ui = () => useUiStore.getState();
const rooms = () => getProject().layout.rooms;
export const findRoom = (id: ID | undefined) => (id ? rooms().find((r) => r.id === id) : undefined);

// ---------------------------------------------------------------------------
// 選択
// ---------------------------------------------------------------------------

export function selectRoom(roomId: ID | null) {
  ui().setSelection({ roomIds: roomId ? [roomId] : [], seatIds: [], entranceIds: [] });
}

/** 席を選択。additive なら切り替え */
export function selectSeats(roomId: ID, ids: ID[], additive = false) {
  const cur = ui().selection;
  if (!additive) {
    ui().setSelection({ roomIds: [roomId], seatIds: ids, entranceIds: [] });
    return;
  }
  const set = new Set(cur.seatIds);
  for (const id of ids) {
    if (set.has(id)) set.delete(id);
    else set.add(id);
  }
  const roomIds = cur.roomIds.includes(roomId) ? cur.roomIds : [...cur.roomIds, roomId];
  ui().setSelection({ roomIds, seatIds: [...set], entranceIds: cur.entranceIds });
}

export function selectEntrance(roomId: ID, id: ID, additive = false) {
  const cur = ui().selection;
  const entranceIds = additive
    ? cur.entranceIds.includes(id)
      ? cur.entranceIds.filter((x) => x !== id)
      : [...cur.entranceIds, id]
    : [id];
  ui().setSelection({
    roomIds: [roomId],
    seatIds: additive ? cur.seatIds : [],
    entranceIds,
  });
}

export const clearSelection = () => ui().clearSelection();

/** 選択中の部屋（無ければ全部屋）の席をすべて選択 */
export function selectAll() {
  const sel = ui().selection;
  const target = sel.roomIds.length ? rooms().filter((r) => sel.roomIds.includes(r.id)) : rooms();
  const visible = target.filter((r) => !r.hidden);
  ui().setSelection({
    roomIds: visible.map((r) => r.id),
    seatIds: visible.flatMap((r) => r.seats.map((s) => s.id)),
    entranceIds: [],
  });
}

/** 選択中の席を部屋ごとにまとめる */
export function selectedSeatsByRoom(): Map<ID, Seat[]> {
  const idx = seatIndex(rooms());
  const out = new Map<ID, Seat[]>();
  for (const id of ui().selection.seatIds) {
    const ref = idx.get(id);
    if (!ref) continue;
    const list = out.get(ref.room.id) ?? [];
    list.push(ref.seat);
    out.set(ref.room.id, list);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 部屋
// ---------------------------------------------------------------------------

export function addRoomFromTemplate(opts: {
  name?: string;
  width?: number;
  height?: number;
  template?: RoomTemplateId;
  position?: Pt;
}): ID {
  const t = tr();
  const all = rooms();
  const tpl = ROOM_TEMPLATES.find((x) => x.id === (opts.template ?? "empty"))!;
  const width = opts.width ?? tpl.width;
  const height = opts.height ?? tpl.height;
  const name = opts.name?.trim() || t("list.defaultName", { n: all.length + 1 });
  const fits = (p: { x: number; y: number }) => p.x < width && p.y < height;
  const draft: Room = {
    id: "",
    key: "",
    name,
    color: nextPaletteColor(
      ROOM_PALETTE,
      all.map((r) => r.color),
    ),
    position: { x: 0, y: 0 },
    width,
    height,
    cells:
      tpl.cells && tpl.width === width && tpl.height === height
        ? [...tpl.cells]
        : Array.from({ length: width * height }, (): CellKind => "floor"),
    seats: [],
    entrances: [],
  };
  const labels = nextSeatLabels(draft, tpl.seats.length);
  const seats = tpl.seats
    .filter(fits)
    .map((s, i) => ({ ...s, id: newId("seat_"), label: labels[i]!, tags: [] }));
  const entrances = tpl.entrances
    .filter(fits)
    .map((e) => ({ ...e, id: newId("ent_") }));
  const position = opts.position ?? findFreeSpot(all, width, height);
  const id = store().addRoom({
    name,
    color: draft.color,
    width,
    height,
    cells: draft.cells,
    seats,
    entrances,
    position,
  });
  selectRoom(id);
  return id;
}

export async function deleteRoom(roomId: ID): Promise<boolean> {
  const room = findRoom(roomId);
  if (!room) return false;
  const t = tr();
  const assigned = assignedSeatCount(
    getProject(),
    room.seats.map((s) => s.id),
  );
  const ok = await confirm({
    title: t("confirm.deleteRoom.title", { name: room.name }),
    description:
      assigned > 0
        ? t("confirm.deleteRoom.assigned", { count: assigned })
        : t("confirm.deleteRoom.description", { count: room.seats.length }),
    confirmLabel: t("confirm.deleteRoom.confirm"),
    destructive: true,
  });
  if (!ok) return false;
  store().removeRoom(roomId);
  clearSelection();
  return true;
}

/** 部屋を複製して空いている場所に置く */
export function duplicateRoomAuto(roomId: ID): ID | null {
  const room = findRoom(roomId);
  if (!room) return null;
  const t = tr();
  const pos = findFreeSpot(rooms(), room.width, room.height);
  const id = store().duplicateRoom(roomId, t("list.copyName", { name: room.name }), pos);
  if (id) selectRoom(id);
  return id;
}

export function renumberRoom(roomId: ID, order: NumberingOrder) {
  const room = findRoom(roomId);
  if (!room || !room.seats.length) return;
  const labels = numberSeats(room, order);
  batch(() => {
    for (const [id, label] of labels) store().updateSeats(roomId, [id], { label });
  });
  toast.success(tr()("toast.renumbered", { count: labels.size }));
}

// ---------------------------------------------------------------------------
// 席・入口
// ---------------------------------------------------------------------------

/** 床セルに席を追加（自動採番・既定の向き）。追加した ID */
export function addSeatsAt(
  roomId: ID,
  cells: (Pt & { facing?: Facing; label?: string; tags?: string[] })[],
): ID[] {
  const room = findRoom(roomId);
  if (!room) return [];
  const facing = useEditor.getState().facing;
  const occupied = new Set(room.seats.map((s) => `${s.x},${s.y}`));
  const ok = cells.filter((c) => {
    const k = `${c.x},${c.y}`;
    if (occupied.has(k) || !canPlaceSeat(room, c.x, c.y)) return false;
    occupied.add(k);
    return true;
  });
  if (!ok.length) return [];
  const existing = new Set(rooms().flatMap((r) => r.seats.map((s) => s.label)));
  const fresh = nextSeatLabels(room, ok.length);
  let fi = 0;
  return store().addSeats(
    roomId,
    ok.map((c) => ({
      x: c.x,
      y: c.y,
      facing: c.facing ?? facing,
      // 貼り付けたラベルが重複するなら採番し直す
      label: c.label && !existing.has(c.label) ? c.label : fresh[fi++]!,
      tags: c.tags ? [...c.tags] : [],
    })),
  );
}

export function toggleEntrance(roomId: ID, edge: { x: number; y: number; side: Facing }) {
  const room = findRoom(roomId);
  if (!room) return;
  const ex = entranceAt(room, edge);
  if (ex) store().removeEntrances(roomId, [ex.id]);
  else store().addEntrance(roomId, edge);
}

/** 消しゴム: 席 → 入口 → 障害物 の順に消す */
export function eraseCells(roomId: ID, cells: Pt[]) {
  const room = findRoom(roomId);
  if (!room) return;
  const keys = new Set(cells.map((c) => `${c.x},${c.y}`));
  const seats = room.seats.filter((s) => keys.has(`${s.x},${s.y}`)).map((s) => s.id);
  const ents = room.entrances.filter((e) => keys.has(`${e.x},${e.y}`)).map((e) => e.id);
  const obstacles = cells.filter(
    (c) =>
      c.x >= 0 &&
      c.y >= 0 &&
      c.x < room.width &&
      c.y < room.height &&
      room.cells[c.y * room.width + c.x] === "obstacle",
  );
  batch(() => {
    if (seats.length) store().removeSeats(roomId, seats);
    if (ents.length) store().removeEntrances(roomId, ents);
    if (obstacles.length) store().paintCells(roomId, obstacles, "floor");
  });
}

/** 選択（またはホバー中）の席を回転。既定の向きも回す */
export function rotate(steps = 1) {
  const ed = useEditor.getState();
  if (ed.placement?.kind === "seats") {
    ed.setPlacement({ ...ed.placement, items: rotateItems(ed.placement.items, steps) });
    return;
  }
  ed.setFacing(rotateFacing(ed.facing, steps));
  const byRoom = selectedSeatsByRoom();
  if (!byRoom.size && ed.hover?.roomId && ed.hover.seatId) {
    const room = findRoom(ed.hover.roomId);
    const seat = room?.seats.find((s) => s.id === ed.hover!.seatId);
    if (seat) byRoom.set(room!.id, [seat]);
  }
  if (!byRoom.size) return;
  batch(() => {
    for (const [roomId, seats] of byRoom)
      for (const s of seats)
        store().updateSeats(roomId, [s.id], { facing: rotateFacing(s.facing, steps) });
  });
}

export function setSeatsFacing(facing: Facing) {
  batch(() => {
    for (const [roomId, seats] of selectedSeatsByRoom())
      store().updateSeats(
        roomId,
        seats.map((s) => s.id),
        { facing },
      );
  });
}

/** 選択中の席（無ければ部屋）を矢印キーで移動 */
export function nudge(dx: number, dy: number) {
  const sel = ui().selection;
  const byRoom = selectedSeatsByRoom();
  if (byRoom.size) {
    const blocked = [...byRoom].some(([roomId, seats]) => {
      const room = findRoom(roomId)!;
      return !canMoveSeats(room, new Set(seats.map((s) => s.id)), dx, dy);
    });
    if (blocked) return false;
    batch(() => {
      for (const [roomId, seats] of byRoom)
        store().moveSeats(
          roomId,
          seats.map((s) => ({ id: s.id, x: s.x + dx, y: s.y + dy })),
        );
    });
    return true;
  }
  if (sel.roomIds.length) {
    batch(() => {
      for (const id of sel.roomIds) {
        const r = findRoom(id);
        if (r) store().moveRoom(id, { x: r.position.x + dx, y: r.position.y + dy });
      }
    });
    return true;
  }
  return false;
}

/** Delete キー: 選択した席・入口を削除。部屋だけが選択されていれば部屋を削除（確認あり） */
export async function deleteSelection() {
  const sel = ui().selection;
  const byRoom = selectedSeatsByRoom();
  if (byRoom.size || sel.entranceIds.length) {
    const seatIds = [...byRoom.values()].flat().map((s) => s.id);
    const assigned = assignedSeatCount(getProject(), seatIds);
    if (assigned > 0) {
      const t = tr();
      const ok = await confirm({
        title: t("confirm.deleteSeats.title", { count: seatIds.length }),
        description: t("confirm.deleteSeats.assigned", { count: assigned }),
        destructive: true,
      });
      if (!ok) return;
    }
    batch(() => {
      for (const [roomId, seats] of byRoom)
        store().removeSeats(
          roomId,
          seats.map((s) => s.id),
        );
      if (sel.entranceIds.length)
        for (const r of rooms()) {
          const ids = r.entrances.filter((e) => sel.entranceIds.includes(e.id)).map((e) => e.id);
          if (ids.length) store().removeEntrances(r.id, ids);
        }
    });
    ui().setSelection({ seatIds: [], entranceIds: [] });
    return;
  }
  if (sel.roomIds.length === 1) await deleteRoom(sel.roomIds[0]!);
}

// ---------------------------------------------------------------------------
// コピー・貼り付け・複製・配置
// ---------------------------------------------------------------------------

export function copySelection(): boolean {
  const byRoom = selectedSeatsByRoom();
  const ed = useEditor.getState();
  const t = tr();
  if (byRoom.size) {
    const seats = [...byRoom.values()].flat();
    ed.setClipboard({ kind: "seats", items: itemsFromSeats(seats) });
    toast(t("toast.copiedSeats", { count: seats.length }));
    return true;
  }
  const room = findRoom(ui().selection.roomIds[0]);
  if (room) {
    ed.setClipboard({ kind: "room", room: structuredClone(room) });
    toast(t("toast.copiedRoom", { name: room.name }));
    return true;
  }
  return false;
}

export function paste() {
  const ed = useEditor.getState();
  const c = ed.clipboard;
  if (!c) return;
  if (c.kind === "seats") ed.setPlacement({ kind: "seats", items: c.items, source: "paste" });
  else ed.setPlacement({ kind: "room", room: c.room });
}

/** Ctrl+D: 席なら貼り付けプレビュー、部屋なら空き場所に複製 */
export function duplicateSelection() {
  const byRoom = selectedSeatsByRoom();
  const ed = useEditor.getState();
  if (byRoom.size) {
    ed.setPlacement({
      kind: "seats",
      items: itemsFromSeats([...byRoom.values()].flat()),
      source: "paste",
    });
    return;
  }
  const id = ui().selection.roomIds[0];
  if (id) duplicateRoomAuto(id);
}

export function startTemplate(items: PlacementItem[]) {
  const ed = useEditor.getState();
  ed.setPlacement({ kind: "seats", items, source: "template" });
}

/** 配置プレビューの各アイテムのワールド座標（カーソルのセルを中心に） */
export function placementCells(items: PlacementItem[], cellX: number, cellY: number) {
  const a = itemsAnchor(items);
  return items.map((it) => ({ ...it, wx: cellX - a.x + it.dx, wy: cellY - a.y + it.dy }));
}

/** 配置を確定。置けたら true */
export function commitPlacement(cellX: number, cellY: number, roomId: ID | undefined): boolean {
  const ed = useEditor.getState();
  const p = ed.placement;
  if (!p) return false;
  const t = tr();
  if (p.kind === "room") {
    const src = p.room;
    const name = rooms().some((r) => r.name === src.name)
      ? t("list.copyName", { name: src.name })
      : src.name;
    const id = store().addRoom({
      ...structuredClone(src),
      id: undefined,
      key: undefined,
      name,
      position: { x: cellX - Math.floor(src.width / 2), y: cellY - Math.floor(src.height / 2) },
      seats: src.seats.map((s) => ({ ...s, id: newId("seat_") })),
      entrances: src.entrances.map((e) => ({ ...e, id: newId("ent_") })),
    } as Partial<Room> & { name: string });
    selectRoom(id);
    return true;
  }
  const room = findRoom(roomId);
  if (!room) {
    toast.error(t("toast.placeOutside"));
    return false;
  }
  const cells = placementCells(p.items, cellX, cellY).map((c) => ({
    x: c.wx - room.position.x,
    y: c.wy - room.position.y,
    facing: c.facing,
    label: p.source === "paste" ? c.label : undefined,
    tags: c.tags,
  }));
  let ids: ID[] = [];
  batch(() => {
    ids = addSeatsAt(room.id, cells);
  });
  if (!ids.length) {
    toast.error(t("toast.nothingPlaced"));
    return false;
  }
  if (ids.length < cells.length)
    toast.warning(t("toast.partiallyPlaced", { placed: ids.length, total: cells.length }));
  selectSeats(room.id, ids);
  return true;
}
