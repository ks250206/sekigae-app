/**
 * エンジンの公開型。UI はここ（`@/engine` 経由）の型だけを使う。
 * 文言はエンジンに持たせず、`Diagnostic.code` + `params` を UI 側で翻訳する。
 */
import type { ID, Project } from "@/domain/schema";
import type { Strength } from "@/domain/rules";

// ---------------------------------------------------------------------------
// 診断
// ---------------------------------------------------------------------------

/**
 * 診断コード一覧（UI 翻訳キーの元）。params の中身はコードごとに固定:
 *
 * | code                      | severity | params |
 * | ------------------------- | -------- | ------ |
 * | `danglingMember`          | warning  | `ruleId`, `id` — ルールが削除済みメンバーを参照 |
 * | `danglingSeat`            | warning  | `ruleId`, `id` — 削除済み席を参照 |
 * | `danglingRoom`            | warning  | `ruleId`, `id` — 削除済み部屋を参照 |
 * | `danglingLab`             | warning  | `ruleId`, `id` — 削除済み研究室を参照 |
 * | `incompleteRule`          | warning  | `ruleId` — 未入力スロットがあり評価対象外 |
 * | `softOnlyAsHard`          | info     | `ruleId` — soft 専用ブロックが必須指定（soft として扱う） |
 * | `noPreviousPlan`          | warning  | `ruleId` — 昨年度ルールだが昨年度の案が無い |
 * | `unknownPlan`             | error    | `planId` — 指定した案が存在しない |
 * | `danglingLock`            | info     | `seatId` — ロック席が存在しない（無視） |
 * | `notEnoughSeats`          | error    | `members`, `seats` — 人数に対して使える席が足りない |
 * | `emptyDomain`             | error    | `memberId`, `ruleIds` — その人が座れる席が 1 つも無い |
 * | `seatConflict`            | error    | `seatId`, `memberIds`, `ruleIds` — 複数人が同じ 1 席に固定 |
 * | `restrictedSeatsShortage` | error    | `people`, `seats`, `memberIds`, `seatIds`, `ruleIds` — 制限で座れる席が人数より少ない（Hall 違反集合） |
 */
export type DiagnosticCode =
  | "danglingMember"
  | "danglingSeat"
  | "danglingRoom"
  | "danglingLab"
  | "incompleteRule"
  | "softOnlyAsHard"
  | "noPreviousPlan"
  | "unknownPlan"
  | "danglingLock"
  | "notEnoughSeats"
  | "emptyDomain"
  | "seatConflict"
  | "restrictedSeatsShortage";

export type DiagnosticSeverity = "error" | "warning" | "info";

export type DiagnosticParam = string | number | boolean | string[];

export interface Diagnostic {
  code: DiagnosticCode;
  severity: DiagnosticSeverity;
  /** 関係するルール（1 つに特定できる場合） */
  ruleId?: ID;
  params: Record<string, DiagnosticParam>;
}

// ---------------------------------------------------------------------------
// プリセット
// ---------------------------------------------------------------------------

/** 席配置プリセット。docs/DESIGN.md §6 */
export type PresetId =
  | "seniorBack"
  | "seniorFront"
  | "clusterLab"
  | "clusterRole"
  | "mixRole"
  | "mixLab"
  | "keepPrevious"
  | "movePrevious"
  | "nameOrder"
  | "random";

/** プリセット指定。重みを省略すると既定値 */
export type PresetSpec = PresetId | { id: PresetId; weight?: number };

// ---------------------------------------------------------------------------
// 評価結果
// ---------------------------------------------------------------------------

/** 1 つのルール（またはプリセット項）の評価結果 */
export interface Violation {
  /** ルール由来なら ruleId、プリセット由来なら presetId */
  ruleId?: ID;
  presetId?: PresetId;
  strength: Strength;
  /** 目的関数での重み（hard は HARD_WEIGHT） */
  weight: number;
  /** 違反量（0 = 満たす）。単位はブロックごと（人数・組数など。各評価器の TSDoc 参照） */
  violation: number;
  /** violation × weight */
  score: number;
  /** 違反に関与したメンバー / 席 */
  memberIds: ID[];
  seatIds: ID[];
}

// ---------------------------------------------------------------------------
// ソルバー
// ---------------------------------------------------------------------------

/**
 * 再配置の範囲。
 * - `all`: ロック以外の全員
 * - `rooms`: `roomIds` の部屋に座っている人と未配置者だけを、その部屋の席に再配置（他の部屋は固定）
 * - `unassignedOnly`: 配置済みの人は固定し、未配置者だけを空席に配置
 */
export type SolveScope =
  | { kind: "all" }
  | { kind: "rooms"; roomIds: ID[] }
  | { kind: "unassignedOnly" };

export interface SolveOptions {
  /** 乱数シード（省略時はランダム） */
  seed?: number;
  /** 組み合わせるプリセット（重みは合算） */
  presets?: PresetSpec[];
  scope?: SolveScope;
  /**
   * - `shuffle`（既定）: ランダムな初期解から最適化
   * - `improve`: 現在の配置を初期解に、低温で改善のみ（大きく動かさない）
   */
  mode?: "shuffle" | "improve";
  /** 時間上限（ミリ秒）。既定 1500。上限に達した時点の最良解を返す */
  timeLimitMs?: number;
  /**
   * 焼きなましの反復回数（温度スケジュールの長さ）。既定は問題規模から自動。
   * 時間上限に達しなければ「同じシード ⇒ 同じ結果」が保証される。
   */
  iterations?: number;
}

export interface SolveInput {
  project: Project;
  /** 対象の案（省略時は activePlanId） */
  planId?: ID;
  options?: SolveOptions;
}

export interface SolveProgress {
  elapsedMs: number;
  iterations: number;
  bestScore: number;
  currentScore: number;
  /** 最良解の hard 違反量の合計 */
  hardViolations: number;
}

export type StopReason = "iterations" | "time" | "optimal" | "cancelled" | "nothingToMove";

export interface SolveResult {
  /** 席 ID → メンバー ID（ロック・固定分を含む、案全体の割当） */
  assignment: Record<ID, ID>;
  seed: number;
  /** 目的関数値（小さいほど良い） */
  score: number;
  /** hard ルール違反量の合計（0 なら全必須ルールを満たす） */
  hardViolations: number;
  /** ルール / プリセット項ごとの内訳（違反 0 も含む） */
  breakdown: Violation[];
  /** 残った違反（violation > 0 のもの） */
  violations: Violation[];
  /** 席に座れなかったメンバー */
  unassigned: ID[];
  /** 全員が許容席に座れるか（実行可能性） */
  feasible: boolean;
  diagnostics: Diagnostic[];
  stats: { iterations: number; accepted: number; elapsedMs: number; stoppedBy: StopReason };
}

export interface FeasibilityResult {
  /** 全員（ロック・固定を除く再配置対象者）が許容席に座れるか */
  ok: boolean;
  members: number;
  seats: number;
  /** 最大マッチングで座れる人数（固定者を含む） */
  assignable: number;
  /** 不足理由（error）と参照切れ等（warning/info） */
  diagnostics: Diagnostic[];
}
