import { beforeEach, describe, expect, it } from "vite-plus/test";
import { history, useProjectStore } from "@/store/project";
import { activePlan, previousPlan } from "@/store/selectors";
import { makeProject } from "@/test/factories";
import { classifyChanges, retentionByRoom } from "./diff";
import {
  placeInPlan,
  prevPlacementOf,
  prevRoomKeyOf,
  prevSeatActions,
  prevSeatOf,
  setRoomOnlyInPlan,
} from "./prevPlan";

const s = () => useProjectStore.getState();

beforeEach(() => {
  s().replaceProject(makeProject("medium"));
  history.clear();
});

describe("placeInPlan (pure)", () => {
  it("keeps 1 seat ↔ 1 member and removes roomOnly", () => {
    const plan = { assignment: { s1: "a" } as Record<string, string>, roomOnly: { b: "r1" } };
    placeInPlan(plan, "b", "s2");
    expect(plan).toEqual({ assignment: { s1: "a", s2: "b" }, roomOnly: {} });
    placeInPlan(plan, "b", "s3");
    expect(plan.assignment).toEqual({ s1: "a", s3: "b" });
  });
  it("pushes the occupant out without swap", () => {
    const plan = { assignment: { s1: "a", s2: "b" } as Record<string, string>, roomOnly: {} };
    expect(placeInPlan(plan, "b", "s1")).toEqual({ displaced: "a" });
    expect(plan.assignment).toEqual({ s1: "b" });
  });
  it("swaps with the occupant", () => {
    const plan = { assignment: { s1: "a", s2: "b" } as Record<string, string>, roomOnly: {} };
    expect(placeInPlan(plan, "b", "s1", { swap: true })).toEqual({
      displaced: "a",
      swappedTo: "s2",
    });
    expect(plan.assignment).toEqual({ s1: "b", s2: "a" });
  });
  it("swap from room-only leaves the occupant room-only", () => {
    const plan = {
      assignment: { s1: "a" } as Record<string, string>,
      roomOnly: { b: "r2" } as Record<string, string>,
    };
    placeInPlan(plan, "b", "s1", { swap: true });
    expect(plan).toEqual({ assignment: { s1: "b" }, roomOnly: { a: "r2" } });
  });
  it("room-only is exclusive with a seat", () => {
    const plan = {
      assignment: { s1: "a" } as Record<string, string>,
      roomOnly: {} as Record<string, string>,
    };
    setRoomOnlyInPlan(plan, "a", "r1");
    expect(plan).toEqual({ assignment: {}, roomOnly: { a: "r1" } });
    setRoomOnlyInPlan(plan, "a", null);
    expect(plan.roomOnly).toEqual({});
  });
});

describe("prevSeatActions (store)", () => {
  it("creates the previous plan lazily within one undo step", () => {
    expect(previousPlan(s().project)).toBeUndefined();
    prevSeatActions.setSeat("m1", "r1-s1", { planName: "2025" });
    const prev = previousPlan(s().project)!;
    expect(prev.kind).toBe("previous");
    expect(prev.name).toBe("2025");
    expect(prevSeatOf(s().project, "m1")?.seat.id).toBe("r1-s1");
    expect(prevRoomKeyOf(s().project, "m1")).toBe("r1");
    history.undo();
    expect(previousPlan(s().project)).toBeUndefined();
  });
  it("sets room-only and resolves placement", () => {
    prevSeatActions.setRoomOnly("m2", "r2");
    expect(prevPlacementOf(s().project, "m2")).toMatchObject({ kind: "room", room: { key: "r2" } });
    expect(prevSeatOf(s().project, "m2")).toBeUndefined();
    expect(prevRoomKeyOf(s().project, "m2")).toBe("r2");
    prevSeatActions.setSeat("m2", "r3-s1");
    expect(prevPlacementOf(s().project, "m2")).toMatchObject({
      kind: "seat",
      seat: { id: "r3-s1" },
    });
    expect(previousPlan(s().project)!.roomOnly).toEqual({});
  });
  it("swaps two members and clears", () => {
    prevSeatActions.setSeat("m1", "r1-s1");
    prevSeatActions.setRoomOnly("m2", "r2");
    prevSeatActions.swap("m1", "m2");
    expect(prevPlacementOf(s().project, "m2")).toMatchObject({
      kind: "seat",
      seat: { id: "r1-s1" },
    });
    expect(prevPlacementOf(s().project, "m1")).toMatchObject({ kind: "room", room: { key: "r2" } });
    prevSeatActions.clear(["m1", "m2"]);
    expect(prevPlacementOf(s().project, "m1").kind).toBe("none");
    expect(prevPlacementOf(s().project, "m2").kind).toBe("none");
  });
  it("ensure returns the same plan", () => {
    const a = prevSeatActions.ensure();
    expect(prevSeatActions.ensure()).toBe(a);
  });
});

describe("classifyChanges / retentionByRoom", () => {
  it("classifies every kind", () => {
    const cur = activePlan(s().project).id;
    // m1: same seat / m2: same room / m3: different room / m4: new / m5: unassigned
    prevSeatActions.setSeat("m1", "r1-s1");
    prevSeatActions.setSeat("m2", "r1-s2");
    prevSeatActions.setRoomOnly("m3", "r2");
    prevSeatActions.setSeat("m5", "r1-s5");
    s().assignSeat(cur, "r1-s1", "m1");
    s().assignSeat(cur, "r1-s3", "m2");
    s().assignSeat(cur, "r3-s1", "m3");
    s().assignSeat(cur, "r3-s2", "m4");
    const c = classifyChanges(s().project);
    expect(c.get("m1")).toBe("sameSeat");
    expect(c.get("m2")).toBe("sameRoom");
    expect(c.get("m3")).toBe("differentRoom");
    expect(c.get("m4")).toBe("new");
    expect(c.get("m5")).toBe("unassigned");
    expect(c.size).toBe(s().project.members.length);

    const ret = retentionByRoom(s().project);
    const r1 = ret.find((r) => r.room.key === "r1")!;
    expect(r1).toMatchObject({ previous: 3, stayed: 2, sameSeat: 1 });
    expect(r1.ratio).toBeCloseTo(2 / 3);
    const r2 = ret.find((r) => r.room.key === "r2")!;
    expect(r2).toMatchObject({ previous: 1, stayed: 0, ratio: 0 });
    expect(ret.find((r) => r.room.key === "r3")!.ratio).toBeNull();
  });
  it("roomOnly in the same room counts as sameRoom", () => {
    prevSeatActions.setRoomOnly("m1", "r1");
    s().assignSeat(activePlan(s().project).id, "r1-s4", "m1");
    expect(classifyChanges(s().project).get("m1")).toBe("sameRoom");
  });
  it("without previous plan every seated member is new", () => {
    s().assignSeat(activePlan(s().project).id, "r1-s4", "m1");
    expect(classifyChanges(s().project).get("m1")).toBe("new");
  });
});
