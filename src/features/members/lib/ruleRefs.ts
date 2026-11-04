/** ルールが参照しているメンバー・研究室（削除時の影響表示用） */
import type { Rule } from "@/domain/rules";
import type { ID } from "@/domain/schema";

export interface RuleRefs {
  members: Map<ID, Set<ID>>;
  labs: Map<ID, Set<ID>>;
}

const add = (m: Map<ID, Set<ID>>, key: ID, ruleId: ID) => {
  let s = m.get(key);
  if (!s) m.set(key, (s = new Set()));
  s.add(ruleId);
};

/** ブロック・条件式を汎用に走査する（ブロック種別の追加に強い） */
export function collectRuleRefs(rules: readonly Rule[]): RuleRefs {
  const refs: RuleRefs = { members: new Map(), labs: new Map() };
  const walk = (node: unknown, ruleId: ID) => {
    if (Array.isArray(node)) {
      for (const x of node) walk(x, ruleId);
      return;
    }
    if (!node || typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    if (o.op === "members" && Array.isArray(o.ids))
      for (const id of o.ids) if (typeof id === "string") add(refs.members, id, ruleId);
    if (o.op === "lab" && Array.isArray(o.in))
      for (const id of o.in) if (typeof id === "string") add(refs.labs, id, ruleId);
    if (typeof o.memberId === "string") add(refs.members, o.memberId, ruleId);
    for (const v of Object.values(o)) if (v && typeof v === "object") walk(v, ruleId);
  };
  for (const r of rules) walk(r.block, r.id);
  return refs;
}

/** 指定 ID 群を参照しているルール ID */
export function rulesReferencing(map: Map<ID, Set<ID>>, ids: readonly ID[]): Set<ID> {
  const out = new Set<ID>();
  for (const id of ids) for (const r of map.get(id) ?? []) out.add(r);
  return out;
}
