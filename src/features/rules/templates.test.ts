import { beforeEach, describe, expect, it } from "vite-plus/test";
import { ruleBlockSchema, exprDepth, MAX_EXPR_DEPTH } from "@/domain/rules";
import { resources } from "@/i18n/resources";
import { useProjectStore } from "@/store/project";
import { makeProject } from "@/test/factories";
import { addTemplateRule } from "./actions";
import { getPath } from "./registry";
import { useRulesUi } from "./rulesUi";
import { RULE_TEMPLATES, templateById } from "./templates";

describe("rule templates", () => {
  beforeEach(() => {
    useProjectStore.getState().replaceProject(makeProject("small"));
    useRulesUi.setState({ pendingOpen: null, focusRuleId: null });
  });

  it("are valid blocks with translated names", () => {
    expect(RULE_TEMPLATES).toHaveLength(8);
    for (const tpl of RULE_TEMPLATES) {
      const b = tpl.create();
      expect(ruleBlockSchema.safeParse(b).success, tpl.id).toBe(true);
      for (const e of [getPath(b, "people"), getPath(b, "a"), getPath(b, "b")])
        if (e) expect(exprDepth(e as never)).toBeLessThanOrEqual(MAX_EXPR_DEPTH);
      for (const lng of ["ja", "en"] as const) {
        expect(getPath(resources[lng].rules, `${tpl.i18nKey}.name`)).toBeTypeOf("string");
      }
    }
  });

  it("adds rules with origin 'template' and opens the slot to fill", () => {
    const id = addTemplateRule(templateById("facultyRoom")!);
    const rule = useProjectStore.getState().project.rules.find((r) => r.id === id)!;
    expect(rule.origin).toBe("template");
    expect(rule.strength).toBe("hard");
    expect(useRulesUi.getState().pendingOpen).toEqual({ ruleId: id, slot: "rooms", path: "" });

    const wd = addTemplateRule(templateById("wdKeepSeat")!);
    const wdRule = useProjectStore.getState().project.rules.find((r) => r.id === wd)!;
    expect(wdRule.block).toEqual({
      type: "prev.same",
      people: { op: "roleGroup", in: ["workingDoctor"] },
      scope: "seat",
    });
  });
});
