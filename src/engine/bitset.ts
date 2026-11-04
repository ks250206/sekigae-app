/**
 * 固定長ビットセット（Uint32Array）。条件式のコンパイル結果やドメイン（許容席集合）に使う。
 * すべて純関数。長さ（ビット数）は呼び出し側が管理する。
 */
export type Bitset = Uint32Array;

export const wordsFor = (n: number) => (n + 31) >>> 5;

export function bitsetEmpty(n: number): Bitset {
  return new Uint32Array(wordsFor(n));
}

export function bitsetFull(n: number): Bitset {
  const b = new Uint32Array(wordsFor(n)).fill(0xffffffff);
  trimTail(b, n);
  return b;
}

export function bitsetFrom(n: number, indices: Iterable<number>): Bitset {
  const b = bitsetEmpty(n);
  for (const i of indices) if (i >= 0 && i < n) bitSet(b, i);
  return b;
}

function trimTail(b: Bitset, n: number) {
  const r = n & 31;
  if (r !== 0 && b.length > 0) b[b.length - 1]! &= (1 << r) - 1;
}

export const bitHas = (b: Bitset, i: number): boolean => ((b[i >>> 5]! >>> (i & 31)) & 1) === 1;

export function bitSet(b: Bitset, i: number): void {
  b[i >>> 5]! |= 1 << (i & 31);
}

export function bitClear(b: Bitset, i: number): void {
  b[i >>> 5]! &= ~(1 << (i & 31));
}

export function bitsetAnd(a: Bitset, b: Bitset): Bitset {
  const out = new Uint32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i]! & b[i]!;
  return out;
}

export function bitsetOr(a: Bitset, b: Bitset): Bitset {
  const out = new Uint32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i]! | b[i]!;
  return out;
}

/** a ∖ b */
export function bitsetDiff(a: Bitset, b: Bitset): Bitset {
  const out = new Uint32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i]! & ~b[i]!;
  return out;
}

/** n ビットの補集合 */
export function bitsetNot(a: Bitset, n: number): Bitset {
  const out = new Uint32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = ~a[i]!;
  trimTail(out, n);
  return out;
}

/** a &= b（破壊的） */
export function bitsetAndInPlace(a: Bitset, b: Bitset): void {
  for (let i = 0; i < a.length; i++) a[i]! &= b[i]!;
}

/** a &= ~b（破壊的） */
export function bitsetDiffInPlace(a: Bitset, b: Bitset): void {
  for (let i = 0; i < a.length; i++) a[i]! &= ~b[i]!;
}

function popcount32(x: number): number {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  x = (x + (x >>> 4)) & 0x0f0f0f0f;
  return Math.imul(x, 0x01010101) >>> 24;
}

export function bitsetCount(a: Bitset): number {
  let c = 0;
  for (let i = 0; i < a.length; i++) c += popcount32(a[i]!);
  return c;
}

export function bitsetIsEmpty(a: Bitset): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== 0) return false;
  return true;
}

export function bitsetEquals(a: Bitset, b: Bitset): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** 立っているビットの添字（昇順） */
export function bitsetToArray(a: Bitset): number[] {
  const out: number[] = [];
  for (let w = 0; w < a.length; w++) {
    let x = a[w]!;
    while (x !== 0) {
      const t = x & -x;
      out.push((w << 5) + (31 - Math.clz32(t)));
      x ^= t;
    }
  }
  return out;
}
