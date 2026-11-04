/** 研究室マスタの操作 */
import type { Rule } from "@/domain/rules";
import type { ID, Lab } from "@/domain/schema";
import { batch, useProjectStore } from "@/store/project";
import { labKey } from "./normalize";
import { replaceLabRefs } from "./ruleRefs";

/** 研究室 b を a に統合（所属者・ルール参照を移す）。1 回の Undo */
export function mergeLabs(into: ID, from: ID) {
  const s = useProjectStore.getState();
  batch(() => {
    s.update((d) => replaceLabRefs(d.rules as Rule[], from, into));
    s.removeLab(from, into);
  });
}

/** 名前（接尾辞・空白・大小文字を無視）が同じ研究室の組 */
export function duplicateLabPairs(labs: readonly Lab[]): [Lab, Lab][] {
  const out: [Lab, Lab][] = [];
  for (let i = 0; i < labs.length; i++)
    for (let j = i + 1; j < labs.length; j++) {
      const a = labs[i]!;
      const b = labs[j]!;
      if (labKey(a.name) && labKey(a.name) === labKey(b.name)) out.push([a, b]);
    }
  return out;
}
