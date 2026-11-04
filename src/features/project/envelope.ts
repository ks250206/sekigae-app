/**
 * JSON 入出力のファイル形式。
 * `{ app: "sekigae", kind, schemaVersion, exportedAt, data }`
 * - project: Project
 * - layout:  { rooms }
 * - members: { members, labs }
 * - rules:   { rules, refs }（refs は別プロジェクトで名前による ID 対応付けに使う）
 */
import { z } from "zod";
import type { Rule } from "@/domain/rules";
import { ruleSchema } from "@/domain/rules";
import {
  labSchema,
  memberSchema,
  roomSchema,
  SCHEMA_VERSION,
  type Lab,
  type Member,
  type Project,
  type Room,
} from "@/domain/schema";
import {
  formatZodIssues,
  FutureVersionError,
  InvalidDataError,
  migrate,
  parseProject,
} from "@/store/persistence/migrations";

export const APP_ID = "sekigae";
export type EnvelopeKind = "project" | "layout" | "members" | "rules";
export const ENVELOPE_KINDS = ["project", "layout", "members", "rules"] as const;
export type PartialKind = Exclude<EnvelopeKind, "project">;

export interface LayoutData {
  rooms: Room[];
}
export interface MembersData {
  members: Member[];
  labs: Lab[];
}
export interface RuleRefs {
  labs: { id: string; name: string }[];
  rooms: { id: string; name: string }[];
  members: { id: string; name: string }[];
  seats: { id: string; roomName: string; label: string }[];
}
export interface RulesData {
  rules: Rule[];
  refs?: RuleRefs;
}

export interface EnvelopeDataMap {
  project: Project;
  layout: LayoutData;
  members: MembersData;
  rules: RulesData;
}

export interface Envelope<K extends EnvelopeKind = EnvelopeKind> {
  app: typeof APP_ID;
  kind: K;
  schemaVersion: number;
  exportedAt: string;
  data: EnvelopeDataMap[K];
}

export type ParsedImport = {
  [K in EnvelopeKind]: { kind: K; data: EnvelopeDataMap[K] };
}[EnvelopeKind];

export type ImportErrorCode = "notJson" | "notSekigae" | "future" | "invalid";
export class ImportError extends Error {
  readonly code: ImportErrorCode;
  readonly issues: string[];
  readonly version?: number;
  constructor(code: ImportErrorCode, issues: string[] = [], version?: number) {
    super(code);
    this.name = "ImportError";
    this.code = code;
    this.issues = issues;
    this.version = version;
  }
}

// ---------------------------------------------------------------------------
// 書き出し
// ---------------------------------------------------------------------------

export function makeEnvelope<K extends EnvelopeKind>(
  kind: K,
  data: EnvelopeDataMap[K],
  exportedAt = new Date().toISOString(),
): Envelope<K> {
  return { app: APP_ID, kind, schemaVersion: SCHEMA_VERSION, exportedAt, data };
}

export function extractPartial<K extends PartialKind>(p: Project, kind: K): EnvelopeDataMap[K] {
  switch (kind) {
    case "layout":
      return { rooms: p.layout.rooms } as EnvelopeDataMap[K];
    case "members":
      return { members: p.members, labs: p.labs } as EnvelopeDataMap[K];
    default:
      return { rules: p.rules, refs: ruleRefsOf(p) } as EnvelopeDataMap[K];
  }
}

export function ruleRefsOf(p: Project): RuleRefs {
  return {
    labs: p.labs.map((l) => ({ id: l.id, name: l.name })),
    rooms: p.layout.rooms.map((r) => ({ id: r.id, name: r.name })),
    members: p.members.map((m) => ({ id: m.id, name: m.name })),
    seats: p.layout.rooms.flatMap((r) =>
      r.seats.map((s) => ({ id: s.id, roomName: r.name, label: s.label })),
    ),
  };
}

const KIND_SUFFIX: Record<EnvelopeKind, string> = {
  project: "",
  layout: "_layout",
  members: "_members",
  rules: "_rules",
};

/** `<名前>_<日付>.sekigae.json`（部分は `<名前>_layout_<日付>.sekigae.json`） */
export function exportFilename(name: string, kind: EnvelopeKind, date = new Date()): string {
  const safe =
    name
      .replace(/\s+/g, " ")
      .replace(/[\\/:*?"<>|]/g, "_")
      .trim()
      .slice(0, 80) || "sekigae";
  const pad = (n: number) => String(n).padStart(2, "0");
  const d = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `${safe}${KIND_SUFFIX[kind]}_${d}.sekigae.json`;
}

// ---------------------------------------------------------------------------
// 読み込み
// ---------------------------------------------------------------------------

const envelopeHeader = z.object({
  app: z.literal(APP_ID),
  kind: z.enum(ENVELOPE_KINDS),
  schemaVersion: z.number().int().min(1),
  exportedAt: z.string().optional(),
  data: z.unknown(),
});

const layoutDataSchema = z.object({ rooms: z.array(roomSchema) });
const membersDataSchema = z.object({ members: z.array(memberSchema), labs: z.array(labSchema) });
const refsSchema = z.object({
  labs: z.array(z.object({ id: z.string(), name: z.string() })),
  rooms: z.array(z.object({ id: z.string(), name: z.string() })),
  members: z.array(z.object({ id: z.string(), name: z.string() })),
  seats: z.array(z.object({ id: z.string(), roomName: z.string(), label: z.string() })),
});
const rulesDataSchema = z.object({ rules: z.array(ruleSchema) });

const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

/** マイグレーション用に部分データを仮のプロジェクトに埋め込む */
function skeleton(version: number): Record<string, unknown> {
  return {
    schemaVersion: version,
    id: "",
    name: "",
    createdAt: "",
    updatedAt: "",
    labs: [],
    members: [],
    layout: { rooms: [] },
    rules: [],
    plans: [],
    activePlanId: "",
    settings: { adjacency: 4 },
  };
}

function rethrow(e: unknown, prefix: string): never {
  if (e instanceof FutureVersionError) throw new ImportError("future", [], e.version);
  if (e instanceof InvalidDataError)
    throw new ImportError(
      "invalid",
      e.issues.map((i) => (i.startsWith("(root)") ? i : `${prefix}${i}`)),
    );
  throw e;
}

function check<T>(schema: z.ZodType<T>, value: unknown, prefix: string): T {
  const r = schema.safeParse(value);
  if (!r.success)
    throw new ImportError(
      "invalid",
      formatZodIssues(r.error).map((i) => `${prefix}${i}`),
    );
  return r.data;
}

/** JSON 文字列を検証・マイグレーションする。失敗時は ImportError */
export function parseImport(text: string): ParsedImport {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ImportError("notJson");
  }
  if (!isObject(json)) throw new ImportError("notSekigae");

  // 封筒なしの Project（localStorage の中身をそのまま保存した等）も受け付ける
  if (!("app" in json) && "schemaVersion" in json && "layout" in json && "members" in json) {
    try {
      return { kind: "project", data: parseProject(json) };
    } catch (e) {
      rethrow(e, "");
    }
  }

  if (json.app !== APP_ID) throw new ImportError("notSekigae");
  const header = envelopeHeader.safeParse(json);
  if (!header.success) throw new ImportError("invalid", formatZodIssues(header.error));
  const { kind, schemaVersion, data } = header.data;
  if (schemaVersion > SCHEMA_VERSION) throw new ImportError("future", [], schemaVersion);

  if (kind === "project") {
    if (!isObject(data)) throw new ImportError("invalid", ["data: expected object"]);
    try {
      // 中身の schemaVersion より封筒の方を信頼しない（中身優先）
      return { kind, data: parseProject({ schemaVersion, ...data }) };
    } catch (e) {
      rethrow(e, "data.");
    }
  }

  if (!isObject(data)) throw new ImportError("invalid", ["data: expected object"]);
  let migrated: Record<string, unknown>;
  try {
    const base = skeleton(schemaVersion);
    if (kind === "layout") base.layout = { rooms: data.rooms };
    else if (kind === "members") Object.assign(base, { members: data.members, labs: data.labs });
    else base.rules = data.rules;
    migrated = migrate(base);
  } catch (e) {
    rethrow(e, "data.");
  }
  switch (kind) {
    case "layout":
      return { kind, data: check(layoutDataSchema, migrated.layout, "data.") };
    case "members":
      return { kind, data: check(membersDataSchema, migrated, "data.") };
    case "rules": {
      const { rules } = check(rulesDataSchema, migrated, "data.");
      const refs = refsSchema.safeParse(data.refs);
      return { kind, data: { rules, refs: refs.success ? refs.data : undefined } };
    }
  }
}
