import { describe, expect, it } from "vite-plus/test";
import { createRoom } from "@/domain/factory";
import type { Seat } from "@/domain/schema";
import {
  bresenham,
  canMoveSeats,
  duplicateLabels,
  findFreeSpot,
  nearestPerimeterEdge,
  nextSeatLabels,
  numberSeats,
  overlappingRoomIds,
  rectCells,
  resizeLoss,
  resizeRect,
  roomAt,
  roomPrefix,
  rotateFacing,
} from "./editing";
import { itemsSize, rotateItems, SEAT_TEMPLATES } from "./templates";

const seat = (id: string, x: number, y: number, label = id): Seat => ({
  id,
  x,
  y,
  facing: "n",
  label,
  tags: [],
});

describe("bresenham / rectCells", () => {
  it("connects cells without gaps", () => {
    expect(bresenham(0, 0, 3, 0)).toHaveLength(4);
    const diag = bresenham(0, 0, 3, 2);
    expect(diag[0]).toEqual({ x: 0, y: 0 });
    expect(diag.at(-1)).toEqual({ x: 3, y: 2 });
    for (let i = 1; i < diag.length; i++) {
      expect(Math.abs(diag[i]!.x - diag[i - 1]!.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(diag[i]!.y - diag[i - 1]!.y)).toBeLessThanOrEqual(1);
    }
  });
  it("enumerates a rectangle in any drag direction", () => {
    expect(rectCells({ x: 2, y: 2 }, { x: 0, y: 1 })).toHaveLength(6);
  });
});

describe("labels", () => {
  it("derives a prefix from the room name", () => {
    expect(roomPrefix("居室A")).toBe("A");
    expect(roomPrefix("Room 2")).toBe("2");
    expect(roomPrefix("セミナー室")).toBe("セ");
    expect(roomPrefix("lab")).toBe("LAB");
  });
  it("continues numbering after existing labels", () => {
    const room = createRoom({ name: "居室A", seats: [seat("a", 0, 0, "A-03")] });
    expect(nextSeatLabels(room, 2)).toEqual(["A-04", "A-05"]);
  });
  it("renumbers row-major, column-major and by entrance distance", () => {
    const room = createRoom({
      name: "B",
      width: 4,
      height: 4,
      seats: [seat("a", 3, 0), seat("b", 0, 1), seat("c", 0, 3)],
      entrances: [{ id: "e", x: 0, y: 3, side: "s" }],
    });
    expect(numberSeats(room, "row").get("a")).toBe("B-01");
    expect(numberSeats(room, "column").get("b")).toBe("B-01");
    expect(numberSeats(room, "entrance").get("c")).toBe("B-01");
  });
  it("finds duplicate labels across rooms", () => {
    const r1 = createRoom({ name: "A", seats: [seat("a", 0, 0, "X")] });
    const r2 = createRoom({ name: "B", seats: [seat("b", 0, 0, "X"), seat("c", 1, 0, "Y")] });
    expect([...duplicateLabels([r1, r2])]).toEqual(["X"]);
  });
});

describe("placement and collisions", () => {
  it("finds rooms under a point and detects overlaps", () => {
    const a = createRoom({ name: "A", position: { x: 0, y: 0 }, width: 4, height: 4 });
    const b = createRoom({ name: "B", position: { x: 3, y: 2 }, width: 4, height: 4 });
    expect(roomAt([a, b], 3.5, 2.5)?.id).toBe(b.id);
    expect(roomAt([a, b], 0.5, 0.5)?.id).toBe(a.id);
    expect(roomAt([a, b], 10, 10)).toBeUndefined();
    expect(overlappingRoomIds([a, b]).size).toBe(2);
  });
  it("places a new room in free space", () => {
    const a = createRoom({ name: "A", width: 8, height: 6 });
    const p = findFreeSpot([a], 8, 6);
    expect(overlappingRoomIds([a, createRoom({ name: "B", position: p })]).size).toBe(0);
  });
  it("checks seat moves against walls and other seats", () => {
    const room = createRoom({
      name: "A",
      width: 3,
      height: 1,
      seats: [seat("a", 0, 0), seat("b", 2, 0)],
    });
    expect(canMoveSeats(room, new Set(["a"]), 1, 0)).toBe(true);
    expect(canMoveSeats(room, new Set(["a"]), 2, 0)).toBe(false);
    expect(canMoveSeats(room, new Set(["a", "b"]), 1, 0)).toBe(false);
    expect(canMoveSeats(room, new Set(["a"]), -1, 0)).toBe(false);
  });
});

describe("entrances and resize", () => {
  it("snaps to the nearest perimeter edge only", () => {
    const room = createRoom({ name: "A", width: 3, height: 3 });
    expect(nearestPerimeterEdge(room, 1.5, 0.1)).toEqual({ x: 1, y: 0, side: "n" });
    expect(nearestPerimeterEdge(room, 3.2, 1.5)).toEqual({ x: 2, y: 1, side: "e" });
    expect(nearestPerimeterEdge(room, 1.5, 1.5)).toBeNull();
    room.cells[1 * 3 + 1] = "void";
    // 中央が void になると、その周りの辺も外周
    expect(nearestPerimeterEdge(room, 1.5, 0.9)).toEqual({ x: 1, y: 0, side: "s" });
  });
  it("computes resize rectangles and losses", () => {
    const room = createRoom({
      name: "A",
      position: { x: 5, y: 5 },
      width: 4,
      height: 4,
      seats: [seat("a", 0, 0), seat("b", 3, 3)],
    });
    const r = resizeRect(room, "nw", 1, 1);
    expect(r).toEqual({ x: 6, y: 6, w: 3, h: 3 });
    expect(resizeLoss(room, r.w, r.h, { dx: -1, dy: -1 }).seats.map((s) => s.id)).toEqual(["a"]);
    expect(resizeRect(room, "e", -10, 0).w).toBe(1);
    expect(resizeRect(room, "se", 100, 100)).toMatchObject({ w: 40, h: 40 });
  });
});

describe("templates", () => {
  it("rotates facings and positions together", () => {
    expect(rotateFacing("n")).toBe("e");
    expect(rotateFacing("n", -1)).toBe("w");
    const row = SEAT_TEMPLATES.find((t) => t.id === "wallRow")!.items;
    const rotated = rotateItems(row, 1);
    expect(itemsSize(rotated)).toEqual({ w: 1, h: 6 });
    expect(rotated.every((i) => i.facing === "e")).toBe(true);
    expect(rotateItems(row, 4)).toEqual(row);
  });
  it("builds islands facing each other", () => {
    const island = SEAT_TEMPLATES.find((t) => t.id === "island2x3")!.items;
    expect(island).toHaveLength(6);
    expect(new Set(island.filter((i) => i.dy === 0).map((i) => i.facing))).toEqual(new Set(["s"]));
    expect(new Set(island.filter((i) => i.dy === 1).map((i) => i.facing))).toEqual(new Set(["n"]));
  });
});
