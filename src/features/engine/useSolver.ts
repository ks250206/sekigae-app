/**
 * ソルバーの React 連携（#111）。Worker で実行し、進捗・中断・結果の適用（1 回の Undo）を扱う。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ID } from "@/domain/schema";
import {
  createSolverClient,
  diffAssignments,
  SolveCancelledError,
  type AssignmentDiff,
  type SolveOptions,
  type SolveProgress,
  type SolveResult,
  type SolverClient,
} from "@/engine";
import { batch, useProjectStore } from "@/store/project";

export type SolverStatus = "idle" | "running" | "done" | "cancelled" | "error";

export interface RunOptions extends SolveOptions {
  /** 対象の案（既定は useSolver の planId → activePlanId） */
  planId?: ID;
  /** 完了時に案へ適用する（既定 true） */
  apply?: boolean;
}

export interface UseSolver {
  status: SolverStatus;
  progress: SolveProgress | null;
  result: SolveResult | null;
  error: Error | null;
  /** 実行（実行中なら前の実行を中断）。中断された場合は null */
  run(options?: RunOptions): Promise<SolveResult | null>;
  cancel(): void;
  /** 結果を案に適用（1 回の Undo にまとめる） */
  apply(result?: SolveResult, planId?: ID): void;
  /** 適用前の差分（移動・新規・外れる人） */
  diff(result?: SolveResult, planId?: ID): AssignmentDiff | null;
}

/** ソルバー結果を案に適用する（1 回の Undo） */
export function applySolveResult(planId: ID, result: SolveResult): void {
  batch(() => useProjectStore.getState().setAssignment(planId, result.assignment, result.seed));
}

export function useSolver(planId?: ID): UseSolver {
  const clientRef = useRef<SolverClient | null>(null);
  const [status, setStatus] = useState<SolverStatus>("idle");
  const [progress, setProgress] = useState<SolveProgress | null>(null);
  const [result, setResult] = useState<SolveResult | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const resultRef = useRef<SolveResult | null>(null);

  useEffect(
    () => () => {
      clientRef.current?.dispose();
      clientRef.current = null;
    },
    [],
  );

  const client = () => (clientRef.current ??= createSolverClient());
  const resolvePlan = useCallback(
    (id?: ID) => id ?? planId ?? useProjectStore.getState().project.activePlanId,
    [planId],
  );

  const apply = useCallback(
    (r?: SolveResult, id?: ID) => {
      const res = r ?? resultRef.current;
      if (res) applySolveResult(resolvePlan(id), res);
    },
    [resolvePlan],
  );

  const diff = useCallback(
    (r?: SolveResult, id?: ID) => {
      const res = r ?? resultRef.current;
      if (!res) return null;
      const pid = resolvePlan(id);
      const plan = useProjectStore.getState().project.plans.find((p) => p.id === pid);
      return diffAssignments(plan?.assignment ?? {}, res.assignment);
    },
    [resolvePlan],
  );

  const run = useCallback(
    async (options: RunOptions = {}) => {
      const { planId: pidOpt, apply: doApply = true, ...solveOptions } = options;
      const pid = resolvePlan(pidOpt);
      const project = useProjectStore.getState().project;
      setStatus("running");
      setProgress(null);
      setError(null);
      try {
        const res = await client().solve(
          { project, planId: pid, options: solveOptions },
          setProgress,
        );
        resultRef.current = res;
        setResult(res);
        setStatus("done");
        if (doApply) applySolveResult(pid, res);
        return res;
      } catch (e) {
        if (e instanceof SolveCancelledError) {
          setStatus((s) => (s === "running" ? "cancelled" : s));
          return null;
        }
        setError(e instanceof Error ? e : new Error(String(e)));
        setStatus("error");
        return null;
      }
    },
    [resolvePlan],
  );

  const cancel = useCallback(() => {
    clientRef.current?.cancel();
    setStatus((s) => (s === "running" ? "cancelled" : s));
  }, []);

  return { status, progress, result, error, run, cancel, apply, diff };
}
