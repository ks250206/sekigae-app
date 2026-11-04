import { describe, expect, it } from "vite-plus/test";
import { createRule } from "@/domain/factory";
import type { RuleBlock } from "@/domain/rules";
import { makeProject } from "@/test/factories";
import {
  analyzeRules,
  findContradictions,
  findDangling,
  ruleRelatesToMember,
  ruleRelatesToRoom,
  stripDangling,
} from "./analysis";

describe("dangling references", () => {
  const project = makeProject("medium");
  const block: RuleBlock = {
    type: "logic.all",
    children: [
      { type: "room.only", rooms: ["r1", "gone-room"], people: { op: "lab", in: ["lab1", "x"] } },
      { type: "person.pin", memberId: "ghost", target: { kind: "seat", seatId: "r1-s1" } },
      { type: "seat.empty", seats: { op: "seats", seatIds: ["r1-s2", "nope"] } },
    ],
  };

  it("detects deleted ids", () => {
    expect(findDangling(block, project)).toEqual({
      rooms: ["gone-room"],
      seats: ["nope"],
      members: ["ghost"],
      labs: ["x"],
    });
  });

  it("removes deleted ids", () => {
    const fixed = stripDangling(block, project);
    expect(findDangling(fixed, project)).toEqual({ rooms: [], seats: [], members: [], labs: [] });
    const kids = (fixed as Extract<RuleBlock, { type: "logic.all" }>).children;
    expect(kids[0]).toMatchObject({ rooms: ["r1"], people: { in: ["lab1"] } });
    expect(kids[1]).toMatchObject({ memberId: null, target: { seatId: "r1-s1" } });
  });

  it("reports rules after a room is deleted", () => {
    const p = structuredClone(project);
    p.rules = [createRule({ type: "room.exclude", rooms: ["r2"], people: { op: "all" } })];
    expect(analyzeRules(p).dangling.size).toBe(0);
    p.layout.rooms = p.layout.rooms.filter((r) => r.id !== "r2");
    expect(analyzeRules(p).dangling.get(p.rules[0]!.id)?.rooms).toEqual(["r2"]);
  });
});

describe("static contradictions", () => {
  const project = makeProject("medium");
  const codes = (rules: ReturnType<typeof createRule>[]) =>
    findContradictions(rules, project).map((c) => c.code);

  it("finds a person pinned twice and a seat pinned twice", () => {
    expect(
      codes([
        createRule({ type: "seat.pin", seatId: "r1-s1", memberId: "m1" }),
        createRule({
          type: "person.pin",
          memberId: "m1",
          target: { kind: "seat", seatId: "r1-s2" },
        }),
      ]),
    ).toEqual(["memberTwoPins"]);
    expect(
      codes([
        createRule({ type: "seat.pin", seatId: "r1-s1", memberId: "m1" }),
        createRule({ type: "seat.pin", seatId: "r1-s1", memberId: "m2" }),
      ]),
    ).toEqual(["seatTwoPins"]);
    // 席と、その席を含む部屋の固定は矛盾しない
    expect(
      codes([
        createRule({ type: "seat.pin", seatId: "r1-s1", memberId: "m1" }),
        createRule({ type: "person.pin", memberId: "m1", target: { kind: "room", roomId: "r1" } }),
      ]),
    ).toEqual([]);
  });

  it("ignores soft and disabled rules", () => {
    expect(
      codes([
        createRule({ type: "seat.pin", seatId: "r1-s1", memberId: "m1" }),
        createRule({ type: "seat.pin", seatId: "r1-s1", memberId: "m2" }, { strength: "soft" }),
        createRule({ type: "seat.pin", seatId: "r1-s1", memberId: "m3" }, { enabled: false }),
      ]),
    ).toEqual([]);
  });

  it("finds same + different and pair conflicts", () => {
    expect(
      codes([
        createRule({ type: "prev.same", people: { op: "role", in: ["m1"] }, scope: "seat" }),
        createRule({ type: "prev.different", people: { op: "all" }, scope: "room" }),
      ]),
    ).toEqual(["sameAndDifferent"]);
    const pair = (relation: "sameRoom" | "differentRoom") =>
      createRule({
        type: "pair.relation",
        a: { op: "members", ids: ["m1"] },
        b: { op: "members", ids: ["m2"] },
        relation,
      });
    expect(codes([pair("sameRoom"), pair("differentRoom")])).toEqual(["pairConflict"]);
  });

  it("finds empty and disjoint only-rules", () => {
    expect(
      codes([
        createRule({ type: "room.only", rooms: ["r1"], people: { op: "tag", in: ["none"] } }),
      ]),
    ).toEqual(["onlyEmpty"]);
    expect(
      codes([
        createRule({ type: "room.only", rooms: ["r1"], people: { op: "role", in: ["faculty"] } }),
        createRule({ type: "room.only", rooms: [], people: { op: "role", in: ["m1"] } }),
      ]),
    ).toEqual(["onlyDisjoint"]);
  });
});

describe("related filters", () => {
  const project = makeProject("medium");
  const m1 = project.members[0]!; // faculty
  it("relates rules to members and rooms", () => {
    const r = createRule({
      type: "room.only",
      rooms: ["r1"],
      people: { op: "role", in: ["faculty"] },
    });
    expect(ruleRelatesToMember(r, m1)).toBe(true);
    expect(ruleRelatesToMember(r, project.members[1]!)).toBe(false);
    expect(ruleRelatesToRoom(r, "r1", project)).toBe(true);
    expect(ruleRelatesToRoom(r, "r2", project)).toBe(false);
    const all = createRule({ type: "group.labBalance", people: { op: "all" } });
    expect(ruleRelatesToMember(all, m1)).toBe(false);
    const seat = createRule({ type: "seat.empty", seats: { op: "seats", seatIds: ["r2-s1"] } });
    expect(ruleRelatesToRoom(seat, "r2", project)).toBe(true);
  });
});
