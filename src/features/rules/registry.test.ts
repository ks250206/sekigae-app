import { describe, expect, it } from "vite-plus/test";
import { RULE_TYPES, SOFT_ONLY_TYPES, ruleBlockSchema } from "@/domain/rules";
import { createEmptyProject, createRule } from "@/domain/factory";
import { resources } from "@/i18n/resources";
import {
  BLOCKS,
  BLOCKS_BY_CATEGORY,
  createBlock,
  firstUnsetSlot,
  getPath,
  setPath,
  validateRule,
} from "./registry";
import { templateSlots } from "./summary";

const lookup = (obj: unknown, key: string) => getPath(obj, key) as string | undefined;

describe("block registry", () => {
  it("defines every rule type with a schema-valid default", () => {
    for (const type of RULE_TYPES) {
      const def = BLOCKS[type];
      expect(def, type).toBeDefined();
      expect(def.type).toBe(type);
      const block = createBlock(type);
      expect(ruleBlockSchema.safeParse(block).success, type).toBe(true);
      expect(def.hardAllowed).toBe(!SOFT_ONLY_TYPES.has(type));
    }
    const total = Object.values(BLOCKS_BY_CATEGORY).reduce((n, xs) => n + xs.length, 0);
    expect(total).toBe(RULE_TYPES.length);
  });

  it.each(["ja", "en"] as const)("templates in %s contain exactly the block's slots", (lng) => {
    const rules = resources[lng].rules;
    for (const type of RULE_TYPES) {
      const def = BLOCKS[type];
      const template = lookup(rules, `${def.i18nKey}.template`);
      expect(template, `${lng} ${type}`).toBeTypeOf("string");
      expect(lookup(rules, `${def.i18nKey}.name`), `${lng} ${type} name`).toBeTypeOf("string");
      const tags = templateSlots(template!).sort();
      expect(tags, `${lng} ${type}`).toEqual(def.slots.map((s) => s.name).sort());
      for (const s of def.slots) {
        if (s.kind !== "enum") continue;
        for (const o of s.options ?? [])
          expect(
            lookup(rules, `values.${s.valueSet}.${o}`),
            `${lng} ${s.valueSet}.${o}`,
          ).toBeTypeOf("string");
      }
    }
  });

  it("finds the first unset slot", () => {
    expect(firstUnsetSlot(createBlock("room.only"))).toBe("people");
    expect(firstUnsetSlot(createBlock("seat.pin"))).toBe("seat");
    expect(firstUnsetSlot(createBlock("person.pin"))).toBe("member");
    expect(firstUnsetSlot(createBlock("prev.same"))).toBeNull();
    expect(firstUnsetSlot(createBlock("logic.any"))).toBeNull();
  });

  it("reads and writes nested paths immutably", () => {
    const b = createBlock("pair.relation");
    const withLab = setPath(b, "qualifier.lab", "same");
    expect(getPath(withLab, "qualifier.lab")).toBe("same");
    expect(getPath(b, "qualifier.lab")).toBeUndefined();
    const cleared = setPath(withLab, "qualifier.lab", undefined);
    expect("qualifier" in cleared).toBe(false);
  });

  it("validates rules", () => {
    const project = createEmptyProject();
    const prefer = createRule(createBlock("room.prefer"), { strength: "hard" });
    const codes = validateRule(prefer, { project }).map((i) => i.code);
    expect(codes).toContain("softOnly");
    expect(codes).toContain("unsetSlot");
    const prev = createRule(createBlock("prev.same"));
    expect(validateRule(prev, { project }).map((i) => i.code)).toEqual(["noPreviousPlan"]);
    const cap = createRule({
      type: "room.attrCap",
      rooms: [],
      attr: "lab",
      max: 120,
      unit: "percent",
    });
    expect(validateRule(cap, { project }).map((i) => i.code)).toEqual(["percentOver"]);
    const logic = createRule({
      type: "logic.any",
      children: [{ type: "logic.all", children: [{ type: "logic.any", children: [] }] }],
    });
    expect(validateRule(logic, { project }).map((i) => i.code)).toContain("tooDeep");
    expect(validateRule(createRule(createBlock("logic.ifThen")), { project })[0]?.code).toBe(
      "ifThenIncomplete",
    );
  });
});
