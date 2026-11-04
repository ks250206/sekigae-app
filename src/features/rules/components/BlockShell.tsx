/**
 * ブロックの外枠（#87）。カテゴリ色の左ボーダー・アイコン・ラベル・ドラッグハンドル・
 * 必須/できれば・重み・有効スイッチ・⋯メニュー・違反バッジ。パズルの凹凸付き。
 */
import { GripVertical, MoreHorizontal } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Strength, Weight } from "@/domain/rules";
import { cn } from "@/lib/utils";
import { useRT } from "../hooks";
import type { BlockDefinition } from "../registry";
import { CATEGORY_COLORS } from "../registry";

export interface BlockShellProps {
  def: BlockDefinition;
  /** 子ルール（論理ブロック内）: 強さ・重み・有効を隠す */
  child?: boolean;
  strength?: Strength;
  weight?: Weight;
  enabled?: boolean;
  onStrengthChange?: (s: Strength) => void;
  onWeightChange?: (w: Weight) => void;
  onEnabledChange?: (v: boolean) => void;
  /** ⋯メニューの中身（DropdownMenuItem 群） */
  menu?: ReactNode;
  /** ドラッグハンドルに渡す属性（dnd-kit の listeners / attributes） */
  handleProps?: Record<string, unknown>;
  /** 違反数（席配置・エンジン側から渡される。未指定なら非表示） */
  violationCount?: number;
  /** ヘッダー右の追加バッジ（参照切れなど） */
  badges?: ReactNode;
  /** 文の下（メモ・警告・論理ブロックの中身） */
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
  highlighted?: boolean;
  dragging?: boolean;
  testId?: string;
  dataAttrs?: Record<string, string>;
}

export function StrengthToggle({
  value,
  onChange,
  hardAllowed,
}: {
  value: Strength;
  onChange: (s: Strength) => void;
  hardAllowed: boolean;
}) {
  const { t } = useRT();
  const btn = (s: Strength) => {
    const on = value === s;
    const disabled = s === "hard" && !hardAllowed;
    const el = (
      <button
        type="button"
        role="radio"
        aria-checked={on}
        disabled={disabled}
        data-testid={`strength-${s}`}
        onClick={() => onChange(s)}
        className={cn(
          "rounded-full px-2.5 py-0.5 text-xs font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-40",
          on
            ? s === "hard"
              ? "bg-foreground text-background shadow-sm"
              : "bg-(--cat) text-white shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        {t(s === "hard" ? "shell.hard" : "shell.soft")}
      </button>
    );
    return disabled ? (
      <Tooltip key={s}>
        <TooltipTrigger asChild>
          <span>{el}</span>
        </TooltipTrigger>
        <TooltipContent>{t("shell.softOnly")}</TooltipContent>
      </Tooltip>
    ) : (
      <span key={s}>{el}</span>
    );
  };
  return (
    <div
      role="radiogroup"
      aria-label={t("shell.strength")}
      className="bg-muted flex items-center rounded-full p-0.5"
    >
      {btn("hard")}
      {btn("soft")}
    </div>
  );
}

export function WeightDots({ value, onChange }: { value: Weight; onChange: (w: Weight) => void }) {
  const { t } = useRT();
  return (
    <div
      role="radiogroup"
      aria-label={t("shell.weightLabel")}
      className="flex items-center gap-0.5"
    >
      {([1, 2, 3, 4, 5] as const).map((w) => (
        <button
          key={w}
          type="button"
          role="radio"
          aria-checked={value === w}
          aria-label={t("shell.weight", { n: w })}
          title={t("shell.weight", { n: w })}
          data-testid={`weight-${w}`}
          onClick={() => onChange(w)}
          className="group/dot grid size-4 place-items-center rounded-full focus-visible:ring-2 focus-visible:ring-(--cat)/50 focus-visible:outline-none"
        >
          <span
            className={cn(
              "size-2.5 rounded-full border-2 border-(--cat) transition-all group-hover/dot:scale-125",
              w <= value ? "bg-(--cat)" : "bg-transparent opacity-50",
            )}
          />
        </button>
      ))}
    </div>
  );
}

export function BlockShell({
  def,
  child,
  strength = "hard",
  weight = 3,
  enabled = true,
  onStrengthChange,
  onWeightChange,
  onEnabledChange,
  menu,
  handleProps,
  violationCount,
  badges,
  footer,
  children,
  className,
  highlighted,
  dragging,
  testId,
  dataAttrs,
}: BlockShellProps) {
  const { t } = useRT();
  const color = CATEGORY_COLORS[def.category];
  const Icon = def.icon;
  return (
    <div
      className={cn("group/block relative", dragging && "opacity-40", className)}
      style={{ "--cat": color } as CSSProperties}
      data-testid={testId}
      data-enabled={enabled}
      data-category={def.category}
      {...dataAttrs}
    >
      {/* 上の凹み（前のブロックの凸がはまる） */}
      <span
        aria-hidden
        className="bg-background absolute top-0 left-7 z-10 h-[5px] w-7 rounded-b-md border-x border-b"
      />
      <div
        className={cn(
          "bg-card relative rounded-xl border border-l-[5px] shadow-sm transition-[box-shadow,opacity,transform] duration-200",
          "hover:shadow-md",
          highlighted && "ring-(--cat)/60 ring-4",
          !enabled && "opacity-55 saturate-50",
        )}
        style={{
          borderLeftColor: color,
          backgroundImage: `linear-gradient(90deg, color-mix(in oklab, ${color} 7%, transparent), transparent 40%)`,
        }}
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2 pt-1.5">
          {handleProps && (
            <button
              type="button"
              className="text-muted-foreground/60 hover:text-foreground -ml-1 cursor-grab touch-none rounded p-0.5 active:cursor-grabbing"
              aria-label={t("shell.drag")}
              title={t("shell.drag")}
              data-testid="rule-drag-handle"
              {...handleProps}
            >
              <GripVertical className="size-4" />
            </button>
          )}
          <span
            className="grid size-6 place-items-center rounded-md text-white shadow-xs"
            style={{ background: color }}
          >
            <Icon className="size-3.5" />
          </span>
          <span className="text-muted-foreground text-xs font-semibold tracking-wide">
            {t(`categories.${def.category}`)} · {t(`${def.i18nKey}.name`)}
          </span>
          {badges}
          {violationCount !== undefined && violationCount > 0 && (
            <span
              className="bg-destructive rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
              data-testid="violation-badge"
            >
              {t("shell.violations", { n: violationCount })}
            </span>
          )}
          <span className="flex-1" />
          {!child && onStrengthChange && (
            <StrengthToggle
              value={strength}
              onChange={onStrengthChange}
              hardAllowed={def.hardAllowed}
            />
          )}
          {!child && strength === "soft" && onWeightChange && (
            <WeightDots value={weight} onChange={onWeightChange} />
          )}
          {!child && onEnabledChange && (
            <Switch
              size="sm"
              checked={enabled}
              onCheckedChange={onEnabledChange}
              aria-label={t(enabled ? "shell.enabled" : "shell.disabled")}
              title={t(enabled ? "shell.enabled" : "shell.disabled")}
              data-testid="rule-enabled"
            />
          )}
          {menu && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label={t("shell.menu")}
                  data-testid="rule-menu"
                >
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">{menu}</DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        <div className={cn("px-3 pt-1 pb-2.5", !enabled && "pointer-events-auto")}>{children}</div>
        {footer}
      </div>
      {/* 下の凸 */}
      <span
        aria-hidden
        className="bg-card absolute -bottom-[5px] left-7 z-10 h-[6px] w-7 rounded-b-md border-x border-b"
      />
    </div>
  );
}
