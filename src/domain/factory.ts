/** ドメインオブジェクトの生成関数 */
import { newId } from "@/lib/id";
import type { RoleKey } from "./roles";
import type { Rule, RuleBlock } from "./rules";
import type { Lab, Member, Project, Room, SeatPlan } from "./schema";
import { SCHEMA_VERSION } from "./schema";

export const now = () => new Date().toISOString();

export function createSeatPlan(name: string, kind: SeatPlan["kind"] = "current"): SeatPlan {
  return {
    id: newId("plan_"),
    name,
    kind,
    assignment: {},
    roomOnly: {},
    locks: [],
    createdAt: now(),
  };
}

export function createEmptyProject(name = "新しいプロジェクト", planName = "案A"): Project {
  const plan = createSeatPlan(planName);
  const t = now();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newId("proj_"),
    name,
    createdAt: t,
    updatedAt: t,
    labs: [],
    members: [],
    layout: { rooms: [] },
    rules: [],
    plans: [plan],
    activePlanId: plan.id,
    settings: { adjacency: 4 },
  };
}

export function createRoom(init: Partial<Room> & { name: string }): Room {
  const width = init.width ?? 8;
  const height = init.height ?? 6;
  const id = init.id ?? newId("room_");
  return {
    id,
    key: init.key ?? id,
    name: init.name,
    color: init.color ?? "#6366f1",
    position: init.position ?? { x: 0, y: 0 },
    width,
    height,
    cells: init.cells ?? Array.from({ length: width * height }, () => "floor" as const),
    seats: init.seats ?? [],
    entrances: init.entrances ?? [],
    note: init.note,
    hidden: init.hidden,
  };
}

export function createMember(init: Partial<Member> & { name: string }): Member {
  return {
    id: init.id ?? newId("m_"),
    name: init.name,
    kana: init.kana,
    labId: init.labId,
    gender: init.gender ?? "unspecified",
    role: init.role ?? ("other" as RoleKey),
    tags: init.tags ?? [],
    note: init.note,
  };
}

export function createLab(init: Partial<Lab> & { name: string; color: string }): Lab {
  return {
    id: init.id ?? newId("lab_"),
    name: init.name,
    shortName: init.shortName ?? deriveShortName(init.name),
    color: init.color,
  };
}

/** 「山田研究室」→「山田」、"Smith Lab" → "Smith" */
export function deriveShortName(name: string): string {
  const s = name
    .replace(/(研究室|研)$/u, "")
    .replace(/\s*(laboratory|lab)\.?$/iu, "")
    .trim();
  return (s || name).slice(0, 6);
}

export function createRule(block: RuleBlock, init: Partial<Omit<Rule, "block">> = {}): Rule {
  return {
    id: init.id ?? newId("rule_"),
    enabled: init.enabled ?? true,
    strength: init.strength ?? "hard",
    weight: init.weight ?? 3,
    block,
    note: init.note,
    origin: init.origin ?? "user",
  };
}
