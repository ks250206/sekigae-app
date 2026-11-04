import { describe, expect, it } from "vite-plus/test";
import {
  corruptKey,
  isQuotaExceeded,
  MemoryStorageAdapter,
  projectKey,
  storageUsage,
  WebStorageAdapter,
} from "./storage";

describe("storage adapters", () => {
  it.each([
    ["memory", () => new MemoryStorageAdapter()],
    ["web", () => new WebStorageAdapter(localStorage)],
  ])("%s adapter gets, sets, lists and removes", (_, make) => {
    const a = make();
    a.set("sekigae:v1:project:a", "1");
    a.set("sekigae:v1:project:b", "2");
    a.set("other", "3");
    expect(a.get("sekigae:v1:project:a")).toBe("1");
    expect(a.get("missing")).toBeNull();
    expect(a.list("sekigae:v1:project:").sort()).toEqual([
      "sekigae:v1:project:a",
      "sekigae:v1:project:b",
    ]);
    a.remove("sekigae:v1:project:a");
    expect(a.get("sekigae:v1:project:a")).toBeNull();
  });

  it("memory adapter simulates QuotaExceededError", () => {
    const a = new MemoryStorageAdapter(20);
    a.set("k", "0123456789");
    let err: unknown;
    try {
      a.set("k2", "0123456789abc");
    } catch (e) {
      err = e;
    }
    expect(isQuotaExceeded(err)).toBe(true);
    // 同じキーの上書きは自分の分を差し引いて計算
    a.set("k", "0123456789abcdef");
    expect(a.get("k")).toBe("0123456789abcdef");
  });

  it("does not treat other errors as quota errors", () => {
    expect(isQuotaExceeded(new Error("x"))).toBe(false);
    expect(isQuotaExceeded("QuotaExceededError")).toBe(false);
  });

  it("builds keys and measures usage of sekigae keys only", () => {
    expect(projectKey("p1")).toBe("sekigae:v1:project:p1");
    expect(corruptKey("p1", "2026")).toBe("sekigae:v1:corrupt:p1:2026");
    const a = new MemoryStorageAdapter();
    a.set("sekigae:x", "12345");
    a.set("unrelated", "1234567890");
    expect(storageUsage(a).used).toBe("sekigae:x".length + 5);
    expect(storageUsage(a).ratio).toBeGreaterThan(0);
  });
});
