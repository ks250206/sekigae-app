/** 研究室マスタ（名前・略称・色・並び順・削除/統合・構成）。#71 */
import { AlertTriangle, ArrowDown, ArrowUp, Merge, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { confirm } from "@/components/confirm";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { deriveShortName } from "@/domain/factory";
import type { Rule } from "@/domain/rules";
import type { ID, Lab, Member } from "@/domain/schema";
import { LAB_PALETTE, nextPaletteColor } from "@/graphics/palette";
import { cn } from "@/lib/utils";
import { batch, useProjectStore } from "@/store/project";
import { labRuleRefCount } from "../lib/impact";
import { compactKey, normalizeWidth } from "../lib/normalize";
import { duplicateLabPairs, mergeLabs } from "../lib/labs";
import { replaceLabRefs } from "../lib/ruleRefs";
import { ColorDot } from "./badges";
import { countRoles } from "../lib/stats";
import { RoleStackBar } from "./RoleStackBar";

export function LabsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation(["members", "common"]);
  const labs = useProjectStore((s) => s.project.labs);
  const members = useProjectStore((s) => s.project.members);
  const [newName, setNewName] = useState("");
  const byLab = useMemo(() => {
    const m = new Map<ID, Member[]>();
    for (const x of members) if (x.labId) m.set(x.labId, [...(m.get(x.labId) ?? []), x]);
    return m;
  }, [members]);
  const dupes = useMemo(() => duplicateLabPairs(labs), [labs]);
  const shortCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of labs) m.set(compactKey(l.shortName), (m.get(compactKey(l.shortName)) ?? 0) + 1);
    return m;
  }, [labs]);

  const add = () => {
    const name = normalizeWidth(newName);
    if (!name) return;
    useProjectStore.getState().addLab({
      name,
      color: nextPaletteColor(
        LAB_PALETTE,
        labs.map((l) => l.color),
      ),
    });
    setNewName("");
  };

  const move = (i: number, d: -1 | 1) => {
    const ids = labs.map((l) => l.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    useProjectStore.getState().reorderLabs(ids);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl"
        data-testid="labs-dialog"
      >
        <DialogHeader>
          <DialogTitle>{t("labs.title")}</DialogTitle>
          <DialogDescription>{t("labs.description")}</DialogDescription>
        </DialogHeader>

        {dupes.length > 0 && (
          <div className="space-y-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            {dupes.map(([a, b]) => (
              <div key={`${a.id}-${b.id}`} className="flex flex-wrap items-center gap-2">
                <AlertTriangle className="size-4 text-amber-600" />
                <span className="flex-1">{t("labs.duplicate", { a: a.name, b: b.name })}</span>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => {
                    mergeLabs(a.id, b.id);
                    toast.success(t("labs.merged", { from: b.name, into: a.name }));
                  }}
                  data-testid="lab-merge"
                >
                  <Merge />
                  {t("labs.mergeInto", { from: b.shortName, into: a.shortName })}
                </Button>
              </div>
            ))}
          </div>
        )}

        {labs.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">{t("labs.empty")}</p>
        ) : (
          <ul className="divide-y rounded-md border" data-testid="labs-list">
            <li
              aria-hidden
              className="text-muted-foreground bg-muted/40 hidden gap-2 px-3 py-1.5 text-xs sm:flex"
            >
              <span className="w-[4.25rem]" />
              <span className="min-w-40 flex-1">{t("labs.name")}</span>
              <span className="w-28">{t("labs.shortName")}</span>
              <span className="w-36">{t("labs.members")}</span>
              <span className="w-8" />
            </li>
            {labs.map((lab, i) => (
              <LabRow
                key={lab.id}
                lab={lab}
                labs={labs}
                members={byLab.get(lab.id) ?? []}
                first={i === 0}
                last={i === labs.length - 1}
                onMove={(d) => move(i, d)}
                shortDuplicate={(shortCount.get(compactKey(lab.shortName)) ?? 0) > 1}
              />
            ))}
          </ul>
        )}

        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <div className="grid flex-1 gap-1.5">
            <Label htmlFor="new-lab-name">{t("labs.addLabel")}</Label>
            <Input
              id="new-lab-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t("labs.addPlaceholder")}
              data-testid="new-lab-name"
            />
          </div>
          <Button type="submit" disabled={!newName.trim()} data-testid="add-lab">
            <Plus />
            {t("common:actions.add")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LabRow({
  lab,
  labs,
  members,
  first,
  last,
  onMove,
  shortDuplicate,
}: {
  lab: Lab;
  labs: readonly Lab[];
  members: readonly Member[];
  first: boolean;
  last: boolean;
  onMove: (d: -1 | 1) => void;
  shortDuplicate: boolean;
}) {
  const { t } = useTranslation(["members", "common"]);
  const [name, setName] = useState(lab.name);
  const [short, setShort] = useState(lab.shortName);
  const [deleting, setDeleting] = useState(false);
  // ストア側の変更（Undo など）を入力欄に反映
  const [synced, setSynced] = useState({ name: lab.name, short: lab.shortName });
  if (synced.name !== lab.name || synced.short !== lab.shortName) {
    setSynced({ name: lab.name, short: lab.shortName });
    setName(lab.name);
    setShort(lab.shortName);
  }
  const update = useProjectStore.getState().updateLab;
  const auto = lab.shortName === deriveShortName(lab.name);

  const commitName = () => {
    const v = normalizeWidth(name);
    if (!v) return setName(lab.name);
    if (v === lab.name) return;
    // 略称が自動のままなら追従させる
    update(lab.id, auto ? { name: v, shortName: deriveShortName(v) } : { name: v });
  };
  const commitShort = () => {
    const v = normalizeWidth(short) || deriveShortName(lab.name);
    setShort(v);
    if (v !== lab.shortName) update(lab.id, { shortName: v });
  };

  const remove = async () => {
    const refs = labRuleRefCount(useProjectStore.getState().project, lab.id);
    if (members.length || refs) return setDeleting(true);
    if (
      await confirm({
        title: t("labs.deleteTitle", { name: lab.name }),
        confirmLabel: t("common:actions.delete"),
        destructive: true,
      })
    )
      useProjectStore.getState().removeLab(lab.id);
  };

  return (
    <li className="p-3" data-testid="lab-row" data-lab={lab.id}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-col">
          <Button
            variant="ghost"
            size="icon-xs"
            disabled={first}
            onClick={() => onMove(-1)}
            aria-label={t("labs.moveUp")}
          >
            <ArrowUp />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            disabled={last}
            onClick={() => onMove(1)}
            aria-label={t("labs.moveDown")}
          >
            <ArrowDown />
          </Button>
        </div>
        <ColorPicker color={lab.color} onChange={(c) => update(lab.id, { color: c })} />
        <div className="grid min-w-40 flex-1 gap-1">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && commitName()}
            aria-label={t("labs.name")}
            className="h-8"
            data-testid="lab-name"
          />
        </div>
        <div className="grid w-28 gap-1">
          <Input
            value={short}
            onChange={(e) => setShort(e.target.value)}
            onBlur={commitShort}
            onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && commitShort()}
            aria-label={t("labs.shortName")}
            aria-invalid={shortDuplicate}
            className={cn("h-8", shortDuplicate && "border-amber-500")}
            title={auto ? t("labs.shortAuto") : undefined}
            data-testid="lab-short"
          />
        </div>
        <div className="w-36">
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <span className="text-muted-foreground">{t("labs.members")}</span>
            <span className="font-medium tabular-nums" data-testid="lab-count">
              {members.length}
            </span>
          </div>
          <RoleStackBar counts={countRoles(members)} />
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-destructive"
          onClick={remove}
          aria-label={t("labs.delete", { name: lab.name })}
          data-testid="lab-delete"
        >
          <Trash2 />
        </Button>
      </div>
      {shortDuplicate && (
        <p className="mt-1 ml-9 flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
          <AlertTriangle className="size-3.5" />
          {t("labs.shortDuplicate")}
        </p>
      )}
      {deleting && (
        <DeletePanel
          lab={lab}
          labs={labs}
          count={members.length}
          onClose={() => setDeleting(false)}
        />
      )}
    </li>
  );
}

function DeletePanel({
  lab,
  labs,
  count,
  onClose,
}: {
  lab: Lab;
  labs: readonly Lab[];
  count: number;
  onClose: () => void;
}) {
  const { t } = useTranslation(["members", "common"]);
  const others = labs.filter((l) => l.id !== lab.id);
  const [mode, setMode] = useState<"move" | "unassign">(others.length ? "move" : "unassign");
  const [target, setTarget] = useState<ID>(others[0]?.id ?? "");
  const refs = labRuleRefCount(useProjectStore.getState().project, lab.id);
  const run = () => {
    if (mode === "move" && target) mergeLabs(target, lab.id);
    else
      batch(() => {
        const s = useProjectStore.getState();
        s.update((d) => replaceLabRefs(d.rules as Rule[], lab.id, undefined));
        s.removeLab(lab.id);
      });
    toast.success(t("labs.deleted", { name: lab.name }));
  };
  return (
    <div
      className="border-destructive/30 bg-destructive/5 mt-3 ml-9 space-y-3 rounded-md border p-3 text-sm"
      data-testid="lab-delete-panel"
    >
      <p>
        {t("labs.deleteImpact", { name: lab.name, count })}
        {refs > 0 && <> {t("labs.deleteRules", { count: refs })}</>}
      </p>
      <RadioGroup value={mode} onValueChange={(v) => setMode(v as "move" | "unassign")}>
        {others.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <RadioGroupItem value="move" id={`${lab.id}-move`} />
            <Label htmlFor={`${lab.id}-move`} className="font-normal">
              {t("labs.moveTo")}
            </Label>
            <Select value={target} onValueChange={setTarget} disabled={mode !== "move"}>
              <SelectTrigger size="sm" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {others.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    <ColorDot color={l.color} />
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="flex items-center gap-2">
          <RadioGroupItem value="unassign" id={`${lab.id}-unassign`} />
          <Label htmlFor={`${lab.id}-unassign`} className="font-normal">
            {t("labs.unassign")}
          </Label>
        </div>
      </RadioGroup>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onClose}>
          {t("common:actions.cancel")}
        </Button>
        <Button variant="destructive" size="sm" onClick={run} data-testid="lab-delete-confirm">
          {t("common:actions.delete")}
        </Button>
      </div>
    </div>
  );
}

function ColorPicker({ color, onChange }: { color: string; onChange: (c: string) => void }) {
  const { t } = useTranslation(["members", "common"]);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="focus-visible:ring-ring/50 size-8 shrink-0 rounded-md border shadow-xs outline-none focus-visible:ring-[3px]"
          style={{ backgroundColor: color }}
          aria-label={t("labs.color")}
          data-testid="lab-color"
        />
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <div className="grid grid-cols-6 gap-1.5">
          {LAB_PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              className={cn(
                "size-7 rounded-md border",
                c.toLowerCase() === color.toLowerCase() && "ring-ring ring-2 ring-offset-2",
              )}
              style={{ backgroundColor: c }}
              onClick={() => onChange(c)}
              aria-label={c}
            />
          ))}
        </div>
        <label className="text-muted-foreground mt-3 flex items-center gap-2 text-xs">
          {t("labs.customColor")}
          {/* ドラッグ中の連続変更で Undo 履歴を埋めないよう、確定時（blur）に反映 */}
          <input
            type="color"
            defaultValue={color}
            key={color}
            onBlur={(e) => e.target.value !== color && onChange(e.target.value)}
            className="h-7 w-12 cursor-pointer rounded border bg-transparent"
          />
        </label>
      </PopoverContent>
    </Popover>
  );
}
