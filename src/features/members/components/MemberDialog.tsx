/** メンバーの追加・編集ダイアログ。#68 */
import { AlertTriangle, Trash2 } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { GENDERS, type Gender } from "@/domain/genders";
import type { RoleKey } from "@/domain/roles";
import type { ID, Member } from "@/domain/schema";
import { LAB_PALETTE, nextPaletteColor } from "@/graphics/palette";
import { batch, useProjectStore } from "@/store/project";
import { nameKey, normalizeName } from "../lib/normalize";
import { allTags } from "../lib/table";
import { confirmDeleteMembers } from "./deleteMembers";
import { LabCombobox, type LabChoice } from "./LabCombobox";
import { RoleSelect } from "./RoleSelect";
import { TagInput } from "./TagInput";

interface FormState {
  name: string;
  kana: string;
  lab: LabChoice;
  gender: Gender;
  role: RoleKey;
  tags: string[];
  note: string;
}

const formSchema = z.object({
  name: z.string().transform(normalizeName).pipe(z.string().min(1)),
  kana: z.string().trim(),
  note: z.string().trim(),
});

function fromMember(m: Member | undefined, defaults?: Partial<FormState>): FormState {
  return {
    name: m?.name ?? "",
    kana: m?.kana ?? "",
    lab: m?.labId ? { kind: "lab", id: m.labId } : (defaults?.lab ?? { kind: "none" }),
    gender: m?.gender ?? defaults?.gender ?? "unspecified",
    role: m?.role ?? defaults?.role ?? "m1",
    tags: m?.tags ?? [],
    note: m?.note ?? "",
  };
}

export function MemberDialog({
  open,
  onOpenChange,
  memberId,
  defaults,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 編集対象。undefined なら追加 */
  memberId?: ID;
  defaults?: Partial<FormState>;
}) {
  const { t } = useTranslation("members");
  const members = useProjectStore((s) => s.project.members);
  const labs = useProjectStore((s) => s.project.labs);
  const member = memberId ? members.find((m) => m.id === memberId) : undefined;
  const editing = !!member;
  const [form, setForm] = useState<FormState>(() => fromMember(member, defaults));
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(0);
  const nameRef = useRef<HTMLInputElement>(null);
  const uid = useId();
  const tagSuggestions = useMemo(() => allTags(members), [members]);

  useEffect(() => {
    if (open) {
      setForm(fromMember(member, defaults));
      setError(null);
      setAdded(0);
    }
    // 開いたときだけ初期化する（編集中のストア更新で入力を消さない）
  }, [open, memberId]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const duplicate = useMemo(() => {
    const k = nameKey(form.name);
    return k ? members.find((m) => m.id !== memberId && nameKey(m.name) === k) : undefined;
  }, [form.name, members, memberId]);

  const save = (next: boolean) => {
    const parsed = formSchema.safeParse(form);
    if (!parsed.success) {
      setError(t("form.nameRequired"));
      nameRef.current?.focus();
      return;
    }
    const s = useProjectStore.getState();
    let labId: ID | undefined;
    batch(() => {
      if (form.lab.kind === "lab") labId = form.lab.id;
      else if (form.lab.kind === "new")
        labId = s.addLab({
          name: form.lab.name,
          color: nextPaletteColor(
            LAB_PALETTE,
            s.project.labs.map((l) => l.color),
          ),
        });
      const data = {
        name: parsed.data.name,
        kana: parsed.data.kana || undefined,
        labId,
        gender: form.gender,
        role: form.role,
        tags: form.tags,
        note: parsed.data.note || undefined,
      };
      if (member) s.updateMember(member.id, data);
      else s.addMembers([data]);
    });
    if (next) {
      toast.success(t("form.addedToast", { name: parsed.data.name }));
      setAdded((n) => n + 1);
      // 研究室・役職・性別は引き継ぐ（同じ研究室の学生を続けて入力しやすく）
      setForm((f) => ({
        ...f,
        name: "",
        kana: "",
        tags: [],
        note: "",
        lab: labId ? { kind: "lab", id: labId } : { kind: "none" },
      }));
      setError(null);
      requestAnimationFrame(() => nameRef.current?.focus());
    } else onOpenChange(false);
  };

  const remove = async () => {
    if (!member) return;
    if (await confirmDeleteMembers([member.id], t)) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="member-dialog">
        <DialogHeader>
          <DialogTitle>{editing ? t("form.editTitle") : t("form.addTitle")}</DialogTitle>
          <DialogDescription>
            {editing
              ? t("form.editDescription")
              : added > 0
                ? t("form.addedCount", { count: added })
                : t("form.addDescription")}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save(false);
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor={`${uid}-name`}>
                {t("columns.name")}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id={`${uid}-name`}
                ref={nameRef}
                autoFocus
                value={form.name}
                onChange={(e) => {
                  set("name", e.target.value);
                  setError(null);
                }}
                aria-invalid={!!error}
                placeholder={t("form.namePlaceholder")}
                data-testid="member-name"
              />
              {error && <p className="text-destructive text-xs">{error}</p>}
              {duplicate && (
                <p
                  className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300"
                  data-testid="duplicate-warning"
                >
                  <AlertTriangle className="size-3.5" />
                  {t("form.duplicateName", { name: duplicate.name })}
                </p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${uid}-kana`}>{t("columns.kana")}</Label>
              <Input
                id={`${uid}-kana`}
                value={form.kana}
                onChange={(e) => set("kana", e.target.value)}
                placeholder={t("form.kanaPlaceholder")}
                data-testid="member-kana"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor={`${uid}-lab`}>{t("columns.lab")}</Label>
              <LabCombobox
                id={`${uid}-lab`}
                labs={labs}
                value={form.lab}
                onChange={(v) => set("lab", v)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${uid}-role`}>{t("columns.role")}</Label>
              <RoleSelect id={`${uid}-role`} value={form.role} onChange={(r) => set("role", r)} />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>{t("columns.gender")}</Label>
            <RadioGroup
              value={form.gender}
              onValueChange={(v) => set("gender", v as Gender)}
              className="flex flex-wrap gap-x-4 gap-y-2"
            >
              {GENDERS.map((g) => (
                <div key={g} className="flex items-center gap-1.5">
                  <RadioGroupItem value={g} id={`${uid}-g-${g}`} data-testid={`gender-${g}`} />
                  <Label htmlFor={`${uid}-g-${g}`} className="font-normal">
                    {t(`common:genders.${g}`)}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor={`${uid}-tags`}>{t("columns.tags")}</Label>
            <TagInput
              id={`${uid}-tags`}
              value={form.tags}
              onChange={(v) => set("tags", v)}
              suggestions={tagSuggestions}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor={`${uid}-note`}>{t("columns.note")}</Label>
            <Textarea
              id={`${uid}-note`}
              rows={2}
              value={form.note}
              onChange={(e) => set("note", e.target.value)}
            />
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            {editing ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={remove}
                data-testid="member-delete"
              >
                <Trash2 />
                {t("common:actions.delete")}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t("common:actions.cancel")}
              </Button>
              {!editing && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => save(true)}
                  data-testid="member-save-next"
                >
                  {t("form.saveAndNext")}
                </Button>
              )}
              <Button type="submit" data-testid="member-save">
                {editing ? t("common:actions.save") : t("common:actions.add")}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
