/** ドメインモデルの型と zod スキーマ。docs/DESIGN.md §3 */
import { z } from "zod";
import { GENDERS, type Gender } from "./genders";
import { ROLE_KEYS, type RoleKey } from "./roles";
import { ruleSchema, type ID, type Rule } from "./rules";

export type { ID };
export const SCHEMA_VERSION = 1;

export type Facing = "n" | "e" | "s" | "w";
export type CellKind = "floor" | "void" | "obstacle";

export interface Lab {
  id: ID;
  name: string;
  /** チップ表示用の略称 */
  shortName: string;
  color: string;
}

export interface Member {
  id: ID;
  name: string;
  kana?: string;
  labId?: ID;
  gender: Gender;
  role: RoleKey;
  tags: string[];
  note?: string;
}

export interface Seat {
  id: ID;
  /** 部屋内セル座標 */
  x: number;
  y: number;
  facing: Facing;
  label: string;
  tags: string[];
}

export interface Entrance {
  id: ID;
  /** 外周セル座標と、そのセルのどの辺にあるか */
  x: number;
  y: number;
  side: Facing;
}

export interface Room {
  id: ID;
  /** 系譜キー。レイアウト複製時も維持（昨年度比較用） */
  key: ID;
  name: string;
  color: string;
  /** フロア上の位置（セル単位） */
  position: { x: number; y: number };
  width: number;
  height: number;
  /** width*height, row-major */
  cells: CellKind[];
  seats: Seat[];
  entrances: Entrance[];
  note?: string;
  hidden?: boolean;
}

export interface Layout {
  rooms: Room[];
}

export interface SeatPlan {
  id: ID;
  name: string;
  kind: "current" | "previous";
  /** 席 ID → メンバー ID */
  assignment: Record<ID, ID>;
  /** 昨年度: 席は不明だが部屋は分かる場合（メンバー ID → Room.key） */
  roomOnly: Record<ID, ID>;
  /** 固定した席 ID */
  locks: ID[];
  seed?: number;
  /** 確定案 */
  final?: boolean;
  createdAt: string;
}

export interface ProjectSettings {
  adjacency: 4 | 8;
}

export interface Project {
  schemaVersion: number;
  id: ID;
  name: string;
  createdAt: string;
  updatedAt: string;
  labs: Lab[];
  members: Member[];
  layout: Layout;
  rules: Rule[];
  plans: SeatPlan[];
  activePlanId: ID;
  previousPlanId?: ID;
  settings: ProjectSettings;
}

export const MAX_ROOM_SIZE = 40;

const facing = z.enum(["n", "e", "s", "w"]);

export const labSchema = z.object({
  id: z.string(),
  name: z.string(),
  shortName: z.string(),
  color: z.string(),
}) satisfies z.ZodType<Lab>;

export const memberSchema = z.object({
  id: z.string(),
  name: z.string(),
  kana: z.string().optional(),
  labId: z.string().optional(),
  gender: z.enum(GENDERS),
  role: z.enum(ROLE_KEYS),
  tags: z.array(z.string()),
  note: z.string().optional(),
}) satisfies z.ZodType<Member>;

export const seatSchema = z.object({
  id: z.string(),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  facing,
  label: z.string(),
  tags: z.array(z.string()),
}) satisfies z.ZodType<Seat>;

export const entranceSchema = z.object({
  id: z.string(),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  side: facing,
}) satisfies z.ZodType<Entrance>;

export const roomSchema = z
  .object({
    id: z.string(),
    key: z.string(),
    name: z.string(),
    color: z.string(),
    position: z.object({ x: z.number().int(), y: z.number().int() }),
    width: z.number().int().min(1).max(MAX_ROOM_SIZE),
    height: z.number().int().min(1).max(MAX_ROOM_SIZE),
    cells: z.array(z.enum(["floor", "void", "obstacle"])),
    seats: z.array(seatSchema),
    entrances: z.array(entranceSchema),
    note: z.string().optional(),
    hidden: z.boolean().optional(),
  })
  .superRefine((r, ctx) => {
    if (r.cells.length !== r.width * r.height)
      ctx.addIssue({ code: "custom", message: "cells length must equal width*height" });
    for (const s of [...r.seats, ...r.entrances])
      if (s.x >= r.width || s.y >= r.height)
        ctx.addIssue({ code: "custom", message: `out of bounds: ${s.id}` });
  }) satisfies z.ZodType<Room>;

export const seatPlanSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["current", "previous"]),
  assignment: z.record(z.string(), z.string()),
  roomOnly: z.record(z.string(), z.string()),
  locks: z.array(z.string()),
  seed: z.number().optional(),
  final: z.boolean().optional(),
  createdAt: z.string(),
}) satisfies z.ZodType<SeatPlan>;

export const projectSchema = z.object({
  schemaVersion: z.number().int(),
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  labs: z.array(labSchema),
  members: z.array(memberSchema),
  layout: z.object({ rooms: z.array(roomSchema) }),
  rules: z.array(ruleSchema),
  plans: z.array(seatPlanSchema),
  activePlanId: z.string(),
  previousPlanId: z.string().optional(),
  settings: z.object({ adjacency: z.union([z.literal(4), z.literal(8)]) }),
}) satisfies z.ZodType<Project>;
