/**
 * 条件式（PersonExpr / SeatExpr）のビットセットへのコンパイル（#157）。
 * and = 積, or = 和, not = 補集合。同じ式は構造が等しければキャッシュを共有する。
 * 参照切れ ID は無視し、診断（danglingMember 等）として記録する。
 */
import type { ID, PersonExpr, SeatExpr } from "@/domain/rules";
import { GENDERS } from "@/domain/genders";
import { ROLE_GROUPS, ROLE_KEYS } from "@/domain/roles";
import {
  bitSet,
  bitsetAnd,
  bitsetEmpty,
  bitsetFull,
  bitsetNot,
  bitsetOr,
  type Bitset,
} from "./bitset";
import type { EngineContext } from "./context";
import type { Diagnostic, DiagnosticCode } from "./types";

export class ExprCompiler {
  private personCache = new Map<string, Bitset>();
  private seatCache = new Map<string, Bitset>();
  private reported = new Set<string>();
  readonly diagnostics: Diagnostic[] = [];
  /** 現在コンパイル中のルール（診断の帰属先） */
  ruleId: ID | undefined;

  readonly ctx: EngineContext;

  constructor(ctx: EngineContext) {
    this.ctx = ctx;
  }

  dangling(code: DiagnosticCode, id: ID) {
    const key = `${code}|${this.ruleId ?? ""}|${id}`;
    if (this.reported.has(key)) return;
    this.reported.add(key);
    this.diagnostics.push({
      code,
      severity: "warning",
      ruleId: this.ruleId,
      params: { ruleId: this.ruleId ?? "", id },
    });
  }

  /** 人集合 → メンバー添字のビットセット（返り値は共有されるので破壊しないこと） */
  people(expr: PersonExpr): Bitset {
    const key = JSON.stringify(expr);
    const hit = this.personCache.get(key);
    // 参照切れ診断はルールごとに出したいので、キャッシュヒット時も members/lab は再走査する
    if (hit) {
      this.checkPersonRefs(expr);
      return hit;
    }
    const b = this.compilePerson(expr);
    this.personCache.set(key, b);
    return b;
  }

  /** 席集合 → 席添字のビットセット（返り値は共有されるので破壊しないこと） */
  seats(expr: SeatExpr): Bitset {
    const key = JSON.stringify(expr);
    const hit = this.seatCache.get(key);
    if (hit) {
      this.checkSeatRefs(expr);
      return hit;
    }
    const b = this.compileSeat(expr);
    this.seatCache.set(key, b);
    return b;
  }

  /** 部屋 ID 群 → 部屋添字（空配列 = すべての部屋） */
  rooms(ids: ID[]): number[] {
    const { ctx } = this;
    if (ids.length === 0) return Array.from({ length: ctx.nRooms }, (_, i) => i);
    const out: number[] = [];
    for (const id of ids) {
      const r = ctx.roomIndex.get(id);
      if (r === undefined) this.dangling("danglingRoom", id);
      else if (!out.includes(r)) out.push(r);
    }
    return out;
  }

  /** 部屋添字群 → その部屋の席のビットセット */
  seatsOfRooms(rooms: number[]): Bitset {
    const { ctx } = this;
    const b = bitsetEmpty(ctx.nSeats);
    for (const r of rooms)
      for (let s = ctx.roomStart[r]!; s < ctx.roomStart[r + 1]!; s++) bitSet(b, s);
    return b;
  }

  member(id: ID | null): number {
    if (id === null) return -1;
    const m = this.ctx.memberIndex.get(id);
    if (m === undefined) {
      this.dangling("danglingMember", id);
      return -1;
    }
    return m;
  }

  seat(id: ID | null): number {
    if (id === null) return -1;
    const s = this.ctx.seatIndex.get(id);
    if (s === undefined) {
      this.dangling("danglingSeat", id);
      return -1;
    }
    return s;
  }

  room(id: ID): number {
    const r = this.ctx.roomIndex.get(id);
    if (r === undefined) {
      this.dangling("danglingRoom", id);
      return -1;
    }
    return r;
  }

  private checkPersonRefs(e: PersonExpr) {
    switch (e.op) {
      case "members":
        for (const id of e.ids)
          if (!this.ctx.memberIndex.has(id)) this.dangling("danglingMember", id);
        return;
      case "lab":
        for (const id of e.in) if (!this.ctx.labIndex.has(id)) this.dangling("danglingLab", id);
        return;
      case "and":
      case "or":
        for (const a of e.args) this.checkPersonRefs(a);
        return;
      case "not":
        this.checkPersonRefs(e.arg);
        return;
      default:
        return;
    }
  }

  private checkSeatRefs(e: SeatExpr) {
    switch (e.op) {
      case "rooms":
      case "depth":
        for (const id of e.roomIds)
          if (!this.ctx.roomIndex.has(id)) this.dangling("danglingRoom", id);
        return;
      case "seats":
        for (const id of e.seatIds)
          if (!this.ctx.seatIndex.has(id)) this.dangling("danglingSeat", id);
        return;
      case "and":
      case "or":
        for (const a of e.args) this.checkSeatRefs(a);
        return;
      case "not":
        this.checkSeatRefs(e.arg);
        return;
      default:
        return;
    }
  }

  private compilePerson(e: PersonExpr): Bitset {
    const { ctx } = this;
    const n = ctx.nMembers;
    const where = (pred: (m: number) => boolean) => {
      const b = bitsetEmpty(n);
      for (let m = 0; m < n; m++) if (pred(m)) bitSet(b, m);
      return b;
    };
    switch (e.op) {
      case "all":
        return bitsetFull(n);
      case "members": {
        const b = bitsetEmpty(n);
        for (const id of e.ids) {
          const m = ctx.memberIndex.get(id);
          if (m === undefined) this.dangling("danglingMember", id);
          else bitSet(b, m);
        }
        return b;
      }
      case "role": {
        const set = new Set(e.in.map((r) => ROLE_KEYS.indexOf(r)));
        return where((m) => set.has(ctx.memberRole[m]!));
      }
      case "roleGroup": {
        const set = new Set(e.in.map((g) => ROLE_GROUPS.indexOf(g)));
        return where((m) => set.has(ctx.memberGroup[m]!));
      }
      case "lab": {
        const set = new Set<number>();
        for (const id of e.in) {
          const l = ctx.labIndex.get(id);
          if (l === undefined) this.dangling("danglingLab", id);
          else set.add(l);
        }
        return where((m) => set.has(ctx.memberLab[m]!));
      }
      case "gender": {
        const set = new Set(e.in.map((g) => GENDERS.indexOf(g)));
        return where((m) => set.has(ctx.memberGender[m]!));
      }
      case "tag": {
        const set = new Set(e.in);
        return where((m) => ctx.memberTags[m]!.some((t) => set.has(t)));
      }
      case "and":
        // 空の and は「条件なし」= 全員（UI で条件を全部消した状態）
        return e.args.reduce<Bitset>((acc, a) => bitsetAnd(acc, this.people(a)), bitsetFull(n));
      case "or":
        return e.args.reduce<Bitset>((acc, a) => bitsetOr(acc, this.people(a)), bitsetEmpty(n));
      case "not":
        return bitsetNot(this.people(e.arg), n);
    }
  }

  private compileSeat(e: SeatExpr): Bitset {
    const { ctx } = this;
    const n = ctx.nSeats;
    switch (e.op) {
      case "all":
        return bitsetFull(n);
      case "rooms": {
        const rs: number[] = [];
        for (const id of e.roomIds) {
          const r = this.room(id);
          if (r >= 0) rs.push(r);
        }
        return this.seatsOfRooms(rs);
      }
      case "seats": {
        const b = bitsetEmpty(n);
        for (const id of e.seatIds) {
          const s = this.seat(id);
          if (s >= 0) bitSet(b, s);
        }
        return b;
      }
      case "seatTag": {
        const set = new Set(e.in);
        const b = bitsetEmpty(n);
        for (let s = 0; s < n; s++) if (ctx.seatTags[s]!.some((t) => set.has(t))) bitSet(b, s);
        return b;
      }
      case "depth": {
        // domain/expr.ts の resolveSeats と同じ選び方（UI プレビューと一致させる）
        const b = bitsetEmpty(n);
        const rooms = e.roomIds.length
          ? e.roomIds.map((id) => this.room(id)).filter((r) => r >= 0)
          : null;
        for (let r = 0; r < ctx.nRooms; r++) {
          if (rooms && !rooms.includes(r)) continue;
          const seats: number[] = [];
          for (let s = ctx.roomStart[r]!; s < ctx.roomStart[r + 1]!; s++) seats.push(s);
          seats.sort((a, c) =>
            e.from === "back"
              ? ctx.seatDist[c]! - ctx.seatDist[a]!
              : ctx.seatDist[a]! - ctx.seatDist[c]!,
          );
          const k =
            e.count !== undefined
              ? e.count
              : e.ratio !== undefined
                ? Math.round(seats.length * e.ratio)
                : 0;
          for (const s of seats.slice(0, k)) bitSet(b, s);
        }
        return b;
      }
      case "and":
        return e.args.reduce<Bitset>((acc, a) => bitsetAnd(acc, this.seats(a)), bitsetFull(n));
      case "or":
        return e.args.reduce<Bitset>((acc, a) => bitsetOr(acc, this.seats(a)), bitsetEmpty(n));
      case "not":
        return bitsetNot(this.seats(e.arg), n);
    }
  }
}

/** 単発で人集合を解決（テスト・UI 用） */
export function compilePeople(ctx: EngineContext, expr: PersonExpr): Bitset {
  return new ExprCompiler(ctx).people(expr);
}

/** 単発で席集合を解決（テスト・UI 用） */
export function compileSeats(ctx: EngineContext, expr: SeatExpr): Bitset {
  return new ExprCompiler(ctx).seats(expr);
}
