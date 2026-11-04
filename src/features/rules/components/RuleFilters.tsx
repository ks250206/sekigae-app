/** ルールの絞り込み（#99）: カテゴリ / 必須・できれば / 有効 / 違反あり / 関係する人・部屋 */
import { Check, ListFilter, UserRound, DoorClosed, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useMembers, useRooms } from "@/store/selectors";
import { useRT } from "../hooks";
import { CATEGORIES, CATEGORY_COLORS } from "../registry";
import { filtersActive, useRulesUi, type RuleFilters as Filters } from "../rulesUi";

export function RuleFilters({ showViolations }: { showViolations?: boolean }) {
  const { t } = useRT();
  const filters = useRulesUi((s) => s.filters);
  const setFilters = useRulesUi((s) => s.setFilters);
  const reset = useRulesUi((s) => s.resetFilters);
  const members = useMembers();
  const rooms = useRooms();
  const [open, setOpen] = useState(false);
  const related =
    filters.related?.kind === "member"
      ? members.find((m) => m.id === filters.related!.id)?.name
      : filters.related?.kind === "room"
        ? rooms.find((r) => r.id === filters.related!.id)?.name
        : undefined;

  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="rule-filters">
      <ListFilter className="text-muted-foreground size-4" aria-label={t("filters.label")} />
      {CATEGORIES.map((c) => {
        const on = filters.categories.includes(c);
        return (
          <button
            key={c}
            type="button"
            aria-pressed={on}
            data-testid={`filter-cat-${c}`}
            onClick={() =>
              setFilters({
                categories: on
                  ? filters.categories.filter((x) => x !== c)
                  : [...filters.categories, c],
              })
            }
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors",
              on ? "text-white" : "bg-background hover:bg-accent",
            )}
            style={
              on ? { background: CATEGORY_COLORS[c], borderColor: CATEGORY_COLORS[c] } : undefined
            }
          >
            {!on && (
              <span className="size-2 rounded-full" style={{ background: CATEGORY_COLORS[c] }} />
            )}
            {t(`categories.${c}`)}
          </button>
        );
      })}
      <Select
        value={filters.strength}
        onValueChange={(v) => setFilters({ strength: v as Filters["strength"] })}
      >
        <SelectTrigger
          size="sm"
          className="h-7 text-xs"
          aria-label={t("filters.strength")}
          data-testid="filter-strength"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">
            {t("filters.strength")}: {t("filters.all")}
          </SelectItem>
          <SelectItem value="hard">{t("shell.hard")}</SelectItem>
          <SelectItem value="soft">{t("shell.soft")}</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={filters.enabled}
        onValueChange={(v) => setFilters({ enabled: v as Filters["enabled"] })}
      >
        <SelectTrigger
          size="sm"
          className="h-7 text-xs"
          aria-label={t("filters.enabled")}
          data-testid="filter-enabled"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">
            {t("filters.enabled")}: {t("filters.all")}
          </SelectItem>
          <SelectItem value="on">{t("filters.onlyEnabled")}</SelectItem>
          <SelectItem value="off">{t("filters.onlyDisabled")}</SelectItem>
        </SelectContent>
      </Select>
      {showViolations && (
        <button
          type="button"
          aria-pressed={filters.violations}
          onClick={() => setFilters({ violations: !filters.violations })}
          className={cn(
            "rounded-full border px-2 py-0.5 text-xs font-medium",
            filters.violations ? "bg-destructive border-destructive text-white" : "bg-background",
          )}
        >
          {t("filters.hasViolations")}
        </button>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={related ? "secondary" : "outline"}
            size="sm"
            className="h-7 text-xs"
            data-testid="filter-related"
          >
            {related
              ? t(
                  filters.related!.kind === "member"
                    ? "filters.relatedMember"
                    : "filters.relatedRoom",
                  {
                    name: related,
                  },
                )
              : t("filters.related")}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <Command>
            <CommandInput placeholder={t("filters.search")} />
            <CommandList className="max-h-64">
              <CommandEmpty>{t("slot.noMatch")}</CommandEmpty>
              {rooms.length > 0 && (
                <CommandGroup heading={t("filters.rooms")}>
                  {rooms.map((r) => (
                    <CommandItem
                      key={r.id}
                      value={`room ${r.name} ${r.id}`}
                      onSelect={() => {
                        setFilters({ related: { kind: "room", id: r.id } });
                        setOpen(false);
                      }}
                    >
                      <DoorClosed style={{ color: r.color }} />
                      {r.name}
                      {filters.related?.id === r.id && <Check className="ml-auto" />}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {members.length > 0 && (
                <CommandGroup heading={t("filters.members")}>
                  {members.map((m) => (
                    <CommandItem
                      key={m.id}
                      value={`member ${m.name} ${m.kana ?? ""} ${m.id}`}
                      onSelect={() => {
                        setFilters({ related: { kind: "member", id: m.id } });
                        setOpen(false);
                      }}
                      data-testid={`filter-member-${m.id}`}
                    >
                      <UserRound />
                      {m.name}
                      {filters.related?.id === m.id && <Check className="ml-auto" />}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {filtersActive(filters) && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={reset}
          data-testid="filter-clear"
        >
          <X /> {t("filters.clear")}
        </Button>
      )}
    </div>
  );
}
