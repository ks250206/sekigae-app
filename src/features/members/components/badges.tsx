/**
 * 名簿・席配置・出力で共通に使える小さな表示部品。
 * - RoleBadge: 役職カラーのバッジ（色だけに頼らず役職名を表示）
 * - LabBadge: 研究室カラーのチップ + 略称
 * - ChangeBadge: 昨年度との差分
 * - PrevPlacementText: 昨年度の席（「居室A / A-01」「居室A（席不明）」）
 */
import {
  ArrowRightLeft,
  CircleDashed,
  DoorOpen,
  Equal,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { RoleKey } from "@/domain/roles";
import type { Lab } from "@/domain/schema";
import { ROLE_COLORS, readableText } from "@/graphics/palette";
import { cn } from "@/lib/utils";
import type { ChangeKind } from "../lib/diff";
import type { PrevPlacement } from "../lib/prevPlan";
import { useScheme } from "../lib/useScheme";

export function RoleBadge({
  role,
  long = false,
  className,
}: {
  role: RoleKey;
  long?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const scheme = useScheme();
  const bg = ROLE_COLORS[role][scheme];
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded px-1.5 text-[11px] leading-none font-semibold whitespace-nowrap",
        className,
      )}
      style={{ backgroundColor: bg, color: readableText(bg) }}
      title={t(`rolesLong.${role}`)}
      data-role={role}
    >
      {long ? t(`rolesLong.${role}`) : t(`roles.${role}`)}
    </span>
  );
}

export function ColorDot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2.5 shrink-0 rounded-full ring-1 ring-black/10", className)}
      style={{ backgroundColor: color }}
    />
  );
}

export function LabBadge({
  lab,
  full = false,
  className,
}: {
  lab: Lab | undefined;
  /** 略称ではなく正式名を表示 */
  full?: boolean;
  className?: string;
}) {
  const { t } = useTranslation(["members", "common"]);
  if (!lab)
    return (
      <span className={cn("text-muted-foreground text-xs whitespace-nowrap", className)}>
        {t("lab.none")}
      </span>
    );
  return (
    <span
      className={cn(
        "inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full border py-0.5 pr-2 pl-1.5 text-xs whitespace-nowrap",
        className,
      )}
      style={{ borderColor: `${lab.color}66`, backgroundColor: `${lab.color}14` }}
      title={lab.name}
      data-lab={lab.id}
    >
      <ColorDot color={lab.color} />
      <span className="truncate font-medium">{full ? lab.name : lab.shortName || lab.name}</span>
    </span>
  );
}

const CHANGE_ICON: Record<ChangeKind, LucideIcon> = {
  sameSeat: Equal,
  sameRoom: DoorOpen,
  differentRoom: ArrowRightLeft,
  new: Sparkles,
  unassigned: CircleDashed,
};
const CHANGE_TONE: Record<ChangeKind, string> = {
  sameSeat: "text-sky-700 bg-sky-500/10 dark:text-sky-300",
  sameRoom: "text-emerald-700 bg-emerald-500/10 dark:text-emerald-300",
  differentRoom: "text-amber-700 bg-amber-500/10 dark:text-amber-300",
  new: "text-violet-700 bg-violet-500/10 dark:text-violet-300",
  unassigned: "text-muted-foreground bg-muted",
};

export function ChangeIcon({ kind, className }: { kind: ChangeKind; className?: string }) {
  const Icon = CHANGE_ICON[kind];
  return <Icon aria-hidden className={cn("size-3.5", className)} />;
}

export function ChangeBadge({ kind, className }: { kind: ChangeKind; className?: string }) {
  const { t } = useTranslation(["members", "common"]);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs whitespace-nowrap",
        CHANGE_TONE[kind],
        className,
      )}
      data-change={kind}
    >
      <ChangeIcon kind={kind} />
      {t(`change.${kind}`)}
    </span>
  );
}

export function PrevPlacementText({ placement }: { placement: PrevPlacement }) {
  const { t } = useTranslation(["members", "common"]);
  if (placement.kind === "none") return <span className="text-muted-foreground">—</span>;
  if (placement.kind === "room")
    return (
      <span className="inline-flex items-center gap-1.5">
        <ColorDot color={placement.room.color} />
        <span>{t("prev.roomOnlyLabel", { room: placement.room.name })}</span>
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5">
      <ColorDot color={placement.room.color} />
      <span>
        {placement.room.name}
        <span className="text-muted-foreground"> / </span>
        <span className="font-medium tabular-nums">{placement.seat.label || "?"}</span>
      </span>
    </span>
  );
}
