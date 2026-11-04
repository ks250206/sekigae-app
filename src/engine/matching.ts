/**
 * 二部マッチング（Hopcroft–Karp）と Hall の定理の違反集合の抽出（#105）。
 * 左 = メンバー（添字 0..nLeft-1）、右 = 席（0..nRight-1）。
 */

export interface Matching {
  /** 左 → 右（未マッチ -1） */
  matchL: Int32Array;
  /** 右 → 左（未マッチ -1） */
  matchR: Int32Array;
  size: number;
}

/**
 * 最大マッチング。initial を渡すとそこから増加路で拡張する（初期解の補修に使う）。
 * adj の並び順で結果が決まる（乱数で並べ替えれば別の最大マッチングになる）。
 */
export function hopcroftKarp(
  adj: ArrayLike<number>[],
  nRight: number,
  initial?: { matchL: Int32Array; matchR: Int32Array },
): Matching {
  const nLeft = adj.length;
  const matchL = initial ? initial.matchL.slice() : new Int32Array(nLeft).fill(-1);
  const matchR = initial ? initial.matchR.slice() : new Int32Array(nRight).fill(-1);
  const INF = 0x3fffffff;
  const dist = new Int32Array(nLeft);
  const it = new Int32Array(nLeft);
  const queue = new Int32Array(nLeft);

  const bfs = (): boolean => {
    let qh = 0;
    let qt = 0;
    for (let u = 0; u < nLeft; u++) {
      if (matchL[u] === -1) {
        dist[u] = 0;
        queue[qt++] = u;
      } else dist[u] = INF;
    }
    let found = false;
    while (qh < qt) {
      const u = queue[qh++]!;
      const nb = adj[u]!;
      for (let i = 0; i < nb.length; i++) {
        const w = matchR[nb[i]!]!;
        if (w < 0) found = true;
        else if (dist[w] === INF) {
          dist[w] = dist[u]! + 1;
          queue[qt++] = w;
        }
      }
    }
    return found;
  };

  const dfs = (u: number): boolean => {
    const nb = adj[u]!;
    for (; it[u]! < nb.length; it[u]!++) {
      const v = nb[it[u]!]!;
      const w = matchR[v]!;
      if (w < 0 || (dist[w] === dist[u]! + 1 && dfs(w))) {
        matchL[u] = v;
        matchR[v] = u;
        it[u]!++;
        return true;
      }
    }
    dist[u] = INF;
    return false;
  };

  while (bfs()) {
    it.fill(0);
    for (let u = 0; u < nLeft; u++) if (matchL[u] === -1) dfs(u);
  }
  let size = 0;
  for (let u = 0; u < nLeft; u++) if (matchL[u]! >= 0) size++;
  return { matchL, matchR, size };
}

/**
 * 最大マッチングで未マッチの左頂点 root から交互路で到達できる集合。
 * S（左）と N(S)（右）は |N(S)| = |S| − 1 < |S| を満たす（Hall の条件の違反）。
 */
export function hallViolator(
  adj: ArrayLike<number>[],
  m: Matching,
  root: number,
): { left: number[]; right: number[] } {
  const seenL = new Set<number>([root]);
  const seenR = new Set<number>();
  const queue = [root];
  for (let qi = 0; qi < queue.length; qi++) {
    const u = queue[qi]!;
    const nb = adj[u]!;
    for (let i = 0; i < nb.length; i++) {
      const v = nb[i]!;
      if (seenR.has(v)) continue;
      seenR.add(v);
      const w = m.matchR[v]!;
      if (w >= 0 && !seenL.has(w)) {
        seenL.add(w);
        queue.push(w);
      }
    }
  }
  return {
    left: [...seenL].sort((a, b) => a - b),
    right: [...seenR].sort((a, b) => a - b),
  };
}
