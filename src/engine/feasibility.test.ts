import { describe, expect, it } from "vite-plus/test";
import { bitsetToArray } from "./bitset";
import { compilePeople, compileSeats } from "./compile";
import { buildContext } from "./context";
import { buildDomains } from "./domains";
import { checkFeasibility } from "./feasibility";
import { hopcroftKarp } from "./matching";
import { buildModel } from "./model";
import { rule, tinyProject } from "./testing";

const ids = (ctx: { seatIds: string[] }, b: Uint32Array) =>
  bitsetToArray(b).map((s) => ctx.seatIds[s]);

describe("expression compilation", () => {
  const p = tinyProject({
    rooms: [
      ["A", 3],
      ["B", 3],
    ],
    labs: ["X"],
    members: [
      { id: "a", role: "d1", labId: "X", tags: ["intl"] },
      { id: "b", role: "wd1" },
      { id: "c", role: "m1", labId: "X" },
    ],
  });
  const ctx = buildContext(p);
  const people = (e: Parameters<typeof compilePeople>[1]) =>
    bitsetToArray(compilePeople(ctx, e)).map((m) => ctx.memberIds[m]);

  it("compiles person expressions with and / or / not", () => {
    expect(people({ op: "roleGroup", in: ["doctor"] })).toEqual(["a"]);
    expect(
      people({
        op: "or",
        args: [
          { op: "roleGroup", in: ["doctor"] },
          { op: "role", in: ["wd1"] },
        ],
      }),
    ).toEqual(["a", "b"]);
    expect(
      people({
        op: "and",
        args: [
          { op: "lab", in: ["X"] },
          { op: "not", arg: { op: "tag", in: ["intl"] } },
        ],
      }),
    ).toEqual(["c"]);
    expect(people({ op: "members", ids: ["c", "gone"] })).toEqual(["c"]);
  });

  it("compiles seat expressions", () => {
    expect(ids(ctx, compileSeats(ctx, { op: "rooms", roomIds: ["B"] }))).toEqual([
      "B-0",
      "B-1",
      "B-2",
    ]);
    expect(
      ids(
        ctx,
        compileSeats(ctx, {
          op: "and",
          args: [{ op: "all" }, { op: "not", arg: { op: "rooms", roomIds: ["A"] } }],
        }),
      ),
    ).toEqual(["B-0", "B-1", "B-2"]);
    expect(
      ids(ctx, compileSeats(ctx, { op: "depth", roomIds: [], from: "front", ratio: 0.34 })),
    ).toEqual(["A-0", "B-0"]);
  });

  it("records dangling references as diagnostics", () => {
    const q = structuredClone(p);
    q.rules = [
      rule(
        { type: "room.only", rooms: ["nope"], people: { op: "members", ids: ["ghost"] } },
        "hard",
        1,
        "r1",
      ),
      rule({ type: "seat.pin", seatId: null, memberId: "a" }, "hard", 1, "r2"),
      rule({ type: "group.labBalance", people: { op: "lab", in: ["L?"] } }, "hard", 1, "r3"),
    ];
    const model = buildModel(buildContext(q));
    const codes = model.diagnostics.map((d) => `${d.code}:${d.ruleId}`).sort();
    expect(codes).toEqual([
      "danglingLab:r3",
      "danglingMember:r1",
      "danglingRoom:r1",
      "incompleteRule:r2",
      "softOnlyAsHard:r3",
    ]);
  });

  it("context is structured-cloneable", () => {
    expect(() => structuredClone(ctx)).not.toThrow();
  });
});

describe("domains", () => {
  it("applies hard unary rules, ignores soft / logic-nested ones, and fixes locks", () => {
    const p = tinyProject({
      rooms: [
        ["A", 2],
        ["B", 2],
      ],
      members: [
        { id: "f", role: "faculty" },
        { id: "s", role: "m1" },
        { id: "t", role: "b4" },
      ],
      assignment: { "B-1": "t" },
      locks: ["B-1"],
      rules: [
        rule({ type: "room.only", rooms: ["A"], people: { op: "role", in: ["faculty"] } }),
        rule(
          { type: "person.avoid", memberId: "f", seats: { op: "seats", seatIds: ["A-0"] } },
          "soft",
        ),
        rule({
          type: "logic.all",
          children: [{ type: "seat.empty", seats: { op: "seats", seatIds: ["A-1"] } }],
        }),
      ],
    });
    const ctx = buildContext(p);
    const d = buildDomains(ctx, buildModel(ctx).compiler);
    const dom = (id: string) => ids(ctx, d.allowed[ctx.memberIndex.get(id)!]!);
    expect(dom("f")).toEqual(["A-0", "A-1", "B-0"]);
    expect(dom("s")).toEqual(["B-0"]);
    expect(dom("t")).toEqual(["B-1"]);
    expect(d.free.map((m) => ctx.memberIds[m])).toEqual(["f", "s"]);
  });

  it("supports room scope and unassignedOnly scope", () => {
    const p = tinyProject({
      rooms: [
        ["A", 2],
        ["B", 2],
      ],
      members: [{ id: "x" }, { id: "y" }, { id: "z" }],
      assignment: { "A-0": "x", "B-0": "y" },
    });
    const ctx = buildContext(p);
    const c = buildModel(ctx).compiler;
    const rooms = buildDomains(ctx, c, { kind: "rooms", roomIds: ["A"] });
    expect(rooms.free.map((m) => ctx.memberIds[m])).toEqual(["x", "z"]);
    expect(ids(ctx, rooms.allowed[0]!)).toEqual(["A-0", "A-1"]);
    const un = buildDomains(ctx, c, { kind: "unassignedOnly" });
    expect(un.free.map((m) => ctx.memberIds[m])).toEqual(["z"]);
    expect(ids(ctx, un.allowed[2]!)).toEqual(["A-1", "B-1"]);
  });
});

describe("Hopcroft–Karp", () => {
  it("finds a maximum matching", () => {
    const m = hopcroftKarp([[0, 1], [0], [1, 2], [2]], 3);
    expect(m.size).toBe(3);
  });
});

describe("checkFeasibility", () => {
  const four = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `p${i}`, role: "m1" as const }));

  it("ok when everyone fits", () => {
    const p = tinyProject({ rooms: [["A", 3]], members: four(3) });
    expect(checkFeasibility(p)).toMatchObject({ ok: true, members: 3, seats: 3, assignable: 3 });
  });

  it("notEnoughSeats", () => {
    const p = tinyProject({ rooms: [["A", 3]], members: four(5) });
    const r = checkFeasibility(p);
    expect(r.ok).toBe(false);
    expect(r.assignable).toBe(3);
    expect(r.diagnostics[0]).toMatchObject({
      code: "notEnoughSeats",
      params: { members: 5, seats: 3 },
    });
  });

  it("notEnoughSeats counts seats removed by seat.empty", () => {
    const p = tinyProject({
      rooms: [["A", 4]],
      members: four(4),
      rules: [rule({ type: "seat.empty", seats: { op: "seats", seatIds: ["A-0"] } })],
    });
    expect(checkFeasibility(p).diagnostics[0]).toMatchObject({
      code: "notEnoughSeats",
      params: { members: 4, seats: 3, totalSeats: 4 },
    });
  });

  it("emptyDomain", () => {
    const p = tinyProject({
      rooms: [["A", 3]],
      members: four(2),
      rules: [
        rule({ type: "person.avoid", memberId: "p0", seats: { op: "all" } }, "hard", 1, "avoid"),
      ],
    });
    expect(checkFeasibility(p).diagnostics[0]).toMatchObject({
      code: "emptyDomain",
      params: { memberId: "p0", ruleIds: ["avoid"] },
    });
  });

  it("seatConflict", () => {
    const p = tinyProject({
      rooms: [["A", 3]],
      members: four(2),
      rules: [
        rule({ type: "seat.pin", seatId: "A-0", memberId: "p0" }, "hard", 1, "r1"),
        rule(
          { type: "person.pin", memberId: "p1", target: { kind: "seat", seatId: "A-0" } },
          "hard",
          1,
          "r2",
        ),
      ],
    });
    const d = checkFeasibility(p).diagnostics[0]!;
    expect(d.code).toBe("seatConflict");
    expect(d.params.seatId).toBe("A-0");
    expect([...(d.params.ruleIds as string[])].sort()).toEqual(["r1", "r2"]);
  });

  it("restrictedSeatsShortage: 4 faculty pinned to a 3-seat room", () => {
    const p = tinyProject({
      rooms: [
        ["F", 3],
        ["S", 5],
      ],
      members: [
        ...Array.from({ length: 4 }, (_, i) => ({ id: `f${i}`, role: "faculty" as const })),
        { id: "s0", role: "m1" },
      ],
      rules: Array.from({ length: 4 }, (_, i) =>
        rule(
          { type: "person.pin", memberId: `f${i}`, target: { kind: "room", roomId: "F" } },
          "hard",
          1,
          `pin${i}`,
        ),
      ),
    });
    const r = checkFeasibility(p);
    expect(r.ok).toBe(false);
    expect(r.diagnostics[0]).toMatchObject({
      code: "restrictedSeatsShortage",
      params: { people: 4, seats: 3, seatIds: ["F-0", "F-1", "F-2"] },
    });
  });

  it("restrictedSeatsShortage: seat.only leaves too few seats for others", () => {
    const p = tinyProject({
      rooms: [
        ["A", 3],
        ["B", 2],
      ],
      members: [{ id: "f", role: "faculty" }, ...four(3)],
      rules: [
        rule(
          {
            type: "seat.only",
            seats: { op: "rooms", roomIds: ["A"] },
            people: { op: "role", in: ["faculty"] },
          },
          "hard",
          1,
          "only",
        ),
      ],
    });
    const d = checkFeasibility(p).diagnostics[0]!;
    expect(d).toMatchObject({
      code: "restrictedSeatsShortage",
      params: { people: 3, seats: 2, ruleIds: ["only"] },
    });
  });

  it("locks reduce available seats and are reported", () => {
    const p = tinyProject({
      rooms: [["A", 3]],
      members: [...four(3)],
      assignment: {},
      locks: ["A-0"],
    });
    const r = checkFeasibility(p);
    expect(r.ok).toBe(false);
    expect(r.diagnostics[0]!.code).toBe("notEnoughSeats");
  });
});
