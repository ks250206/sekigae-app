/**
 * ソルバー（#106 初期解, #107 焼きなまし, #109 ロック・部分再配置）。
 *
 * 1. 前処理: コンテキスト → 評価モデル → 許容席（単項 hard ルール・ロック・範囲）
 * 2. 実行可能性チェック（Hopcroft–Karp + Hall 違反集合）
 * 3. 初期解: シード付きランダム貪欲 + マッチング補修（improve は現在の配置から）
 * 4. 焼きなまし: 2 人の入替 / 空席への移動（許容席内のみ・固定者は動かさない）、差分評価
 * 5. 結果: 最良解の割当・内訳・残った違反・シード
 */
import type { ID } from "@/domain/schema";
import { createRng, randomSeed, type Rng } from "@/lib/rng";
import { bitHas } from "./bitset";
import { buildContext, type EngineContext } from "./context";
import { buildDomains, type Domains } from "./domains";
import { evaluateModel, IncrementalEvaluator, round } from "./evaluator";
import { analyzeFeasibility, dedupeDiagnostics } from "./feasibility";
import { hopcroftKarp } from "./matching";
import { buildModel, emptyState, HARD_WEIGHT, type Model, type State } from "./model";
import { presetTerms } from "./presets";
import type { Diagnostic, SolveInput, SolveProgress, SolveResult, StopReason } from "./types";

export const DEFAULT_TIME_LIMIT_MS = 1500;
/** 進捗通知の間隔 */
export const PROGRESS_INTERVAL_MS = 100;

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

export interface Prepared {
  ctx: EngineContext;
  model: Model;
  domains: Domains;
  feasible: boolean;
  diagnostics: Diagnostic[];
}

/** 前処理（コンテキスト・モデル・許容席・実行可能性） */
export function prepare(input: SolveInput): Prepared {
  const { project, options = {} } = input;
  const planId = input.planId ?? project.activePlanId;
  const diagnostics: Diagnostic[] = [];
  if (!project.plans.some((p) => p.id === planId))
    diagnostics.push({ code: "unknownPlan", severity: "error", params: { planId } });
  const ctx = buildContext(project, planId);
  for (const seatId of ctx.danglingLocks)
    diagnostics.push({ code: "danglingLock", severity: "info", params: { seatId } });
  const model = buildModel(ctx, presetTerms(options.presets));
  const domains = buildDomains(ctx, model.compiler, options.scope);
  const feas = analyzeFeasibility(ctx, domains);
  return {
    ctx,
    model,
    domains,
    feasible: feas.ok,
    diagnostics: dedupeDiagnostics([
      ...diagnostics,
      ...feas.diagnostics,
      ...model.diagnostics,
      ...model.compiler.diagnostics,
    ]),
  };
}

/**
 * 初期解（#106）。固定者を置き、再配置対象をランダム順に許容席へ貪欲に置いてから
 * Hopcroft–Karp で最大マッチングまで補修する。席が足りなければ一部は未配置のまま。
 * improve モードでは現在の席が許容席内ならそのまま使う。
 */
export function initialState(ctx: EngineContext, d: Domains, rng: Rng, improve = false): State {
  const st = emptyState(ctx);
  for (let m = 0; m < ctx.nMembers; m++) {
    const s = d.fixed[m]!;
    if (s >= 0) {
      st.seatOf[m] = s;
      st.memberAt[s] = m;
    }
  }
  const order = rng.shuffle(d.free.map((_, i) => i));
  const place = (i: number, s: number) => {
    const m = d.free[i]!;
    st.seatOf[m] = s;
    st.memberAt[s] = m;
  };
  if (improve) {
    const cur = new Int32Array(ctx.nMembers).fill(-1);
    for (let s = 0; s < ctx.nSeats; s++)
      if (ctx.planMemberAt[s]! >= 0) cur[ctx.planMemberAt[s]!] = s;
    for (const i of order) {
      const m = d.free[i]!;
      const s = cur[m]!;
      if (s >= 0 && st.memberAt[s] === -1 && bitHas(d.allowed[m]!, s)) place(i, s);
    }
  }
  for (const i of order) {
    const m = d.free[i]!;
    if (st.seatOf[m]! >= 0) continue;
    const list = d.lists[m]!;
    const start = list.length ? rng.int(list.length) : 0;
    for (let k = 0; k < list.length; k++) {
      const s = list[(start + k) % list.length]!;
      if (st.memberAt[s] === -1) {
        place(i, s);
        break;
      }
    }
  }
  // 補修: 貪欲で座れなかった人を増加路で座らせる（隣接順もシャッフルして再現性のある乱択に）
  const adj = d.free.map((m) => rng.shuffle(Array.from(d.lists[m]!)));
  const matchL = new Int32Array(d.free.length).fill(-1);
  const matchR = new Int32Array(ctx.nSeats).fill(-1);
  d.free.forEach((m, i) => {
    const s = st.seatOf[m]!;
    if (s >= 0) {
      matchL[i] = s;
      matchR[s] = i;
    }
  });
  const mm = hopcroftKarp(adj, ctx.nSeats, { matchL, matchR });
  d.free.forEach((m, i) => {
    const old = st.seatOf[m]!;
    const s = mm.matchL[i]!;
    if (old === s) return;
    if (old >= 0 && st.memberAt[old] === m) st.memberAt[old] = -1;
    st.seatOf[m] = s;
  });
  d.free.forEach((m) => {
    const s = st.seatOf[m]!;
    if (s >= 0) st.memberAt[s] = m;
  });
  return st;
}

/** 反復回数の既定値（再配置対象の人数に比例） */
export function defaultIterations(movable: number): number {
  return Math.min(400_000, 20_000 + 1_200 * movable);
}

export interface SolveHooks {
  onProgress?: (p: SolveProgress) => void;
  /** true を返すと中断（最良解を返す） */
  shouldStop?: () => boolean;
  progressIntervalMs?: number;
}

/** 焼きなましの 1 回の実行。step() を繰り返し呼ぶ（Worker で分割実行できるように） */
export class Annealer {
  readonly seed: number;
  readonly ev: IncrementalEvaluator;
  readonly iterations: number;
  iter = 0;
  accepted = 0;
  best: State;
  bestScore: number;
  bestHard: number;
  stoppedBy: StopReason | null = null;
  private rng: Rng;
  private movable: number[];
  private t0: number;
  private t1: number;
  private startedAt: number;
  private timeLimit: number;

  readonly prep: Prepared;

  constructor(prep: Prepared, input: SolveInput) {
    this.prep = prep;
    const opts = input.options ?? {};
    this.seed = (opts.seed ?? randomSeed()) >>> 0;
    this.rng = createRng(this.seed);
    const { ctx, domains: d, model } = prep;
    const improve = opts.mode === "improve";
    const st = initialState(ctx, d, this.rng, improve);
    this.ev = new IncrementalEvaluator(model, st);
    this.movable = d.free.filter((m) => d.lists[m]!.length > (st.seatOf[m]! >= 0 ? 1 : 0));
    this.iterations = Math.max(
      1,
      Math.floor(opts.iterations ?? defaultIterations(this.movable.length)),
    );
    this.timeLimit = opts.timeLimitMs ?? DEFAULT_TIME_LIMIT_MS;
    this.best = { seatOf: st.seatOf.slice(), memberAt: st.memberAt.slice() };
    this.bestScore = this.ev.score;
    this.bestHard = this.ev.hard;
    this.t0 = this.sampleTemperature() * (improve ? 0.1 : 1);
    this.t1 = Math.max(1e-3, this.t0 * 1e-3);
    if (this.movable.length === 0) this.stoppedBy = "nothingToMove";
    else if (this.bestScore <= 1e-9) this.stoppedBy = "optimal";
    this.startedAt = now();
  }

  /** ランダムな手を 1 つ選ぶ（不正なら -1） */
  /** pick() が選んだ移動先の席 */
  private pickSeat = -1;

  /** ランダムな手を 1 つ選ぶ（動かす人を返し、移動先は pickSeat。不正なら -1） */
  private pick(): number {
    const { st } = this.ev;
    const d = this.prep.domains;
    const a = this.movable[this.rng.int(this.movable.length)]!;
    const list = d.lists[a]!;
    const s = list[this.rng.int(list.length)]!;
    const sa = st.seatOf[a]!;
    if (s === sa) return -1;
    const b = st.memberAt[s]!;
    if (b >= 0) {
      if (d.fixed[b]! >= 0) return -1;
      if (sa >= 0 && !bitHas(d.allowed[b]!, sa)) return -1;
    }
    this.pickSeat = s;
    return a;
  }

  /** 初期温度: ランダムな手の soft 差分の平均の 2 倍 */
  private sampleTemperature(): number {
    if (this.movable.length === 0) return 1;
    let sum = 0;
    let n = 0;
    for (let i = 0; i < 200; i++) {
      const a = this.pick();
      if (a < 0) continue;
      const delta = Math.abs(this.ev.propose(a, this.pickSeat));
      this.ev.reject();
      if (delta > 0 && delta < HARD_WEIGHT / 2) {
        sum += delta;
        n++;
      }
    }
    return n ? (2 * sum) / n : 1;
  }

  get elapsedMs(): number {
    return now() - this.startedAt;
  }

  progress(): SolveProgress {
    return {
      elapsedMs: Math.round(this.elapsedMs),
      iterations: this.iter,
      bestScore: round(this.bestScore),
      currentScore: round(this.ev.score),
      hardViolations: round(this.bestHard),
    };
  }

  /**
   * 最大 budget 回の反復を実行。終了したら true（stoppedBy に理由）。
   * 時間上限・中断の確認は 256 反復ごと。
   */
  step(budget: number, shouldStop?: () => boolean): boolean {
    if (this.stoppedBy) return true;
    const { ev } = this;
    const lnRatio = Math.log(this.t1 / this.t0);
    const end = Math.min(this.iterations, this.iter + budget);
    let temp = this.t0 * Math.exp((lnRatio * this.iter) / this.iterations);
    while (this.iter < end) {
      if ((this.iter & 255) === 0) {
        temp = this.t0 * Math.exp((lnRatio * this.iter) / this.iterations);
        if (shouldStop?.()) {
          this.stoppedBy = "cancelled";
          return true;
        }
        if (this.elapsedMs > this.timeLimit) {
          this.stoppedBy = "time";
          return true;
        }
      }
      this.iter++;
      const a = this.pick();
      if (a < 0) continue;
      const delta = ev.propose(a, this.pickSeat);
      if (delta <= 0 || this.rng.next() < Math.exp(-delta / temp)) {
        ev.accept();
        this.accepted++;
        if (ev.score < this.bestScore - 1e-9) {
          this.bestScore = ev.score;
          this.bestHard = ev.hard;
          this.best.seatOf.set(ev.st.seatOf);
          this.best.memberAt.set(ev.st.memberAt);
          if (this.bestScore <= 1e-9) {
            this.stoppedBy = "optimal";
            return true;
          }
        }
      } else ev.reject();
      // 浮動小数の誤差の蓄積を定期的にリセット
      if ((this.iter & 0xffff) === 0) ev.recompute();
    }
    if (this.iter >= this.iterations) {
      this.stoppedBy = "iterations";
      return true;
    }
    return false;
  }

  result(): SolveResult {
    const { ctx, model } = this.prep;
    const st = this.best;
    const { breakdown, score, hard } = evaluateModel(model, st);
    const assignment: Record<ID, ID> = {};
    const unassigned: ID[] = [];
    for (let s = 0; s < ctx.nSeats; s++) {
      const m = st.memberAt[s]!;
      if (m >= 0) assignment[ctx.seatIds[s]!] = ctx.memberIds[m]!;
    }
    for (let m = 0; m < ctx.nMembers; m++)
      if (st.seatOf[m]! < 0) unassigned.push(ctx.memberIds[m]!);
    return {
      assignment,
      seed: this.seed,
      score,
      hardViolations: hard,
      breakdown,
      violations: breakdown.filter((v) => v.violation > 0),
      unassigned,
      feasible: this.prep.feasible,
      diagnostics: this.prep.diagnostics,
      stats: {
        iterations: this.iter,
        accepted: this.accepted,
        elapsedMs: Math.round(this.elapsedMs),
        stoppedBy: this.stoppedBy ?? "iterations",
      },
    };
  }
}

/**
 * 同期実行のソルバー（Worker 内や テストで使う）。
 * 時間上限に達しなければ、同じ入力・同じシードで同じ結果になる。
 */
export function solve(input: SolveInput, hooks: SolveHooks = {}): SolveResult {
  const ann = new Annealer(prepare(input), input);
  const interval = hooks.progressIntervalMs ?? PROGRESS_INTERVAL_MS;
  let lastReport = 0;
  while (!ann.step(2048, hooks.shouldStop)) {
    if (hooks.onProgress && ann.elapsedMs - lastReport >= interval) {
      lastReport = ann.elapsedMs;
      hooks.onProgress(ann.progress());
    }
  }
  hooks.onProgress?.(ann.progress());
  return ann.result();
}

/**
 * 非同期実行（メインスレッドのフォールバック用）。チャンクごとにイベントループへ制御を返すので、
 * signal で中断できる。中断時は最良解を返す（stats.stoppedBy = "cancelled"）。
 */
export async function solveAsync(
  input: SolveInput,
  hooks: SolveHooks & { signal?: AbortSignal; chunkMs?: number } = {},
): Promise<SolveResult> {
  const ann = new Annealer(prepare(input), input);
  const interval = hooks.progressIntervalMs ?? PROGRESS_INTERVAL_MS;
  const chunkMs = hooks.chunkMs ?? 16;
  const stop = () => hooks.signal?.aborted === true || hooks.shouldStop?.() === true;
  let lastReport = 0;
  for (;;) {
    const chunkStart = now();
    let done = false;
    while (!done && now() - chunkStart < chunkMs) done = ann.step(1024, stop);
    if (hooks.onProgress && (done || ann.elapsedMs - lastReport >= interval)) {
      lastReport = ann.elapsedMs;
      hooks.onProgress(ann.progress());
    }
    if (done) break;
    await new Promise<void>((r) => setTimeout(r, 0));
  }
  return ann.result();
}
