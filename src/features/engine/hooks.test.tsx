import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { makeProject } from "@/test/factories";
import { history, useProjectStore } from "@/store/project";
import { useFeasibility } from "./useFeasibility";
import { useSolver } from "./useSolver";
import { useViolations } from "./useViolations";

const s = () => useProjectStore.getState();

beforeEach(() => {
  const p = makeProject("small", 1);
  p.rules = [
    {
      id: "pin",
      enabled: true,
      strength: "hard",
      weight: 1,
      block: { type: "seat.pin", seatId: "r1-s1", memberId: "m2" },
    },
  ];
  s().replaceProject(p);
  history.clear();
});

describe("useSolver", () => {
  it("runs (main-thread fallback), reports progress and applies in one undo step", async () => {
    const { result } = renderHook(() => useSolver());
    const planId = s().project.activePlanId;
    let res: Awaited<ReturnType<typeof result.current.run>> = null;
    await act(async () => {
      res = await result.current.run({ seed: 7, presets: ["mixLab"], iterations: 5000 });
    });
    expect(result.current.status).toBe("done");
    expect(res).not.toBeNull();
    const plan = s().project.plans.find((p) => p.id === planId)!;
    expect(plan.assignment["r1-s1"]).toBe("m2");
    expect(plan.seed).toBe(7);
    expect(Object.keys(plan.assignment)).toHaveLength(10);
    expect(result.current.diff()).toMatchObject({ moved: [], added: [], removed: [] });
    act(() => history.undo());
    expect(s().project.plans.find((p) => p.id === planId)!.assignment).toEqual({});
  });

  it("can skip applying and returns the diff", async () => {
    const { result } = renderHook(() => useSolver());
    await act(async () => {
      await result.current.run({ seed: 1, iterations: 2000, apply: false });
    });
    expect(Object.keys(s().project.plans[0]!.assignment)).toHaveLength(0);
    expect(result.current.diff()!.added).toHaveLength(10);
  });
});

describe("useViolations", () => {
  it("re-evaluates on manual edits", () => {
    const { result } = renderHook(() => useViolations());
    expect(result.current.hardViolations).toBe(1);
    expect(result.current.violations[0]).toMatchObject({ ruleId: "pin", memberIds: ["m2"] });
    act(() => s().assignSeat(s().project.activePlanId, "r1-s1", "m2"));
    expect(result.current.hardViolations).toBe(0);
    expect(result.current.violations).toEqual([]);
  });
});

describe("useFeasibility", () => {
  it("debounces and reports infeasibility", async () => {
    const { result } = renderHook(() => useFeasibility({ debounceMs: 10 }));
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.result?.ok).toBe(true);
    act(() =>
      s().update((d) => {
        d.rules.push({
          id: "pin2",
          enabled: true,
          strength: "hard",
          weight: 1,
          block: { type: "seat.pin", seatId: "r1-s1", memberId: "m3" },
        });
      }),
    );
    await waitFor(() => expect(result.current.result?.ok).toBe(false));
    expect(result.current.result?.diagnostics[0]?.code).toBe("seatConflict");
  });
});
