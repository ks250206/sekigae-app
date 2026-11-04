import { describe, expect, it } from "vite-plus/test";
import {
  createEmptyProject,
  createLab,
  createMember,
  createRoom,
  createRule,
} from "@/domain/factory";
import type { Project } from "@/domain/schema";
import { makeSeat } from "@/test/factories";
import { extractPartial } from "./envelope";
import { applyLayout, applyMembers, applyRules } from "./merge";
import { collectBlockRefs, countDanglingRefs } from "./ruleRefs";

function base(): Project {
  const p = createEmptyProject("base");
  const lab = createLab({ id: "lab_y", name: "山田研究室", color: "#f00" });
  p.labs.push(lab);
  p.layout.rooms.push(
    createRoom({
      id: "r1",
      name: "101",
      width: 4,
      height: 3,
      seats: [makeSeat("s1", 0, 0), makeSeat("s2", 1, 0)],
    }),
  );
  p.members.push(createMember({ id: "m1", name: "Alice", labId: lab.id }));
  p.plans[0]!.assignment = { s1: "m1" };
  p.plans[0]!.locks = ["s1"];
  return p;
}

describe("applyLayout", () => {
  it("merges rooms with new IDs, placed to the right", () => {
    const p = base();
    const src = base();
    const before = structuredClone(src.layout.rooms);
    const r = applyLayout(p, extractPartial(src, "layout"), "merge");
    expect(p.layout.rooms).toHaveLength(2);
    const added = p.layout.rooms[1]!;
    expect(added.id).not.toBe("r1");
    expect(added.key).not.toBe(p.layout.rooms[0]!.key);
    expect(added.seats.map((s) => s.id)).not.toContain("s1");
    expect(added.position.x).toBe(4 + 2);
    // 既存の割当は維持、元データは変更しない
    expect(p.plans[0]!.assignment).toEqual({ s1: "m1" });
    expect(src.layout.rooms).toEqual(before);
    expect(r.dangling).toBe(0);
  });

  it("replaces rooms and drops assignments to removed seats", () => {
    const p = base();
    p.rules.push(createRule({ type: "seat.pin", seatId: "s1", memberId: "m1" }));
    const r = applyLayout(p, { rooms: [createRoom({ id: "r9", name: "9" })] }, "replace");
    expect(p.layout.rooms.map((x) => x.id)).toEqual(["r9"]);
    expect(p.plans[0]!.assignment).toEqual({});
    expect(p.plans[0]!.locks).toEqual([]);
    expect(r.dangling).toBe(1);
  });
});

describe("applyMembers", () => {
  it("merges labs by name and re-IDs members", () => {
    const p = base();
    const src = createEmptyProject();
    src.labs.push(
      createLab({ id: "lab_other", name: "山田研究室", color: "#0f0" }),
      createLab({ id: "lab_new", name: "佐藤研究室", color: "#00f" }),
    );
    src.members.push(
      createMember({ id: "m1", name: "Bob", labId: "lab_other" }),
      createMember({ id: "m2", name: "Carol", labId: "lab_new" }),
    );
    applyMembers(p, extractPartial(src, "members"), "merge");
    expect(p.labs.map((l) => l.name)).toEqual(["山田研究室", "佐藤研究室"]);
    expect(p.labs[1]!.id).not.toBe("lab_new");
    const [alice, bob, carol] = p.members;
    expect(alice!.id).toBe("m1");
    expect(bob!.id).not.toBe("m1");
    expect(bob!.labId).toBe("lab_y");
    expect(carol!.labId).toBe(p.labs[1]!.id);
  });

  it("replaces members and prunes plans", () => {
    const p = base();
    applyMembers(p, { members: [createMember({ id: "mX", name: "X" })], labs: [] }, "replace");
    expect(p.members.map((m) => m.id)).toEqual(["mX"]);
    expect(p.plans[0]!.assignment).toEqual({});
    expect(p.labs).toHaveLength(1);
  });
});

describe("applyRules", () => {
  it("re-IDs merged rules and remaps references by name", () => {
    const src = base();
    // 取り込み元では ID が異なるが名前は同じ
    src.labs[0]!.id = "lab_src";
    src.members[0]!.id = "m_src";
    src.layout.rooms[0]!.id = "r_src";
    src.layout.rooms[0]!.seats[0]!.id = "s_src";
    src.rules.push(
      createRule(
        {
          type: "logic.any",
          children: [
            { type: "seat.pin", seatId: "s_src", memberId: "m_src" },
            { type: "room.only", rooms: ["r_src"], people: { op: "lab", in: ["lab_src"] } },
            { type: "person.pin", memberId: "ghost", target: { kind: "room", roomId: "r_src" } },
          ],
        },
        { id: "rule1" },
      ),
    );
    const p = base();
    const r = applyRules(p, extractPartial(src, "rules"), "merge");
    expect(p.rules).toHaveLength(1);
    expect(p.rules[0]!.id).not.toBe("rule1");
    const refs = collectBlockRefs(p.rules[0]!.block);
    expect(refs).toEqual([
      { kind: "seat", id: "s1" },
      { kind: "member", id: "m1" },
      { kind: "room", id: "r1" },
      { kind: "lab", id: "lab_y" },
      { kind: "member", id: "ghost" },
      { kind: "room", id: "r1" },
    ]);
    // 参照切れは残して件数を返す
    expect(r.dangling).toBe(1);
    expect(countDanglingRefs(p.rules, p)).toBe(1);
  });

  it("replaces rules keeping IDs", () => {
    const p = base();
    p.rules.push(createRule({ type: "group.labBalance", people: { op: "all" } }));
    const incoming = [
      createRule({ type: "seat.empty", seats: { op: "seats", seatIds: ["s2"] } }, { id: "keep" }),
    ];
    const r = applyRules(p, { rules: incoming }, "replace");
    expect(p.rules.map((x) => x.id)).toEqual(["keep"]);
    expect(r.dangling).toBe(0);
  });
});
