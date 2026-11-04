import { beforeEach, describe, expect, it } from "vite-plus/test";
import { createEmptyProject, createMember, createRoom } from "@/domain/factory";
import type { RoleKey } from "@/domain/roles";
import { history, useProjectStore } from "@/store/project";
import { activePlan, previousPlan } from "@/store/selectors";
import { makeSeat } from "@/test/factories";
import { planPromotion, promotionRows, resolveTarget } from "./promotion";
import { hasWorkingDoctorSeatRule, runYearUpdate } from "./yearUpdate";

const s = () => useProjectStore.getState();
const ROLES: RoleKey[] = [
  "faculty",
  "pd",
  "b3",
  "b4",
  "m1",
  "m2",
  "d1",
  "d2",
  "d3",
  "wd1",
  "wd2",
  "wd3",
  "other",
];

function setup() {
  const p = createEmptyProject();
  p.layout.rooms.push(
    createRoom({
      id: "r1",
      name: "A",
      width: 13,
      height: 1,
      seats: ROLES.map((_, i) => makeSeat(`s${i}`, i, 0)),
    }),
  );
  p.members = ROLES.map((role, i) => createMember({ id: role, name: `N${i}`, role }));
  p.plans[0]!.assignment = Object.fromEntries(ROLES.map((r, i) => [`s${i}`, r]));
  p.plans[0]!.final = true;
  s().replaceProject(p);
  history.clear();
}

beforeEach(setup);

describe("promotion", () => {
  it("builds rows for students only, with separate tracks", () => {
    const rows = promotionRows(s().project.members);
    expect(rows.map((r) => r.memberId)).toEqual([
      "b3",
      "b4",
      "m1",
      "m2",
      "d1",
      "d2",
      "d3",
      "wd1",
      "wd2",
      "wd3",
    ]);
    const by = Object.fromEntries(rows.map((r) => [r.memberId, r]));
    expect(by.b3!.defaultTarget).toBe("b4");
    expect(by.b4!.defaultTarget).toBe("m1");
    expect(by.b4!.continueTo).toBe("m1");
    expect(by.m2!.defaultTarget).toBe("graduate");
    expect(by.m2!.continueTo).toBe("d1");
    expect(by.d2!.defaultTarget).toBe("d3");
    expect(by.d3!.defaultTarget).toBe("graduate");
    expect(by.wd1!.defaultTarget).toBe("wd2");
    expect(by.wd2!.defaultTarget).toBe("wd3");
    expect(by.wd3!.defaultTarget).toBe("graduate");
    expect(by.wd1!.track).toBe("workingDoctor");
    expect(by.d1!.track).toBe("general");
    expect(rows.filter((r) => r.terminal).map((r) => r.memberId)).toEqual([
      "b4",
      "m2",
      "d3",
      "wd3",
    ]);
  });
  it("working doctors never join the regular D track", () => {
    for (const r of promotionRows(s().project.members).filter((x) => x.track === "workingDoctor"))
      expect(String(r.defaultTarget)).not.toMatch(/^d\d/);
  });
  it("applies overrides", () => {
    const rows = promotionRows(s().project.members);
    const plan = planPromotion(rows, { wd3: "stay", m2: "d1", b4: "graduate", m1: "stay" });
    expect(plan.graduates.sort()).toEqual(["b4", "d3"]);
    expect(plan.roleChanges).toContainEqual({ memberId: "m2", role: "d1" });
    expect(plan.roleChanges.find((c) => c.memberId === "wd3")).toBeUndefined();
    expect(plan.roleChanges.find((c) => c.memberId === "m1")).toBeUndefined();
    expect(resolveTarget("wd3", "stay")).toBe("wd3");
  });
});

describe("runYearUpdate", () => {
  it("moves the plan to previous, promotes, removes graduates and carries over working doctors in one undo", () => {
    const before = s().project;
    const rows = promotionRows(before.members);
    const promotion = planPromotion(rows, { wd3: "stay" });
    const res = runYearUpdate({
      sourcePlanId: before.activePlanId,
      previousName: "2025年度",
      existingPrevious: "archive",
      currentAssignment: "clear",
      promotion,
      removeMembers: promotion.graduates,
      carryOverWorkingDoctors: true,
    });
    const p = s().project;
    const prev = previousPlan(p)!;
    expect(prev.name).toBe("2025年度");
    expect(prev.kind).toBe("previous");
    expect(res.removed).toBe(2); // m2, d3
    expect(p.members.map((m) => m.id)).not.toContain("m2");
    expect(p.members.find((m) => m.id === "b3")!.role).toBe("b4");
    expect(p.members.find((m) => m.id === "wd1")!.role).toBe("wd2");
    expect(p.members.find((m) => m.id === "wd3")!.role).toBe("wd3");
    // graduates removed from previous plan as well
    expect(Object.values(prev.assignment)).not.toContain("m2");
    // working doctors keep and lock their seats
    const cur = activePlan(p);
    expect(cur.assignment).toEqual({ s9: "wd1", s10: "wd2", s11: "wd3" });
    expect([...cur.locks].sort()).toEqual(["s10", "s11", "s9"]);
    expect(cur.final).toBe(false);
    expect(hasWorkingDoctorSeatRule(p.rules)).toBe(true);
    expect(res).toMatchObject({ carriedOver: 3, ruleAdded: true });

    history.undo();
    expect(s().project).toBe(before);
  });

  it("does not add a duplicate rule and overwrites an existing previous plan", () => {
    const opts = {
      sourcePlanId: s().project.activePlanId,
      previousName: "Y1",
      existingPrevious: "overwrite" as const,
      currentAssignment: "keep" as const,
      promotion: { roleChanges: [], graduates: [] },
      removeMembers: [],
      carryOverWorkingDoctors: true,
    };
    runYearUpdate(opts);
    const firstPrev = s().project.previousPlanId;
    const r2 = runYearUpdate({ ...opts, previousName: "Y2" });
    expect(r2.ruleAdded).toBe(false);
    expect(s().project.rules).toHaveLength(1);
    expect(s().project.plans.some((p) => p.id === firstPrev)).toBe(false);
    expect(previousPlan(s().project)!.name).toBe("Y2");
  });

  it("archive keeps the old previous plan", () => {
    const base = {
      sourcePlanId: s().project.activePlanId,
      existingPrevious: "archive" as const,
      currentAssignment: "keep" as const,
      promotion: { roleChanges: [], graduates: [] },
      removeMembers: [],
      carryOverWorkingDoctors: false,
    };
    runYearUpdate({ ...base, previousName: "Y1" });
    const first = s().project.previousPlanId;
    runYearUpdate({ ...base, previousName: "Y2" });
    expect(s().project.plans.some((p) => p.id === first)).toBe(true);
    expect(s().project.previousPlanId).not.toBe(first);
    expect(s().project.rules).toHaveLength(0);
  });
});
