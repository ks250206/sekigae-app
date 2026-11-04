/**
 * 性能テスト（#112 ベンチ）。small / medium / large の各フィクスチャで既定設定のまま解き、
 * 時間を記録する（`pnpm exec vp test src/engine/solver.perf`）。目標: large（100 人・150 席）≤ 2 秒。
 */
import { describe, expect, it } from "vite-plus/test";
import type { Rule } from "@/domain/rules";
import { makeProject, type FixtureSize } from "@/test/factories";
import { createPlanEvaluator } from "./evaluate";
import { solve } from "./solver";

function withRules(size: FixtureSize) {
  const p = makeProject(size, 1);
  const lab = p.labs[0]!.id;
  const r = (
    id: string,
    strength: Rule["strength"],
    weight: Rule["weight"],
    block: Rule["block"],
  ): Rule => ({
    id,
    enabled: true,
    strength,
    weight,
    block,
  });
  p.rules = [
    r("pin", "hard", 1, { type: "seat.pin", seatId: "r1-s1", memberId: "m1" }),
    r("cap", "soft", 3, { type: "room.attrCap", rooms: [], attr: "lab", max: 50, unit: "percent" }),
    r("pair", "soft", 2, {
      type: "pair.relation",
      a: { op: "roleGroup", in: ["master", "bachelor"] },
      b: { op: "roleGroup", in: ["master", "bachelor"] },
      relation: "notAdjacent",
      qualifier: { lab: "same", role: "same" },
    }),
    r("buddy", "soft", 2, {
      type: "group.buddy",
      a: { op: "role", in: ["m1", "b4"] },
      b: { op: "roleGroup", in: ["doctor", "staff"] },
      scope: "sameRoom",
      min: 1,
    }),
    r("excl", "hard", 1, {
      type: "room.exclude",
      rooms: [p.layout.rooms[0]!.id],
      people: { op: "lab", in: [lab] },
    }),
  ];
  return p;
}

describe("performance", () => {
  for (const size of ["small", "medium", "large"] as const) {
    it(`solves ${size} within 2s (default options, mixLab + seniorBack, 5 rules)`, () => {
      const p = withRules(size);
      const t0 = performance.now();
      const res = solve({ project: p, options: { seed: 1, presets: ["mixLab", "seniorBack"] } });
      const ms = performance.now() - t0;
      const ev = createPlanEvaluator(p);
      const e0 = performance.now();
      for (let i = 0; i < 20; i++) ev.evaluate(res.assignment);
      const evalMs = (performance.now() - e0) / 20;
      console.info(
        `[perf] ${size}: solve ${ms.toFixed(0)}ms, ${res.stats.iterations} iters (${res.stats.stoppedBy}), ` +
          `score ${res.score}, hard ${res.hardViolations}; evaluate ${evalMs.toFixed(2)}ms`,
      );
      expect(res.hardViolations).toBe(0);
      expect(ms).toBeLessThan(2000);
    });
  }
});
