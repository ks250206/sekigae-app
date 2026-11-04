/**
 * ソルバー Worker（#110）。comlink で SolverWorkerApi を公開する。
 * solveAsync はチャンクごとにイベントループへ戻るので、実行中でも cancel() が届く。
 * 新しい solve() は実行中のものを中断する。
 */
import * as Comlink from "comlink";
import { solveAsync } from "./solver";
import type { SolveInput, SolveProgress, SolveResult } from "./types";

export interface SolverWorkerApi {
  solve(input: SolveInput, onProgress?: (p: SolveProgress) => void): Promise<SolveResult>;
  cancel(): void;
}

let current: AbortController | null = null;

const api: SolverWorkerApi = {
  async solve(input, onProgress) {
    current?.abort();
    const ctrl = new AbortController();
    current = ctrl;
    try {
      return await solveAsync(input, {
        signal: ctrl.signal,
        onProgress: onProgress ? (p) => onProgress(p) : undefined,
      });
    } finally {
      if (current === ctrl) current = null;
    }
  },
  cancel() {
    current?.abort();
  },
};

Comlink.expose(api);
