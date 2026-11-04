import { describe, expect, it } from "vite-plus/test";
import { makeProject } from "@/test/factories";
import { buildContext } from "./context";
import { diffAssignments } from "./diff";
import { evaluatePlan } from "./evaluate";
import { IncrementalEvaluator } from "./evaluator";
import { buildModel } from "./model";
import { presetTerms, presetToRuleBlocks, PRESET_IDS } from "./presets";
import { prepare, solve, solveAsync, initialState } from "./solver";
import { createRng } from "@/lib/rng";
import { rule, tinyProject } from "./testing";
import { createSolverClient, SolveCancelledError } from "./client";

const fast = { iterations: 20_000, timeLimitMs: 60_000 };

describe("solve", () => {
  it("satisfies hard rules in a solvable instance", () => {
    const p = makeProject("medium", 3);
    const labA = p.labs[0]!.id;
    p.rules = [
      rule({ type: "seat.pin", seatId: "r1-s1", memberId: "m1" }),
      rule({
        type: "room.only",
        rooms: ["r3"],
        people: { op: "roleGroup", in: ["master", "bachelor"] },
      }),
      rule({
        type: "pair.relation",
        a: { op: "lab", in: [labA] },
        b: { op: "lab", in: [labA] },
        relation: "notAdjacent",
      }),
      rule({ type: "room.diversity", rooms: [], attr: "lab", min: 3 }),
    ];
    const r = solve({ project: p, options: { seed: 1, ...fast } });
    expect(r.feasible).toBe(true);
    expect(r.hardViolations).toBe(0);
    expect(r.assignment["r1-s1"]).toBe("m1");
    expect(Object.keys(r.assignment)).toHaveLength(30);
    expect(r.unassigned).toEqual([]);
    expect(r.breakdown).toHaveLength(4);
    // 評価 API と一致
    const q = structuredClone(p);
    q.plans[0]!.assignment = r.assignment;
    expect(evaluatePlan(q).hardViolations).toBe(0);
  });

  it("satisfies hard logic blocks via optimisation", () => {
    const p = tinyProject({
      rooms: [
        ["A", 3],
        ["B", 3],
      ],
      members: [{ id: "x" }, { id: "y" }, { id: "z" }],
      rules: [
        rule({
          type: "logic.ifThen",
          condition: { type: "person.pin", memberId: "x", target: { kind: "room", roomId: "A" } },
          then: {
            type: "pair.relation",
            a: { op: "members", ids: ["x"] },
            b: { op: "members", ids: ["y"] },
            relation: "adjacent",
          },
        }),
        rule({
          type: "logic.any",
          children: [
            { type: "person.pin", memberId: "x", target: { kind: "seat", seatId: "A-1" } },
            { type: "person.pin", memberId: "z", target: { kind: "seat", seatId: "B-2" } },
          ],
        }),
      ],
    });
    for (const seed of [1, 2, 3]) {
      const r = solve({ project: p, options: { seed, ...fast } });
      expect(r.hardViolations).toBe(0);
    }
  });

  it("is reproducible with the same seed", () => {
    const p = makeProject("medium", 2);
    const a = solve({
      project: p,
      options: { seed: 42, presets: ["mixLab", "seniorBack"], ...fast },
    });
    const b = solve({
      project: p,
      options: { seed: 42, presets: ["mixLab", "seniorBack"], ...fast },
    });
    expect(a.assignment).toEqual(b.assignment);
    expect(a.score).toBe(b.score);
    const c = solve({
      project: p,
      options: { seed: 43, presets: ["mixLab", "seniorBack"], ...fast },
    });
    expect(c.assignment).not.toEqual(a.assignment);
  });

  it("leaves extra members unassigned when seats run out", () => {
    const p = tinyProject({
      rooms: [["A", 3]],
      members: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }],
    });
    const r = solve({ project: p, options: { seed: 1, ...fast } });
    expect(r.unassigned).toHaveLength(1);
    expect(r.feasible).toBe(false);
    expect(r.diagnostics.map((d) => d.code)).toContain("notEnoughSeats");
  });

  it("keeps locked seats, and honours room / unassignedOnly scopes", () => {
    const p = makeProject("medium", 4);
    const plan = p.plans[0]!;
    const first = solve({ project: p, options: { seed: 5, ...fast } });
    plan.assignment = { ...first.assignment };
    plan.locks = ["r1-s1", "r2-s5"];
    // 3 人を外して未配置にする
    for (const sid of ["r1-s2", "r2-s3", "r3-s4"]) delete plan.assignment[sid];
    const locked = plan.locks.map((s) => plan.assignment[s]);

    const all = solve({ project: p, options: { seed: 6, presets: ["mixLab"], ...fast } });
    expect(plan.locks.map((s) => all.assignment[s])).toEqual(locked);

    const rooms = solve({
      project: p,
      options: { seed: 6, scope: { kind: "rooms", roomIds: ["r2"] }, ...fast },
    });
    for (const [sid, mid] of Object.entries(plan.assignment))
      if (!sid.startsWith("r2-") || plan.locks.includes(sid))
        expect(rooms.assignment[sid]).toBe(mid);

    const un = solve({
      project: p,
      options: { seed: 6, scope: { kind: "unassignedOnly" }, ...fast },
    });
    for (const [sid, mid] of Object.entries(plan.assignment)) expect(un.assignment[sid]).toBe(mid);
    expect(Object.keys(un.assignment)).toHaveLength(30);
    expect(diffAssignments(plan.assignment, un.assignment)).toMatchObject({
      moved: [],
      removed: [],
    });
  });

  it("improve mode starts from the current assignment", () => {
    const p = makeProject("medium", 4);
    const base = solve({ project: p, options: { seed: 9, presets: ["mixLab"], ...fast } });
    p.plans[0]!.assignment = base.assignment;
    const imp = solve({
      project: p,
      options: { seed: 10, presets: ["mixLab"], mode: "improve", ...fast },
    });
    expect(imp.score).toBeLessThanOrEqual(base.score + 1e-9);
    const d = diffAssignments(base.assignment, imp.assignment);
    expect(d.moved.length).toBeLessThan(30);
  });

  it("stops at time limit / optimum and reports progress", () => {
    const p = makeProject("large", 1);
    const seen: number[] = [];
    const r = solve(
      { project: p, options: { seed: 1, presets: ["mixLab"], timeLimitMs: 150, iterations: 1e9 } },
      { onProgress: (x) => seen.push(x.elapsedMs), progressIntervalMs: 20 },
    );
    expect(r.stats.stoppedBy).toBe("time");
    expect(seen.length).toBeGreaterThan(1);
    const easy = solve({
      project: tinyProject({ rooms: [["A", 3]], members: [{ id: "a" }] }),
      options: { seed: 1 },
    });
    expect(easy.stats.stoppedBy).toBe("optimal");
  });

  it("solveAsync can be cancelled", async () => {
    const p = makeProject("large", 1);
    const ctrl = new AbortController();
    const promise = solveAsync(
      {
        project: p,
        options: { seed: 1, presets: ["mixLab"], iterations: 1e9, timeLimitMs: 10_000 },
      },
      { signal: ctrl.signal },
    );
    setTimeout(() => ctrl.abort(), 30);
    const r = await promise;
    expect(r.stats.stoppedBy).toBe("cancelled");
    expect(Object.keys(r.assignment)).toHaveLength(100);
  });

  it("client (main-thread fallback) cancels the previous run on a new call", async () => {
    const client = createSolverClient({ createWorker: () => null });
    const p = makeProject("small", 1);
    const first = client.solve({
      project: p,
      options: { seed: 1, iterations: 1e9, timeLimitMs: 5_000 },
    });
    const second = client.solve({ project: p, options: { seed: 2, ...fast } });
    await expect(first).rejects.toBeInstanceOf(SolveCancelledError);
    const r = await second;
    expect(r.seed).toBe(2);
    client.dispose();
  });
});

describe("presets", () => {
  it("every preset compiles; random has no terms", () => {
    const p = makeProject("small", 1);
    for (const id of PRESET_IDS) {
      const r = solve({ project: p, options: { seed: 1, presets: [id], iterations: 2000 } });
      expect(r.breakdown.length).toBe(id === "random" ? 0 : 1);
    }
    expect(presetToRuleBlocks("mixLab").map((b) => b.type)).toEqual([
      "group.labBalance",
      "group.mixAdjacent",
    ]);
    expect(presetTerms(["mixLab", { id: "mixLab", weight: 3 }])).toEqual([
      expect.objectContaining({ id: "mixLab", weight: 5 }),
    ]);
  });

  it("seniorBack puts seniors at the back", () => {
    const p = tinyProject({
      rooms: [["A", 4]],
      members: [
        { id: "b", role: "b4" },
        { id: "f", role: "faculty" },
        { id: "m", role: "m1" },
        { id: "d", role: "d1" },
      ],
    });
    const r = solve({ project: p, options: { seed: 3, presets: ["seniorBack"], ...fast } });
    expect(r.assignment).toEqual({ "A-0": "b", "A-1": "m", "A-2": "d", "A-3": "f" });
  });

  it("nameOrder sorts by kana along seat labels", () => {
    const p = tinyProject({
      rooms: [["A", 4]],
      members: [
        { id: "x", name: "x", kana: "わ" },
        { id: "y", name: "y", kana: "あ" },
        { id: "z", name: "z", kana: "か" },
      ],
    });
    const r = solve({ project: p, options: { seed: 3, presets: ["nameOrder"], ...fast } });
    const order = Object.entries(r.assignment)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, m]) => m);
    expect(order).toEqual(["y", "z", "x"]);
  });

  it("mixLab reduces same-lab adjacency compared to clusterLab", () => {
    const p = makeProject("large", 2);
    const mix = solve({ project: p, options: { seed: 1, presets: ["mixLab"], ...fast } });
    const clu = solve({ project: p, options: { seed: 1, presets: ["clusterLab"], ...fast } });
    const sameLabAdj = (assignment: Record<string, string>) => {
      const q = structuredClone(p);
      q.plans[0]!.assignment = assignment;
      q.rules = [rule({ type: "group.mixAdjacent", people: { op: "all" }, attr: "lab" }, "soft")];
      return evaluatePlan(q).breakdown[0]!.violation;
    };
    expect(sameLabAdj(mix.assignment)).toBeLessThan(sameLabAdj(clu.assignment));
  });

  it("keepPrevious keeps last year's seats", () => {
    const p = tinyProject({
      rooms: [["A", 4]],
      members: [{ id: "a" }, { id: "b" }, { id: "c" }],
      previous: { assignment: { "A-3": "a", "A-0": "b", "A-2": "c" } },
    });
    const r = solve({ project: p, options: { seed: 1, presets: ["keepPrevious"], ...fast } });
    expect(r.assignment).toEqual({ "A-3": "a", "A-0": "b", "A-2": "c" });
  });
});

describe("incremental evaluation", () => {
  it("matches full recomputation after random moves", () => {
    const p = makeProject("medium", 7);
    const labs = p.labs.map((l) => l.id);
    p.rules = [
      rule({
        type: "room.count",
        rooms: [],
        people: { op: "roleGroup", in: ["master"] },
        op: "gte",
        value: 30,
        unit: "percent",
      }),
      rule(
        { type: "room.attrCap", rooms: ["r1"], attr: "gender", max: 50, unit: "percent" },
        "soft",
        3,
      ),
      rule(
        {
          type: "pair.relation",
          a: { op: "lab", in: [labs[0]!] },
          b: { op: "all" },
          relation: "sameRoom",
          qualifier: { role: "different" },
        },
        "soft",
        2,
      ),
      rule(
        {
          type: "group.buddy",
          a: { op: "role", in: ["m1"] },
          b: { op: "roleGroup", in: ["doctor"] },
          scope: "adjacent",
          min: 1,
        },
        "soft",
      ),
      rule(
        {
          type: "group.buddy",
          a: { op: "role", in: ["b4"] },
          b: { op: "roleGroup", in: ["doctor", "staff"] },
          scope: "sameRoom",
          min: 1,
        },
        "soft",
      ),
      rule({ type: "group.spread", people: { op: "all" }, attr: "gender" }, "soft"),
      rule(
        { type: "room.prefer", rooms: ["r2"], people: { op: "roleGroup", in: ["doctor"] } },
        "soft",
      ),
      rule({
        type: "logic.ifThen",
        condition: { type: "room.diversity", rooms: [], attr: "role", min: 4 },
        then: {
          type: "logic.any",
          children: [
            { type: "group.cluster", people: { op: "all" }, attr: "role" },
            { type: "seat.empty", seats: { op: "seatTag", in: [] } },
          ],
        },
      }),
    ];
    const prep = prepare({
      project: p,
      options: { presets: ["mixLab", "seniorBack", "nameOrder"] },
    });
    const st = initialState(prep.ctx, prep.domains, createRng(1));
    const ev = new IncrementalEvaluator(prep.model, st);
    const rng = createRng(2);
    for (let i = 0; i < 3000; i++) {
      const a = rng.int(prep.ctx.nMembers);
      const s = rng.int(prep.ctx.nSeats);
      if (st.seatOf[a] === s) continue;
      ev.propose(a, s);
      if (rng.next() < 0.5) ev.accept();
      else ev.reject();
      if (i % 100 === 0) {
        const score = ev.score;
        const hard = ev.hard;
        ev.recompute();
        expect(ev.score).toBeCloseTo(score, 6);
        expect(ev.hard).toBeCloseTo(hard, 6);
      }
    }
    const full = new IncrementalEvaluator(
      buildModel(buildContext(p), presetTerms(["mixLab", "seniorBack", "nameOrder"])),
      {
        seatOf: st.seatOf.slice(),
        memberAt: st.memberAt.slice(),
      },
    );
    const before = ev.score;
    ev.recompute();
    expect(full.score).toBeCloseTo(before, 6);
  });
});
