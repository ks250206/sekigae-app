import { describe, expect, it } from "vite-plus/test";
import { createRng, formatSeed, parseSeed } from "./rng";

describe("rng", () => {
  it("is deterministic for the same seed", () => {
    const a = createRng(42);
    const b = createRng(42);
    const xs = Array.from({ length: 10 }, () => a.next());
    const ys = Array.from({ length: 10 }, () => b.next());
    expect(xs).toEqual(ys);
    expect(createRng(43).next()).not.toBe(xs[0]);
  });

  it("shuffles deterministically and keeps elements", () => {
    const s1 = createRng(7).shuffle([1, 2, 3, 4, 5, 6, 7, 8]);
    const s2 = createRng(7).shuffle([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(s1).toEqual(s2);
    expect([...s1].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("int stays in range", () => {
    const r = createRng(1);
    for (let i = 0; i < 1000; i++) {
      const v = r.int(5);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(5);
    }
  });

  it("formats and parses seeds", () => {
    for (const seed of [0, 1, 42, 123456789, 2 ** 32 - 1]) {
      expect(parseSeed(formatSeed(seed))).toBe(seed);
    }
    expect(parseSeed("ab-c")).toBeNull();
  });
});
