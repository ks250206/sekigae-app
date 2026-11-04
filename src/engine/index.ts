/**
 * 配置エンジンの公開 API（React 非依存）。docs/DESIGN.md §4.4, §5, §6
 *
 * - 評価: {@link evaluatePlan} / {@link createPlanEvaluator}（違反パネル・ライブ更新）
 * - 実行可能性: {@link checkFeasibility}（ルール画面のインジケータ）
 * - 求解: {@link createSolverClient}（Worker、進捗・中断）/ {@link solve}（同期）
 * - プリセット: {@link PRESET_IDS} / {@link presetToRuleBlocks}（「ルールとして保存」）
 * - 差分: {@link diffAssignments}（適用前の移動人数）
 *
 * 文言は持たない。{@link Diagnostic} の code + params を UI で翻訳する（コード一覧は types.ts）。
 */
export type {
  Diagnostic,
  DiagnosticCode,
  DiagnosticParam,
  DiagnosticSeverity,
  FeasibilityResult,
  PresetId,
  PresetSpec,
  SolveInput,
  SolveOptions,
  SolveProgress,
  SolveResult,
  SolveScope,
  StopReason,
  Violation,
} from "./types";
export { checkFeasibility } from "./feasibility";
export {
  createPlanEvaluator,
  evaluate,
  evaluatePlan,
  stateFromAssignment,
  type BlockEvaluation,
  type PlanEvaluation,
  type PlanEvaluator,
} from "./evaluate";
export { solve, solveAsync, DEFAULT_TIME_LIMIT_MS, type SolveHooks } from "./solver";
export {
  createSolverClient,
  SolveCancelledError,
  type SolverClient,
  type SolverClientOptions,
} from "./client";
export {
  DEFAULT_PRESET,
  PRESET_DEFAULT_WEIGHT,
  PRESET_IDS,
  PRESET_NEEDS_PREVIOUS,
  presetToRuleBlocks,
} from "./presets";
export { diffAssignments, type AssignmentDiff } from "./diff";
export { buildContext, type EngineContext, type BuildContextOptions } from "./context";
export { HARD_WEIGHT, type State } from "./model";
