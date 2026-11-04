/**
 * localStorage の薄い抽象化。docs/DESIGN.md §8
 * テストや localStorage が使えない環境ではインメモリ実装を使う。
 */

export const KEY_PREFIX = "sekigae:v1:";
export const INDEX_KEY = `${KEY_PREFIX}index`;
export const PROJECT_KEY_PREFIX = `${KEY_PREFIX}project:`;
export const CORRUPT_KEY_PREFIX = `${KEY_PREFIX}corrupt:`;

export const projectKey = (id: string) => `${PROJECT_KEY_PREFIX}${id}`;
export const corruptKey = (id: string, timestamp: string) =>
  `${CORRUPT_KEY_PREFIX}${id}:${timestamp}`;

/** localStorage の容量の目安（多くのブラウザで約 5M 文字） */
export const STORAGE_QUOTA_ESTIMATE = 5 * 1024 * 1024;

export interface StorageAdapter {
  readonly kind: "local" | "memory";
  get(key: string): string | null;
  /** 容量超過時は QuotaExceededError をそのまま投げる */
  set(key: string, value: string): void;
  remove(key: string): void;
  /** prefix で始まるキー一覧 */
  list(prefix?: string): string[];
}

export class MemoryStorageAdapter implements StorageAdapter {
  readonly kind = "memory" as const;
  private readonly map = new Map<string, string>();
  /** テスト用: 合計文字数がこれを超えると QuotaExceededError */
  quota: number;
  constructor(quota = Infinity) {
    this.quota = quota;
  }

  get(key: string) {
    return this.map.get(key) ?? null;
  }
  set(key: string, value: string) {
    if (Number.isFinite(this.quota)) {
      let total = key.length + value.length;
      for (const [k, v] of this.map) if (k !== key) total += k.length + v.length;
      if (total > this.quota) throw new DOMException("quota exceeded", "QuotaExceededError");
    }
    this.map.set(key, value);
  }
  remove(key: string) {
    this.map.delete(key);
  }
  list(prefix = "") {
    return [...this.map.keys()].filter((k) => k.startsWith(prefix));
  }
}

export class WebStorageAdapter implements StorageAdapter {
  readonly kind = "local" as const;
  private readonly storage: Storage;
  constructor(storage: Storage) {
    this.storage = storage;
  }

  get(key: string) {
    return this.storage.getItem(key);
  }
  set(key: string, value: string) {
    this.storage.setItem(key, value);
  }
  remove(key: string) {
    this.storage.removeItem(key);
  }
  list(prefix = "") {
    const keys: string[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const k = this.storage.key(i);
      if (k !== null && k.startsWith(prefix)) keys.push(k);
    }
    return keys;
  }
}

/** localStorage が読み書きできるか（プライベートモード・無効化・iframe 制限等） */
export function isLocalStorageAvailable(): boolean {
  try {
    const k = "__sekigae_probe__";
    localStorage.setItem(k, "1");
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

/** 使える方の adapter を返す */
export function createDefaultAdapter(): StorageAdapter {
  return isLocalStorageAvailable()
    ? new WebStorageAdapter(localStorage)
    : new MemoryStorageAdapter();
}

export function isQuotaExceeded(e: unknown): boolean {
  if (!(e instanceof DOMException) && !(e instanceof Error)) return false;
  const name = (e as { name?: string }).name;
  const code = (e as { code?: number }).code;
  return (
    name === "QuotaExceededError" ||
    name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    code === 22 ||
    code === 1014
  );
}

/** sekigae のキーが使っている文字数（キー + 値） */
export function storageUsage(adapter: StorageAdapter): { used: number; ratio: number } {
  let used = 0;
  for (const k of adapter.list("sekigae:")) used += k.length + (adapter.get(k)?.length ?? 0);
  return { used, ratio: used / STORAGE_QUOTA_ESTIMATE };
}
