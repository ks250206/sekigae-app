/** ルールの絞り込み（#99）と JSON 入出力（§7.4） */
import { z } from "zod";
import { RULE_CATEGORY, ruleSchema, type Rule } from "@/domain/rules";
import type { ID, Project } from "@/domain/schema";
import { newId } from "@/lib/id";
import { ruleRelatesToMember, ruleRelatesToRoom } from "./analysis";
import type { RuleFilters } from "./rulesUi";

export function filterRules(
  rules: readonly Rule[],
  f: RuleFilters,
  project: Project,
  violationCounts?: Record<ID, number>,
): Rule[] {
  const member =
    f.related?.kind === "member" ? project.members.find((m) => m.id === f.related!.id) : undefined;
  return rules.filter((r) => {
    if (f.categories.length && !f.categories.includes(RULE_CATEGORY[r.block.type])) return false;
    if (f.strength !== "all" && r.strength !== f.strength) return false;
    if (f.enabled === "on" && !r.enabled) return false;
    if (f.enabled === "off" && r.enabled) return false;
    if (f.violations && !((violationCounts?.[r.id] ?? 0) > 0)) return false;
    if (f.related?.kind === "member" && (!member || !ruleRelatesToMember(r, member))) return false;
    if (f.related?.kind === "room" && !ruleRelatesToRoom(r, f.related.id, project)) return false;
    return true;
  });
}

export function exportRulesJson(rules: readonly Rule[]): string {
  return JSON.stringify({ kind: "sekigae-rules", version: 1, rules }, null, 2);
}

/** JSON（配列 or { rules: [...] }）を読み、新しい ID を振ったルールを返す。不正なら null */
export function parseRulesJson(text: string): Rule[] | null {
  try {
    const raw: unknown = JSON.parse(text);
    const list = Array.isArray(raw) ? raw : (raw as { rules?: unknown })?.rules;
    const parsed = z.array(ruleSchema).safeParse(list);
    if (!parsed.success) return null;
    return parsed.data.map((r) => ({ ...r, id: newId("rule_") }));
  } catch {
    return null;
  }
}
