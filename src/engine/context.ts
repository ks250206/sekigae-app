/**
 * 評価コンテキスト（#101）。プロジェクトを整数添字の配列 / 型付き配列に変換したもの。
 * structured clone 可能（Worker に渡せる）で、評価器・ソルバーはこれだけを見る。
 */
import { computeAdjacency } from "@/domain/geometry/adjacency";
import { computeRoomDepth } from "@/domain/geometry/depth";
import { GENDERS } from "@/domain/genders";
import { ROLE_GROUPS, ROLE_KEYS, ROLES } from "@/domain/roles";
import type { Rule } from "@/domain/rules";
import type { ID, Project, SeatPlan } from "@/domain/schema";

export interface EngineContext {
  // --- メンバー（添字 0..nMembers-1、project.members の順） ---
  nMembers: number;
  memberIds: ID[];
  /** 研究室の添字（labIds の添字）。未所属 / 不明は -1 */
  memberLab: Int32Array;
  /** ROLE_KEYS の添字 */
  memberRole: Int32Array;
  /** 役職 rank（シニア度） */
  memberRank: Int32Array;
  /** ROLE_GROUPS の添字 */
  memberGroup: Int32Array;
  /** GENDERS の添字 */
  memberGender: Int32Array;
  /** かな（無ければ名前）順の順位 0..n-1 */
  memberKanaRank: Int32Array;
  memberTags: string[][];
  labIds: ID[];

  // --- 席（添字 0..nSeats-1、部屋順 → 部屋内の席順） ---
  nSeats: number;
  seatIds: ID[];
  seatRoom: Int32Array;
  /** 入口からの距離（computeRoomDepth の dist） */
  seatDist: Float64Array;
  /** 部屋内で 0（入口側）..1（最奥） */
  seatNorm: Float64Array;
  /** 部屋順 → ラベル順（数値考慮）での順位 */
  seatLabelRank: Int32Array;
  seatTags: string[][];
  /** 隣接リスト（CSR）: seat s の隣は adjList[adjStart[s]..adjStart[s+1]) */
  adjStart: Int32Array;
  adjList: Int32Array;

  // --- 部屋 ---
  nRooms: number;
  roomIds: ID[];
  roomKeys: ID[];
  /** 部屋 r の席は roomSeats[roomStart[r]..roomStart[r+1]) */
  roomStart: Int32Array;
  roomSeats: Int32Array;

  // --- 昨年度 ---
  hasPrevious: boolean;
  /** 昨年度の席（現レイアウトに存在する場合）。不明は -1 */
  prevSeat: Int32Array;
  /** 昨年度の部屋（席の部屋、または roomOnly の Room.key に対応する部屋）。不明は -1 */
  prevRoom: Int32Array;

  // --- 対象の案 ---
  planId: ID | null;
  /** 案の現在の割当（席 → メンバー添字、空席は -1） */
  planMemberAt: Int32Array;
  /** ロック席 */
  lockedSeats: Uint8Array;
  /** 存在しない席を指すロック */
  danglingLocks: ID[];

  /** 有効なルール（project.rules のうち enabled） */
  rules: Rule[];

  // --- 逆引き ---
  memberIndex: Map<ID, number>;
  seatIndex: Map<ID, number>;
  roomIndex: Map<ID, number>;
  labIndex: Map<ID, number>;
}

export interface BuildContextOptions {
  /** 隣接判定の上書き（既定は project.settings.adjacency） */
  adjacency?: 4 | 8;
}

const collator = (() => {
  try {
    return new Intl.Collator("ja", { numeric: true, sensitivity: "base" });
  } catch {
    return null;
  }
})();
const compareText = (a: string, b: string) =>
  collator ? collator.compare(a, b) : a < b ? -1 : a > b ? 1 : 0;

function planOf(project: Project, planId: ID | null | undefined): SeatPlan | undefined {
  if (!planId) return undefined;
  return project.plans.find((p) => p.id === planId);
}

/**
 * プロジェクトからエンジン用コンテキストを作る。
 * @param planId 対象の案（割当・ロック）。null なら空の案として扱う
 */
export function buildContext(
  project: Project,
  planId: ID | null = project.activePlanId,
  opts: BuildContextOptions = {},
): EngineContext {
  const rooms = project.layout.rooms;
  const members = project.members;

  // 研究室
  const labIds = project.labs.map((l) => l.id);
  const labIndex = new Map(labIds.map((id, i) => [id, i]));

  // メンバー
  const nMembers = members.length;
  const memberIds = members.map((m) => m.id);
  const memberIndex = new Map(memberIds.map((id, i) => [id, i]));
  const memberLab = new Int32Array(nMembers);
  const memberRole = new Int32Array(nMembers);
  const memberRank = new Int32Array(nMembers);
  const memberGroup = new Int32Array(nMembers);
  const memberGender = new Int32Array(nMembers);
  members.forEach((m, i) => {
    memberLab[i] = m.labId !== undefined ? (labIndex.get(m.labId) ?? -1) : -1;
    memberRole[i] = ROLE_KEYS.indexOf(m.role);
    memberRank[i] = ROLES[m.role]?.rank ?? 0;
    memberGroup[i] = ROLE_GROUPS.indexOf(ROLES[m.role]?.group ?? "other");
    memberGender[i] = GENDERS.indexOf(m.gender);
  });
  const kanaOrder = members
    .map((m, i) => ({ i, key: m.kana?.trim() || m.name }))
    .sort((a, b) => compareText(a.key, b.key) || a.i - b.i);
  const memberKanaRank = new Int32Array(nMembers);
  kanaOrder.forEach((x, r) => (memberKanaRank[x.i] = r));

  // 部屋・席
  const nRooms = rooms.length;
  const roomIds = rooms.map((r) => r.id);
  const roomKeys = rooms.map((r) => r.key);
  const roomIndex = new Map(roomIds.map((id, i) => [id, i]));
  const nSeats = rooms.reduce((n, r) => n + r.seats.length, 0);
  const seatIds: ID[] = [];
  const seatRoom = new Int32Array(nSeats);
  const seatDist = new Float64Array(nSeats);
  const seatNorm = new Float64Array(nSeats);
  const seatTags: string[][] = [];
  const roomStart = new Int32Array(nRooms + 1);
  const roomSeats = new Int32Array(nSeats);
  const labelOrder: { s: number; r: number; label: string }[] = [];
  rooms.forEach((room, r) => {
    roomStart[r] = seatIds.length;
    const depth = computeRoomDepth(room);
    for (const seat of room.seats) {
      const s = seatIds.length;
      seatIds.push(seat.id);
      seatRoom[s] = r;
      roomSeats[s] = s;
      const d = depth.seats.get(seat.id);
      seatDist[s] = d?.dist ?? 0;
      seatNorm[s] = d?.norm ?? 0.5;
      seatTags.push(seat.tags);
      labelOrder.push({ s, r, label: seat.label });
    }
  });
  roomStart[nRooms] = nSeats;
  const seatIndex = new Map(seatIds.map((id, i) => [id, i]));
  labelOrder.sort((a, b) => a.r - b.r || compareText(a.label, b.label) || a.s - b.s);
  const seatLabelRank = new Int32Array(nSeats);
  labelOrder.forEach((x, i) => (seatLabelRank[x.s] = i));

  // 隣接（CSR）
  const adjMap = computeAdjacency(rooms, opts.adjacency ?? project.settings.adjacency);
  const adjStart = new Int32Array(nSeats + 1);
  const adjTmp: number[] = [];
  for (let s = 0; s < nSeats; s++) {
    adjStart[s] = adjTmp.length;
    const ns = [...(adjMap.get(seatIds[s]!) ?? [])]
      .map((id) => seatIndex.get(id))
      .filter((x): x is number => x !== undefined)
      .sort((a, b) => a - b);
    adjTmp.push(...ns);
  }
  adjStart[nSeats] = adjTmp.length;
  const adjList = Int32Array.from(adjTmp);

  // 昨年度
  const prevPlan = planOf(project, project.previousPlanId);
  const prevSeat = new Int32Array(nMembers).fill(-1);
  const prevRoom = new Int32Array(nMembers).fill(-1);
  if (prevPlan) {
    const roomByKey = new Map<ID, number>();
    roomKeys.forEach((k, i) => {
      if (!roomByKey.has(k)) roomByKey.set(k, i);
    });
    for (const [mid, key] of Object.entries(prevPlan.roomOnly)) {
      const m = memberIndex.get(mid);
      const r = roomByKey.get(key);
      if (m !== undefined && r !== undefined) prevRoom[m] = r;
    }
    for (const [sid, mid] of Object.entries(prevPlan.assignment)) {
      const m = memberIndex.get(mid);
      const s = seatIndex.get(sid);
      if (m === undefined || s === undefined || prevSeat[m] !== -1) continue;
      prevSeat[m] = s;
      prevRoom[m] = seatRoom[s]!;
    }
  }

  // 対象の案
  const plan = planOf(project, planId);
  const planMemberAt = new Int32Array(nSeats).fill(-1);
  const lockedSeats = new Uint8Array(nSeats);
  const danglingLocks: ID[] = [];
  if (plan) {
    const used = new Uint8Array(nMembers);
    for (const [sid, mid] of Object.entries(plan.assignment)) {
      const s = seatIndex.get(sid);
      const m = memberIndex.get(mid);
      if (s === undefined || m === undefined || used[m]) continue;
      used[m] = 1;
      planMemberAt[s] = m;
    }
    for (const sid of plan.locks) {
      const s = seatIndex.get(sid);
      if (s === undefined) danglingLocks.push(sid);
      else lockedSeats[s] = 1;
    }
  }

  return {
    nMembers,
    memberIds,
    memberLab,
    memberRole,
    memberRank,
    memberGroup,
    memberGender,
    memberKanaRank,
    memberTags: members.map((m) => m.tags),
    labIds,
    nSeats,
    seatIds,
    seatRoom,
    seatDist,
    seatNorm,
    seatLabelRank,
    seatTags,
    adjStart,
    adjList,
    nRooms,
    roomIds,
    roomKeys,
    roomStart,
    roomSeats,
    hasPrevious: prevPlan !== undefined,
    prevSeat,
    prevRoom,
    planId: plan ? plan.id : null,
    planMemberAt,
    lockedSeats,
    danglingLocks,
    rules: project.rules.filter((r) => r.enabled),
    memberIndex,
    seatIndex,
    roomIndex,
    labIndex,
  };
}

/** 2 席が隣接しているか */
export function isAdjacent(ctx: EngineContext, s: number, t: number): boolean {
  for (let i = ctx.adjStart[s]!; i < ctx.adjStart[s + 1]!; i++) if (ctx.adjList[i] === t) return true;
  return false;
}
