import { ROLE_GROUPS, ROLE_ORDER, ROLES, type RoleGroup, type RoleKey } from "@/domain/roles";
import type { Member } from "@/domain/schema";

/** 役職ごとの人数 */
export function countRoles(members: readonly Pick<Member, "role">[]): Map<RoleKey, number> {
  const m = new Map<RoleKey, number>();
  for (const x of members) m.set(x.role, (m.get(x.role) ?? 0) + 1);
  return m;
}

/** シニア順・グループごとの役職一覧 */
export const ROLE_GROUPED: { group: RoleGroup; roles: RoleKey[] }[] = ROLE_GROUPS.map((group) => ({
  group,
  roles: ROLE_ORDER.filter((r) => ROLES[r].group === group),
})).filter((g) => g.roles.length > 0);
