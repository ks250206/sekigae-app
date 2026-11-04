import { render } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import { createRoom } from "@/domain/factory";
import { matchCombo, matchShortcut } from "@/features/rooms/shortcuts";
import { floorPath, roomsBounds, wallPath } from "./geometry";
import { RoomShape } from "./RoomShape";
import {
  BASE_SCALE,
  createViewport,
  fitBounds,
  lodFor,
  MAX_SCALE,
  screenToWorld,
  worldToScreen,
  zoomAt,
} from "./viewport";

describe("viewport math", () => {
  const v = { x: 0, y: 0, scale: BASE_SCALE, width: 800, height: 600 };
  it("round-trips screen and world coordinates", () => {
    const w = screenToWorld(v, 160, 64);
    expect(w).toEqual({ x: 5, y: 2 });
    expect(worldToScreen(v, w.x, w.y)).toEqual({ x: 160, y: 64 });
  });
  it("zooms around the anchor and clamps", () => {
    const z = zoomAt(v, 64, 400, 300);
    expect(screenToWorld(z, 400, 300)).toEqual(screenToWorld(v, 400, 300));
    expect(zoomAt(v, 10_000, 0, 0).scale).toBe(MAX_SCALE);
  });
  it("fits bounds into the viewport", () => {
    const f = fitBounds(v, { x: 10, y: 10, width: 20, height: 10 }, 0);
    expect(f.scale).toBe(40);
    expect(screenToWorld(f, 400, 300)).toEqual({ x: 20, y: 15 });
  });
  it("controller notifies subscribers", () => {
    const c = createViewport({ width: 800, height: 600 });
    let n = 0;
    const off = c.subscribe(() => n++);
    c.panBy(32, 0);
    expect(c.getState().x).toBe(-3);
    c.zoomBy(2);
    expect(c.getState().scale).toBe(64);
    off();
    c.panBy(1, 1);
    expect(n).toBe(2);
  });
  it("chooses a level of detail by zoom", () => {
    expect(lodFor(8)).toBe("far");
    expect(lodFor(20)).toBe("mid");
    expect(lodFor(48)).toBe("near");
  });
});

describe("room geometry", () => {
  it("traces walls around void cells (L-shape)", () => {
    const room = createRoom({ name: "L", width: 2, height: 2 });
    room.cells[1] = "void"; // 右上
    expect(floorPath(room)).toBe("M0 0h1v1h-1zM0 1h2v1h-2z");
    const d = wallPath(room);
    // 上辺は左のセルだけ、右上の void との境界も壁
    expect(d).toContain("M0 0H1");
    expect(d).toContain("M1 1H2");
    expect(d).toContain("M1 0V1");
  });
  it("includes the header in room bounds", () => {
    const b = roomsBounds([
      createRoom({ name: "A", position: { x: 2, y: 3 }, width: 4, height: 2 }),
    ]);
    expect(b).toMatchObject({ x: 2, width: 4 });
    expect(b!.y).toBeLessThan(3);
  });
  it("renders seats, doors and header", () => {
    const room = createRoom({
      name: "居室A",
      width: 3,
      height: 3,
      seats: [{ id: "s1", x: 1, y: 1, facing: "e", label: "A-01", tags: [] }],
      entrances: [{ id: "e1", x: 0, y: 2, side: "s" }],
    });
    const { container } = render(
      <svg>
        <RoomShape room={room} seatStates={new Map([["s1", { selected: true }]])} />
      </svg>,
    );
    expect(container.querySelector('[data-seat-id="s1"]')?.getAttribute("data-state")).toBe(
      "selected",
    );
    expect(container.querySelector('[data-entrance-id="e1"]')).not.toBeNull();
    expect(container.querySelector(`[data-room-header="${room.id}"]`)?.textContent).toContain(
      "居室A",
    );
  });
});

describe("shortcuts", () => {
  const key = (k: string, mods: Partial<KeyboardEventInit> = {}) =>
    new KeyboardEvent("keydown", { key: k, ...mods });
  it("matches tool keys and modifiers", () => {
    expect(matchShortcut(key("v"))).toBe("toolSelect");
    expect(matchShortcut(key("c", { ctrlKey: true }))).toBe("copy");
    expect(matchShortcut(key("c"))).toBeNull();
    expect(matchShortcut(key("H", { shiftKey: true }))).toBe("toggleHeatmap");
    expect(matchShortcut(key("h"))).toBe("toolPan");
    expect(matchShortcut(key("+", { shiftKey: true }))).toBe("zoomIn");
    expect(matchCombo(key("ArrowUp", { shiftKey: true }), "shift+arrowup")).toBe(true);
  });
});
