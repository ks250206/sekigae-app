/**
 * プロジェクトの保存・読込（React 非依存）。
 * - `sekigae:v1:index` にプロジェクト一覧メタ
 * - `sekigae:v1:project:<id>` に本体
 */
import { z } from "zod";
import type { Project } from "@/domain/schema";
import { FutureVersionError, InvalidDataError, parseProject } from "./migrations";
import {
  corruptKey,
  INDEX_KEY,
  PROJECT_KEY_PREFIX,
  projectKey,
  type StorageAdapter,
} from "./storage";

export interface ProjectMeta {
  id: string;
  name: string;
  updatedAt: string;
  roomCount: number;
  memberCount: number;
  /** 最後に開いた日時（最近使った順の並び替え用） */
  openedAt?: string;
}

const metaSchema = z.object({
  id: z.string(),
  name: z.string(),
  updatedAt: z.string(),
  roomCount: z.number(),
  memberCount: z.number(),
  openedAt: z.string().optional(),
}) satisfies z.ZodType<ProjectMeta>;

const indexSchema = z.object({ projects: z.array(metaSchema) });

export function metaOf(p: Project, openedAt?: string): ProjectMeta {
  return {
    id: p.id,
    name: p.name,
    updatedAt: p.updatedAt,
    roomCount: p.layout.rooms.length,
    memberCount: p.members.length,
    ...(openedAt ? { openedAt } : {}),
  };
}

/** 最近使った順（開いた日時と更新日時の新しい方） */
export function sortRecent(list: ProjectMeta[]): ProjectMeta[] {
  const key = (m: ProjectMeta) =>
    m.openedAt && m.openedAt > m.updatedAt ? m.openedAt : m.updatedAt;
  return [...list].sort((a, b) => key(b).localeCompare(key(a)));
}

export type LoadResult =
  | { ok: true; project: Project }
  | { ok: false; reason: "missing" }
  | { ok: false; reason: "future"; raw: string; version: number }
  | { ok: false; reason: "corrupt"; raw: string; issues: string[] };

export class ProjectRepository {
  readonly adapter: StorageAdapter;
  constructor(adapter: StorageAdapter) {
    this.adapter = adapter;
  }

  // ---- index -------------------------------------------------------------

  /** 一覧を読む。壊れている・無い場合はプロジェクトキーから再構築する */
  readIndex(): ProjectMeta[] {
    const raw = this.adapter.get(INDEX_KEY);
    if (raw) {
      try {
        const r = indexSchema.safeParse(JSON.parse(raw));
        if (r.success) {
          // 本体が消えているエントリは除き、一覧に無い本体（他タブで作成等）は補う
          const ids = this.projectIds();
          const existing = new Set(ids);
          const list = r.data.projects.filter((m) => existing.has(m.id));
          const listed = new Set(list.map((m) => m.id));
          for (const id of ids) if (!listed.has(id)) list.push(this.fallbackMeta(id));
          return list;
        }
      } catch {
        // fallthrough
      }
    }
    return this.rebuildIndex();
  }

  writeIndex(list: ProjectMeta[]): void {
    this.adapter.set(INDEX_KEY, JSON.stringify({ projects: list }));
  }

  /** 本体キーを走査して一覧を作り直す（読めないものはメタ最小限で載せる） */
  rebuildIndex(): ProjectMeta[] {
    const list = this.projectIds().map((id) => this.fallbackMeta(id));
    try {
      this.writeIndex(list);
    } catch {
      // 書けなくても一覧は返す
    }
    return list;
  }

  private fallbackMeta(id: string): ProjectMeta {
    const r = this.load(id);
    if (r.ok) return metaOf(r.project);
    return { id, name: id, updatedAt: new Date(0).toISOString(), roomCount: 0, memberCount: 0 };
  }

  projectIds(): string[] {
    return this.adapter.list(PROJECT_KEY_PREFIX).map((k) => k.slice(PROJECT_KEY_PREFIX.length));
  }

  has(id: string): boolean {
    return this.adapter.get(projectKey(id)) !== null;
  }

  // ---- project -----------------------------------------------------------

  load(id: string): LoadResult {
    const raw = this.adapter.get(projectKey(id));
    if (raw === null) return { ok: false, reason: "missing" };
    return parseStored(raw);
  }

  /** 本体を保存し、一覧メタを更新する。保存した JSON 文字列を返す */
  save(p: Project, opts: { opened?: boolean } = {}): string {
    const json = JSON.stringify(p);
    this.adapter.set(projectKey(p.id), json);
    this.upsertMeta(p, opts.opened);
    return json;
  }

  upsertMeta(p: Project, opened?: boolean): void {
    const list = this.readIndex();
    const prev = list.find((m) => m.id === p.id);
    const meta = metaOf(p, opened ? new Date().toISOString() : prev?.openedAt);
    const next = prev ? list.map((m) => (m.id === p.id ? meta : m)) : [...list, meta];
    this.writeIndex(next);
  }

  /** 開いた日時だけ更新する */
  touchOpened(id: string): void {
    const list = this.readIndex();
    const t = new Date().toISOString();
    this.writeIndex(list.map((m) => (m.id === id ? { ...m, openedAt: t } : m)));
  }

  remove(id: string): void {
    this.adapter.remove(projectKey(id));
    this.writeIndex(this.readIndex().filter((m) => m.id !== id));
  }

  /** 読めなかったデータを退避キーへコピーし、そのキーを返す */
  quarantine(id: string, raw: string, now = new Date()): string {
    const key = corruptKey(id, now.toISOString().replace(/[:.]/g, "-"));
    this.adapter.set(key, raw);
    return key;
  }
}

/** 保存文字列 → Project（マイグレーション + 検証） */
export function parseStored(raw: string): LoadResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    return { ok: false, reason: "corrupt", raw, issues: [String(e)] };
  }
  try {
    return { ok: true, project: parseProject(json) };
  } catch (e) {
    if (e instanceof FutureVersionError)
      return { ok: false, reason: "future", raw, version: e.version };
    if (e instanceof InvalidDataError)
      return {
        ok: false,
        reason: "corrupt",
        raw,
        issues: e.issues.length ? e.issues : [e.message],
      };
    return { ok: false, reason: "corrupt", raw, issues: [String(e)] };
  }
}
