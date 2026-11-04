/**
 * 保存データのスキーマバージョン管理。
 * `migrations[n]` は version n のデータを n+1 に変換する。
 * 形式を変えたら SCHEMA_VERSION を上げ、ここに変換関数とテストを追加する。
 */
import type { z } from "zod";
import { projectSchema, SCHEMA_VERSION, type Project } from "@/domain/schema";

type Json = Record<string, unknown>;
export type Migration = (data: Json) => Json;
export type MigrationMap = Readonly<Record<number, Migration>>;

export const migrations: MigrationMap = {
  // 例: 1: (d) => ({ ...d, schemaVersion: 2, newField: [] }),
};

export class FutureVersionError extends Error {
  readonly version: number;
  readonly supported: number;
  constructor(version: number, supported: number) {
    super(`schemaVersion ${version} is newer than supported ${supported}`);
    this.name = "FutureVersionError";
    this.version = version;
    this.supported = supported;
  }
}

export class InvalidDataError extends Error {
  readonly issues: string[];
  constructor(message: string, issues: string[] = []) {
    super(message);
    this.name = "InvalidDataError";
    this.issues = issues;
  }
}

const isObject = (x: unknown): x is Json =>
  typeof x === "object" && x !== null && !Array.isArray(x);

/** バージョンを target まで逐次上げる（検証はしない） */
export function migrate(
  raw: unknown,
  opts: { migrations?: MigrationMap; target?: number } = {},
): Json {
  const map = opts.migrations ?? migrations;
  const target = opts.target ?? SCHEMA_VERSION;
  if (!isObject(raw)) throw new InvalidDataError("not an object");
  const v = raw.schemaVersion;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1)
    throw new InvalidDataError("missing schemaVersion", ["schemaVersion: missing or invalid"]);
  if (v > target) throw new FutureVersionError(v, target);
  let data = raw;
  for (let cur = v; cur < target; cur++) {
    const step = map[cur];
    if (!step) throw new InvalidDataError(`no migration from version ${cur}`);
    data = { ...step(data), schemaVersion: cur + 1 };
  }
  return data;
}

/** zod のエラーを「どのフィールドが不正か」が分かる文字列に */
export function formatZodIssues(error: z.ZodError, max = 8): string[] {
  const lines = error.issues.slice(0, max).map((i) => {
    const path = i.path.length ? i.path.map(String).join(".") : "(root)";
    return `${path}: ${i.message}`;
  });
  if (error.issues.length > max) lines.push(`… +${error.issues.length - max}`);
  return lines;
}

/** マイグレーション + zod 検証して Project にする */
export function parseProject(raw: unknown, opts?: { migrations?: MigrationMap; target?: number }) {
  const migrated = migrate(raw, opts);
  const r = projectSchema.safeParse(migrated);
  if (!r.success) throw new InvalidDataError("invalid project", formatZodIssues(r.error));
  return r.data as Project;
}
