/**
 * シード付き擬似乱数 (mulberry32)。同一シード → 同一系列。
 * Worker / メインスレッドの両方で使える純関数実装。
 */
export interface Rng {
  readonly seed: number;
  /** [0, 1) */
  next(): number;
  /** [0, n) の整数 */
  int(n: number): number;
  pick<T>(arr: readonly T[]): T;
  /** 破壊的 Fisher–Yates シャッフル。配列自体を返す */
  shuffle<T>(arr: T[]): T[];
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n: number) => Math.floor(next() * n);
  return {
    seed: seed >>> 0,
    next,
    int,
    pick: <T>(arr: readonly T[]) => {
      if (arr.length === 0) throw new Error("pick from empty array");
      return arr[int(arr.length)] as T;
    },
    shuffle: <T>(arr: T[]) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = int(i + 1);
        const tmp = arr[i] as T;
        arr[i] = arr[j] as T;
        arr[j] = tmp;
      }
      return arr;
    },
  };
}

const SEED_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // 紛らわしい文字を除外 (32 文字)

/** ランダムなシード (32bit) */
export function randomSeed(): number {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    return crypto.getRandomValues(new Uint32Array(1))[0]! >>> 0;
  }
  return Math.floor(Math.random() * 2 ** 32) >>> 0;
}

/** シード ⇔ 表示用の短い文字列 (7 文字, 5bit/文字) */
export function formatSeed(seed: number): string {
  let n = seed >>> 0;
  let s = "";
  for (let i = 0; i < 7; i++) {
    s = SEED_ALPHABET[n & 31] + s;
    n = Math.floor(n / 32);
  }
  return s;
}

export function parseSeed(text: string): number | null {
  const s = text.trim().toUpperCase();
  if (!/^[2-9A-HJ-NP-Z]{1,7}$/.test(s)) return null;
  let n = 0;
  for (const ch of s) n = n * 32 + SEED_ALPHABET.indexOf(ch);
  return n >>> 0;
}
