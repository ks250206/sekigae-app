/**
 * 派生データ。React 非依存の純関数 + メモ化（オブジェクト同一性で WeakMap キャッシュ）と、
 * それを使う React フック。
 */
import { useMemo } from "react";
import { useStore } from "zustand";
import { computeAdjacency } from "@/domain/geometry/adjacency";
import { computeRoomDepth, type RoomDepth } from "@/domain/geometry/depth";
import { compareRole } from "@/domain/roles";
import type { ID, Lab, Member, Project, Room, Seat, SeatPlan } from "@/domain/schema";
import { useProjectStore } from "./project";

// ---------------------------------------------------------------------------
// 純関数（メモ化付き）
// ---------------------------------------------------------------------------

const depthCache = new WeakMap<Room, RoomDepth>();
export function roomDepth(room: Room): RoomDepth {
  let d = depthCache.get(room);
  if (!d) {
    d = computeRoomDepth(room);
    depthCache.set(room, d);
  }
  return d;
}

const adjCache = new WeakMap<Room[], { mode: 4 | 8; adj: Map<ID, Set<ID>> }>();
export function adjacencyOf(rooms: Room[], mode: 4 | 8): Map<ID, Set<ID>> {
  const c = adjCache.get(rooms);
  if (c && c.mode === mode) return c.adj;
  const adj = computeAdjacency(rooms, mode);
  adjCache.set(rooms, { mode, adj });
  return adj;
}

export interface SeatRef {
  room: Room;
  seat: Seat;
}
const seatIndexCache = new WeakMap<Room[], Map<ID, SeatRef>>();
export function seatIndex(rooms: Room[]): Map<ID, SeatRef> {
  let m = seatIndexCache.get(rooms);
  if (!m) {
    m = new Map();
    for (const room of rooms) for (const seat of room.seats) m.set(seat.id, { room, seat });
    seatIndexCache.set(rooms, m);
  }
  return m;
}

const memberIndexCache = new WeakMap<Member[], Map<ID, Member>>();
export function memberIndex(members: Member[]): Map<ID, Member> {
  let m = memberIndexCache.get(members);
  if (!m) {
    m = new Map(members.map((x) => [x.id, x]));
    memberIndexCache.set(members, m);
  }
  return m;
}

const labIndexCache = new WeakMap<Lab[], Map<ID, Lab>>();
export function labIndex(labs: Lab[]): Map<ID, Lab> {
  let m = labIndexCache.get(labs);
  if (!m) {
    m = new Map(labs.map((x) => [x.id, x]));
    labIndexCache.set(labs, m);
  }
  return m;
}

const seatOfMemberCache = new WeakMap<Record<ID, ID>, Map<ID, ID>>();
/** メンバー ID → 席 ID */
export function seatOfMember(assignment: Record<ID, ID>): Map<ID, ID> {
  let m = seatOfMemberCache.get(assignment);
  if (!m) {
    m = new Map(Object.entries(assignment).map(([sid, mid]) => [mid, sid]));
    seatOfMemberCache.set(assignment, m);
  }
  return m;
}

export function activePlan(p: Project): SeatPlan {
  return p.plans.find((x) => x.id === p.activePlanId) ?? p.plans[0]!;
}
export function previousPlan(p: Project): SeatPlan | undefined {
  return p.previousPlanId ? p.plans.find((x) => x.id === p.previousPlanId) : undefined;
}

export function totalSeats(rooms: Room[]): number {
  return rooms.reduce((n, r) => n + r.seats.length, 0);
}

/** 割当のない（または無効な席に割り当たった）メンバー。役職順 */
export function unassignedMembers(p: Project, plan: SeatPlan): Member[] {
  const idx = seatIndex(p.layout.rooms);
  const assigned = new Set<ID>();
  for (const [sid, mid] of Object.entries(plan.assignment)) if (idx.has(sid)) assigned.add(mid);
  return p.members.filter((m) => !assigned.has(m.id)).sort((a, b) => compareRole(a.role, b.role));
}

/** 部屋 ID → その部屋に座っているメンバー */
export function membersByRoom(p: Project, plan: SeatPlan): Map<ID, Member[]> {
  const idx = seatIndex(p.layout.rooms);
  const mi = memberIndex(p.members);
  const out = new Map<ID, Member[]>(p.layout.rooms.map((r) => [r.id, []]));
  for (const [sid, mid] of Object.entries(plan.assignment)) {
    const ref = idx.get(sid);
    const m = mi.get(mid);
    if (ref && m) out.get(ref.room.id)!.push(m);
  }
  return out;
}

// ---------------------------------------------------------------------------
// React フック
// ---------------------------------------------------------------------------

export const useProject = () => useProjectStore((s) => s.project);
export const useRooms = () => useProjectStore((s) => s.project.layout.rooms);
export const useMembers = () => useProjectStore((s) => s.project.members);
export const useLabs = () => useProjectStore((s) => s.project.labs);
export const useRules = () => useProjectStore((s) => s.project.rules);
export const useActivePlan = () => useProjectStore((s) => activePlan(s.project));
export const usePreviousPlan = () => useProjectStore((s) => previousPlan(s.project));

export function useSeatIndex() {
  const rooms = useRooms();
  return seatIndex(rooms);
}
export function useMemberIndex() {
  return memberIndex(useMembers());
}
export function useLabIndex() {
  return labIndex(useLabs());
}
export function useAdjacency() {
  const rooms = useRooms();
  const mode = useProjectStore((s) => s.project.settings.adjacency);
  return adjacencyOf(rooms, mode);
}
export function useUnassignedMembers(planId?: ID) {
  const project = useProject();
  return useMemo(() => {
    const plan = planId ? project.plans.find((p) => p.id === planId) : activePlan(project);
    return plan ? unassignedMembers(project, plan) : [];
  }, [project, planId]);
}

/** Undo / Redo の可否 */
export function useHistoryState() {
  const canUndo = useStore(useProjectStore.temporal, (s) => s.pastStates.length > 0);
  const canRedo = useStore(useProjectStore.temporal, (s) => s.futureStates.length > 0);
  return { canUndo, canRedo };
}
