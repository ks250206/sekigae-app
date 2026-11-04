/**
 * 目的関数の全体評価と差分評価（#107）。
 *
 * 目的関数 = Σ_hard (HARD_WEIGHT × 違反) + Σ_soft (weight × 違反) + Σ_preset (weight × 違反)
 *
 * 1 手 = 「メンバー a を席 sb へ。sb に b がいれば b を a の元の席 sa へ（sa=-1 なら b は未配置に）」。
 * propose() で状態を書き換えて差分を返し、accept() / reject() で確定 / 巻き戻しする。
 */
import { bitHas } from "./bitset";
import type { EngineContext } from "./context";
import {
  leafValue,
  nodeCulprits,
  nodeValue,
  type CulpritSink,
  type Leaf,
  type Model,
  type State,
} from "./model";
import type { Violation } from "./types";

export class IncrementalEvaluator {
  readonly ctx: EngineContext;
  readonly leafVal: Float64Array;
  readonly termVal: Float64Array;
  score = 0;
  hard = 0;

  /** メンバー → 影響する葉（CSR） */
  private memLeafStart: Int32Array;
  private memLeafList: Int32Array;
  /** 葉 → それを含む項 */
  private leafTerms: Int32Array[];

  // 作業領域
  private leafStamp: Int32Array;
  private termStamp: Int32Array;
  private seatStamp: Int32Array;
  private pairStamp: Int32Array;
  private epoch = 0;
  private touchedLeaves: Int32Array;
  private nTouched = 0;
  private oldLeafVal: Float64Array;
  private before: Float64Array;
  /** room / seat 葉の単位ごとの寄与のキャッシュ */
  private unitCache: (Float64Array | null)[];
  private logLeaf: Int32Array;
  private logUnit: Int32Array;
  private logVal: Float64Array;
  private nLog = 0;
  private touchedTerms: Int32Array;
  private oldTermVal: Float64Array;
  private nTerms = 0;
  private seatUnits: Int32Array;
  private nSeatUnits = 0;
  private oldScore = 0;
  private oldHard = 0;
  private a = -1;
  private b = -1;
  private sa = -1;
  private sb = -1;
  private ra = -1;
  private rb = -1;

  readonly model: Model;
  readonly st: State;

  constructor(model: Model, st: State) {
    this.model = model;
    this.st = st;
    const { ctx, leaves, terms } = model;
    this.ctx = ctx;
    this.leafVal = new Float64Array(leaves.length);
    this.termVal = new Float64Array(terms.length);
    this.leafTerms = leaves.map(() => new Int32Array(0));
    const lt: number[][] = leaves.map(() => []);
    terms.forEach((t, ti) => {
      for (const l of new Set(t.leaves)) lt[l]!.push(ti);
    });
    this.leafTerms = lt.map((x) => Int32Array.from(x));

    const lists: number[][] = Array.from({ length: ctx.nMembers }, () => []);
    leaves.forEach((leaf, li) => {
      if (lt[li]!.length === 0) return;
      for (let m = 0; m < ctx.nMembers; m++)
        if (!leaf.deps || bitHas(leaf.deps, m)) lists[m]!.push(li);
    });
    this.memLeafStart = new Int32Array(ctx.nMembers + 1);
    for (let m = 0; m < ctx.nMembers; m++)
      this.memLeafStart[m + 1] = this.memLeafStart[m]! + lists[m]!.length;
    this.memLeafList = Int32Array.from(lists.flat());

    this.leafStamp = new Int32Array(leaves.length);
    this.termStamp = new Int32Array(terms.length);
    this.seatStamp = new Int32Array(ctx.nSeats);
    const maxPairs = Math.max(0, ...leaves.map((l) => l.pairA?.length ?? 0));
    this.pairStamp = new Int32Array(maxPairs);
    this.oldLeafVal = new Float64Array(leaves.length);
    this.touchedLeaves = new Int32Array(leaves.length);
    this.touchedTerms = new Int32Array(terms.length);
    this.oldTermVal = new Float64Array(terms.length);
    const maxLog = leaves.length * (ctx.nSeats + 2);
    this.logLeaf = new Int32Array(maxLog);
    this.logUnit = new Int32Array(maxLog);
    this.logVal = new Float64Array(maxLog);
    this.before = new Float64Array(leaves.length);
    this.seatUnits = new Int32Array(ctx.nSeats);
    this.unitCache = leaves.map((l) =>
      l.kind === "room"
        ? new Float64Array(ctx.nRooms)
        : l.kind === "seat"
          ? new Float64Array(ctx.nSeats)
          : null,
    );
    this.recompute();
  }

  /** 全体を再計算（誤差の蓄積をリセット） */
  recompute(): void {
    const { model, st, ctx } = this;
    model.leaves.forEach((leaf, i) => {
      const cache = this.unitCache[i];
      if (cache) {
        let v = leaf.offset;
        for (let u = 0; u < cache.length; u++) {
          cache[u] = this.unitPart(leaf, u);
          v += cache[u]!;
        }
        this.leafVal[i] = v;
      } else this.leafVal[i] = leafValue(ctx, leaf, st);
    });
    this.score = 0;
    this.hard = 0;
    model.terms.forEach((t, i) => {
      const v = nodeValue(t.node, this.leafVal);
      this.termVal[i] = v;
      this.score += t.weight * v;
      if (t.hard) this.hard += v;
    });
  }

  /** room / seat 単位の寄与 */
  private unitPart(leaf: Leaf, u: number): number {
    if (leaf.kind === "room") return leaf.part!(this.st, u);
    const { ctx, st } = this;
    const edge = leaf.edge!;
    let v = 0;
    for (let i = ctx.adjStart[u]!; i < ctx.adjStart[u + 1]!; i++) {
      const t = ctx.adjList[i]!;
      if (t > u) v += edge(st, u, t);
    }
    return v;
  }

  /** member / pair / global の局所和（キャッシュなし） */
  private localSum(leaf: Leaf): number {
    const { st, a, b } = this;
    switch (leaf.kind) {
      case "member":
        return leaf.part!(st, a) + (b >= 0 ? leaf.part!(st, b) : 0);
      case "pair": {
        const A = leaf.pairA!;
        const B = leaf.pairB!;
        const cost = leaf.pairCost!;
        const inc = leaf.incList!;
        const start = leaf.incStart!;
        const stamp = this.pairStamp;
        const e = ++this.epoch;
        let v = 0;
        for (let i = start[a]!; i < start[a + 1]!; i++) {
          const p = inc[i]!;
          stamp[p] = e;
          v += cost(st, A[p]!, B[p]!);
        }
        if (b >= 0)
          for (let i = start[b]!; i < start[b + 1]!; i++) {
            const p = inc[i]!;
            if (stamp[p] !== e) v += cost(st, A[p]!, B[p]!);
          }
        return v;
      }
      case "roomPair":
        return this.roomPairSum(leaf, a, -1) + (b >= 0 ? this.roomPairSum(leaf, b, a) : 0);
      case "global":
        return leaf.full!(st);
      default:
        return 0;
    }
  }

  /** x と同室の deps の人との組の寄与の和（skip は除く） */
  private roomPairSum(leaf: Leaf, x: number, skip: number): number {
    const { st, ctx } = this;
    const deps = leaf.deps!;
    if (!bitHas(deps, x)) return 0;
    const s = st.seatOf[x]!;
    if (s < 0) return 0;
    const r = ctx.seatRoom[s]!;
    const cost = leaf.pairCost!;
    let v = 0;
    for (let t = ctx.roomStart[r]!; t < ctx.roomStart[r + 1]!; t++) {
      const y = st.memberAt[t]!;
      if (y < 0 || y === x || y === skip || !bitHas(deps, y)) continue;
      v += cost(st, x, y);
    }
    return v;
  }

  /** キャッシュ済み単位の和（移動前） */
  private cachedSum(leaf: Leaf, cache: Float64Array): number {
    if (leaf.kind === "room") {
      let v = cache[this.rb]!;
      if (this.ra >= 0 && this.ra !== this.rb) v += cache[this.ra]!;
      return v;
    }
    let v = 0;
    const units = this.seatUnits;
    for (let i = 0; i < this.nSeatUnits; i++) v += cache[units[i]!]!;
    return v;
  }

  private updateUnit(li: number, leaf: Leaf, cache: Float64Array, u: number): number {
    const nv = this.unitPart(leaf, u);
    const k = this.nLog++;
    this.logLeaf[k] = li;
    this.logUnit[k] = u;
    this.logVal[k] = cache[u]!;
    cache[u] = nv;
    return nv;
  }

  /** キャッシュ済み単位を再計算して書き込み（移動後）、和を返す */
  private refreshUnits(li: number, leaf: Leaf, cache: Float64Array): number {
    if (leaf.kind === "room") {
      let v = this.updateUnit(li, leaf, cache, this.rb);
      if (this.ra >= 0 && this.ra !== this.rb) v += this.updateUnit(li, leaf, cache, this.ra);
      return v;
    }
    let v = 0;
    for (let i = 0; i < this.nSeatUnits; i++)
      v += this.updateUnit(li, leaf, cache, this.seatUnits[i]!);
    return v;
  }

  private addLeaves(m: number, epoch: number) {
    const touched = this.touchedLeaves;
    for (let i = this.memLeafStart[m]!; i < this.memLeafStart[m + 1]!; i++) {
      const l = this.memLeafList[i]!;
      if (this.leafStamp[l] !== epoch) {
        this.leafStamp[l] = epoch;
        touched[this.nTouched++] = l;
      }
    }
  }

  private addSeatUnit(s: number, epoch: number) {
    if (s < 0) return;
    const { ctx } = this;
    if (this.seatStamp[s] !== epoch) {
      this.seatStamp[s] = epoch;
      this.seatUnits[this.nSeatUnits++] = s;
    }
    for (let i = ctx.adjStart[s]!; i < ctx.adjStart[s + 1]!; i++) {
      const t = ctx.adjList[i]!;
      if (this.seatStamp[t] !== epoch) {
        this.seatStamp[t] = epoch;
        this.seatUnits[this.nSeatUnits++] = t;
      }
    }
  }

  private apply(a: number, b: number, from: number, to: number) {
    const { st } = this;
    st.seatOf[a] = to;
    st.memberAt[to] = a;
    if (b >= 0) {
      st.seatOf[b] = from;
      if (from >= 0) st.memberAt[from] = b;
    } else if (from >= 0) st.memberAt[from] = -1;
  }

  /**
   * a を席 sb に動かす（sb の住人 b は a の元の席へ）。状態を書き換え、目的関数の差分を返す。
   * 続けて必ず accept() か reject() を呼ぶこと。
   */
  propose(a: number, sb: number): number {
    const { st, ctx, model } = this;
    const sa = st.seatOf[a]!;
    const b = st.memberAt[sb]!;
    this.a = a;
    this.b = b;
    this.sa = sa;
    this.sb = sb;
    this.ra = sa >= 0 ? ctx.seatRoom[sa]! : -1;
    this.rb = ctx.seatRoom[sb]!;
    this.oldScore = this.score;
    this.oldHard = this.hard;
    this.nLog = 0;
    this.nTerms = 0;
    this.nTouched = 0;

    // 影響する葉
    const touched = this.touchedLeaves;
    const le = ++this.epoch;
    this.addLeaves(a, le);
    if (b >= 0) this.addLeaves(b, le);
    if (this.nTouched === 0) {
      this.apply(a, b, sa, sb);
      return 0;
    }

    // 隣接単位（動いた席とその隣）
    this.nSeatUnits = 0;
    const se = ++this.epoch;
    this.addSeatUnit(sa, se);
    this.addSeatUnit(sb, se);

    const old = this.oldLeafVal;
    const before = this.before;
    const n = this.nTouched;
    for (let i = 0; i < n; i++) {
      const l = touched[i]!;
      old[i] = this.leafVal[l]!;
      const cache = this.unitCache[l];
      const leaf = model.leaves[l]!;
      before[i] = cache ? this.cachedSum(leaf, cache) : this.localSum(leaf);
    }
    this.apply(a, b, sa, sb);
    for (let i = 0; i < n; i++) {
      const l = touched[i]!;
      const cache = this.unitCache[l];
      const leaf = model.leaves[l]!;
      const after = cache ? this.refreshUnits(l, leaf, cache) : this.localSum(leaf);
      this.leafVal[l] = old[i]! + after - before[i]!;
    }

    // 影響する項
    const tt = this.touchedTerms;
    const ot = this.oldTermVal;
    const te = ++this.epoch;
    let delta = 0;
    for (let i = 0; i < n; i++) {
      const lts = this.leafTerms[touched[i]!]!;
      for (let j = 0; j < lts.length; j++) {
        const ti = lts[j]!;
        if (this.termStamp[ti] === te) continue;
        this.termStamp[ti] = te;
        const t = model.terms[ti]!;
        const prev = this.termVal[ti]!;
        const next = nodeValue(t.node, this.leafVal);
        tt[this.nTerms] = ti;
        ot[this.nTerms++] = prev;
        if (next !== prev) {
          this.termVal[ti] = next;
          delta += t.weight * (next - prev);
          if (t.hard) this.hard += next - prev;
        }
      }
    }
    this.score += delta;
    return delta;
  }

  accept(): void {
    // 状態は propose で確定済み
  }

  reject(): void {
    const { a, b, sa, sb, st } = this;
    // 逆操作: a を sa へ、b を sb へ
    if (sa >= 0) {
      st.seatOf[a] = sa;
      st.memberAt[sa] = a;
    } else st.seatOf[a] = -1;
    if (b >= 0) {
      st.seatOf[b] = sb;
      st.memberAt[sb] = b;
    } else st.memberAt[sb] = -1;
    for (let i = this.nLog - 1; i >= 0; i--)
      this.unitCache[this.logLeaf[i]!]![this.logUnit[i]!] = this.logVal[i]!;
    for (let i = 0; i < this.nTouched; i++)
      this.leafVal[this.touchedLeaves[i]!] = this.oldLeafVal[i]!;
    for (let i = 0; i < this.nTerms; i++) this.termVal[this.touchedTerms[i]!] = this.oldTermVal[i]!;
    this.score = this.oldScore;
    this.hard = this.oldHard;
  }
}

/** 違反を ID ベースの公開形式にする */
export function reportViolations(
  model: Model,
  st: State,
  leafVal: ArrayLike<number>,
  termVal: ArrayLike<number>,
): Violation[] {
  const { ctx } = model;
  return model.terms.map((t, i) => {
    const v = termVal[i]!;
    const sink: CulpritSink = { members: new Set(), seats: new Set() };
    if (v > 0) nodeCulprits(model, t.node, st, leafVal, sink);
    const out: Violation = {
      strength: t.hard ? "hard" : "soft",
      weight: t.weight,
      violation: round(v),
      score: round(v * t.weight),
      memberIds: [...sink.members].sort((x, y) => x - y).map((m) => ctx.memberIds[m]!),
      seatIds: [...sink.seats].sort((x, y) => x - y).map((s) => ctx.seatIds[s]!),
    };
    if (t.ruleId !== undefined) out.ruleId = t.ruleId;
    if (t.presetId !== undefined) out.presetId = t.presetId;
    return out;
  });
}

/** 浮動小数の表示用丸め（1e-6） */
export const round = (x: number) => Math.round(x * 1e6) / 1e6;

/** 状態を全評価して公開形式の違反一覧（違反 0 も含む）を返す */
export function evaluateModel(
  model: Model,
  st: State,
): { breakdown: Violation[]; score: number; hard: number } {
  const ev = new IncrementalEvaluator(model, st);
  return {
    breakdown: reportViolations(model, st, ev.leafVal, ev.termVal),
    score: round(ev.score),
    hard: round(ev.hard),
  };
}
