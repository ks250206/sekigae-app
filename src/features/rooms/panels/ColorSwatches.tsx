import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ROOM_PALETTE, readableText } from "@/graphics/palette";
import { cn } from "@/lib/utils";

/** 部屋カラーの選択（ROOM_PALETTE） */
export function ColorSwatches({
  value,
  onChange,
}: {
  value: string;
  onChange: (c: string) => void;
}) {
  const { t } = useTranslation("rooms");
  return (
    <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label={t("list.color")}>
      {ROOM_PALETTE.map((c) => {
        const on = c.toLowerCase() === value.toLowerCase();
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={c}
            data-testid={`swatch-${c.slice(1)}`}
            onClick={() => onChange(c)}
            className={cn(
              "grid size-7 place-items-center rounded-full shadow-sm ring-offset-2 transition-transform hover:scale-110",
              on && "ring-ring ring-offset-background ring-2",
            )}
            style={{ backgroundColor: c, color: readableText(c) }}
          >
            {on && <Check className="size-3.5" />}
          </button>
        );
      })}
    </div>
  );
}
