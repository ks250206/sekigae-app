/**
 * ソルバーのクライアント（#110）。Worker（comlink）で実行し、Worker が使えない環境
 * （テスト・SSR）ではメインスレッドで分割実行する。
 *
 * - solve() を呼ぶと実行中の solve() は中断され、その Promise は SolveCancelledError で reject される。
 * - cancel() も同様に実行中の Promise を reject する。
 */
import * as Comlink from "comlink";
import { solveAsync } from "./solver";
import type { SolveInput, SolveProgress, SolveResult } from "./types";
import type { SolverWorkerApi } from "./worker";

export class SolveCancelledError extends Error {
  constructor() {
    super("solve cancelled");
    this.name = "SolveCancelledError";
  }
}

export interface SolverClient {
  /** 実行（進捗は約 100ms ごと）。新しい呼び出しは前の実行を中断する */
  solve(input: SolveInput, onProgress?: (p: SolveProgress) => void): Promise<SolveResult>;
  /** 実行中なら中断する */
  cancel(): void;
  /** Worker を破棄する */
  dispose(): void;
}

export interface SolverClientOptions {
  /** Worker の生成方法（テスト用に差し替え可能）。null を返すとメインスレッドで実行 */
  createWorker?: () => Worker | null;
}

function defaultCreateWorker(): Worker | null {
  if (typeof Worker === "undefined") return null;
  try {
    return new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  } catch {
    return null;
  }
}

export function createSolverClient(opts: SolverClientOptions = {}): SolverClient {
  const create = opts.createWorker ?? defaultCreateWorker;
  let worker: Worker | null | undefined;
  let remote: Comlink.Remote<SolverWorkerApi> | null = null;
  let runId = 0;
  let localAbort: AbortController | null = null;
  let pendingReject: ((e: Error) => void) | null = null;

  const ensure = () => {
    if (worker === undefined) {
      worker = create();
      remote = worker ? Comlink.wrap<SolverWorkerApi>(worker) : null;
    }
    return remote;
  };

  const cancel = () => {
    runId++;
    localAbort?.abort();
    localAbort = null;
    if (remote) void remote.cancel();
    pendingReject?.(new SolveCancelledError());
    pendingReject = null;
  };

  return {
    solve(input, onProgress) {
      cancel();
      const id = runId;
      const r = ensure();
      return new Promise<SolveResult>((resolve, reject) => {
        pendingReject = reject;
        const progress = (p: SolveProgress) => {
          if (id === runId) onProgress?.(p);
        };
        const done = (res: SolveResult) => {
          if (id !== runId) return;
          pendingReject = null;
          resolve(res);
        };
        const fail = (e: unknown) => {
          if (id !== runId) return;
          pendingReject = null;
          reject(e instanceof Error ? e : new Error(String(e)));
        };
        if (r) {
          r.solve(input, onProgress ? Comlink.proxy(progress) : undefined).then(done, fail);
        } else {
          const ctrl = new AbortController();
          localAbort = ctrl;
          solveAsync(input, { signal: ctrl.signal, onProgress: progress }).then(done, fail);
        }
      });
    },
    cancel,
    dispose() {
      cancel();
      if (remote) remote[Comlink.releaseProxy]();
      worker?.terminate();
      worker = undefined;
      remote = null;
    },
  };
}
