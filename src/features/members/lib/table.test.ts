import { describe, expect, it } from "vite-plus/test";
import { createRule } from "@/domain/factory";
import { makeProject } from "@/test/factories";
import { collectRuleRefs, rulesReferencing } from "./ruleRefs";
import { EMPTY_FILTER, activeFilterCount, allTags, buildRows, filterRows, sortRows } from "./table";

function project() {
  const p = makeProject("medium");
  p.members[0] = { ...p.members[0]!, name: "山田 太郎", kana: "ヤマダ タロウ", tags: ["留学生"] };
  p.members[1] = {
    ...p.members[1]!,
    name: "佐藤 花子",
    kana: "さとう はなこ",
    tags: ["留学生", "窓側"],
  };
  p.plans[0]!.assignment = { "r1-s1": p.members[0]!.id };
  return p;
}

describe("member table helpers", () => {
  it("searches name, kana (kana-insensitive) and tags", () => {
    const rows = buildRows(project());
    expect(
      filterRows(rows, { ...EMPTY_FILTER, query: "やまだ" }).map((r) => r.member.name),
    ).toEqual(["山田 太郎"]);
    expect(filterRows(rows, { ...EMPTY_FILTER, query: "ｻﾄｳ" }).map((r) => r.member.name)).toEqual([
      "佐藤 花子",
    ]);
    expect(filterRows(rows, { ...EMPTY_FILTER, query: "留学生" })).toHaveLength(2);
    expect(filterRows(rows, { ...EMPTY_FILTER, query: "留学生 窓側" })).toHaveLength(1);
  });
  it("filters by role, lab, gender, tag and unassigned", () => {
    const p = project();
    const rows = buildRows(p);
    expect(
      filterRows(rows, { ...EMPTY_FILTER, roles: ["faculty"] }).every(
        (r) => r.member.role === "faculty",
      ),
    ).toBe(true);
    expect(
      filterRows(rows, { ...EMPTY_FILTER, labs: ["lab1"] }).every((r) => r.member.labId === "lab1"),
    ).toBe(true);
    expect(
      filterRows(rows, { ...EMPTY_FILTER, genders: ["female"] }).every(
        (r) => r.member.gender === "female",
      ),
    ).toBe(true);
    expect(filterRows(rows, { ...EMPTY_FILTER, tags: ["窓側"] })).toHaveLength(1);
    expect(filterRows(rows, { ...EMPTY_FILTER, unassigned: true })).toHaveLength(
      p.members.length - 1,
    );
    expect(filterRows(rows, { ...EMPTY_FILTER, changes: ["new"] })).toHaveLength(1);
    expect(activeFilterCount({ ...EMPTY_FILTER, roles: ["m1", "m2"], unassigned: true })).toBe(3);
  });
  it("sorts by role rank, name and lab", () => {
    const p = project();
    const rows = buildRows(p);
    const byRole = sortRows(
      rows,
      { key: "role", dir: "asc" },
      "ja",
      p.labs.map((l) => l.id),
    );
    expect(byRole[0]!.member.role).toBe("faculty");
    expect(byRole.at(-1)!.member.role).toBe("b4");
    const byName = sortRows(rows, { key: "name", dir: "asc" }, "ja", []);
    const names = byName.map((r) => r.member.kana || r.member.name);
    expect(names.indexOf("さとう はなこ")).toBeLessThan(names.indexOf("ヤマダ タロウ"));
    const byLab = sortRows(
      rows,
      { key: "lab", dir: "desc" },
      "ja",
      p.labs.map((l) => l.id),
    );
    expect(byLab[0]!.member.labId).toBe("lab4");
  });
  it("collects tags by frequency", () => {
    expect(allTags(project().members)).toEqual(["留学生", "窓側"]);
  });
});

describe("rule references", () => {
  it("finds members and labs in nested blocks", () => {
    const rules = [
      createRule({ type: "person.pin", memberId: "m1", target: null }, { id: "a" }),
      createRule(
        {
          type: "logic.any",
          children: [
            {
              type: "room.only",
              rooms: [],
              people: {
                op: "and",
                args: [
                  { op: "lab", in: ["lab1"] },
                  { op: "members", ids: ["m2"] },
                ],
              },
            },
          ],
        },
        { id: "b" },
      ),
    ];
    const refs = collectRuleRefs(rules);
    expect([...rulesReferencing(refs.members, ["m1", "m2"])].sort()).toEqual(["a", "b"]);
    expect([...rulesReferencing(refs.labs, ["lab1"])]).toEqual(["b"]);
    expect(rulesReferencing(refs.members, ["m9"]).size).toBe(0);
  });
});
