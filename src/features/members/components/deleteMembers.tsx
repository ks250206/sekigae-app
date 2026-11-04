import type { TFunction } from "i18next";
import { toast } from "sonner";
import { confirm } from "@/components/confirm";
import type { ID } from "@/domain/schema";
import { useProjectStore } from "@/store/project";
import { memberDeleteImpact } from "../lib/impact";

/** 影響（席割当・昨年度・ルール参照）を示して確認し、削除する。1 回の Undo */
export async function confirmDeleteMembers(
  ids: readonly ID[],
  t: TFunction<"members">,
): Promise<boolean> {
  if (!ids.length) return false;
  const p = useProjectStore.getState().project;
  const impact = memberDeleteImpact(p, ids);
  const name = ids.length === 1 ? p.members.find((m) => m.id === ids[0])?.name : undefined;
  const lines: string[] = [];
  for (const s of impact.seats) lines.push(t("delete.impactSeats", { plan: s.plan, count: s.count }));
  if (impact.previous) lines.push(t("delete.impactPrevious", { count: impact.previous }));
  if (impact.rules) lines.push(t("delete.impactRules", { count: impact.rules }));
  const ok = await confirm({
    title: name ? t("delete.titleOne", { name }) : t("delete.titleMany", { count: ids.length }),
    description: (
      <span className="block space-y-2">
        {lines.length > 0 ? (
          <span className="block">
            <span className="text-foreground block font-medium">{t("delete.impactTitle")}</span>
            <span className="mt-1 block">
              {lines.map((l) => (
                <span key={l} className="block">
                  ・{l}
                </span>
              ))}
            </span>
          </span>
        ) : null}
        <span className="block">{t("delete.undoHint")}</span>
      </span>
    ),
    confirmLabel: t("delete.confirm"),
    destructive: true,
  });
  if (!ok) return false;
  useProjectStore.getState().removeMembers([...ids]);
  toast.success(t("delete.done", { count: ids.length }));
  return true;
}
