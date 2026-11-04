import { describe, expect, it } from "vite-plus/test";
import { createRule } from "./factory";
import { exprDepth, logicDepth, ruleSchema, type RuleBlock } from "./rules";

describe("rule schema", () => {
  it("validates nested logic and expressions", () => {
    const block: RuleBlock = {
      type: "logic.ifThen",
      condition: { type: "person.pin", memberId: "a", target: { kind: "room", roomId: "r1" } },
      then: {
        type: "logic.any",
        children: [
          {
            type: "room.count",
            rooms: ["r1"],
            people: {
              op: "or",
              args: [
                { op: "role", in: ["d3"] },
                { op: "roleGroup", in: ["workingDoctor"] },
              ],
            },
            op: "gte",
            value: 2,
            unit: "count",
          },
          {
            type: "pair.relation",
            a: { op: "all" },
            b: { op: "all" },
            relation: "notAdjacent",
            qualifier: { lab: "same", role: "same" },
          },
        ],
      },
    };
    const rule = createRule(block, { strength: "soft", weight: 4 });
    expect(ruleSchema.safeParse(rule).success).toBe(true);
    expect(logicDepth(block)).toBe(2);
  });

  it("rejects unknown roles", () => {
    const bad = createRule({
      type: "group.labBalance",
      people: { op: "role", in: ["x" as never] },
    });
    expect(ruleSchema.safeParse(bad).success).toBe(false);
  });

  it("measures expression depth", () => {
    expect(exprDepth({ op: "all" })).toBe(0);
    expect(
      exprDepth({
        op: "and",
        args: [
          { op: "or", args: [{ op: "all" }] },
          { op: "not", arg: { op: "all" } },
        ],
      }),
    ).toBe(2);
  });
});
