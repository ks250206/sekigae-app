/**
 * 年度更新ウィザードの実行。#82 #83
 * すべて `batch` 内で行い、1 回の Undo で戻せる。
 */
import { ROLES } from "@/domain/roles";
import type { PersonExpr, Rule } from "@/domain/rules";
import type { ID, Project, SeatPlan } from "@/domain/schema";
import { newId } from "@/lib/id";
import { batch, useProjectStore } from "@/store/project";
import { activePlan, seatIndex } from "@/store/selectors";
import type { PromotionPlan } from "./promotion";

export interface YearUpdateOptions {
  /** 昨年度にする案 */
  sourcePlanId: ID;
  /** 新しい昨年度案の名前（例: "2025年度"） */
  previousName: string;
  /** 既存の昨年度案: アーカイブ（残す）/ 上書き（削除） */
  existingPrevious: "archive" | "overwrite";
  /** 今年度（アクティブ）案の割当: 残す / 空にする */
  currentAssignment: "keep" | "clear";
  promotion: PromotionPlan;
  /** 卒業候補のうち名簿から削除する人 */
  removeMembers: ID[];
  /** 社会人ドクターの席を引き継いで固定（ロック + prev.same(席) 必須ルール） */
  carryOverWorkingDoctors: boolean;
  /** 追加するルールのメモ */
  ruleNote?: string;
}

export interface YearUpdateResult {
  previousPlanId: ID;
  promoted: number;
  removed: number;
  /** 引き継いで固定した社会人ドクターの人数 */
  carriedOver: number;
  ruleAdded: boolean;
}

const WD_EXPR: PersonExpr = { op: "roleGroup", in: ["workingDoctor"] };

/** 社 D を昨年度と同じ席に固定するルールが既にあるか */
export function hasWorkingDoctorSeatRule(rules: readonly Rule[]): boolean {
  return rules.some(
    (r) =>
      r.block.type === "prev.same" &&
      r.block.scope === "seat" &&
      r.strength === "hard" &&
      JSON.stringify(r.block.people) === JSON.stringify(WD_EXPR),
  );
}

export function runYearUpdate(o: YearUpdateOptions): YearUpdateResult {
  const store = useProjectStore.getState;
  const result: YearUpdateResult = {
    previousPlanId: "",
    promoted: o.promotion.roleChanges.length,
    removed: o.removeMembers.length,
    carriedOver: 0,
    ruleAdded: false,
  };
  batch(() => {
    // 1. 選んだ案を昨年度として複製
    store().update((d) => {
      const src = d.plans.find((p) => p.id === o.sourcePlanId);
      if (!src) return;
      const old = d.previousPlanId;
      if (old && o.existingPrevious === "overwrite") d.plans = d.plans.filter((p) => p.id !== old);
      const copy: SeatPlan = {
        id: newId("plan_"),
        name: o.previousName,
        kind: "previous",
        assignment: { ...src.assignment },
        roomOnly: { ...src.roomOnly },
        locks: [],
        createdAt: new Date().toISOString(),
      };
      d.plans.push(copy);
      d.previousPlanId = copy.id;
      result.previousPlanId = copy.id;
      if (o.currentAssignment === "clear") {
        const cur = d.plans.find((p) => p.id === d.activePlanId);
        if (cur) {
          cur.assignment = {};
          cur.locks = [];
          cur.final = false;
        }
      }
    });

    // 2. 進級
    if (o.promotion.roleChanges.length)
      store().update((d) => {
        const to = new Map(o.promotion.roleChanges.map((c) => [c.memberId, c.role]));
        for (const m of d.members) {
          const r = to.get(m.id);
          if (r) m.role = r;
        }
      });

    // 3. 卒業者の削除
    if (o.removeMembers.length) store().removeMembers(o.removeMembers);

    // 4. 社会人ドクターの席を引き継いで固定
    if (o.carryOverWorkingDoctors) {
      const p: Project = store().project;
      const prev = p.plans.find((x) => x.id === p.previousPlanId);
      const cur = activePlan(p);
      const idx = seatIndex(p.layout.rooms);
      const wd = new Set(
        p.members.filter((m) => ROLES[m.role].group === "workingDoctor").map((m) => m.id),
      );
      const seats: [ID, ID][] = prev
        ? Object.entries(prev.assignment).filter(([sid, mid]) => wd.has(mid) && idx.has(sid))
        : [];
      if (seats.length) {
        for (const [sid, mid] of seats) store().assignSeat(cur.id, sid, mid);
        store().setLocks(
          cur.id,
          seats.map(([sid]) => sid),
          true,
        );
        result.carriedOver = seats.length;
      }
      if (!hasWorkingDoctorSeatRule(p.rules)) {
        store().addRule(
          { type: "prev.same", people: WD_EXPR, scope: "seat" },
          { strength: "hard", origin: "template", note: o.ruleNote },
        );
        result.ruleAdded = true;
      }
    }
  });
  return result;
}

/** 日本の年度（4 月始まり） */
export function fiscalYear(d = new Date()): number {
  return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
}
