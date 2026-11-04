/** 複数選択時の一括編集バー。各操作 = 1 回の Undo。#70 */
import { ChevronDown, Eraser, Tag, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { GENDERS } from "@/domain/genders";
import type { ID, Lab, Member } from "@/domain/schema";
import { useProjectStore } from "@/store/project";
import { parseTags } from "../lib/normalize";
import { prevSeatActions } from "../lib/prevPlan";
import { ColorDot, RoleBadge } from "./badges";
import { confirmDeleteMembers } from "./deleteMembers";
import { ROLE_GROUPED } from "../lib/stats";

export function BulkBar({
  ids,
  members,
  labs,
  tagSuggestions,
  onClear,
}: {
  ids: readonly ID[];
  members: readonly Member[];
  labs: readonly Lab[];
  tagSuggestions: readonly string[];
  onClear: () => void;
}) {
  const { t } = useTranslation(["members", "common"]);
  const [tagText, setTagText] = useState("");
  const store = useProjectStore.getState;
  const set = new Set(ids);
  const selectedTags = [...new Set(members.filter((m) => set.has(m.id)).flatMap((m) => m.tags))];
  const done = () => toast.success(t("bulk.updated", { count: ids.length }));

  const patch = (p: Partial<Member>) => {
    store().updateMembers([...ids], p);
    done();
  };
  const addTags = (raw: string) => {
    const tags = parseTags(raw);
    if (!tags.length) return;
    store().update((d) => {
      for (const m of d.members)
        if (set.has(m.id)) for (const tag of tags) if (!m.tags.includes(tag)) m.tags.push(tag);
    });
    setTagText("");
    done();
  };
  const removeTag = (tag: string) => {
    store().update((d) => {
      for (const m of d.members) if (set.has(m.id)) m.tags = m.tags.filter((x) => x !== tag);
    });
    done();
  };

  return (
    <div
      className="bg-primary/5 border-primary/20 flex flex-wrap items-center gap-1.5 border-b px-4 py-2 md:px-6"
      role="toolbar"
      aria-label={t("bulk.toolbar")}
      data-testid="bulk-bar"
    >
      <span className="mr-2 text-sm font-medium" data-testid="bulk-count">
        {t("bulk.selected", { count: ids.length })}
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" data-testid="bulk-lab">
            {t("columns.lab")}
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>{t("bulk.setLab")}</DropdownMenuLabel>
          {labs.map((l) => (
            <DropdownMenuItem key={l.id} onSelect={() => patch({ labId: l.id })}>
              <ColorDot color={l.color} />
              {l.name}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => patch({ labId: undefined })}>
            {t("lab.none")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" data-testid="bulk-role">
            {t("columns.role")}
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-96 overflow-y-auto">
          {ROLE_GROUPED.map(({ group, roles }, i) => (
            <DropdownMenuGroup key={group}>
              {i > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel className="text-muted-foreground text-xs">
                {t(`common:roleGroups.${group}`)}
              </DropdownMenuLabel>
              {roles.map((r) => (
                <DropdownMenuItem
                  key={r}
                  onSelect={() => patch({ role: r })}
                  data-testid={`bulk-role-${r}`}
                >
                  <RoleBadge role={r} className="min-w-9 justify-center" />
                  {t(`common:rolesLong.${r}`)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" data-testid="bulk-gender">
            {t("columns.gender")}
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {GENDERS.map((g) => (
            <DropdownMenuItem key={g} onSelect={() => patch({ gender: g })}>
              {t(`common:genders.${g}`)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" data-testid="bulk-tags">
            <Tag />
            {t("columns.tags")}
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>{t("bulk.addTag")}</DropdownMenuLabel>
          <form
            className="px-2 pb-2"
            onSubmit={(e) => {
              e.preventDefault();
              addTags(tagText);
            }}
          >
            <Input
              value={tagText}
              onChange={(e) => setTagText(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder={t("tags.placeholder")}
              className="h-8"
              data-testid="bulk-tag-input"
            />
          </form>
          {tagSuggestions
            .filter((x) => !selectedTags.includes(x))
            .slice(0, 8)
            .map((tag) => (
              <DropdownMenuItem key={tag} onSelect={() => addTags(tag)}>
                + {tag}
              </DropdownMenuItem>
            ))}
          {selectedTags.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{t("bulk.removeTag")}</DropdownMenuLabel>
              {selectedTags.map((tag) => (
                <DropdownMenuItem key={tag} onSelect={() => removeTag(tag)}>
                  <X />
                  {tag}
                </DropdownMenuItem>
              ))}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          prevSeatActions.clear([...ids]);
          done();
        }}
      >
        <Eraser />
        {t("bulk.clearPrev")}
      </Button>

      <Button
        variant="outline"
        size="sm"
        className="text-destructive hover:text-destructive"
        onClick={async () => {
          if (await confirmDeleteMembers(ids, t)) onClear();
        }}
        data-testid="bulk-delete"
      >
        <Trash2 />
        {t("common:actions.delete")}
      </Button>

      <div className="flex-1" />
      <Button variant="ghost" size="sm" onClick={onClear} data-testid="bulk-clear">
        <X />
        {t("bulk.clearSelection")}
      </Button>
    </div>
  );
}
