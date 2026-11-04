/**
 * 年度更新ウィザード。#82 #83
 * 1. 昨年度にする案の選択・バックアップ
 * 2. 学年の一括進級（一般 / 社会人ドクター別トラック）と卒業候補の整理、社 D の席引き継ぎ
 * 3. 完了 → 新メンバーの取込へ
 * 実行は 1 回の Undo で戻せる。
 */
import { ArrowRight, Check, Download, GraduationCap, Lock, RotateCcw, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ROLES, ROLE_ORDER } from "@/domain/roles";
import type { ID, Member } from "@/domain/schema";
import { downloadText } from "@/lib/backup";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/store/project";
import { labIndex, previousPlan, seatIndex } from "@/store/selectors";
import {
  planPromotion,
  promotionRows,
  resolveTarget,
  type PromotionRow,
  type PromotionTarget,
} from "../lib/promotion";
import { fiscalYear, runYearUpdate, type YearUpdateResult } from "../lib/yearUpdate";
import { LabBadge, RoleBadge } from "./badges";

export function YearUpdateWizard({
  open,
  onOpenChange,
  onImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Step 3 から取込ダイアログを開く */
  onImport: () => void;
}) {
  const { t } = useTranslation(["members", "common"]);
  const project = useProjectStore((s) => s.project);
  const currentPlans = project.plans.filter((p) => p.kind === "current");
  const existingPrev = previousPlan(project);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [sourceId, setSourceId] = useState<ID>(
    () => currentPlans.find((p) => p.final)?.id ?? project.activePlanId,
  );
  const [prevName, setPrevName] = useState(() =>
    t("wizard.prevNameDefault", { year: fiscalYear() }),
  );
  const [existing, setExisting] = useState<"archive" | "overwrite">("archive");
  const [current, setCurrent] = useState<"keep" | "clear">("clear");
  const [overrides, setOverrides] = useState<Record<ID, PromotionTarget>>({});
  const [keep, setKeep] = useState<Set<ID>>(new Set());
  const [carry, setCarry] = useState(true);
  const [result, setResult] = useState<YearUpdateResult | null>(null);

  const rows = useMemo(() => promotionRows(project.members), [project.members]);
  const byId = useMemo(() => new Map(project.members.map((m) => [m.id, m])), [project.members]);
  const hasWd = rows.some((r) => r.track === "workingDoctor");

  const target = (r: PromotionRow) => overrides[r.memberId] ?? r.defaultTarget;
  const graduates = rows.filter((r) => resolveTarget(r.from, target(r)) === "graduate");
  const removeIds = graduates.map((r) => r.memberId).filter((id) => !keep.has(id));
  const fixedCount = project.members.length - rows.length;

  const backup = () =>
    downloadText(
      `sekigae-${project.name}-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(project, null, 2),
      "application/json",
    );

  const run = () => {
    const promotion = planPromotion(rows, overrides);
    const res = runYearUpdate({
      sourcePlanId: sourceId,
      previousName: prevName.trim() || t("prev.defaultPlanName"),
      existingPrevious: existing,
      currentAssignment: current,
      promotion,
      removeMembers: removeIds,
      carryOverWorkingDoctors: hasWd && carry,
      ruleNote: t("wizard.ruleNote"),
    });
    setResult(res);
    setStep(3);
  };

  const steps = [t("wizard.step1"), t("wizard.step2"), t("wizard.step3")];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] flex-col sm:max-w-3xl" data-testid="year-wizard">
        <DialogHeader>
          <DialogTitle>{t("wizard.title")}</DialogTitle>
          <DialogDescription>{t("wizard.description")}</DialogDescription>
        </DialogHeader>
        <ol className="flex items-center gap-2 text-xs">
          {steps.map((s, i) => (
            <li key={s} className="flex items-center gap-2">
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full border text-xs font-semibold",
                  step > i + 1 && "bg-primary text-primary-foreground border-primary",
                  step === i + 1 && "border-primary text-primary",
                )}
              >
                {step > i + 1 ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span className={cn(step === i + 1 ? "font-medium" : "text-muted-foreground")}>
                {s}
              </span>
              {i < steps.length - 1 && <ArrowRight className="text-muted-foreground size-3.5" />}
            </li>
          ))}
        </ol>

        <div className="-mx-6 min-h-0 flex-1 overflow-y-auto px-6">
          {step === 1 && (
            <div className="space-y-5">
              <section className="space-y-2">
                <h3 className="text-sm font-medium">{t("wizard.choosePlan")}</h3>
                <RadioGroup value={sourceId} onValueChange={setSourceId} className="gap-2">
                  {currentPlans.map((p) => {
                    const n = Object.keys(p.assignment).filter((s) =>
                      seatIndex(project.layout.rooms).has(s),
                    ).length;
                    return (
                      <Label
                        key={p.id}
                        htmlFor={`wiz-plan-${p.id}`}
                        className={cn(
                          "hover:bg-muted/50 flex cursor-pointer items-center gap-3 rounded-md border p-3 font-normal",
                          sourceId === p.id && "border-primary bg-primary/5",
                        )}
                      >
                        <RadioGroupItem value={p.id} id={`wiz-plan-${p.id}`} />
                        <span className="flex-1 font-medium">{p.name}</span>
                        {p.final && <Badge variant="secondary">{t("wizard.final")}</Badge>}
                        <span className="text-muted-foreground text-xs">
                          {t("wizard.assigned", { count: n })}
                        </span>
                      </Label>
                    );
                  })}
                </RadioGroup>
              </section>

              <section className="grid gap-1.5">
                <Label htmlFor="wiz-prev-name">{t("wizard.prevName")}</Label>
                <Input
                  id="wiz-prev-name"
                  value={prevName}
                  onChange={(e) => setPrevName(e.target.value)}
                  className="max-w-xs"
                  data-testid="wizard-prev-name"
                />
              </section>

              {existingPrev && (
                <section className="space-y-2">
                  <h3 className="text-sm font-medium">
                    {t("wizard.existingPrev", { name: existingPrev.name })}
                  </h3>
                  <RadioGroup
                    value={existing}
                    onValueChange={(v) => setExisting(v as "archive" | "overwrite")}
                  >
                    {(["archive", "overwrite"] as const).map((v) => (
                      <div key={v} className="flex items-start gap-2">
                        <RadioGroupItem value={v} id={`wiz-ex-${v}`} className="mt-0.5" />
                        <Label htmlFor={`wiz-ex-${v}`} className="block font-normal">
                          {t(`wizard.existing.${v}`)}
                          <span className="text-muted-foreground block text-xs">
                            {t(`wizard.existingHelp.${v}`)}
                          </span>
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </section>
              )}

              <section className="space-y-2">
                <h3 className="text-sm font-medium">{t("wizard.currentPlan")}</h3>
                <RadioGroup
                  value={current}
                  onValueChange={(v) => setCurrent(v as "keep" | "clear")}
                >
                  {(["clear", "keep"] as const).map((v) => (
                    <div key={v} className="flex items-center gap-2">
                      <RadioGroupItem value={v} id={`wiz-cur-${v}`} />
                      <Label htmlFor={`wiz-cur-${v}`} className="font-normal">
                        {t(`wizard.current.${v}`)}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </section>

              <section className="bg-muted/50 flex flex-wrap items-center gap-3 rounded-md border p-3">
                <div className="min-w-0 flex-1 text-sm">
                  <div className="font-medium">{t("wizard.backupTitle")}</div>
                  <div className="text-muted-foreground text-xs">{t("wizard.backupHelp")}</div>
                </div>
                <Button variant="outline" size="sm" onClick={backup} data-testid="wizard-backup">
                  <Download />
                  {t("wizard.backup")}
                </Button>
              </section>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              {rows.length === 0 && (
                <p className="text-muted-foreground text-sm">{t("wizard.noStudents")}</p>
              )}
              {(["general", "workingDoctor"] as const).map((track) => {
                const list = rows.filter((r) => r.track === track);
                if (!list.length) return null;
                return (
                  <section key={track} className="space-y-2" data-testid={`wizard-track-${track}`}>
                    <h3 className="text-sm font-medium">
                      {t(`wizard.track.${track}`)}
                      <span className="text-muted-foreground ml-2 text-xs font-normal">
                        {t(`wizard.trackHelp.${track}`)}
                      </span>
                    </h3>
                    <div className="divide-y rounded-md border">
                      {list.map((r) => (
                        <PromotionLine
                          key={r.memberId}
                          row={r}
                          member={byId.get(r.memberId)!}
                          value={target(r)}
                          onChange={(v) => setOverrides((o) => ({ ...o, [r.memberId]: v }))}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}

              {graduates.length > 0 && (
                <section className="space-y-2" data-testid="wizard-graduates">
                  <h3 className="flex items-center gap-1.5 text-sm font-medium">
                    <GraduationCap className="size-4" />
                    {t("wizard.graduates", { count: graduates.length })}
                  </h3>
                  <p className="text-muted-foreground text-xs">{t("wizard.graduatesHelp")}</p>
                  <div className="flex flex-wrap gap-2">
                    {graduates.map((r) => {
                      const m = byId.get(r.memberId)!;
                      const remove = !keep.has(r.memberId);
                      return (
                        <label
                          key={r.memberId}
                          className={cn(
                            "flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm",
                            remove && "border-destructive/40 bg-destructive/5",
                          )}
                        >
                          <Checkbox
                            checked={remove}
                            onCheckedChange={(c) =>
                              setKeep((k) => {
                                const n = new Set(k);
                                if (c) n.delete(r.memberId);
                                else n.add(r.memberId);
                                return n;
                              })
                            }
                            data-testid={`wizard-remove-${m.name}`}
                          />
                          <RoleBadge role={m.role} />
                          {m.name}
                          <span className="text-muted-foreground text-xs">
                            {remove ? t("wizard.willRemove") : t("wizard.willKeep")}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </section>
              )}

              {fixedCount > 0 && (
                <p className="text-muted-foreground text-xs">
                  {t("wizard.unchanged", { count: fixedCount })}
                </p>
              )}

              {hasWd && (
                <section className="flex items-start gap-3 rounded-md border p-3">
                  <Switch
                    id="wiz-carry"
                    checked={carry}
                    onCheckedChange={setCarry}
                    data-testid="wizard-carry"
                  />
                  <Label htmlFor="wiz-carry" className="block font-normal">
                    <span className="flex items-center gap-1.5 font-medium">
                      <Lock className="size-3.5" />
                      {t("wizard.carry")}
                    </span>
                    <span className="text-muted-foreground mt-0.5 block text-xs">
                      {t("wizard.carryHelp")}
                    </span>
                  </Label>
                </section>
              )}
            </div>
          )}

          {step === 3 && result && (
            <div className="space-y-4" data-testid="wizard-done">
              <div className="flex items-center gap-2 text-base font-medium">
                <span className="flex size-8 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600">
                  <Check className="size-5" />
                </span>
                {t("wizard.doneTitle")}
              </div>
              <ul className="space-y-1 text-sm">
                <li>{t("wizard.donePrev", { name: prevName })}</li>
                <li>{t("wizard.donePromoted", { count: result.promoted })}</li>
                <li>{t("wizard.doneRemoved", { count: result.removed })}</li>
                {result.carriedOver > 0 && (
                  <li>{t("wizard.doneCarried", { count: result.carriedOver })}</li>
                )}
                {result.ruleAdded && <li>{t("wizard.doneRule")}</li>}
              </ul>
              <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <RotateCcw className="size-3.5" />
                {t("wizard.undoHint")}
              </p>
              <div className="bg-muted/50 flex flex-wrap items-center gap-3 rounded-md border p-3">
                <div className="flex-1 text-sm">{t("wizard.nextImport")}</div>
                <Button
                  onClick={() => {
                    onOpenChange(false);
                    onImport();
                  }}
                  data-testid="wizard-import"
                >
                  <Upload />
                  {t("wizard.importButton")}
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {step === 2 ? (
            <Button variant="ghost" onClick={() => setStep(1)}>
              {t("common:actions.back")}
            </Button>
          ) : (
            <span />
          )}
          {step === 1 && (
            <Button onClick={() => setStep(2)} disabled={!sourceId} data-testid="wizard-next">
              {t("common:actions.next")}
            </Button>
          )}
          {step === 2 && (
            <Button onClick={run} data-testid="wizard-run">
              {t("wizard.run")}
            </Button>
          )}
          {step === 3 && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t("common:actions.close")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PromotionLine({
  row,
  member,
  value,
  onChange,
}: {
  row: PromotionRow;
  member: Member;
  value: PromotionTarget;
  onChange: (v: PromotionTarget) => void;
}) {
  const { t } = useTranslation(["members", "common"]);
  const labs = useProjectStore((s) => labIndex(s.project.labs));
  const resolved = resolveTarget(row.from, value);
  const next = ROLES[row.from].next;
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 text-sm"
      data-testid="promotion-row"
    >
      <span className="min-w-28 flex-1 font-medium">{member.name}</span>
      <LabBadge lab={member.labId ? labs.get(member.labId) : undefined} />
      <RoleBadge role={row.from} />
      <ArrowRight className="text-muted-foreground size-3.5" />
      {row.from === "wd3" ? (
        // 社D3 は「卒業 / 在籍継続」をワンクリックで
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={value === "stay" ? "stay" : resolved === "graduate" ? "graduate" : ""}
          onValueChange={(v) => v && onChange(v as PromotionTarget)}
          data-testid="wd3-toggle"
        >
          <ToggleGroupItem value="graduate">{t("wizard.graduate")}</ToggleGroupItem>
          <ToggleGroupItem value="stay">{t("wizard.continueEnrollment")}</ToggleGroupItem>
        </ToggleGroup>
      ) : (
        <Select value={value} onValueChange={(v) => onChange(v as PromotionTarget)}>
          <SelectTrigger size="sm" className="w-48" data-testid={`promotion-select-${member.name}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {next && next !== "graduate" && (
              <SelectItem value={next}>
                {row.continueTo
                  ? t("wizard.continueTo", { role: t(`common:roles.${next}`) })
                  : t("wizard.promoteTo", { role: t(`common:roles.${next}`) })}
              </SelectItem>
            )}
            <SelectItem value="graduate">{t("wizard.graduate")}</SelectItem>
            <SelectItem value="stay">
              {t("wizard.stay", { role: t(`common:roles.${row.from}`) })}
            </SelectItem>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>{t("wizard.changeTo")}</SelectLabel>
              {ROLE_ORDER.filter((r) => r !== row.from && r !== next).map((r) => (
                <SelectItem key={r} value={r}>
                  {t(`common:rolesLong.${r}`)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      )}
      {resolved !== "graduate" && resolved !== row.from && value !== next && (
        <RoleBadge role={resolved} />
      )}
    </div>
  );
}
