import { Plus, X } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { parseTags } from "../lib/normalize";

/** チップ + 入力。Enter / カンマで追加、Backspace で末尾を削除、候補クリックで追加 */
export function TagInput({
  value,
  onChange,
  suggestions,
  id,
  className,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions: readonly string[];
  id?: string;
  className?: string;
}) {
  const { t } = useTranslation(["members", "common"]);
  const [text, setText] = useState("");
  const listId = useId();
  const add = (raw: string) => {
    const next = [...value];
    for (const tag of parseTags(raw)) if (!next.includes(tag)) next.push(tag);
    onChange(next);
    setText("");
  };
  const q = text.trim().toLowerCase();
  const candidates = suggestions
    .filter((s) => !value.includes(s) && (!q || s.toLowerCase().includes(q)))
    .slice(0, 12);
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="border-input focus-within:border-ring focus-within:ring-ring/50 dark:bg-input/30 flex min-h-9 flex-wrap items-center gap-1 rounded-md border px-2 py-1 shadow-xs focus-within:ring-[3px]">
        {value.map((tag) => (
          <span
            key={tag}
            className="bg-secondary text-secondary-foreground inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs"
          >
            {tag}
            <button
              type="button"
              className="hover:text-destructive -mr-0.5 rounded"
              onClick={() => onChange(value.filter((x) => x !== tag))}
              aria-label={t("tags.remove", { tag })}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={text}
          onChange={(e) => {
            const v = e.target.value;
            if (/[,、]$/u.test(v)) add(v);
            else setText(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing && text.trim()) {
              e.preventDefault();
              add(text);
            } else if (e.key === "Backspace" && !text && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => text.trim() && add(text)}
          placeholder={value.length ? "" : t("tags.placeholder")}
          className="placeholder:text-muted-foreground min-w-24 flex-1 bg-transparent py-0.5 text-sm outline-none"
          aria-describedby={listId}
          data-testid="tag-input"
        />
      </div>
      {candidates.length > 0 && (
        <div id={listId} className="flex flex-wrap gap-1" aria-label={t("tags.suggestions")}>
          {candidates.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="text-muted-foreground hover:bg-accent hover:text-accent-foreground inline-flex items-center gap-0.5 rounded border border-dashed px-1.5 py-0.5 text-xs"
            >
              <Plus className="size-3" />
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
