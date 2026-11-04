/**
 * 出力のテスト・E2E 用の決定的なサンプルプロジェクト（配置済み）。
 * makeProject("medium") に障害物・void・ふりがな・メモ・昨年度案を足したもの。
 */
import type { Project } from "@/domain/schema";
import { makeProject } from "@/test/factories";

export function makeExportFixture(): Project {
  const p = makeProject("medium");
  p.id = "proj-export";
  p.name = "テスト研究室";
  const [r1, r2, r3] = p.layout.rooms as [
    Project["layout"]["rooms"][number],
    Project["layout"]["rooms"][number],
    Project["layout"]["rooms"][number],
  ];
  r1.name = "301 号室";
  r2.name = "302 号室";
  r3.name = "Room/303";
  // 障害物（柱）と L 字（void）
  r1.cells[6] = "obstacle";
  r3.cells[6] = "void";
  r3.cells[1 * r3.width + 6] = "void";
  r2.note = "窓側";

  p.members.forEach((m, i) => {
    if (i % 3 === 0) m.kana = `かな${i}`;
    if (i % 5 === 0) m.note = `メモ${i}`;
  });

  const plan = p.plans[0]!;
  plan.id = "plan-a";
  plan.name = "案A";
  plan.final = true;
  p.activePlanId = plan.id;
  const seats = p.layout.rooms.flatMap((r) => r.seats);
  // 28 名を配置し、2 名を未配置にする
  p.members.slice(0, 28).forEach((m, i) => {
    plan.assignment[seats[i]!.id] = m.id;
  });

  // 昨年度: 半分は同じ席、何人かは別の部屋、1 人は部屋のみ判明
  const prev = {
    ...plan,
    id: "plan-prev",
    name: "昨年度",
    kind: "previous" as const,
    final: false,
    assignment: {} as Record<string, string>,
    roomOnly: {} as Record<string, string>,
    locks: [],
  };
  p.members.slice(0, 20).forEach((m, i) => {
    const seat = i < 10 ? seats[i]! : seats[(i + 13) % seats.length]!;
    prev.assignment[seat.id] = m.id;
  });
  prev.roomOnly[p.members[21]!.id] = r2.key;
  p.plans.push(prev);
  p.previousPlanId = prev.id;
  return p;
}
