import type { ID } from "@/domain/schema";

export interface AssignmentDiff {
  /** 別の席に移った人 */
  moved: ID[];
  /** 新たに席に着いた人 */
  added: ID[];
  /** 席から外れた人 */
  removed: ID[];
  /** 席が変わらない人 */
  unchanged: number;
}

/** 2 つの割当（席 ID → メンバー ID）の差分（ソルバー結果の適用前確認用） */
export function diffAssignments(before: Record<ID, ID>, after: Record<ID, ID>): AssignmentDiff {
  const seatOf = (a: Record<ID, ID>) => {
    const m = new Map<ID, ID>();
    for (const [sid, mid] of Object.entries(a)) if (!m.has(mid)) m.set(mid, sid);
    return m;
  };
  const b = seatOf(before);
  const a = seatOf(after);
  const out: AssignmentDiff = { moved: [], added: [], removed: [], unchanged: 0 };
  for (const [mid, sid] of a) {
    const prev = b.get(mid);
    if (prev === undefined) out.added.push(mid);
    else if (prev !== sid) out.moved.push(mid);
    else out.unchanged++;
  }
  for (const mid of b.keys()) if (!a.has(mid)) out.removed.push(mid);
  return out;
}
