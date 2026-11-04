/** 取込結果をストアに反映する（1 回の Undo）。#72 #84 */
import type { ID, Member } from "@/domain/schema";
import { LAB_PALETTE, nextPaletteColor } from "@/graphics/palette";
import { batch, useProjectStore } from "@/store/project";
import { labKey, nameKey } from "./normalize";
import { newLabNames, validRows, type ImportRow } from "./importRows";
import {
  DEFAULT_PREVIOUS_NAME,
  ensurePreviousPlanDraft,
  placeInPlan,
  setRoomOnlyInPlan,
} from "./prevPlan";

export type ImportMode = "add" | "replace" | "update";

export interface ImportResult {
  added: number;
  updated: number;
  removed: number;
  labsCreated: number;
  prevSet: number;
  skipped: number;
}

export function applyImport(
  rows: readonly ImportRow[],
  mode: ImportMode,
  opts: { previousPlanName?: string } = {},
): ImportResult {
  const store = useProjectStore.getState;
  const ok = validRows(rows);
  const res: ImportResult = {
    added: 0,
    updated: 0,
    removed: 0,
    labsCreated: 0,
    prevSet: 0,
    skipped: rows.length - ok.length,
  };
  batch(() => {
    // 研究室の作成
    const labIds = new Map<string, ID>();
    for (const name of newLabNames(ok)) {
      const used = store().project.labs.map((l) => l.color);
      const id = store().addLab({ name, color: nextPaletteColor(LAB_PALETTE, used) });
      labIds.set(labKey(name), id);
      res.labsCreated++;
    }
    const labOf = (r: ImportRow) =>
      r.labId ?? (r.labName ? labIds.get(labKey(r.labName)) : undefined);

    if (mode === "replace") {
      const ids = store().project.members.map((m) => m.id);
      res.removed = ids.length;
      if (ids.length) store().removeMembers(ids);
    }

    // 氏名で突合（同名が複数いる場合は先頭から順に割り当て）
    const pool = new Map<string, ID[]>();
    if (mode === "update")
      for (const m of store().project.members) {
        const k = nameKey(m.name);
        pool.set(k, [...(pool.get(k) ?? []), m.id]);
      }

    const toAdd: (Partial<Member> & { name: string })[] = [];
    const addRows: ImportRow[] = [];
    const memberOfRow = new Map<ImportRow, ID>();
    const patches: [ID, Partial<Member>][] = [];
    for (const r of ok) {
      const existing = mode === "update" ? pool.get(nameKey(r.name))?.shift() : undefined;
      if (existing) {
        const patch: Partial<Member> = {};
        if (r.filled.has("kana")) patch.kana = r.kana;
        if (r.filled.has("lab")) patch.labId = labOf(r);
        if (r.filled.has("gender")) patch.gender = r.gender;
        if (r.filled.has("role")) patch.role = r.role;
        if (r.filled.has("tags")) patch.tags = r.tags;
        if (r.filled.has("note")) patch.note = r.note;
        patches.push([existing, patch]);
        memberOfRow.set(r, existing);
      } else {
        toAdd.push({
          name: r.name,
          kana: r.kana,
          labId: labOf(r),
          gender: r.gender,
          role: r.role,
          tags: r.tags,
          note: r.note,
        });
        addRows.push(r);
      }
    }
    if (patches.length)
      store().update((d) => {
        const byId = new Map(patches);
        for (const m of d.members) {
          const p = byId.get(m.id);
          if (p) Object.assign(m, p);
        }
      });
    res.updated = patches.length;
    if (toAdd.length) {
      const ids = store().addMembers(toAdd);
      ids.forEach((id, i) => memberOfRow.set(addRows[i]!, id));
      res.added = ids.length;
    }

    // 昨年度の席
    const prevRows = ok.filter((r) => r.prev && memberOfRow.has(r));
    if (prevRows.length)
      store().update((d) => {
        const plan = ensurePreviousPlanDraft(d, opts.previousPlanName ?? DEFAULT_PREVIOUS_NAME);
        for (const r of prevRows) {
          const mid = memberOfRow.get(r)!;
          if (r.prev!.seatId) placeInPlan(plan, mid, r.prev!.seatId);
          else setRoomOnlyInPlan(plan, mid, r.prev!.roomKey);
          res.prevSet++;
        }
      });
  });
  return res;
}
