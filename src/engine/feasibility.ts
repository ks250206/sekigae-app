/**
 * 実行可能性チェック（#105）: 再配置対象の全員が許容席に座れるかを二部マッチングで判定し、
 * 座れない場合は Hall の違反集合から構造化された理由（Diagnostic）を作る。
 */
import type { ID, Project } from "@/domain/schema";
import { buildContext, type EngineContext } from "./context";
import { buildDomains, type Domains } from "./domains";
import { hallViolator, hopcroftKarp, type Matching } from "./matching";
import { buildModel } from "./model";
import type { Diagnostic, FeasibilityResult, SolveScope } from "./types";

/** 1 回のチェックで出す不足理由の上限 */
const MAX_EXPLANATIONS = 5;

export interface FeasibilityAnalysis {
  ok: boolean;
  /** 再配置対象（domains.free の並び）での最大マッチング */
  matching: Matching;
  /** 座れる人数（固定者を含む） */
  assignable: number;
  diagnostics: Diagnostic[];
}

export function analyzeFeasibility(ctx: EngineContext, d: Domains): FeasibilityAnalysis {
  const adj = d.free.map((m) => d.lists[m]!);
  const matching = hopcroftKarp(adj, ctx.nSeats);
  const nFixed = ctx.nMembers - d.free.length;
  const assignable = nFixed + matching.size;
  const diagnostics: Diagnostic[] = [];
  const ok = matching.size === d.free.length;
  if (ok) return { ok, matching, assignable, diagnostics };

  if (d.free.length > d.capacity) {
    diagnostics.push({
      code: "notEnoughSeats",
      severity: "error",
      params: { members: ctx.nMembers, seats: d.capacity + nFixed, totalSeats: ctx.nSeats },
    });
    return { ok, matching, assignable, diagnostics };
  }

  const covered = new Set<number>();
  for (let i = 0; i < d.free.length && diagnostics.length < MAX_EXPLANATIONS; i++) {
    if (matching.matchL[i]! >= 0 || covered.has(i)) continue;
    const { left, right } = hallViolator(adj, matching, i);
    for (const u of left) covered.add(u);
    const members = left.map((u) => d.free[u]!);
    const ruleIds = [...new Set(members.flatMap((m) => d.restrictedBy[m]!))];
    const memberIds = members.map((m) => ctx.memberIds[m]!);
    const seatIds = right.map((s) => ctx.seatIds[s]!);
    if (right.length === 0 && members.length === 1) {
      diagnostics.push({
        code: "emptyDomain",
        severity: "error",
        params: { memberId: memberIds[0]!, ruleIds },
      });
    } else if (right.length === 1) {
      diagnostics.push({
        code: "seatConflict",
        severity: "error",
        params: { seatId: seatIds[0]!, memberIds, ruleIds },
      });
    } else {
      diagnostics.push({
        code: "restrictedSeatsShortage",
        severity: "error",
        params: {
          people: members.length,
          seats: right.length,
          memberIds,
          seatIds,
          ruleIds,
          lockedSeats: d.blockedSeats,
        },
      });
    }
  }
  return { ok, matching, assignable, diagnostics };
}

/**
 * ルール画面のインジケータ用の軽量チェック（UI 側でデバウンスして呼ぶ）。
 * 参照切れなどの警告（warning / info）も diagnostics に含む。
 */
export function checkFeasibility(
  project: Project,
  planId: ID | null = project.activePlanId,
  opts: { scope?: SolveScope } = {},
): FeasibilityResult {
  const ctx = buildContext(project, planId);
  const model = buildModel(ctx);
  const d = buildDomains(ctx, model.compiler, opts.scope);
  const a = analyzeFeasibility(ctx, d);
  return {
    ok: a.ok,
    members: ctx.nMembers,
    seats: ctx.nSeats,
    assignable: a.assignable,
    diagnostics: [
      ...a.diagnostics,
      ...dedupeDiagnostics([...model.diagnostics, ...model.compiler.diagnostics]),
    ],
  };
}

/** 同じ内容の診断をまとめる */
export function dedupeDiagnostics(ds: Diagnostic[]): Diagnostic[] {
  const seen = new Set<string>();
  return ds.filter((d) => {
    const key = JSON.stringify([d.code, d.ruleId, d.params]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
