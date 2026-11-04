/** ルールの追加など、ストアと UI 状態をまたぐ操作 */
import type { RuleBlock, RuleOrigin, RuleType, Strength, Weight } from "@/domain/rules";
import type { ID } from "@/domain/schema";
import { useProjectStore } from "@/store/project";
import { createBlock, defaultStrength, firstUnsetSlot } from "./registry";
import { useRulesUi } from "./rulesUi";
import type { RuleTemplate } from "./templates";

export interface AddRuleOptions {
  origin?: RuleOrigin;
  strength?: Strength;
  weight?: Weight;
  index?: number;
  /** 追加後に開くスロット。undefined = 最初の未設定スロット、null = 開かない */
  openSlot?: string | null;
  note?: string;
}

export function addBlockRule(block: RuleBlock, opts: AddRuleOptions = {}): ID {
  const id = useProjectStore.getState().addRule(
    block,
    {
      origin: opts.origin ?? "user",
      strength: opts.strength ?? defaultStrength(block.type),
      weight: opts.weight ?? 3,
      note: opts.note,
    },
    opts.index,
  );
  const ui = useRulesUi.getState();
  ui.focusRule(id);
  const slot = opts.openSlot === undefined ? firstUnsetSlot(block) : opts.openSlot;
  if (slot) ui.requestOpenSlot(id, slot);
  return id;
}

export function addRuleOfType(type: RuleType, index?: number): ID {
  return addBlockRule(createBlock(type), { index });
}

export function addTemplateRule(tpl: RuleTemplate, index?: number): ID {
  return addBlockRule(tpl.create(), {
    origin: "template",
    strength: tpl.strength,
    weight: tpl.weight,
    index,
    openSlot: tpl.openSlot,
  });
}
