import { describe, expect, it } from "vite-plus/test";
import type { RuleBlock } from "@/domain/rules";
import { evalBlock, tinyProject } from "./testing";

const ALL = { op: "all" } as const;
const roles = (...r: ("faculty" | "d1" | "m1" | "b4" | "other")[]) => ({
  op: "role" as const,
  in: r,
});
const members = (...ids: string[]) => ({ op: "members" as const, ids });

// 部屋 A, B（各 4 席、A-0 が入口側、A-3 が最奥）
const base = () =>
  tinyProject({
    rooms: [
      ["A", 4],
      ["B", 4],
    ],
    labs: ["X", "Y"],
    members: [
      { id: "f1", role: "faculty", labId: "X", gender: "male" },
      { id: "d1", role: "d1", labId: "X", gender: "male" },
      { id: "m1", role: "m1", labId: "Y", gender: "female" },
      { id: "m2", role: "m1", labId: "X", gender: "male" },
      { id: "b1", role: "b4", labId: "Y", gender: "female" },
      { id: "b2", role: "b4", labId: "X", gender: "female" },
    ],
  });

const ev = (block: RuleBlock, a: Record<string, string>) => evalBlock(base(), block, a);

describe("room / seat blocks", () => {
  const a = { "A-0": "f1", "A-1": "m1", "B-0": "d1", "B-1": "b1" };

  it("room.only counts outsiders in the rooms", () => {
    const r = ev({ type: "room.only", rooms: ["A"], people: roles("faculty") }, a);
    expect(r).toMatchObject({ violation: 1, members: ["m1"], seats: ["A-1"] });
    // rooms: [] = すべての部屋
    expect(ev({ type: "room.only", rooms: [], people: roles("faculty") }, a).violation).toBe(3);
  });

  it("room.exclude counts excluded people inside", () => {
    expect(ev({ type: "room.exclude", rooms: ["B"], people: roles("b4", "d1") }, a).violation).toBe(
      2,
    );
    expect(ev({ type: "room.exclude", rooms: ["A"], people: roles("b4") }, a).violation).toBe(0);
  });

  it("room.count supports gte/lte/eq with count and percent", () => {
    const blk = (
      op: "gte" | "lte" | "eq",
      value: number,
      unit: "count" | "percent",
    ): RuleBlock => ({
      type: "room.count",
      rooms: ["A"],
      people: roles("m1"),
      op,
      value,
      unit,
    });
    expect(ev(blk("gte", 2, "count"), a).violation).toBe(1);
    expect(ev(blk("gte", 1, "count"), a).violation).toBe(0);
    expect(ev(blk("lte", 0, "count"), a).violation).toBe(1);
    expect(ev(blk("eq", 3, "count"), a).violation).toBe(2);
    // A には 2 人、m1 は 1 人 = 50%
    expect(ev(blk("gte", 50, "percent"), a).violation).toBe(0);
    expect(ev(blk("gte", 100, "percent"), a).violation).toBe(1);
    expect(ev(blk("lte", 0, "percent"), a).violation).toBe(1);
  });

  it("room.prefer counts P people that could still move in", () => {
    const blk: RuleBlock = { type: "room.prefer", rooms: ["A"], people: roles("b4", "d1") };
    // P = d1, b1, b2(未配置)。外にいる配置済み P = d1, b1 = 2、A の空き/非P = 2 空席 + f1, m1 = 4
    expect(ev(blk, a).violation).toBe(2);
    expect(
      ev(blk, { "A-0": "d1", "A-1": "b1", "A-2": "b2", "A-3": "f1", "B-0": "m1" }).violation,
    ).toBe(0);
  });

  it("room.diversity counts missing kinds (capped by occupants)", () => {
    const blk = (min: number): RuleBlock => ({
      type: "room.diversity",
      rooms: [],
      attr: "lab",
      min,
    });
    expect(ev(blk(2), a).violation).toBe(0);
    expect(ev(blk(2), { "A-0": "f1", "A-1": "d1", "B-0": "m1" }).violation).toBe(1);
    // 在室 1 人の部屋は 1 種類で満たす
    expect(ev(blk(3), { "A-0": "f1", "B-0": "m1" }).violation).toBe(0);
  });

  it("room.attrCap counts people above the cap", () => {
    const four = { "A-0": "f1", "A-1": "d1", "A-2": "m2", "A-3": "m1" };
    expect(
      ev({ type: "room.attrCap", rooms: [], attr: "lab", max: 2, unit: "count" }, four),
    ).toMatchObject({
      violation: 1,
      seats: ["A-0", "A-1", "A-2"],
    });
    expect(
      ev({ type: "room.attrCap", rooms: [], attr: "lab", max: 50, unit: "percent" }, four)
        .violation,
    ).toBe(1);
    expect(
      ev({ type: "room.attrCap", rooms: [], attr: "gender", max: 3, unit: "count" }, four)
        .violation,
    ).toBe(0);
  });

  it("seat.only / seat.empty / seat.pin", () => {
    const seats = { op: "seats" as const, seatIds: ["A-0", "A-1"] };
    expect(ev({ type: "seat.only", seats, people: roles("faculty") }, a)).toMatchObject({
      violation: 1,
      members: ["m1"],
    });
    expect(ev({ type: "seat.empty", seats }, a).violation).toBe(2);
    expect(ev({ type: "seat.pin", seatId: "A-0", memberId: "f1" }, a).violation).toBe(0);
    expect(ev({ type: "seat.pin", seatId: "A-3", memberId: "f1" }, a)).toMatchObject({
      violation: 1,
      seats: ["A-0", "A-3"],
    });
    expect(ev({ type: "seat.pin", seatId: null, memberId: "f1" }, a).violation).toBe(0);
  });

  it("depth SeatExpr picks the deepest seats", () => {
    const back = { op: "depth" as const, roomIds: ["A"], from: "back" as const, count: 2 };
    expect(
      ev({ type: "seat.empty", seats: back }, { "A-3": "f1", "A-2": "d1", "A-1": "m1" }).violation,
    ).toBe(2);
  });
});

describe("person / global blocks", () => {
  it("person.pin (seat / room) and person.avoid", () => {
    const a = { "A-0": "f1", "B-0": "d1" };
    expect(
      ev({ type: "person.pin", memberId: "f1", target: { kind: "room", roomId: "A" } }, a)
        .violation,
    ).toBe(0);
    expect(
      ev({ type: "person.pin", memberId: "d1", target: { kind: "room", roomId: "A" } }, a)
        .violation,
    ).toBe(1);
    expect(
      ev({ type: "person.pin", memberId: "m1", target: { kind: "seat", seatId: "A-1" } }, a)
        .violation,
    ).toBe(1);
    expect(
      ev({ type: "person.avoid", memberId: "f1", seats: { op: "rooms", roomIds: ["A"] } }, a)
        .violation,
    ).toBe(1);
  });

  it("pair.relation with relations and qualifiers", () => {
    const a = { "A-0": "f1", "A-1": "d1", "A-2": "m1", "B-0": "m2", "B-1": "b1", "B-3": "b2" };
    const pr = (
      relation: "sameRoom" | "differentRoom" | "adjacent" | "notAdjacent",
      q?: object,
    ): RuleBlock => ({
      type: "pair.relation",
      a: ALL,
      b: ALL,
      relation,
      ...(q ? { qualifier: q } : {}),
    });
    // 6 人 → 15 組。同室の組: A 3 + B 3 = 6
    expect(ev(pr("differentRoom"), a).violation).toBe(6);
    expect(ev(pr("sameRoom"), a).violation).toBe(9);
    // 隣接: A-0/A-1, A-1/A-2, B-0/B-1 = 3
    expect(ev(pr("notAdjacent"), a).violation).toBe(3);
    expect(ev(pr("adjacent"), a).violation).toBe(12);
    // 同じ研究室同士の隣接: f1-d1 (X,X) のみ
    expect(ev(pr("notAdjacent", { lab: "same" }), a)).toMatchObject({
      violation: 1,
      members: ["f1", "d1"],
    });
    // 別研究室の隣接: d1-m1, m2-b1
    expect(ev(pr("notAdjacent", { lab: "different" }), a).violation).toBe(2);
    // 同じ役職同士 (m1,m2 / b1,b2) は隣でない
    expect(ev(pr("notAdjacent", { role: "same" }), a).violation).toBe(0);
    // A と B が別集合
    expect(
      ev(
        { type: "pair.relation", a: members("f1"), b: members("m2", "b1"), relation: "sameRoom" },
        a,
      ).violation,
    ).toBe(2);
  });

  it("prev.same / prev.different use seat or room (roomOnly)", () => {
    const p = tinyProject({
      rooms: [
        ["A", 2],
        ["B", 2],
      ],
      members: [{ id: "x" }, { id: "y" }, { id: "z" }],
      previous: { assignment: { "A-0": "x", "B-0": "y" }, roomOnly: { z: "B" } },
    });
    const cur = { "A-0": "x", "A-1": "y", "B-1": "z" };
    expect(evalBlock(p, { type: "prev.same", people: ALL, scope: "seat" }, cur)).toMatchObject({
      violation: 1,
      members: ["y"],
    });
    expect(evalBlock(p, { type: "prev.same", people: ALL, scope: "room" }, cur).violation).toBe(1);
    expect(
      evalBlock(p, { type: "prev.different", people: ALL, scope: "seat" }, cur).violation,
    ).toBe(1);
    // z は部屋だけ分かる: 同じ部屋 B
    expect(
      evalBlock(p, { type: "prev.different", people: ALL, scope: "room" }, cur).violation,
    ).toBe(2);
    // 未配置は prev.same 違反
    expect(evalBlock(p, { type: "prev.same", people: ALL, scope: "room" }, {}).violation).toBe(3);
  });

  it("group.cluster counts people outside main room + borders", () => {
    const together = {
      "A-0": "f1",
      "A-1": "d1",
      "A-2": "m2",
      "A-3": "b2",
      "B-0": "m1",
      "B-1": "b1",
    };
    expect(ev({ type: "group.cluster", people: ALL, attr: "lab" }, together).violation).toBe(0);
    const mixed = { "A-0": "f1", "A-1": "m1", "A-2": "d1", "B-0": "m2", "B-1": "b1", "B-2": "b2" };
    // 部屋: X は A に 2, B に 2 → 2 人、Y は A1/B1 → 1 人。境界: A 2 + B 2 = 4
    expect(ev({ type: "group.cluster", people: ALL, attr: "lab" }, mixed).violation).toBe(7);
  });

  it("group.spread counts people above the per-room share", () => {
    // X: 4 人、部屋の席数比 1/2 → 上限 2
    const lopsided = { "A-0": "f1", "A-1": "d1", "A-2": "m2", "A-3": "b2" };
    expect(ev({ type: "group.spread", people: ALL, attr: "lab" }, lopsided).violation).toBe(2);
    const even = { "A-0": "f1", "A-1": "d1", "B-0": "m2", "B-1": "b2" };
    expect(ev({ type: "group.spread", people: ALL, attr: "lab" }, even).violation).toBe(0);
  });

  it("depth.order counts inverted pairs (normalised by people per room − 1)", () => {
    const good = { "A-3": "f1", "A-2": "d1", "A-1": "m1", "A-0": "b1" };
    const blk = (direction: "seniorBack" | "seniorFront"): RuleBlock => ({
      type: "depth.order",
      people: ALL,
      direction,
    });
    expect(ev(blk("seniorBack"), good).violation).toBe(0);
    // 正規化 = ⌈6 人 / 2 部屋⌉ − 1 = 2。完全に逆: 6 組 / 2
    expect(ev(blk("seniorFront"), good).violation).toBe(3);
    const oneSwap = { "A-3": "d1", "A-2": "f1", "A-1": "m1", "A-0": "b1" };
    expect(ev(blk("seniorBack"), oneSwap)).toMatchObject({
      violation: 0.5,
      seats: ["A-2", "A-3"],
    });
  });

  it("group.mixAdjacent counts same-attr adjacent pairs", () => {
    const a = { "A-0": "f1", "A-1": "d1", "A-2": "m1", "A-3": "m2" };
    expect(ev({ type: "group.mixAdjacent", people: ALL, attr: "lab" }, a)).toMatchObject({
      violation: 1,
      seats: ["A-0", "A-1"],
    });
    expect(ev({ type: "group.mixAdjacent", people: ALL, attr: "role" }, a).violation).toBe(1);
  });

  it("group.buddy counts A members without enough same-lab B nearby", () => {
    const blk = (scope: "sameRoom" | "adjacent", min = 1): RuleBlock => ({
      type: "group.buddy",
      a: roles("m1", "b4"),
      b: roles("faculty", "d1"),
      scope,
      min,
    });
    // A = m1(Y), m2(X), b1(Y), b2(X)。B = f1(X), d1(X)
    const a = { "A-0": "f1", "A-1": "m2", "A-2": "b2", "B-0": "d1", "B-1": "m1", "B-2": "b1" };
    // m1, b1 は Y で同研究室の B がいない
    expect(ev(blk("sameRoom"), a).violation).toBe(2);
    // 隣: m2 は f1 の隣。b2 の隣は m2 のみ
    expect(ev(blk("adjacent"), a)).toMatchObject({ violation: 3, members: ["m1", "b1", "b2"] });
    expect(ev(blk("sameRoom", 2), a).violation).toBe(4);
  });

  it("group.labBalance is the per-room distance to the global lab ratio", () => {
    // 全体: X 4/6, Y 2/6
    const balanced = {
      "A-0": "f1",
      "A-1": "d1",
      "A-2": "m1",
      "B-0": "m2",
      "B-1": "b2",
      "B-2": "b1",
    };
    expect(ev({ type: "group.labBalance", people: ALL }, balanced).violation).toBe(0);
    const split = { "A-0": "f1", "A-1": "d1", "A-2": "m2", "A-3": "b2", "B-0": "m1", "B-1": "b1" };
    // A: |4 − 8/3| + |0 − 4/3| = 8/3 → 4/3。B: |0 − 4/3| + |2 − 2/3| = 8/3 → 4/3
    expect(ev({ type: "group.labBalance", people: ALL }, split).violation).toBeCloseTo(8 / 3, 5);
  });
});

describe("logic blocks", () => {
  const a = { "A-0": "f1", "A-1": "m1", "B-0": "d1" };
  const fail: RuleBlock = { type: "room.only", rooms: ["A"], people: roles("faculty") }; // 1
  const fail2: RuleBlock = { type: "room.exclude", rooms: [], people: ALL }; // 3
  const ok: RuleBlock = {
    type: "person.pin",
    memberId: "f1",
    target: { kind: "room", roomId: "A" },
  }; // 0

  it("any = min, all = sum", () => {
    expect(ev({ type: "logic.any", children: [fail, fail2] }, a).violation).toBe(1);
    expect(ev({ type: "logic.any", children: [fail, ok] }, a).violation).toBe(0);
    expect(ev({ type: "logic.all", children: [fail, fail2] }, a).violation).toBe(4);
    expect(ev({ type: "logic.any", children: [] }, a).violation).toBe(0);
  });

  it("ifThen applies `then` only when the condition holds", () => {
    expect(ev({ type: "logic.ifThen", condition: ok, then: fail2 }, a).violation).toBe(3);
    expect(ev({ type: "logic.ifThen", condition: fail, then: fail2 }, a).violation).toBe(0);
    expect(ev({ type: "logic.ifThen", condition: null, then: fail2 }, a).violation).toBe(0);
    // culprits は帰結側
    expect(ev({ type: "logic.ifThen", condition: ok, then: fail }, a).members).toEqual(["m1"]);
  });

  it("nested logic", () => {
    const nested: RuleBlock = {
      type: "logic.all",
      children: [{ type: "logic.any", children: [fail, fail2] }, fail],
    };
    expect(ev(nested, a).violation).toBe(2);
  });
});
