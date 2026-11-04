/**
 * 評価モデル: ルール（とプリセット項）を「葉（Leaf）」と論理ノードの木にコンパイルする。
 *
 * 葉の違反量は `offset + Σ_unit part(unit)` と単位（unit）ごとの和に分解され、
 * 1 手（2 人の入替 / 空席への移動）で変わる単位だけを再計算すれば差分評価できる。
 *
 * | kind     | 単位        | 1 手で再計算する単位                         |
 * | -------- | ----------- | -------------------------------------------- |
 * | `member` | メンバー    | 動いた人                                     |
 * | `room`   | 部屋        | 動いた席の部屋                               |
 * | `seat`   | 席（隣接辺）| 動いた席とその隣（辺 (s,t) は s<t の s が持つ） |
 * | `pair`   | 人の組      | 動いた人を含む組                             |
 * | `global` | なし        | 全体を再計算                                 |
 *
 * `deps` は値に影響しうるメンバー（それ以外の人が動いても値は変わらない）。
 */
import { GENDERS } from "@/domain/genders";
import { ROLE_KEYS } from "@/domain/roles";
import { SOFT_ONLY_TYPES, type Attr, type Rule, type RuleBlock } from "@/domain/rules";
import {
  bitHas,
  bitSet,
  bitsetEmpty,
  bitsetFrom,
  bitsetNot,
  bitsetToArray,
  type Bitset,
} from "./bitset";
import { ExprCompiler } from "./compile";
import { isAdjacent, type EngineContext } from "./context";
import type { Diagnostic, PresetId } from "./types";

/** 割当状態（添字ベース）。seatOf: メンバー → 席（未配置 -1）、memberAt: 席 → メンバー（空席 -1） */
export interface State {
  seatOf: Int32Array;
  memberAt: Int32Array;
}

export function emptyState(ctx: EngineContext): State {
  return {
    seatOf: new Int32Array(ctx.nMembers).fill(-1),
    memberAt: new Int32Array(ctx.nSeats).fill(-1),
  };
}

/** 席 → メンバーの配列から State を作る */
export function stateFromMemberAt(ctx: EngineContext, memberAt: Int32Array): State {
  const st = emptyState(ctx);
  for (let s = 0; s < ctx.nSeats; s++) {
    const m = memberAt[s]!;
    if (m < 0 || st.seatOf[m] !== -1) continue;
    st.seatOf[m] = s;
    st.memberAt[s] = m;
  }
  return st;
}

export function cloneState(st: State): State {
  return { seatOf: st.seatOf.slice(), memberAt: st.memberAt.slice() };
}

export interface CulpritSink {
  members: Set<number>;
  seats: Set<number>;
}

export type LeafKind = "member" | "room" | "seat" | "pair" | "global";

export interface Leaf {
  kind: LeafKind;
  /** 値に影響するメンバー。null = 全員 */
  deps: Bitset | null;
  offset: number;
  /** member / room: 単位の寄与 */
  part?: (st: State, u: number) => number;
  /** seat: 隣接辺 (s, t) の寄与 */
  edge?: (st: State, s: number, t: number) => number;
  /** pair: 組の端点と寄与 */
  pairA?: Int32Array;
  pairB?: Int32Array;
  pairCost?: (st: State, a: number, b: number) => number;
  /** pair: メンバーごとの接続組（CSR） */
  incStart?: Int32Array;
  incList?: Int32Array;
  /** global: 全体の値 */
  full?: (st: State) => number;
  /** 違反の当事者（既定は kind ごとの汎用実装） */
  culprits?: (st: State, out: CulpritSink) => void;
  /** room: 部屋 r が違反しているときの当事者（既定は部屋の全員・全席） */
  roomCulprits?: (st: State, r: number, out: CulpritSink) => void;
}

export type Node =
  | { k: "leaf"; id: number }
  | { k: "sum"; children: Node[] }
  | { k: "min"; children: Node[] }
  | { k: "if"; cond: Node; then: Node }
  | { k: "zero" };

export interface Term {
  ruleId?: string;
  presetId?: PresetId;
  hard: boolean;
  /** 目的関数での重み（hard は HARD_WEIGHT） */
  weight: number;
  node: Node;
  /** この項が参照する葉 */
  leaves: number[];
}

export interface Model {
  ctx: EngineContext;
  leaves: Leaf[];
  terms: Term[];
  diagnostics: Diagnostic[];
  compiler: ExprCompiler;
}

/** hard 違反 1 単位あたりの重み */
export const HARD_WEIGHT = 1000;

const ZERO: Node = { k: "zero" };

// ---------------------------------------------------------------------------
// 値の計算
// ---------------------------------------------------------------------------

export function leafValue(ctx: EngineContext, leaf: Leaf, st: State): number {
  let v = leaf.offset;
  switch (leaf.kind) {
    case "member": {
      const part = leaf.part!;
      if (leaf.deps) {
        for (const m of bitsetToArray(leaf.deps)) v += part(st, m);
      } else for (let m = 0; m < ctx.nMembers; m++) v += part(st, m);
      return v;
    }
    case "room": {
      const part = leaf.part!;
      for (let r = 0; r < ctx.nRooms; r++) v += part(st, r);
      return v;
    }
    case "seat": {
      const edge = leaf.edge!;
      for (let s = 0; s < ctx.nSeats; s++)
        for (let i = ctx.adjStart[s]!; i < ctx.adjStart[s + 1]!; i++) {
          const t = ctx.adjList[i]!;
          if (t > s) v += edge(st, s, t);
        }
      return v;
    }
    case "pair": {
      const A = leaf.pairA!;
      const B = leaf.pairB!;
      const cost = leaf.pairCost!;
      for (let p = 0; p < A.length; p++) v += cost(st, A[p]!, B[p]!);
      return v;
    }
    case "global":
      return v + leaf.full!(st);
  }
}

export function nodeValue(node: Node, leafVal: ArrayLike<number>): number {
  switch (node.k) {
    case "leaf":
      return leafVal[node.id]!;
    case "zero":
      return 0;
    case "sum": {
      let v = 0;
      for (const c of node.children) v += nodeValue(c, leafVal);
      return v;
    }
    case "min": {
      if (node.children.length === 0) return 0;
      let v = Infinity;
      for (const c of node.children) v = Math.min(v, nodeValue(c, leafVal));
      return v;
    }
    case "if":
      return nodeValue(node.cond, leafVal) === 0 ? nodeValue(node.then, leafVal) : 0;
  }
}

function addSeat(st: State, s: number, out: CulpritSink) {
  if (s < 0) return;
  out.seats.add(s);
  const m = st.memberAt[s]!;
  if (m >= 0) out.members.add(m);
}
function addMember(st: State, m: number, out: CulpritSink) {
  if (m < 0) return;
  out.members.add(m);
  const s = st.seatOf[m]!;
  if (s >= 0) out.seats.add(s);
}

export function leafCulprits(ctx: EngineContext, leaf: Leaf, st: State, out: CulpritSink) {
  if (leaf.culprits) return leaf.culprits(st, out);
  switch (leaf.kind) {
    case "member":
      for (let m = 0; m < ctx.nMembers; m++)
        if ((!leaf.deps || bitHas(leaf.deps, m)) && leaf.part!(st, m) > 0) addMember(st, m, out);
      return;
    case "room":
      for (let r = 0; r < ctx.nRooms; r++) {
        if (leaf.part!(st, r) <= 0) continue;
        if (leaf.roomCulprits) leaf.roomCulprits(st, r, out);
        else for (let s = ctx.roomStart[r]!; s < ctx.roomStart[r + 1]!; s++) addSeat(st, s, out);
      }
      return;
    case "seat":
      for (let s = 0; s < ctx.nSeats; s++)
        for (let i = ctx.adjStart[s]!; i < ctx.adjStart[s + 1]!; i++) {
          const t = ctx.adjList[i]!;
          if (t > s && leaf.edge!(st, s, t) > 0) {
            addSeat(st, s, out);
            addSeat(st, t, out);
          }
        }
      return;
    case "pair": {
      const A = leaf.pairA!;
      const B = leaf.pairB!;
      for (let p = 0; p < A.length; p++)
        if (leaf.pairCost!(st, A[p]!, B[p]!) > 0) {
          addMember(st, A[p]!, out);
          addMember(st, B[p]!, out);
        }
      return;
    }
    case "global":
      return;
  }
}

/** ノードの違反当事者を集める（any は最小の子、ifThen は帰結のみ） */
export function nodeCulprits(model: Model, node: Node, st: State, leafVal: ArrayLike<number>, out: CulpritSink) {
  switch (node.k) {
    case "zero":
      return;
    case "leaf":
      if (leafVal[node.id]! > 0) leafCulprits(model.ctx, model.leaves[node.id]!, st, out);
      return;
    case "sum":
      for (const c of node.children) if (nodeValue(c, leafVal) > 0) nodeCulprits(model, c, st, leafVal, out);
      return;
    case "min": {
      let best: Node | null = null;
      let bv = Infinity;
      for (const c of node.children) {
        const v = nodeValue(c, leafVal);
        if (v < bv) {
          bv = v;
          best = c;
        }
      }
      if (best && bv > 0) nodeCulprits(model, best, st, leafVal, out);
      return;
    }
    case "if":
      if (nodeValue(node.cond, leafVal) === 0) nodeCulprits(model, node.then, st, leafVal, out);
      return;
  }
}

export function collectLeaves(node: Node, out: number[] = []): number[] {
  switch (node.k) {
    case "leaf":
      out.push(node.id);
      break;
    case "sum":
    case "min":
      for (const c of node.children) collectLeaves(c, out);
      break;
    case "if":
      collectLeaves(node.cond, out);
      collectLeaves(node.then, out);
      break;
    case "zero":
      break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 属性
// ---------------------------------------------------------------------------

interface AttrInfo {
  /** メンバー → 値の添字（未定義は -1） */
  values: Int32Array;
  n: number;
}

function attrInfo(ctx: EngineContext, attr: Attr): AttrInfo {
  switch (attr) {
    case "lab":
      return { values: ctx.memberLab, n: ctx.labIds.length };
    case "role":
      return { values: ctx.memberRole, n: ROLE_KEYS.length };
    case "gender": {
      const unspecified = GENDERS.indexOf("unspecified");
      return {
        values: ctx.memberGender.map((g) => (g === unspecified ? -1 : g)),
        n: GENDERS.length,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// ブロックのコンパイル
// ---------------------------------------------------------------------------

class Builder {
  readonly leaves: Leaf[] = [];
  readonly diagnostics: Diagnostic[] = [];
  readonly ctx: EngineContext;

  constructor(readonly c: ExprCompiler) {
    this.ctx = c.ctx;
  }

  leaf(l: Leaf): Node {
    this.leaves.push(l);
    return { k: "leaf", id: this.leaves.length - 1 };
  }

  incomplete(ruleId: string | undefined): Node {
    if (!this.diagnostics.some((d) => d.code === "incompleteRule" && d.ruleId === ruleId))
      this.diagnostics.push({
        code: "incompleteRule",
        severity: "warning",
        ruleId,
        params: { ruleId: ruleId ?? "" },
      });
    return ZERO;
  }

  /** ブロックを木にコンパイル。null / 未入力 / 参照切れで評価できないものは zero */
  block(b: RuleBlock | null, ruleId: string | undefined): Node {
    if (!b) return this.incomplete(ruleId);
    const { c, ctx } = this;
    switch (b.type) {
      case "room.only":
      case "room.exclude": {
        const P = c.people(b.people);
        const RS = c.seatsOfRooms(c.rooms(b.rooms));
        const only = b.type === "room.only";
        return this.leaf({
          kind: "member",
          deps: only ? bitsetNot(P, ctx.nMembers) : P,
          offset: 0,
          part: (st, m) => {
            const s = st.seatOf[m]!;
            return s >= 0 && bitHas(RS, s) && bitHas(P, m) !== only ? 1 : 0;
          },
        });
      }
      case "room.prefer":
        return this.roomPrefer(c.people(b.people), c.rooms(b.rooms));
      case "room.count":
        return this.roomCount(b, c.people(b.people), c.rooms(b.rooms));
      case "room.diversity":
        return this.roomDiversity(c.rooms(b.rooms), b.attr, b.min);
      case "room.attrCap":
        return this.roomAttrCap(c.rooms(b.rooms), b.attr, b.max, b.unit);
      case "seat.only": {
        const S = c.seats(b.seats);
        const P = c.people(b.people);
        return this.leaf({
          kind: "member",
          deps: bitsetNot(P, ctx.nMembers),
          offset: 0,
          part: (st, m) => {
            const s = st.seatOf[m]!;
            return s >= 0 && bitHas(S, s) && !bitHas(P, m) ? 1 : 0;
          },
        });
      }
      case "seat.pin": {
        const s = c.seat(b.seatId);
        const m = c.member(b.memberId);
        if (s < 0 || m < 0) return this.incomplete(ruleId);
        return this.pinSeat(m, s);
      }
      case "seat.empty": {
        const S = c.seats(b.seats);
        return this.leaf({
          kind: "member",
          deps: null,
          offset: 0,
          part: (st, m) => {
            const s = st.seatOf[m]!;
            return s >= 0 && bitHas(S, s) ? 1 : 0;
          },
        });
      }
      case "person.pin": {
        const m = c.member(b.memberId);
        if (m < 0 || !b.target) return this.incomplete(ruleId);
        if (b.target.kind === "seat") {
          const s = c.seat(b.target.seatId);
          return s < 0 ? this.incomplete(ruleId) : this.pinSeat(m, s);
        }
        const r = c.room(b.target.roomId);
        if (r < 0) return this.incomplete(ruleId);
        return this.leaf({
          kind: "member",
          deps: single(ctx.nMembers, m),
          offset: 0,
          part: (st, x) => {
            if (x !== m) return 0;
            const s = st.seatOf[m]!;
            return s < 0 || ctx.seatRoom[s] !== r ? 1 : 0;
          },
          culprits: (st, out) => {
            addMember(st, m, out);
            for (let s = ctx.roomStart[r]!; s < ctx.roomStart[r + 1]!; s++) out.seats.add(s);
          },
        });
      }
      case "person.avoid": {
        const m = c.member(b.memberId);
        if (m < 0) return this.incomplete(ruleId);
        const S = c.seats(b.seats);
        return this.leaf({
          kind: "member",
          deps: single(ctx.nMembers, m),
          offset: 0,
          part: (st, x) => {
            if (x !== m) return 0;
            const s = st.seatOf[m]!;
            return s >= 0 && bitHas(S, s) ? 1 : 0;
          },
        });
      }
      case "pair.relation":
        return this.pairRelation(b);
      case "prev.same":
      case "prev.different": {
        if (!ctx.hasPrevious && !this.diagnostics.some((d) => d.code === "noPreviousPlan" && d.ruleId === ruleId))
          this.diagnostics.push({
            code: "noPreviousPlan",
            severity: "warning",
            ruleId,
            params: { ruleId: ruleId ?? "" },
          });
        return this.prev(c.people(b.people), b.scope, b.type === "prev.same");
      }
      case "group.cluster":
        return this.cluster(c.people(b.people), b.attr);
      case "group.spread":
        return this.spread(c.people(b.people), b.attr);
      case "depth.order":
        return this.depthOrder(c.people(b.people), b.direction);
      case "group.mixAdjacent":
        return this.mixAdjacent(c.people(b.people), b.attr);
      case "group.buddy":
        return this.buddy(c.people(b.a), c.people(b.b), b.scope, b.min);
      case "group.labBalance":
        return this.labBalance(c.people(b.people));
      case "logic.any":
        return { k: "min", children: b.children.map((x) => this.block(x, ruleId)) };
      case "logic.all":
        return { k: "sum", children: b.children.map((x) => this.block(x, ruleId)) };
      case "logic.ifThen":
        if (!b.condition || !b.then) return this.incomplete(ruleId);
        return { k: "if", cond: this.block(b.condition, ruleId), then: this.block(b.then, ruleId) };
    }
  }

  /** メンバー m を席 s に。違反 = その席にいなければ 1 */
  private pinSeat(m: number, s: number): Node {
    return this.leaf({
      kind: "member",
      deps: single(this.ctx.nMembers, m),
      offset: 0,
      part: (st, x) => (x === m && st.seatOf[m] !== s ? 1 : 0),
      culprits: (st, out) => {
        addMember(st, m, out);
        addSeat(st, s, out);
      },
    });
  }

  /**
   * room.prefer（soft 専用）: 部屋群 R に人集合 P を「多めに」。
   * 違反 = min(R の外に座っている P の人数, R 内の P 以外の人数 + R の空席数)
   * = まだ R に移せる P の人数。R が P で埋まるか P が全員 R に入れば 0。
   */
  private roomPrefer(P: Bitset, rooms: number[]): Node {
    const { ctx } = this;
    const inR = roomMask(ctx, rooms);
    const RS = this.c.seatsOfRooms(rooms);
    const outside = (st: State, m: number) => {
      const s = st.seatOf[m]!;
      return bitHas(P, m) && s >= 0 && !inR[ctx.seatRoom[s]!];
    };
    return this.leaf({
      kind: "global",
      deps: null,
      offset: 0,
      full: (st) => {
        let pOut = 0;
        for (let m = 0; m < ctx.nMembers; m++) if (outside(st, m)) pOut++;
        if (pOut === 0) return 0;
        let room = 0;
        for (const s of bitsetToArray(RS)) {
          const m = st.memberAt[s]!;
          if (m < 0 || !bitHas(P, m)) room++;
        }
        return Math.min(pOut, room);
      },
      culprits: (st, out) => {
        for (let m = 0; m < ctx.nMembers; m++) if (outside(st, m)) addMember(st, m, out);
      },
    });
  }

  /**
   * room.count: 部屋ごとに P の人数 c と目標 t（count = value、percent = value% × 部屋の在室人数）を比較。
   * 違反 = Σ_部屋 不足人数（gte: ⌈t⌉−c）/ 超過人数（lte: c−⌊t⌋）/ ずれ（eq: |c−round(t)|）
   */
  private roomCount(b: Extract<RuleBlock, { type: "room.count" }>, P: Bitset, rooms: number[]): Node {
    const { ctx } = this;
    const inR = roomMask(ctx, rooms);
    const eps = 1e-9;
    const counts = (st: State, r: number) => {
      let c = 0;
      let n = 0;
      for (let s = ctx.roomStart[r]!; s < ctx.roomStart[r + 1]!; s++) {
        const m = st.memberAt[s]!;
        if (m < 0) continue;
        n++;
        if (bitHas(P, m)) c++;
      }
      const t = b.unit === "count" ? b.value : (b.value / 100) * n;
      return { c, t };
    };
    return this.leaf({
      kind: "room",
      deps: b.unit === "percent" ? null : P,
      offset: 0,
      part: (st, r) => {
        if (!inR[r]) return 0;
        const { c, t } = counts(st, r);
        switch (b.op) {
          case "gte":
            return Math.max(0, Math.ceil(t - eps) - c);
          case "lte":
            return Math.max(0, c - Math.floor(t + eps));
          case "eq":
            return Math.abs(c - Math.round(t));
        }
      },
      roomCulprits: (st, r, out) => {
        const { c, t } = counts(st, r);
        const tooMany = c > t;
        for (let s = ctx.roomStart[r]!; s < ctx.roomStart[r + 1]!; s++) {
          const m = st.memberAt[s]!;
          if (tooMany) {
            if (m >= 0 && bitHas(P, m)) addSeat(st, s, out);
          } else if (m < 0 || !bitHas(P, m)) addSeat(st, s, out);
        }
      },
    });
  }

  /**
   * room.diversity: 部屋ごとの属性の種類数の不足。
   * 目標 = min(min, 在室人数, 全体に存在する種類数)、違反 = Σ max(0, 目標 − 種類数)
   */
  private roomDiversity(rooms: number[], attr: Attr, min: number): Node {
    const { ctx } = this;
    const inR = roomMask(ctx, rooms);
    const { values, n } = attrInfo(ctx, attr);
    const totalDistinct = new Set([...values].filter((v) => v >= 0)).size;
    const seen = new Int32Array(Math.max(1, n));
    let epoch = 0;
    return this.leaf({
      kind: "room",
      deps: null,
      offset: 0,
      part: (st, r) => {
        if (!inR[r]) return 0;
        epoch++;
        let occ = 0;
        let distinct = 0;
        for (let s = ctx.roomStart[r]!; s < ctx.roomStart[r + 1]!; s++) {
          const m = st.memberAt[s]!;
          if (m < 0) continue;
          occ++;
          const v = values[m]!;
          if (v >= 0 && seen[v] !== epoch) {
            seen[v] = epoch;
            distinct++;
          }
        }
        return Math.max(0, Math.min(min, occ, totalDistinct) - distinct);
      },
    });
  }

  /**
   * room.attrCap: 部屋ごとに同じ属性値の人数の上限（count = max、percent = max(1, ⌊max% × 在室人数⌋)）。
   * 違反 = Σ_部屋 Σ_値 超過人数。属性未設定（研究室なし・性別未回答）は数えない。
   */
  private roomAttrCap(rooms: number[], attr: Attr, max: number, unit: "count" | "percent"): Node {
    const { ctx } = this;
    const inR = roomMask(ctx, rooms);
    const { values, n } = attrInfo(ctx, attr);
    const cnt = new Int32Array(Math.max(1, n));
    const fill = (st: State, r: number) => {
      cnt.fill(0);
      let occ = 0;
      for (let s = ctx.roomStart[r]!; s < ctx.roomStart[r + 1]!; s++) {
        const m = st.memberAt[s]!;
        if (m < 0) continue;
        occ++;
        const v = values[m]!;
        if (v >= 0) cnt[v]!++;
      }
      return unit === "count" ? max : Math.max(1, Math.floor((max / 100) * occ + 1e-9));
    };
    return this.leaf({
      kind: "room",
      deps: null,
      offset: 0,
      part: (st, r) => {
        if (!inR[r]) return 0;
        const cap = fill(st, r);
        let v = 0;
        for (let i = 0; i < n; i++) if (cnt[i]! > cap) v += cnt[i]! - cap;
        return v;
      },
      roomCulprits: (st, r, out) => {
        const cap = fill(st, r);
        for (let s = ctx.roomStart[r]!; s < ctx.roomStart[r + 1]!; s++) {
          const m = st.memberAt[s]!;
          if (m >= 0 && values[m]! >= 0 && cnt[values[m]!]! > cap) addSeat(st, s, out);
        }
      },
    });
  }

  /**
   * pair.relation: A × B の組（a≠b、修飾で絞り込み、重複なし）ごとに 1/0。
   * - sameRoom: 同じ部屋でなければ違反（未配置も違反）
   * - differentRoom: 同じ部屋なら違反
   * - adjacent: 隣でなければ違反（未配置も違反）
   * - notAdjacent: 隣なら違反
   * 修飾 lab: same = 両者に研究室があり同じ / different = それ以外。role: 役職が同じ / 異なる。
   */
  private pairRelation(b: Extract<RuleBlock, { type: "pair.relation" }>): Node {
    const { ctx, c } = this;
    const A = c.people(b.a);
    const B = c.people(b.b);
    const q = b.qualifier;
    const ok = (x: number, y: number) => {
      if (q?.lab) {
        const lx = ctx.memberLab[x]!;
        const same = lx >= 0 && lx === ctx.memberLab[y];
        if ((q.lab === "same") !== same) return false;
      }
      if (q?.role) {
        const same = ctx.memberRole[x] === ctx.memberRole[y];
        if ((q.role === "same") !== same) return false;
      }
      return true;
    };
    const pa: number[] = [];
    const pb: number[] = [];
    const as = bitsetToArray(A);
    const bs = bitsetToArray(B);
    for (const x of as)
      for (const y of bs) {
        if (x === y) continue;
        // 両方向に現れる組は x<y の向きだけ採用
        if (bitHas(A, y) && bitHas(B, x) && x > y) continue;
        if (ok(x, y)) {
          pa.push(x);
          pb.push(y);
        }
      }
    let cost: (st: State, x: number, y: number) => number;
    switch (b.relation) {
      case "sameRoom":
        cost = (st, x, y) => {
          const sx = st.seatOf[x]!;
          const sy = st.seatOf[y]!;
          return sx >= 0 && sy >= 0 && ctx.seatRoom[sx] === ctx.seatRoom[sy] ? 0 : 1;
        };
        break;
      case "differentRoom":
        cost = (st, x, y) => {
          const sx = st.seatOf[x]!;
          const sy = st.seatOf[y]!;
          return sx >= 0 && sy >= 0 && ctx.seatRoom[sx] === ctx.seatRoom[sy] ? 1 : 0;
        };
        break;
      case "adjacent":
        cost = (st, x, y) => {
          const sx = st.seatOf[x]!;
          const sy = st.seatOf[y]!;
          return sx >= 0 && sy >= 0 && isAdjacent(ctx, sx, sy) ? 0 : 1;
        };
        break;
      case "notAdjacent":
        cost = (st, x, y) => {
          const sx = st.seatOf[x]!;
          const sy = st.seatOf[y]!;
          return sx >= 0 && sy >= 0 && isAdjacent(ctx, sx, sy) ? 1 : 0;
        };
        break;
    }
    return this.pairLeaf(pa, pb, cost);
  }

  pairLeaf(pa: number[], pb: number[], cost: (st: State, a: number, b: number) => number): Node {
    const n = this.ctx.nMembers;
    const deps = bitsetEmpty(n);
    const incStart = new Int32Array(n + 1);
    for (let p = 0; p < pa.length; p++) {
      incStart[pa[p]! + 1]!++;
      incStart[pb[p]! + 1]!++;
      bitSet(deps, pa[p]!);
      bitSet(deps, pb[p]!);
    }
    for (let i = 0; i < n; i++) incStart[i + 1]! += incStart[i]!;
    const fillPos = incStart.slice(0, n);
    const incList = new Int32Array(pa.length * 2);
    for (let p = 0; p < pa.length; p++) {
      incList[fillPos[pa[p]!]!++] = p;
      incList[fillPos[pb[p]!]!++] = p;
    }
    return this.leaf({
      kind: "pair",
      deps,
      offset: 0,
      pairA: Int32Array.from(pa),
      pairB: Int32Array.from(pb),
      pairCost: cost,
      incStart,
      incList,
    });
  }

  /**
   * prev.same / prev.different: 昨年度の席・部屋が分かる P のメンバーごとに 1/0。
   * - same: 未配置 or 昨年度と違えば違反（席不明で部屋だけ分かる場合、scope=seat でも部屋で比較）
   * - different: 昨年度と同じなら違反（scope=seat で席不明なら判定しない）
   */
  private prev(P: Bitset, scope: "room" | "seat", same: boolean): Node {
    const { ctx } = this;
    const deps = bitsetEmpty(ctx.nMembers);
    for (const m of bitsetToArray(P)) if (ctx.prevRoom[m]! >= 0) bitSet(deps, m);
    return this.leaf({
      kind: "member",
      deps,
      offset: 0,
      part: (st, m) => {
        if (!bitHas(deps, m)) return 0;
        const s = st.seatOf[m]!;
        const ps = ctx.prevSeat[m]!;
        if (scope === "seat" && ps >= 0) {
          return same ? (s === ps ? 0 : 1) : s === ps ? 1 : 0;
        }
        if (!same && scope === "seat") return 0;
        const sameRoom = s >= 0 && ctx.seatRoom[s] === ctx.prevRoom[m];
        return same ? (sameRoom ? 0 : 1) : sameRoom ? 1 : 0;
      },
    });
  }

  /**
   * group.cluster: 同じ属性の人を同じ部屋・隣同士に。違反 = 2 項の和:
   * 1. 部屋: Σ_値 (配置済み人数 − 最多の部屋の人数) = 主な部屋の外にいる人数
   * 2. 隣接: 属性が異なる P 同士の隣接ペア数（グループの境界）
   */
  private cluster(P: Bitset, attr: "lab" | "role"): Node {
    const { ctx } = this;
    const { values, n } = attrInfo(ctx, attr);
    const nr = ctx.nRooms;
    const cnt = new Int32Array(Math.max(1, n * nr));
    const fill = (st: State) => {
      cnt.fill(0);
      for (const m of members) {
        const s = st.seatOf[m]!;
        const v = values[m]!;
        if (s >= 0 && v >= 0) cnt[v * nr + ctx.seatRoom[s]!]!++;
      }
    };
    const members = bitsetToArray(P);
    const roomPart = this.leaf({
      kind: "global",
      deps: P,
      offset: 0,
      full: (st) => {
        fill(st);
        let v = 0;
        for (let i = 0; i < n; i++) {
          let tot = 0;
          let mx = 0;
          for (let r = 0; r < nr; r++) {
            const x = cnt[i * nr + r]!;
            tot += x;
            if (x > mx) mx = x;
          }
          v += tot - mx;
        }
        return v;
      },
      culprits: (st, out) => {
        fill(st);
        const main = new Int32Array(Math.max(1, n)).fill(-1);
        for (let i = 0; i < n; i++) {
          let mx = 0;
          for (let r = 0; r < nr; r++)
            if (cnt[i * nr + r]! > mx) {
              mx = cnt[i * nr + r]!;
              main[i] = r;
            }
        }
        for (const m of members) {
          const s = st.seatOf[m]!;
          const v = values[m]!;
          if (s >= 0 && v >= 0 && ctx.seatRoom[s] !== main[v]) addMember(st, m, out);
        }
      },
    });
    const adjPart = this.leaf({
      kind: "seat",
      deps: P,
      offset: 0,
      edge: (st, s, t) => {
        const a = st.memberAt[s]!;
        const b = st.memberAt[t]!;
        if (a < 0 || b < 0 || !bitHas(P, a) || !bitHas(P, b)) return 0;
        const va = values[a]!;
        const vb = values[b]!;
        return va >= 0 && vb >= 0 && va !== vb ? 1 : 0;
      },
    });
    return { k: "sum", children: [roomPart, adjPart] };
  }

  /**
   * group.spread: 属性値ごとに、部屋の席数に比例した上限 ⌈全体人数 × 部屋の席数 / 総席数⌉ を超えた人数の和。
   */
  private spread(P: Bitset, attr: Attr): Node {
    const { ctx } = this;
    const { values, n } = attrInfo(ctx, attr);
    const total = new Int32Array(Math.max(1, n));
    for (const m of bitsetToArray(P)) if (values[m]! >= 0) total[values[m]!]!++;
    const cap = (r: number, v: number) =>
      Math.ceil(
        (total[v]! * (ctx.roomStart[r + 1]! - ctx.roomStart[r]!)) / Math.max(1, ctx.nSeats) - 1e-9,
      );
    const cnt = new Int32Array(Math.max(1, n));
    const fill = (st: State, r: number) => {
      cnt.fill(0);
      for (let s = ctx.roomStart[r]!; s < ctx.roomStart[r + 1]!; s++) {
        const m = st.memberAt[s]!;
        if (m >= 0 && bitHas(P, m) && values[m]! >= 0) cnt[values[m]!]!++;
      }
    };
    return this.leaf({
      kind: "room",
      deps: P,
      offset: 0,
      part: (st, r) => {
        fill(st, r);
        let v = 0;
        for (let i = 0; i < n; i++) v += Math.max(0, cnt[i]! - cap(r, i));
        return v;
      },
      roomCulprits: (st, r, out) => {
        fill(st, r);
        for (let s = ctx.roomStart[r]!; s < ctx.roomStart[r + 1]!; s++) {
          const m = st.memberAt[s]!;
          if (m >= 0 && bitHas(P, m) && values[m]! >= 0 && cnt[values[m]!]! > cap(r, values[m]!))
            addSeat(st, s, out);
        }
      },
    });
  }

  /**
   * depth.order: 部屋ごとに、rank の異なる P の 2 人で奥行きの順序が逆転している組の数を
   * (部屋内の対象人数 − 1) で割ったもの（1 人が端から端まで逆にいると約 1）。
   * 役職「その他」(rank 0) は対象外。
   */
  private depthOrder(P: Bitset, direction: "seniorBack" | "seniorFront"): Node {
    const { ctx } = this;
    const deps = bitsetEmpty(ctx.nMembers);
    for (const m of bitsetToArray(P)) if (ctx.memberRank[m]! > 0) bitSet(deps, m);
    const sign = direction === "seniorBack" ? 1 : -1;
    const maxRoom = Math.max(1, ...Array.from({ length: ctx.nRooms }, (_, r) => ctx.roomStart[r + 1]! - ctx.roomStart[r]!));
    const rk = new Float64Array(maxRoom);
    const dp = new Float64Array(maxRoom);
    const sx = new Int32Array(maxRoom);
    const collect = (st: State, r: number) => {
      let k = 0;
      for (let s = ctx.roomStart[r]!; s < ctx.roomStart[r + 1]!; s++) {
        const m = st.memberAt[s]!;
        if (m < 0 || !bitHas(deps, m)) continue;
        rk[k] = ctx.memberRank[m]!;
        dp[k] = sign * ctx.seatDist[s]!;
        sx[k] = s;
        k++;
      }
      return k;
    };
    const inverted = (i: number, j: number) =>
      (rk[i]! > rk[j]! && dp[i]! < dp[j]!) || (rk[j]! > rk[i]! && dp[j]! < dp[i]!);
    return this.leaf({
      kind: "room",
      deps,
      offset: 0,
      part: (st, r) => {
        const k = collect(st, r);
        if (k < 2) return 0;
        let inv = 0;
        for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) if (inverted(i, j)) inv++;
        return inv / (k - 1);
      },
      roomCulprits: (st, r, out) => {
        const k = collect(st, r);
        for (let i = 0; i < k; i++)
          for (let j = i + 1; j < k; j++)
            if (inverted(i, j)) {
              addSeat(st, sx[i]!, out);
              addSeat(st, sx[j]!, out);
            }
      },
    });
  }

  /** group.mixAdjacent: 属性が同じ P 同士の隣接ペア数 */
  private mixAdjacent(P: Bitset, attr: "lab" | "role"): Node {
    const { values } = attrInfo(this.ctx, attr);
    return this.leaf({
      kind: "seat",
      deps: P,
      offset: 0,
      edge: (st, s, t) => {
        const a = st.memberAt[s]!;
        const b = st.memberAt[t]!;
        if (a < 0 || b < 0 || !bitHas(P, a) || !bitHas(P, b)) return 0;
        const va = values[a]!;
        return va >= 0 && va === values[b] ? 1 : 0;
      },
    });
  }

  /**
   * group.buddy: A の各メンバーについて、同じ部屋（または隣）にいる同じ研究室の B（本人以外）が
   * min 人未満なら 1。未配置の A は違反、研究室の無い A は対象外。違反 = 該当する A の人数。
   */
  private buddy(A: Bitset, B: Bitset, scope: "sameRoom" | "adjacent", min: number): Node {
    const { ctx } = this;
    const nl = ctx.labIds.length;
    const nr = ctx.nRooms;
    const as = bitsetToArray(A).filter((m) => ctx.memberLab[m]! >= 0);
    const bs = bitsetToArray(B).filter((m) => ctx.memberLab[m]! >= 0);
    const deps = bitsetFrom(ctx.nMembers, [...as, ...bs]);
    const cnt = new Int32Array(Math.max(1, nl * nr));
    const lacking = (st: State, a: number): boolean => {
      const s = st.seatOf[a]!;
      if (s < 0) return true;
      const lab = ctx.memberLab[a]!;
      let k = 0;
      if (scope === "sameRoom") {
        k = cnt[lab * nr + ctx.seatRoom[s]!]! - (bitHas(B, a) ? 1 : 0);
      } else {
        for (let i = ctx.adjStart[s]!; i < ctx.adjStart[s + 1]!; i++) {
          const b = st.memberAt[ctx.adjList[i]!]!;
          if (b >= 0 && bitHas(B, b) && ctx.memberLab[b] === lab) k++;
        }
      }
      return k < min;
    };
    const fill = (st: State) => {
      if (scope !== "sameRoom") return;
      cnt.fill(0);
      for (const b of bs) {
        const s = st.seatOf[b]!;
        if (s >= 0) cnt[ctx.memberLab[b]! * nr + ctx.seatRoom[s]!]!++;
      }
    };
    return this.leaf({
      kind: "global",
      deps,
      offset: 0,
      full: (st) => {
        fill(st);
        let v = 0;
        for (const a of as) if (lacking(st, a)) v++;
        return v;
      },
      culprits: (st, out) => {
        fill(st);
        for (const a of as) if (lacking(st, a)) addMember(st, a, out);
      },
    });
  }

  /**
   * group.labBalance（soft 専用）: 部屋ごとの研究室構成と P 全体の研究室比率との距離。
   * 違反 = Σ_部屋 ½ Σ_研究室 |c_rl − n_r × ρ_l|（= 比率に合わせるために入れ替えが必要な人数の目安）
   */
  private labBalance(P: Bitset): Node {
    const { ctx } = this;
    const nl = ctx.labIds.length;
    const ps = bitsetToArray(P).filter((m) => ctx.memberLab[m]! >= 0);
    const deps = bitsetFrom(ctx.nMembers, ps);
    const ratio = new Float64Array(Math.max(1, nl));
    for (const m of ps) ratio[ctx.memberLab[m]!]! += 1 / ps.length;
    const cnt = new Int32Array(Math.max(1, nl));
    const fill = (st: State, r: number) => {
      cnt.fill(0);
      let n = 0;
      for (let s = ctx.roomStart[r]!; s < ctx.roomStart[r + 1]!; s++) {
        const m = st.memberAt[s]!;
        if (m >= 0 && bitHas(deps, m)) {
          cnt[ctx.memberLab[m]!]!++;
          n++;
        }
      }
      return n;
    };
    return this.leaf({
      kind: "room",
      deps,
      offset: 0,
      part: (st, r) => {
        const n = fill(st, r);
        if (n === 0) return 0;
        let v = 0;
        for (let l = 0; l < nl; l++) v += Math.abs(cnt[l]! - n * ratio[l]!);
        return v / 2;
      },
      roomCulprits: (st, r, out) => {
        const n = fill(st, r);
        for (let s = ctx.roomStart[r]!; s < ctx.roomStart[r + 1]!; s++) {
          const m = st.memberAt[s]!;
          if (m >= 0 && bitHas(deps, m) && cnt[ctx.memberLab[m]!]! > n * ratio[ctx.memberLab[m]!]! + 0.5)
            addSeat(st, s, out);
        }
      },
    });
  }

  /**
   * プリセット「名前順」: かな順で連続する 2 人の席ラベル順が逆なら 1 + (逆転幅 / 席数)。
   */
  nameOrder(): Node {
    const { ctx } = this;
    const order = new Int32Array(ctx.nMembers);
    for (let m = 0; m < ctx.nMembers; m++) order[ctx.memberKanaRank[m]!] = m;
    const pa: number[] = [];
    const pb: number[] = [];
    for (let i = 0; i + 1 < ctx.nMembers; i++) {
      pa.push(order[i]!);
      pb.push(order[i + 1]!);
    }
    const S = Math.max(1, ctx.nSeats);
    return this.pairLeaf(pa, pb, (st, a, b) => {
      const sa = st.seatOf[a]!;
      const sb = st.seatOf[b]!;
      if (sa < 0 || sb < 0) return 0;
      const d = ctx.seatLabelRank[sa]! - ctx.seatLabelRank[sb]!;
      return d > 0 ? 1 + d / S : 0;
    });
  }
}

function single(n: number, m: number): Bitset {
  const b = bitsetEmpty(n);
  bitSet(b, m);
  return b;
}

function roomMask(ctx: EngineContext, rooms: number[]): Uint8Array {
  const mask = new Uint8Array(ctx.nRooms);
  for (const r of rooms) mask[r] = 1;
  return mask;
}

// ---------------------------------------------------------------------------
// モデル構築
// ---------------------------------------------------------------------------

export interface PresetTermInput {
  id: PresetId;
  weight: number;
  /** プリセットを構成するブロック（nameOrder は特別項） */
  blocks: RuleBlock[];
}

/**
 * コンテキストの有効ルール（とプリセット項）から評価モデルを作る。
 * soft 専用ブロックを hard 指定した場合は soft（weight）として扱い、診断を出す。
 */
export function buildModel(ctx: EngineContext, presets: PresetTermInput[] = [], rules: Rule[] = ctx.rules): Model {
  const compiler = new ExprCompiler(ctx);
  const b = new Builder(compiler);
  const terms: Term[] = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    compiler.ruleId = rule.id;
    let hard = rule.strength === "hard";
    if (hard && SOFT_ONLY_TYPES.has(rule.block.type)) {
      hard = false;
      b.diagnostics.push({
        code: "softOnlyAsHard",
        severity: "info",
        ruleId: rule.id,
        params: { ruleId: rule.id },
      });
    }
    const node = b.block(rule.block, rule.id);
    terms.push({
      ruleId: rule.id,
      hard,
      weight: hard ? HARD_WEIGHT : rule.weight,
      node,
      leaves: collectLeaves(node),
    });
  }
  compiler.ruleId = undefined;
  for (const p of presets) {
    if (p.weight <= 0) continue;
    const children = p.blocks.map((x) => b.block(x, undefined));
    if (p.id === "nameOrder") children.push(b.nameOrder());
    if (children.length === 0) continue;
    const node: Node = children.length === 1 ? children[0]! : { k: "sum", children };
    terms.push({ presetId: p.id, hard: false, weight: p.weight, node, leaves: collectLeaves(node) });
  }
  return {
    ctx,
    leaves: b.leaves,
    terms,
    diagnostics: [...compiler.diagnostics, ...b.diagnostics],
    compiler,
  };
}

/** 単一ブロックだけのモデル（evaluate() 用） */
export function buildBlockModel(ctx: EngineContext, block: RuleBlock): Model {
  return buildModel(ctx, [], [
    { id: "__block__", enabled: true, strength: "soft", weight: 1, block },
  ]);
}
