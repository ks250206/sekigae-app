import { createRule } from "@/domain/factory";
import type { ID } from "@/domain/schema";
import type { Rule, RuleBlock } from "@/domain/rules";
import { newId } from "@/lib/id";
import { clone, type Get, type Update } from "./types";

export interface RulesSlice {
  addRule: (block: RuleBlock, init?: Partial<Omit<Rule, "block">>, index?: number) => ID;
  updateRule: (id: ID, patch: Partial<Omit<Rule, "id">>) => void;
  /** ブロック本体を差し替え */
  setRuleBlock: (id: ID, block: RuleBlock) => void;
  removeRules: (ids: ID[]) => void;
  duplicateRule: (id: ID) => ID | null;
  moveRule: (id: ID, toIndex: number) => void;
  setRulesEnabled: (ids: ID[], enabled: boolean) => void;
}

export function createRulesSlice(update: Update, _get: Get): RulesSlice {
  return {
    addRule: (block, init, index) => {
      const rule = createRule(block, init);
      update((d) => {
        if (index === undefined) d.rules.push(rule);
        else d.rules.splice(index, 0, rule);
      });
      return rule.id;
    },
    updateRule: (id, patch) =>
      update((d) => {
        const r = d.rules.find((x) => x.id === id);
        if (r) Object.assign(r, patch);
      }),
    setRuleBlock: (id, block) =>
      update((d) => {
        const r = d.rules.find((x) => x.id === id);
        if (r) r.block = block;
      }),
    removeRules: (ids) =>
      update((d) => {
        const set = new Set(ids);
        d.rules = d.rules.filter((r) => !set.has(r.id));
      }),
    duplicateRule: (id) => {
      let created: ID | null = null;
      update((d) => {
        const i = d.rules.findIndex((r) => r.id === id);
        if (i < 0) return;
        const copy = { ...clone(d.rules[i]!), id: newId("rule_") };
        created = copy.id;
        d.rules.splice(i + 1, 0, copy);
      });
      return created;
    },
    moveRule: (id, toIndex) =>
      update((d) => {
        const i = d.rules.findIndex((r) => r.id === id);
        if (i < 0) return;
        const [r] = d.rules.splice(i, 1);
        d.rules.splice(Math.max(0, Math.min(toIndex, d.rules.length)), 0, r!);
      }),
    setRulesEnabled: (ids, enabled) =>
      update((d) => {
        const set = new Set(ids);
        for (const r of d.rules) if (set.has(r.id)) r.enabled = enabled;
      }),
  };
}
