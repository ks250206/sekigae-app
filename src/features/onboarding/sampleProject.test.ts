import { describe, expect, it } from "vite-plus/test";
import { projectSchema } from "@/domain/schema";
import { createSampleProject } from "./sampleProject";

describe("sample project", () => {
  it.each(["ja", "en"] as const)("is schema-valid (%s)", (lang) => {
    const p = createSampleProject(lang);
    const r = projectSchema.safeParse(p);
    expect(r.success, JSON.stringify(r.error?.issues.slice(0, 3))).toBe(true);
    expect(new Set(p.members.map((m) => m.labId)).size).toBe(4);
    expect(p.members.filter((m) => m.role.startsWith("wd"))).toHaveLength(2);
    const seats = p.layout.rooms.reduce((n, r) => n + r.seats.length, 0);
    expect(seats).toBeGreaterThanOrEqual(p.members.length);
  });

  it("previous plan references existing seats and members", () => {
    const p = createSampleProject("ja");
    const prev = p.plans.find((x) => x.id === p.previousPlanId)!;
    const seatIds = new Set(p.layout.rooms.flatMap((r) => r.seats.map((s) => s.id)));
    const memberIds = new Set(p.members.map((m) => m.id));
    for (const [sid, mid] of Object.entries(prev.assignment)) {
      expect(seatIds.has(sid)).toBe(true);
      expect(memberIds.has(mid)).toBe(true);
    }
  });
});
