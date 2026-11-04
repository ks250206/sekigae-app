/** 名簿の集計バー（役職構成・研究室別・性別・席数との比較・昨年度残留率）。#75 #81 */
import { AlertTriangle, History } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { GENDERS } from "@/domain/genders";
import type { Project } from "@/domain/schema";
import { GENDER_COLORS } from "@/graphics/palette";
import { formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { previousPlan, totalSeats } from "@/store/selectors";
import { retentionByRoom } from "../lib/diff";
import type { MemberRow } from "../lib/table";
import { ColorDot, LabBadge, useScheme } from "./badges";
import { RoleStackBar, countRoles } from "./RoleStackBar";

export function SummaryBar({ project, rows }: { project: Project; rows: readonly MemberRow[] }) {
  const { t, i18n } = useTranslation("members");
  const lng = i18n.language;
  const scheme = useScheme();
  const members = project.members;
  const seats = totalSeats(project.layout.rooms);
  const roles = useMemo(() => countRoles(members), [members]);
  const byLab = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of members) m.set(x.labId ?? "", (m.get(x.labId ?? "") ?? 0) + 1);
    return m;
  }, [members]);
  const byGender = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of members) m.set(x.gender, (m.get(x.gender) ?? 0) + 1);
    return m;
  }, [members]);
  const unassigned = rows.filter((r) => !r.current).length;
  const shortage = members.length - seats;
  const hasPrev = !!previousPlan(project);

  return (
    <section
      className="bg-card grid gap-x-6 gap-y-3 border-b px-4 py-3 text-sm md:grid-cols-[auto_minmax(12rem,1fr)_auto] md:px-6"
      data-testid="members-summary"
      data-tour="members-summary"
    >
      <div className="flex items-baseline gap-4">
        <div>
          <div className="text-muted-foreground text-xs">{t("summary.members")}</div>
          <div className="text-2xl font-semibold tabular-nums" data-testid="member-count">
            {formatNumber(members.length, lng)}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs">{t("summary.seats")}</div>
          <div className="text-2xl font-semibold tabular-nums">{formatNumber(seats, lng)}</div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs">{t("summary.unassigned")}</div>
          <div className="text-2xl font-semibold tabular-nums">
            {formatNumber(unassigned, lng)}
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-col justify-center gap-1.5">
        <RoleStackBar counts={roles} legend />
      </div>

      <div className="flex flex-col justify-center gap-1.5">
        {seats > 0 && shortage > 0 && (
          <div
            className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2 py-1 text-xs text-amber-800 dark:text-amber-300"
            role="status"
            data-testid="seat-shortage"
          >
            <AlertTriangle className="size-3.5" />
            {t("summary.shortage", { count: shortage })}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          {project.labs.map((lab) => (
            <span key={lab.id} className="inline-flex items-center gap-1">
              <LabBadge lab={lab} />
              <span className="text-xs font-medium tabular-nums">{byLab.get(lab.id) ?? 0}</span>
            </span>
          ))}
          {(byLab.get("") ?? 0) > 0 && (
            <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
              {t("lab.none")}
              <span className="text-foreground font-medium tabular-nums">{byLab.get("")}</span>
            </span>
          )}
        </div>
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {GENDERS.filter((g) => byGender.get(g)).map((g) => (
            <span key={g} className="inline-flex items-center gap-1">
              <ColorDot color={GENDER_COLORS[g][scheme]} className="size-2" />
              {t(`common:genders.${g}`)}
              <span className="text-foreground font-medium tabular-nums">{byGender.get(g)}</span>
            </span>
          ))}
          {hasPrev && <RetentionPopover project={project} />}
        </div>
      </div>
    </section>
  );
}

function RetentionPopover({ project }: { project: Project }) {
  const { t, i18n } = useTranslation("members");
  const stats = useMemo(() => retentionByRoom(project), [project]);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="xs" className="-my-1" data-testid="retention-button">
          <History />
          {t("retention.button")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="mb-2 text-sm font-medium">{t("retention.title")}</div>
        <p className="text-muted-foreground mb-3 text-xs">{t("retention.description")}</p>
        {stats.length === 0 ? (
          <p className="text-muted-foreground text-xs">{t("retention.noRooms")}</p>
        ) : (
          <ul className="space-y-2" data-testid="retention-list">
            {stats.map((s) => (
              <li key={s.room.id} className="text-xs">
                <div className="flex items-center gap-1.5">
                  <ColorDot color={s.room.color} />
                  <span className="flex-1 truncate font-medium">{s.room.name}</span>
                  <span className="tabular-nums">
                    {s.ratio === null ? "—" : formatPercent(s.ratio, i18n.language)}
                  </span>
                </div>
                <div className="bg-muted mt-1 h-1.5 overflow-hidden rounded-full">
                  <div
                    className={cn("h-full rounded-full bg-emerald-500")}
                    style={{ width: `${(s.ratio ?? 0) * 100}%` }}
                  />
                </div>
                <div className="text-muted-foreground mt-0.5">
                  {t("retention.detail", {
                    previous: s.previous,
                    stayed: s.stayed,
                    sameSeat: s.sameSeat,
                  })}
                </div>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
