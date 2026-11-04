/** メンバー・研究室を削除したときの影響（確認ダイアログ用） */
import type { ID, Project } from "@/domain/schema";
import { seatIndex } from "@/store/selectors";
import { collectRuleRefs, rulesReferencing } from "./ruleRefs";

export interface MemberDeleteImpact {
  /** 今年度の案での席割当（案の名前ごと） */
  seats: { plan: string; count: number }[];
  /** 昨年度の席・部屋 */
  previous: number;
  /** 参照しているルール数 */
  rules: number;
}

export function memberDeleteImpact(p: Project, ids: readonly ID[]): MemberDeleteImpact {
  const set = new Set(ids);
  const idx = seatIndex(p.layout.rooms);
  const seats: MemberDeleteImpact["seats"] = [];
  let previous = 0;
  for (const plan of p.plans) {
    const n = Object.entries(plan.assignment).filter(
      ([sid, mid]) => set.has(mid) && idx.has(sid),
    ).length;
    if (plan.id === p.previousPlanId)
      previous = n + Object.keys(plan.roomOnly).filter((mid) => set.has(mid)).length;
    else if (plan.kind === "current" && n) seats.push({ plan: plan.name, count: n });
  }
  const rules = rulesReferencing(collectRuleRefs(p.rules).members, ids).size;
  return { seats, previous, rules };
}

export function labRuleRefCount(p: Project, labId: ID): number {
  return rulesReferencing(collectRuleRefs(p.rules).labs, [labId]).size;
}
