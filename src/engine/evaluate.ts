/**
 * 評価の公開 API（UI の違反表示とソルバーで同じ評価器を使う。docs/DESIGN.md §4.4）。
 */
import type { RuleBlock } from "@/domain/rules";
import type { ID, Project } from "@/domain/schema";
import { buildContext, type EngineContext } from "./context";
import { evaluateModel, IncrementalEvaluator } from "./evaluator";
import { dedupeDiagnostics } from "./feasibility";
import {
  buildBlockModel,
  buildModel,
  emptyState,
  nodeCulprits,
  type CulpritSink,
  type Model,
  type State,
} from "./model";
import { presetTerms } from "./presets";
import type { Diagnostic, PresetSpec, Violation } from "./types";

export interface BlockEvaluation {
  /** 違反量（0 = 満たす） */
  violation: number;
  /** 添字ベースの当事者 */
  culprits: { members: number[]; seats: number[] };
}

/** 席 ID → メンバー ID の割当から添字ベースの State を作る（参照切れ・重複は無視） */
export function stateFromAssignment(ctx: EngineContext, assignment: Record<ID, ID>): State {
  const st = emptyState(ctx);
  for (const [sid, mid] of Object.entries(assignment)) {
    const s = ctx.seatIndex.get(sid);
    const m = ctx.memberIndex.get(mid);
    if (s === undefined || m === undefined || st.seatOf[m] !== -1) continue;
    st.seatOf[m] = s;
    st.memberAt[s] = m;
  }
  return st;
}

/**
 * 1 つのブロックを評価する（違反量の定義は model.ts の各ブロックの TSDoc を参照）。
 * 低レベル API（添字ベース）。UI からは evaluatePlan / createPlanEvaluator を使う。
 */
export function evaluate(block: RuleBlock, state: State, ctx: EngineContext): BlockEvaluation {
  const model = buildBlockModel(ctx, block);
  const ev = new IncrementalEvaluator(model, state);
  const sink: CulpritSink = { members: new Set(), seats: new Set() };
  const term = model.terms[0]!;
  const violation = ev.termVal[0]!;
  if (violation > 0) nodeCulprits(model, term.node, state, ev.leafVal, sink);
  return {
    violation,
    culprits: {
      members: [...sink.members].sort((a, b) => a - b),
      seats: [...sink.seats].sort((a, b) => a - b),
    },
  };
}

export interface PlanEvaluation {
  /** ルール（＋プリセット項）ごとの評価（違反 0 も含む、ルールの並び順） */
  breakdown: Violation[];
  /** violation > 0 のもの */
  violations: Violation[];
  score: number;
  hardViolations: number;
  /** 参照切れ・未入力などの警告 */
  diagnostics: Diagnostic[];
}

export interface PlanEvaluator {
  readonly ctx: EngineContext;
  /** 任意の割当を評価（ドラッグ中のプレビューなど） */
  evaluate(assignment: Record<ID, ID>): PlanEvaluation;
}

/**
 * 割当以外（名簿・レイアウト・ルール・昨年度）をコンパイル済みにした評価器を作る。
 * 手動編集のたびに evaluate(assignment) を呼べばよい（コンパイルはやり直さない）。
 */
export function createPlanEvaluator(
  project: Project,
  planId: ID | null = project.activePlanId,
  opts: { presets?: PresetSpec[] } = {},
): PlanEvaluator {
  const ctx = buildContext(project, planId);
  const model: Model = buildModel(ctx, presetTerms(opts.presets));
  const diagnostics = dedupeDiagnostics([...model.diagnostics, ...model.compiler.diagnostics]);
  return {
    ctx,
    evaluate(assignment) {
      const st = stateFromAssignment(ctx, assignment);
      const { breakdown, score, hard } = evaluateModel(model, st);
      return {
        breakdown,
        violations: breakdown.filter((v) => v.violation > 0),
        score,
        hardViolations: hard,
        diagnostics,
      };
    },
  };
}

/** 案の現在の割当を評価する */
export function evaluatePlan(
  project: Project,
  planId: ID = project.activePlanId,
  opts: { presets?: PresetSpec[] } = {},
): PlanEvaluation {
  const plan = project.plans.find((p) => p.id === planId);
  return createPlanEvaluator(project, planId, opts).evaluate(plan?.assignment ?? {});
}
