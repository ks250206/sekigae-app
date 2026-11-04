import { beforeEach, describe, expect, it } from "vite-plus/test";
import { useProjectStore } from "@/store/project";
import { makeProject } from "@/test/factories";
import {
  findEquivalentRule,
  ruleActionsForMember,
  ruleActionsForRoom,
  ruleActionsForSeat,
  type RuleActionItem,
} from "./contextActions";

const rules = () => useProjectStore.getState().project.rules;
const find = (items: RuleActionItem[], id: string): RuleActionItem | undefined => {
  for (const it of items) {
    if (it.id === id) return it;
    const c = it.children && find(it.children, id);
    if (c) return c;
  }
  return undefined;
};

describe("context-menu rule actions", () => {
  beforeEach(() => useProjectStore.getState().replaceProject(makeProject("medium")));

  it("creates seat rules with origin contextMenu and avoids duplicates", () => {
    const items = ruleActionsForSeat("r1-s1", { silent: true });
    expect(items.map((i) => i.id)).toEqual(["seat.pinMember", "seat.onlyRole", "seat.empty"]);
    const pin = find(items, "seat.pinMember:m1")!;
    expect(pin.label).toContain(useProjectStore.getState().project.members[0]!.name);
    const id = pin.run!();
    expect(rules()).toHaveLength(1);
    expect(rules()[0]).toMatchObject({
      id,
      origin: "contextMenu",
      strength: "hard",
      block: { type: "seat.pin", seatId: "r1-s1", memberId: "m1" },
    });
    // 同じ操作をもう一度 → 作らない
    const again = find(ruleActionsForSeat("r1-s1", { silent: true }), "seat.pinMember:m1")!;
    expect(again.exists).toBe(true);
    expect(again.run!()).toBe(id);
    expect(rules()).toHaveLength(1);
    // person.pin(seat) は seat.pin と同等とみなす
    const memberPin = ruleActionsForMember("m1", { seatId: "r1-s1" }, { silent: true })[0]!;
    expect(memberPin.id).toBe("member.pinSeat");
    expect(memberPin.exists).toBe(true);
  });

  it("creates room rules (prefer is soft)", () => {
    const items = ruleActionsForRoom("r2", { silent: true });
    find(items, "room.prefer:doctor")!.run!();
    find(items, "room.only:staff")!.run!();
    expect(rules().map((r) => [r.block.type, r.strength])).toEqual([
      ["room.prefer", "soft"],
      ["room.only", "hard"],
    ]);
  });

  it("creates member rules; pair rules are order-independent", () => {
    const sep = find(ruleActionsForMember("m1", {}, { silent: true }), "member.separate:m2")!;
    sep.run!();
    const reverse = find(ruleActionsForMember("m2", {}, { silent: true }), "member.separate:m1")!;
    expect(reverse.exists).toBe(true);
    expect(
      findEquivalentRule(rules(), {
        type: "pair.relation",
        a: { op: "members", ids: ["m2"] },
        b: { op: "members", ids: ["m1"] },
        relation: "differentRoom",
      }),
    ).toBeDefined();
    const room = find(
      ruleActionsForMember("m3", { roomId: "r3" }, { silent: true }),
      "member.pinRoom",
    )!;
    expect(room.children![0]!.id).toBe("member.pinRoom:r3");
    expect(ruleActionsForMember("nobody")).toEqual([]);
  });
});
