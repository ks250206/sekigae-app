/** エンジンのテスト用ヘルパー（本体からは import しない） */
import { createEmptyProject, createLab, createMember, createRoom } from "@/domain/factory";
import type { Rule, RuleBlock } from "@/domain/rules";
import type { ID, Member, Project, Seat } from "@/domain/schema";
import { buildContext } from "./context";
import { evaluate, stateFromAssignment } from "./evaluate";

/**
 * 一列に席が並んだ部屋（幅 seats+1、高さ 2）。入口は左下 (0,1)。
 * 席 `${id}-${i}` は (i,0)、i が大きいほど奥。4 近傍で i と i+1 が隣。
 */
export function rowRoom(id: string, seats: number, tags: Record<number, string[]> = {}) {
  const ss: Seat[] = Array.from({ length: seats }, (_, i) => ({
    id: `${id}-${i}`,
    x: i,
    y: 0,
    facing: "s",
    label: `${id.toUpperCase()}-${String(i + 1).padStart(2, "0")}`,
    tags: tags[i] ?? [],
  }));
  return createRoom({
    id,
    name: id,
    width: seats + 1,
    height: 2,
    seats: ss,
    entrances: [{ id: `${id}-e`, x: 0, y: 1, side: "w" }],
  });
}

export function tinyProject(opts: {
  rooms: [string, number][];
  members: (Partial<Member> & { id: ID })[];
  labs?: string[];
  rules?: Rule[];
  assignment?: Record<ID, ID>;
  locks?: ID[];
  previous?: { assignment?: Record<ID, ID>; roomOnly?: Record<ID, ID> };
}): Project {
  const p = createEmptyProject("t");
  p.labs = (opts.labs ?? []).map((id) => createLab({ id, name: id, color: "#000" }));
  p.layout.rooms = opts.rooms.map(([id, n]) => rowRoom(id, n));
  p.members = opts.members.map((m) => createMember({ name: m.id, ...m }));
  p.rules = opts.rules ?? [];
  const plan = p.plans[0]!;
  plan.assignment = opts.assignment ?? {};
  plan.locks = opts.locks ?? [];
  if (opts.previous) {
    const prev = {
      ...plan,
      id: "prev",
      kind: "previous" as const,
      assignment: opts.previous.assignment ?? {},
      roomOnly: opts.previous.roomOnly ?? {},
      locks: [],
    };
    p.plans.push(prev);
    p.previousPlanId = "prev";
  }
  return p;
}

let ruleSeq = 0;
export function rule(
  block: RuleBlock,
  strength: Rule["strength"] = "hard",
  weight: Rule["weight"] = 1,
  id?: ID,
): Rule {
  return { id: id ?? `rule${++ruleSeq}`, enabled: true, strength, weight, block };
}

/** ブロックを割当で評価して ID ベースで返す */
export function evalBlock(project: Project, block: RuleBlock, assignment: Record<ID, ID>) {
  const ctx = buildContext(project, null);
  const st = stateFromAssignment(ctx, assignment);
  const r = evaluate(block, st, ctx);
  return {
    violation: Math.round(r.violation * 1e6) / 1e6,
    members: r.culprits.members.map((m) => ctx.memberIds[m]!),
    seats: r.culprits.seats.map((s) => ctx.seatIds[s]!),
  };
}
