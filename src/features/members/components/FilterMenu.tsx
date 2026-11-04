import { Columns3, Filter, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GENDERS } from "@/domain/genders";
import { ROLE_ORDER } from "@/domain/roles";
import type { Lab } from "@/domain/schema";
import { CHANGE_KINDS } from "../lib/diff";
import {
  COLUMN_KEYS,
  EMPTY_FILTER,
  activeFilterCount,
  type ColumnKey,
  type RowFilter,
} from "../lib/table";
import { ChangeIcon, ColorDot, RoleBadge } from "./badges";

const toggle = <T,>(list: readonly T[], v: T): T[] =>
  list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

const keepOpen = (e: Event) => e.preventDefault();

export function FilterMenu({
  filter,
  onChange,
  labs,
  tags,
  showChange,
}: {
  filter: RowFilter;
  onChange: (f: RowFilter) => void;
  labs: readonly Lab[];
  tags: readonly string[];
  showChange: boolean;
}) {
  const { t } = useTranslation(["members", "common"]);
  const n = activeFilterCount(filter);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={n ? "secondary" : "outline"} size="sm" data-testid="filter-menu">
          <Filter />
          {t("filter.button")}
          {n > 0 && (
            <span className="bg-primary text-primary-foreground rounded-full px-1.5 text-[10px] tabular-nums">
              {n}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger data-testid="filter-role">
            {t("columns.role")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-96 overflow-y-auto">
            {ROLE_ORDER.map((r) => (
              <DropdownMenuCheckboxItem
                key={r}
                checked={filter.roles.includes(r)}
                onCheckedChange={() => onChange({ ...filter, roles: toggle(filter.roles, r) })}
                onSelect={keepOpen}
                data-testid={`filter-role-${r}`}
              >
                <RoleBadge role={r} className="min-w-9 justify-center" />
                {t(`common:rolesLong.${r}`)}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger data-testid="filter-lab">
            {t("columns.lab")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {labs.map((l) => (
              <DropdownMenuCheckboxItem
                key={l.id}
                checked={filter.labs.includes(l.id)}
                onCheckedChange={() => onChange({ ...filter, labs: toggle(filter.labs, l.id) })}
                onSelect={keepOpen}
              >
                <ColorDot color={l.color} />
                {l.name}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuCheckboxItem
              checked={filter.labs.includes("")}
              onCheckedChange={() => onChange({ ...filter, labs: toggle(filter.labs, "") })}
              onSelect={keepOpen}
            >
              {t("lab.none")}
            </DropdownMenuCheckboxItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>{t("columns.gender")}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {GENDERS.map((g) => (
              <DropdownMenuCheckboxItem
                key={g}
                checked={filter.genders.includes(g)}
                onCheckedChange={() => onChange({ ...filter, genders: toggle(filter.genders, g) })}
                onSelect={keepOpen}
              >
                {t(`common:genders.${g}`)}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {tags.length > 0 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>{t("columns.tags")}</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-96 overflow-y-auto">
              {tags.map((tag) => (
                <DropdownMenuCheckboxItem
                  key={tag}
                  checked={filter.tags.includes(tag)}
                  onCheckedChange={() => onChange({ ...filter, tags: toggle(filter.tags, tag) })}
                  onSelect={keepOpen}
                >
                  {tag}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        {showChange && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger data-testid="filter-change">
              {t("columns.change")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {CHANGE_KINDS.map((c) => (
                <DropdownMenuCheckboxItem
                  key={c}
                  checked={filter.changes.includes(c)}
                  onCheckedChange={() =>
                    onChange({ ...filter, changes: toggle(filter.changes, c) })
                  }
                  onSelect={keepOpen}
                  data-testid={`filter-change-${c}`}
                >
                  <ChangeIcon kind={c} />
                  {t(`change.${c}`)}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={filter.unassigned}
          onCheckedChange={(v) => onChange({ ...filter, unassigned: v })}
          onSelect={keepOpen}
          data-testid="filter-unassigned"
        >
          {t("filter.unassigned")}
        </DropdownMenuCheckboxItem>
        {n > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChange({ ...EMPTY_FILTER, query: filter.query })}>
              <X />
              {t("filter.clear")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** 適用中のフィルタをチップで表示（クリックで解除） */
export function FilterChips({
  filter,
  onChange,
  labs,
}: {
  filter: RowFilter;
  onChange: (f: RowFilter) => void;
  labs: readonly Lab[];
}) {
  const { t } = useTranslation(["members", "common"]);
  const chips: { key: string; label: string; remove: () => void }[] = [
    ...filter.roles.map((r) => ({
      key: `r-${r}`,
      label: t(`common:roles.${r}`),
      remove: () => onChange({ ...filter, roles: toggle(filter.roles, r) }),
    })),
    ...filter.labs.map((id) => ({
      key: `l-${id}`,
      label: labs.find((l) => l.id === id)?.shortName ?? t("lab.none"),
      remove: () => onChange({ ...filter, labs: toggle(filter.labs, id) }),
    })),
    ...filter.genders.map((g) => ({
      key: `g-${g}`,
      label: t(`common:genders.${g}`),
      remove: () => onChange({ ...filter, genders: toggle(filter.genders, g) }),
    })),
    ...filter.tags.map((tag) => ({
      key: `t-${tag}`,
      label: `#${tag}`,
      remove: () => onChange({ ...filter, tags: toggle(filter.tags, tag) }),
    })),
    ...filter.changes.map((c) => ({
      key: `c-${c}`,
      label: t(`change.${c}`),
      remove: () => onChange({ ...filter, changes: toggle(filter.changes, c) }),
    })),
    ...(filter.unassigned
      ? [
          {
            key: "u",
            label: t("filter.unassigned"),
            remove: () => onChange({ ...filter, unassigned: false }),
          },
        ]
      : []),
  ];
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={c.remove}
          className="bg-secondary hover:bg-destructive/10 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
          aria-label={t("filter.remove", { label: c.label })}
        >
          {c.label}
          <X className="size-3" />
        </button>
      ))}
    </div>
  );
}

export function ColumnsMenu({
  hidden,
  onChange,
}: {
  hidden: readonly ColumnKey[];
  onChange: (hidden: ColumnKey[]) => void;
}) {
  const { t } = useTranslation(["members", "common"]);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" data-testid="columns-menu">
          <Columns3 />
          {t("table.columns")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t("table.showColumns")}</DropdownMenuLabel>
        {COLUMN_KEYS.filter((c) => c !== "name").map((c) => (
          <DropdownMenuCheckboxItem
            key={c}
            checked={!hidden.includes(c)}
            onCheckedChange={() => onChange(toggle(hidden, c))}
            onSelect={keepOpen}
            data-testid={`column-toggle-${c}`}
          >
            {t(`columns.${c}`)}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
