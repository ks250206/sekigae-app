/**
 * パレット → スタック、スタック内の並べ替え、論理ブロックへの出し入れ（#92 / #155）。
 * DnD のデータ形と、ドロップ時のストア操作（純粋なストア呼び出しのみ。React 非依存）。
 */
import type { RuleBlock, RuleType } from "@/domain/rules";
import type { ID } from "@/domain/schema";
import { batch, getProject, useProjectStore } from "@/store/project";
import { addRuleOfType, addTemplateRule } from "./actions";
import { createBlock, defaultStrength, firstUnsetSlot } from "./registry";
import {
  getAt,
  insertAt,
  moveWithin,
  pathKey,
  setAt,
  withinDepth,
  type BlockPath,
  type ContainerKey,
} from "./ruleTree";
import { useRulesUi } from "./rulesUi";
import { templateById } from "./templates";

export type DragData =
  | { source: "palette"; type: RuleType }
  | { source: "template"; templateId: string }
  | { source: "rule"; ruleId: ID }
  | { source: "child"; ruleId: ID; path: BlockPath };

export type DropData =
  | { target: "gap"; ruleId: ID; containerPath: BlockPath; key: ContainerKey; index: number }
  | { target: "rule"; ruleId: ID }
  | { target: "stackEnd" };

export const gapId = (ruleId: ID, containerPath: BlockPath, key: ContainerKey, index: number) =>
  `gap|${ruleId}|${pathKey(containerPath)}|${key}|${index}`;
export const childDragId = (ruleId: ID, path: BlockPath) => `child|${ruleId}|${pathKey(path)}`;

/** ドラッグ中のブロック（新規の場合は既定値） */
export function draggedBlock(d: DragData): RuleBlock | null {
  const p = getProject();
  switch (d.source) {
    case "palette":
      return createBlock(d.type);
    case "template":
      return templateById(d.templateId)?.create() ?? null;
    case "rule":
      return p.rules.find((r) => r.id === d.ruleId)?.block ?? null;
    case "child": {
      const r = p.rules.find((x) => x.id === d.ruleId);
      return r ? getAt(r.block, d.path) : null;
    }
  }
}

/** ギャップ（論理ブロックの中）にドロップできるか */
export function canDropInGap(d: DragData, gap: Extract<DropData, { target: "gap" }>): boolean {
  if (d.source === "rule" && d.ruleId === gap.ruleId) return false;
  const p = getProject();
  const target = p.rules.find((r) => r.id === gap.ruleId);
  const block = draggedBlock(d);
  if (!target || !block) return false;
  if (d.source === "child" && d.ruleId === gap.ruleId)
    return moveWithin(target.block, d.path, gap.containerPath, gap.key, gap.index) !== null;
  const next = insertAt(target.block, gap.containerPath, gap.key, gap.index, block);
  return next !== null && withinDepth(next);
}

/** 挿入位置 index（スタック上）へのドロップ */
export function dropOnStack(d: DragData, index: number): ID | null {
  const s = useProjectStore.getState();
  switch (d.source) {
    case "palette":
      return addRuleOfType(d.type, index);
    case "template": {
      const tpl = templateById(d.templateId);
      return tpl ? addTemplateRule(tpl, index) : null;
    }
    case "rule": {
      const from = s.project.rules.findIndex((r) => r.id === d.ruleId);
      if (from < 0) return null;
      s.moveRule(d.ruleId, from < index ? index - 1 : index);
      return d.ruleId;
    }
    case "child": {
      const src = s.project.rules.find((r) => r.id === d.ruleId);
      const child = src ? getAt(src.block, d.path) : null;
      if (!src || !child) return null;
      let id: ID | null = null;
      batch(() => {
        const st = useProjectStore.getState();
        st.setRuleBlock(src.id, setAt(src.block, d.path, null)!);
        id = st.addRule(
          child,
          {
            strength: defaultStrength(child.type) === "soft" ? "soft" : src.strength,
            weight: src.weight,
            origin: "user",
          },
          index,
        );
      });
      if (id) useRulesUi.getState().focusRule(id);
      return id;
    }
  }
}

/** 論理ブロックのギャップへのドロップ */
export function dropInGap(d: DragData, gap: Extract<DropData, { target: "gap" }>): boolean {
  if (!canDropInGap(d, gap)) return false;
  const s = useProjectStore.getState();
  const target = s.project.rules.find((r) => r.id === gap.ruleId)!;
  const childPath: BlockPath =
    gap.key === "children"
      ? [...gap.containerPath, "children", gap.index]
      : [...gap.containerPath, gap.key];
  if (d.source === "child" && d.ruleId === gap.ruleId) {
    s.setRuleBlock(
      target.id,
      moveWithin(target.block, d.path, gap.containerPath, gap.key, gap.index)!,
    );
    return true;
  }
  const block = draggedBlock(d)!;
  batch(() => {
    const st = useProjectStore.getState();
    st.setRuleBlock(
      target.id,
      insertAt(target.block, gap.containerPath, gap.key, gap.index, block)!,
    );
    if (d.source === "rule") st.removeRules([d.ruleId]);
    if (d.source === "child") {
      const src = st.project.rules.find((r) => r.id === d.ruleId);
      if (src) st.setRuleBlock(src.id, setAt(src.block, d.path, null)!);
    }
  });
  const ui = useRulesUi.getState();
  ui.focusRule(target.id);
  if (d.source === "palette") {
    const slot = firstUnsetSlot(block);
    if (slot) ui.requestOpenSlot(target.id, slot, pathKey(childPath));
  }
  return true;
}
