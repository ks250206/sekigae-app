import { ChevronDown, TriangleAlert } from "lucide-react";
import type { ComponentProps, CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** ブロック内のピル型スロット（Popover / DropdownMenu のトリガ） */
export function SlotPill({
  children,
  unset,
  danger,
  count,
  color,
  className,
  style,
  ...props
}: ComponentProps<"button"> & {
  unset?: boolean;
  danger?: boolean;
  count?: number;
  color?: string;
}) {
  return (
    <button
      type="button"
      data-unset={unset || undefined}
      className={cn(
        "group/pill mx-0.5 inline-flex max-w-full translate-y-[-1px] items-center gap-1 rounded-full border px-2.5 py-0.5 align-middle text-[13px] leading-5 font-medium shadow-xs transition-all",
        "bg-background hover:border-(--pill) hover:shadow-sm focus-visible:ring-[3px] focus-visible:ring-(--pill)/40 focus-visible:outline-none",
        "data-[state=open]:border-(--pill) data-[state=open]:ring-[3px] data-[state=open]:ring-(--pill)/25",
        unset && "text-muted-foreground border-dashed font-normal italic",
        danger && "border-destructive text-destructive bg-destructive/5",
        className,
      )}
      style={{ "--pill": color ?? "var(--ring)", ...style } as CSSProperties}
      {...props}
    >
      {danger && <TriangleAlert className="size-3.5 shrink-0" />}
      <span className="truncate">{children}</span>
      {count !== undefined && (
        <span
          className={cn(
            "rounded-full px-1.5 text-[11px] leading-4 font-semibold tabular-nums",
            count === 0 ? "bg-warning/25 text-foreground" : "bg-(--pill)/15 text-foreground/80",
          )}
        >
          {count}
        </span>
      )}
      <ChevronDown className="size-3 shrink-0 opacity-50 transition-transform group-data-[state=open]/pill:rotate-180" />
    </button>
  );
}

export interface ChipOption {
  value: string;
  label: ReactNode;
  color?: string;
  title?: string;
}

/** 複数選択のチップ群（同一属性内の複数選択 = または） */
export function ChipToggleGroup({
  options,
  selected,
  onChange,
  single,
  className,
  testId,
}: {
  options: ChipOption[];
  selected: readonly string[];
  onChange: (next: string[]) => void;
  single?: boolean;
  className?: string;
  testId?: string;
}) {
  return (
    <div role="group" className={cn("flex flex-wrap gap-1", className)} data-testid={testId}>
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            title={o.title}
            onClick={() =>
              onChange(
                single
                  ? [o.value]
                  : on
                    ? selected.filter((x) => x !== o.value)
                    : [...selected, o.value],
              )
            }
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors",
              "focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none",
              on
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-background hover:bg-accent",
            )}
          >
            {o.color && (
              <span
                className="size-2 rounded-full ring-1 ring-black/10"
                style={{ background: o.color }}
              />
            )}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
