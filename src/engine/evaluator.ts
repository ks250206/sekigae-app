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
  private touchedLeaves: number[] = [];
  private oldLeafVal: number[] = [];
  private touchedTerms: number[] = [];
  private oldTermVal: number[] = [];
  private seatUnits: number[] = [];
  private oldScore = 0;
  private oldHard = 0;
  private move = { a: -1, b: -1, sa: -1, sb: -1 };

  constructor(
    readonly model: Model,
    readonly st: State,
  ) {
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
      for (let m = 0; m < ctx.nMembers; m++) if (!leaf.deps || bitHas(leaf.deps, m)) lists[m]!.push(li);
    });
    this.memLeafStart = new Int32Array(ctx.nMembers + 1);
    for (let m = 0; m < ctx.nMembers; m++) this.memLeafStart[m + 1] = this.memLeafStart[m]! + lists[m]!.length;
    this.memLeafList = Int32Array.from(lists.flat());

    this.leafStamp = new Int32Array(leaves.length);
    this.termStamp = new Int32Array(terms.length);
    this.seatStamp = new Int32Array(ctx.nSeats);
    const maxPairs = Math.max(0, ...leaves.map((l) => l.pairA?.length ?? 0));
    this.pairStamp = new Int32Array(maxPairs);
    this.recompute();
  }

  /** 全体を再計算（誤差の蓄積をリセット） */
  recompute(): void {
    const { model, st } = this;
    model.leaves.forEach((leaf, i) => (this.leafVal[i] = leafValue(this.ctx, leaf, st)));
    this.score = 0;
    this.hard = 0;
    model.terms.forEach((t, i) => {
      const v = nodeValue(t.node, this.leafVal);
      this.termVal[i] = v;
      this.score += t.weight * v;
      if (t.hard) this.hard += v;
    });
  }

  private localSum(leaf: Leaf): number {
    const { st, ctx } = this;
    const { a, b, sa, sb } = this.move;
    switch (leaf.kind) {
      case "member":
        return leaf.part!(st, a) + (b >= 0 ? leaf.part!(st, b) : 0);
      case "room": {
        const ra = sa >= 0 ? ctx.seatRoom[sa]! : -1;
        const rb = ctx.seatRoom[sb]!;
        let v = leaf.part!(st, rb);
        if (ra >= 0 && ra !== rb) v += leaf.part!(st, ra);
        return v;
      }
      case "seat": {
        const edge = leaf.edge!;
        let v = 0;
        for (const s of this.seatUnits)
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
      case "global":
        return leaf.full!(st);
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
    this.move.a = a;
    this.move.b = b;
    this.move.sa = sa;
    this.move.sb = sb;
    this.oldScore = this.score;
    this.oldHard = this.hard;

    // 影響する葉
    const touched = this.touchedLeaves;
    touched.length = 0;
    const le = ++this.epoch;
    const addLeaves = (m: number) => {
      for (let i = this.memLeafStart[m]!; i < this.memLeafStart[m + 1]!; i++) {
        const l = this.memLeafList[i]!;
        if (this.leafStamp[l] !== le) {
          this.leafStamp[l] = le;
          touched.push(l);
        }
      }
    };
    addLeaves(a);
    if (b >= 0) addLeaves(b);
    if (touched.length === 0) {
      this.apply(a, b, sa, sb);
      this.touchedTerms.length = 0;
      return 0;
    }

    // 隣接単位（動いた席とその隣）
    const units = this.seatUnits;
    units.length = 0;
    const se = ++this.epoch;
    const addSeatUnit = (s: number) => {
      if (s < 0) return;
      if (this.seatStamp[s] !== se) {
        this.seatStamp[s] = se;
        units.push(s);
      }
      for (let i = ctx.adjStart[s]!; i < ctx.adjStart[s + 1]!; i++) {
        const t = ctx.adjList[i]!;
        if (this.seatStamp[t] !== se) {
          this.seatStamp[t] = se;
          units.push(t);
        }
      }
    };
    addSeatUnit(sa);
    addSeatUnit(sb);

    const old = this.oldLeafVal;
    old.length = touched.length;
    const before: number[] = [];
    for (let i = 0; i < touched.length; i++) {
      const l = touched[i]!;
      old[i] = this.leafVal[l]!;
      before.push(this.localSum(model.leaves[l]!));
    }
    this.apply(a, b, sa, sb);
    for (let i = 0; i < touched.length; i++) {
      const l = touched[i]!;
      this.leafVal[l] = old[i]! + this.localSum(model.leaves[l]!) - before[i]!;
    }

    // 影響する項
    const tt = this.touchedTerms;
    const ot = this.oldTermVal;
    tt.length = 0;
    ot.length = 0;
    const te = ++this.epoch;
    let delta = 0;
    for (const l of touched)
      for (const ti of this.leafTerms[l]!) {
        if (this.termStamp[ti] === te) continue;
        this.termStamp[ti] = te;
        const t = model.terms[ti]!;
        const prev = this.termVal[ti]!;
        const next = nodeValue(t.node, this.leafVal);
        tt.push(ti);
        ot.push(prev);
        if (next !== prev) {
          this.termVal[ti] = next;
          delta += t.weight * (next - prev);
          if (t.hard) this.hard += next - prev;
        }
      }
    this.score += delta;
    return delta;
  }

  accept(): void {
    // 状態は propose で確定済み
  }

  reject(): void {
    const { a, b, sa, sb } = this.move;
    // 逆操作: a を sa へ、b を sb へ
    const { st } = this;
    if (sa >= 0) {
      st.seatOf[a] = sa;
      st.memberAt[sa] = a;
    } else st.seatOf[a] = -1;
    if (b >= 0) {
      st.seatOf[b] = sb;
      st.memberAt[sb] = b;
    } else st.memberAt[sb] = -1;
    for (let i = 0; i < this.touchedLeaves.length; i++)
      this.leafVal[this.touchedLeaves[i]!] = this.oldLeafVal[i]!;
    for (let i = 0; i < this.touchedTerms.length; i++)
      this.termVal[this.touchedTerms[i]!] = this.oldTermVal[i]!;
    this.score = this.oldScore;
    this.hard = this.oldHard;
  }
}

/** 違反を ID ベースの公開形式にする */
export function reportViolations(model: Model, st: State, leafVal: ArrayLike<number>, termVal: ArrayLike<number>): Violation[] {
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
export function evaluateModel(model: Model, st: State): { breakdown: Violation[]; score: number; hard: number } {
  const ev = new IncrementalEvaluator(model, st);
  return {
    breakdown: reportViolations(model, st, ev.leafVal, ev.termVal),
    score: round(ev.score),
    hard: round(ev.hard),
  };
}

