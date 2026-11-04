import { createSeatPlan } from "@/domain/factory";
import type { ID, SeatPlan } from "@/domain/schema";
import { newId } from "@/lib/id";
import { clone, type Get, type Update } from "./types";

export interface PlansSlice {
  createPlan: (name: string, kind?: SeatPlan["kind"]) => ID;
  duplicatePlan: (planId: ID, name: string) => ID | null;
  removePlan: (planId: ID) => void;
  renamePlan: (planId: ID, name: string) => void;
  setActivePlan: (planId: ID) => void;
  setFinalPlan: (planId: ID) => void;
  /** 昨年度として扱う案（kind: previous）を設定 */
  setPreviousPlan: (planId: ID | undefined) => void;
  /** 席に人を置く（memberId=null で空ける）。その人が他の席にいれば外す */
  assignSeat: (planId: ID, seatId: ID, memberId: ID | null) => void;
  /** 2 席の中身を入れ替える */
  swapSeats: (planId: ID, a: ID, b: ID) => void;
  unassignMembers: (planId: ID, memberIds: ID[]) => void;
  /** 割当を丸ごと置き換える（ソルバー結果の適用など） */
  setAssignment: (planId: ID, assignment: Record<ID, ID>, seed?: number) => void;
  clearAssignment: (planId: ID, keepLocked?: boolean) => void;
  setLocks: (planId: ID, seatIds: ID[], locked: boolean) => void;
  /** 昨年度: 部屋のみ指定（roomKey=null で解除） */
  setRoomOnly: (planId: ID, memberId: ID, roomKey: ID | null) => void;
}

export function createPlansSlice(update: Update, _get: Get): PlansSlice {
  const withPlan = (planId: ID, fn: (p: SeatPlan) => void) =>
    update((d) => {
      const p = d.plans.find((x) => x.id === planId);
      if (p) fn(p);
    });
  return {
    createPlan: (name, kind = "current") => {
      const plan = createSeatPlan(name, kind);
      update((d) => {
        d.plans.push(plan);
        if (kind === "current") d.activePlanId = plan.id;
        else d.previousPlanId = plan.id;
      });
      return plan.id;
    },
    duplicatePlan: (planId, name) => {
      let id: ID | null = null;
      update((d) => {
        const src = d.plans.find((p) => p.id === planId);
        if (!src) return;
        const copy: SeatPlan = {
          ...clone(src),
          id: newId("plan_"),
          name,
          kind: "current",
          final: false,
          createdAt: new Date().toISOString(),
        };
        id = copy.id;
        d.plans.push(copy);
        d.activePlanId = copy.id;
      });
      return id;
    },
    removePlan: (planId) =>
      update((d) => {
        const current = d.plans.filter((p) => p.kind === "current");
        const target = d.plans.find((p) => p.id === planId);
        if (!target) return;
        if (target.kind === "current" && current.length <= 1) return; // 最低 1 案は残す
        d.plans = d.plans.filter((p) => p.id !== planId);
        if (d.activePlanId === planId)
          d.activePlanId = d.plans.find((p) => p.kind === "current")!.id;
        if (d.previousPlanId === planId) d.previousPlanId = undefined;
      }),
    renamePlan: (planId, name) => withPlan(planId, (p) => void (p.name = name)),
    setActivePlan: (planId) => update((d) => void (d.activePlanId = planId)),
    setFinalPlan: (planId) =>
      update((d) => {
        for (const p of d.plans) if (p.kind === "current") p.final = p.id === planId;
      }),
    setPreviousPlan: (planId) =>
      update((d) => {
        d.previousPlanId = planId;
        if (planId) {
          const p = d.plans.find((x) => x.id === planId);
          if (p) p.kind = "previous";
        }
      }),
    assignSeat: (planId, seatId, memberId) =>
      withPlan(planId, (p) => {
        if (memberId) {
          for (const [sid, mid] of Object.entries(p.assignment))
            if (mid === memberId) delete p.assignment[sid];
          p.assignment[seatId] = memberId;
          delete p.roomOnly[memberId];
        } else delete p.assignment[seatId];
      }),
    swapSeats: (planId, a, b) =>
      withPlan(planId, (p) => {
        const ma = p.assignment[a];
        const mb = p.assignment[b];
        if (mb) p.assignment[a] = mb;
        else delete p.assignment[a];
        if (ma) p.assignment[b] = ma;
        else delete p.assignment[b];
      }),
    unassignMembers: (planId, memberIds) =>
      withPlan(planId, (p) => {
        const set = new Set(memberIds);
        for (const [sid, mid] of Object.entries(p.assignment))
          if (set.has(mid)) delete p.assignment[sid];
      }),
    setAssignment: (planId, assignment, seed) =>
      withPlan(planId, (p) => {
        p.assignment = { ...assignment };
        if (seed !== undefined) p.seed = seed;
      }),
    clearAssignment: (planId, keepLocked = true) =>
      withPlan(planId, (p) => {
        if (!keepLocked) {
          p.assignment = {};
          return;
        }
        const locked = new Set(p.locks);
        for (const sid of Object.keys(p.assignment)) if (!locked.has(sid)) delete p.assignment[sid];
      }),
    setLocks: (planId, seatIds, locked) =>
      withPlan(planId, (p) => {
        const set = new Set(p.locks);
        for (const id of seatIds) {
          if (locked) set.add(id);
          else set.delete(id);
        }
        p.locks = [...set];
      }),
    setRoomOnly: (planId, memberId, roomKey) =>
      withPlan(planId, (p) => {
        if (roomKey) {
          for (const [sid, mid] of Object.entries(p.assignment))
            if (mid === memberId) delete p.assignment[sid];
          p.roomOnly[memberId] = roomKey;
        } else delete p.roomOnly[memberId];
      }),
  };
}
