import { describe, expect, it } from "vite-plus/test";
import { compareRole, nextRole, ROLE_KEYS, ROLE_QUICK_PICKS, roleGroupOf, roleRank } from "./roles";

describe("roles", () => {
  it("contains working doctoral roles separate from doctor", () => {
    expect(ROLE_KEYS).toContain("wd1");
    expect(roleGroupOf("wd1")).toBe("workingDoctor");
    expect(roleGroupOf("d1")).toBe("doctor");
    expect(ROLE_QUICK_PICKS.doctor).not.toContain("wd1");
    expect(ROLE_QUICK_PICKS.anyDoctor).toEqual(expect.arrayContaining(["d1", "wd3"]));
  });

  it("progresses on separate tracks", () => {
    expect(nextRole("b3")).toBe("b4");
    expect(nextRole("m2")).toBe("d1");
    expect(nextRole("wd1")).toBe("wd2");
    expect(nextRole("wd3")).toBe("graduate");
    expect(nextRole("faculty")).toBeNull();
  });

  it("orders by seniority", () => {
    const sorted = (["b3", "faculty", "m1", "d2"] as const).slice().sort(compareRole);
    expect(sorted).toEqual(["faculty", "d2", "m1", "b3"]);
    expect(roleRank("d3")).toBeGreaterThan(roleRank("m2"));
    expect(roleRank("wd2")).toBe(roleRank("d2"));
  });
});
