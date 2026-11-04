import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
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
import { deriveShortName } from "@/domain/factory";
import type { ID, Lab } from "@/domain/schema";
import { matchLab, normalizeWidth } from "../lib/normalize";
import { ColorDot, LabBadge } from "./badges";

export type LabChoice = { kind: "none" } | { kind: "lab"; id: ID } | { kind: "new"; name: string };

/** 研究室の選択 + その場で新規作成（保存時に作成） */
export function LabCombobox({
  labs,
  value,
  onChange,
  id,
}: {
  labs: readonly Lab[];
  value: LabChoice;
  onChange: (v: LabChoice) => void;
  id?: string;
}) {
  const { t } = useTranslation(["members", "common"]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = value.kind === "lab" ? labs.find((l) => l.id === value.id) : undefined;
  const typed = normalizeWidth(search);
  const exists = typed ? matchLab(typed, labs) : undefined;
  const pick = (v: LabChoice) => {
    onChange(v);
    setOpen(false);
    setSearch("");
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
          data-testid="lab-combobox"
        >
          {value.kind === "new" ? (
            <span className="inline-flex items-center gap-1.5">
              <Plus className="size-3.5" />
              {t("form.newLab", { name: value.name })}
            </span>
          ) : selected ? (
            <LabBadge lab={selected} full />
          ) : (
            <span className="text-muted-foreground">{t("lab.none")}</span>
          )}
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder={t("form.labSearch")}
            data-testid="lab-combobox-search"
          />
          <CommandList>
            <CommandEmpty className="p-0" />
            <CommandGroup>
              <CommandItem value="__none" onSelect={() => pick({ kind: "none" })}>
                <span className="text-muted-foreground">{t("lab.none")}</span>
                {value.kind === "none" && <Check className="ml-auto" />}
              </CommandItem>
              {labs.map((l) => (
                <CommandItem
                  key={l.id}
                  value={`${l.name} ${l.shortName} ${l.id}`}
                  onSelect={() => pick({ kind: "lab", id: l.id })}
                >
                  <ColorDot color={l.color} />
                  <span className="truncate">{l.name}</span>
                  <span className="text-muted-foreground text-xs">{l.shortName}</span>
                  {value.kind === "lab" && value.id === l.id && <Check className="ml-auto" />}
                </CommandItem>
              ))}
            </CommandGroup>
            {typed && !exists && (
              <CommandGroup forceMount>
                <CommandItem
                  forceMount
                  value={`__new ${typed}`}
                  onSelect={() => pick({ kind: "new", name: typed })}
                  data-testid="lab-create-option"
                >
                  <Plus />
                  {t("form.createLab", { name: typed, short: deriveShortName(typed) })}
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
