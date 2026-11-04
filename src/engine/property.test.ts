/**
 * プロパティテスト（#112）: ランダムなプロジェクト・ルール・ロック・範囲に対して
 * - 1 席 ↔ 1 人（重複なし）
 * - 再配置対象は許容席の外に座らない（固定者は固定席のまま）
 * - ロック席は変わらない
 * - 同じシード ⇒ 同じ結果
 */
import fc from "fast-check";
import { describe, expect, it } from "vite-plus/test";
import type { Rule, RuleBlock } from "@/domain/rules";
import type { Project } from "@/domain/schema";
import { makeProject } from "@/test/factories";
import { bitHas } from "./bitset";
import { prepare, solve } from "./solver";
import type { SolveOptions } from "./types";

function blockPool(p: Project): RuleBlock[] {
  const lab = p.labs[0]!.id;
  const room = p.layout.rooms[0]!.id;
  const seat = p.layout.rooms[0]!.seats[1]!.id;
  return [
    { type: "seat.pin", seatId: seat, memberId: "m2" },
    { type: "person.pin", memberId: "m3", target: { kind: "room", roomId: room } },
    { type: "person.avoid", memberId: "m4", seats: { op: "rooms", roomIds: [room] } },
    {
      type: "seat.only",
      seats: { op: "depth", roomIds: [], from: "back", count: 1 },
      people: { op: "roleGroup", in: ["staff", "doctor"] },
    },
    { type: "seat.empty", seats: { op: "depth", roomIds: [room], from: "front", count: 1 } },
    { type: "room.exclude", rooms: [room], people: { op: "role", in: ["b4"] } },
    {
      type: "room.only",
      rooms: [room],
      people: { op: "not", arg: { op: "roleGroup", in: ["bachelor"] } },
    },
    {
      type: "room.count",
      rooms: [],
      people: { op: "lab", in: [lab] },
      op: "lte",
      value: 50,
      unit: "percent",
    },
    {
      type: "pair.relation",
      a: { op: "lab", in: [lab] },
      b: { op: "all" },
      relation: "notAdjacent",
      qualifier: { lab: "same" },
    },
    { type: "group.mixAdjacent", people: { op: "all" }, attr: "role" },
    { type: "depth.order", people: { op: "all" }, direction: "seniorBack" },
    {
      type: "logic.any",
      children: [
        { type: "person.pin", memberId: "m5", target: { kind: "seat", seatId: seat } },
        { type: "room.diversity", rooms: [], attr: "lab", min: 2 },
      ],
    },
  ];
}

const arbCase = fc.record({
  size: fc.constantFrom("small" as const, "medium" as const),
  fixtureSeed: fc.integer({ min: 1, max: 1000 }),
  seed: fc.integer({ min: 0, max: 2 ** 31 }),
  rules: fc.array(
    fc.record({
      idx: fc.integer({ min: 0, max: 11 }),
      hard: fc.boolean(),
      weight: fc.constantFrom(1, 3, 5),
    }),
    { maxLength: 5 },
  ),
  lockCount: fc.integer({ min: 0, max: 3 }),
  dropMembers: fc.integer({ min: 0, max: 4 }),
  extraMembers: fc.integer({ min: 0, max: 3 }),
  scope: fc.constantFrom("all", "rooms", "unassignedOnly"),
  mode: fc.constantFrom("shuffle" as const, "improve" as const),
});

type Case = typeof arbCase extends fc.Arbitrary<infer T> ? T : never;

function buildCase(c: Case) {
  const p = makeProject(c.size, c.fixtureSeed);
  // 席数を超える人数も試す（small は 10 人 12 席）
  for (let i = 0; i < c.extraMembers; i++) p.members.push({ ...p.members[i]!, id: `x${i}` });
  const pool = blockPool(p);
  p.rules = c.rules.map((r, i): Rule => ({
    id: `r${i}`,
    enabled: true,
    strength: r.hard ? "hard" : "soft",
    weight: r.weight as Rule["weight"],
    block: pool[r.idx]!,
  }));
  // 現在の割当: 先頭から順に座らせ、一部を外し、先頭の席をロック
  const seats = p.layout.rooms.flatMap((r) => r.seats.map((s) => s.id));
  const plan = p.plans[0]!;
  plan.assignment = {};
  p.members.slice(c.dropMembers).forEach((m, i) => {
    if (i < seats.length) plan.assignment[seats[i]!] = m.id;
  });
  plan.locks = seats.slice(0, c.lockCount);
  const options: SolveOptions = {
    seed: c.seed,
    iterations: 3000,
    timeLimitMs: 60_000,
    mode: c.mode,
    presets: ["mixLab"],
    scope:
      c.scope === "rooms"
        ? { kind: "rooms", roomIds: [p.layout.rooms[0]!.id] }
        : { kind: c.scope as "all" },
  };
  if (c.scope === "unassignedOnly") options.scope = { kind: "unassignedOnly" };
  return { p, options };
}

describe("solver properties", () => {
  it("one seat per member, within domains, locks unchanged, reproducible", () => {
    fc.assert(
      fc.property(arbCase, (c) => {
        const { p, options } = buildCase(c);
        const input = { project: p, options };
        const r = solve(input);
        // 1 席 ↔ 1 人
        const mids = Object.values(r.assignment);
        expect(new Set(mids).size).toBe(mids.length);
        expect(mids.length + r.unassigned.length).toBe(p.members.length);
        // 許容席内
        const prep = prepare(input);
        const { ctx, domains } = prep;
        for (const [sid, mid] of Object.entries(r.assignment)) {
          const s = ctx.seatIndex.get(sid)!;
          const m = ctx.memberIndex.get(mid)!;
          expect(bitHas(domains.allowed[m]!, s)).toBe(true);
        }
        // 固定者・ロック
        const plan = p.plans[0]!;
        for (const sid of plan.locks) expect(r.assignment[sid]).toBe(plan.assignment[sid]);
        for (let m = 0; m < ctx.nMembers; m++) {
          const fs = domains.fixed[m]!;
          if (fs >= 0) expect(r.assignment[ctx.seatIds[fs]!]).toBe(ctx.memberIds[m]);
        }
        // 実行可能なら全員（席数まで）座る
        if (r.feasible) expect(r.unassigned).toHaveLength(0);
        // 同じシード ⇒ 同じ結果
        const again = solve(input);
        expect(again.assignment).toEqual(r.assignment);
        expect(again.score).toBe(r.score);
      }),
      { numRuns: 40 },
    );
  });
});
