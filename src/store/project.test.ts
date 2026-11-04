import { beforeEach, describe, expect, it } from "vite-plus/test";
import { createEmptyProject } from "@/domain/factory";
import { activePlan, unassignedMembers } from "./selectors";
import { batch, history, useProjectStore } from "./project";

const s = () => useProjectStore.getState();

beforeEach(() => {
  s().replaceProject(createEmptyProject());
  history.clear();
});

describe("project store", () => {
  it("adds rooms, seats and assigns members with undo/redo", () => {
    const roomId = s().addRoom({ name: "A", width: 4, height: 3 });
    const [seatA, seatB] = s().addSeats(roomId, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    const [m1, m2] = s().addMembers([
      { name: "山田", role: "m1" },
      { name: "佐藤", role: "d1" },
    ]);
    const planId = s().project.activePlanId;
    s().assignSeat(planId, seatA!, m1!);
    s().assignSeat(planId, seatB!, m2!);
    s().swapSeats(planId, seatA!, seatB!);
    expect(activePlan(s().project).assignment).toEqual({ [seatA!]: m2, [seatB!]: m1 });
    history.undo();
    expect(activePlan(s().project).assignment).toEqual({ [seatA!]: m1, [seatB!]: m2 });
    history.redo();
    expect(activePlan(s().project).assignment[seatA!]).toBe(m2);
  });

  it("moves a member when assigned to another seat and cleans up on removal", () => {
    const roomId = s().addRoom({ name: "A", width: 4, height: 3 });
    const [a, b] = s().addSeats(roomId, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    const [m] = s().addMembers([{ name: "X" }]);
    const planId = s().project.activePlanId;
    s().assignSeat(planId, a!, m!);
    s().assignSeat(planId, b!, m!);
    expect(activePlan(s().project).assignment).toEqual({ [b!]: m });
    s().setLocks(planId, [b!], true);
    s().removeSeats(roomId, [b!]);
    expect(activePlan(s().project).assignment).toEqual({});
    expect(activePlan(s().project).locks).toEqual([]);
    expect(unassignedMembers(s().project, activePlan(s().project))).toHaveLength(1);
  });

  it("removing a member cleans assignments; painting void removes seats", () => {
    const roomId = s().addRoom({ name: "A", width: 2, height: 2 });
    const [a] = s().addSeats(roomId, [{ x: 0, y: 0 }]);
    const [m] = s().addMembers([{ name: "X" }]);
    const planId = s().project.activePlanId;
    s().assignSeat(planId, a!, m!);
    s().removeMembers([m!]);
    expect(activePlan(s().project).assignment).toEqual({});
    s().paintCells(roomId, [{ x: 0, y: 0 }], "void");
    expect(s().project.layout.rooms[0]!.seats).toHaveLength(0);
  });

  it("batches multiple updates into one undo step", () => {
    const roomId = s().addRoom({ name: "A", width: 6, height: 6 });
    const before = useProjectStore.temporal.getState().pastStates.length;
    batch(() => {
      for (let i = 0; i < 5; i++) s().paintCells(roomId, [{ x: i, y: 0 }], "obstacle");
    });
    expect(useProjectStore.temporal.getState().pastStates.length).toBe(before + 1);
    history.undo();
    expect(s().project.layout.rooms[0]!.cells.filter((c) => c === "obstacle")).toHaveLength(0);
  });

  it("keeps at least one current plan", () => {
    const only = s().project.activePlanId;
    s().removePlan(only);
    expect(s().project.plans).toHaveLength(1);
    const dup = s().duplicatePlan(only, "案B")!;
    expect(s().project.activePlanId).toBe(dup);
    s().removePlan(dup);
    expect(s().project.activePlanId).toBe(only);
  });
});
