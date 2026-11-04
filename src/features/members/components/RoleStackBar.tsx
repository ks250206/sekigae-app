import { useTranslation } from "react-i18next";
import { ROLE_ORDER, type RoleKey } from "@/domain/roles";
import type { Member } from "@/domain/schema";
import { ROLE_COLORS } from "@/graphics/palette";
import { cn } from "@/lib/utils";
import { useScheme } from "./badges";

export function countRoles(members: readonly Pick<Member, "role">[]): Map<RoleKey, number> {
  const m = new Map<RoleKey, number>();
  for (const x of members) m.set(x.role, (m.get(x.role) ?? 0) + 1);
  return m;
}

/** 役職の積み上げ横棒（シニア → ジュニア） */
export function RoleStackBar({
  counts,
  className,
  legend = false,
}: {
  counts: Map<RoleKey, number>;
  className?: string;
  legend?: boolean;
}) {
  const { t } = useTranslation();
  const scheme = useScheme();
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const segs = ROLE_ORDER.filter((r) => (counts.get(r) ?? 0) > 0);
  const label = segs.map((r) => `${t(`roles.${r}`)} ${counts.get(r)}`).join(", ");
  return (
    <div className={cn("min-w-0", className)}>
      <div
        className="bg-muted flex h-2 w-full overflow-hidden rounded-full"
        role="img"
        aria-label={label}
        title={label}
      >
        {total > 0 &&
          segs.map((r) => (
            <div
              key={r}
              className="h-full border-r border-white/40 last:border-r-0 dark:border-black/30"
              style={{
                width: `${((counts.get(r) ?? 0) / total) * 100}%`,
                backgroundColor: ROLE_COLORS[r][scheme],
              }}
            />
          ))}
      </div>
      {legend && segs.length > 0 && (
        <ul className="text-muted-foreground mt-1.5 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11px]">
          {segs.map((r) => (
            <li key={r} className="inline-flex items-center gap-1">
              <span
                aria-hidden
                className="inline-block size-2 rounded-[2px]"
                style={{ backgroundColor: ROLE_COLORS[r][scheme] }}
              />
              {t(`roles.${r}`)}
              <span className="text-foreground font-medium tabular-nums">{counts.get(r)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
