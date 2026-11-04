/**
 * 単項制約による事前絞り込み（#104）とロック・部分再配置の範囲（#109）。
 *
 * - 固定メンバー: ロック席の住人、scope=rooms で対象外の部屋の住人、scope=unassignedOnly で配置済みの人。
 *   固定メンバーの許容席はその席だけ（ルールより優先。違反は評価で報告される）。
 * - 再配置対象（free）の許容席 = 全席 − 固定席 − 空のまま凍結する席（空のロック席・対象外の部屋の空席）
 *   を、トップレベルの有効な hard 単項ルールで絞り込んだもの。論理ブロック内のルールは対象外。
 */
import type { Rule } from "@/domain/rules";
import {
  bitHas,
  bitSet,
  bitsetAndInPlace,
  bitsetCount,
  bitsetDiffInPlace,
  bitsetEmpty,
  bitsetNot,
  bitsetToArray,
  type Bitset,
} from "./bitset";
import type { ExprCompiler } from "./compile";
import type { EngineContext } from "./context";
import type { SolveScope } from "./types";

export interface Domains {
  /** メンバー → 許容席 */
  allowed: Bitset[];
  /** 許容席の配列版 */
  lists: Int32Array[];
  /** メンバー → 固定席（再配置対象は -1） */
  fixed: Int32Array;
  /** 再配置対象のメンバー */
  free: number[];
  /** メンバー → 許容席を減らした hard ルールの ID */
  restrictedBy: string[][];
  /** 固定・凍結されて再配置対象が使えない席の数 */
  blockedSeats: number;
}

/** 単項の hard ルールとして事前絞り込みに使うブロック種別 */
export const UNARY_TYPES = new Set([
  "seat.only",
  "seat.pin",
  "seat.empty",
  "person.pin",
  "person.avoid",
  "room.only",
  "room.exclude",
  "prev.same",
  "prev.different",
]);

export function buildDomains(
  ctx: EngineContext,
  compiler: ExprCompiler,
  scope: SolveScope = { kind: "all" },
  rules: Rule[] = ctx.rules,
): Domains {
  const n = ctx.nMembers;
  const nS = ctx.nSeats;
  const fixed = new Int32Array(n).fill(-1);
  const blocked = bitsetEmpty(nS);

  const inScopeRoom = new Uint8Array(ctx.nRooms).fill(1);
  if (scope.kind === "rooms") {
    inScopeRoom.fill(0);
    for (const id of scope.roomIds) {
      const r = ctx.roomIndex.get(id);
      if (r !== undefined) inScopeRoom[r] = 1;
    }
  }
  for (let s = 0; s < nS; s++) {
    const m = ctx.planMemberAt[s]!;
    const frozen =
      ctx.lockedSeats[s] === 1 ||
      (scope.kind === "rooms" && !inScopeRoom[ctx.seatRoom[s]!]) ||
      (scope.kind === "unassignedOnly" && m >= 0);
    if (!frozen) continue;
    bitSet(blocked, s);
    if (m >= 0) fixed[m] = s;
  }

  const base = bitsetNot(blocked, nS);
  const allowed: Bitset[] = [];
  const restrictedBy: string[][] = [];
  const free: number[] = [];
  for (let m = 0; m < n; m++) {
    restrictedBy.push([]);
    if (fixed[m]! >= 0) {
      const b = bitsetEmpty(nS);
      bitSet(b, fixed[m]!);
      allowed.push(b);
    } else {
      allowed.push(base.slice());
      free.push(m);
    }
  }

  const tmp = bitsetEmpty(nS);
  const note = (m: number, ruleId: string) => {
    const list = restrictedBy[m]!;
    if (!list.includes(ruleId)) list.push(ruleId);
  };
  /** m の許容席を mask に限定 */
  const keep = (m: number, mask: Bitset, ruleId: string) => {
    if (fixed[m]! >= 0) return;
    const a = allowed[m]!;
    tmp.set(a);
    bitsetAndInPlace(a, mask);
    if (bitsetCount(tmp) !== bitsetCount(a)) note(m, ruleId);
  };
  /** m の許容席から mask を除外 */
  const remove = (m: number, mask: Bitset, ruleId: string) => {
    if (fixed[m]! >= 0) return;
    const a = allowed[m]!;
    tmp.set(a);
    bitsetDiffInPlace(a, mask);
    if (bitsetCount(tmp) !== bitsetCount(a)) note(m, ruleId);
  };
  const one = (s: number) => {
    const b = bitsetEmpty(nS);
    bitSet(b, s);
    return b;
  };
  /** m を席 s に固定（他の人は s を使えない） */
  const pinTo = (m: number, s: number, ruleId: string) => {
    const mask = one(s);
    for (const x of free) if (x === m) keep(x, mask, ruleId);
    else remove(x, mask, ruleId);
  };

  for (const rule of rules) {
    if (!rule.enabled || rule.strength !== "hard" || !UNARY_TYPES.has(rule.block.type)) continue;
    compiler.ruleId = rule.id;
    const id = rule.id;
    const b = rule.block;
    switch (b.type) {
      case "seat.only": {
        const S = compiler.seats(b.seats);
        const P = compiler.people(b.people);
        for (const m of free) if (!bitHas(P, m)) remove(m, S, id);
        break;
      }
      case "seat.pin": {
        const s = compiler.seat(b.seatId);
        const m = compiler.member(b.memberId);
        if (s >= 0 && m >= 0) pinTo(m, s, id);
        break;
      }
      case "seat.empty": {
        const S = compiler.seats(b.seats);
        for (const m of free) remove(m, S, id);
        break;
      }
      case "person.pin": {
        const m = compiler.member(b.memberId);
        if (m < 0 || !b.target) break;
        if (b.target.kind === "seat") {
          const s = compiler.seat(b.target.seatId);
          if (s >= 0) pinTo(m, s, id);
        } else {
          const r = compiler.room(b.target.roomId);
          if (r >= 0) keep(m, compiler.seatsOfRooms([r]), id);
        }
        break;
      }
      case "person.avoid": {
        const m = compiler.member(b.memberId);
        if (m >= 0) remove(m, compiler.seats(b.seats), id);
        break;
      }
      case "room.only":
      case "room.exclude": {
        const RS = compiler.seatsOfRooms(compiler.rooms(b.rooms));
        const P = compiler.people(b.people);
        for (const m of free) if (bitHas(P, m) === (b.type === "room.exclude")) remove(m, RS, id);
        break;
      }
      case "prev.same":
      case "prev.different": {
        const P = compiler.people(b.people);
        const same = b.type === "prev.same";
        for (const m of bitsetToArray(P)) {
          const ps = ctx.prevSeat[m]!;
          const pr = ctx.prevRoom[m]!;
          if (pr < 0) continue;
          if (b.scope === "seat" && ps >= 0) {
            if (same) pinTo(m, ps, id);
            else remove(m, one(ps), id);
          } else if (same) keep(m, compiler.seatsOfRooms([pr]), id);
          else if (b.scope === "room") remove(m, compiler.seatsOfRooms([pr]), id);
        }
        break;
      }
      default:
        break;
    }
  }
  compiler.ruleId = undefined;

  return {
    allowed,
    lists: allowed.map((a) => Int32Array.from(bitsetToArray(a))),
    fixed,
    free,
    restrictedBy,
    blockedSeats: bitsetCount(blocked),
  };
}

/** 再配置対象が使える席の和集合 */
export function usableSeats(ctx: EngineContext, d: Domains): Bitset {
  const u = bitsetEmpty(ctx.nSeats);
  for (const m of d.free) for (const s of d.lists[m]!) bitSet(u, s);
  return u;
}
