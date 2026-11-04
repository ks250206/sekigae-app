import { describe, expect, it } from "vite-plus/test";
import type { RuleBlock } from "@/domain/rules";
import { getAt, insertAt, moveWithin, parsePath, pathKey, setAt } from "./ruleTree";

const a: RuleBlock = { type: "seat.empty", seats: { op: "all" } };
const b: RuleBlock = { type: "group.labBalance", people: { op: "all" } };
const c: RuleBlock = { type: "prev.same", people: { op: "all" }, scope: "seat" };

describe("rule tree", () => {
  const root: RuleBlock = {
    type: "logic.all",
    children: [a, { type: "logic.ifThen", condition: b, then: null }],
  };

  it("gets and sets by path", () => {
    expect(getAt(root, ["children", 1, "condition"])).toBe(b);
    const removed = setAt(root, ["children", 0], null) as Extract<RuleBlock, { type: "logic.all" }>;
    expect(removed.children).toHaveLength(1);
    const replaced = setAt(root, ["children", 1, "then"], c)!;
    expect(getAt(replaced, ["children", 1, "then"])).toBe(c);
    expect(getAt(root, ["children", 1, "then"])).toBeNull();
  });

  it("inserts into containers", () => {
    const next = insertAt(root, [], "children", 1, c) as Extract<RuleBlock, { type: "logic.all" }>;
    expect(next.children[1]).toBe(c);
    expect(insertAt(root, ["children", 1], "condition", 0, c)).toBeNull(); // occupied
    expect(getAt(insertAt(root, ["children", 1], "then", 0, c)!, ["children", 1, "then"])).toBe(c);
  });

  it("moves within a rule and refuses invalid moves", () => {
    const moved = moveWithin(root, ["children", 0], [], "children", 2) as Extract<
      RuleBlock,
      { type: "logic.all" }
    >;
    expect(moved.children.map((x) => x.type)).toEqual(["logic.ifThen", "seat.empty"]);
    const intoIf = moveWithin(root, ["children", 0], ["children", 1], "then", 0)!;
    expect(getAt(intoIf, ["children", 0, "then"])).toBe(a);
    // 自分の中へは移動できない
    expect(moveWithin(root, ["children", 1], ["children", 1], "then", 0)).toBeNull();
  });

  it("serializes paths", () => {
    expect(parsePath(pathKey(["children", 1, "then"]))).toEqual(["children", 1, "then"]);
    expect(parsePath("")).toEqual([]);
  });
});
